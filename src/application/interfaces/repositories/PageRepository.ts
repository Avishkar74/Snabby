import type { Page } from '../../../domain/page/Page.ts';
import type { PageId, SessionId } from '../../../domain/common/ids.ts';

export interface PageRepository {
  save(page: Page): Promise<void>;
  findById(id: PageId): Promise<Page | null>;
  findBySessionId(sessionId: SessionId): Promise<Page[]>;
  delete(id: PageId): Promise<void>;
}
