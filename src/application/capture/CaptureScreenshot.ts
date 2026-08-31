import type { CaptureAdapter } from '../interfaces/adapters/CaptureAdapter.ts';
import type { ImageProcessor } from '../interfaces/services/ImageProcessor.ts';
import type { CapturePersistenceService } from '../interfaces/services/CapturePersistenceService.ts';
import type { CaptureRepository } from '../interfaces/repositories/CaptureRepository.ts';
import type { CaptureSource } from '../../domain/capture/capture.types.ts';
import type { SessionId } from '../../domain/common/ids.ts';
import type { Capture } from '../../domain/capture/Capture.ts';
import type { RunOCR } from '../ocr/RunOCR.ts';
import { CreateScreenshotPage } from '../page/CreateScreenshotPage.ts';
import type { PagePersistenceService } from '../interfaces/services/PagePersistenceService.ts';
import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import type { Page } from '../../domain/page/Page.ts';

export interface CaptureScreenshotInput {
  sessionId: SessionId;
  captureMode: CaptureSource;
}

export interface CaptureScreenshotResult {
  capture: Capture;
}

export class CaptureScreenshot {
  private readonly useCase: CreateScreenshotPage;

  constructor(
    captureAdapter: CaptureAdapter,
    imageProcessor: ImageProcessor,
    capturePersistenceService: CapturePersistenceService,
    captureRepository: CaptureRepository,
    runOCR?: RunOCR
  ) {
    const pagePersistenceService: PagePersistenceService = {
      save: (page: Page, image: ImageAsset) => capturePersistenceService.save(page as Capture, image),
    };
    const pageRepository: PageRepository = {
      save: (page: Page) => captureRepository.save(page as Capture),
      findById: (id) => captureRepository.findById(id),
      findBySessionId: (sessionId) => captureRepository.findBySessionId(sessionId),
      delete: (id) => captureRepository.delete(id),
    };

    this.useCase = new CreateScreenshotPage(
      captureAdapter,
      imageProcessor,
      pagePersistenceService,
      pageRepository,
      runOCR
    );
  }

  public async execute(input: CaptureScreenshotInput): Promise<CaptureScreenshotResult> {
    const result = await this.useCase.execute({
      sessionId: input.sessionId,
      captureMode: input.captureMode,
    });

    return {
      capture: result.page as Capture,
    };
  }
}
