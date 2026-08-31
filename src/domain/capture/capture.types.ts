import type { PageId, SessionId, ImageId } from '../common/ids.ts';
import type { Timestamp } from '../common/timestamps.ts';
import * as PageTypes from '../page/page.types.ts';

export const CaptureSource = PageTypes.PageSource;
export type CaptureSource = PageTypes.PageSource;

export const ProcessingStatus = PageTypes.ProcessingStatus;
export type ProcessingStatus = PageTypes.ProcessingStatus;

export const CaptureType = PageTypes.PageType;
export type CaptureType = PageTypes.PageType;

export interface ICaptureProps {
  id: PageId;
  sessionId: SessionId;
  type?: PageTypes.PageType;
  imageId: ImageId;
  renderedImageId?: ImageId;
  order: number;
  source?: PageTypes.PageSource;
  createdAt: Timestamp;
  status: PageTypes.ProcessingStatus;
  errorDetails?: string;
  annotationData?: string | null;
  version?: number;
}
