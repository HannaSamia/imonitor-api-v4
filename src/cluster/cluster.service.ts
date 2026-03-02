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

      const port = parseInt(process.env.PORT || '5011', 10);
      httpServer.on('error', (err) => {
        ClusterService.logger.error(`Sticky session server error: ${err.message}`);
      });
      httpServer.listen(port, () => {
        ClusterService.logger.warn(`Sticky session server listening on port ${port}`);
      });

      // Fork workers
      for (let i = 0; i < workersToFork; i++) {
        cluster.fork();
      }

      cluster.on('error', (err) => {
        ClusterService.logger.error('WORKER ERROR', err.stack);
      });

      // Auto-restart dead workers
      let shuttingDown = false;
      cluster.on('exit', (worker) => {
        ClusterService.logger.warn(`Worker ${worker.process.pid} died`);
        if (shuttingDown) return;
        const activeWorkers = Object.values(cluster.workers || {}).length;
        if (activeWorkers < workersToFork) {
          ClusterService.logger.warn('Starting replacement worker...');
          cluster.fork();
        }
      });

      // Graceful shutdown on SIGTERM — stop accepting, let workers finish
      process.on('SIGTERM', () => {
        ClusterService.logger.warn('SIGTERM received — shutting down cluster gracefully');
        shuttingDown = true;
        httpServer.close();
        for (const id in cluster.workers) {
          cluster.workers[id]?.process.kill('SIGTERM');
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
