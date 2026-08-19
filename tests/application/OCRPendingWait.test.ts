import { GeneratePDF } from '../../src/application/pdf/GeneratePDF.ts';
import { OCRStatus } from '../../src/domain/ocr/ocr.types.ts';
import type { Capture } from '../../src/domain/capture/Capture.ts';
import type { Session } from '../../src/domain/session/Session.ts';
import type { SessionId, CaptureId, ImageId } from '../../src/domain/common/ids.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running OCR Pending Wait (GeneratePDF Polling) Tests...');

class MockSessionRepository {
  public async findById(id: SessionId): Promise<Session | null> {
    return { id, name: 'Test Session', createdAt: new Date() };
  }
}

class MockCaptureRepository {
  public async findBySessionId(sessionId: SessionId): Promise<Capture[]> {
    return [
      {
        id: 'cap-1' as CaptureId,
        sessionId,
        imageId: 'img-1' as ImageId,
        status: 'PENDING', // note: Capture.status remains PENDING
        order: 0,
        createdAt: new Date(),
      }
    ];
  }
}

class MockOCRRepository {
  public callCount = 0;
  public mockStatus: OCRStatus = OCRStatus.PROCESSING;

  public async findByCaptureId(captureId: CaptureId): Promise<any | null> {
    this.callCount++;
    // Simulate transition from PROCESSING to COMPLETED on the 3rd poll
    if (this.callCount >= 3) {
      this.mockStatus = OCRStatus.COMPLETED;
    }
    return {
      captureId,
      status: this.mockStatus,
      fullText: 'hello',
      words: [],
      imageWidth: 100,
      imageHeight: 100,
    };
  }
}

class MockPDFService {
  public async generate(session: Session, captures: Capture[]): Promise<Blob> {
    return new Blob(['PDF Data'], { type: 'application/pdf' });
  }
}

async function testOcrPendingWaitPolling() {
  const sessionRepo = new MockSessionRepository();
  const captureRepo = new MockCaptureRepository();
  const ocrRepo = new MockOCRRepository();
  const pdfService = new MockPDFService();

  const useCase = new GeneratePDF(
    sessionRepo as any,
    captureRepo as any,
    ocrRepo as any,
    pdfService as any
  );

  const t0 = Date.now();
  const result = await useCase.execute({
    sessionId: 'sess-123',
    skipPendingOcr: false,
  });

  const elapsed = Date.now() - t0;
  
  // The polling interval is 500ms. Since it transitions on the 3rd poll:
  // Poll 1: PROCESSING (wait 500ms)
  // Poll 2: PROCESSING (wait 500ms)
  // Poll 3: COMPLETED (terminal, returns)
  // Total wait time should be around 1000ms
  assert(ocrRepo.callCount === 3, `OCRRepository should be polled 3 times, got ${ocrRepo.callCount}`);
  assert(elapsed >= 1000, `Should take at least 1000ms to complete, got ${elapsed}ms`);
  assert(result instanceof Blob, 'Should return PDF Blob');

  console.log('✓ OCR Pending Wait Polling transitions and checks OCRRepository - PASS');
}

async function runAll() {
  await testOcrPendingWaitPolling();
  console.log('OCR Pending Wait tests completed successfully!');
}

runAll();
