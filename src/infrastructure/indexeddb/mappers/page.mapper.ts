import { Page } from '../../../domain/page/Page.ts';
import { PageType, PageSource, ProcessingStatus } from '../../../domain/page/page.types.ts';
import type { PageId, SessionId, ImageId } from '../../../domain/common/ids.ts';

/**
 * PageRecord is the physical shape of a record stored in the 'captures' IndexedDB
 * object store (DB_VERSION 2+).
 *
 * From DB_VERSION 2, the migration in DatabaseManager backfills all new Page fields
 * on existing v1 screenshot records. Records written by the current implementation
 * always include every field below.
 *
 * The optional markers on the new fields are retained so that the mapper remains
 * defensive in case a record was somehow not reached by the migration (e.g., partial
 * failure, external writes, or test fixtures).
 *
 * Legacy v1 defaults applied by the migration:
 *   type            = 'SCREENSHOT'
 *   renderedImageId = imageId
 *   annotationData  = null
 *   version         = 1
 */
export interface PageRecord {
  id: string;
  sessionId: string;
  imageId: string;
  order: number;
  source: string;
  createdAt: number;
  processingStatus: string;
  // Fields backfilled by v1→v2 migration; optional only for defensive safety.
  type?: string;
  renderedImageId?: string;
  annotationData?: string | null;
  version?: number;
  errorDetails?: string;
}

export class PageMapper {
  public static toRecord(page: Page): PageRecord {
    return {
      id: page.id,
      sessionId: page.sessionId,
      // imageId is null for CUSTOM pages; persist as empty string sentinel.
      // CUSTOM pages will receive proper renderedImageId handling in a later checkpoint.
      imageId: page.imageId ?? '',
      order: page.order,
      source: page.source ?? '',
      createdAt: page.createdAt,
      processingStatus: page.status,
      type: page.type,
      renderedImageId: page.renderedImageId,
      annotationData: page.annotationData ?? null,
      version: page.version,
      errorDetails: page.errorDetails,
    };
  }

  public static toDomain(record: PageRecord): Page {
    // Determine the canonical imageId, guarding against the empty-string sentinel.
    const imageId = record.imageId && record.imageId.length > 0
      ? record.imageId as ImageId
      : undefined;

    // Determine page type — legacy records without 'type' are SCREENSHOT.
    const rawType = record.type ?? PageType.SCREENSHOT;
    const pageType = Object.values(PageType).includes(rawType as PageType)
      ? rawType as PageType
      : PageType.SCREENSHOT;

    // Determine renderedImageId — fall back to imageId for legacy records.
    const renderedImageId = (record.renderedImageId ?? imageId) as ImageId | undefined;

    // Determine source, falling back to FULL_SCREEN for legacy records.
    const rawSource = record.source;
    const source = rawSource && Object.values(PageSource).includes(rawSource as PageSource)
      ? rawSource as PageSource
      : PageSource.FULL_SCREEN;

    // Determine processingStatus, falling back to COMPLETED for legacy records
    // (pre-existing screenshots were fully captured and are effectively complete).
    const rawStatus = record.processingStatus;
    const status = rawStatus && Object.values(ProcessingStatus).includes(rawStatus as ProcessingStatus)
      ? rawStatus as ProcessingStatus
      : ProcessingStatus.COMPLETED;

    return new Page({
      id: record.id as PageId,
      sessionId: record.sessionId as SessionId,
      type: pageType,
      imageId: imageId ?? null,
      renderedImageId,
      order: record.order,
      source,
      createdAt: record.createdAt,
      status,
      errorDetails: record.errorDetails,
      annotationData: record.annotationData ?? null,
      version: record.version ?? 1,
    });
  }
}
