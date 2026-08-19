import type { OCRService } from '../../application/interfaces/services/OCRService.ts';
import type { MessageBus } from '../../application/interfaces/messaging/MessageBus.ts';
import { OCRResult } from '../../domain/ocr/OCRResult.ts';
import { OCRStatus } from '../../domain/ocr/ocr.types.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import type { OCRWord } from '../../domain/ocr/ocr.types.ts';
import type { CaptureId } from '../../domain/common/ids.ts';

export class TesseractOCRAdapter implements OCRService {
  private readonly messageBus: MessageBus;

  constructor(messageBus: MessageBus) {
    this.messageBus = messageBus;
  }

  public async process(image: ImageAsset): Promise<OCRResult> {
    const startTime = Date.now();
    try {
      console.log(`[TesseractOCRAdapter] Processing image ${image.id} (${image.data.size} bytes) for OCR...`);

      // === DIAGNOSTIC STEP 1: Convert Blob → data URL ===
      const t1 = Date.now();
      const dataUrl = await this.blobToDataUrl(image.data);
      console.log(`[TesseractOCRAdapter] blobToDataUrl completed in ${Date.now() - t1}ms. DataURL length: ${dataUrl.length}`);

      // === DIAGNOSTIC STEP 2: Send to offscreen document ===
      console.log('[TesseractOCRAdapter] Sending OCR request to offscreen document...');
      const t2 = Date.now();
      const response = await this.messageBus.request<any>({
        target: 'offscreen',
        action: 'ocr',
        dataUrl
      } as any);
      console.log(`[TesseractOCRAdapter] Offscreen response received in ${Date.now() - t2}ms:`, {
        success: response?.success,
        hasText: !!response?.text,
        wordCount: response?.words?.length ?? 0,
        error: response?.error
      });

      if (!response || response.success === false) {
        throw new Error(response?.error || 'OCR processing failed — offscreen returned error');
      }

      // === DIAGNOSTIC STEP 3: Map results ===
      const mappedWords: OCRWord[] = (response.words || []).map((w: any) => ({
        text: w.text || '',
        confidence: w.confidence || 0,
        boundingBox: {
          x: w.bbox?.x0 || 0,
          y: w.bbox?.y0 || 0,
          width: (w.bbox?.x1 || 0) - (w.bbox?.x0 || 0),
          height: (w.bbox?.y1 || 0) - (w.bbox?.y0 || 0)
        }
      }));

      console.log(
        `[TesseractOCRAdapter] OCR complete in ${Date.now() - startTime}ms. ` +
        `Words: ${mappedWords.length}, Text length: ${response.text?.length ?? 0}`
      );

      return new OCRResult({
        captureId: image.id as unknown as CaptureId,
        status: OCRStatus.COMPLETED,
        fullText: response.text || '',
        words: mappedWords,
        imageWidth: response.imageWidth || 0,
        imageHeight: response.imageHeight || 0
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[TesseractOCRAdapter] OCR FAILED after ${Date.now() - startTime}ms:`, message);
      throw new Error(`OCR service failure: ${message}`);
    }
  }

  /**
   * Converts a Blob to a base64 data URL using native browser FileReader API.
   * Eliminates JS function call stack argument limits and prevents "Maximum call stack size exceeded".
   */
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        blob.arrayBuffer().then(buffer => {
          const bytes = new Uint8Array(buffer);
          const chunk = 4096;
          let binary = '';
          for (let i = 0; i < bytes.length; i += chunk) {
            const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
            binary += String.fromCharCode.apply(null, slice as any);
          }
          resolve(`data:${blob.type || 'image/png'};base64,${btoa(binary)}`);
        }).catch(reject);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(new Error(`FileReader failed: ${err}`));
      reader.readAsDataURL(blob);
    });
  }
}
