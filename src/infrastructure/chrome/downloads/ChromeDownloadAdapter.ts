import type { DownloadService } from '../../../application/interfaces/services/DownloadService.ts';
import { DownloadFailedError } from '../../../application/pdf/errors.ts';

export class ChromeDownloadAdapter implements DownloadService {
  public async download(pdfBlob: Blob, filename: string): Promise<void> {
    try {
      // 1. Read Blob as ArrayBuffer
      const arrayBuffer = await pdfBlob.arrayBuffer();

      // 2. Convert ArrayBuffer to Base64 string in chunks to prevent call stack size exceeded errors
      const bytes = new Uint8Array(arrayBuffer);
      let binaryString = '';
      const len = bytes.byteLength;
      const chunkSize = 8192;
      for (let i = 0; i < len; i += chunkSize) {
        const slice = bytes.subarray(i, Math.min(i + chunkSize, len));
        binaryString += String.fromCharCode.apply(null, slice as any);
      }
      const base64 = btoa(binaryString);

      // 3. Formulate Base64 data URL
      const dataUrl = `data:application/pdf;base64,${base64}`;

      // 4. Trigger Chrome downloads API
      return new Promise<void>((resolve, reject) => {
        chrome.downloads.download(
          {
            url: dataUrl,
            filename: filename,
            saveAs: true,
          },
          (downloadId) => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new DownloadFailedError(`Chrome downloads.download failed: ${err.message}`));
            } else if (downloadId === undefined) {
              reject(new DownloadFailedError('Chrome downloads.download returned undefined ID'));
            } else {
              resolve();
            }
          }
        );
      });
    } catch (err: any) {
      if (err instanceof DownloadFailedError) {
        throw err;
      }
      throw new DownloadFailedError(err.message || String(err), err);
    }
  }
}
