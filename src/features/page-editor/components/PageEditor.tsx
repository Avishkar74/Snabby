import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { FileId } from '@excalidraw/excalidraw/element/types';
import { useMessageBus } from '../../../app/providers/MessageBusContext.tsx';
import type { PageEditorProps } from '../types/pageEditor.types.ts';
import { MascotLogo } from '../../../shared/components/MascotLogo.tsx';
import { renderBoundedPageImage } from '../utils/renderBoundedPageImage.ts';

interface PageImageData {
  pageId: string;
  imageId: string;
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  annotationData?: string | null;
}

export const PageEditor: React.FC<PageEditorProps> = ({ pageId, onClose }) => {
  const messageBus = useMessageBus();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // imageData drives rendering — Excalidraw only mounts after this is set
  const [imageData, setImageData] = useState<PageImageData | null>(null);
  
  // Track imageData in a ref so flushPendingSave has access to it synchronously
  const imageDataRef = useRef<PageImageData | null>(null);
  imageDataRef.current = imageData;

  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const activePageIdRef = useRef<string | null>(pageId);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnnotationRef = useRef<{ pageId: string; annotationData: string | null } | null>(null);
  const lastSavedAnnotationDataRef = useRef<string | null>(null);

  // ─── Flush function – saves pending annotations and bounded rendered image ───
  const flushPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (pendingAnnotationRef.current) {
      const { pageId: targetPageId, annotationData } = pendingAnnotationRef.current;
      pendingAnnotationRef.current = null;

      if (annotationData !== lastSavedAnnotationDataRef.current) {
        lastSavedAnnotationDataRef.current = annotationData;

        const currentImgData = imageDataRef.current;
        (async () => {
          try {
            let renderedImageData = null;
            if (annotationData && currentImgData && currentImgData.pageId === targetPageId) {
              renderedImageData = await renderBoundedPageImage(
                currentImgData.dataUrl,
                currentImgData.width,
                currentImgData.height,
                currentImgData.mimeType,
                annotationData
              );
            }

            // Stale async protection: ensure active page hasn't changed
            if (activePageIdRef.current !== targetPageId) return;

            await messageBus.request({
              type: 'SAVE_PAGE_ANNOTATIONS',
              pageId: targetPageId,
              annotationData,
              renderedImageData,
            } as any);
          } catch (err) {
            console.error('[PageEditor] Failed to save page annotations & rendered image:', err);
          }
        })();
      }
    }
  }, [messageBus]);

  // ─── Build initialData synchronously from imageData via useMemo ──────────
  // Using initialData instead of updateScene eliminates ALL timing races:
  // Excalidraw only mounts when this is ready and receives data on first paint.
  const initialData = useMemo(() => {
    if (!imageData) return null;

    const fileId = `img_${imageData.pageId}` as FileId;
    const fileData = {
      id: fileId,
      dataURL: imageData.dataUrl as any,
      mimeType: imageData.mimeType as any,
      created: Date.now(),
    };

    const screenshotElements = convertToExcalidrawElements([
      {
        type: 'image',
        id: `image_${imageData.pageId}` as any,
        x: 0,
        y: 0,
        width: imageData.width,
        height: imageData.height,
        fileId,
        status: 'saved',
        locked: true,
      },
    ]);

    let userElements: any[] = [];
    if (imageData.annotationData) {
      try {
        userElements = JSON.parse(imageData.annotationData);
      } catch (e) {
        console.warn('[PageEditor] Failed to parse annotationData:', e);
      }
    }

    // Seed the last-saved ref so we don't immediately re-save on mount
    lastSavedAnnotationDataRef.current = imageData.annotationData || null;
    pendingAnnotationRef.current = null;

    return {
      elements: [...screenshotElements, ...userElements],
      files: { [fileId]: fileData } as any,
      appState: { viewBackgroundColor: '#0e0e10' },
    };
  }, [imageData]);

  // ─── Excalidraw API callback – scroll to screenshot after mount ───────────
  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawAPIRef.current = api;
      if (!imageData) return;
      const imageElementId = `image_${imageData.pageId}`;
      setTimeout(() => {
        try {
          const liveElements = api.getSceneElements();
          const screenshot = liveElements.find((el) => el.id === imageElementId);
          const target = screenshot ? [screenshot] : liveElements;
          api.scrollToContent(target, {
            fitToViewport: true,
            viewportZoomFactor: 0.85,
            animate: false,
          });
        } catch (e) {
          // ignore if already unmounted
        }
      }, 50);
    },
    [imageData]
  );

  // ─── Debounced change handler – save user drawings ────────────────────────
  const handleChange = useCallback(
    (elements: readonly any[]) => {
      const currentPageId = activePageIdRef.current;
      if (!currentPageId || !imageData || imageData.pageId !== currentPageId) return;

      // Filter out the locked screenshot background (which is always an image) and any deleted elements
      const userElements = elements.filter(
        (el) => el.type !== 'image' && !el.isDeleted
      );

      const annotationData = userElements.length > 0 ? JSON.stringify(userElements) : null;

      if (annotationData === lastSavedAnnotationDataRef.current) return;

      pendingAnnotationRef.current = { pageId: currentPageId, annotationData };

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        flushPendingSave();
      }, 500);
    },
    [imageData, flushPendingSave]
  );

  // ─── Main load effect – fetch image data, then let useMemo build scene ────
  useEffect(() => {
    activePageIdRef.current = pageId;

    if (!pageId) {
      setImageData(null);
      setLoading(false);
      setError(null);
      excalidrawAPIRef.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setImageData(null); // unmounts Excalidraw while we fetch

    (async () => {
      try {
        const response = await messageBus.request<{
          success: boolean;
          data?: PageImageData;
          error?: { message: string };
        }>({
          type: 'GET_PAGE_EDITOR_IMAGE',
          pageId,
        } as any);

        if (cancelled || activePageIdRef.current !== pageId) return;

        if (response.success && response.data) {
          setImageData(response.data);
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
    })();

    return () => {
      cancelled = true;
    };
  }, [pageId, messageBus]);

  const handleClose = useCallback(() => {
    flushPendingSave();
    onClose();
  }, [flushPendingSave, onClose]);

  // Teardown cleanup when component fully unmounts from App tree
  useEffect(() => {
    return () => {
      flushPendingSave();
      excalidrawAPIRef.current = null;
    };
  }, [flushPendingSave]);

  // Handle ESC key press to close editor modal cleanly
  useEffect(() => {
    if (!pageId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pageId, handleClose]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    mouseDownTargetRef.current = e.target;
  };

  const handleOverlayMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    // Only close if both mousedown AND mouseup happened directly on the dark overlay background
    if (
      overlayRef.current &&
      e.target === overlayRef.current &&
      mouseDownTargetRef.current === overlayRef.current
    ) {
      handleClose();
    }
    mouseDownTargetRef.current = null;
  };

  if (!pageId) {
    return null;
  }

  // 1. Calculate modal container width dynamically
  const containerWidth = imageData
    ? Math.min(window.innerWidth * 0.82, Math.max(760, imageData.width + 200))
    : 'min(82vw, 1050px)';

  return (
    <div
      ref={overlayRef}
      className="wsn-editor-overlay"
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
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
            3. Hide Insert Image button in toolbar
            4. Hide floating question-mark/help icon in bottom right */}
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
          .wsn-editor-modal .excalidraw [data-testid="toolbar-image"],
          .wsn-editor-modal .excalidraw label[title*="Image"],
          .wsn-editor-modal .excalidraw button[title*="Image"],
          .wsn-editor-modal .excalidraw label[aria-label*="Image"],
          .wsn-editor-modal .excalidraw label[data-id="image"],
          .wsn-editor-modal .excalidraw label:has(input[value="image"]) {
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
            onClick={handleClose}
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

          {/* Excalidraw only mounts after imageData is ready; initialData eliminates timing races */}
          {imageData && initialData ? (
            <Excalidraw
              key={pageId ?? undefined}
              theme="dark"
              initialData={initialData}
              excalidrawAPI={handleExcalidrawAPI}
              onChange={handleChange}
              UIOptions={{
                tools: {
                  image: false,
                },
              }}
            />
          ) : null}

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
