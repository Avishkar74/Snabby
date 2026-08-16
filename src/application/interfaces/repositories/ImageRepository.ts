import type { ImageAsset } from '../../../domain/image/image.types.ts';
import type { ImageId } from '../../../domain/common/ids.ts';

export interface ImageRepository {
  save(image: ImageAsset): Promise<void>;
  findById(id: ImageId): Promise<ImageAsset | null>;
  delete(id: ImageId): Promise<void>;
}
