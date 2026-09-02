import type { ImageRepository } from '../interfaces/repositories/ImageRepository.ts';
import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { PageId } from '../../domain/common/ids.ts';
import { createImageId } from '../../domain/common/ids.ts';

export class SavePageAnnotations {
  private readonly pageRepository: PageRepository;
  private readonly imageRepository: ImageRepository;

  constructor(pageRepository: PageRepository, imageRepository: ImageRepository) {
    this.pageRepository = pageRepository;
    this.imageRepository = imageRepository;
  }

  public async execute(pageId: PageId, annotationData: string | null, renderedImageData?: string | null): Promise<boolean> {
    const page = await this.pageRepository.findById(pageId);
    if (!page) {
      return false;
    }

    const effectiveImageId = page.effectiveRenderedImageId || page.imageId;
    if (!effectiveImageId) {
      return false;
    }

    let newImageId = effectiveImageId;

    if (renderedImageData) {
      // 1. Store the new rendered image
      const newId = createImageId();
      
      // Parse data URL to blob
      const res = await fetch(renderedImageData);
      const blob = await res.blob();
      
      // We cannot use `new Image()` in a Service Worker.
      // However, the bounded image is guaranteed to match the original image's dimensions.
      const sourceImageId = page.imageId || effectiveImageId;
      const originalImageAsset = await this.imageRepository.findById(sourceImageId as string as any);
      if (!originalImageAsset) {
        throw new Error('Original image asset not found');
      }

      await this.imageRepository.save({
        id: newId,
        data: blob,
        mimeType: blob.type,
        width: originalImageAsset.width,
        height: originalImageAsset.height,
        createdAt: Date.now(),
      });
      
      newImageId = newId;

      // Clean up the old rendered image if it's not the original screenshot
      if (effectiveImageId !== page.imageId) {
        await this.imageRepository.delete(effectiveImageId).catch((err) => {
          console.warn(`[SavePageAnnotations] Failed to delete old rendered image ${effectiveImageId}:`, err);
        });
      }
    }

    const updatedPage = page.updateAnnotations(annotationData, newImageId);
    await this.pageRepository.save(updatedPage);
    return true;
  }
}
