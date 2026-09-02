import type { SessionRepository } from '../interfaces/repositories/SessionRepository.ts';
import type { PageRepository } from '../interfaces/repositories/PageRepository.ts';
import type { OCRRepository } from '../interfaces/repositories/OCRRepository.ts';
import type { PDFService } from '../interfaces/services/PDFService.ts';
import { SessionNotFoundError, NoCapturesError } from './errors.ts';
import type { SessionId } from '../../domain/common/ids.ts';
import type { Page } from '../../domain/page/Page.ts';
import { OCRStatus } from '../../domain/ocr/ocr.types.ts';

export interface GeneratePDFInput {
  sessionId: string;
  skipPendingOcr: boolean;
}

export class GeneratePDF {
  private sessionRepo: SessionRepository;
  private pageRepo: PageRepository;
  private ocrRepo: OCRRepository;
  private pdfService: PDFService;

  constructor(
    sessionRepo: SessionRepository,
    pageRepo: PageRepository,
    ocrRepo: OCRRepository,
    pdfService: PDFService
  ) {
    this.sessionRepo = sessionRepo;
    this.pageRepo = pageRepo;
    this.ocrRepo = ocrRepo;
    this.pdfService = pdfService;
  }

  public async execute(input: GeneratePDFInput): Promise<Blob> {
    const { sessionId, skipPendingOcr } = input;
    const typedSessionId = sessionId as SessionId;

    // 1. Load Session
    const session = await this.sessionRepo.findById(typedSessionId);
    if (!session) {
      throw new SessionNotFoundError(`Session not found with ID: ${sessionId}`);
    }

    // 2. Load Pages
    const pages = await this.pageRepo.findBySessionId(typedSessionId);
    if (pages.length === 0) {
      throw new NoCapturesError(`No captures found for session: ${sessionId}`);
    }

    // Sort captures by their order property to enforce correct page sequence
    const sortedPages = [...pages].sort((a, b) => a.order - b.order);

    // 3. Handle pending OCR polling if skipPendingOcr is false
    if (!skipPendingOcr) {
      await this.waitForPendingOcr(sortedPages);
    }

    // 4. Call PDFService to assemble the final document
    return this.pdfService.generate(session, sortedPages);
  }

  /**
   * Polls the OCRRepository to determine if all pages have reached a terminal OCR state.
   * 
   * A page is "terminal" if:
   * - It is a blank un-edited custom page (PageType.CUSTOM without renderedImageId), OR
   * - An OCRResult exists for page.id with status COMPLETED or FAILED
   */
  private async waitForPendingOcr(pages: Page[]): Promise<void> {
    console.log(`[GeneratePDF] Waiting for OCR on ${pages.length} page(s)...`);
    const maxRetries = 60; // 30 seconds max (at 500ms intervals)
    let retries = 0;

    while (retries < maxRetries) {
      const ocrResults = await Promise.all(
        pages.map(p => this.ocrRepo.findByCaptureId(p.id))
      );

      const allTerminal = pages.every((page, idx) => {
        if (page.type === 'CUSTOM' && !page.renderedImageId) {
          return true; // Blank un-edited custom page needs no OCR
        }
        const result = ocrResults[idx];
        return result !== null && (
          result.status === OCRStatus.COMPLETED || 
          result.status === OCRStatus.FAILED
        );
      });

      if (allTerminal) {
        console.log(`[GeneratePDF] All ${pages.length} OCR result(s) are in terminal state.`);
        return;
      }

      const pendingCount = pages.filter((page, idx) => {
        if (page.type === 'CUSTOM' && !page.renderedImageId) return false;
        const r = ocrResults[idx];
        return r === null || (r.status !== OCRStatus.COMPLETED && r.status !== OCRStatus.FAILED);
      }).length;
      console.log(`[GeneratePDF] OCR pending: ${pendingCount}/${pages.length}. Waiting 500ms...`);

      await new Promise((resolve) => setTimeout(resolve, 500));
      retries++;
    }

    throw new Error('Timeout waiting for pending OCR operations to complete.');
  }
}
