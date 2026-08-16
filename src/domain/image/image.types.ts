import type { ImageId } from '../common/ids.ts';
import type { Timestamp } from '../common/timestamps.ts';

export interface ImageAsset {
  id: ImageId;
  data: Blob;
  width: number;
  height: number;
  mimeType: string;
  createdAt: Timestamp;
}
