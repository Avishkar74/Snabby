import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { PagePreview } from '../hooks/useCaptures.ts';
import { useMessageBus } from '../../../app/providers/MessageBusContext.tsx';
import { OCRTextOverlay, type RenderedImageRect } from './OCRTextOverlay.tsx';
import type { OCRWord } from '../../../domain/ocr/ocr.types.ts';

interface LightboxPreviewProps {
  isOpen: boolean;
  capture: PagePreview | null;
  captures: PagePreview[];
  onSelectCapture: (capture: PagePreview) => void;
  onClose: () => void;
}

interface OCRResultData {
  captureId: string;
  status: string;
  fullText: string;
  words: OCRWord[];
  imageWidth: number;
  imageHeight: number;
  processedImageId?: string;
}

export const LightboxPreview: React.FC<LightboxPreviewProps> = ({
  isOpen,
  capture,
  captures,
  onSelectCapture,
  onClose,
}) => {
  const messageBus = useMessageBus();
  const [ocrData, setOcrData] = useState<OCRResultData | null>(null);
  const [renderedRect, setRenderedRect] = useState<RenderedImageRect | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = capture ? captures.findIndex((c) => c.id === capture.id) : -1;

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onSelectCapture(captures[currentIndex - 1]);
    }
  }, [currentIndex, captures, onSelectCapture]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < captures.length - 1) {
      onSelectCapture(captures[currentIndex + 1]);
    }
  }, [currentIndex, captures, onSelectCapture]);

  // Fetch OCR result for the current page
  const fetchOcr = useCallback(async (pageId: string) => {
    try {
      const res = await messageBus.request<{
        success: boolean;
        data?: {
          ocrResult?: OCRResultData | null;
          currentRenderedImageId?: string | null;
        };
      }>({
        type: 'GET_PAGE_OCR',
        pageId,
      } as any);

      if (res && res.success && res.data) {
        setOcrData(res.data.ocrResult || null);
      } else {
        setOcrData(null);
      }
    } catch {
      setOcrData(null);
    }
  }, [messageBus]);

  // Listen to keyboard shortcuts (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!isOpen || !capture) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, capture, handlePrev, handleNext, onClose]);

  // Query OCR on open / page change, and react to OCR_COMPLETED broadcast
  useEffect(() => {
    if (!isOpen || !capture) {
      setOcrData(null);
      setRenderedRect(null);
      return;
    }

    fetchOcr(capture.id);

    const unsubOcrCompleted = messageBus.listen('OCR_COMPLETED', (payload: any) => {
      if (!payload || payload.pageId === capture.id || payload.captureId === capture.id) {
        fetchOcr(capture.id);
      }
    });

    return () => {
      unsubOcrCompleted();
    };
  }, [isOpen, capture?.id, fetchOcr, messageBus]);

  // Exact measurement of the visible rendered <img> element via getBoundingClientRect()
  const updateRenderedRect = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) {
      setRenderedRect(null);
      return;
    }
    const imgRect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (imgRect.width > 0 && imgRect.height > 0) {
      setRenderedRect({
        width: imgRect.width,
        height: imgRect.height,
        left: imgRect.left - containerRect.left,
        top: imgRect.top - containerRect.top,
      });
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !capture) return;

    updateRenderedRect();

    // Check after next paint cycle in case img layout is deferred
    const rafId = requestAnimationFrame(() => {
      updateRenderedRect();
    });

    const img = imgRef.current;
    let observer: ResizeObserver | null = null;
    if (img && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        updateRenderedRect();
      });
      observer.observe(img);
    }

    window.addEventListener('resize', updateRenderedRect);
    return () => {
      cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', updateRenderedRect);
    };
  }, [isOpen, capture?.imageUrl, updateRenderedRect]);

  if (!isOpen || !capture) {
    return null;
  }

  // Display OCR overlay when status is COMPLETED and words are present.
  const isMatchingOcr =
    ocrData !== null &&
    ocrData.status === 'COMPLETED' &&
    Array.isArray(ocrData.words) &&
    ocrData.words.length > 0 &&
    ocrData.imageWidth > 0 &&
    ocrData.imageHeight > 0;

  return (
    <div className="wsn-lightbox" role="dialog" aria-modal="true">
      <div className="wsn-lightbox-backdrop" onClick={onClose}></div>
      <div className="wsn-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="wsn-lightbox-close"
          aria-label="Close preview"
          onClick={onClose}
        >
          ×
        </button>
        {capture.imageUrl ? (
          <div
            ref={containerRef}
            className="wsn-lightbox-img-wrapper"
            style={{
              position: 'relative',
              display: 'inline-block',
              maxWidth: '100%',
              maxHeight: 'calc(90vh - 80px)',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
          >
            <img
              ref={imgRef}
              className="wsn-lightbox-img"
              src={capture.imageUrl}
              alt={`Capture #${currentIndex + 1}`}
              draggable={false}
              onLoad={updateRenderedRect}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: 'calc(90vh - 80px)',
                objectFit: 'contain',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                pointerEvents: 'none',
              }}
            />
            {isMatchingOcr && renderedRect && (
              <OCRTextOverlay
                words={ocrData.words}
                imageWidth={ocrData.imageWidth}
                imageHeight={ocrData.imageHeight}
                renderedRect={renderedRect}
              />
            )}
          </div>
        ) : (
          <div style={{ color: 'white' }}>No Image Data</div>
        )}
        <div className="wsn-lightbox-caption">
          #{currentIndex + 1} · Capture #{currentIndex + 1}
        </div>
        {captures.length > 1 && (
          <>
            <button
              type="button"
              className="wsn-lightbox-nav wsn-lightbox-prev"
              aria-label="Previous image"
              onClick={handlePrev}
              disabled={currentIndex === 0}
            >
              ‹
            </button>
            <button
              type="button"
              className="wsn-lightbox-nav wsn-lightbox-next"
              aria-label="Next image"
              onClick={handleNext}
              disabled={currentIndex === captures.length - 1}
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default LightboxPreview;
