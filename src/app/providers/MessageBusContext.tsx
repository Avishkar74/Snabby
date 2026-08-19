import React, { createContext, useContext } from 'react';
import type { MessageBus } from '../../application/interfaces/messaging/MessageBus.ts';

const MessageBusContext = createContext<MessageBus | null>(null);

export const MessageBusProvider: React.FC<{ bus: MessageBus; children: React.ReactNode }> = ({ bus, children }) => {
  return (
    <MessageBusContext.Provider value={bus}>
      {children}
    </MessageBusContext.Provider>
  );
};

export const useMessageBus = (): MessageBus => {
  const context = useContext(MessageBusContext);
  if (!context) {
    throw new Error('useMessageBus must be used within a MessageBusProvider');
  }
  return context;
};
