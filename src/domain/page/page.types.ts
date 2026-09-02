import type { PageId, SessionId, ImageId } from '../common/ids.ts';
import type { Timestamp } from '../common/timestamps.ts';

export const PageType = {
  SCREENSHOT: 'SCREENSHOT',
  CUSTOM: 'CUSTOM',
} as const;

export type PageType = typeof PageType[keyof typeof PageType];

export const CUSTOM_PAGE_WIDTH = 1240;
export const CUSTOM_PAGE_HEIGHT = 1754;

export const PageSource = {
  FULL_SCREEN: 'FULL_SCREEN',
  CROP_REGION: 'CROP_REGION',
} as const;

export type PageSource = typeof PageSource[keyof typeof PageSource];

export const ProcessingStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type ProcessingStatus = typeof ProcessingStatus[keyof typeof ProcessingStatus];

export interface IPageProps {
  id: PageId;
  sessionId: SessionId;
  type: PageType;
  imageId?: ImageId | null;
  renderedImageId?: ImageId;
  order: number;
  source?: PageSource | null;
  createdAt: Timestamp;
  status: ProcessingStatus;
  errorDetails?: string;
  annotationData?: string | null;
  version: number;
}
