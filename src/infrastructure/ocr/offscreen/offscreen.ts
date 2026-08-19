import { TesseractWorker } from '../TesseractWorker.ts';

console.log('[Offscreen] Offscreen document script loaded and initialized.');

const tesseractWorker = new TesseractWorker();

// Message handler for service worker requests
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', {
    action: message?.action,
    target: message?.target,
    hasDataUrl: !!message?.dataUrl,
    dataUrlLength: message?.dataUrl?.length,
    senderId: sender?.id
  });

  if (!message || message.target !== 'offscreen') {
    console.log('[Offscreen] Ignoring message — not targeted at offscreen.');
    return false;
  }

  if (message.action === 'ping') {
    console.log('[Offscreen] Responding to ping.');
    sendResponse({ success: true, status: 'ready' });
    return false;
  }

  if (message.action === 'ocr') {
    const { dataUrl } = message;
    if (!dataUrl) {
      console.error('[Offscreen] OCR request missing dataUrl!');
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

    console.log(`[Offscreen] Starting OCR on dataUrl (length: ${dataUrl.length})...`);

    (async () => {
      try {
        const t0 = Date.now();
        // Load image to get actual dimensions
        const dimensions = await getImageDimensions(dataUrl);
        console.log(`[Offscreen] Image dimensions: ${dimensions.width}x${dimensions.height}`);

        // Run Tesseract OCR
        console.log('[Offscreen] Calling TesseractWorker.recognize()...');
        const ocrResult = await tesseractWorker.recognize(dataUrl);
        console.log(`[Offscreen] OCR done in ${Date.now() - t0}ms. Words: ${ocrResult.words?.length}, Text: ${ocrResult.text?.slice(0, 80)}`);

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
        console.error('[Offscreen] OCR ERROR:', errorMsg);
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

  console.warn('[Offscreen] Unrecognized action:', message.action);
  return false;
});

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
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
