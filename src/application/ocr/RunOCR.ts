import type { OCRService } from '../interfaces/services/OCRService.ts';
import type { OCRRepository } from '../interfaces/repositories/OCRRepository.ts';
import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { Page } from '../../domain/page/Page.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import { OCRResult } from '../../domain/ocr/OCRResult.ts';
import { ProcessingStatus } from '../../domain/page/page.types.ts';
import { OCRStatus } from '../../domain/ocr/ocr.types.ts';

export interface RunOCRInput {
  page: Page;
  image: ImageAsset;
}

export class RunOCR {
  private readonly ocrService: OCRService;
  private readonly ocrRepository: OCRRepository;
  private readonly pageRepository?: PageRepository;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    ocrService: OCRService,
    ocrRepository: OCRRepository,
    pageRepository?: PageRepository
  ) {
    this.ocrService = ocrService;
    this.ocrRepository = ocrRepository;
    this.pageRepository = pageRepository;
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
    let currentPage = input.page;

    // 1. Transition Page.status to PROCESSING
    try {
      currentPage = currentPage.updateStatus(ProcessingStatus.PROCESSING);
      if (this.pageRepository) {
        await this.pageRepository.save(currentPage);
      }
    } catch (e) {
      console.warn('[RunOCR] Failed to update page status to PROCESSING:', e);
    }

    try {
      // 2. Perform OCR text recognition
      const serviceResult = await this.ocrService.process(input.image);

      // 3. Map and save OCRResult in OCRRepository
      // Note: OCRResult.captureId is typed as CaptureId, which is an alias for PageId.
      // Passing page.id here is fully type-safe; no cast is required.
      const ocrResult = new OCRResult({
        captureId: input.page.id,
        status: serviceResult.status,
        fullText: serviceResult.fullText,
        words: serviceResult.words,
        imageWidth: serviceResult.imageWidth,
        imageHeight: serviceResult.imageHeight,
        errorDetails: serviceResult.errorDetails
      });

      await this.ocrRepository.save(ocrResult);

      // 4. Transition Page.status to COMPLETED or FAILED based on OCR result
      const finalStatus = serviceResult.status === OCRStatus.COMPLETED
        ? ProcessingStatus.COMPLETED
        : ProcessingStatus.FAILED;

      currentPage = currentPage.updateStatus(finalStatus, serviceResult.errorDetails);
      if (this.pageRepository) {
        await this.pageRepository.save(currentPage);
      }

      return ocrResult;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // 5. On failure: transition Page.status to FAILED
      try {
        currentPage = currentPage.updateStatus(ProcessingStatus.FAILED, errorMsg);
        if (this.pageRepository) {
          await this.pageRepository.save(currentPage);
        }
      } catch (e) {
        console.warn('[RunOCR] Failed to update page status to FAILED:', e);
      }

      // 6. Save a failed OCRResult in OCRRepository for consistency
      try {
        const failedOcrResult = new OCRResult({
          captureId: input.page.id,
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
