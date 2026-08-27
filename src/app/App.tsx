import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from '../features/session/hooks/useSession.ts';
import { useCaptures } from '../features/capture/hooks/useCaptures.ts';
import type { CapturePreview } from '../features/capture/hooks/useCaptures.ts';
import { usePdfExporter } from '../features/pdf/hooks/usePdfExporter.ts';
import { NewSessionView } from '../features/session/components/NewSessionView.tsx';
import { ActiveSessionView } from '../features/session/components/ActiveSessionView.tsx';
import { LightboxPreview } from '../features/capture/components/LightboxPreview.tsx';
import { FloatingMascot } from '../features/capture/components/FloatingMascot.tsx';
import { useMessageBus } from './providers/MessageBusContext.tsx';

// ═══════════════════════════════════════════════
//  HEADER MASCOT (SVG with blink + pupil tracking)
//  Matches original content.js L344-366
// ═══════════════════════════════════════════════

const MascotLogo: React.FC = () => {
  const leftEyeRef = useRef<SVGEllipseElement>(null);
  const rightEyeRef = useRef<SVGEllipseElement>(null);
  const leftPupilRef = useRef<SVGCircleElement>(null);
  const rightPupilRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let blinkTimer: ReturnType<typeof setTimeout>;
    const blink = () => {
      const leftEye = leftEyeRef.current;
      const rightEye = rightEyeRef.current;
      const leftPupil = leftPupilRef.current;
      const rightPupil = rightPupilRef.current;

      if (leftEye && rightEye && leftPupil && rightPupil) {
        leftEye.style.transform = 'scaleY(0.1)';
        rightEye.style.transform = 'scaleY(0.1)';
        leftPupil.style.opacity = '0';
        rightPupil.style.opacity = '0';

        setTimeout(() => {
          leftEye.style.transform = 'scaleY(1)';
          rightEye.style.transform = 'scaleY(1)';
          leftPupil.style.opacity = '1';
          rightPupil.style.opacity = '1';
        }, 150);
      }

      const nextBlink = 2000 + Math.random() * 3000;
      blinkTimer = setTimeout(blink, nextBlink);
    };

    blinkTimer = setTimeout(blink, 1000);

    return () => {
      clearTimeout(blinkTimer);
    };
  }, []);

  return (
    <svg className="wsn-mascot" viewBox="0 0 40 40" width="40" height="40">
      <defs>
        <filter id="wsn-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
          <feOffset dx="0" dy="3" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.5" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Outer ring — original: fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.3" */}
      <circle className="wsn-mascot__outer-ring" cx="20" cy="20" r="16"
        fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.3" />
      {/* Face — original: fill="#000" stroke="#ffffff" stroke-width="1" */}
      <circle className="wsn-mascot__face" cx="20" cy="20" r="14.5"
        fill="#000" stroke="#ffffff" strokeWidth="1" filter="url(#wsn-shadow)" />
      {/* Eyes — original: fill="white" */}
      <ellipse ref={leftEyeRef} className="wsn-mascot__eye wsn-mascot__eye--left"
        cx="16" cy="18.5" rx="3" ry="3.5" fill="white"
        style={{ transformOrigin: '16px 18.5px', transition: 'transform 0.15s ease' }} />
      <ellipse ref={rightEyeRef} className="wsn-mascot__eye wsn-mascot__eye--right"
        cx="24" cy="18.5" rx="3" ry="3.5" fill="white"
        style={{ transformOrigin: '24px 18.5px', transition: 'transform 0.15s ease' }} />
      {/* Pupils — original: fill="#000" */}
      <circle ref={leftPupilRef} className="wsn-mascot__pupil wsn-mascot__pupil--left"
        cx="16" cy="18.5" r="1.3" fill="#000"
        style={{ transformOrigin: '16px 18.5px', transition: 'transform 0.06s linear, opacity 150ms ease' }} />
      <circle ref={rightPupilRef} className="wsn-mascot__pupil wsn-mascot__pupil--right"
        cx="24" cy="18.5" r="1.3" fill="#000"
        style={{ transformOrigin: '24px 18.5px', transition: 'transform 0.06s linear, opacity 150ms ease' }} />
    </svg>
  );
};

// ═══════════════════════════════════════════════
//  TOAST SYSTEM
//  Matches original content.js L1194-1210
// ═══════════════════════════════════════════════

interface ToastItem {
  id: number;
  message: string;
  variant: 'info' | 'success' | 'error' | 'warning';
  visible: boolean;
}

let toastIdCounter = 0;

const ToastContainer: React.FC<{ toasts: ToastItem[]; onRemove: (id: number) => void }> = ({ toasts, onRemove }) => {
  useEffect(() => {
    toasts.forEach(toast => {
      if (toast.visible) {
        const hideTimer = setTimeout(() => {
          onRemove(toast.id);
        }, 3000);
        return () => clearTimeout(hideTimer);
      }
    });
  }, [toasts, onRemove]);

  return (
    <div className="wsn-toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`wsn-toast wsn-toast--${toast.variant} ${toast.visible ? 'wsn-toast--visible' : ''}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════

export const App: React.FC = () => {
  const messageBus = useMessageBus();

  const {
    session,
    settings,
    loading: sessionLoading,
    error: sessionError,
    startSession,
    confirmOverwrite,
    endSession,
    setCaptureMode,
    isActivatedGlobally,
  } = useSession();

  const {
    captures,
    loading: capturesLoading,
    captureInProgress,
    error: captureError,
    deleteCapture,
    refreshCaptures,
  } = useCaptures();

  const {
    exportStatus,
    error: exportError,
    checkOcrStatus,
    exportPdf,
  } = usePdfExporter();

  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [overwriteSessionName, setOverwriteSessionName] = useState('');
  const [selectedCapture, setSelectedCapture] = useState<CapturePreview | null>(null);
  const [manualActivated, setManualActivated] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const isActivated = manualActivated;

  // Synchronize manual activation state from global active state
  useEffect(() => {
    if (isActivatedGlobally !== undefined) {
      setManualActivated(isActivatedGlobally);
    }
  }, [isActivatedGlobally]);

  // Reset manual activation when session ends (becomes null) so Snabby closes cleanly on all tabs
  // Removed this effect: we want the floating mascot to REMAIN visible when a session is deleted or exported!

  // Reset selected capture (lightbox) when panel is closed
  useEffect(() => {
    if (!panelOpen) {
      setSelectedCapture(null);
    }
  }, [panelOpen]);


  // Panel ref for display/opacity control matching original openPanel/closePanel
  const panelRef = useRef<HTMLDivElement>(null);

  // Toast helpers
  const showToast = useCallback((message: string, variant: ToastItem['variant'] = 'info') => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, variant, visible: false }]);
    // Make visible on next frame for CSS transition
    requestAnimationFrame(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t));
    });
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }, []);

  // Listen for ACTIVATION_CHANGED from service worker
  useEffect(() => {
    const unsub = messageBus.listen('ACTIVATION_CHANGED', (payload: any) => {
      const activeState = payload?.activated ?? false;
      setManualActivated(activeState);
      if (!activeState) {
        setPanelOpen(false);
      }
    });
    return () => { unsub(); };
  }, [messageBus]);

  // Listen for CAPTURE_COMPLETE to refresh captures
  useEffect(() => {
    const unsub = messageBus.listen('CAPTURE_COMPLETE', () => {
      if (panelOpen) {
        refreshCaptures();
      }
    });
    return () => { unsub(); };
  }, [messageBus, panelOpen, refreshCaptures]);

  // Listen for SHOW_TOAST from service worker
  useEffect(() => {
    const unsub = messageBus.listen('SHOW_TOAST', (payload: any) => {
      showToast(payload?.message || 'Notification', payload?.variant || 'info');
    });
    return () => { unsub(); };
  }, [messageBus, showToast]);

  const handleStartSession = async (name: string): Promise<boolean> => {
    const success = await startSession(name);
    if (success) {
      await refreshCaptures();
      closePanel(); // Close panel on session start
    }
    return success;
  };

  const handleShowOverwriteConfirm = (name: string) => {
    setOverwriteSessionName(name);
    setShowOverwriteModal(true);
  };

  const handleConfirmOverwrite = async () => {
    setShowOverwriteModal(false);
    await confirmOverwrite(overwriteSessionName);
    await refreshCaptures();
  };

  const handleEndSession = async () => {
    if (window.confirm('End session? Unsaved captures will be lost.')) {
      await endSession();
      await refreshCaptures();
      closePanel(); // Close panel on session end/delete
    }
  };

  const handleSelectCapture = (capture: CapturePreview) => {
    setSelectedCapture(capture);
  };

  const handleCloseLightbox = () => {
    setSelectedCapture(null);
  };

  const handleExportPdf = async (skipPendingOcr: boolean) => {
    if (session) {
      try {
        await exportPdf(session.name, skipPendingOcr);
        showToast('PDF downloaded successfully', 'success');
        closePanel(); // Close panel on PDF export
      } catch {
        showToast('PDF export failed', 'error');
      }
    }
  };

  // Panel close matching original closePanel() — hide after transition
  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const togglePanel = useCallback(() => {
    setPanelOpen(prev => !prev);
  }, []);

  if (!isActivated) {
    return (
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    );
  }

  return (
    <>
      {/* Floating mascot — always visible when activated */}
      <FloatingMascot onTogglePanel={togglePanel} />

      {/* Backdrop — click-catcher when panel is open */}
      {panelOpen && (
        <div className="wsn-backdrop" onClick={closePanel}></div>
      )}

      {/* Right-side panel */}
      <div
        ref={panelRef}
        className={`wsn-panel ${panelOpen ? 'wsn-panel--open' : ''}`}
      >
        {/* Header — matches original L343-370 */}
        <div className="wsn-panel__header">
          <div className="wsn-header-logo">
            <MascotLogo />
          </div>
          <span className="wsn-panel__title">Snabby</span>
          <button
            type="button"
            className="wsn-panel__close"
            onClick={closePanel}
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Panel body */}
        <div className="wsn-panel__body">
          {sessionLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <div className="wsn-spinner"></div>
            </div>
          ) : session ? (
            <ActiveSessionView
              session={session}
              captures={captures}
              captureLoading={capturesLoading}
              captureInProgress={captureInProgress}
              captureError={captureError}
              exportStatus={exportStatus}
              exportError={exportError}
              captureMode={settings.mode}
              onSetCaptureMode={setCaptureMode}
              onDeleteCapture={deleteCapture}
              onEndSession={handleEndSession}
              onExportPdf={handleExportPdf}
              onCheckOcrStatus={checkOcrStatus}
              onSelectCapture={handleSelectCapture}
            />
          ) : (
            <NewSessionView
              onStartSession={handleStartSession}
              onShowOverwriteConfirm={handleShowOverwriteConfirm}
              onSetCaptureMode={setCaptureMode}
              loading={sessionLoading}
              error={sessionError}
            />
          )}
        </div>

        {/* Overwrite confirmation modal — inside panel like original */}
        {showOverwriteModal && (
          <div className="wsn-modal-overlay" onClick={() => setShowOverwriteModal(false)}>
            <div className="wsn-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wsn-modal__title">Session Active</div>
              <p className="wsn-modal__text">
                A session is currently active.<br />
                Do you want to end the current session and start a new one?
              </p>
              <div className="wsn-modal__actions">
                <button
                  type="button"
                  className="wsn-btn--secondary"
                  onClick={() => setShowOverwriteModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="wsn-btn--primary-sm"
                  onClick={handleConfirmOverwrite}
                >
                  End & Start New
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox preview */}
      <LightboxPreview
        isOpen={selectedCapture !== null}
        capture={selectedCapture}
        captures={captures}
        onSelectCapture={handleSelectCapture}
        onClose={handleCloseLightbox}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
};
export default App;
