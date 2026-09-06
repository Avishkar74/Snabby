import React, { useMemo } from 'react';
import type { OCRWord } from '../../../domain/ocr/ocr.types.ts';

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
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  fontSizePx: number;
  hasTrailingSpace: boolean;
}

/**
 * Renders a pixel-accurate selectable text overlay directly over the visible rendered
 * <img> element according to the Critical OCR/Image Alignment Contract.
 *
 * === Coordinate Mapping (proven identical model to PDF) ===
 *
 * OCR bounding boxes are in original image pixel space (top-left origin):
 *   word at (x, y, w, h) in an image of (imageWidth × imageHeight)
 *
 * The img element is measured via getBoundingClientRect() which gives the
 * actual rendered pixel rect (display: block, no letterboxing since the img
 * element itself sizes to fit its content without extra dead space).
 *
 * Scale factors:
 *   scaleX = renderedRect.width  / imageWidth
 *   scaleY = renderedRect.height / imageHeight
 *
 * Mapped position in rendered space (overlay div origin = img element top-left):
 *   left   = word.x * scaleX
 *   top    = word.y * scaleY         ← same direction (both top-down)
 *   width  = word.w * scaleX
 *   height = word.h * scaleY
 *
 * Font size = word.h * scaleY  (same as PDF: font size = OCR box height * scale)
 * Line height = height (= word.h * scaleY) so text is vertically centred in the box.
 *
 * Groups words into visual lines so DOM drag-selection spans full sentences.
 */
export const OCRTextOverlay: React.FC<OCRTextOverlayProps> = ({
  words,
  imageWidth,
  imageHeight,
  renderedRect,
}) => {
  // Defensive validation of OCR data and rendered dimensions
  if (
    !Array.isArray(words) ||
    words.length === 0 ||
    typeof imageWidth !== 'number' ||
    typeof imageHeight !== 'number' ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    !renderedRect ||
    renderedRect.width <= 0 ||
    renderedRect.height <= 0
  ) {
    return null;
  }

  // Exact scale factors mapping original image pixel space → rendered pixel space.
  // These match the PDF coordinate model: OCR coords / image natural size * rendered size.
  const scaleX = renderedRect.width / imageWidth;
  const scaleY = renderedRect.height / imageHeight;

  const positionedWords = useMemo(() => {
    // 1. Filter valid words with positive-area bounding boxes
    const valid = words.filter((w) => {
      if (!w || typeof w !== 'object') return false;
      const box = w.boundingBox;
      if (!box || typeof box.x !== 'number' || typeof box.y !== 'number') return false;
      const rw = typeof box.width === 'number' ? box.width : 0;
      const rh = typeof box.height === 'number' ? box.height : 0;
      if (rw <= 0 || rh <= 0) return false;
      const t = typeof w.text === 'string' ? w.text.trim() : String(w.text || '').trim();
      return t.length > 0;
    });

    // 2. Sort by vertical midpoint for line grouping
    const sortedByMidY = [...valid].sort((a, b) => {
      const aMid = a.boundingBox.y + a.boundingBox.height / 2;
      const bMid = b.boundingBox.y + b.boundingBox.height / 2;
      return aMid - bMid;
    });

    // 3. Cluster words into visual lines using midpoint proximity.
    //    Tolerance = 50% of the smaller height of the word or current line height.
    interface LineCluster {
      minY: number;
      maxY: number;
      words: typeof valid;
    }
    const lines: LineCluster[] = [];

    for (const word of sortedByMidY) {
      const box = word.boundingBox;
      const wMidY = box.y + box.height / 2;
      let targetLine: LineCluster | null = null;

      for (const line of lines) {
        const lineMidY = (line.minY + line.maxY) / 2;
        const lineH = line.maxY - line.minY;
        const tol = Math.min(box.height, lineH) * 0.5;
        if (Math.abs(wMidY - lineMidY) <= tol) {
          targetLine = line;
          break;
        }
      }

      if (targetLine) {
        targetLine.words.push(word);
        targetLine.minY = Math.min(targetLine.minY, box.y);
        targetLine.maxY = Math.max(targetLine.maxY, box.y + box.height);
      } else {
        lines.push({
          minY: box.y,
          maxY: box.y + box.height,
          words: [word],
        });
      }
    }

    // 4. Sort lines top-to-bottom
    lines.sort((a, b) => a.minY - b.minY);

    // 5. For each line, sort words left-to-right and compute positions
    const result: PositionedWord[] = [];
    for (const line of lines) {
      line.words.sort((a, b) => a.boundingBox.x - b.boundingBox.x);

      // Unified line vertical geometry in rendered pixel space.
      // Use the exact OCR box extents — same formula as PDF coordinate mapping.
      const lineTopPx = line.minY * scaleY;
      const lineHPx = Math.max(1, (line.maxY - line.minY) * scaleY);

      // Font size = line height in rendered space.
      // This is the same invariant as the PDF text layer: fontSize = OCR box height * scale.
      // CSS lineHeight = height keeps the text vertically centered in the span box.
      const fontSizePx = lineHPx;

      for (let i = 0; i < line.words.length; i++) {
        const word = line.words[i];
        const nextWord = line.words[i + 1];
        const box = word.boundingBox;

        // Word left position in rendered space
        const xPx = box.x * scaleX;
        const rawW = box.width * scaleX;

        // Bridge inter-word gaps so mouse drag-selection doesn't fall through spaces.
        // Only bridge if the gap is < 2x the line height (prevents overreaching).
        let wPx = Math.max(rawW, 1);
        if (nextWord) {
          const nextXPx = nextWord.boundingBox.x * scaleX;
          const gap = nextXPx - (xPx + rawW);
          if (gap > 0 && gap <= lineHPx * 2) {
            wPx = nextXPx - xPx;
          }
        }

        const text = typeof word.text === 'string' ? word.text : String(word.text || '');

        result.push({
          text,
          xPx,
          yPx: lineTopPx,
          wPx,
          hPx: lineHPx,
          fontSizePx,
          hasTrailingSpace: !!nextWord,
        });
      }
    }

    return result;
  }, [words, scaleX, scaleY]);

  return (
    <div
      className="wsn-ocr-overlay"
      style={{
        position: 'absolute',
        left: `${renderedRect.left}px`,
        top: `${renderedRect.top}px`,
        width: `${renderedRect.width}px`,
        height: `${renderedRect.height}px`,
        pointerEvents: 'auto',
        overflow: 'hidden',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        cursor: 'text',
        zIndex: 5,
      }}
    >
      {positionedWords.map((pw, idx) => (
        <span
          key={idx}
          className="wsn-ocr-word"
          title={pw.text}
          style={{
            position: 'absolute',
            left: `${pw.xPx}px`,
            top: `${pw.yPx}px`,
            width: `${pw.wPx}px`,
            height: `${pw.hPx}px`,
            // Font size = line height in rendered space, matching the PDF text-layer invariant.
            // CSS lineHeight = height vertically centres the text in the span box.
            fontSize: `${pw.fontSizePx}px`,
            lineHeight: `${pw.hPx}px`,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: 'transparent',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            pointerEvents: 'auto',
            whiteSpace: 'pre',
            cursor: 'text',
            display: 'inline-block',
          }}
        >
          {pw.text + (pw.hasTrailingSpace ? ' ' : '')}
        </span>
      ))}
    </div>
  );
};

export default OCRTextOverlay;
