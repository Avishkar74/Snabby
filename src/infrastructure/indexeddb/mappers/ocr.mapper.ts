import { OCRResult } from '../../../domain/ocr/OCRResult.ts';
import { OCRStatus } from '../../../domain/ocr/ocr.types.ts';
import type { OCRWord } from '../../../domain/ocr/ocr.types.ts';
import type { CaptureId, ImageId } from '../../../domain/common/ids.ts';

export interface OCRResultRecord {
  captureId: string;
  status: string;
  fullText: string;
  words: OCRWord[];
  imageWidth: number;
  imageHeight: number;
  errorDetails?: string;
  processedImageId?: string;
}

export class OCRMapper {
  public static toRecord(result: OCRResult): OCRResultRecord {
    return {
      captureId: result.captureId,
      status: result.status,
      fullText: result.fullText,
      words: result.words,
      imageWidth: result.imageWidth,
      imageHeight: result.imageHeight,
      errorDetails: result.errorDetails,
      processedImageId: result.processedImageId,
    };
  }

  public static toDomain(record: OCRResultRecord): OCRResult {
    return new OCRResult({
      captureId: record.captureId as CaptureId,
      status: record.status as OCRStatus,
      fullText: record.fullText,
      words: record.words,
      imageWidth: record.imageWidth,
      imageHeight: record.imageHeight,
      errorDetails: record.errorDetails,
      processedImageId: record.processedImageId as ImageId | undefined,
    });
  }
}
