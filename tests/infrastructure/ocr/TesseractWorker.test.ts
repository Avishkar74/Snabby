import { TesseractWorker } from '../../../src/infrastructure/ocr/TesseractWorker.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('Running TesseractWorker Unit Tests under Node...');

  const worker = new TesseractWorker();
  
  // Valid 1x1 pixel transparent PNG
  const validMockImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

  // Test 1: Worker initializes and processes valid image
  try {
    const result = await worker.recognize(validMockImage);
    
    assert(typeof result.text === 'string', 'result.text must be a string');
    assert(typeof result.confidence === 'number', 'result.confidence must be a number');
    assert(Array.isArray(result.words), 'result.words must be an array');
    
    console.log('✓ Test 1: Tesseract worker initializes and processes image successfully - PASS');
  } catch (err: unknown) {
    console.error('✗ Test 1: Tesseract worker processing - FAIL');
    console.error(err);
    process.exit(1);
  }

  // Test 2: Error handling for malformed input
  try {
    await worker.recognize('invalid-data-url');
    console.error('✗ Test 2: Error handling for invalid data - FAIL (Did not throw)');
    process.exit(1);
  } catch (err: unknown) {
    assert(err instanceof Error, 'Error should be instance of Error');
    assert(err.message.includes('failed'), 'Error message should indicate recognition failure');
    console.log('✓ Test 2: Error handling for malformed inputs - PASS');
  }

  // Clean up
  await worker.terminate();
  console.log('All TesseractWorker unit tests passed successfully!');
}

runTests();
