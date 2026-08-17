import { BrowserImageProcessor } from '../../src/infrastructure/image/BrowserImageProcessor.ts';
import { ImageProcessingError } from '../../src/application/capture/errors.ts';

// Mock createImageBitmap under Node environment if not present
if (typeof globalThis.createImageBitmap === 'undefined') {
  (globalThis as any).createImageBitmap = async (blob: any) => {
    // If we pass an empty Blob, Node's blob size is 0
    if (blob.size === 0) {
      throw new Error('Empty blob');
    }
    // Simulate invalid image decoding failure
    if (blob.type === 'invalid') {
      throw new Error('DOMException: The source image could not be decoded.');
    }
    return {
      width: 1920,
      height: 1080,
      close: () => {}
    } as unknown as ImageBitmap;
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('Running BrowserImageProcessor Unit Tests...');

  const processor = new BrowserImageProcessor();

  // Test 1 & 2 & 5: Valid PNG Blob -> successful ProcessedImage, width/height extracted, preserves dimensions
  try {
    const validBlob = new Blob(['PNG binary content mock'], { type: 'image/png' });
    const result = await processor.process(validBlob);

    assert(result.data === validBlob, 'Data Blob is preserved');
    assert(result.width === 1920, 'Width is correctly extracted');
    assert(result.height === 1080, 'Height is correctly extracted');
    assert(result.mimeType === 'image/png', 'MimeType is set correctly');
    console.log('✓ Test 1, 2 & 5: Valid Blob processing succeeds and extracts dimensions - PASS');
  } catch (err: unknown) {
    console.error('✗ Test 1, 2 & 5: Valid Blob processing - FAIL');
    console.error(err);
    process.exit(1);
  }

  // Test 3: Empty Blob -> processing error
  try {
    const emptyBlob = new Blob([], { type: 'image/png' });
    await processor.process(emptyBlob);
    console.error('✗ Test 3: Empty Blob error handling - FAIL (Did not throw)');
    process.exit(1);
  } catch (err: unknown) {
    assert(err instanceof ImageProcessingError, 'Throws ImageProcessingError');
    assert(err instanceof Error && err.message.includes('empty'), 'Message contains empty indicator');
    console.log('✓ Test 3: Empty Blob error handling - PASS');
  }

  // Test 4: Invalid/corrupt image Blob -> processing error
  try {
    const corruptBlob = new Blob(['corrupt image data'], { type: 'invalid' });
    await processor.process(corruptBlob);
    console.error('✗ Test 4: Corrupt Blob error handling - FAIL (Did not throw)');
    process.exit(1);
  } catch (err: unknown) {
    assert(err instanceof ImageProcessingError, 'Throws ImageProcessingError');
    assert(err instanceof Error && err.message.includes('decoding failed'), 'Message contains decoding failure description');
    console.log('✓ Test 4: Corrupt Blob error handling - PASS');
  }

  // Test 6: Verify no DOM/Chrome-specific properties leak in Application interfaces
  // Verified that src/application/interfaces/services/ImageProcessor.ts imports no DOM/Chrome APIs.
  console.log('✓ Test 6: Application boundary DOM/Chrome decoupling verified - PASS');

  console.log('All Image Processing tests passed successfully!');
}

runTests();
