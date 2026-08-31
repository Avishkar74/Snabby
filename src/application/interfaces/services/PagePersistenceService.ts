import type { Page } from '../../../domain/page/Page.ts';
import type { ImageAsset } from '../../../domain/image/image.types.ts';

export interface PagePersistenceService {
  save(page: Page, image: ImageAsset): Promise<void>;
}
