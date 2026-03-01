import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const customLevels = {
  levels: {
    emerg: 0,
    error: 2,
    warn: 3,
    info: 4,
    http: 5,
    debug: 6,
  },
  colors: {
    emerg: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'blue',
    debug: 'white',
  },
};

winston.addColors(customLevels.colors);

const level = (): string => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'production' ? 'info' : 'debug';
};

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} ${level}: ${message}`;
  }),
);

const fileJsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.splat(),
  winston.format.json(),
);

const appErrorFilter = winston.format((info) => {
  if (info.endpoint) return info;
  return false;
})();

const appErrorFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  appErrorFilter,
  winston.format.printf(({ timestamp, status, endpoint, message }) => {
    return JSON.stringify({ timestamp, status, endpoint, message });
  }),
);

const winstonLogger = winston.createLogger({
  levels: customLevels.levels,
  level: level(),
  transports: [
    // Console transport — colorized
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // Combined log — rolling by size (30MB, 1 file)
    new winston.transports.File({
      filename: 'logs/combined.log',
      level: level(),
      maxFiles: 1,
      maxsize: 30_000_000,
      format: fileJsonFormat,
    }),

    // Error daily rotate — 7 days, 20MB, gzipped
    new winston.transports.DailyRotateFile({
      filename: 'logs/error/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '7d',
      maxSize: '20m',
      auditFile: 'logs/config/error-config.json',
      zippedArchive: true,
      format: fileJsonFormat,
    }),

    // Emergency daily rotate — 7 days, 20MB, gzipped
    new winston.transports.DailyRotateFile({
      filename: 'logs/emergency/emergency-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'emerg',
      maxFiles: '7d',
      maxSize: '20m',
      auditFile: 'logs/config/emergency-config.json',
      zippedArchive: true,
      format: fileJsonFormat,
    }),

    // App errors daily rotate — HTTP errors only, 5 days, 20MB, gzipped
    new winston.transports.DailyRotateFile({
      filename: 'logs/app-errors/app-error-%DATE%.json',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '5d',
      maxSize: '20m',
      auditFile: 'logs/config/app-error-config.json',
      zippedArchive: true,
      format: appErrorFormat,
    }),
  ],
});

@Injectable()
export class AppLogger implements NestLoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, ...optionalParams: any[]) {
    const ctx = optionalParams.length ? optionalParams[optionalParams.length - 1] : this.context;
    winstonLogger.info(`[${ctx || 'Application'}] ${message}`);
  }

  error(message: string, ...optionalParams: any[]) {
    const trace = optionalParams[0];
    const ctx = optionalParams[1] || this.context;
    winstonLogger.log('error', `[${ctx || 'Application'}] ${message}`, { trace });
  }

  warn(message: string, ...optionalParams: any[]) {
    const ctx = optionalParams.length ? optionalParams[optionalParams.length - 1] : this.context;
    winstonLogger.warn(`[${ctx || 'Application'}] ${message}`);
  }

  debug(message: string, ...optionalParams: any[]) {
    const ctx = optionalParams.length ? optionalParams[optionalParams.length - 1] : this.context;
    winstonLogger.debug(`[${ctx || 'Application'}] ${message}`);
  }

  verbose(message: string, ...optionalParams: any[]) {
    const ctx = optionalParams.length ? optionalParams[optionalParams.length - 1] : this.context;
    winstonLogger.info(`[${ctx || 'Application'}] ${message}`);
  }

  /** Direct access for custom levels (emerg, http) */
  emerg(message: string, meta?: Record<string, unknown>) {
    winstonLogger.log('emerg', message, meta);
  }

  http(message: string, meta?: Record<string, unknown>) {
    winstonLogger.log('http', message, meta);
  }

  /** Log HTTP error with endpoint for app-errors transport */
  httpError(endpoint: string, status: number, message: string) {
    winstonLogger.log('error', message, { endpoint, status });
  }

  getWinstonLogger(): winston.Logger {
    return winstonLogger;
  }
}
