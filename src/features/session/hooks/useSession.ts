import { useState, useEffect } from 'react';
import { useMessageBus } from '../../../app/providers/MessageBusContext.tsx';
import type { Session } from '../../../domain/session/Session.ts';

interface Settings {
  mode: 'VISIBLE' | 'REGION';
}

export const useSession = () => {
  const messageBus = useMessageBus();
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<Settings>({ mode: 'VISIBLE' });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const res = await messageBus.request<{ success: boolean; data: { session: Session | null; settings: Settings } }>({
        type: 'GET_SESSION',
      });
      setSession(res.data.session);
      setSettings(res.data.settings);
      setError(null);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();

    const unsubUpdate = messageBus.listen('SESSION_UPDATED', () => {
      fetchSession();
    });
    const unsubRestore = messageBus.listen('SESSION_RESTORED', () => {
      fetchSession();
    });

    return () => {
      unsubUpdate();
      unsubRestore();
    };
  }, []);

  const startSession = async (name: string): Promise<boolean> => {
    try {
      setError(null);
      const response = await messageBus.request<any>({
        type: 'START_SESSION',
        name,
      } as any);
      setSession(response.data.session);
      return true;
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('SESSION_ACTIVE') || msg.toLowerCase().includes('already active')) {
        return false;
      }
      setError(msg);
      throw err;
    }
  };

  const confirmOverwrite = async (name: string): Promise<void> => {
    try {
      setError(null);
      const response = await messageBus.request<any>({
        type: 'CONFIRM_OVERWRITE',
        name,
      } as any);
      setSession(response.data.session);
    } catch (err: any) {
      setError(err.message || String(err));
      throw err;
    }
  };

  const endSession = async (): Promise<void> => {
    try {
      setError(null);
      await messageBus.request<void>({
        type: 'END_SESSION',
      });
      setSession(null);
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  const setCaptureMode = async (mode: 'VISIBLE' | 'REGION'): Promise<void> => {
    try {
      setError(null);
      const response = await messageBus.request<any>({
        type: 'SET_CAPTURE_MODE',
        mode,
      } as any);
      setSettings({ mode: response.data.mode });
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return {
    session,
    settings,
    loading,
    error,
    startSession,
    confirmOverwrite,
    endSession,
    setCaptureMode,
    refreshSession: fetchSession,
  };
};
