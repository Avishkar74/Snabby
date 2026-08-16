import type { SessionRepository } from '../interfaces/repositories/SessionRepository.ts';
import type { Session } from '../../domain/session/Session.ts';
import type { SessionId } from '../../domain/common/ids.ts';

export class GetSession {
  private readonly sessionRepository: SessionRepository;

  constructor(sessionRepository: SessionRepository) {
    this.sessionRepository = sessionRepository;
  }

  public async execute(id: SessionId): Promise<Session | null> {
    return this.sessionRepository.findById(id);
  }
}
