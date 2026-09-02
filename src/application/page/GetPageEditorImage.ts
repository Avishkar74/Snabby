import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { ImageRepository } from '../interfaces/repositories/ImageRepository.ts';
import type { PageId, ImageId } from '../../domain/common/ids.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import type { Page } from '../../domain/page/Page.ts';

export interface PageEditorImageData {
  page: Page;
  imageAsset: ImageAsset;
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
    // The rendered (annotated) image is only used in the side panel, not in the editor.
    const imageId = (page.imageId ?? page.effectiveRenderedImageId) as ImageId;
    if (!imageId) {
      return null;
    }

    const imageAsset = await this.imageRepository.findById(imageId);
    if (!imageAsset) {
      return null;
    }

    return {
      page,
      imageAsset,
    };
  }
}
