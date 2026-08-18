export class PDFGenerationError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = 'PDFGenerationError';
  }
}

export class DownloadFailedError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = 'DownloadFailedError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionNotFoundError';
  }
}

export class NoCapturesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoCapturesError';
  }
}
