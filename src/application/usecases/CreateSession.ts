import type { SessionRepository } from '../interfaces/repositories/SessionRepository.ts';
import { Session } from '../../domain/session/Session.ts';

export class CreateSession {
  private readonly sessionRepository: SessionRepository;

  constructor(sessionRepository: SessionRepository) {
    this.sessionRepository = sessionRepository;
  }

  public async execute(name: string): Promise<Session> {
    const session = Session.create(name);
    await this.sessionRepository.save(session);
    return session;
  }
}
