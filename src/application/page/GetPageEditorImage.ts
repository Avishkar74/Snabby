import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { ImageRepository } from '../interfaces/repositories/ImageRepository.ts';
import type { PageId, ImageId } from '../../domain/common/ids.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import type { Page } from '../../domain/page/Page.ts';

export interface EditorFilePayload {
  id: string;
  dataURL: string;
  mimeType: string;
}

export interface PageEditorImageData {
  page: Page;
  imageAsset: ImageAsset;
  editorFiles?: Record<string, EditorFilePayload>;
}

async function blobToDataURL(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
  }
  const base64 = btoa(binary);
  return `data:${blob.type || 'image/png'};base64,${base64}`;
}

export class GetPageEditorImage {
  private readonly pageRepository: PageRepository;
  private readonly imageRepository: ImageRepository;

  constructor(pageRepository: PageRepository, imageRepository: ImageRepository) {
    this.pageRepository = pageRepository;
    this.imageRepository = imageRepository;
  }

  public async execute(pageId: PageId): Promise<PageEditorImageData | null> {
    const page = await this.pageRepository.findById(pageId);
    if (!page) {
      return null;
    }

    // Always load the original un-annotated screenshot into the editor background.
    const imageId = (page.imageId ?? page.effectiveRenderedImageId) as ImageId;
    if (!imageId) {
      return null;
    }

    const imageAsset = await this.imageRepository.findById(imageId);
    if (!imageAsset) {
      return null;
    }

    // Load referenced editor-uploaded image files from ImageRepository
    const editorFiles: Record<string, EditorFilePayload> = {};
    if (page.annotationData) {
      try {
        const elements = JSON.parse(page.annotationData);
        if (Array.isArray(elements)) {
          const bgFileId = `img_${pageId}`;
          for (const el of elements) {
            if (el && el.type === 'image' && el.fileId && el.fileId !== bgFileId) {
              const fileId = el.fileId;
              if (!editorFiles[fileId]) {
                const asset = await this.imageRepository.findById(fileId as ImageId);
                if (asset && asset.data) {
                  const dataURL = await blobToDataURL(asset.data);
                  editorFiles[fileId] = {
                    id: fileId,
                    dataURL,
                    mimeType: asset.mimeType || asset.data.type || 'image/png',
                  };
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[GetPageEditorImage] Failed to parse annotationData for page ${pageId}:`, err);
      }
    }

    return {
      page,
      imageAsset,
      editorFiles,
    };
  }
}
