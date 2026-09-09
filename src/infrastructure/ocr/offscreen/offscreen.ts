import { TesseractWorker } from '../TesseractWorker.ts';
import {
  computeUpscaleFactor,
  scaleWordsBack,
  shouldInvertForOcr,
} from '../ocrPreprocess.ts';

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

interface PreprocessResult {
  /** data URL handed to Tesseract (may be upscaled / grayscaled / inverted) */
  processedDataUrl: string;
  /** authoritative width of the ORIGINAL image (OCR coordinate space) */
  width: number;
  /** authoritative height of the ORIGINAL image (OCR coordinate space) */
  height: number;
  /** factor the processed image was upscaled by; word boxes are divided back by this */
  scaleFactor: number;
  isInverted: boolean;
}

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

    // Authoritative dimensions come from the persisted ImageAsset (decoded once,
    // in the service worker's image processor). The offscreen canvas decode is
    // only used for pixel operations, never as the source of truth for size.
    const hintWidth = typeof message.srcWidth === 'number' && message.srcWidth > 0 ? message.srcWidth : 0;
    const hintHeight = typeof message.srcHeight === 'number' && message.srcHeight > 0 ? message.srcHeight : 0;

    console.log(`[Offscreen] Starting OCR on dataUrl (length: ${dataUrl.length}, hint: ${hintWidth}x${hintHeight})...`);

    (async () => {
      try {
        const t0 = Date.now();
        const pre = await preprocessImageForOCR(dataUrl, hintWidth, hintHeight);
        console.log(
          `[Offscreen] Image ${pre.width}x${pre.height}, upscale x${pre.scaleFactor}, dark-mode inverted: ${pre.isInverted}`
        );

        console.log('[Offscreen] Calling TesseractWorker.recognize()...');
        const ocrResult = await tesseractWorker.recognize(pre.processedDataUrl);

        // Divide word boxes back into the ORIGINAL image coordinate space.
        const words = scaleWordsBack(ocrResult.words, pre.scaleFactor);

        console.log(
          `[Offscreen] OCR done in ${Date.now() - t0}ms. Words: ${words?.length}, Text: ${ocrResult.text?.slice(0, 80)}`
        );

        sendResponse({
          success: true,
          text: ocrResult.text,
          confidence: ocrResult.confidence,
          words,
          imageWidth: pre.width,
          imageHeight: pre.height
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
 * Preprocesses a screenshot for Tesseract OCR.
 *
 * Steps (all coordinate-preserving once `scaleFactor` is divided back out):
 *   1. Decode the image on a canvas.
 *   2. Optionally upscale small images ~2x so text reaches Tesseract's
 *      preferred resolution (better recognition AND tighter word boxes).
 *   3. Convert to grayscale (Tesseract works in grayscale internally).
 *   4. If the page is predominantly dark (light text on dark ground), invert
 *      so the LSTM model sees the dark-on-light it was trained on.
 *
 * When no canvas/DOM is available (Node unit tests) the original data URL is
 * returned untouched with the caller-supplied dimensions.
 */
function preprocessImageForOCR(
  dataUrl: string,
  hintWidth: number,
  hintHeight: number,
): Promise<PreprocessResult> {
  return new Promise((resolve) => {
    const fallback = (w: number, h: number): PreprocessResult => ({
      processedDataUrl: dataUrl,
      width: w > 0 ? w : hintWidth,
      height: h > 0 ? h : hintHeight,
      scaleFactor: 1,
      isInverted: false,
    });

    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve(fallback(hintWidth, hintHeight));
      return;
    }

    const img = new Image();

    img.onerror = (err) => {
      console.warn('[Offscreen] Failed to load image for preprocessing:', err);
      resolve(fallback(hintWidth, hintHeight));
    };

    img.onload = () => {
      const naturalWidth = img.width;
      const naturalHeight = img.height;

      // Prefer the authoritative hint; fall back to the decoded natural size.
      const width = hintWidth > 0 ? hintWidth : naturalWidth;
      const height = hintHeight > 0 ? hintHeight : naturalHeight;

      if (width <= 0 || height <= 0) {
        resolve(fallback(naturalWidth, naturalHeight));
        return;
      }

      try {
        const scaleFactor = computeUpscaleFactor(width, height);
        const canvasWidth = Math.round(naturalWidth * scaleFactor);
        const canvasHeight = Math.round(naturalHeight * scaleFactor);

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(fallback(width, height));
          return;
        }

        if (scaleFactor !== 1) {
          ctx.imageSmoothingEnabled = true;
          try {
            ctx.imageSmoothingQuality = 'high';
          } catch {
            /* not all engines support this hint */
          }
        }
        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

        const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const d = imgData.data;

        // Sample mean luminance to decide whether to invert.
        const step = Math.max(1, Math.floor((canvasWidth * canvasHeight) / 20000));
        let totalLuma = 0;
        let count = 0;
        for (let i = 0; i < d.length; i += step * 4) {
          totalLuma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          count++;
        }
        const avgLuma = count > 0 ? totalLuma / count : 128;
        const invert = shouldInvertForOcr(avgLuma);

        // Single pass: grayscale (+ optional invert).
        for (let i = 0; i < d.length; i += 4) {
          let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (invert) g = 255 - g;
          d[i] = g;
          d[i + 1] = g;
          d[i + 2] = g;
        }
        ctx.putImageData(imgData, 0, 0);

        resolve({
          processedDataUrl: canvas.toDataURL('image/png'),
          width,
          height,
          scaleFactor,
          isInverted: invert,
        });
      } catch (err) {
        console.warn('[Offscreen] Preprocessing error, using raw image:', err);
        resolve(fallback(width, height));
      }
    };

    img.src = dataUrl;
  });
}
