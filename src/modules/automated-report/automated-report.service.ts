import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CoreAutomatedReport } from '../../database/entities/core-automated-report.entity';
import { CoreAutomatedReportEmail } from '../../database/entities/core-automated-report-email.entity';
import { CoreAutomatedReportSftp } from '../../database/entities/core-automated-report-sftp.entity';
import { CoreReport } from '../../database/entities/core-report.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { EncryptionHelperService } from '../../shared/services/encryption-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';
import {
  AutomatedReportDto,
  AutomatedReportSftpDto,
  ListAutomatedReportDto,
  SaveAutomatedReportDto,
  UpdateAutomatedReportDto,
} from './dto/automated-report.dto';

@Injectable()
export class AutomatedReportService {
  constructor(
    @InjectRepository(CoreAutomatedReport)
    private readonly arRepo: Repository<CoreAutomatedReport>,
    @InjectRepository(CoreAutomatedReportEmail)
    private readonly arEmailRepo: Repository<CoreAutomatedReportEmail>,
    @InjectRepository(CoreAutomatedReportSftp)
    private readonly arSftpRepo: Repository<CoreAutomatedReportSftp>,
    @InjectRepository(CoreReport)
    private readonly reportRepo: Repository<CoreReport>,
    private readonly legacyDataDb: LegacyDataDbService,
    private readonly dateHelper: DateHelperService,
    private readonly encryption: EncryptionHelperService,
  ) {}

  async create(dto: SaveAutomatedReportDto, userId: string): Promise<void> {
    if (dto.method === 'email' && (!dto.emails || dto.emails.length === 0)) {
      throw new BadRequestException(ErrorMessages.AR_NO_EMAILS);
    }
    if (dto.method === 'sftp' && (!dto.sfpt || dto.sfpt.length === 0)) {
      throw new BadRequestException(ErrorMessages.AR_NO_SFTP);
    }

    const reportExists = await this.reportRepo.exists({ where: { id: dto.reportId } });
    if (!reportExists) {
      throw new BadRequestException(ErrorMessages.AR_USED_REPORT_NOT_EXISTS);
    }

    const id = uuidv4();
    const now = new Date();

    const ar = this.arRepo.create({
      id,
      ownerId: userId,
      title: dto.title,
      reportId: dto.reportId,
      timeFilter: dto.timeFilter,
      isActive: dto.isActive ? 1 : 0,
      reportHourInterval: dto.reportHourInterval,
      reportDayInterval: dto.reportDayInterval,
      relativeHour: dto.relativeHour,
      relativeDay: dto.relativeDay,
      exportType: dto.exportType,
      recurringDays: dto.recurringDays ?? 0,
      recurringHours: dto.recurringHours ?? 0,
      firstOccurence: this.dateHelper.parseISO(dto.firstOccurence),
      emailSubject: dto.emailSubject ?? '',
      emailDescription: dto.emailDescription ?? '',
      isDeleted: 0,
      method: dto.method,
      createdOn: now,
    });
    await this.arRepo.save(ar);

    if (dto.method === 'email') {
      const emailEntities = (dto.emails ?? []).map((email) =>
        this.arEmailRepo.create({ email, automatedReportId: id }),
      );
      await this.arEmailRepo.save(emailEntities);
    } else if (dto.method === 'sftp') {
      const aesKey = await this.encryption.getEncryptionKey();
      for (const s of dto.sfpt ?? []) {
        await this.legacyDataDb.query(
          `INSERT INTO core_automated_report_sftp (host, username, password, path, automatedReportId) VALUES (?, ?, AES_ENCRYPT(?, ?), ?, ?)`,
          [s.host, s.username, s.password, aesKey, s.path, id],
        );
      }
    }
  }

  async update(dto: UpdateAutomatedReportDto, id: string, userId: string): Promise<void> {
    if (dto.method === 'email' && (!dto.emails || dto.emails.length === 0)) {
      throw new BadRequestException(ErrorMessages.AR_NO_EMAILS);
    }
    if (dto.method === 'sftp' && (!dto.sfpt || dto.sfpt.length === 0)) {
      throw new BadRequestException(ErrorMessages.AR_NO_SFTP);
    }

    const arExists = await this.arRepo.findOne({ where: { id, ownerId: userId } });
    if (!arExists) {
      throw new BadRequestException(ErrorMessages.AR_NOT_FOUND);
    }

    const reportExists = await this.reportRepo.exists({ where: { id: dto.reportId } });
    if (!reportExists) {
      throw new BadRequestException(ErrorMessages.AR_USED_REPORT_NOT_EXISTS);
    }

    await this.arRepo.update(
      { id, ownerId: userId },
      {
        ownerId: userId,
        title: dto.title,
        reportId: dto.reportId,
        timeFilter: dto.timeFilter,
        isActive: dto.isActive ? 1 : 0,
        reportHourInterval: dto.reportHourInterval,
        reportDayInterval: dto.reportDayInterval,
        relativeHour: dto.relativeHour,
        relativeDay: dto.relativeDay,
        exportType: dto.exportType,
        recurringDays: dto.recurringDays,
        recurringHours: dto.recurringHours,
        firstOccurence: this.dateHelper.parseISO(dto.firstOccurence),
        emailSubject: dto.emailSubject ?? '',
        emailDescription: dto.emailDescription ?? '',
        method: dto.method,
      },
    );

    // Replace email/sftp records
    await this.legacyDataDb.query('DELETE FROM core_automated_report_sftp WHERE automatedReportId = ?', [id]);
    await this.legacyDataDb.query('DELETE FROM core_automated_report_email WHERE automatedReportId = ?', [id]);

    if (dto.method === 'email') {
      const emailEntities = (dto.emails ?? []).map((email) =>
        this.arEmailRepo.create({ email, automatedReportId: id }),
      );
      await this.arEmailRepo.save(emailEntities);
    } else if (dto.method === 'sftp') {
      const aesKey = await this.encryption.getEncryptionKey();
      for (const s of dto.sfpt ?? []) {
        await this.legacyDataDb.query(
          `INSERT INTO core_automated_report_sftp (host, username, password, path, automatedReportId) VALUES (?, ?, AES_ENCRYPT(?, ?), ?, ?)`,
          [s.host, s.username, s.password, aesKey, s.path, id],
        );
      }
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.arRepo.update({ id, ownerId: userId }, { isDeleted: 1, deletedOn: new Date() });
  }

  async toggleStatus(id: string, userId: string): Promise<boolean> {
    const ar = await this.arRepo.findOne({
      where: { id, ownerId: userId },
      select: { isActive: true },
    });
    if (!ar) {
      throw new BadRequestException(ErrorMessages.AR_NOT_FOUND);
    }

    const newIsActive = ar.isActive === 0 ? 1 : 0;
    await this.arRepo.update({ id, ownerId: userId }, { isActive: newIsActive, activatedOn: new Date() });
    return newIsActive === 1;
  }

  async listByUser(userId: string): Promise<ListAutomatedReportDto[]> {
    const rows = await this.arRepo.find({
      where: { ownerId: userId, isDeleted: 0 },
      select: { id: true, title: true, isActive: true },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title ?? '',
      isActive: r.isActive === 1,
    }));
  }

  async listByReportId(userId: string, reportId: string): Promise<ListAutomatedReportDto[]> {
    const rows = await this.arRepo.find({
      where: { ownerId: userId, reportId, isDeleted: 0 },
      select: { id: true, title: true, isActive: true },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title ?? '',
      isActive: r.isActive === 1,
    }));
  }

  async getById(userId: string, id: string): Promise<AutomatedReportDto> {
    const ar = await this.arRepo
      .createQueryBuilder('ar')
      .select([
        'ar.id',
        'ar.title',
        'ar.isActive',
        'ar.timeFilter',
        'ar.reportId',
        'ar.reportHourInterval',
        'ar.reportDayInterval',
        'ar.relativeHour',
        'ar.relativeDay',
        'ar.exportType',
        'ar.recurringHours',
        'ar.recurringDays',
        'ar.firstOccurence',
        'ar.method',
        'ar.emailSubject',
        'ar.emailDescription',
      ])
      .where('ar.id = :id AND ar.ownerId = :userId AND ar.isDeleted = 0', { id, userId })
      .getRawOne<Record<string, unknown>>();

    if (!ar) {
      throw new BadRequestException(ErrorMessages.AR_NOT_FOUND);
    }

    const result: AutomatedReportDto = {
      id: ar['ar_id'] as string,
      title: ar['ar_title'] as string,
      isActive: (ar['ar_isActive'] as number) === 1,
      timeFilter: ar['ar_timeFilter'] as string,
      reportId: ar['ar_reportId'] as string,
      reportHourInterval: ar['ar_reportHourInterval'] as number,
      reportDayInterval: ar['ar_reportDayInterval'] as number,
      relativeHour: ar['ar_relativeHour'] as number,
      relativeDay: ar['ar_relativeDay'] as number,
      exportType: ar['ar_exportType'] as string,
      recurringHours: ar['ar_recurringHours'] as number,
      recurringDays: ar['ar_recurringDays'] as number,
      firstOccurence: ar['ar_firstOccurence']
        ? this.dateHelper.formatPassedDate(ar['ar_firstOccurence'] as Date, 'yyyy-MM-dd HH:mm')
        : '',
      method: ar['ar_method'] as string,
      emailSubject: ar['ar_emailSubject'] as string,
      emailDescription: ar['ar_emailDescription'] as string,
      emails: [],
      sfpt: [],
    };

    if (result.method === 'email') {
      const emailRows = await this.legacyDataDb.query<{ emails: string }>(
        `SELECT GROUP_CONCAT(CONCAT('"', email, '"')) AS emails FROM core_automated_report_email WHERE automatedReportId = ?`,
        [id],
      );
      if (emailRows[0]?.emails) {
        result.emails = JSON.parse('[' + emailRows[0].emails + ']') as string[];
      }
    } else if (result.method === 'sftp') {
      const aesKey = await this.encryption.getEncryptionKey();
      const sftpRows = await this.legacyDataDb.query<AutomatedReportSftpDto>(
        `SELECT username, CAST(AES_DECRYPT(password, ?) AS CHAR) AS password, host, path FROM core_automated_report_sftp WHERE automatedReportId = ?`,
        [aesKey, id],
      );
      result.sfpt = sftpRows;
    }

    return result;
  }
}
