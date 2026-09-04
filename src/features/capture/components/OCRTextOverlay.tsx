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
 * SRP: Renders a pixel-accurate selectable text overlay directly over the visible rendered
 * <img> element according to the Critical OCR/Image Alignment Contract.
 * Groups words into visual lines and sorts strictly left-to-right within each line,
 * guaranteeing seamless reading order and unbroken DOM drag-selection across sentences.
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

  // Exact scale factors mapping original image pixel space to currently rendered image pixel space
  const scaleX = renderedRect.width / imageWidth;
  const scaleY = renderedRect.height / imageHeight;

  // Group words into visual lines and sort strictly left-to-right within each line,
  // then top-to-bottom across lines. This guarantees seamless reading and DOM selection order.
  const positionedWords = useMemo(() => {
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

    // Sort by vertical center initially
    const sortedByMidY = [...valid].sort((a, b) => {
      const aMid = a.boundingBox.y + a.boundingBox.height / 2;
      const bMid = b.boundingBox.y + b.boundingBox.height / 2;
      return aMid - bMid;
    });

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
        const tol = Math.min(box.height, lineH) * 0.55;
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

    // Sort lines top-to-bottom
    lines.sort((a, b) => a.minY - b.minY);

    // Sort words in each line strictly left-to-right (x ascending)
    const result: PositionedWord[] = [];
    for (const line of lines) {
      line.words.sort((a, b) => a.boundingBox.x - b.boundingBox.x);

      // Unified vertical line geometry for all words on this visual line
      const lineTopPx = line.minY * scaleY;
      const lineHPx = Math.max((line.maxY - line.minY) * scaleY, 2);
      const fontSizePx = Math.max(9, Math.round(lineHPx * 0.85));

      for (let i = 0; i < line.words.length; i++) {
        const word = line.words[i];
        const nextWord = line.words[i + 1];
        const box = word.boundingBox;

        const xPx = box.x * scaleX;
        const rawW = box.width * scaleX;

        // Bridge inter-word gaps on the same line so mouse selection doesn't drop spaces
        let wPx = Math.max(rawW, 2);
        if (nextWord) {
          const nextXPx = nextWord.boundingBox.x * scaleX;
          const distanceToNext = nextXPx - xPx;
          // Only bridge if gap is reasonable (less than 3x line height)
          if (distanceToNext > rawW && distanceToNext <= rawW + lineHPx * 3) {
            wPx = distanceToNext;
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

