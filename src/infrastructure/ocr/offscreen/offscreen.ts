import { TesseractWorker } from '../TesseractWorker.ts';

console.log('[Offscreen] Offscreen document script loaded.');

const tesseractWorker = new TesseractWorker();

// Message handler for service worker requests
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message, 'from:', sender.id);
  
  if (!message || message.target !== 'offscreen') {
    return false;
  }

  if (message.action === 'ping') {
    sendResponse({ success: true, status: 'ready' });
    return false;
  }

  if (message.action === 'ocr') {
    const { dataUrl } = message;
    if (!dataUrl) {
      sendResponse({
        success: false,
        error: 'Missing dataUrl parameter for OCR',
        text: '',
        confidence: 0,
        words: [],
        imageWidth: 0,
        imageHeight: 0
      });
      return false;
    }

    // Process image dimensions and OCR asynchronously
    (async () => {
      try {
        // Load image to get actual dimensions
        const dimensions = await getImageDimensions(dataUrl);
        
        // Run OCR
        const ocrResult = await tesseractWorker.recognize(dataUrl);

        sendResponse({
          success: true,
          text: ocrResult.text,
          confidence: ocrResult.confidence,
          words: ocrResult.words,
          imageWidth: dimensions.width,
          imageHeight: dimensions.height
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        sendResponse({
          success: false,
          error: errorMsg,
          text: '',
          confidence: 0,
          words: [],
          imageWidth: 0,
          imageHeight: 0
        });
      }
    })();

    return true; // Keep message channel open for async response
  }

  return false;
});

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    // In Node test environment, Image is not defined, so fallback to safe mock
    if (typeof Image === 'undefined') {
      resolve({ width: 1920, height: 1080 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = (err) => {
      reject(new Error(`Failed to load image for dimension extraction: ${err}`));
    };
    img.src = dataUrl;
  });
}
