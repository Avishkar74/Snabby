import type { ImageAsset } from '../../../domain/image/image.types.ts';
import type { ImageId } from '../../../domain/common/ids.ts';

export interface ImageRecord {
  id: string;
  data: Blob;
  width: number;
  height: number;
  mimeType: string;
  createdAt: number;
}

export class ImageMapper {
  public static toRecord(image: ImageAsset): ImageRecord {
    return {
      id: image.id,
      data: image.data,
      width: image.width,
      height: image.height,
      mimeType: image.mimeType,
      createdAt: image.createdAt,
    };
  }

  public static toDomain(record: ImageRecord): ImageAsset {
    return {
      id: record.id as ImageId,
      data: record.data,
      width: record.width,
      height: record.height,
      mimeType: record.mimeType,
      createdAt: record.createdAt,
    };
  }
}
