export class CaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureError';
    // Restore prototype chain for custom Error classes in JS/TS environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
