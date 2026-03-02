import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base application exception — mirrors v3's ApplicationError.
 * Extends HttpException so NestJS exception filter recognises it.
 */
export class ApplicationException extends HttpException {
  public readonly errors?: any[];

  constructor(status: number, message: string, errors?: any[]) {
    super({ status, message, errors }, status);
    this.errors = errors;
  }
}

/** 400 — one or more fields missing */
export class MissingFieldException extends ApplicationException {
  constructor(errors?: any[]) {
    super(HttpStatus.BAD_REQUEST, 'Field missing', errors);
  }
}

/** 400 — credential does not match */
export class InvalidCredentialException extends ApplicationException {
  constructor(message = 'Invalid credential') {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/** 400 — token format invalid (not expired, just malformed) */
export class InvalidTokenException extends ApplicationException {
  constructor(message = 'Invalid token') {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/** 400 — bad entity ID */
export class InvalidIdException extends ApplicationException {
  constructor(message = 'Invalid id') {
    super(HttpStatus.BAD_REQUEST, message);
  }
}
