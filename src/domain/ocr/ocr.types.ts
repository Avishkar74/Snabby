export const OCRStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type OCRStatus = typeof OCRStatus[keyof typeof OCRStatus];

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OCRWord {
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
}
