import React from 'react';

interface DecisionModalProps {
  isOpen: boolean;
  pendingCount: number;
  onConfirmWait: () => void;
  onConfirmDownloadNow: () => void;
  onCancel: () => void;
}

export const DecisionModal: React.FC<DecisionModalProps> = ({
  isOpen,
  pendingCount,
  onConfirmWait,
  onConfirmDownloadNow,
  onCancel,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="wsn-modal-overlay" onClick={onCancel}>
      <div className="wsn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wsn-modal__title">PDF Export Options</div>
        <p className="wsn-modal__text">
          {pendingCount} image(s) are still being processed for text recognition (OCR).
        </p>
        <div className="wsn-ocr-options">
          <div className="wsn-ocr-option" onClick={onConfirmDownloadNow}>
            <span className="wsn-radio-wrap">
              <input type="radio" id="wsn-ocr-fast-dm" name="wsn-ocr-choice-dm" defaultChecked />
              <span className="wsn-radio-indicator"></span>
            </span>
            <div className="wsn-ocr-option-text">
              <label htmlFor="wsn-ocr-fast-dm">Export now</label>
              <div className="wsn-ocr-option-hint">
                Fastest. Some images may not have selectable/searchable text.
              </div>
            </div>
          </div>
          <div className="wsn-ocr-option" onClick={onConfirmWait}>
            <span className="wsn-radio-wrap">
              <input type="radio" id="wsn-ocr-wait-dm" name="wsn-ocr-choice-dm" />
              <span className="wsn-radio-indicator"></span>
            </span>
            <div className="wsn-ocr-option-text">
              <label htmlFor="wsn-ocr-wait-dm">Wait for OCR to finish</label>
              <div className="wsn-ocr-option-hint">
                Slower. All images will have OCR text. May take up to a minute.
              </div>
            </div>
          </div>
        </div>
        <div className="wsn-modal__actions">
          <button type="button" className="wsn-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
export default DecisionModal;
