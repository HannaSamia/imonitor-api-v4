import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CronJob } from 'cron';
import * as path from 'path';
import * as child_process from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { CoreAutomatedReport } from '../../database/entities/core-automated-report.entity';
import { CoreAutomatedReportCleaning } from '../../database/entities/core-automated-report-cleaning.entity';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';

// Cron expressions matching v3 startup.ts exactly
const CRON_AR = '*/1 * * * *';
const CRON_RETENTION_CLEANING = '0 0 1 * *';
const CRON_SCHEDULED_BULK = '*/10 * * * *';
const CRON_AR_RETENTION = '0 1 * * *';
const CRON_OB_ALARMS = '*/1 * * * *';

// v3 sys_config key for dynamic cleanup cron expression
const CLEANUP_CRON_KEY = 'cleanUpCron';
const CLEANUP_JOB_NAME = 'requestArchiveCleanup';

// Default cleanup cron if key not found in sys_config
const CRON_CLEANUP_DEFAULT = '0 0 * * *';

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(CoreAutomatedReport)
    private readonly automatedReportRepo: Repository<CoreAutomatedReport>,
    @InjectRepository(CoreAutomatedReportCleaning)
    private readonly arCleaningRepo: Repository<CoreAutomatedReportCleaning>,
    private readonly systemConfigService: SystemConfigService,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /** Initializes the dynamic requestArchiveCleanup cron from sys_config on startup. */
  async onModuleInit(): Promise<void> {
    if (isTestEnv()) return;
    await this.initRequestArchiveCleanupCron();
  }

  async initRequestArchiveCleanupCron(): Promise<void> {
    const expression = (await this.systemConfigService.getConfigValue(CLEANUP_CRON_KEY)) ?? CRON_CLEANUP_DEFAULT;
    const job = new CronJob(expression, () => {
      void this.runRequestArchiveCleanup();
    });
    this.schedulerRegistry.addCronJob(CLEANUP_JOB_NAME, job);
    job.start();
    this.logger.log(`requestArchiveCleanup cron registered: ${expression}`);
  }

  // ─── Cron Job: Automated Reports ─────────────────────────────────────────────

  @Cron(CRON_AR, { name: 'automatedReport' })
  async runAutomatedReports(): Promise<void> {
    if (isTestEnv()) return;

    let pendingReports: CoreAutomatedReport[] = [];
    try {
      pendingReports = await this.automatedReportRepo.find({
        where: { isActive: 1, isDeleted: 0, processId: IsNull() },
      });
    } catch (err) {
      this.logger.error('Failed to query pending automated reports', (err as Error).stack);
      return;
    }

    const now = new Date();
    for (const ar of pendingReports) {
      // Skip if firstOccurence hasn't been reached yet
      if (ar.firstOccurence && ar.firstOccurence > now) continue;

      const processId = uuidv4();
      await this.automatedReportRepo.update({ id: ar.id }, { processId });

      this.forkWorker('automatedReport.worker.js', {
        id: ar.id,
        reportId: ar.reportId,
        ownerId: ar.ownerId,
        title: ar.title,
        timeFilter: ar.timeFilter,
        method: ar.method,
        exportType: ar.exportType,
        reportHourInterval: ar.reportHourInterval,
        reportDayInterval: ar.reportDayInterval,
        relativeHour: ar.relativeHour,
        relativeDay: ar.relativeDay,
        emailSubject: ar.emailSubject ?? '',
        emailDescription: ar.emailDescription ?? '',
      }, {
        onSuccess: async () => {
          await this.automatedReportRepo.update(
            { id: ar.id },
            { processId: null, lastRunDate: new Date(), errorStack: null, errorOn: null },
          );
        },
        onError: async (errorStack: string) => {
          await this.automatedReportRepo.update(
            { id: ar.id },
            { processId: null, errorStack, errorOn: new Date() },
          );
        },
      });
    }
  }

  // ─── Cron Job: Automated Report Retention Cleaning ───────────────────────────

  @Cron(CRON_RETENTION_CLEANING, { name: 'retentionCleaning' })
  async runRetentionCleaning(): Promise<void> {
    if (isTestEnv()) return;

    const retentionDaysStr = await this.systemConfigService.getConfigValue('automatedReportRetentionDays');
    const retentionDays = retentionDaysStr ? parseInt(retentionDaysStr, 10) : 30;
    const processId = uuidv4();

    this.forkWorker('automatedReportRetentionCleaning.worker.js', { retentionDays, processId }, {
      onSuccess: async (msg: Record<string, unknown>) => {
        const nbOfDeletedFiles = typeof msg.deleted === 'number' ? msg.deleted : 0;
        const record = this.arCleaningRepo.create({ processId, runDate: new Date(), nbOfDeletedFiles });
        await this.arCleaningRepo.save(record);
        this.logger.log(`AR retention cleaning done — deleted ${nbOfDeletedFiles} files`);
      },
      onError: async (errorStack: string) => {
        const record = this.arCleaningRepo.create({ processId, runDate: new Date(), errorStack, errorOn: new Date() });
        await this.arCleaningRepo.save(record);
        this.logger.error('AR retention cleaning failed', errorStack);
      },
    });
  }

  // ─── Cron Job: Scheduled Bulk Process ────────────────────────────────────────

  @Cron(CRON_SCHEDULED_BULK, { name: 'scheduledBulkProcess' })
  runScheduledBulkProcess(): void {
    if (isTestEnv()) return;

    this.forkWorker('scheduledBulkProcess.worker.js', {}, {
      onSuccess: async (msg: Record<string, unknown>) => {
        this.logger.log(`Scheduled bulk process done — processed: ${msg.processed ?? 0}`);
      },
      onError: async (errorStack: string) => {
        this.logger.error('Scheduled bulk process worker error', errorStack);
      },
    });
  }

  // ─── Cron Job: Request Archive Cleanup (dynamic) ─────────────────────────────

  async runRequestArchiveCleanup(): Promise<void> {
    if (isTestEnv()) return;

    this.forkWorker('requestArchiveCleanup.worker.js', {}, {
      onSuccess: async (msg: Record<string, unknown>) => {
        this.logger.log(`Request archive cleanup done — deleted ${msg.deleted ?? 0} files`);
      },
      onError: async (errorStack: string) => {
        this.logger.error('Request archive cleanup worker error', errorStack);
      },
    });
  }

  // ─── Cron Job: Request Archive DB Retention ──────────────────────────────────

  @Cron(CRON_AR_RETENTION, { name: 'requestArchiveRetention' })
  runRequestArchiveRetention(): void {
    if (isTestEnv()) return;

    this.forkWorker('databaseRetentionCleanup.worker.js', {}, {
      onSuccess: async (msg: Record<string, unknown>) => {
        this.logger.log(`DB retention cleanup done — deleted ${msg.deleted ?? 0} rows`);
      },
      onError: async (errorStack: string) => {
        this.logger.error('DB retention cleanup worker error', errorStack);
      },
    });
  }

  // ─── Cron Job: Observability Alarms ──────────────────────────────────────────

  @Cron(CRON_OB_ALARMS, { name: 'observabilityAlarms' })
  runObservabilityAlarms(): void {
    if (isTestEnv()) return;

    this.forkWorker('observabilityAlarms.worker.js', {}, {
      onSuccess: async () => {
        this.logger.debug('Observability alarms cycle complete');
      },
      onError: async (errorStack: string) => {
        this.logger.error('Observability alarms worker error', errorStack);
      },
    });
  }

  // ─── Worker Fork Helper ───────────────────────────────────────────────────────

  private forkWorker(
    workerFile: string,
    data: Record<string, unknown>,
    handlers: {
      onSuccess: (msg: Record<string, unknown>) => Promise<void>;
      onError: (errorStack: string) => Promise<void>;
    },
  ): void {
    const workerPath = path.join(__dirname, '../../scripts/worker', workerFile);
    const worker = child_process.fork(workerPath, [], {
      env: { ...process.env },
      silent: true,
    });

    worker.send(JSON.stringify(data));

    worker.on('message', (msg: unknown) => {
      void handlers.onSuccess((msg as Record<string, unknown>) ?? {});
    });

    worker.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.logger.warn(`Worker ${workerFile} exited with code ${code}`);
      }
    });

    worker.on('error', (err) => {
      void handlers.onError(err.stack ?? err.message);
    });
  }
}
