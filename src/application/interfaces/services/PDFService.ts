import type { Session } from '../../../domain/session/Session.ts';
import type { Capture } from '../../../domain/capture/Capture.ts';

export interface PDFService {
  generate(session: Session, captures: Capture[]): Promise<Blob>;
}
