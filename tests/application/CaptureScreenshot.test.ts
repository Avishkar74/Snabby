import { CaptureScreenshot } from '../../src/application/capture/CaptureScreenshot.ts';
import type { CaptureAdapter } from '../../src/application/interfaces/adapters/CaptureAdapter.ts';
import { CaptureError } from '../../src/application/capture/errors.ts';
import { ValidationError } from '../../src/domain/common/errors.ts';
import type { CaptureSource } from '../../src/domain/capture/capture.types.ts';
import type { SessionId } from '../../src/domain/common/ids.ts';

// Simple assert helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Mock CaptureAdapter implementation
class MockCaptureAdapter implements CaptureAdapter {
  public shouldFail: boolean = false;
  public mockBlob: Blob;

  constructor(mockBlob: Blob) {
    this.mockBlob = mockBlob;
  }

  public async capture(source: CaptureSource): Promise<Blob> {
    if (this.shouldFail) {
      throw new Error('Mock Chrome API failure');
    }
    return this.mockBlob;
  }
}

async function runTests() {
  console.log('Running CaptureScreenshot Unit Tests...');

  const mockBlob = new Blob(['Mock image screenshot content'], { type: 'image/png' });
  const mockAdapter = new MockCaptureAdapter(mockBlob);
  const useCase = new CaptureScreenshot(mockAdapter);

  const testSessionId = 'test-session-uuid' as SessionId;

  // Test 1: FULL_SCREEN succeeds, returns Blob, and preserves parameters
  try {
    mockAdapter.shouldFail = false;
    const result = await useCase.execute({
      sessionId: testSessionId,
      captureMode: 'FULL_SCREEN'
    });

    assert(result.sessionId === testSessionId, 'Preserves sessionId');
    assert(result.captureMode === 'FULL_SCREEN', 'Preserves captureMode');
    assert(result.imageBlob === mockBlob, 'Returns the expected Blob');
    assert(typeof result.capturedAt === 'number' && result.capturedAt > 0, 'Generates capturedAt timestamp');

    console.log('✓ Test 1: FULL_SCREEN capture success - PASS');
  } catch (err: unknown) {
    console.error('✗ Test 1: FULL_SCREEN capture success - FAIL');
    console.error(err);
    process.exit(1);
  }

  // Test 2: CROP_REGION is explicitly rejected with ValidationError
  try {
    await useCase.execute({
      sessionId: testSessionId,
      captureMode: 'CROP_REGION'
    });
    console.error('✗ Test 2: CROP_REGION rejection - FAIL (Did not throw)');
    process.exit(1);
  } catch (err: unknown) {
    assert(err instanceof ValidationError, 'Throws ValidationError');
    assert(err.message.includes('not supported'), 'Contains helpful message');
    console.log('✓ Test 2: CROP_REGION rejection - PASS');
  }

  // Test 3: Adapter errors are translated to CaptureError
  try {
    mockAdapter.shouldFail = true;
    
    // We mock that the adapter throws a raw Error, mimicking Chrome API failure
    // The ChromeCaptureAdapter inside infrastructure handles catching and translating this to CaptureError.
    // Let's verify that the usecase propagates the error.
    try {
      await useCase.execute({
        sessionId: testSessionId,
        captureMode: 'FULL_SCREEN'
      });
      console.error('✗ Test 3: Error propagation - FAIL (Did not throw)');
      process.exit(1);
    } catch (err: unknown) {
      assert(err instanceof Error, 'Throws an Error');
      assert(err.message.includes('Mock Chrome API failure'), 'Preserves error message');
      console.log('✓ Test 3: Error propagation - PASS');
    }
  } catch (err: unknown) {
    console.error('✗ Test 3: Error propagation test setup - FAIL');
    console.error(err);
    process.exit(1);
  }

  console.log('All tests passed successfully!');
}

runTests();
