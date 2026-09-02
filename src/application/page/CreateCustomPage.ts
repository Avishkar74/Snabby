import type { PagePersistenceService } from '../interfaces/services/PagePersistenceService.ts';
import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { SessionId } from '../../domain/common/ids.ts';
import { Page } from '../../domain/page/Page.ts';
import { createImageId } from '../../domain/common/ids.ts';
import type { ImageAsset } from '../../domain/image/image.types.ts';
import { CUSTOM_PAGE_WIDTH, CUSTOM_PAGE_HEIGHT } from '../../domain/page/page.types.ts';

export interface CreateCustomPageInput {
  sessionId: SessionId;
  index?: number;
}

export interface CreateCustomPageResult {
  page: Page;
}

export class CreateCustomPage {
  private readonly pagePersistenceService: PagePersistenceService;
  private readonly pageRepository: PageRepository;

  constructor(
    pagePersistenceService: PagePersistenceService,
    pageRepository: PageRepository
  ) {
    this.pagePersistenceService = pagePersistenceService;
    this.pageRepository = pageRepository;
  }

  public async execute(input: CreateCustomPageInput): Promise<CreateCustomPageResult> {
    // 1. Generate blank white A4 PNG Blob (1240 × 1754)
    const blankBlob = await this.createBlankImageBlob();

    // 2. Generate ImageId for the blank base asset
    const imageId = createImageId();

    // 3. Create ImageAsset domain representation
    const imageAsset: ImageAsset = {
      id: imageId,
      data: blankBlob,
      width: CUSTOM_PAGE_WIDTH,
      height: CUSTOM_PAGE_HEIGHT,
      mimeType: 'image/png',
      createdAt: Date.now(),
    };

    // 4. Fetch existing pages for the session to compute order / insert index
    const existingPages = await this.pageRepository.findBySessionId(input.sessionId);

    let targetOrder: number;

    if (typeof input.index === 'number' && input.index >= 0 && input.index < existingPages.length) {
      targetOrder = input.index;
      // Shift pages at or after targetOrder by +1
      for (const page of existingPages) {
        if (page.order >= targetOrder) {
          const reorderedPage = page.reorder(page.order + 1);
          await this.pageRepository.save(reorderedPage);
        }
      }
    } else {
      targetOrder = existingPages.length;
    }

    // 5. Create Page domain object (type = CUSTOM, imageId = imageId, order = targetOrder)
    const page = Page.createCustom(input.sessionId, imageId, targetOrder);

    // 6. Atomically persist Page and blank ImageAsset
    await this.pagePersistenceService.save(page, imageAsset);

    return {
      page,
    };
  }

  private async createBlankImageBlob(): Promise<Blob> {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(CUSTOM_PAGE_WIDTH, CUSTOM_PAGE_HEIGHT);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, CUSTOM_PAGE_WIDTH, CUSTOM_PAGE_HEIGHT);
        return await canvas.convertToBlob({ type: 'image/png' });
      }
    }

    // Fallback for HTML5 Canvas DOM / Test environment
    const canvas = document.createElement('canvas');
    canvas.width = CUSTOM_PAGE_WIDTH;
    canvas.height = CUSTOM_PAGE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CUSTOM_PAGE_WIDTH, CUSTOM_PAGE_HEIGHT);
    }
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to generate blank image Blob'));
        }
      }, 'image/png');
    });
  }
}
