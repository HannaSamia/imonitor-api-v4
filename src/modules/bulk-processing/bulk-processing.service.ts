import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fsPromise } from 'fs';
import { extname, join } from 'path';
import { Repository } from 'typeorm';
import { CoreBulkProcess } from '../../database/entities/core-bulk-process.entity';
import { CoreBulkProcessFailure } from '../../database/entities/core-bulk-process-failure.entity';
import { CoreBulkProcessMethod } from '../../database/entities/core-bulk-process-method.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { SystemKeys } from '../../shared/constants/system-keys';
import { generateGuid, isEmptyString, isUndefinedOrNull } from '../../shared/helpers/common.helper';
import {
  AddBulkProcessDto,
  BulkAirServerDto,
  BulkProcessMethodsDto,
  BulkProcessWorkDto,
  ListBulkProcessDto,
  ScheduleBulkProcessDto,
  UpdateBulkProcessDto,
} from './dto/bulk-processing.dto';
import { BulkMethodsType, BulkProcessFileType, BulkProcessStatus } from './enums/bulk-process.enum';
import { runWorker } from '../../shared/utils/worker.util';
import { resolve } from 'path';

const BULK_INPUT_PATH = join(process.cwd(), 'assets/bulk/input');
const BULK_OUTPUT_PATH = join(process.cwd(), 'assets/bulk/output');
// Worker path — compiled output relative to project root
const BULK_WORKER_PATH = resolve(process.cwd(), 'dist/scripts/worker/bulkProcess.worker.js');

// iMonitorData table name (preserving v3 constant)
const AIR_NODES_TABLE = 'V3_air_nodes';

@Injectable()
export class BulkProcessingService {
  constructor(
    @InjectRepository(CoreBulkProcess)
    private readonly bulkProcessRepo: Repository<CoreBulkProcess>,
    @InjectRepository(CoreBulkProcessMethod)
    private readonly bulkMethodRepo: Repository<CoreBulkProcessMethod>,
    @InjectRepository(CoreBulkProcessFailure)
    private readonly bulkFailureRepo: Repository<CoreBulkProcessFailure>,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly systemConfig: SystemConfigService,
    private readonly dateHelper: DateHelperService,
  ) {}

  async list(type: BulkMethodsType, currentUserId: string): Promise<ListBulkProcessDto[]> {
    const dateFormat = await this.systemConfig.getConfigValue(SystemKeys.dateFormat1);
    const qb = this.bulkProcessRepo
      .createQueryBuilder('p')
      .select([
        'p.id AS id',
        'p.name AS name',
        'p.status AS status',
        'p.method AS method',
        `DATE_FORMAT(p.processingDate, '${dateFormat}') AS processingDate`,
        `DATE_FORMAT(p.createdAt, '${dateFormat}') AS createdAt`,
        '(SELECT u.userName FROM core_users u WHERE u.id = p.createdBy) AS createdBy',
      ])
      .where('p.type = :type', { type })
      .andWhere('p.isDeleted = 0')
      .orderBy('p.createdAt', 'DESC');

    return qb.getRawMany<ListBulkProcessDto>();
  }

  async listMethods(type: BulkMethodsType, _currentUserId: string): Promise<BulkProcessMethodsDto[]> {
    return this.bulkMethodRepo.find({
      where: { type },
      select: { id: true, name: true, headerSample: true },
    }) as unknown as BulkProcessMethodsDto[];
  }

  async listAirs(): Promise<BulkAirServerDto[]> {
    const configuredIps = await this.systemConfig.getConfigValue(SystemKeys.bulkProcessAirs);
    if (isEmptyString(configuredIps ?? '')) {
      return [];
    }

    const ipList = (configuredIps ?? '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (ipList.length === 0) {
      return [];
    }

    const placeholders = ipList.map(() => '?').join(', ');
    const rows = await this.legacyDataDb.query<{ id: string; node_name: string }>(
      `SELECT id, node_name FROM ${AIR_NODES_TABLE} WHERE ip_address IN (${placeholders})`,
      ipList,
    );

    return rows.map((r) => ({ id: String(r.id), name: r.node_name }));
  }

  async add(file: Express.Multer.File, dto: AddBulkProcessDto, currentUserId: string): Promise<void> {
    const ext = extname(file.originalname).replace('.', '').toLowerCase();
    if (ext !== 'csv') {
      throw new BadRequestException(ErrorMessages.BULK_FILE_NOT_SUPPORTED);
    }

    const method = await this.bulkMethodRepo.findOne({
      where: { id: Number(dto.methodId) },
    });
    if (!method) {
      throw new NotFoundException(ErrorMessages.BULK_PROCESS_NOT_FOUND);
    }

    const processId = generateGuid();
    const fileName = `${processId}.csv`;
    const filePath = join(BULK_INPUT_PATH, fileName);
    await fsPromise.mkdir(BULK_INPUT_PATH, { recursive: true });
    await fsPromise.writeFile(filePath, file.buffer as Uint8Array);

    const process = this.bulkProcessRepo.create({
      id: processId,
      name: dto.name,
      method: method.name,
      fileOriginalName: file.originalname,
      inputFile: fileName,
      status: BulkProcessStatus.NOW,
      type: method.type,
      createdBy: currentUserId,
      createdAt: new Date(),
      processingDate: new Date(),
    });
    await this.bulkProcessRepo.save(process);

    const workerData: BulkProcessWorkDto = {
      id: processId,
      method: method.name ?? '',
      fileName,
      type: method.type ?? BulkMethodsType.AIR,
    };

    runWorker<BulkProcessWorkDto>(BULK_WORKER_PATH, workerData).catch(() => {
      this.bulkProcessRepo.update({ id: processId }, { status: BulkProcessStatus.FAILED, finishDate: new Date() });
    });
  }

  async schedule(file: Express.Multer.File, dto: ScheduleBulkProcessDto, currentUserId: string): Promise<void> {
    const ext = extname(file.originalname).replace('.', '').toLowerCase();
    if (ext !== 'csv') {
      throw new BadRequestException(ErrorMessages.BULK_FILE_NOT_SUPPORTED);
    }

    const method = await this.bulkMethodRepo.findOne({
      where: { id: Number(dto.methodId) },
    });
    if (!method) {
      throw new NotFoundException(ErrorMessages.BULK_PROCESS_NOT_FOUND);
    }

    const processId = generateGuid();
    const fileName = `${processId}.csv`;
    const filePath = join(BULK_INPUT_PATH, fileName);
    await fsPromise.mkdir(BULK_INPUT_PATH, { recursive: true });
    await fsPromise.writeFile(filePath, file.buffer as Uint8Array);

    const scheduledDate = this.dateHelper.parseISO(dto.date);
    const process = this.bulkProcessRepo.create({
      id: processId,
      name: dto.name,
      method: method.name,
      fileOriginalName: file.originalname,
      inputFile: fileName,
      status: BulkProcessStatus.PENDING,
      type: method.type,
      createdBy: currentUserId,
      createdAt: new Date(),
      processingDate: scheduledDate,
    });
    await this.bulkProcessRepo.save(process);
    // Scheduled process — triggered by cron (Phase 3.9)
  }

  async update(dto: UpdateBulkProcessDto, currentUserId: string): Promise<void> {
    const process = await this.bulkProcessRepo.findOne({
      where: { id: dto.id, isDeleted: 0 },
    });
    if (!process) {
      throw new NotFoundException(ErrorMessages.BULK_PROCESS_NOT_FOUND);
    }
    if (process.status !== BulkProcessStatus.PENDING) {
      throw new BadRequestException(ErrorMessages.BULK_UPDATE_NOT_PENDING);
    }

    const updates: Partial<CoreBulkProcess> = {
      updatedBy: currentUserId,
      updatedAt: new Date(),
    };
    if (dto.name) updates.name = dto.name;
    if (dto.method) updates.method = dto.method;
    if (dto.date) updates.processingDate = this.dateHelper.parseISO(dto.date);

    await this.bulkProcessRepo.update({ id: dto.id }, updates);
  }

  async delete(processId: string, currentUserId: string): Promise<void> {
    const process = await this.bulkProcessRepo.findOne({
      where: { id: processId, isDeleted: 0 },
    });
    if (!process) {
      throw new NotFoundException(ErrorMessages.BULK_PROCESS_NOT_FOUND);
    }
    if (process.status === BulkProcessStatus.NOW || process.status === BulkProcessStatus.PROCESSING) {
      throw new BadRequestException(ErrorMessages.BULK_WAIT_TILL_FINISHED);
    }

    await this.bulkProcessRepo.update(
      { id: processId },
      {
        isDeleted: 1,
        deletedAt: new Date(),
        deletedBy: currentUserId,
      },
    );
  }

  async download(processId: string, type: string): Promise<string> {
    const process = await this.bulkProcessRepo.findOne({
      where: { id: processId, isDeleted: 0 },
      select: { id: true, status: true, inputFile: true, outputFile: true },
    });
    if (!process) {
      throw new NotFoundException(ErrorMessages.BULK_PROCESS_NOT_FOUND);
    }

    if (type === BulkProcessFileType.INPUT) {
      if (!process.inputFile) {
        throw new BadRequestException(ErrorMessages.BULK_PROCESS_DOWNLOAD_FAILED);
      }
      return join(BULK_INPUT_PATH, process.inputFile);
    }

    if (type === BulkProcessFileType.OUTPUT) {
      if (process.status !== BulkProcessStatus.FINISHED && process.status !== BulkProcessStatus.INCOMPLETE) {
        throw new BadRequestException(ErrorMessages.BULK_PROCESS_NOT_FINISHED);
      }
      if (!process.outputFile) {
        throw new BadRequestException(ErrorMessages.BULK_PROCESS_DOWNLOAD_FAILED);
      }
      return join(BULK_OUTPUT_PATH, process.outputFile);
    }

    throw new BadRequestException(ErrorMessages.BULK_WRONG_FILE_TYPE);
  }

  async bulkChargingCsv(file: Express.Multer.File): Promise<void> {
    const processId = generateGuid();
    const fileName = `${processId}.csv`;
    const filePath = join(BULK_INPUT_PATH, fileName);
    await fsPromise.mkdir(BULK_INPUT_PATH, { recursive: true });
    await fsPromise.writeFile(filePath, file.buffer as Uint8Array);

    const workerData: BulkProcessWorkDto = {
      id: processId,
      method: 'GetBalanceAndDate',
      fileName,
      type: BulkMethodsType.AIR,
    };

    runWorker<BulkProcessWorkDto>(BULK_WORKER_PATH, workerData).catch(() => {
      // Fire-and-forget — worker logs its own errors
    });
  }
}
