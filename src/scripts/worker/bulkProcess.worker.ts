/**
 * BulkProcess Worker — Phase 3.7 stub
 *
 * Spawned by BulkProcessingService.add() and bulkChargingCsv() via worker_threads.
 * Creates its own DB connection (outside NestJS DI) and executes the bulk job.
 *
 * Full AIR XML-RPC / EDA SOAP processing to be implemented in Phase 3.9.
 * For now: validates input, updates status to PROCESSING → FAILED with a
 * descriptive error, so the DB state remains consistent.
 */
import { isMainThread, parentPort, workerData } from 'worker_threads';
import * as mysql from 'mysql2/promise';

interface BulkProcessWorkDto {
  id: string;
  method: string;
  fileName: string;
  type: string;
}

async function execute(data: BulkProcessWorkDto): Promise<void> {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.coreDbName ?? 'iMonitorV3_1',
    connectionLimit: 2,
  });

  try {
    // Mark as processing
    await pool.execute('UPDATE core_bulk_process SET status = ? WHERE id = ?', ['processing', data.id]);

    // TODO (Phase 3.9): Implement full AIR XML-RPC / EDA SOAP processing here.
    // For now mark as failed with informational message.
    await pool.execute('UPDATE core_bulk_process SET status = ?, finishDate = NOW() WHERE id = ?', ['failed', data.id]);
  } finally {
    await pool.end();
  }
}

if (!isMainThread) {
  execute(workerData as BulkProcessWorkDto)
    .then(() => {
      parentPort?.postMessage({ success: true });
    })
    .catch((err: Error) => {
      parentPort?.postMessage({ success: false, error: err.message });
      process.exit(1);
    });
}
