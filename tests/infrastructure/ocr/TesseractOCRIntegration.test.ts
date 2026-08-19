import { ChromeMessageBus } from '../../../src/infrastructure/messaging/ChromeMessageBus.ts';
import { TesseractOCRAdapter } from '../../../src/infrastructure/ocr/TesseractOCRAdapter.ts';
import { OCRResult } from '../../../src/domain/ocr/OCRResult.ts';
import { OCRStatus } from '../../../src/domain/ocr/ocr.types.ts';
import type { ImageAsset } from '../../../src/domain/image/image.types.ts';
import type { CaptureId, ImageId } from '../../../src/domain/common/ids.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 1. Mock Chrome Runtime API globally
const listeners: Array<(message: any, sender: any, sendResponse: (response: any) => void) => boolean | void> = [];

(globalThis as any).chrome = {
  runtime: {
    sendMessage: async (message: any) => {
      return new Promise((resolve) => {
        let resolved = false;
        const sendResponse = (response: any) => {
          if (!resolved) {
            resolved = true;
            resolve(response);
          }
        };

        for (const listener of listeners) {
          const isAsync = listener(message, { id: 'test-sender' }, sendResponse);
          if (!isAsync && !resolved) {
            resolved = true;
            resolve(undefined);
          }
        }
      });
    },
    onMessage: {
      addListener: (listener: any) => {
        listeners.push(listener);
      },
      removeListener: (listener: any) => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }
  }
};

async function runTests() {
  console.log('Running End-to-End Tesseract OCR Integration Tests...');

  // 2. Dynamically import offscreen to register its message listener after chrome mock is ready
  await import('../../../src/infrastructure/ocr/offscreen/offscreen.ts');

  const messageBus = new ChromeMessageBus();
  const adapter = new TesseractOCRAdapter(messageBus);

  // 1x1 transparent PNG binary bytes
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
  const binaryString = atob(base64Png);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const validBlob = new Blob([bytes], { type: 'image/png' });

  const mockImage: ImageAsset = {
    id: 'capture-uuid-123' as unknown as ImageId,
    data: validBlob,
    width: 1,
    height: 1,
    mimeType: 'image/png',
    createdAt: 0
  };

  // Test 1: Successful OCR integration flow
  try {
    const ocrResult = await adapter.process(mockImage);

    assert(ocrResult instanceof OCRResult, 'Returns an OCRResult domain entity');
    assert(ocrResult.captureId === 'capture-uuid-123', 'Correct captureId references');
    assert(ocrResult.status === OCRStatus.COMPLETED, 'OCR status is COMPLETED');
    assert(typeof ocrResult.fullText === 'string', 'fullText is extracted');
    assert(Array.isArray(ocrResult.words), 'words is mapped as array');
    assert(ocrResult.imageWidth === 1920, 'Image width matches default fallback in Node (1920)');
    assert(ocrResult.imageHeight === 1080, 'Image height matches default fallback in Node (1080)');

    console.log('✓ Test 1: E2E OCR Flow (SW -> MessageBus -> Offscreen -> Tesseract) succeeds - PASS');
  } catch (err: unknown) {
    console.error('✗ Test 1: E2E OCR Flow - FAIL');
    console.error(err);
    process.exit(1);
  }

  // Test 2: Error boundary mapping and propagation
  try {
    // Pass empty Blob data to trigger standard main thread error
    const corruptBlob = new Blob([], { type: 'image/png' });
    const corruptImage: ImageAsset = {
      id: 'capture-uuid-err' as unknown as ImageId,
      data: corruptBlob,
      width: 1,
      height: 1,
      mimeType: 'image/png',
      createdAt: 0
    };

    await adapter.process(corruptImage);
    console.error('✗ Test 2: E2E OCR Error propagation - FAIL (Did not throw)');
    process.exit(1);
  } catch (err: any) {
    assert(err instanceof Error, 'Throws standard Error');
    assert(err.message.includes('OCR service failure'), 'Error message is mapped and wrapped cleanly');
    console.log('✓ Test 2: E2E OCR Error propagation and wrapping - PASS');
  }

  console.log('All Tesseract OCR Integration tests passed successfully!');
  
  // Exit cleanly
  process.exit(0);
}

runTests();
