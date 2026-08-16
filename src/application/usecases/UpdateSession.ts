import type { SessionRepository } from '../interfaces/repositories/SessionRepository.ts';
import type { Session } from '../../domain/session/Session.ts';
import type { SessionId } from '../../domain/common/ids.ts';
import { SessionNotFoundError } from '../../domain/common/errors.ts';

export class UpdateSession {
  private readonly sessionRepository: SessionRepository;

  constructor(sessionRepository: SessionRepository) {
    this.sessionRepository = sessionRepository;
  }

  public async execute(id: SessionId, name: string): Promise<Session> {
    const session = await this.sessionRepository.findById(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }

    const updatedSession = session.rename(name);
    await this.sessionRepository.save(updatedSession);
    return updatedSession;
  }
}
