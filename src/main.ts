import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ClusterService } from './cluster/cluster.service';
import { AppLogger } from './logger/logger.service';
import { createValidationPipe } from './shared/pipes/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(AppLogger);
  app.useLogger(logger);

  // Middleware chain order matching v3: compression → helmet → cors → body parsers → routes
  app.use(compression());
  app.use(helmet());
  app.enableCors();

  // Global validation pipe matching v3 format
  app.useGlobalPipes(createValidationPipe());

  // Body parser limits matching v3's 50mb
  const express = await import('express');
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Enable graceful shutdown hooks (OnModuleDestroy lifecycle)
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 5011);

  await app.listen(port);
  logger.log(`Application running on port ${port}`, 'Bootstrap');
}

async function main() {
  const cpus = parseInt(process.env.CPUS || '1', 10);

  if (cpus > 1) {
    ClusterService.clusterize(bootstrap, cpus);
  } else {
    bootstrap();
  }
}

main();
