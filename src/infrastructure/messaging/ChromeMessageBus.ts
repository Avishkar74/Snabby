import type { MessageBus, ExtensionMessage, MessageHandler } from '../../application/interfaces/messaging/MessageBus.ts';
import { MessageValidator } from './MessageValidator.ts';

export class ChromeMessageBus implements MessageBus {
  public send(message: ExtensionMessage): void {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        console.warn('[ChromeMessageBus] chrome.runtime.sendMessage is not available');
        return;
      }
      chrome.runtime.sendMessage(message).catch((err) => {
        // Suppress benign connection errors if no receivers are active yet
        console.warn('[ChromeMessageBus] send warning:', err);
      });
    } catch (err) {
      console.warn('[ChromeMessageBus] send error:', err);
    }
  }

  public async request<TResponse>(message: ExtensionMessage): Promise<TResponse> {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        throw new Error('Chrome runtime messaging is not available (extension context invalidated or disconnected)');
      }
      const msg = {
        ...message,
        requestId: message.requestId || (
          typeof crypto !== 'undefined' && crypto.randomUUID 
            ? crypto.randomUUID() 
            : Math.random().toString(36).substring(2, 15)
        )
      };

      const response = await chrome.runtime.sendMessage(msg);

      if (response && typeof response === 'object' && 'success' in response && response.success === false) {
        const errorObj = (response as any).error;
        throw new Error(errorObj?.message || errorObj || 'Message request failed');
      }

      return response as TResponse;
    } catch (err: unknown) {
      const messageStr = err instanceof Error ? err.message : String(err);
      throw new Error(`Chrome message request failed: ${messageStr}`);
    }
  }

  public listen(typeOrAction: string, handler: MessageHandler): () => void {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      console.warn('[ChromeMessageBus] chrome.runtime.onMessage is not available');
      return () => {};
    }

    const listener = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: any) => void
    ) => {
      // Validate incoming message structure
      if (!MessageValidator.validate(message)) {
        return false;
      }

      // Check if message type, action, or target matches (cast to any for union properties)
      const msg = message as any;
      const matches = 
        msg.type === typeOrAction || 
        msg.action === typeOrAction || 
        (msg.target === 'offscreen' && typeOrAction === 'offscreen');

      if (matches) {
        try {
          const payload = msg.payload !== undefined ? msg.payload : msg;
          const result = handler(payload, sender.id);

          if (result instanceof Promise) {
            result
              .then((res) => {
                sendResponse(res);
              })
              .catch((err) => {
                sendResponse({ 
                  success: false, 
                  error: { 
                    message: err instanceof Error ? err.message : String(err) 
                  } 
                });
              });
            return true; // Keep channel open for async response
          } else {
            sendResponse(result);
          }
        } catch (err) {
          sendResponse({ 
            success: false, 
            error: { 
              message: err instanceof Error ? err.message : String(err) 
            } 
          });
        }
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(listener);

    // Return unsubscribe function
    return () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(listener);
        }
      } catch {
        // Benign cleanup failure if context invalidated
      }
    };
  }
}
