import { Injectable, Logger } from '@nestjs/common';
import cluster from 'node:cluster';
import { cpus } from 'node:os';
import { createServer } from 'http';
import { setupMaster } from '@socket.io/sticky';

@Injectable()
export class ClusterService {
  private static readonly logger = new Logger('ClusterService');

  static clusterize(callback: () => void, numCpusToUse: number): void {
    const numCPUs = cpus().length;
    const workersToFork = Math.min(numCpusToUse, numCPUs);

    if (cluster.isPrimary) {
      ClusterService.logger.warn(`Primary ${process.pid} is running`);
      ClusterService.logger.warn(`Using ${workersToFork} out of ${numCPUs} CPUs`);

      // Set up sticky sessions for Socket.IO
      const httpServer = createServer();
      setupMaster(httpServer, {
        loadBalancingMethod: 'round-robin',
      });

      // Fork workers
      for (let i = 0; i < workersToFork; i++) {
        cluster.fork();
      }

      cluster.on('error', (err) => {
        ClusterService.logger.error('WORKER ERROR', err.stack);
      });

      // Auto-restart dead workers
      cluster.on('exit', (worker) => {
        ClusterService.logger.warn(`Worker ${worker.process.pid} died`);
        const activeWorkers = Object.values(cluster.workers || {}).length;
        if (activeWorkers < workersToFork) {
          ClusterService.logger.warn('Starting replacement worker...');
          cluster.fork();
        }
      });
    } else {
      ClusterService.logger.warn(`Worker ${process.pid} started`);

      // Graceful shutdown on uncaught exceptions
      process.on('uncaughtException', (error) => {
        ClusterService.logger.error(`Worker ${process.pid} uncaughtException: ${error.stack}`);
        process.exit(1);
      });

      callback();
    }
  }
}
