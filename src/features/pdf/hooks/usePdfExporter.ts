import { useState } from 'react';
import { useMessageBus } from '../../../app/providers/MessageBusContext.tsx';

export type ExportStatus = 'idle' | 'generating' | 'downloading' | 'completed' | 'failed';

export const usePdfExporter = () => {
  const messageBus = useMessageBus();
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const checkOcrStatus = async (): Promise<{ pendingCount: number; totalCount: number }> => {
    try {
      const res = await messageBus.request<{ success: boolean; data: { pendingCount: number; totalCount: number } }>({
        type: 'CHECK_OCR_STATUS',
      });
      return res.data;
    } catch (err) {
      console.error('[usePdfExporter] checkOcrStatus failed:', err);
      return { pendingCount: 0, totalCount: 0 };
    }
  };

  const exportPdf = async (sessionName: string, skipPendingOcr: boolean): Promise<void> => {
    try {
      setError(null);
      setExportStatus('generating');

      const sanitizedSessionName = sessionName.trim().replace(/[^a-z0-9_-]/gi, '_');
      const filename = `${sanitizedSessionName || Date.now()}.pdf`;

      // Switch status to downloading to represent the pipeline stages
      const transitionTimer = setTimeout(() => {
        setExportStatus('downloading');
      }, 800);

      await messageBus.request<void>({
        type: 'EXPORT_PDF',
        filename,
        skipPendingOcr,
      } as any);

      clearTimeout(transitionTimer);
      setExportStatus('completed');

      setTimeout(() => {
        setExportStatus('idle');
      }, 2500);
    } catch (err: any) {
      setError(err.message || String(err));
      setExportStatus('failed');
      setTimeout(() => {
        setExportStatus('idle');
      }, 5000);
    }
  };

  return {
    exportStatus,
    error,
    checkOcrStatus,
    exportPdf,
  };
};
