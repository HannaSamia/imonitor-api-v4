import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // CORS configuration (SH-02 security fix: explicit origin from env)
  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global validation pipe matching v3 format
  app.useGlobalPipes(createValidationPipe());

  // Body parser limits matching v3's 50mb
  const express = await import('express');
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Swagger API documentation (non-production or behind SWAGGER_ENABLED flag)
  const swaggerEnabled = configService.get<string>('SWAGGER_ENABLED', 'true') !== 'false';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('iMonitor API v4')
      .setDescription(
        'Enterprise telecom monitoring API — real-time dashboards, automated reporting, and customer care operations',
      )
      .setVersion('4.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);
    logger.log('Swagger UI available at /api-docs', 'Bootstrap');
  }

  // Enable graceful shutdown hooks (OnModuleDestroy lifecycle)
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT', 5011);

  await app.listen(port);
  logger.log(`Application running on port ${port}`, 'Bootstrap');
}

async function main() {
  const cpus = parseInt(process.env.CPUS || '1', 10);
  const port = parseInt(process.env.PORT || '5011', 10);

  if (cpus > 1) {
    ClusterService.clusterize(bootstrap, cpus, port);
  } else {
    bootstrap();
  }
}

main();
