import React, { useMemo } from 'react';
import type { OCRWord } from '../../../domain/ocr/ocr.types.ts';
import {
  clusterOcrRegions,
  horizontalScalePercent,
  OCR_BOX_TO_FONT_SIZE_RATIO,
} from '../../../infrastructure/ocr/textLayerGeometry.ts';

export interface RenderedImageRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface OCRTextOverlayProps {
  words: OCRWord[];
  imageWidth: number;
  imageHeight: number;
  renderedRect: RenderedImageRect;
}

interface PositionedWord {
  text: string;
  /** left edge in rendered CSS px, relative to the region box */
  leftPx: number;
  /** top edge of the word span in rendered CSS px, relative to the region box */
  topPx: number;
  /** font size in rendered CSS px */
  fontSizePx: number;
  /**
   * Line-box height in rendered CSS px == the line pitch. The selection
   * highlight fills the line box, so matching the pitch makes highlights tile
   * like native browser text selection instead of leaving gaps between lines.
   */
  lineHeightPx: number;
  /** CSS transform: scaleX() factor that fits the glyph run to the OCR box width */
  scaleX: number;
}

interface PositionedRegion {
  /** region box in rendered CSS px, relative to the overlay origin */
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  words: PositionedWord[];
}

const OCR_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Ascent of a typical system sans-serif as a fraction of the representative
// glyph height (ascender-to-descender). Converts an OCR baseline into the CSS
// `top` of the word span (which the browser aligns near the glyph tops when
// `line-height: 1`).
const OCR_ASCENT_RATIO = 0.8;

// A single reused canvas context for text measurement. `measureText` gives the
// natural rendered width of a string, which we compare against the OCR box width
// to derive a per-word horizontal squeeze/stretch — the DOM equivalent of the
// PDF text layer's `Tz` operator.
let measureCtx: CanvasRenderingContext2D | null = null;
let measureCtxReady = false;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtxReady) return measureCtx;
  measureCtxReady = true;
  try {
    if (typeof document !== 'undefined') {
      measureCtx = document.createElement('canvas').getContext('2d');
    }
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

function measureTextWidth(text: string, fontSizePx: number): number {
  const ctx = getMeasureCtx();
  if (!ctx) return 0;
  ctx.font = `${fontSizePx}px ${OCR_FONT_STACK}`;
  return ctx.measureText(text).width;
}

/**
 * Renders a pixel-accurate selectable text overlay directly over the visible
 * rendered <img> element.
 *
 * Geometry is delegated to the shared `textLayerGeometry` module so it stays
 * identical to the searchable-PDF text layer:
 *   - Words are segmented into layout regions (columns / stacked blocks) and
 *     each region is rendered as its own container in reading order, so
 *     selecting part of one column never pulls in the neighbouring column.
 *   - Within a region, words are clustered into visual lines (ordered, spaced).
 *   - Font size comes from the line's representative glyph height, not the full
 *     bounding-box height.
 *   - Each word is squeezed/stretched horizontally (`transform: scaleX`) so its
 *     transparent glyph run covers exactly the same width as the OCR box —
 *     selection highlight tracks the screenshot instead of drifting.
 */
export const OCRTextOverlay: React.FC<OCRTextOverlayProps> = ({
  words,
  imageWidth,
  imageHeight,
  renderedRect,
}) => {
  const valid =
    Array.isArray(words) &&
    words.length > 0 &&
    typeof imageWidth === 'number' &&
    typeof imageHeight === 'number' &&
    imageWidth > 0 &&
    imageHeight > 0 &&
    renderedRect &&
    renderedRect.width > 0 &&
    renderedRect.height > 0;

  // Exact scale factors mapping source-image pixel space -> rendered CSS px.
  const scaleX = valid ? renderedRect.width / imageWidth : 1;
  const scaleY = valid ? renderedRect.height / imageHeight : 1;

  const regions = useMemo<PositionedRegion[]>(() => {
    if (!valid) return [];

    const geomRegions = clusterOcrRegions(words);
    const out: PositionedRegion[] = [];

    for (const region of geomRegions) {
      const regionLeftPx = region.left * scaleX;
      const regionTopPx = region.top * scaleY;
      const positioned: PositionedWord[] = [];
      const lines = region.lines;

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];

        // Line pitch (baseline-to-baseline) drives the selection highlight box.
        const prev = lines[li - 1];
        const next = lines[li + 1];
        const pitchSrc =
          next ? next.baselineFromTop - line.baselineFromTop
          : prev ? line.baselineFromTop - prev.baselineFromTop
          : line.fontHeight * 1.6;

        // Approximate font size from the tight OCR box, but never larger than
        // the line pitch (keeps adjacent lines' highlight boxes from overlapping).
        const emSrc = line.fontHeight / OCR_BOX_TO_FONT_SIZE_RATIO;
        const fontSizePx = Math.max(6, Math.min(emSrc, pitchSrc * 0.95) * scaleY);

        const lineHeightPx = Math.max(
          fontSizePx,
          Math.min(line.fontHeight * 2.6, Math.max(line.fontHeight, pitchSrc)) * scaleY,
        );

        // Place the span so its text baseline lands on the OCR baseline. With
        // line-height == pitch the glyph box is vertically centred in the line
        // box, so we back that half-leading out of `top`.
        const baselinePx = line.baselineFromTop * scaleY;
        const topPx =
          baselinePx -
          (lineHeightPx - fontSizePx) / 2 -
          fontSizePx * OCR_ASCENT_RATIO -
          regionTopPx;

        for (const word of line.words) {
          const text = `${word.text} `;
          const leftPx = word.x * scaleX - regionLeftPx;
          const boxWidthPx = Math.max(1, word.width * scaleX);
          const naturalPx = measureTextWidth(text, fontSizePx);
          const scale =
            naturalPx > 0
              ? horizontalScalePercent(boxWidthPx, naturalPx, 10, 1000) / 100
              : 1;

          positioned.push({ text, leftPx, topPx, fontSizePx, lineHeightPx, scaleX: scale });
        }
      }

      if (positioned.length === 0) continue;

      out.push({
        leftPx: regionLeftPx,
        topPx: regionTopPx,
        widthPx: Math.max(1, (region.right - region.left) * scaleX),
        heightPx: Math.max(1, (region.bottom - region.top) * scaleY),
        words: positioned,
      });
    }

    return out;
  }, [valid, words, scaleX, scaleY]);

  if (!valid || regions.length === 0) {
    return null;
  }

  return (
    <div
      className="wsn-ocr-overlay"
      style={{
        position: 'absolute',
        left: `${renderedRect.left}px`,
        top: `${renderedRect.top}px`,
        width: `${renderedRect.width}px`,
        height: `${renderedRect.height}px`,
        // The overlay itself lets clicks through to the image; only the word
        // spans capture pointer events, so bare image areas stay interactive.
        pointerEvents: 'none',
        overflow: 'hidden',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        zIndex: 5,
      }}
    >
      {regions.map((region, ri) => (
        <div
          key={ri}
          className="wsn-ocr-region"
          style={{
            position: 'absolute',
            left: `${region.leftPx}px`,
            top: `${region.topPx}px`,
            width: `${region.widthPx}px`,
            height: `${region.heightPx}px`,
            pointerEvents: 'none',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          {region.words.map((pw, wi) => (
            <span
              key={wi}
              className="wsn-ocr-word"
              title={pw.text}
              style={{
                position: 'absolute',
                left: `${pw.leftPx}px`,
                top: `${pw.topPx}px`,
                fontSize: `${pw.fontSizePx}px`,
                lineHeight: `${pw.lineHeightPx}px`,
                fontFamily: OCR_FONT_STACK,
                color: 'transparent',
                userSelect: 'text',
                WebkitUserSelect: 'text',
                pointerEvents: 'auto',
                whiteSpace: 'pre',
                cursor: 'text',
                display: 'inline-block',
                transform: `scaleX(${pw.scaleX})`,
                transformOrigin: 'left center',
              }}
            >
              {pw.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

export default OCRTextOverlay;
