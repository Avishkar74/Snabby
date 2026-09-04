import { useState, useEffect } from 'react';
import { useMessageBus } from '../../../app/providers/MessageBusContext.tsx';

export interface PagePreview {
  id: string;
  sessionId: string;
  imageId: string;
  effectiveRenderedImageId?: string;
  status: string; // OCRStatus: NOT_STARTED | PROCESSING | COMPLETED | FAILED
  order: number;
  createdAt: string;
  imageUrl?: string; // base64 string
}

export const useCaptures = () => {
  const messageBus = useMessageBus();
  const [captures, setCaptures] = useState<PagePreview[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [captureInProgress, setCaptureInProgress] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCaptures = async () => {
    try {
      setError(null);
      const res = await messageBus.request<{ success: boolean; data: { pages: PagePreview[] } }>({
        type: 'GET_ALL_THUMBNAILS',
      });
      const sorted = [...res.data.pages].sort((a, b) => a.order - b.order);
      setCaptures(sorted);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaptures();

    const unsubCapture = messageBus.listen('CAPTURE_COMPLETE', () => {
      fetchCaptures();
    });
    const unsubOcrComplete = messageBus.listen('OCR_COMPLETED', () => {
      fetchCaptures();
    });
    const unsubOcrFailed = messageBus.listen('OCR_FAILED', () => {
      fetchCaptures();
    });

    const unsubSessionUpdate = messageBus.listen('SESSION_UPDATED', () => {
      fetchCaptures();
    });

    return () => {
      unsubCapture();
      unsubOcrComplete();
      unsubOcrFailed();
      unsubSessionUpdate();
    };
  }, []);

  const triggerCapture = async (): Promise<void> => {
    try {
      setCaptureInProgress(true);
      setError(null);
      await messageBus.request<any>({
        type: 'CAPTURE_REQUEST',
      });
      await fetchCaptures();
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setCaptureInProgress(false);
    }
  };

  const deleteCapture = async (captureId: string): Promise<void> => {
    try {
      setError(null);
      await messageBus.request<void>({
        type: 'DELETE_CAPTURE',
        captureId,
      } as any);
      await fetchCaptures();
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  const createCustomPage = async (sessionId: string, index?: number): Promise<string | null> => {
    try {
      setError(null);
      const res = await messageBus.request<{
        success: boolean;
        data?: { page: { id: string } };
        error?: { message: string };
      }>({
        type: 'CREATE_CUSTOM_PAGE',
        sessionId,
        index,
      } as any);

      if (res && res.success && res.data?.page?.id) {
        await fetchCaptures();
        return res.data.page.id;
      }
      if (res && res.error) {
        setError(res.error.message);
      }
      return null;
    } catch (err: any) {
      setError(err.message || String(err));
      return null;
    }
  };

  return {
    captures,
    loading,
    captureInProgress,
    error,
    triggerCapture,
    deleteCapture,
    createCustomPage,
    refreshCaptures: fetchCaptures,
  };
};
