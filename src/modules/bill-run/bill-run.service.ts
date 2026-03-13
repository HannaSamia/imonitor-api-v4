import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parse } from 'fast-csv';
import { createReadStream, promises as fsPromise } from 'fs';
import { extname, join, resolve } from 'path';
import { Repository } from 'typeorm';
import { CoreBillRunProcess } from '../../database/entities/core-bill-run-process.entity';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { SystemKeys } from '../../shared/constants/system-keys';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { generateGuid } from '../../shared/helpers/common.helper';
import { runWorker } from '../../shared/utils/worker.util';
import { BillRunFileType, BillRunStatus } from './enums/bill-run.enum';
import { BillRunWorkDto, ListBillRunDto } from './dto/bill-run.dto';

const BILLRUN_INPUT_PATH = join(process.cwd(), 'assets/billRun/input');
const BILLRUN_OUTPUT_PATH = join(process.cwd(), 'assets/billRun/output');
const BILLRUN_WORKER_PATH = resolve(process.cwd(), 'dist/scripts/worker/billRun.worker.js');

@Injectable()
export class BillRunService {
  private readonly logger = new Logger(BillRunService.name);

  constructor(
    @InjectRepository(CoreBillRunProcess)
    private readonly billRunRepo: Repository<CoreBillRunProcess>,
    private readonly dateHelper: DateHelperService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async list(currentUserId: string): Promise<ListBillRunDto[]> {
    const dateFormat = await this.systemConfig.getConfigValue(SystemKeys.dateFormat1);
    const fmt = dateFormat ?? '%Y-%m-%d %H:%i:%s';
    return this.billRunRepo
      .createQueryBuilder('p')
      .select([
        'p.id AS id',
        'p.name AS name',
        'p.status AS status',
        'p.msisdnCount AS msisdnCount',
        'p.cdrRecordCount AS cdrRecordCount',
        'p.daRecordCount AS daRecordCount',
        'p.startDate AS startDate',
        'p.endDate AS endDate',
        `DATE_FORMAT(p.createdAt, '${fmt}') AS createdAt`,
        '(SELECT u.userName FROM core_application_users u WHERE u.id = p.createdBy) AS createdBy',
      ])
      .where('p.createdBy = :userId', { userId: currentUserId })
      .orderBy('p.createdAt', 'DESC')
      .getRawMany<ListBillRunDto>();
  }

  async add(file: Express.Multer.File, name: string, currentUserId: string): Promise<{ id: string }> {
    const ext = extname(file.originalname).replace('.', '').toLowerCase();
    if (ext !== 'csv') {
      throw new BadRequestException(ErrorMessages.BILLRUN_ONLY_CSV);
    }

    const processId = generateGuid();
    const inputFileName = `${processId}.csv`;
    const inputFilePath = join(BILLRUN_INPUT_PATH, inputFileName);
    const outputFileName = `${processId}_output.xlsx`;
    const outputFilePath = join(BILLRUN_OUTPUT_PATH, outputFileName);

    await fsPromise.mkdir(BILLRUN_INPUT_PATH, { recursive: true });
    await fsPromise.mkdir(BILLRUN_OUTPUT_PATH, { recursive: true });
    await fsPromise.writeFile(inputFilePath, file.buffer as Uint8Array);

    const msisdns = await this._parseMsisdns(inputFilePath);
    if (msisdns.length === 0) {
      await fsPromise.unlink(inputFilePath);
      throw new BadRequestException(ErrorMessages.BILLRUN_INVALID_MSISDNS);
    }

    const { startDate, endDate } = this.dateHelper.getFirstOfMonthAndDMinus1();

    const record = this.billRunRepo.create({
      id: processId,
      name,
      inputFilePath,
      outputFilePath,
      msisdnCount: msisdns.length,
      startDate,
      endDate,
      status: BillRunStatus.PROCESSING,
      createdBy: currentUserId,
      createdAt: new Date(),
    });
    await this.billRunRepo.save(record);

    const workerData: BillRunWorkDto = {
      id: processId,
      inputFilePath,
      outputFilePath,
      startDate,
      endDate,
    };

    runWorker<BillRunWorkDto>(BILLRUN_WORKER_PATH, workerData).catch((error: Error) => {
      this.logger.warn(`[BillRun] Worker failed for ${processId}: ${error.message}`);
      this.billRunRepo.update({ id: processId }, { status: BillRunStatus.FAILED, errorMessage: error.message });
    });

    return { id: processId };
  }

  async download(processId: string, type: BillRunFileType, currentUserId: string): Promise<string> {
    const record = await this.billRunRepo.findOne({
      where: { id: processId, createdBy: currentUserId },
      select: { id: true, inputFilePath: true, outputFilePath: true, status: true },
    });
    if (!record) {
      throw new NotFoundException(ErrorMessages.BILLRUN_NOT_FOUND);
    }

    if (type === BillRunFileType.OUTPUT && record.status !== BillRunStatus.COMPLETED) {
      throw new BadRequestException(ErrorMessages.BILLRUN_NOT_COMPLETED);
    }

    const filePath = type === BillRunFileType.INPUT ? record.inputFilePath : record.outputFilePath;

    if (!filePath) {
      throw new BadRequestException(ErrorMessages.BILLRUN_FILE_UNAVAILABLE);
    }

    try {
      await fsPromise.access(filePath);
    } catch {
      throw new NotFoundException(ErrorMessages.BILLRUN_FILE_NOT_FOUND);
    }

    return filePath;
  }

  async delete(processId: string, currentUserId: string): Promise<void> {
    const record = await this.billRunRepo.findOne({
      where: { id: processId, createdBy: currentUserId },
      select: { id: true, inputFilePath: true, outputFilePath: true, status: true },
    });
    if (!record) {
      throw new NotFoundException(ErrorMessages.BILLRUN_NOT_FOUND);
    }
    if (record.status === BillRunStatus.PROCESSING) {
      throw new BadRequestException(ErrorMessages.BILLRUN_DELETE_RUNNING);
    }

    for (const filePath of [record.inputFilePath, record.outputFilePath]) {
      if (filePath) {
        await fsPromise.unlink(filePath).catch((e: Error) => {
          this.logger.warn(`[BillRun] Could not delete file: ${e.message}`);
        });
      }
    }

    await this.billRunRepo.delete({ id: processId });
  }

  private _parseMsisdns(filePath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const msisdns: string[] = [];
      createReadStream(filePath)
        .pipe(parse({ headers: true, trim: true }))
        .on('data', (row: Record<string, string>) => {
          const val = row.msisdn_key?.toString().trim();
          if (val && /^\d+$/.test(val)) {
            msisdns.push(val);
          }
        })
        .on('end', () => resolve(msisdns))
        .on('error', (err: Error) => reject(err));
    });
  }
}
