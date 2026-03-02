import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { existsSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DateHelperService, DATE_WITHOUT_TIME } from '../services/date-helper.service';

/**
 * Logs all authenticated requests to core_requests_archive with filesystem fallback.
 * Matches v3's requestArchive middleware behavior.
 * Never blocks or fails the request pipeline — all errors are silently caught.
 */
@Injectable()
export class RequestArchiveInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestArchiveInterceptor.name);

  private static readonly UNAUTHENTICATED_ENDPOINTS_TO_LOG = [
    '/api/v1/auth/heartbeat',
    '/api/v1/auth/login',
    '/api/v1/auth/token',
  ];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dateHelper: DateHelperService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget — never await, never block
        this.archiveRequest(request).catch((err) => {
          this.logger.warn(`RequestArchive failed: ${err.message}`);
        });
      }),
    );
  }

  private async archiveRequest(request: Request & { user?: { id?: string } }): Promise<void> {
    const hasAuth = !!request.headers.authorization;
    const url = request.originalUrl || request.url;

    // Skip requests without Authorization header unless URL is in the allow list
    if (!hasAuth && !RequestArchiveInterceptor.UNAUTHENTICATED_ENDPOINTS_TO_LOG.includes(url)) {
      return;
    }

    let userId = 'unknown';

    if (hasAuth && request.user?.id) {
      userId = request.user.id;
    } else if (url === '/api/v1/auth/login' && request.body?.credential) {
      userId = request.body.credential;
    }

    const payload = request.body && Object.keys(request.body).length > 0 ? JSON.stringify(request.body) : null;

    const data = {
      type: request.method,
      endpoint: url,
      userId,
      requestDate: this.dateHelper.formatDate(),
      payload,
      host: request.headers.host || '',
    };

    try {
      await this.dataSource.query(
        'INSERT INTO core_requests_archive (type, endpoint, userId, requestDate, payload, host) VALUES (?, ?, ?, ?, ?, ?)',
        [data.type, data.endpoint, data.userId, data.requestDate, data.payload, data.host],
      );
    } catch {
      // Filesystem fallback — matching v3 behavior
      this.writeToFallbackFile(data);
    }
  }

  private writeToFallbackFile(data: Record<string, unknown>): void {
    try {
      const logsDir = join(process.cwd(), 'logs', 'request-archive');
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      const filename = this.dateHelper.formatDate(DATE_WITHOUT_TIME) + '.json';
      const filepath = join(logsDir, filename);
      const entry = JSON.stringify(data) + ',\n';

      if (!existsSync(filepath)) {
        writeFileSync(filepath, entry);
      } else {
        appendFileSync(filepath, entry);
      }
    } catch (err: unknown) {
      this.logger.warn(`RequestArchive filesystem fallback failed: ${(err as Error).message}`);
    }
  }
}
