import type { SessionRepository } from '../interfaces/repositories/SessionRepository.ts';
import type { CaptureRepository } from '../interfaces/repositories/CaptureRepository.ts';
import type { OCRRepository } from '../interfaces/repositories/OCRRepository.ts';
import type { PDFService } from '../interfaces/services/PDFService.ts';
import { SessionNotFoundError, NoCapturesError } from './errors.ts';
import type { SessionId, CaptureId } from '../../domain/common/ids.ts';
import { OCRStatus } from '../../domain/ocr/ocr.types.ts';

export interface GeneratePDFInput {
  sessionId: string;
  skipPendingOcr: boolean;
}

export class GeneratePDF {
  private sessionRepo: SessionRepository;
  private captureRepo: CaptureRepository;
  private ocrRepo: OCRRepository;
  private pdfService: PDFService;

  constructor(
    sessionRepo: SessionRepository,
    captureRepo: CaptureRepository,
    ocrRepo: OCRRepository,
    pdfService: PDFService
  ) {
    this.sessionRepo = sessionRepo;
    this.captureRepo = captureRepo;
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

    // 2. Load Captures
    const captures = await this.captureRepo.findBySessionId(typedSessionId);
    if (captures.length === 0) {
      throw new NoCapturesError(`No captures found for session: ${sessionId}`);
    }

    // Sort captures by their order property to enforce correct page sequence
    const sortedCaptures = [...captures].sort((a, b) => a.order - b.order);

    // 3. Handle pending OCR polling if skipPendingOcr is false
    if (!skipPendingOcr) {
      await this.waitForPendingOcr(sortedCaptures.map(c => c.id));
    }

    // 4. Call PDFService to assemble the final document
    return this.pdfService.generate(session, sortedCaptures);
  }

  /**
   * Polls the OCRRepository (NOT Capture.status — which RunOCR never updates)
   * to determine if all captures have reached a terminal OCR state.
   * 
   * A capture is "done" when:
   * - An OCRResult exists with status COMPLETED or FAILED, OR
   * - No OCRResult exists AND > 60 seconds have passed (hard timeout safety net)
   */
  private async waitForPendingOcr(captureIds: CaptureId[]): Promise<void> {
    console.log(`[GeneratePDF] Waiting for OCR on ${captureIds.length} capture(s)...`);
    const maxRetries = 60; // 30 seconds max (at 500ms intervals)
    let retries = 0;

    while (retries < maxRetries) {
      // Poll OCRRepository directly — this is the authoritative source for OCR state
      const ocrResults = await Promise.all(
        captureIds.map(id => this.ocrRepo.findByCaptureId(id))
      );

      // A capture is "terminal" if it has an OCR result with COMPLETED or FAILED status
      const allTerminal = ocrResults.every(
        (result) => result !== null && (
          result.status === OCRStatus.COMPLETED || 
          result.status === OCRStatus.FAILED
        )
      );

      if (allTerminal) {
        console.log(`[GeneratePDF] All ${captureIds.length} OCR result(s) are in terminal state.`);
        return;
      }

      const pendingCount = ocrResults.filter(
        r => r === null || (r.status !== OCRStatus.COMPLETED && r.status !== OCRStatus.FAILED)
      ).length;
      console.log(`[GeneratePDF] OCR pending: ${pendingCount}/${captureIds.length}. Waiting 500ms...`);

      await new Promise((resolve) => setTimeout(resolve, 500));
      retries++;
    }

    throw new Error('Timeout waiting for pending OCR operations to complete.');
  }
}
