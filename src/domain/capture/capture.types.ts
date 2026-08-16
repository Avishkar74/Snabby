import type { CaptureId, SessionId, ImageId } from '../common/ids.ts';
import type { Timestamp } from '../common/timestamps.ts';

export const CaptureSource = {
  FULL_SCREEN: 'FULL_SCREEN',
  CROP_REGION: 'CROP_REGION',
} as const;

export type CaptureSource = typeof CaptureSource[keyof typeof CaptureSource];

export const ProcessingStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type ProcessingStatus = typeof ProcessingStatus[keyof typeof ProcessingStatus];

export interface ICaptureProps {
  id: CaptureId;
  sessionId: SessionId;
  imageId: ImageId;
  order: number;
  source: CaptureSource;
  createdAt: Timestamp;
  status: ProcessingStatus;
  errorDetails?: string;
}
