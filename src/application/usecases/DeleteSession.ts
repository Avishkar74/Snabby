import type { SessionRepository } from '../interfaces/repositories/SessionRepository.ts';
import type { SessionId } from '../../domain/common/ids.ts';
import { SessionNotFoundError } from '../../domain/common/errors.ts';

export class DeleteSession {
  private readonly sessionRepository: SessionRepository;

  constructor(sessionRepository: SessionRepository) {
    this.sessionRepository = sessionRepository;
  }

  public async execute(id: SessionId): Promise<void> {
    const session = await this.sessionRepository.findById(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }

    await this.sessionRepository.delete(id);
  }
}
