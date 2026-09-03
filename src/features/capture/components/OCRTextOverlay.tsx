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

/**
 * SRP: Renders a pixel-accurate selectable text overlay directly over the visible rendered
 * <img> element according to the Critical OCR/Image Alignment Contract.
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

  // Sort words into DOM reading order (top-to-bottom, then left-to-right)
  // so native clipboard copying retains sensible line and word ordering
  const orderedWords = useMemo(() => {
    return [...words].sort((a, b) => {
      const aBox = a?.boundingBox;
      const bBox = b?.boundingBox;
      if (!aBox || !bBox) return 0;

      // Group into approximate visual lines based on vertical overlap
      const lineTolerance = Math.min(aBox.height, bBox.height) * 0.5;
      if (Math.abs(aBox.y - bBox.y) > lineTolerance) {
        return aBox.y - bBox.y;
      }
      return aBox.x - bBox.x;
    });
  }, [words]);

  // Exact scale factors mapping original image pixel space to currently rendered image pixel space
  const scaleX = renderedRect.width / imageWidth;
  const scaleY = renderedRect.height / imageHeight;

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
      {orderedWords.map((word, idx) => {
        if (!word || typeof word !== 'object') return null;

        const box = word.boundingBox;
        if (!box || typeof box.x !== 'number' || typeof box.y !== 'number') {
          return null;
        }

        const rawWidth = typeof box.width === 'number' ? box.width : 0;
        const rawHeight = typeof box.height === 'number' ? box.height : 0;
        if (rawWidth <= 0 || rawHeight <= 0) return null;

        const text = typeof word.text === 'string' ? word.text : String(word.text || '');
        if (!text) return null;

        // Visual coordinates preserve the exact word bounding box
        const xPx = box.x * scaleX;
        const yPx = box.y * scaleY;
        const wPx = Math.max(rawWidth * scaleX, 2);
        const hPx = Math.max(rawHeight * scaleY, 2);
        const fontSizePx = Math.max(8, Math.round(hPx * 0.88));

        return (
          <span
            key={idx}
            className="wsn-ocr-word"
            title={text}
            style={{
              position: 'absolute',
              left: `${xPx}px`,
              top: `${yPx}px`,
              width: `${wPx}px`,
              height: `${hPx}px`,
              fontSize: `${fontSizePx}px`,
              lineHeight: `${hPx}px`,
              fontFamily: 'monospace, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              color: 'transparent',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              pointerEvents: 'auto',
              whiteSpace: 'pre',
              overflow: 'hidden',
              cursor: 'text',
              display: 'inline-block',
            }}
          >
            {text + ' '}
          </span>
        );
      })}
    </div>
  );
};

export default OCRTextOverlay;
