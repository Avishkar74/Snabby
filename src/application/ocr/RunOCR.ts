import type { OCRService } from '../interfaces/services/OCRService.ts';
import type { OCRRepository } from '../interfaces/repositories/OCRRepository.ts';
import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { Page } from '../../domain/page/Page.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import { OCRResult } from '../../domain/ocr/OCRResult.ts';
import { ProcessingStatus } from '../../domain/page/page.types.ts';
import { OCRStatus } from '../../domain/ocr/ocr.types.ts';

export interface RunOCRInput {
  page?: Page;
  capture?: any;
  image: ImageAsset;
}

export class RunOCR {
  private readonly ocrService: OCRService;
  private readonly ocrRepository: OCRRepository;
  private readonly pageRepository?: PageRepository;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inFlightJobs = new Map<string, Promise<OCRResult>>();

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
    const targetPage = (input.page || input.capture) as Page;
    if (!targetPage) {
      throw new Error('[RunOCR] Either page or capture must be provided in input');
    }
    const jobKey = `${targetPage.id}:${input.image.id}`;
    const existingJob = this.inFlightJobs.get(jobKey);
    if (existingJob) {
      return existingJob;
    }

    const cleanup = () => {
      this.inFlightJobs.delete(jobKey);
    };

    const jobPromise = new Promise<OCRResult>((resolve, reject) => {
      this.queue = this.queue
        .then(async () => {
          try {
            const result = await this.executeInternal(input);
            resolve(result);
          } catch (err) {
            reject(err);
          } finally {
            cleanup();
          }
        })
        .catch(() => {
          cleanup();
        });
    });

    this.inFlightJobs.set(jobKey, jobPromise);
    return jobPromise;
  }

  private async executeInternal(input: RunOCRInput): Promise<OCRResult> {
    let currentPage = (input.page || input.capture) as Page;
    const processedImageId = input.image.id;

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

      // Freshness check at persistence time:
      // Re-read page from pageRepository to verify whether the page was updated while OCR was in flight.
      if (this.pageRepository) {
        const freshPage = await this.pageRepository.findById(currentPage.id);
        if (freshPage) {
          const freshEffectiveId =
            freshPage.effectiveRenderedImageId ?? (freshPage as any).renderedImageId ?? freshPage.imageId;
          if (freshEffectiveId && freshEffectiveId !== processedImageId) {
            console.warn(
              `[RunOCR] Discarding outdated OCR result for page ${currentPage.id}: image ${processedImageId} superseded by ${freshEffectiveId}`
            );
            // Return an unpersisted result tagged with the processedImageId so callers know it finished for that image,
            // but do NOT overwrite OCRRepository or transition Page.status to COMPLETED.
            return new OCRResult({
              captureId: currentPage.id,
              status: OCRStatus.COMPLETED,
              fullText: serviceResult.fullText,
              words: serviceResult.words,
              imageWidth: serviceResult.imageWidth,
              imageHeight: serviceResult.imageHeight,
              errorDetails: serviceResult.errorDetails,
              processedImageId,
            });
          }
        }
      }

      // 3. Map and save OCRResult in OCRRepository
      const ocrResult = new OCRResult({
        captureId: currentPage.id,
        status: serviceResult.status,
        fullText: serviceResult.fullText,
        words: serviceResult.words,
        imageWidth: serviceResult.imageWidth,
        imageHeight: serviceResult.imageHeight,
        errorDetails: serviceResult.errorDetails,
        processedImageId,
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

      // Re-read page to check if it was superseded before marking FAILED
      if (this.pageRepository) {
        try {
          const freshPage = await this.pageRepository.findById(currentPage.id);
          const freshEffectiveId =
            freshPage?.effectiveRenderedImageId ?? (freshPage as any)?.renderedImageId ?? freshPage?.imageId;
          if (freshEffectiveId && freshEffectiveId !== processedImageId) {
            console.warn(`[RunOCR] Discarding failed OCR for superseded page ${currentPage.id}`);
            throw err;
          }
        } catch {
          // ignore
        }
      }

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
          captureId: currentPage.id,
          status: OCRStatus.FAILED,
          fullText: '',
          words: [],
          imageWidth: input.image.width,
          imageHeight: input.image.height,
          errorDetails: errorMsg,
          processedImageId,
        });
        await this.ocrRepository.save(failedOcrResult);
      } catch (e) {
        console.warn('[RunOCR] Failed to save fallback failed OCRResult:', e);
      }

      throw err;
    }
  }
}
