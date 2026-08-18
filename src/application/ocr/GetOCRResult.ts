import type { OCRRepository } from '../interfaces/repositories/OCRRepository.ts';
import type { OCRResult } from '../../domain/ocr/OCRResult.ts';
import type { CaptureId } from '../../domain/common/ids.ts';

export interface GetOCRResultInput {
  captureId: CaptureId;
}

export class GetOCRResult {
  private readonly ocrRepository: OCRRepository;

  constructor(ocrRepository: OCRRepository) {
    this.ocrRepository = ocrRepository;
  }

  public async execute(input: GetOCRResultInput): Promise<OCRResult | null> {
    return this.ocrRepository.findByCaptureId(input.captureId);
  }
}
