import { TesseractWorker } from '../../../src/infrastructure/ocr/TesseractWorker.ts';
import { TesseractOCRAdapter } from '../../../src/infrastructure/ocr/TesseractOCRAdapter.ts';
import { ChromeMessageBus } from '../../../src/infrastructure/messaging/ChromeMessageBus.ts';
import type { ImageAsset } from '../../../src/domain/image/image.types.ts';
import type { ImageId } from '../../../src/domain/common/ids.ts';
import fs from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('Running OCR Text Selection & Bounding Box Extraction Unit Tests...');

  // Mock Chrome runtime for offscreen communication if not present
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

  await import('../../../src/infrastructure/ocr/offscreen/offscreen.ts');

  const testImagePath = 'node_modules/tesseract.js/docs/images/tesseract.png';
  if (!fs.existsSync(testImagePath)) {
    console.log('Skipping real image test — test image not found');
    return;
  }

  const imageBuffer = fs.readFileSync(testImagePath);
  const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  // Test 1: TesseractWorker directly extracts word bounding boxes with blocks: true
  const worker = new TesseractWorker();
  const workerRes = await worker.recognize(dataUrl);

  assert(Array.isArray(workerRes.words), 'workerRes.words must be an array');
  assert(workerRes.words.length > 0, `workerRes.words must contain words, got ${workerRes.words.length}`);
  const firstWord = workerRes.words[0];
  assert(typeof firstWord.text === 'string' && firstWord.text.length > 0, 'word must have non-empty text');
  assert(typeof firstWord.bbox === 'object', 'word must have bbox object');
  assert(firstWord.bbox.x1 > firstWord.bbox.x0, 'bbox x1 must be > x0');
  assert(firstWord.bbox.y1 > firstWord.bbox.y0, 'bbox y1 must be > y0');
  console.log('✓ Test 1: TesseractWorker extracts words from blocks with valid bboxes - PASS');
  await worker.terminate();

  // Test 2: Full adapter pipeline maps to OCRWord[] with x, y, width, height
  const messageBus = new ChromeMessageBus();
  const adapter = new TesseractOCRAdapter(messageBus);

  const mockImage: ImageAsset = {
    id: 'test-image-id' as unknown as ImageId,
    data: new Blob([imageBuffer], { type: 'image/png' }),
    width: 500,
    height: 500,
    mimeType: 'image/png',
    createdAt: Date.now()
  };

  const ocrResult = await adapter.process(mockImage);
  assert(ocrResult.words.length > 0, `OCRResult must contain words, got ${ocrResult.words.length}`);
  const mapped = ocrResult.words[0];
  assert(typeof mapped.boundingBox.x === 'number', 'boundingBox.x must be a number');
  assert(typeof mapped.boundingBox.y === 'number', 'boundingBox.y must be a number');
  assert(mapped.boundingBox.width > 0, 'boundingBox.width must be > 0');
  assert(mapped.boundingBox.height > 0, 'boundingBox.height must be > 0');
  console.log('✓ Test 2: TesseractOCRAdapter maps words into domain OCRResult with valid dimensions - PASS');

  console.log('All OCR Text Selection unit tests passed successfully!');
  process.exit(0);
}

runTests();
