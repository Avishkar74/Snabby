import type { CaptureAdapter } from '../../../application/interfaces/adapters/CaptureAdapter.ts';
import type { CaptureSource } from '../../../domain/capture/capture.types.ts';
import { CaptureError } from '../../../application/capture/errors.ts';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ChromeCaptureAdapter
 *
 * Handles two capture modes:
 * - FULL_SCREEN: calls captureVisibleTab and returns the Blob directly.
 * - CROP_REGION: Must be called with a cropRect parameter. Calls captureVisibleTab,
 *   then crops the resulting image to the given rectangle using OffscreenCanvas.
 *
 * NOTE: The crop rect is expected to already be in screenshot-pixel space
 * (CSS pixels × devicePixelRatio), which is what the CropOverlay returns.
 */
export class ChromeCaptureAdapter implements CaptureAdapter {
  private pendingCropRect: CropRect | null = null;

  public setCropRect(rect: CropRect): void {
    this.pendingCropRect = rect;
  }

  public async capture(source: CaptureSource): Promise<Blob> {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
      if (!dataUrl) {
        throw new Error('Chrome screenshot API returned empty result.');
      }

      const screenshotBlob = this.dataUrlToBlob(dataUrl);

      if (source === 'CROP_REGION') {
        const rect = this.pendingCropRect;
        if (!rect) {
          throw new CaptureError('Crop region capture requires a rect. Call setCropRect() first.');
        }
        this.pendingCropRect = null; // Clear after use
        return this.cropBlob(screenshotBlob, rect);
      }

      return screenshotBlob;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new CaptureError(`Chrome capture failed: ${message}`);
    }
  }

  /**
   * Crops the image blob to the given rectangle using OffscreenCanvas.
   * The rect must be in screenshot-pixel space (already scaled by devicePixelRatio).
   */
  private async cropBlob(blob: Blob, rect: CropRect): Promise<Blob> {
    console.log('[ChromeCaptureAdapter] Cropping screenshot to rect:', rect);

    const imageBitmap = await createImageBitmap(blob);
    const { x, y, width, height } = rect;

    // Clamp to image bounds to prevent out-of-bounds crop
    const clampedX = Math.max(0, Math.min(x, imageBitmap.width - 1));
    const clampedY = Math.max(0, Math.min(y, imageBitmap.height - 1));
    const clampedW = Math.max(1, Math.min(width, imageBitmap.width - clampedX));
    const clampedH = Math.max(1, Math.min(height, imageBitmap.height - clampedY));

    console.log(
      `[ChromeCaptureAdapter] Image: ${imageBitmap.width}x${imageBitmap.height}, ` +
      `Crop: ${clampedX},${clampedY} ${clampedW}x${clampedH}`
    );

    // OffscreenCanvas is available in Service Worker context (MV3)
    const offscreen = new OffscreenCanvas(clampedW, clampedH);
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      imageBitmap.close();
      throw new CaptureError('Failed to create 2D context for crop operation.');
    }

    ctx.drawImage(imageBitmap, clampedX, clampedY, clampedW, clampedH, 0, 0, clampedW, clampedH);
    imageBitmap.close();

    const croppedBlob = await offscreen.convertToBlob({ type: 'image/png' });
    console.log(`[ChromeCaptureAdapter] Cropped blob size: ${croppedBlob.size} bytes`);
    return croppedBlob;
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }
}

export const chromeCaptureAdapter = new ChromeCaptureAdapter();
