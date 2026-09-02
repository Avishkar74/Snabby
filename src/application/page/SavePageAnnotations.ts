import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { PageId } from '../../domain/common/ids.ts';

export class SavePageAnnotations {
  private readonly pageRepository: PageRepository;

  constructor(pageRepository: PageRepository) {
    this.pageRepository = pageRepository;
  }

  public async execute(pageId: PageId, annotationData: string | null): Promise<boolean> {
    const page = await this.pageRepository.findById(pageId);
    if (!page) {
      return false;
    }

    const effectiveImageId = page.effectiveRenderedImageId || page.imageId;
    if (!effectiveImageId) {
      return false;
    }

    const updatedPage = page.updateAnnotations(annotationData, effectiveImageId);
    await this.pageRepository.save(updatedPage);
    return true;
  }
}
