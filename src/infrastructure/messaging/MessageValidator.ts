import type { ExtensionMessage } from '../../application/interfaces/messaging/MessageBus.ts';

export class MessageValidator {
  public static validate(message: unknown): message is ExtensionMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const msg = message as Record<string, unknown>;

    // It must either be an application message (has 'type' string) 
    // or an offscreen message (has 'target' === 'offscreen' and 'action' string)
    if (typeof msg.type === 'string') {
      return true;
    }

    if (msg.target === 'offscreen' && typeof msg.action === 'string') {
      return true;
    }

    return false;
  }
}
