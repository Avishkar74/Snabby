import type { OCRService } from '../interfaces/services/OCRService.ts';
import type { OCRRepository } from '../interfaces/repositories/OCRRepository.ts';
import type { Capture } from '../../domain/capture/Capture.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import { OCRResult } from '../../domain/ocr/OCRResult.ts';

export interface RunOCRInput {
  capture: Capture;
  image: ImageAsset;
}

export class RunOCR {
  private readonly ocrService: OCRService;
  private readonly ocrRepository: OCRRepository;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ocrService: OCRService, ocrRepository: OCRRepository) {
    this.ocrService = ocrService;
    this.ocrRepository = ocrRepository;
  }

  public async execute(input: RunOCRInput): Promise<OCRResult> {
    return new Promise<OCRResult>((resolve, reject) => {
      this.queue = this.queue
        .then(async () => {
          try {
            const result = await this.executeInternal(input);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        })
        .catch(() => {}); // Ensure queue progression on failure
    });
  }

  private async executeInternal(input: RunOCRInput): Promise<OCRResult> {
    const serviceResult = await this.ocrService.process(input.image);
    
    // Map service result (which has image ID) to capture ID domain model
    const ocrResult = new OCRResult({
      captureId: input.capture.id,
      status: serviceResult.status,
      fullText: serviceResult.fullText,
      words: serviceResult.words,
      imageWidth: serviceResult.imageWidth,
      imageHeight: serviceResult.imageHeight,
      errorDetails: serviceResult.errorDetails
    });

    await this.ocrRepository.save(ocrResult);
    return ocrResult;
  }
}
