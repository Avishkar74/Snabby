import type { Capture } from '../../../domain/capture/Capture.ts';
import type { CaptureId, SessionId } from '../../../domain/common/ids.ts';

export interface CaptureRepository {
  save(capture: Capture): Promise<void>;
  findById(id: CaptureId): Promise<Capture | null>;
  findBySessionId(sessionId: SessionId): Promise<Capture[]>;
  delete(id: CaptureId): Promise<void>;
}
