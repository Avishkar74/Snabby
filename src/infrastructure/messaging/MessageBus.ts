export interface MessageBus {
  publish(event: string, payload: any): void;
}
