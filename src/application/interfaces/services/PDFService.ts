import type { Session } from '../../../domain/session/Session.ts';
import type { Page } from '../../../domain/page/Page.ts';

export interface PDFService {
  generate(session: Session, pages: Page[]): Promise<Blob>;
}
