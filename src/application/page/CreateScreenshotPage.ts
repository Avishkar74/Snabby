import type { CaptureAdapter } from '../interfaces/adapters/CaptureAdapter.ts';
import type { ImageProcessor } from '../interfaces/services/ImageProcessor.ts';
import type { PagePersistenceService } from '../interfaces/services/PagePersistenceService.ts';
import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { PageSource } from '../../domain/page/page.types.ts';
import type { SessionId } from '../../domain/common/ids.ts';
import { Page } from '../../domain/page/Page.ts';
import { createImageId } from '../../domain/common/ids.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import type { RunOCR } from '../ocr/RunOCR.ts';

export interface CreateScreenshotPageInput {
  sessionId: SessionId;
  captureMode: PageSource;
}

export interface CreateScreenshotPageResult {
  page: Page;
}

export class CreateScreenshotPage {
  private readonly captureAdapter: CaptureAdapter;
  private readonly imageProcessor: ImageProcessor;
  private readonly pagePersistenceService: PagePersistenceService;
  private readonly pageRepository: PageRepository;
  private readonly runOCR?: RunOCR;

  constructor(
    captureAdapter: CaptureAdapter,
    imageProcessor: ImageProcessor,
    pagePersistenceService: PagePersistenceService,
    pageRepository: PageRepository,
    runOCR?: RunOCR
  ) {
    this.captureAdapter = captureAdapter;
    this.imageProcessor = imageProcessor;
    this.pagePersistenceService = pagePersistenceService;
    this.pageRepository = pageRepository;
    this.runOCR = runOCR;
  }

  public async execute(input: CreateScreenshotPageInput): Promise<CreateScreenshotPageResult> {
    // 1. Capture screen through CaptureAdapter (handles both FULL_SCREEN and CROP_REGION)
    const imageBlob = await this.captureAdapter.capture(input.captureMode);

    // 2. Process Blob through ImageProcessor to decode & normalize
    const processedImage = await this.imageProcessor.process(imageBlob);

    // 3. Generate ImageId
    const imageId = createImageId();

    // 4. Create ImageAsset
    const imageAsset: ImageAsset = {
      id: imageId,
      data: processedImage.data,
      width: processedImage.width,
      height: processedImage.height,
      mimeType: processedImage.mimeType,
      createdAt: Date.now(),
    };

    // 5. Determine page order by appending after existing pages for the session
    const existing = await this.pageRepository.findBySessionId(input.sessionId);
    const order = existing.length;

    // 6. Create Page domain object (type = SCREENSHOT, imageId = imageId, renderedImageId = imageId, version = 1)
    const page = Page.create(input.sessionId, imageId, order, input.captureMode);

    // 7. Persist atomically
    await this.pagePersistenceService.save(page, imageAsset);

    // 8. Start OCR asynchronously (fire-and-forget)
    if (this.runOCR) {
      this.runOCR.execute({ capture: page as any, image: imageAsset }).catch((err) => {
        console.warn('[CreateScreenshotPage] Asynchronous OCR execution failed:', err);
      });
    }

    return {
      page,
    };
  }
}
