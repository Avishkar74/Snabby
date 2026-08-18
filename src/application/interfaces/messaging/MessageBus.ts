export interface ApplicationMessage {
  type: string;
  requestId?: string;
  payload?: unknown;
}

export interface OffscreenMessage {
  target: 'offscreen';
  action: string;
  requestId?: string;
  payload?: unknown;
}

export type ExtensionMessage = ApplicationMessage | OffscreenMessage;

export type MessageHandler = (payload: any, senderId?: string) => Promise<unknown> | unknown;

export interface MessageBus {
  send(message: ExtensionMessage): void;
  request<TResponse>(message: ExtensionMessage): Promise<TResponse>;
  listen(typeOrAction: string, handler: MessageHandler): () => void;
}
