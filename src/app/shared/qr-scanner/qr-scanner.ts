import {
  Component, EventEmitter, Input, Output,
  OnDestroy, OnChanges, SimpleChanges,
  ElementRef, ViewChild, inject, ChangeDetectorRef, NgZone
} from '@angular/core';
import { RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';

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
  @Input() hint = 'Apunta la cámara al código';
  // ← nuevo: indica si debe leer DataMatrix además de QR
  @Input() dataMatrix = false;
  @Output() scanSuccess = new EventEmitter<string>();

  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  private stream: MediaStream | null = null;
  private animationId: number | null = null;
  private nativeDetector: any = null;
  private zxingReader: any = null;

  cameras: MediaDeviceInfo[] = [];
  currentCameraIndex = 0;
  hasMultipleCameras = false;
  torchSupported = false;
  torchOn = false;

  private lastResult = '';
  private lastResultTime = 0;

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['enabled']) {
      if (this.enabled) await this.start();
      else this.stop();
    }
  }

  async start() {
    try {
      // Inicializar detector nativo si está disponible
      if ('BarcodeDetector' in window) {
        const formats = ['qr_code'];
        if (this.dataMatrix) formats.push('data_matrix');
        this.nativeDetector = new (window as any).BarcodeDetector({ formats });
      } else {
        // Fallback: usar @zxing/library para DataMatrix y QR
        await this.initZxing();
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameras = devices.filter(d => d.kind === 'videoinput');
      this.hasMultipleCameras = this.cameras.length > 1;

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

  async initZxing() {
    try {
      const zxing = await import('@zxing/library');
      const hints = new Map();
      const formats = [zxing.BarcodeFormat.QR_CODE];
      if (this.dataMatrix) formats.push(zxing.BarcodeFormat.DATA_MATRIX);
      hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(zxing.DecodeHintType.TRY_HARDER, true);
      this.zxingReader = new zxing.MultiFormatReader();
      this.zxingReader.setHints(hints);
    } catch (e) {
      console.error('Error cargando @zxing/library:', e);
    }
  }

  async startCamera() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.animationId) cancelAnimationFrame(this.animationId);

    const deviceId = this.cameras[this.currentCameraIndex]?.deviceId;

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      }
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = this.videoEl.nativeElement;
    video.srcObject = this.stream;
    await video.play();

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

    if (this.nativeDetector) {
      // BarcodeDetector nativo — soporta QR y DataMatrix
      this.nativeDetector.detect(video).then((results: any[]) => {
        if (results.length > 0) this.emitResult(results[0].rawValue);
      }).catch(() => { });
    } else if (this.zxingReader) {
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Convertir a escala de grises para zxing
        const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
        for (let i = 0; i < canvas.width * canvas.height; i++) {
          const r = imageData.data[i * 4];
          const g = imageData.data[i * 4 + 1];
          const b = imageData.data[i * 4 + 2];
          grayData[i] = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
        }

        const luminance = new RGBLuminanceSource(grayData, canvas.width, canvas.height);
        const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
        const result = this.zxingReader.decode(bitmap);
        if (result) this.emitResult(result.getText());
      } catch (_) { }
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
    if (this.animationId) { cancelAnimationFrame(this.animationId); this.animationId = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.torchOn = false;
  }

  ngOnDestroy() { this.stop(); }
}