import { Capture } from '../../../domain/capture/Capture.ts';
import { CaptureSource, ProcessingStatus } from '../../../domain/capture/capture.types.ts';
import type { CaptureId, SessionId, ImageId } from '../../../domain/common/ids.ts';

export interface CaptureRecord {
  id: string;
  sessionId: string;
  imageId: string;
  order: number;
  source: string;
  createdAt: number;
  processingStatus: string;
}

export class CaptureMapper {
  public static toRecord(capture: Capture): CaptureRecord {
    return {
      id: capture.id,
      sessionId: capture.sessionId,
      imageId: capture.imageId,
      order: capture.order,
      source: capture.source,
      createdAt: capture.createdAt,
      processingStatus: capture.status,
    };
  }

  public static toDomain(record: CaptureRecord): Capture {
    return new Capture({
      id: record.id as CaptureId,
      sessionId: record.sessionId as SessionId,
      imageId: record.imageId as ImageId,
      order: record.order,
      source: record.source as CaptureSource,
      createdAt: record.createdAt,
      status: record.processingStatus as ProcessingStatus,
    });
  }
}
