import React from 'react';
import type { PagePreview } from '../hooks/useCaptures.ts';

interface CaptureCardProps {
  capture: PagePreview;
  index: number;
  onDelete: (id: string) => void;
  onSelect: (capture: PagePreview) => void;
  onEdit: (id: string) => void;
}

export const CaptureCard: React.FC<CaptureCardProps> = ({
  capture,
  index,
  onDelete,
  onSelect,
  onEdit,
}) => {
  return (
    <div className="wsn-thumb" onClick={() => onSelect(capture)}>
      {capture.imageUrl ? (
        <img src={capture.imageUrl} alt={`Capture #${index + 1}`} />
      ) : (
        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', fontSize: '12px', color: '#ffffff' }}>
          No Image
        </div>
      )}
      <div className="wsn-preview-badge">#{index + 1}</div>
      <button
        type="button"
        className="wsn-thumb-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(capture.id);
        }}
        title="Delete this capture"
      >
        ×
      </button>
      <button
        type="button"
        className="wsn-thumb-edit"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(capture.id);
        }}
        title="Edit this page"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <div className="wsn-thumb-caption">Capture #{index + 1}</div>
    </div>
  );
};
export default CaptureCard;

