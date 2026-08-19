import type { Session } from '../../src/domain/session/Session.ts';
import type { SessionId } from '../../src/domain/common/ids.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Session Lifecycle After Download Tests...');

class MockSessionRepository {
  public session: Session | null = {
    id: 'sess-123' as SessionId,
    name: 'Active Session',
    createdAt: new Date(),
  };

  public async findAll(): Promise<Session[]> {
    return this.session ? [this.session] : [];
  }

  public async delete(id: SessionId): Promise<void> {
    if (this.session && this.session.id === id) {
      this.session = null;
    }
  }
}

class MockGeneratePDF {
  public shouldFail = false;
  public async execute(input: { sessionId: string; skipPendingOcr: boolean }): Promise<Blob> {
    if (this.shouldFail) {
      throw new Error('Mock PDF generation failed');
    }
    return new Blob(['pdf-data'], { type: 'application/pdf' });
  }
}

class MockDownloadPDF {
  public shouldFail = false;
  public lastBlobDownloaded: Blob | null = null;

  public async execute(input: { pdfBlob: Blob; filename: string }): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Mock Download failed');
    }
    this.lastBlobDownloaded = input.pdfBlob;
  }
}

// Simulate the SW message handler
async function handleExportPdfMessage(
  sessionRepo: MockSessionRepository,
  generatePDF: MockGeneratePDF,
  downloadPDF: MockDownloadPDF,
  message: { skipPendingOcr?: boolean; filename: string }
): Promise<{ success: boolean; error?: any }> {
  try {
    const sessions = await sessionRepo.findAll();
    if (sessions.length === 0) {
      return { success: false, error: 'NO_ACTIVE_SESSION' };
    }
    const session = sessions[0];

    const pdfBlob = await generatePDF.execute({
      sessionId: session.id,
      skipPendingOcr: message.skipPendingOcr ?? false
    });

    await downloadPDF.execute({
      pdfBlob,
      filename: message.filename
    });

    await sessionRepo.delete(session.id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function testSuccessfulDownloadEndsSession() {
  const sessionRepo = new MockSessionRepository();
  const generatePDF = new MockGeneratePDF();
  const downloadPDF = new MockDownloadPDF();

  const res = await handleExportPdfMessage(sessionRepo, generatePDF, downloadPDF, { filename: 'test.pdf' });
  
  assert(res.success === true, 'Handler should return success');
  assert(sessionRepo.session === null, 'Session should be deleted after successful download');
  console.log('✓ Successful download terminates the session - PASS');
}

async function testFailedPdfGenerationPreservesSession() {
  const sessionRepo = new MockSessionRepository();
  const generatePDF = new MockGeneratePDF();
  const downloadPDF = new MockDownloadPDF();
  generatePDF.shouldFail = true;

  const res = await handleExportPdfMessage(sessionRepo, generatePDF, downloadPDF, { filename: 'test.pdf' });
  
  assert(res.success === false, 'Handler should fail');
  assert(sessionRepo.session !== null, 'Session should remain intact if PDF generation fails');
  console.log('✓ Failed PDF generation preserves the session - PASS');
}

async function testFailedDownloadPreservesSession() {
  const sessionRepo = new MockSessionRepository();
  const generatePDF = new MockGeneratePDF();
  const downloadPDF = new MockDownloadPDF();
  downloadPDF.shouldFail = true;

  const res = await handleExportPdfMessage(sessionRepo, generatePDF, downloadPDF, { filename: 'test.pdf' });
  
  assert(res.success === false, 'Handler should fail');
  assert(sessionRepo.session !== null, 'Session should remain intact if Download fails');
  console.log('✓ Failed Download preserves the session - PASS');
}

async function runAll() {
  await testSuccessfulDownloadEndsSession();
  await testFailedPdfGenerationPreservesSession();
  await testFailedDownloadPreservesSession();
  console.log('Session Lifecycle after download tests completed successfully!');
}

runAll();
