import { Worker } from 'worker_threads';

/**
 * Spawn a worker thread and return a Promise that resolves/rejects
 * based on the worker's outcome. Mirrors v3 runWorker() behaviour.
 *
 * @param workerPath Absolute path to the compiled worker .js file
 * @param workerData Payload passed to the worker via workerData
 */
export function runWorker<T>(workerPath: string, workerData: T): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData });

    worker.on('message', (msg: { success: boolean; error?: string }) => {
      if (msg?.success === false) {
        reject(new Error(msg.error ?? 'Worker reported failure'));
      }
    });

    worker.on('error', (err) => reject(err));

    worker.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}
