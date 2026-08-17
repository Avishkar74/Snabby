import type { CaptureSource } from '../../../domain/capture/capture.types.ts';

export interface CaptureAdapter {
  capture(source: CaptureSource): Promise<Blob>;
}
