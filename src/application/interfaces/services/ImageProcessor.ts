export interface ProcessedImage {
  data: Blob;
  width: number;
  height: number;
  mimeType: string;
}

export interface ImageProcessor {
  process(imageBlob: Blob): Promise<ProcessedImage>;
}
