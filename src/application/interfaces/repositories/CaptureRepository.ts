import type { Capture } from '../../../domain/capture/Capture.ts';
import type { CaptureId } from '../../../domain/common/ids.ts';

export interface CaptureRepository {
  save(capture: Capture): Promise<void>;
  findById(id: CaptureId): Promise<Capture | null>;
  delete(id: CaptureId): Promise<void>;
}
