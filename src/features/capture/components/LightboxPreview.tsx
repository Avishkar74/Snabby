import React, { useEffect } from 'react';
import type { PagePreview } from '../hooks/useCaptures.ts';

interface LightboxPreviewProps {
  isOpen: boolean;
  capture: PagePreview | null;
  captures: PagePreview[];
  onSelectCapture: (capture: PagePreview) => void;
  onClose: () => void;
}

export const LightboxPreview: React.FC<LightboxPreviewProps> = ({
  isOpen,
  capture,
  captures,
  onSelectCapture,
  onClose,
}) => {
  if (!isOpen || !capture) {
    return null;
  }

  const currentIndex = captures.findIndex((c) => c.id === capture.id);

  const handlePrev = () => {
    if (currentIndex > 0) {
      onSelectCapture(captures[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (currentIndex < captures.length - 1) {
      onSelectCapture(captures[currentIndex + 1]);
    }
  };

  useEffect(() => {
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
  }, [currentIndex, captures]);

  return (
    <div className="wsn-lightbox" role="dialog" aria-modal="true">
      <div className="wsn-lightbox-backdrop" onClick={onClose}></div>
      <div className="wsn-lightbox-dialog">
        <button
          type="button"
          className="wsn-lightbox-close"
          aria-label="Close preview"
          onClick={onClose}
        >
          ×
        </button>
        {capture.imageUrl ? (
          <img
            className="wsn-lightbox-img"
            src={capture.imageUrl}
            alt={`Capture #${currentIndex + 1}`}
          />
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
