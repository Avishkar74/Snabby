import React from 'react';

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode }> = ({ isOpen, children }) => isOpen ? <div>{children}</div> : null;
