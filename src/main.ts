import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ClusterService } from './cluster/cluster.service';
import { AppLogger } from './logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(AppLogger);
  app.useLogger(logger);

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
