import type { CaptureAdapter } from '../interfaces/adapters/CaptureAdapter.ts';
import type { CaptureSource } from '../../domain/capture/capture.types.ts';
import type { SessionId } from '../../domain/common/ids.ts';
import { ValidationError } from '../../domain/common/errors.ts';

export interface CaptureScreenshotInput {
  sessionId: SessionId;
  captureMode: CaptureSource;
}

export interface AcquiredScreenshot {
  sessionId: SessionId;
  captureMode: CaptureSource;
  imageBlob: Blob;
  capturedAt: number;
}

export class CaptureScreenshot {
  private readonly captureAdapter: CaptureAdapter;

  constructor(captureAdapter: CaptureAdapter) {
    this.captureAdapter = captureAdapter;
  }

  public async execute(input: CaptureScreenshotInput): Promise<AcquiredScreenshot> {
    if (input.captureMode === 'CROP_REGION') {
      throw new ValidationError('Crop region capture is not supported in this version.');
    }

    const blob = await this.captureAdapter.capture(input.captureMode);
    return {
      sessionId: input.sessionId,
      captureMode: input.captureMode,
      imageBlob: blob,
      capturedAt: Date.now()
    };
  }
}
