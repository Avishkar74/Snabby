import type { OCRService } from '../interfaces/services/OCRService.ts';
import type { OCRRepository } from '../interfaces/repositories/OCRRepository.ts';
import type { CaptureRepository } from '../interfaces/repositories/CaptureRepository.ts';
import type { Capture } from '../../domain/capture/Capture.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import { OCRResult } from '../../domain/ocr/OCRResult.ts';
import { ProcessingStatus } from '../../domain/capture/capture.types.ts';
import { OCRStatus } from '../../domain/ocr/ocr.types.ts';

export interface RunOCRInput {
  capture: Capture;
  image: ImageAsset;
}

export class RunOCR {
  private readonly ocrService: OCRService;
  private readonly ocrRepository: OCRRepository;
  private readonly captureRepository?: CaptureRepository;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    ocrService: OCRService,
    ocrRepository: OCRRepository,
    captureRepository?: CaptureRepository
  ) {
    this.ocrService = ocrService;
    this.ocrRepository = ocrRepository;
    this.captureRepository = captureRepository;
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
    let currentCapture = input.capture;

    // 1. Transition Capture.status to PROCESSING
    try {
      currentCapture = currentCapture.updateStatus(ProcessingStatus.PROCESSING);
      if (this.captureRepository) {
        await this.captureRepository.save(currentCapture);
      }
    } catch (e) {
      console.warn('[RunOCR] Failed to update capture status to PROCESSING:', e);
    }

    try {
      // 2. Perform OCR text recognition
      const serviceResult = await this.ocrService.process(input.image);

      // 3. Map and save OCRResult in OCRRepository
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

      // 4. Transition Capture.status to COMPLETED or FAILED based on OCR result
      const finalStatus = serviceResult.status === OCRStatus.COMPLETED
        ? ProcessingStatus.COMPLETED
        : ProcessingStatus.FAILED;

      currentCapture = currentCapture.updateStatus(finalStatus, serviceResult.errorDetails);
      if (this.captureRepository) {
        await this.captureRepository.save(currentCapture);
      }

      return ocrResult;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // 5. On failure: transition Capture.status to FAILED
      try {
        currentCapture = currentCapture.updateStatus(ProcessingStatus.FAILED, errorMsg);
        if (this.captureRepository) {
          await this.captureRepository.save(currentCapture);
        }
      } catch (e) {
        console.warn('[RunOCR] Failed to update capture status to FAILED:', e);
      }

      // 6. Save a failed OCRResult in OCRRepository for consistency
      try {
        const failedOcrResult = new OCRResult({
          captureId: input.capture.id,
          status: OCRStatus.FAILED,
          fullText: '',
          words: [],
          imageWidth: input.image.width,
          imageHeight: input.image.height,
          errorDetails: errorMsg
        });
        await this.ocrRepository.save(failedOcrResult);
      } catch (e) {
        console.warn('[RunOCR] Failed to save fallback failed OCRResult:', e);
      }

      throw err;
    }
  }
}
