import type { OCRResult } from '../../../domain/ocr/OCRResult.ts';
import type { ImageAsset } from '../../../domain/image/image.types.ts';

export interface OCRService {
  process(image: ImageAsset): Promise<OCRResult>;
}
