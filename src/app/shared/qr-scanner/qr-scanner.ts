import { Component, EventEmitter, Input, OnDestroy, Output, inject, ChangeDetectorRef } from '@angular/core';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';

@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  imports: [ZXingScannerModule],
  templateUrl: './qr-scanner.html',
  styleUrl: './qr-scanner.css'
})
export class QrScannerComponent implements OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  @Input() enabled = false;
  @Input() hint = 'Apunta la cámara al código QR';
  @Output() scanSuccess = new EventEmitter<string>();
  @Output() scanError = new EventEmitter<any>();

  formats = [BarcodeFormat.QR_CODE];
  availableCameras: MediaDeviceInfo[] = [];
  currentCamera: MediaDeviceInfo | undefined = undefined;
  hasMultipleCameras = false;

  private lastResult = '';
  private lastResultTime = 0;

  onCamerasFound(cameras: MediaDeviceInfo[]) {
    this.availableCameras = cameras;
    this.hasMultipleCameras = cameras.length > 1;

    // Preferir cámara trasera
    const back = cameras.find(c =>
      c.label.toLowerCase().includes('back') ||
      c.label.toLowerCase().includes('rear') ||
      c.label.toLowerCase().includes('trasera') ||
      c.label.toLowerCase().includes('environment')
    );
    this.currentCamera = back || cameras[cameras.length - 1];
    this.cdr.detectChanges();
  }

  onScanSuccess(result: string) {
    const now = Date.now();
    // Evitar duplicados en menos de 2 segundos
    if (result === this.lastResult && now - this.lastResultTime < 2000) return;
    this.lastResult = result;
    this.lastResultTime = now;
    this.scanSuccess.emit(result);
  }

  onScanError(error: any) {
    // Ignorar errores de "no QR found" que son normales
    if (error?.name === 'NotFoundException') return;
    this.scanError.emit(error);
  }

  switchCamera() {
    if (this.availableCameras.length < 2) return;
    const idx = this.availableCameras.findIndex(c => c.deviceId === this.currentCamera?.deviceId);
    this.currentCamera = this.availableCameras[(idx + 1) % this.availableCameras.length];
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    this.lastResult = '';
  }
}