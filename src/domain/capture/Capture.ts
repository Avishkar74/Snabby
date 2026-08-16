import type { CaptureId, SessionId, ImageId } from '../common/ids.ts';
import type { Timestamp } from '../common/timestamps.ts';
import { createCaptureId } from '../common/ids.ts';
import { createTimestamp } from '../common/timestamps.ts';
import { ValidationError } from '../common/errors.ts';
import type { ICaptureProps } from './capture.types.ts';
import { CaptureSource, ProcessingStatus } from './capture.types.ts';

export class Capture implements ICaptureProps {
  public readonly id: CaptureId;
  public readonly sessionId: SessionId;
  public readonly imageId: ImageId;
  public readonly order: number;
  public readonly source: CaptureSource;
  public readonly createdAt: Timestamp;
  public readonly status: ProcessingStatus;
  public readonly errorDetails?: string;

  constructor(props: ICaptureProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.imageId = props.imageId;
    this.order = props.order;
    this.source = props.source;
    this.createdAt = props.createdAt;
    this.status = props.status;
    this.errorDetails = props.errorDetails;
    this.validate();
  }

  private validate(): void {
    if (!this.id) {
      throw new ValidationError('Capture ID is required');
    }
    if (!this.sessionId) {
      throw new ValidationError('Session ID is required');
    }
    if (!this.imageId) {
      throw new ValidationError('Image ID is required');
    }
    if (this.order < 0) {
      throw new ValidationError('Capture order must be a non-negative number');
    }
    if (!Object.values(CaptureSource).includes(this.source)) {
      throw new ValidationError(`Invalid capture source: ${this.source}`);
    }
    if (this.createdAt <= 0) {
      throw new ValidationError('Capture createdAt timestamp must be positive');
    }
    if (!Object.values(ProcessingStatus).includes(this.status)) {
      throw new ValidationError(`Invalid processing status: ${this.status}`);
    }
  }

  public static create(
    sessionId: SessionId,
    imageId: ImageId,
    order: number,
    source: CaptureSource = CaptureSource.FULL_SCREEN
  ): Capture {
    return new Capture({
      id: createCaptureId(),
      sessionId,
      imageId,
      order,
      source,
      createdAt: createTimestamp(),
      status: ProcessingStatus.PENDING,
    });
  }

  public updateStatus(status: ProcessingStatus, errorDetails?: string): Capture {
    return new Capture({
      id: this.id,
      sessionId: this.sessionId,
      imageId: this.imageId,
      order: this.order,
      source: this.source,
      createdAt: this.createdAt,
      status,
      errorDetails,
    });
  }

  public reorder(newOrder: number): Capture {
    return new Capture({
      id: this.id,
      sessionId: this.sessionId,
      imageId: this.imageId,
      order: newOrder,
      source: this.source,
      createdAt: this.createdAt,
      status: this.status,
      errorDetails: this.errorDetails,
    });
  }
}
