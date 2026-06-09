import { Component, EventEmitter, Input, OnDestroy, Output, inject, ChangeDetectorRef, SimpleChanges, OnChanges, ViewChild, ElementRef, NgZone } from '@angular/core';

@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  imports: [],
  templateUrl: './qr-scanner.html',
  styleUrl: './qr-scanner.css'
})
export class QrScannerComponent implements OnChanges, OnDestroy {
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;

  @Input() enabled = false;
  @Input() hint = 'Apunta la cámara al código QR';
  @Output() scanSuccess = new EventEmitter<string>();

  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  private stream: MediaStream | null = null;
  private animationId: number | null = null;
  private detector: any = null;
  private jsQR: any = null;

  cameras: MediaDeviceInfo[] = [];
  currentCameraIndex = 0;
  hasMultipleCameras = false;
  torchSupported = false;
  torchOn = false;

  private lastResult = '';
  private lastResultTime = 0;

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['enabled']) {
      if (this.enabled) {
        await this.start();
      } else {
        this.stop();
      }
    }
  }

  async start() {
    try {
      // Cargar jsQR como fallback
      if (!this.jsQR) {
        const mod = await import('jsqr');
        this.jsQR = mod.default;
      }

      // Inicializar BarcodeDetector nativo si está disponible
      if ('BarcodeDetector' in window) {
        this.detector = new (window as any).BarcodeDetector({
          formats: ['qr_code']
        });
      }

      // Obtener cámaras disponibles
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameras = devices.filter(d => d.kind === 'videoinput');
      this.hasMultipleCameras = this.cameras.length > 1;

      // Preferir cámara trasera
      const backIdx = this.cameras.findIndex(c =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment') ||
        c.label.toLowerCase().includes('trasera')
      );
      this.currentCameraIndex = backIdx >= 0 ? backIdx : this.cameras.length - 1;

      await this.startCamera();
    } catch (e) {
      console.error('Error iniciando escáner:', e);
    }
  }

  async startCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    const deviceId = this.cameras[this.currentCameraIndex]?.deviceId;

    // Constraints optimizadas para QR
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
        // @ts-ignore
        focusMode: { ideal: 'continuous' },
        // @ts-ignore
        exposureMode: { ideal: 'continuous' },
        // @ts-ignore
        whiteBalanceMode: { ideal: 'continuous' }
      }
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = this.videoEl.nativeElement;
    video.srcObject = this.stream;
    await video.play();

    // Verificar soporte de linterna
    const track = this.stream.getVideoTracks()[0];
    const caps = track.getCapabilities() as any;
    this.torchSupported = !!caps?.torch;
    this.cdr.detectChanges();

    this.scanLoop();
  }

  scanLoop() {
    const video = this.videoEl?.nativeElement;
    const canvas = this.canvasEl?.nativeElement;
    if (!video || !canvas || video.readyState < 2) {
      this.animationId = requestAnimationFrame(() => this.scanLoop());
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    if (this.detector) {
      // Usar BarcodeDetector nativo (más rápido)
      this.detector.detect(video).then((results: any[]) => {
        if (results.length > 0) {
          this.emitResult(results[0].rawValue);
        }
      }).catch(() => { });
    } else {
      // Fallback a jsQR
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = this.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });
      if (result) this.emitResult(result.data);
    }

    this.animationId = requestAnimationFrame(() => this.scanLoop());
  }

  emitResult(value: string) {
    const now = Date.now();
    if (value === this.lastResult && now - this.lastResultTime < 2000) return;
    this.lastResult = value;
    this.lastResultTime = now;
    this.zone.run(() => this.scanSuccess.emit(value));
  }

  async switchCamera() {
    this.currentCameraIndex = (this.currentCameraIndex + 1) % this.cameras.length;
    await this.startCamera();
  }

  async toggleTorch() {
    if (!this.stream || !this.torchSupported) return;
    this.torchOn = !this.torchOn;
    const track = this.stream.getVideoTracks()[0];
    await (track as any).applyConstraints({ advanced: [{ torch: this.torchOn }] });
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.torchOn = false;
  }

  ngOnDestroy() {
    this.stop();
  }
}