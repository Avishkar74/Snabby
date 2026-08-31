import type { PagePersistenceService } from './PagePersistenceService.ts';
import type { Capture } from '../../../domain/capture/Capture.ts';
import type { ImageAsset } from '../../../domain/image/image.types.ts';

export interface CapturePersistenceService extends PagePersistenceService {
  save(capture: Capture, image: ImageAsset): Promise<void>;
}
