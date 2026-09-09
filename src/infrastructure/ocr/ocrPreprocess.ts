/**
 * Pure helpers for the OCR image-preprocessing step.
 *
 * The DOM/canvas work lives in `offscreen.ts` (it needs `document`); this module
 * holds only the deterministic math so it can be unit-tested in Node.
 */

export interface WordBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RawOcrWord {
  text: string;
  confidence: number;
  bbox: WordBbox;
}

/**
 * How much to upscale a screenshot before handing it to Tesseract.
 *
 * Tesseract's LSTM model expects roughly 30px-tall text (~300 DPI). UI
 * screenshots taken at `devicePixelRatio = 1` are often half that, which
 * produces merged/split words and loose boxes. We upscale small images (and
 * only small ones — retina captures are already large enough) and then divide
 * the resulting coordinates back down so the stored OCR result stays in the
 * original image's coordinate space.
 *
 * The factor is capped at 2 to keep recognition time and memory bounded.
 */
export function computeUpscaleFactor(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const minDim = Math.min(width, height);
  if (minDim >= 1000) return 1;
  return 2;
}

/**
 * Divides raw Tesseract word bounding boxes (in the upscaled image's pixel
 * space) back into the original image's pixel space. Returns the input
 * unchanged when `factor <= 1`.
 */
export function scaleWordsBack<T extends { bbox?: WordBbox }>(words: T[], factor: number): T[] {
  if (!Array.isArray(words) || !(factor > 1)) return words;
  return words.map((w) => {
    if (!w || !w.bbox) return w;
    return {
      ...w,
      bbox: {
        x0: w.bbox.x0 / factor,
        y0: w.bbox.y0 / factor,
        x1: w.bbox.x1 / factor,
        y1: w.bbox.y1 / factor,
      },
    };
  });
}

/**
 * Decides whether an image should be colour-inverted for OCR based on its mean
 * relative luminance (0–255). Dark-mode screenshots (light text on a dark
 * ground) confuse Tesseract; inverting them restores dark-on-light without
 * touching geometry.
 */
export function shouldInvertForOcr(meanLuminance: number, threshold = 115): boolean {
  return Number.isFinite(meanLuminance) && meanLuminance < threshold;
}
