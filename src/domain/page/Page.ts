import type { PageId, SessionId, ImageId } from '../common/ids.ts';
import type { Timestamp } from '../common/timestamps.ts';
import { createPageId } from '../common/ids.ts';
import { createTimestamp } from '../common/timestamps.ts';
import { ValidationError } from '../common/errors.ts';
import type { IPageProps } from './page.types.ts';
import { PageSource, ProcessingStatus, PageType } from './page.types.ts';

export class Page implements IPageProps {
  public readonly id: PageId;
  public readonly sessionId: SessionId;
  public readonly type: PageType;
  public readonly imageId?: ImageId | null;
  public readonly renderedImageId?: ImageId;
  public readonly order: number;
  public readonly source?: PageSource | null;
  public readonly createdAt: Timestamp;
  public readonly status: ProcessingStatus;
  public readonly errorDetails?: string;
  public readonly annotationData?: string | null;
  public readonly version: number;

  constructor(props: IPageProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.type = props.type;
    this.imageId = props.imageId;
    this.renderedImageId = props.renderedImageId;
    this.order = props.order;
    this.source = props.source;
    this.createdAt = props.createdAt;
    this.status = props.status;
    this.errorDetails = props.errorDetails;
    this.annotationData = props.annotationData;
    this.version = props.version;
    this.validate();
  }

  public get effectiveRenderedImageId(): ImageId {
    return (this.renderedImageId ?? this.imageId) as ImageId;
  }

  private validate(): void {
    if (!this.id) {
      throw new ValidationError('Page ID is required');
    }
    if (!this.sessionId) {
      throw new ValidationError('Session ID is required');
    }
    if (this.type === PageType.SCREENSHOT) {
      if (!this.imageId) {
        throw new ValidationError('Original Image ID is required for screenshot pages');
      }
    } else if (this.type === PageType.CUSTOM) {
      if (!this.imageId && !this.renderedImageId) {
        throw new ValidationError('At least one of Original Image ID or Rendered Image ID is required for custom pages');
      }
    } else {
      throw new ValidationError(`Invalid page type: ${this.type}`);
    }
    if (this.order < 0) {
      throw new ValidationError('Page order must be a non-negative number');
    }
    if (this.source && !Object.values(PageSource).includes(this.source)) {
      throw new ValidationError(`Invalid page source: ${this.source}`);
    }
    if (this.createdAt <= 0) {
      throw new ValidationError('Page createdAt timestamp must be positive');
    }
    if (!Object.values(ProcessingStatus).includes(this.status)) {
      throw new ValidationError(`Invalid processing status: ${this.status}`);
    }
    if (this.version <= 0) {
      throw new ValidationError('Page version must be positive');
    }
  }

  public static create(
    sessionId: SessionId,
    imageId: ImageId,
    order: number,
    source: PageSource = PageSource.FULL_SCREEN
  ): Page {
    return new Page({
      id: createPageId(),
      sessionId,
      type: PageType.SCREENSHOT,
      imageId,
      renderedImageId: imageId,
      order,
      source,
      createdAt: createTimestamp(),
      status: ProcessingStatus.PENDING,
      version: 1,
    });
  }

  public static createCustom(
    sessionId: SessionId,
    imageId: ImageId,
    order: number
  ): Page {
    return new Page({
      id: createPageId(),
      sessionId,
      type: PageType.CUSTOM,
      imageId,
      order,
      createdAt: createTimestamp(),
      status: ProcessingStatus.COMPLETED,
      version: 1,
    });
  }

  public updateStatus(status: ProcessingStatus, errorDetails?: string): Page {
    return new Page({
      id: this.id,
      sessionId: this.sessionId,
      type: this.type,
      imageId: this.imageId,
      renderedImageId: this.renderedImageId,
      order: this.order,
      source: this.source,
      createdAt: this.createdAt,
      status,
      errorDetails,
      annotationData: this.annotationData,
      version: this.version,
    });
  }

  public updateAnnotations(annotationData: string | null, renderedImageId: ImageId): Page {
    return new Page({
      id: this.id,
      sessionId: this.sessionId,
      type: this.type,
      imageId: this.imageId,
      renderedImageId,
      order: this.order,
      source: this.source,
      createdAt: this.createdAt,
      status: this.status,
      errorDetails: this.errorDetails,
      annotationData,
      version: this.version + 1,
    });
  }

  public reorder(newOrder: number): Page {
    return new Page({
      id: this.id,
      sessionId: this.sessionId,
      type: this.type,
      imageId: this.imageId,
      renderedImageId: this.renderedImageId,
      order: newOrder,
      source: this.source,
      createdAt: this.createdAt,
      status: this.status,
      errorDetails: this.errorDetails,
      annotationData: this.annotationData,
      version: this.version,
    });
  }
}
