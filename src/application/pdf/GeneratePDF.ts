import type { SessionRepository } from '../interfaces/repositories/SessionRepository.ts';
import type { CaptureRepository } from '../interfaces/repositories/CaptureRepository.ts';
import type { PDFService } from '../interfaces/services/PDFService.ts';
import { SessionNotFoundError, NoCapturesError } from './errors.ts';
import type { SessionId } from '../../domain/common/ids.ts';

export interface GeneratePDFInput {
  sessionId: string;
  skipPendingOcr: boolean;
}

export class GeneratePDF {
  private sessionRepo: SessionRepository;
  private captureRepo: CaptureRepository;
  private pdfService: PDFService;

  constructor(
    sessionRepo: SessionRepository,
    captureRepo: CaptureRepository,
    pdfService: PDFService
  ) {
    this.sessionRepo = sessionRepo;
    this.captureRepo = captureRepo;
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
      await this.waitForPendingOcr(typedSessionId);
    }

    // 4. Call PDFService to assemble the final document
    return this.pdfService.generate(session, sortedCaptures);
  }

  private async waitForPendingOcr(sessionId: SessionId): Promise<void> {
    const maxRetries = 60; // 30 seconds max wait time (at 500ms intervals)
    let retries = 0;

    while (retries < maxRetries) {
      // Query the database to check current processing statuses
      const currentCaptures = await this.captureRepo.findBySessionId(sessionId);
      const isAnyPending = currentCaptures.some(
        (c) => c.status === 'PENDING' || c.status === 'PROCESSING'
      );

      if (!isAnyPending) {
        return; // All captures have concluded OCR (either COMPLETED or FAILED)
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      retries++;
    }

    throw new Error('Timeout waiting for pending OCR operations to complete.');
  }
}
