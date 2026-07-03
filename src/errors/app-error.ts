export class AppError extends Error {
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, isOperational = true, context?: Record<string, unknown>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
    this.isOperational = isOperational;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, false, context);
  }
}

export class ConnectionError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, true, context);
  }
}

export class MessageValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, true, context);
  }
}

export class HandlerError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, true, context);
  }
}
