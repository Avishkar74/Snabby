import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from '../features/session/hooks/useSession.ts';
import { useCaptures } from '../features/capture/hooks/useCaptures.ts';
import type { PagePreview } from '../features/capture/hooks/useCaptures.ts';
import type { PageId } from '../domain/common/ids.ts';
import { usePdfExporter } from '../features/pdf/hooks/usePdfExporter.ts';
import { NewSessionView } from '../features/session/components/NewSessionView.tsx';
import { ActiveSessionView } from '../features/session/components/ActiveSessionView.tsx';
import { LightboxPreview } from '../features/capture/components/LightboxPreview.tsx';
import { PageEditor } from '../features/page-editor/index.ts';
import { FloatingMascot } from '../features/capture/components/FloatingMascot.tsx';
import { useMessageBus } from './providers/MessageBusContext.tsx';

import { MascotLogo } from '../shared/components/MascotLogo.tsx';

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
  const [selectedCapture, setSelectedCapture] = useState<PagePreview | null>(null);
  const [editingPageId, setEditingPageId] = useState<PageId | null>(null);
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

  const handleSelectCapture = (capture: PagePreview) => {
    setSelectedCapture(capture);
  };

  const handleEditCapture = (pageId: string) => {
    setEditingPageId(pageId as PageId);
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
      {panelOpen && !editingPageId && (
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
              onEditCapture={handleEditCapture}
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

      {/* Page Editor overlay */}
      <PageEditor
        pageId={editingPageId}
        onClose={() => setEditingPageId(null)}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
};
export default App;
