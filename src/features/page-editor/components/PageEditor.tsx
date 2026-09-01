import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { FileId } from '@excalidraw/excalidraw/element/types';
import { useMessageBus } from '../../../app/providers/MessageBusContext.tsx';
import type { PageEditorProps } from '../types/pageEditor.types.ts';
import { MascotLogo } from '../../../shared/components/MascotLogo.tsx';

interface PageImageData {
  pageId: string;
  imageId: string;
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
}

export const PageEditor: React.FC<PageEditorProps> = ({ pageId, onClose }) => {
  const messageBus = useMessageBus();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  // Stable refs for API, active page ID, and initialization tracking
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const activePageIdRef = useRef<string | null>(pageId);
  const initializedPageIdRef = useRef<string | null>(null);
  const pendingImageDataRef = useRef<PageImageData | null>(null);

  // Helper to populate scene ONCE when image data and API are ready
  const populateScene = useCallback((api: ExcalidrawImperativeAPI, imgData: PageImageData) => {
    try {
      const fileId = `img_${imgData.pageId}` as FileId;

      // 1. Add image file to Excalidraw's internal file cache
      api.addFiles([
        {
          id: fileId,
          dataURL: imgData.dataUrl as any,
          mimeType: imgData.mimeType as any,
          created: Date.now(),
        },
      ]);

      // 2. Create Bounded Screenshot Image Element locked at origin (0, 0)
      const imageElementId = `image_${imgData.pageId}`;
      const elements = convertToExcalidrawElements([
        {
          type: 'image',
          id: imageElementId as any,
          x: 0,
          y: 0,
          width: imgData.width,
          height: imgData.height,
          fileId,
          status: 'saved',
          locked: true,
        },
      ]);

      // 3. Populate scene with screenshot & set dark canvas background
      api.updateScene({
        elements,
        appState: {
          viewBackgroundColor: '#0e0e10',
        },
      });

      // 4. Fit viewport cleanly to screenshot (natively centers screenshot in middle of modal canvas)
      setTimeout(() => {
        try {
          api.scrollToContent(elements, {
            fitToViewport: true,
            viewportZoomFactor: 0.85,
            animate: false,
          });
        } catch (e) {
          // ignore if unmounted
        }
      }, 50);
    } catch (err) {
      console.error('[PageEditor] Failed to populate scene:', err);
      setError('Failed to display screenshot on canvas');
    }
  }, []);

  // Excalidraw API callback handler
  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawAPIRef.current = api;

      // If there is pending image data waiting for the API, populate scene now
      if (
        pendingImageDataRef.current &&
        pendingImageDataRef.current.pageId === activePageIdRef.current &&
        initializedPageIdRef.current === activePageIdRef.current
      ) {
        populateScene(api, pendingImageDataRef.current);
        pendingImageDataRef.current = null;
      }
    },
    [populateScene]
  );

  // Main page load effect: runs ONLY when pageId changes
  useEffect(() => {
    activePageIdRef.current = pageId;

    if (!pageId) {
      initializedPageIdRef.current = null;
      pendingImageDataRef.current = null;
      setDimensions(null);
      setLoading(false);
      setError(null);
      return;
    }

    // CRITICAL: If this page has ALREADY been initialized, do NOT re-run initialization!
    if (initializedPageIdRef.current === pageId) {
      return;
    }

    let cancelled = false;

    const loadPage = async () => {
      setLoading(true);
      setError(null);
      setDimensions(null);

      // Clear previous scene if API is ready
      if (excalidrawAPIRef.current) {
        try {
          excalidrawAPIRef.current.resetScene();
        } catch (e) {
          console.debug('[PageEditor] Error resetting scene:', e);
        }
      }

      try {
        const response = await messageBus.request<{
          success: boolean;
          data?: PageImageData;
          error?: { message: string };
        }>({
          type: 'GET_PAGE_EDITOR_IMAGE',
          pageId,
        } as any);

        if (cancelled || activePageIdRef.current !== pageId) {
          return;
        }

        if (response.success && response.data) {
          const imgData = response.data;
          initializedPageIdRef.current = pageId;
          setDimensions({ width: imgData.width, height: imgData.height });

          if (excalidrawAPIRef.current) {
            populateScene(excalidrawAPIRef.current, imgData);
            pendingImageDataRef.current = null;
          } else {
            pendingImageDataRef.current = imgData;
          }

          setLoading(false);
        } else {
          setError(response.error?.message || 'Failed to load page screenshot');
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled && activePageIdRef.current === pageId) {
          setError(err?.message || String(err));
          setLoading(false);
        }
      }
    };

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [pageId, messageBus, populateScene]);

  // Handle ESC key press to close editor modal cleanly
  useEffect(() => {
    if (!pageId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pageId, onClose]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!pageId) {
    return null;
  }

  // 1. Calculate modal container width dynamically to eliminate excessive empty space on the right while preserving space on the left for side panels
const containerWidth = dimensions
  ? Math.min(window.innerWidth * 0.82, Math.max(760, dimensions.width + 200))
  : 'min(82vw, 1050px)';

  return (
    <div
      className="wsn-editor-overlay"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 2147483647,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="wsn-editor-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: typeof containerWidth === 'number' ? `${containerWidth}px` : containerWidth,
          height: 'min(95vh, 950px)',
          maxWidth: '92vw',
          maxHeight: '94vh',
          backgroundColor: '#000000',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* CSS Rules:
            1. Suppress Excalidraw internal toast overlays
            2. Hide Library button in toolbar
            3. Hide floating question-mark/help icon in bottom right */}
        <style>{`
          .wsn-editor-modal .excalidraw .toast,
          .wsn-editor-modal .excalidraw .hint-container {
            display: none !important;
          }
          .wsn-editor-modal .excalidraw label[title*="Library"],
          .wsn-editor-modal .excalidraw button[title*="Library"],
          .wsn-editor-modal .excalidraw [data-testid="toolbar-library"],
          .wsn-editor-modal .excalidraw .library-button,
          .wsn-editor-modal .excalidraw .sidebar-trigger {
            display: none !important;
          }
          .wsn-editor-modal .excalidraw .help-icon,
          .wsn-editor-modal .excalidraw button[aria-label*="Help"],
          .wsn-editor-modal .excalidraw button[title*="Help"],
          .wsn-editor-modal .excalidraw button[title*="Shortcuts"],
          .wsn-editor-modal .excalidraw .footer-center,
          .wsn-editor-modal .excalidraw .encrypted-icon {
            display: none !important;
          }
        `}</style>

        {/* 5. Header — Authentic Snabby Branding */}
        <div
          className="wsn-editor-header"
          style={{
            height: '56px',
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div className="wsn-header-logo" style={{ width: '40px', height: '40px' }}>
              <MascotLogo />
            </div>
            <span
              className="wsn-panel__title"
              style={{
                fontSize: '26px',
                fontWeight: 700,
                color: '#ffffff',
                margin: 0,
                textShadow: '0 1px 2px #0000004d',
                letterSpacing: '-.02em',
                flex: '1',
                fontFamily: 'Poppins, Montserrat, Segoe UI, Arial, cursive, sans-serif'
              }}
            >
              Snabby
            </span>
          </div>

          {/* 6. Prominent Red Close Button (Contains ONLY ×) */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '34px',
              height: '34px',
              backgroundColor: '#dc2626',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '22px',
              fontWeight: 'bold',
              cursor: 'pointer',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.6)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#dc2626';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(220, 38, 38, 0.4)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Workspace Container */}
        <div style={{ flex: 1, width: '100%', height: 'calc(100% - 56px - 36px)', position: 'relative' }}>
          <style>{`
            .wsn-editor-modal .excalidraw .toast,
            .wsn-editor-modal .excalidraw .toast-container,
            .wsn-editor-modal .excalidraw .hint-container,
            .wsn-editor-modal .excalidraw .excalidraw-hint,
            .wsn-editor-modal .excalidraw [class*="toast"],
            .wsn-editor-modal .excalidraw [class*="Toast"],
            .wsn-editor-modal .excalidraw [class*="hint"],
            .wsn-editor-modal .excalidraw [class*="Hint"] {
              display: none !important;
              opacity: 0 !important;
              visibility: hidden !important;
              pointer-events: none !important;
            }
          `}</style>

          <Excalidraw theme="dark" excalidrawAPI={handleExcalidrawAPI} />

          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(12, 12, 14, 0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 500,
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              Loading screenshot...
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#cf6679',
                color: '#000000',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                zIndex: 20,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#000000',
                  fontWeight: 700,
                  fontSize: '16px',
                  cursor: 'pointer',
                }}
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {/* 7. Exact User-Friendly Bounds Guidance Footer */}
        <div
          className="wsn-editor-bounds-footer"
          style={{
            height: '42px',
            backgroundColor: '#000000',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '0 16px',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 500,
            opacity: 0.95,
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Anything you add outside the screenshot won't be included in the final result.</span>
        </div>
      </div>
    </div>
  );
};

export default PageEditor;
