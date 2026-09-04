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
  onEditPage?: (pageId: string) => void;
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
  onEditPage,
}) => {
  const messageBus = useMessageBus();
  const [ocrData, setOcrData] = useState<OCRResultData | null>(null);
  const [currentRenderedImageId, setCurrentRenderedImageId] = useState<string | null>(null);
  const [renderedRect, setRenderedRect] = useState<RenderedImageRect | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = capture ? captures.findIndex((c) => c.id === capture.id) : -1;
  const currentCapture = (currentIndex >= 0 ? captures[currentIndex] : null) ?? capture;

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

  const handleEdit = useCallback(() => {
    if (!currentCapture || !onEditPage) return;
    onClose();
    onEditPage(currentCapture.id);
  }, [currentCapture, onClose, onEditPage]);

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
        setCurrentRenderedImageId(res.data.currentRenderedImageId || null);
      } else {
        setOcrData(null);
        setCurrentRenderedImageId(null);
      }
    } catch {
      setOcrData(null);
      setCurrentRenderedImageId(null);
    }
  }, [messageBus]);

  // Listen to keyboard shortcuts (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!isOpen || !currentCapture) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        handleEdit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, currentCapture, handlePrev, handleNext, handleEdit, onClose]);

  // Query OCR on open / page change, and react to OCR_COMPLETED and SESSION_UPDATED broadcasts
  useEffect(() => {
    if (!isOpen || !currentCapture) {
      setOcrData(null);
      setCurrentRenderedImageId(null);
      setRenderedRect(null);
      return;
    }

    fetchOcr(currentCapture.id);

    const unsubOcrCompleted = messageBus.listen('OCR_COMPLETED', (payload: any) => {
      if (!payload || payload.pageId === currentCapture.id || payload.captureId === currentCapture.id) {
        fetchOcr(currentCapture.id);
      }
    });

    const unsubSessionUpdated = messageBus.listen('SESSION_UPDATED', () => {
      fetchOcr(currentCapture.id);
    });

    return () => {
      unsubOcrCompleted();
      unsubSessionUpdated();
    };
  }, [isOpen, currentCapture?.id, fetchOcr, messageBus]);

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
  }, [isOpen, currentCapture?.imageUrl, updateRenderedRect]);

  if (!isOpen || !currentCapture) {
    return null;
  }

  // Display OCR overlay only when status is COMPLETED, words are present,
  // and OCR belongs to the currently displayed rendered image.
  const activeRenderedImageId = currentRenderedImageId || currentCapture.effectiveRenderedImageId;
  const isMatchingOcr =
    ocrData !== null &&
    ocrData.status === 'COMPLETED' &&
    Array.isArray(ocrData.words) &&
    ocrData.words.length > 0 &&
    ocrData.imageWidth > 0 &&
    ocrData.imageHeight > 0 &&
    (
      ocrData.processedImageId && activeRenderedImageId
        ? ocrData.processedImageId === activeRenderedImageId
        : (!activeRenderedImageId || activeRenderedImageId === currentCapture.imageId)
    );

  return (
    <div className="wsn-lightbox" role="dialog" aria-modal="true">
      <div className="wsn-lightbox-backdrop" onClick={onClose}></div>
      <div className="wsn-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="wsn-lightbox-header">
          <div className="wsn-lightbox-header-title">
            Capture #{currentIndex + 1}{captures.length > 1 ? ` of ${captures.length}` : ''}
          </div>
          <div className="wsn-lightbox-controls">
            {onEditPage && (
              <button
                type="button"
                className="wsn-lightbox-edit-btn wsn-lightbox-edit"
                aria-label="Edit page"
                title="Edit page"
                onClick={handleEdit}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              className="wsn-lightbox-close-btn wsn-lightbox-close"
              aria-label="Close preview"
              title="Close preview"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        {currentCapture.imageUrl ? (
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
              src={currentCapture.imageUrl}
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
