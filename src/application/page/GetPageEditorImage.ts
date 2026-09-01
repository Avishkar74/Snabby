import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { ImageRepository } from '../interfaces/repositories/ImageRepository.ts';
import type { PageId } from '../../domain/common/ids.ts';
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

    const effectiveImageId = page.effectiveRenderedImageId;
    if (!effectiveImageId) {
      return null;
    }

    const imageAsset = await this.imageRepository.findById(effectiveImageId);
    if (!imageAsset) {
      return null;
    }

    return {
      page,
      imageAsset,
    };
  }
}
