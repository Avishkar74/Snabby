import React, { useState, useEffect, useRef } from 'react';
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
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<PageImageData | null>(null);

  // Active page ID ref to prevent stale async responses when switching quickly
  const activePageIdRef = useRef<string | null>(pageId);

  useEffect(() => {
    activePageIdRef.current = pageId;
    if (!pageId) {
      setImageData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchPageImage = async () => {
      setLoading(true);
      setError(null);
      setImageData(null);

      // Reset Excalidraw scene to prevent stale elements from previous page
      if (excalidrawAPI) {
        try {
          excalidrawAPI.resetScene();
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
    };

    fetchPageImage();

    return () => {
      cancelled = true;
    };
  }, [pageId, messageBus, excalidrawAPI]);

  // Once both image data and Excalidraw API are available, populate scene
  useEffect(() => {
    if (!imageData || !excalidrawAPI || imageData.pageId !== pageId) {
      return;
    }

    try {
      const fileId = `img_${imageData.pageId}` as FileId;

      // 1. Add image file to Excalidraw's internal file cache
      excalidrawAPI.addFiles([
        {
          id: fileId,
          dataURL: imageData.dataUrl as any,
          mimeType: imageData.mimeType as any,
          created: Date.now(),
        },
      ]);

      // 2. Create Page Frame & Bounded Image Element locked at origin (0, 0)
      const imageElementId = `image_${imageData.pageId}`;
      const frameId = `frame_${imageData.pageId}`;
      const elements = convertToExcalidrawElements([
        {
          type: 'frame',
          id: frameId as any,
          x: 0,
          y: 0,
          width: imageData.width,
          height: imageData.height,
          name: `Page (${imageData.width} × ${imageData.height})`,
          children: [imageElementId],
        },
        {
          type: 'image',
          id: imageElementId as any,
          x: 0,
          y: 0,
          width: imageData.width,
          height: imageData.height,
          fileId,
          status: 'saved',
          locked: true,
          frameId,
        },
      ]);

      // 3. Update scene with the framed screenshot image element & canvas background
      excalidrawAPI.updateScene({
        elements,
        appState: {
          viewBackgroundColor: '#121212',
        },
      });

      // 4. Center and fit viewport to the page frame bounds [0, 0, W, H]
      excalidrawAPI.scrollToContent(elements, {
        fitToViewport: true,
        viewportZoomFactor: 0.85,
        animate: false,
      });
    } catch (err) {
      console.error('[PageEditor] Failed to render image in Excalidraw:', err);
      setError('Failed to display screenshot on canvas');
    }
  }, [imageData, excalidrawAPI, pageId]);

  if (!pageId) {
    return null;
  }

  return (
    <div
      className="wsn-editor-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 2147483647,
        backgroundColor: '#121212',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}
      role="dialog"
      aria-modal="true"
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
            background: 'transparent',
            border: 'none',
            color: '#ffffff',
            fontSize: '20px',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '4px 8px',
          }}
          title="Close Editor"
        >
          &times;
        </button>
      </div>

      <div style={{ flex: 1, width: '100%', height: 'calc(100vh - 48px)', position: 'relative' }}>
        <Excalidraw theme="dark" excalidrawAPI={(api) => setExcalidrawAPI(api)} />

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
  );
};

export default PageEditor;
