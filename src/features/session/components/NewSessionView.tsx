import React, { useState } from 'react';

interface NewSessionViewProps {
  onStartSession: (name: string) => Promise<boolean>;
  onShowOverwriteConfirm: (name: string) => void;
  onSetCaptureMode: (mode: 'VISIBLE' | 'REGION') => Promise<void>;
  loading: boolean;
  error: string | null;
}

export const NewSessionView: React.FC<NewSessionViewProps> = ({
  onStartSession,
  onShowOverwriteConfirm,
  onSetCaptureMode,
  loading,
  error,
}) => {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'visible' | 'region'>('visible');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setValidationError('Session name is required.');
      return;
    }
    setValidationError(null);

    try {
      // Apply capture mode setting before starting session
      await onSetCaptureMode(mode === 'region' ? 'REGION' : 'VISIBLE');
      const success = await onStartSession(name.trim());
      if (!success) {
        onShowOverwriteConfirm(name.trim());
      }
    } catch (err) {
      // General error is already set in the hook state and displayed in the UI
    }
  };

  return (
    <div className="new-session-view">
      <div className="wsn-scroll-area">
        <div className="wsn-session-info">
          <div className="wsn-session-name">Start a New Session</div>
          <div className="wsn-session-meta">
            <div className="wsn-status-dot wsn-status-dot--ready"></div>
            Ready to start
          </div>
        </div>

        <div className="wsn-label">SESSION NAME</div>

        <form onSubmit={handleSubmit} className="wsn-controls">
          <div className="wsn-input-wrapper">
            <svg className="wsn-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
            <input
              type="text"
              className={`wsn-input ${(validationError || error) ? 'wsn-input--error' : ''}`}
              placeholder="Say my name!"
              maxLength={100}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setValidationError(null);
              }}
              disabled={loading}
              autoFocus
            />
          </div>
          {(validationError || error) && (
            <div className="error-message" style={{ color: '#DC2626', fontSize: '12px', textAlign: 'left', marginLeft: '20px' }}>
              {validationError || error}
            </div>
          )}
          <button type="submit" className="wsn-btn--primary" disabled={loading}>
            {loading ? 'Starting...' : 'Start Capture Session'}
          </button>
        </form>

        <div className="wsn-divider">OR</div>

        <div className="wsn-mode-selection">
          <button
            type="button"
            className={`wsn-mode-card ${mode === 'visible' ? 'wsn-mode-card--active' : ''}`}
            onClick={() => setMode('visible')}
            disabled={loading}
          >
            <div className="wsn-mode-card__icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div className="wsn-mode-card__title">Full Screen</div>
            <div className="wsn-mode-card__desc">Capture entire page</div>
            <div className="wsn-mode-card__radio"></div>
          </button>
          <button
            type="button"
            className={`wsn-mode-card ${mode === 'region' ? 'wsn-mode-card--active' : ''}`}
            onClick={() => setMode('region')}
            disabled={loading}
          >
            <div className="wsn-mode-card__icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
              </svg>
            </div>
            <div className="wsn-mode-card__title">Crop Region</div>
            <div className="wsn-mode-card__desc">Select specific area</div>
            <div className="wsn-mode-card__radio"></div>
          </button>
        </div>

        <div className="wsn-hint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>Select Full Screen or Crop Region. Use Ctrl+Shift+S to capture.</span>
        </div>
      </div>
    </div>
  );
};
export default NewSessionView;
