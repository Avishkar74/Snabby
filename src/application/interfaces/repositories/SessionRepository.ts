import type { Session } from '../../../domain/session/Session.ts';
import type { SessionId } from '../../../domain/common/ids.ts';

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findById(id: SessionId): Promise<Session | null>;
  findAll(): Promise<Session[]>;
  delete(id: SessionId): Promise<void>;
}
