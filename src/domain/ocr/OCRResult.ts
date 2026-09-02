import type { CaptureId, ImageId } from '../common/ids.ts';
import { ValidationError } from '../common/errors.ts';
import { OCRStatus } from './ocr.types.ts';
import type { OCRWord } from './ocr.types.ts';

export interface IOCRResultProps {
  captureId: CaptureId;
  status: OCRStatus;
  fullText: string;
  words: OCRWord[];
  imageWidth: number;
  imageHeight: number;
  errorDetails?: string;
  processedImageId?: ImageId;
}

export class OCRResult implements IOCRResultProps {
  public readonly captureId: CaptureId;
  public readonly status: OCRStatus;
  public readonly fullText: string;
  public readonly words: OCRWord[];
  public readonly imageWidth: number;
  public readonly imageHeight: number;
  public readonly errorDetails?: string;
  public readonly processedImageId?: ImageId;

  constructor(props: IOCRResultProps) {
    this.captureId = props.captureId;
    this.status = props.status;
    this.fullText = props.fullText;
    this.words = props.words;
    this.imageWidth = props.imageWidth;
    this.imageHeight = props.imageHeight;
    this.errorDetails = props.errorDetails;
    this.processedImageId = props.processedImageId;
    this.validate();
  }

  private validate(): void {
    if (!this.captureId) {
      throw new ValidationError('Capture ID is required for OCRResult');
    }
    if (!Object.values(OCRStatus).includes(this.status)) {
      throw new ValidationError(`Invalid OCR status: ${this.status}`);
    }
    if (this.imageWidth <= 0 || this.imageHeight <= 0) {
      throw new ValidationError('Image dimensions must be positive numbers');
    }
    if (typeof this.fullText !== 'string') {
      throw new ValidationError('fullText must be a string');
    }
    if (!Array.isArray(this.words)) {
      throw new ValidationError('words must be an array');
    }
  }

  public static createPending(captureId: CaptureId, width: number, height: number): OCRResult {
    return new OCRResult({
      captureId,
      status: OCRStatus.NOT_STARTED,
      fullText: '',
      words: [],
      imageWidth: width,
      imageHeight: height,
    });
  }

  public updateResult(fullText: string, words: OCRWord[]): OCRResult {
    return new OCRResult({
      captureId: this.captureId,
      status: OCRStatus.COMPLETED,
      fullText,
      words,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
    });
  }

  public updateFailed(errorDetails: string): OCRResult {
    return new OCRResult({
      captureId: this.captureId,
      status: OCRStatus.FAILED,
      fullText: '',
      words: [],
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      errorDetails,
    });
  }
}
