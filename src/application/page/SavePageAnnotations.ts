import type { ImageRepository } from '../interfaces/repositories/ImageRepository.ts';
import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { PageId, ImageId } from '../../domain/common/ids.ts';
import { createImageId } from '../../domain/common/ids.ts';

export interface EditorFilePayload {
  id: string;
  dataURL: string;
  mimeType: string;
}

export class SavePageAnnotations {
  private readonly pageRepository: PageRepository;
  private readonly imageRepository: ImageRepository;

  constructor(pageRepository: PageRepository, imageRepository: ImageRepository) {
    this.pageRepository = pageRepository;
    this.imageRepository = imageRepository;
  }

  public async execute(
    pageId: PageId,
    annotationData: string | null,
    renderedImageData?: string | null,
    files?: Record<string, EditorFilePayload>
  ): Promise<boolean> {
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

    // 2. Persist editor-uploaded image files to ImageRepository
    if (files) {
      const bgFileId = `img_${pageId}`;
      for (const [fileId, filePayload] of Object.entries(files)) {
        if (fileId === bgFileId) continue;
        try {
          const res = await fetch(filePayload.dataURL);
          const blob = await res.blob();
          await this.imageRepository.save({
            id: fileId as ImageId,
            data: blob,
            mimeType: filePayload.mimeType || blob.type || 'image/png',
            width: 0,
            height: 0,
            createdAt: Date.now(),
          });
        } catch (err) {
          console.warn(`[SavePageAnnotations] Failed to save editor file ${fileId}:`, err);
        }
      }
    }

    // 3. Clean up unreferenced editor image assets for this page
    const getActiveFileIds = (rawJson: string | null | undefined): Set<string> => {
      const set = new Set<string>();
      if (!rawJson) return set;
      try {
        const elements = JSON.parse(rawJson);
        if (Array.isArray(elements)) {
          elements.forEach((el: any) => {
            if (el && el.type === 'image' && el.fileId && el.fileId !== `img_${pageId}`) {
              set.add(el.fileId);
            }
          });
        }
      } catch (e) {
        // ignore parse error
      }
      return set;
    };

    const newActiveFileIds = getActiveFileIds(annotationData);
    const oldActiveFileIds = getActiveFileIds(page.annotationData);

    for (const oldFileId of oldActiveFileIds) {
      if (!newActiveFileIds.has(oldFileId)) {
        await this.imageRepository.delete(oldFileId as ImageId).catch((err) => {
          console.warn(`[SavePageAnnotations] Failed to delete orphaned editor image ${oldFileId}:`, err);
        });
      }
    }

    const updatedPage = page.updateAnnotations(annotationData, newImageId);
    await this.pageRepository.save(updatedPage);
    return true;
  }
}
