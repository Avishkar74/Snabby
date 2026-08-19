import React from 'react';
import type { CapturePreview } from '../hooks/useCaptures.ts';

interface CaptureCardProps {
  capture: CapturePreview;
  index: number;
  onDelete: (id: string) => void;
  onSelect: (capture: CapturePreview) => void;
}

export const CaptureCard: React.FC<CaptureCardProps> = ({
  capture,
  index,
  onDelete,
  onSelect,
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
      <div className="wsn-thumb-caption">Capture #{index + 1}</div>
    </div>
  );
};
export default CaptureCard;

