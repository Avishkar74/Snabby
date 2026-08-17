import type { Capture } from '../../../domain/capture/Capture.ts';
import type { ImageAsset } from '../../../domain/image/image.types.ts';

export interface CapturePersistenceService {
  save(capture: Capture, image: ImageAsset): Promise<void>;
}
