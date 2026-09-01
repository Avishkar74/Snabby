import type { SessionId, ImageId } from '../common/ids.ts';
import { Page } from '../page/Page.ts';
import { PageType, PageSource, ProcessingStatus } from '../page/page.types.ts';
import type { ICaptureProps } from './capture.types.ts';

export class Capture extends Page {
  public declare readonly imageId: ImageId;
  public declare readonly source: PageSource;

  constructor(props: ICaptureProps) {
    super({
      ...props,
      type: props.type ?? PageType.SCREENSHOT,
      renderedImageId: props.renderedImageId ?? props.imageId,
      source: props.source ?? PageSource.FULL_SCREEN,
      version: props.version ?? 1,
    });
    this.imageId = props.imageId;
    this.source = props.source ?? PageSource.FULL_SCREEN;
  }

  public static override create(
    sessionId: SessionId,
    imageId: ImageId,
    order: number,
    source: PageSource = PageSource.FULL_SCREEN
  ): Capture {
    const page = Page.create(sessionId, imageId, order, source);
    return new Capture({
      id: page.id,
      sessionId: page.sessionId,
      type: page.type,
      imageId: page.imageId!,
      renderedImageId: page.renderedImageId,
      order: page.order,
      source: (page.source as PageSource) ?? PageSource.FULL_SCREEN,
      createdAt: page.createdAt,
      status: page.status,
      version: page.version,
    });
  }

  public override updateStatus(status: ProcessingStatus, errorDetails?: string): Capture {
    const updated = super.updateStatus(status, errorDetails);
    return new Capture({
      id: updated.id,
      sessionId: updated.sessionId,
      type: updated.type,
      imageId: this.imageId,
      renderedImageId: updated.renderedImageId,
      order: updated.order,
      source: this.source,
      createdAt: updated.createdAt,
      status: updated.status,
      errorDetails: updated.errorDetails,
      annotationData: updated.annotationData,
      version: updated.version,
    });
  }

  public override reorder(newOrder: number): Capture {
    const updated = super.reorder(newOrder);
    return new Capture({
      id: updated.id,
      sessionId: updated.sessionId,
      type: updated.type,
      imageId: this.imageId,
      renderedImageId: updated.renderedImageId,
      order: updated.order,
      source: this.source,
      createdAt: updated.createdAt,
      status: updated.status,
      errorDetails: updated.errorDetails,
      annotationData: updated.annotationData,
      version: updated.version,
    });
  }
}
