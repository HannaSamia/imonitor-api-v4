import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request, Response, NextFunction } from 'express';

/**
 * Detects malicious URL patterns (directory traversal, CGI probing).
 * Matches v3's requestFilter middleware — logs to core_malicious_requests and returns 401.
 */
@Injectable()
export class RequestFilterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestFilterMiddleware.name);

  private static readonly SUSPICIOUS_PATTERNS: RegExp[] = [
    /\.%/,
    /%2e%2e/i,
    /%c0%ae/i,
    /%e0%80%ae/i,
    /cgi-bin/,
  ];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      decodeURIComponent(req.originalUrl);
    } catch (e) {
      if (e instanceof URIError) {
        await this.processMaliciousRequest(req);
        res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
        return;
      }
    }

    const isSuspicious = RequestFilterMiddleware.SUSPICIOUS_PATTERNS.some(
      (pattern) => pattern.test(req.originalUrl),
    );

    if (isSuspicious) {
      await this.processMaliciousRequest(req);
      res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
      return;
    }

    next();
  }

  private async processMaliciousRequest(req: Request): Promise<void> {
    try {
      await this.dataSource.query(
        'INSERT INTO core_malicious_requests (ipAddress, method, headers, endpoint) VALUES (?, ?, ?, ?)',
        [req.ip, req.method, JSON.stringify(req.headers), req.originalUrl],
      );
    } catch (error: unknown) {
      this.logger.error(`requestFilter | processMaliciousRequest FAILED: ${(error as Error).message}`);
    }
  }
}
