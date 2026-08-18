import type { CaptureAdapter } from '../interfaces/adapters/CaptureAdapter.ts';
import type { ImageProcessor } from '../interfaces/services/ImageProcessor.ts';
import type { CapturePersistenceService } from '../interfaces/services/CapturePersistenceService.ts';
import type { CaptureRepository } from '../interfaces/repositories/CaptureRepository.ts';
import type { CaptureSource } from '../../domain/capture/capture.types.ts';
import type { SessionId } from '../../domain/common/ids.ts';
import { Capture } from '../../domain/capture/Capture.ts';
import { createImageId } from '../../domain/common/ids.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import { ValidationError } from '../../domain/common/errors.ts';
import type { RunOCR } from '../ocr/RunOCR.ts';

export interface CaptureScreenshotInput {
  sessionId: SessionId;
  captureMode: CaptureSource;
}

export interface CaptureScreenshotResult {
  capture: Capture;
}

export class CaptureScreenshot {
  private readonly captureAdapter: CaptureAdapter;
  private readonly imageProcessor: ImageProcessor;
  private readonly capturePersistenceService: CapturePersistenceService;
  private readonly captureRepository: CaptureRepository;
  private readonly runOCR?: RunOCR;

  constructor(
    captureAdapter: CaptureAdapter,
    imageProcessor: ImageProcessor,
    capturePersistenceService: CapturePersistenceService,
    captureRepository: CaptureRepository,
    runOCR?: RunOCR
  ) {
    this.captureAdapter = captureAdapter;
    this.imageProcessor = imageProcessor;
    this.capturePersistenceService = capturePersistenceService;
    this.captureRepository = captureRepository;
    this.runOCR = runOCR;
  }

  public async execute(input: CaptureScreenshotInput): Promise<CaptureScreenshotResult> {
    if (input.captureMode === 'CROP_REGION') {
      throw new ValidationError('Crop region capture is not supported in this version.');
    }

    // 1. Capture screen through CaptureAdapter
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
      createdAt: Date.now()
    };

    // 5. Determine capture order by appending after existing captures for the session
    const existing = await this.captureRepository.findBySessionId(input.sessionId);
    const order = existing.length;

    // 6. Create Capture domain object (CaptureId is generated inside Capture.create)
    const capture = Capture.create(input.sessionId, imageId, order, input.captureMode);

    // 7. Persist atomically
    await this.capturePersistenceService.save(capture, imageAsset);

    // 8. Start OCR asynchronously (fire-and-forget)
    if (this.runOCR) {
      this.runOCR.execute({ capture, image: imageAsset }).catch((err) => {
        console.warn('[CaptureScreenshot] Asynchronous OCR execution failed:', err);
      });
    }

    return {
      capture
    };
  }
}
