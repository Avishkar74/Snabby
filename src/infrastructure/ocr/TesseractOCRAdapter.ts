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
    try {
      console.log(`[TesseractOCRAdapter] Processing image ${image.id} for OCR...`);
      const dataUrl = await this.blobToDataUrl(image.data);

      const response = await this.messageBus.request<any>({
        target: 'offscreen',
        action: 'ocr',
        dataUrl
      } as any);

      if (!response || response.success === false) {
        throw new Error(response?.error || 'OCR processing failed');
      }

      // Map raw words to Snabby domain OCRWord[]
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

      // Return constructed OCRResult domain entity
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
      throw new Error(`OCR service failure: ${message}`);
    }
  }

  private async blobToDataUrl(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return `data:${blob.type || 'image/png'};base64,${base64}`;
  }
}
