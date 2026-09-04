import { TesseractWorker } from '../TesseractWorker.ts';

console.log('[Offscreen] Offscreen document script loaded and initialized.');

// Suppress benign internal Tesseract WASM stderr notices like "Image too small to scale" or "Line cannot be recognized"
if (typeof console !== 'undefined' && console.error) {
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const firstArg = typeof args[0] === 'string' ? args[0] : '';
    if (
      firstArg.includes('Image too small to scale') ||
      firstArg.includes('Line cannot be recognized')
    ) {
      console.warn('[Offscreen Tesseract Notice]:', ...args);
      return;
    }
    originalConsoleError(...args);
  };
}

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
        // Preprocess image: detect dark-mode background and invert if necessary
        const { processedDataUrl, width, height, isInverted } = await preprocessImageForOCR(dataUrl);
        console.log(`[Offscreen] Image dimensions: ${width}x${height}, dark-mode inverted: ${isInverted}`);

        // Run Tesseract OCR on the optimal contrast image
        console.log('[Offscreen] Calling TesseractWorker.recognize()...');
        const ocrResult = await tesseractWorker.recognize(processedDataUrl);
        console.log(`[Offscreen] OCR done in ${Date.now() - t0}ms. Words: ${ocrResult.words?.length}, Text: ${ocrResult.text?.slice(0, 80)}`);

        sendResponse({
          success: true,
          text: ocrResult.text,
          confidence: ocrResult.confidence,
          words: ocrResult.words,
          imageWidth: width,
          imageHeight: height
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

/**
 * Preprocesses screenshot for Tesseract OCR.
 * Tesseract's LSTM model was trained on black text on white paper.
 * On dark mode pages (like GitHub, VS Code, dark themes), light text on dark backgrounds
 * suffers from severely degraded accuracy, missed words, and border errors.
 * Inverting dark images makes text dark-on-white without altering coordinate geometry.
 */
function preprocessImageForOCR(dataUrl: string): Promise<{
  processedDataUrl: string;
  width: number;
  height: number;
  isInverted: boolean;
}> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve({ processedDataUrl: dataUrl, width: 1920, height: 1080, isInverted: false });
      return;
    }

    const img = new Image();
    img.onload = () => {
      const width = img.width;
      const height = img.height;

      if (width <= 0 || height <= 0) {
        resolve({ processedDataUrl: dataUrl, width: 1920, height: 1080, isInverted: false });
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve({ processedDataUrl: dataUrl, width, height, isInverted: false });
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, width, height);
        const d = imgData.data;

        // Sample relative luminance across the screenshot
        const step = Math.max(1, Math.floor((width * height) / 20000));
        let totalLuma = 0;
        let count = 0;
        for (let i = 0; i < d.length; i += step * 4) {
          totalLuma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          count++;
        }
        const avgLuma = count > 0 ? totalLuma / count : 128;

        // If overall background is dark (average luminance < 115), invert colors
        if (avgLuma < 115) {
          for (let i = 0; i < d.length; i += 4) {
            d[i] = 255 - d[i];         // R
            d[i + 1] = 255 - d[i + 1]; // G
            d[i + 2] = 255 - d[i + 2]; // B
          }
          ctx.putImageData(imgData, 0, 0);
          resolve({
            processedDataUrl: canvas.toDataURL('image/png'),
            width,
            height,
            isInverted: true,
          });
          return;
        }

        resolve({ processedDataUrl: dataUrl, width, height, isInverted: false });
      } catch (err) {
        console.warn('[Offscreen] Preprocessing error, using raw image:', err);
        resolve({ processedDataUrl: dataUrl, width, height, isInverted: false });
      }
    };

    img.onerror = (err) => {
      console.warn('[Offscreen] Failed to load image for preprocessing:', err);
      resolve({ processedDataUrl: dataUrl, width: 0, height: 0, isInverted: false });
    };

    img.src = dataUrl;
  });
}

