import { Session } from '../../domain/session/Session.ts';

export class CreateCaptureSession {
  execute(name: string): Session {
    return Session.create(name);
  }
}
