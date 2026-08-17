import type { ImageProcessor, ProcessedImage } from '../../application/interfaces/services/ImageProcessor.ts';
import { ImageProcessingError } from '../../application/capture/errors.ts';

export class BrowserImageProcessor implements ImageProcessor {
  public async process(imageBlob: Blob): Promise<ProcessedImage> {
    if (!imageBlob || imageBlob.size === 0) {
      throw new ImageProcessingError('Image Blob is empty or undefined.');
    }

    try {
      // Decode image using standard createImageBitmap (async & SW compatible)
      const imageBitmap = await createImageBitmap(imageBlob);
      const width = imageBitmap.width;
      const height = imageBitmap.height;

      if (width <= 0 || height <= 0) {
        throw new ImageProcessingError('Invalid image dimensions.');
      }

      // Close the bitmap to free graphics memory immediately
      imageBitmap.close();

      return {
        data: imageBlob,
        width,
        height,
        mimeType: imageBlob.type || 'image/png'
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ImageProcessingError(`Image decoding failed: ${message}`);
    }
  }
}

export const browserImageProcessor = new BrowserImageProcessor();
