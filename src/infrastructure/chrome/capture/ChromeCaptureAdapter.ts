import type { CaptureAdapter } from '../../../application/interfaces/adapters/CaptureAdapter.ts';
import type { CaptureSource } from '../../../domain/capture/capture.types.ts';
import { CaptureError } from '../../../application/capture/errors.ts';

export class ChromeCaptureAdapter implements CaptureAdapter {
  public async capture(_source: CaptureSource): Promise<Blob> {
    try {
      // Use standard chrome.tabs.captureVisibleTab API. windowId is omitted
      // by passing only the options object to default to the current window.
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
      if (!dataUrl) {
        throw new Error('Chrome screenshot API returned empty result.');
      }
      return this.dataUrlToBlob(dataUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new CaptureError(`Chrome capture failed: ${message}`);
    }
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
