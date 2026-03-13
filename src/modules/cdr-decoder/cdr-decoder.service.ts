import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fsPromise } from 'fs';
import { join, resolve } from 'path';
import { Repository } from 'typeorm';
import { CoreCdrDecodeProcess } from '../../database/entities/core-cdr-decode-process.entity';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { SystemKeys } from '../../shared/constants/system-keys';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { generateGuid } from '../../shared/helpers/common.helper';
import { runWorker } from '../../shared/utils/worker.util';
import { CdrDecoderWorkDto, ListCdrDecodeDto } from './dto/cdr-decoder.dto';
import { CDRFileType, CdrDecodeStatus, CdrFileType, CompressionType } from './enums/cdr-decoder.enum';

const CDR_UPLOADS_PATH = join(process.cwd(), 'assets/cdrDecoder/uploads');
const CDR_DECODED_PATH = join(process.cwd(), 'assets/cdrDecoder/decoded');
const CDR_SCRIPT_PATH = join(process.cwd(), 'src/scripts/cdrDecoder.script.py');
const CDR_WORKER_PATH = resolve(process.cwd(), 'dist/scripts/worker/cdrDecoder.worker.js');

@Injectable()
export class CdrDecoderService {
  private readonly logger = new Logger(CdrDecoderService.name);

  constructor(
    @InjectRepository(CoreCdrDecodeProcess)
    private readonly cdrRepo: Repository<CoreCdrDecodeProcess>,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async list(currentUserId: string): Promise<ListCdrDecodeDto[]> {
    const dateFormat = await this.systemConfig.getConfigValue(SystemKeys.dateFormat1);
    const fmt = dateFormat ?? '%Y-%m-%d %H:%i:%s';
    return this.cdrRepo
      .createQueryBuilder('p')
      .select([
        'p.id AS id',
        'p.name AS name',
        'p.originalFileName AS originalFileName',
        'p.fileType AS fileType',
        'p.status AS status',
        'p.recordCount AS recordCount',
        `DATE_FORMAT(p.createdAt, '${fmt}') AS createdAt`,
        '(SELECT u.userName FROM core_application_users u WHERE u.id = p.createdBy) AS createdBy',
      ])
      .where('p.createdBy = :userId', { userId: currentUserId })
      .orderBy('p.createdAt', 'DESC')
      .getRawMany<ListCdrDecodeDto>();
  }

  async decode(file: Express.Multer.File, name: string, currentUserId: string): Promise<{ id: string }> {
    const compressionType = this._detectCompressionType(file.buffer);
    if (!compressionType) {
      throw new BadRequestException(ErrorMessages.CDR_INVALID_FILE_FORMAT);
    }

    const processId = generateGuid();
    const fileType = this._detectFileType(file.originalname);
    const originalFileName = file.originalname;
    const originalFilePath = join(CDR_UPLOADS_PATH, `${processId}_${originalFileName}`);

    const outputExtension = compressionType === 'gzip' ? '.gz' : '.zip';
    const decodedFileName = `${processId}_${originalFileName}_decoded.json${outputExtension}`;
    const decodedFilePath = join(CDR_DECODED_PATH, decodedFileName);

    await fsPromise.mkdir(CDR_UPLOADS_PATH, { recursive: true });
    await fsPromise.mkdir(CDR_DECODED_PATH, { recursive: true });
    await fsPromise.writeFile(originalFilePath, file.buffer as Uint8Array);

    const record = this.cdrRepo.create({
      id: processId,
      name,
      originalFileName,
      originalFilePath,
      decodedFilePath,
      fileType,
      status: CdrDecodeStatus.PROCESSING,
      createdBy: currentUserId,
      createdAt: new Date(),
    });
    await this.cdrRepo.save(record);

    const workerData: CdrDecoderWorkDto = {
      id: processId,
      originalFilePath,
      decodedFilePath,
      scriptPath: CDR_SCRIPT_PATH,
      compressionType,
      fileType: fileType as CdrFileType,
    };

    runWorker<CdrDecoderWorkDto>(CDR_WORKER_PATH, workerData).catch((error: Error) => {
      this.logger.warn(`[CdrDecoder] Worker failed for ${processId}: ${error.message}`);
      this.cdrRepo.update({ id: processId }, { status: CdrDecodeStatus.FAILED, errorMessage: error.message });
    });

    return { id: processId };
  }

  async download(processId: string, type: CDRFileType, currentUserId: string): Promise<string> {
    const record = await this.cdrRepo.findOne({
      where: { id: processId, createdBy: currentUserId },
      select: { id: true, originalFilePath: true, decodedFilePath: true, status: true },
    });
    if (!record) {
      throw new NotFoundException(ErrorMessages.CDR_PROCESS_NOT_FOUND);
    }

    if (type === CDRFileType.OUTPUT && record.status !== CdrDecodeStatus.COMPLETED) {
      throw new BadRequestException(ErrorMessages.CDR_FILE_UNAVAILABLE);
    }

    const filePath = type === CDRFileType.INPUT ? record.originalFilePath : record.decodedFilePath;

    if (!filePath) {
      throw new NotFoundException(ErrorMessages.CDR_FILE_NOT_FOUND);
    }

    try {
      await fsPromise.access(filePath);
    } catch {
      throw new NotFoundException(ErrorMessages.CDR_FILE_NOT_FOUND);
    }

    return filePath;
  }

  async delete(processId: string, currentUserId: string): Promise<void> {
    const record = await this.cdrRepo.findOne({
      where: { id: processId, createdBy: currentUserId },
      select: { id: true, originalFilePath: true, decodedFilePath: true, status: true },
    });
    if (!record) {
      throw new NotFoundException(ErrorMessages.CDR_PROCESS_NOT_FOUND);
    }
    if (record.status === CdrDecodeStatus.PROCESSING) {
      throw new BadRequestException(ErrorMessages.CDR_FAILED_DELETE_RUNNING);
    }

    if (record.originalFilePath) {
      await fsPromise.unlink(record.originalFilePath).catch((e: Error) => {
        this.logger.warn(`[CdrDecoder] Could not delete original file: ${e.message}`);
      });
    }
    if (record.decodedFilePath) {
      await fsPromise.unlink(record.decodedFilePath).catch((e: Error) => {
        this.logger.warn(`[CdrDecoder] Could not delete decoded file: ${e.message}`);
      });
    }

    await this.cdrRepo.delete({ id: processId });
  }

  private _detectCompressionType(buffer: Buffer): CompressionType | null {
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) return 'gzip';
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'zip';
    return null;
  }

  private _detectFileType(filename: string): string {
    const upper = filename.toUpperCase();
    if (upper.includes('SDPCDR')) return CdrFileType.SDP;
    if (upper.includes('AIROUTPUTCDR') || upper.endsWith('.AIR')) return CdrFileType.AIR;
    if (upper.includes('CCNCDR')) return CdrFileType.CCN;
    if (upper.includes('TTFILE')) return CdrFileType.TTFILE;
    if (upper.includes('ABMPG')) return CdrFileType.ABMPG;
    return CdrFileType.UNKNOWN;
  }
}
