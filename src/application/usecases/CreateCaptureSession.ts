import type { CaptureSession } from '../../domain/entities';

export class CreateCaptureSession {
  execute(): CaptureSession {
    return { id: '1', name: 'Session', createdAt: new Date() };
  }
}
