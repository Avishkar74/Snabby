export class DomainError extends Error {
  public readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
    this.name = 'DomainError';
    // Restore prototype chain for extending built-in Error in ES5/ES6 environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class SessionNotFoundError extends DomainError {
  constructor(sessionId: string) {
    super(`Session not found with ID: ${sessionId}`, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}
