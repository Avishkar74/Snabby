import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { FileId } from '@excalidraw/excalidraw/element/types';
import { useMessageBus } from '../../../app/providers/MessageBusContext.tsx';
import type { PageEditorProps } from '../types/pageEditor.types.ts';

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

      // 3. Populate scene with the screenshot & set dark background
      api.updateScene({
        elements,
        appState: {
          viewBackgroundColor: '#121212',
        },
      });

      // 4. Center and fit viewport to the screenshot page bounds [0, 0, W, H]
      api.scrollToContent(elements, {
        fitToViewport: true,
        viewportZoomFactor: 0.85,
        animate: false,
      });
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
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
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
          width: 'min(92vw, 1400px)',
          height: 'min(88vh, 900px)',
          maxWidth: '100%',
          maxHeight: '100%',
          backgroundColor: '#121212',
          borderRadius: '12px',
          border: '1px solid #333333',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          className="wsn-editor-header"
          style={{
            height: '48px',
            backgroundColor: '#1e1e1e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            color: '#ffffff',
            borderBottom: '1px solid #333333',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Page Editor — {pageId}</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 10px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.color = '#ef4444';
            }}
            title="Close Editor"
          >
            &times;
          </button>
        </div>

        <div style={{ flex: 1, width: '100%', height: 'calc(100% - 48px)', position: 'relative' }}>
          <Excalidraw theme="dark" excalidrawAPI={handleExcalidrawAPI} />

          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(18, 18, 18, 0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '16px',
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
      </div>
    </div>
  );
};

export default PageEditor;
