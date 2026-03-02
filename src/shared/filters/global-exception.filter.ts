import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApplicationException } from '../exceptions/application.exceptions';

/**
 * Global exception filter — replaces v3's errorHandlerMiddleware.
 * Matches the exact v3 wire format for all error responses.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // HttpException (includes NestJS built-ins and our ApplicationException)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as Record<string, unknown>;

      // Log to error transport with endpoint metadata (matching v3)
      this.logger.error(exception.message, {
        status,
        endpoint: request.originalUrl,
        method: request.method,
        timestamp: new Date().toISOString(),
      });

      // Format A: ApplicationException with errors array
      if (exception instanceof ApplicationException && exception.errors) {
        response.status(status).json({
          status,
          message: exceptionResponse.message || exception.message,
          errors: exception.errors,
        });
        return;
      }

      // Format B: Standard HttpException — message + optional errors array
      const message =
        typeof exceptionResponse === 'string' ? exceptionResponse : exceptionResponse.message || exception.message;

      const responseBody: Record<string, unknown> = {
        status,
        message,
        success: false,
      };

      // Preserve errors array from BadRequestException (e.g. class-validator)
      if (typeof exceptionResponse === 'object' && Array.isArray(exceptionResponse.errors)) {
        responseBody.errors = exceptionResponse.errors;
      }

      response.status(status).json(responseBody);
      return;
    }

    // Raw Error (500) — matching v3's catch-all handler
    const err = exception instanceof Error ? exception : new Error(String(exception));

    this.logger.error(`###500### \n message - ${err.message}, stack trace - ${err.stack}`);

    const status = 500;
    const isProd = process.env.NODE_ENV === 'production';

    response.status(status).json({
      status,
      message: isProd ? 'Something went Wrong...' : err.message,
      success: false,
      errors: isProd ? undefined : [{ message: err.message, stack: err.stack }],
    });
  }
}
