import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

/**
 * Wraps all successful responses in the ApiResponse<T> envelope:
 * { success: true, status, message, result }
 *
 * Matches v3's Response helper wire format.
 * Skips wrapping for streaming/file responses (Content-Disposition header).
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const response = context.switchToHttp().getResponse<Response>();

        // Skip wrapping for file/stream responses
        if (response.getHeader('Content-Disposition')) {
          return data;
        }

        const statusCode = response.statusCode;

        // If handler returned { message, result } directly, use that message
        if (data && typeof data === 'object' && 'message' in data && 'result' in data) {
          return {
            success: true,
            status: statusCode,
            message: data.message,
            result: data.result,
          };
        }

        return {
          success: true,
          status: statusCode,
          message: this.deriveMessage(statusCode),
          result: data,
        };
      }),
    );
  }

  private deriveMessage(statusCode: number): string {
    switch (statusCode) {
      case 200:
        return '200_SUCCESS';
      case 201:
        return '201_CREATED';
      case 204:
        return '204_DELETED';
      default:
        return 'SUCCESS';
    }
  }
}
