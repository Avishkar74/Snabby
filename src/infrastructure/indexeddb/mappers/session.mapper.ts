import { Session } from '../../../domain/session/Session.ts';
import type { SessionId } from '../../../domain/common/ids.ts';

export interface SessionRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export class SessionMapper {
  public static toRecord(session: Session): SessionRecord {
    return {
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  public static toDomain(record: SessionRecord): Session {
    return new Session({
      id: record.id as SessionId,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
