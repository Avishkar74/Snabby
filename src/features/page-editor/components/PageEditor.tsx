import React from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { PageEditorProps } from '../types/pageEditor.types.ts';

export const PageEditor: React.FC<PageEditorProps> = ({ pageId, onClose }) => {
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
        <Excalidraw />
      </div>
    </div>
  );
};

export default PageEditor;
