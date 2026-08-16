import type { OCRResult } from '../../../domain/ocr/OCRResult.ts';
import type { CaptureId } from '../../../domain/common/ids.ts';

export interface OCRRepository {
  save(ocrResult: OCRResult): Promise<void>;
  findByCaptureId(captureId: CaptureId): Promise<OCRResult | null>;
  delete(captureId: CaptureId): Promise<void>;
}
