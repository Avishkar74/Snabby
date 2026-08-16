import type { CaptureSession } from '../entities';

export interface CaptureRepository {
  save(session: CaptureSession): Promise<void>;
  get(id: string): Promise<CaptureSession | null>;
}
