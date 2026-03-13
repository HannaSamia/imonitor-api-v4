import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { join } from 'path';
import { Repository } from 'typeorm';
import { CoreTarrifProcess } from '../../database/entities/core-tarrif-process.entity';
import { CoreTarrifRecords } from '../../database/entities/core-tarrif-records.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { SystemKeys } from '../../shared/constants/system-keys';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { fileExists, generateGuid, isUndefinedOrNull } from '../../shared/helpers/common.helper';
import { TarrifProcessStatus } from './enums/tarrif-process.enum';
import { ListTarrifLogDto, TarrifLogDto, TarrifTypeDto } from './dto/tarrif-log.dto';

const TARRIF_ASSETS_PATH = join(process.cwd(), 'assets/tarrif');
const SERVICE_CLASSES_TABLE = 'V3_service_classes';

@Injectable()
export class TarrifLogService {
  constructor(
    @InjectRepository(CoreTarrifProcess)
    private readonly tarrifProcessRepo: Repository<CoreTarrifProcess>,
    @InjectRepository(CoreTarrifRecords)
    private readonly tarrifRecordsRepo: Repository<CoreTarrifRecords>,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly systemConfig: SystemConfigService,
    private readonly dateHelper: DateHelperService,
  ) {}

  async list(): Promise<ListTarrifLogDto[]> {
    const dateFormat = await this.systemConfig.getConfigValue(SystemKeys.dateFormat1);
    const fmt = dateFormat ?? '%Y-%m-%d %H:%i:%s';

    return this.tarrifProcessRepo
      .createQueryBuilder('p')
      .select([
        'p.id AS id',
        'p.status AS status',
        `DATE_FORMAT(p.compareDate, '${fmt}') AS date`,
        `DATE_FORMAT(p.compareToDate, '${fmt}') AS compareDate`,
        `DATE_FORMAT(p.createdAt, '${fmt}') AS createdAt`,
        `IFNULL((SELECT sc_name FROM V3_service_classes WHERE sc_code = p.serviceClassId), 'Not Found') AS tarrif`,
        '(SELECT u.userName FROM core_application_users u WHERE u.id = p.createdBy) AS createdBy',
      ])
      .where('p.isDeleted = 0')
      .orderBy('p.createdBy', 'DESC')
      .getRawMany<ListTarrifLogDto>();
  }

  async listTarrif(): Promise<TarrifTypeDto[]> {
    return this.legacyDataDb.query<TarrifTypeDto>(
      `SELECT sc_code AS id, sc_name AS name FROM ${SERVICE_CLASSES_TABLE} WHERE tarrif_id IS NOT NULL`,
    );
  }

  async listTreeDates(id: string): Promise<string[]> {
    const rows = await this.legacyDataDb.query<{ id: number }>(
      `SELECT tarrif_id AS id FROM ${SERVICE_CLASSES_TABLE} WHERE sc_code = ?`,
      [id],
    );

    if (rows.length === 0) {
      throw new BadRequestException(ErrorMessages.TARRIF_NOT_CORRECT);
    }

    const tarrifId = rows[0].id;
    const dates = await this.tarrifRecordsRepo
      .createQueryBuilder('r')
      .select(`DATE_FORMAT(r.fileDate, '%Y-%m-%d %H:%i:%s') AS formatedDate`)
      .where('r.treeId = :treeId', { treeId: tarrifId })
      .getRawMany<{ formatedDate: string }>();

    return dates.map((d) => d.formatedDate);
  }

  async add(body: TarrifLogDto, currentUserId: string): Promise<void> {
    const parsedDate = this.dateHelper.parseISO(body.date);
    const parsedCompareDate = this.dateHelper.parseISO(body.compareDate);

    if (this.dateHelper.isAfterDate(parsedDate)) {
      throw new BadRequestException(ErrorMessages.TARRIF_CANNOT_CHOOSE_FUTURE_DATE);
    }
    if (this.dateHelper.isAfterDate(parsedCompareDate)) {
      throw new BadRequestException(ErrorMessages.TARRIF_CANNOT_CHOOSE_FUTURE_DATE);
    }
    if (body.date === body.compareDate) {
      throw new BadRequestException(ErrorMessages.TARRIF_SAME_DATE);
    }

    const tarrifRows = await this.legacyDataDb.query<{ id: number }>(
      `SELECT tarrif_id AS id FROM ${SERVICE_CLASSES_TABLE} WHERE sc_code = ?`,
      [body.tarrifId],
    );
    if (tarrifRows.length === 0) {
      throw new BadRequestException(ErrorMessages.TARRIF_NOT_CORRECT);
    }

    const id = generateGuid();
    const record = this.tarrifProcessRepo.create({
      id,
      compareDate: parsedDate,
      compareToDate: parsedCompareDate,
      status: TarrifProcessStatus.PENDING,
      tarrifId: tarrifRows[0].id,
      serviceClassId: String(body.tarrifId),
      createdBy: currentUserId,
      createdAt: new Date(),
    });
    await this.tarrifProcessRepo.save(record);

    const triggerResult = await this._triggerTarrifProcess(id);
    if (triggerResult?.status !== 200) {
      await this.tarrifProcessRepo.delete({ id });
      throw new BadRequestException(triggerResult?.message ?? ErrorMessages.TARRIF_TRIGGER_PROCESS_ERROR);
    }
  }

  async download(id: string): Promise<string> {
    const exists = await this.tarrifProcessRepo.exists({ where: { id } });
    if (!exists) {
      throw new NotFoundException(ErrorMessages.TARRIF_NOT_FOUND);
    }

    const filePath = join(TARRIF_ASSETS_PATH, `${id}.html`);
    const tarrifExists = await fileExists(filePath);

    if (!tarrifExists) {
      const result = await this._pullTarrifProcess(id);
      if (result?.message !== 'FILE_RESENT') {
        throw new BadRequestException(ErrorMessages.TARRIF_FILE_NOT_FOUND_WAIT);
      }
    }

    return filePath;
  }

  async delete(processId: string, currentUserId: string): Promise<void> {
    const record = await this.tarrifProcessRepo.findOne({
      where: { id: processId, isDeleted: 0 },
      select: { id: true, status: true },
    });

    if (isUndefinedOrNull(record) || !record) {
      throw new BadRequestException(ErrorMessages.TARRIF_NOT_FOUND);
    }
    if (record.status === TarrifProcessStatus.PENDING || record.status === TarrifProcessStatus.PROCESSING) {
      throw new BadRequestException(ErrorMessages.TARRIF_WAIT_TILL_FINISHED);
    }

    await this.tarrifProcessRepo.update(
      { id: processId },
      {
        isDeleted: 1,
        deletedAt: new Date(),
        deletedBy: currentUserId,
      },
    );
  }

  private async _triggerTarrifProcess(id: string): Promise<{ status: number; message: string } | null> {
    const config = await this.systemConfig.getConfigValues([SystemKeys.tarrifProcessUrl, SystemKeys.tarrifProcessKey]);
    const url = `${config[SystemKeys.tarrifProcessUrl]}/${id}`;
    const key = config[SystemKeys.tarrifProcessKey];

    return axios
      .get<{ status: number; message: string }>(url, { headers: { access_token: key } })
      .then((r) => r.data)
      .catch((err) => {
        if (err.response) return err.response.data as { status: number; message: string };
        throw new BadRequestException(ErrorMessages.TARRIF_TRIGGER_PROCESS_ERROR);
      });
  }

  private async _pullTarrifProcess(id: string): Promise<{ status: number; message: string } | null> {
    const config = await this.systemConfig.getConfigValues([
      SystemKeys.tarrifPullProcessUrl,
      SystemKeys.tarrifProcessKey,
    ]);
    const url = `${config[SystemKeys.tarrifPullProcessUrl]}/${id}`;
    const key = config[SystemKeys.tarrifProcessKey];

    return axios
      .get<{ status: number; message: string }>(url, { headers: { access_token: key } })
      .then((r) => r.data)
      .catch((err) => {
        if (err.response) return err.response.data as { status: number; message: string };
        throw new BadRequestException(ErrorMessages.TARRIF_TRIGGER_PROCESS_ERROR);
      });
  }
}
