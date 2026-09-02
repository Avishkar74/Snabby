import React, { useState } from 'react';

interface PageInsertGapProps {
  index: number;
  onInsert: (index: number) => Promise<void>;
  disabled?: boolean;
}

export const PageInsertGap: React.FC<PageInsertGapProps> = ({
  index,
  onInsert,
  disabled = false,
}) => {
  const [isInserting, setIsInserting] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isInserting) return;
    setIsInserting(true);
    try {
      await onInsert(index);
    } finally {
      setIsInserting(false);
    }
  };

  return (
    <div
      className="wsn-insert-gap"
      onClick={handleClick}
      title="Insert blank page here"
    >
      <div className="wsn-insert-gap__line" />
      <button
        type="button"
        className={`wsn-insert-gap__btn ${isInserting ? 'wsn-insert-gap__btn--loading' : ''}`}
        disabled={disabled || isInserting}
        aria-label="Insert blank page"
      >
        {isInserting ? (
          <div className="wsn-spinner-xs" />
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )}
      </button>
      <div className="wsn-insert-gap__line" />
    </div>
  );
};

export default PageInsertGap;
