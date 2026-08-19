import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '../../../domain/session/Session.ts';
import type { CapturePreview } from '../../capture/hooks/useCaptures.ts';
import { CaptureCard } from '../../capture/components/CaptureCard.tsx';
import type { ExportStatus } from '../../pdf/hooks/usePdfExporter.ts';

interface ActiveSessionViewProps {
  session: Session;
  captures: CapturePreview[];
  captureLoading: boolean;
  captureInProgress: boolean;
  captureError: string | null;
  exportStatus: ExportStatus;
  exportError: string | null;
  captureMode: 'VISIBLE' | 'REGION';
  onSetCaptureMode: (mode: 'VISIBLE' | 'REGION') => Promise<void>;
  onDeleteCapture: (id: string) => Promise<void>;
  onEndSession: () => Promise<void>;
  onExportPdf: (skipPendingOcr: boolean) => Promise<void>;
  onCheckOcrStatus: () => Promise<{ pendingCount: number; totalCount: number }>;
  onSelectCapture: (capture: CapturePreview) => void;
}

export const ActiveSessionView: React.FC<ActiveSessionViewProps> = ({
  session,
  captures,
  captureLoading,
  captureInProgress,
  captureError,
  exportStatus,
  exportError,
  captureMode,
  onSetCaptureMode,
  onDeleteCapture,
  onEndSession,
  onExportPdf,
  onCheckOcrStatus,
  onSelectCapture,
}) => {
  const [isDecisionOpen, setIsDecisionOpen] = useState(false);
  const [pendingOcrCount, setPendingOcrCount] = useState(0);
  const [ocrChoice, setOcrChoice] = useState<'fast' | 'wait'>('fast');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [captures]);

  const handleDownloadClick = async () => {
    if (exportStatus !== 'idle') return;
    const { pendingCount } = await onCheckOcrStatus();
    if (pendingCount > 0) {
      setPendingOcrCount(pendingCount);
      setIsDecisionOpen(true);
    } else {
      await onExportPdf(false);
    }
  };

  const getExportButtonText = () => {
    switch (exportStatus) {
      case 'generating': return 'Generating...';
      case 'downloading': return 'Downloading...';
      case 'completed': return 'Completed!';
      case 'failed': return 'Export Failed';
      default: return 'Download PDF';
    }
  };

  const handleDecisionDownload = () => {
    setIsDecisionOpen(false);
    if (ocrChoice === 'fast') {
      onExportPdf(true);
    } else {
      onExportPdf(false);
    }
  };

  const exportDisabled = captures.length === 0 || exportStatus !== 'idle' || captureInProgress;

  return (
    <div className="active-session-view">
      <div className="wsn-static-top">
        <div className="wsn-session-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="wsn-session-bar__info">
            <div className="wsn-session-bar__name">{session.name}</div>
            <div className="wsn-session-bar__count">{captures.length} captured</div>
          </div>

          {/* Mode Toggle Group - now next to Delete button */}
          <div className="wsn-toggle-group" style={{ marginRight: '4px', flexShrink: 0 }}>
            <button
              type="button"
              className={`wsn-toggle ${captureMode === 'VISIBLE' ? 'wsn-toggle--active' : ''}`}
              onClick={() => onSetCaptureMode('VISIBLE')}
              title="Full Screen"
              disabled={captureInProgress || exportStatus !== 'idle'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
            <button
              type="button"
              className={`wsn-toggle ${captureMode === 'REGION' ? 'wsn-toggle--active' : ''}`}
              onClick={() => onSetCaptureMode('REGION')}
              title="Crop Region"
              disabled={captureInProgress || exportStatus !== 'idle'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" /><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
              </svg>
            </button>
          </div>

          <button type="button" className="wsn-session-bar__delete" onClick={onEndSession} title="End session">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {(captureError || exportError) && (
        <div className="error-banner">{captureError || exportError}</div>
      )}

      <div className="wsn-scroll-area" ref={scrollRef}>
        <div className="wsn-preview-grid">
          {captureLoading ? (
            <div className="wsn-preview-empty">
              <div className="wsn-spinner" style={{ margin: '0 auto 10px' }}></div>
              <div className="wsn-preview-empty-text">Loading captures...</div>
            </div>
          ) : captures.length === 0 ? (
            <div className="wsn-preview-empty">
              <div className="wsn-preview-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <div className="wsn-preview-empty-text">No captures yet</div>
              <div className="wsn-preview-empty-hint">Ctrl + Shift + S</div>
            </div>
          ) : (
            captures.map((capture, index) => (
              <CaptureCard key={capture.id} capture={capture} index={index} onDelete={onDeleteCapture} onSelect={onSelectCapture} />
            ))
          )}
        </div>
      </div>

      <div className="wsn-footer">
        <button type="button" className="wsn-btn--download" onClick={handleDownloadClick} disabled={exportDisabled}>
          {getExportButtonText()}
        </button>
      </div>

      {isDecisionOpen && (
        <div className="wsn-modal-overlay" onClick={() => setIsDecisionOpen(false)}>
          <div className="wsn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wsn-modal__title">PDF Export Options</div>
            <p className="wsn-modal__text">{pendingOcrCount} image(s) are still being processed for text recognition (OCR).</p>
            <div className="wsn-ocr-options">
              <div
                className={`wsn-ocr-option ${ocrChoice === 'fast' ? 'wsn-ocr-option--selected' : ''}`}
                onClick={() => setOcrChoice('fast')}
              >
                <span className="wsn-radio-wrap">
                  <input
                    type="radio"
                    id="wsn-ocr-fast"
                    name="wsn-ocr-choice"
                    checked={ocrChoice === 'fast'}
                    onChange={() => setOcrChoice('fast')}
                  />
                  <span className="wsn-radio-indicator"></span>
                </span>
                <div className="wsn-ocr-option-text">
                  <label htmlFor="wsn-ocr-fast">Export now</label>
                  <div className="wsn-ocr-option-hint">Fastest. Some images may not have selectable/searchable text.</div>
                </div>
              </div>
              <div
                className={`wsn-ocr-option ${ocrChoice === 'wait' ? 'wsn-ocr-option--selected' : ''}`}
                onClick={() => setOcrChoice('wait')}
              >
                <span className="wsn-radio-wrap">
                  <input
                    type="radio"
                    id="wsn-ocr-wait"
                    name="wsn-ocr-choice"
                    checked={ocrChoice === 'wait'}
                    onChange={() => setOcrChoice('wait')}
                  />
                  <span className="wsn-radio-indicator"></span>
                </span>
                <div className="wsn-ocr-option-text">
                  <label htmlFor="wsn-ocr-wait">Wait for OCR to finish</label>
                  <div className="wsn-ocr-option-hint">Slower. All images will have OCR text. May take up to a minute.</div>
                </div>
              </div>
            </div>
            <div className="wsn-modal__actions">
              <button type="button" className="wsn-btn--primary-sm" onClick={handleDecisionDownload}>Download</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default ActiveSessionView;
