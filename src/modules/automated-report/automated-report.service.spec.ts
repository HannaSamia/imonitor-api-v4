import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AutomatedReportService } from './automated-report.service';
import { CoreAutomatedReport } from '../../database/entities/core-automated-report.entity';
import { CoreAutomatedReportEmail } from '../../database/entities/core-automated-report-email.entity';
import { CoreAutomatedReportSftp } from '../../database/entities/core-automated-report-sftp.entity';
import { CoreReport } from '../../database/entities/core-report.entity';
import { LegacyDataDbService } from '../../database/legacy-data-db/legacy-data-db.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { EncryptionHelperService } from '../../shared/services/encryption-helper.service';
import { ErrorMessages } from '../../shared/constants/error-messages';

const USER_ID = 'user-001';
const AR_ID = 'ar-001';
const REPORT_ID = 'report-001';

function createMockQueryBuilder(rawResult: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawResult),
  };
}

describe('AutomatedReportService', () => {
  let service: AutomatedReportService;
  let arRepo: any;
  let arEmailRepo: any;
  let arSftpRepo: any;
  let reportRepo: any;
  let legacyDataDb: jest.Mocked<LegacyDataDbService>;
  let dateHelper: jest.Mocked<DateHelperService>;
  let encryption: jest.Mocked<EncryptionHelperService>;

  beforeEach(async () => {
    arRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      exists: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    arEmailRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue([]),
    };
    arSftpRepo = {};
    reportRepo = {
      exists: jest.fn(),
    };
    legacyDataDb = {
      query: jest.fn(),
    } as any;
    dateHelper = {
      parseISO: jest.fn().mockReturnValue(new Date('2026-03-13T08:00:00Z')),
      formatPassedDate: jest.fn().mockReturnValue('2026-03-13 08:00'),
    } as any;
    encryption = {
      getEncryptionKey: jest.fn().mockResolvedValue('aes-key'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomatedReportService,
        { provide: getRepositoryToken(CoreAutomatedReport), useValue: arRepo },
        { provide: getRepositoryToken(CoreAutomatedReportEmail), useValue: arEmailRepo },
        { provide: getRepositoryToken(CoreAutomatedReportSftp), useValue: arSftpRepo },
        { provide: getRepositoryToken(CoreReport), useValue: reportRepo },
        { provide: LegacyDataDbService, useValue: legacyDataDb },
        { provide: DateHelperService, useValue: dateHelper },
        { provide: EncryptionHelperService, useValue: encryption },
      ],
    }).compile();

    service = module.get<AutomatedReportService>(AutomatedReportService);
  });

  describe('create()', () => {
    it('throws if method=email and emails is empty', async () => {
      await expect(
        service.create({ method: 'email', emails: [], sfpt: [], reportId: REPORT_ID } as any, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if method=sftp and sfpt is empty', async () => {
      await expect(
        service.create({ method: 'sftp', sfpt: [], emails: [], reportId: REPORT_ID } as any, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if report does not exist', async () => {
      reportRepo.exists.mockResolvedValue(false);
      await expect(
        service.create({ method: 'email', emails: ['a@b.com'], reportId: REPORT_ID } as any, USER_ID),
      ).rejects.toThrow(ErrorMessages.AR_USED_REPORT_NOT_EXISTS);
    });

    it('creates an automated report with email method', async () => {
      reportRepo.exists.mockResolvedValue(true);
      await service.create(
        {
          method: 'email',
          emails: ['a@b.com'],
          title: 'Test',
          reportId: REPORT_ID,
          timeFilter: 'daily',
          isActive: true,
          reportHourInterval: 0,
          reportDayInterval: 1,
          relativeHour: 0,
          relativeDay: 0,
          exportType: 'pdf',
          recurringHours: 0,
          recurringDays: 0,
          firstOccurence: '2026-03-13 08:00',
        } as any,
        USER_ID,
      );
      expect(arRepo.save).toHaveBeenCalled();
      expect(arEmailRepo.save).toHaveBeenCalled();
    });

    it('creates an automated report with sftp method', async () => {
      reportRepo.exists.mockResolvedValue(true);
      legacyDataDb.query.mockResolvedValue([]);
      await service.create(
        {
          method: 'sftp',
          sfpt: [{ host: '1.2.3.4', username: 'user', password: 'pass', path: '/out' }],
          title: 'Test',
          reportId: REPORT_ID,
          timeFilter: 'daily',
          isActive: false,
          reportHourInterval: 0,
          reportDayInterval: 1,
          relativeHour: 0,
          relativeDay: 0,
          exportType: 'csv',
          recurringHours: 0,
          recurringDays: 0,
          firstOccurence: '2026-03-13 08:00',
        } as any,
        USER_ID,
      );
      expect(arRepo.save).toHaveBeenCalled();
      expect(legacyDataDb.query).toHaveBeenCalledWith(expect.stringContaining('AES_ENCRYPT'), expect.any(Array));
    });
  });

  describe('delete()', () => {
    it('soft-deletes by setting isDeleted=1', async () => {
      await service.delete(AR_ID, USER_ID);
      expect(arRepo.update).toHaveBeenCalledWith(
        { id: AR_ID, ownerId: USER_ID },
        expect.objectContaining({ isDeleted: 1 }),
      );
    });
  });

  describe('toggleStatus()', () => {
    it('throws if record not found', async () => {
      arRepo.findOne.mockResolvedValue(null);
      await expect(service.toggleStatus(AR_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('toggles isActive from 1 to 0', async () => {
      arRepo.findOne.mockResolvedValue({ isActive: 1 });
      const result = await service.toggleStatus(AR_ID, USER_ID);
      expect(result).toBe(false);
      expect(arRepo.update).toHaveBeenCalledWith(
        { id: AR_ID, ownerId: USER_ID },
        expect.objectContaining({ isActive: 0 }),
      );
    });

    it('toggles isActive from 0 to 1', async () => {
      arRepo.findOne.mockResolvedValue({ isActive: 0 });
      const result = await service.toggleStatus(AR_ID, USER_ID);
      expect(result).toBe(true);
    });
  });

  describe('listByUser()', () => {
    it('returns mapped list', async () => {
      arRepo.find.mockResolvedValue([
        { id: AR_ID, title: 'Report 1', isActive: 1 },
        { id: 'ar-002', title: 'Report 2', isActive: 0 },
      ]);
      const result = await service.listByUser(USER_ID);
      expect(result).toHaveLength(2);
      expect(result[0].isActive).toBe(true);
      expect(result[1].isActive).toBe(false);
    });
  });

  describe('listByReportId()', () => {
    it('returns list filtered by reportId', async () => {
      arRepo.find.mockResolvedValue([{ id: AR_ID, title: 'Rep', isActive: 1 }]);
      const result = await service.listByReportId(USER_ID, REPORT_ID);
      expect(result).toHaveLength(1);
      expect(arRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ reportId: REPORT_ID }) }),
      );
    });
  });

  describe('getById()', () => {
    const rawRow = {
      ar_id: AR_ID,
      ar_title: 'My Report',
      ar_isActive: 1,
      ar_timeFilter: 'daily',
      ar_reportId: REPORT_ID,
      ar_reportHourInterval: 0,
      ar_reportDayInterval: 1,
      ar_relativeHour: 0,
      ar_relativeDay: 0,
      ar_exportType: 'pdf',
      ar_recurringHours: 0,
      ar_recurringDays: 0,
      ar_firstOccurence: new Date('2026-03-13T08:00:00Z'),
      ar_method: 'email',
      ar_emailSubject: 'Subject',
      ar_emailDescription: 'Desc',
    };

    it('throws if record not found', async () => {
      arRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(null));
      await expect(service.getById(USER_ID, AR_ID)).rejects.toThrow(BadRequestException);
    });

    it('returns record with emails for email method', async () => {
      arRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(rawRow));
      legacyDataDb.query.mockResolvedValue([{ emails: '"a@b.com","c@d.com"' }]);
      const result = await service.getById(USER_ID, AR_ID);
      expect(result.method).toBe('email');
      expect(result.emails).toHaveLength(2);
    });

    it('returns record with decrypted sftp for sftp method', async () => {
      const sftpRow = { ...rawRow, ar_method: 'sftp' };
      arRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder(sftpRow));
      legacyDataDb.query.mockResolvedValue([{ username: 'usr', password: 'dec-pass', host: '1.2.3.4', path: '/out' }]);
      const result = await service.getById(USER_ID, AR_ID);
      expect(result.method).toBe('sftp');
      expect(result.sfpt ?? []).toHaveLength(1);
      expect((result.sfpt ?? [])[0].password).toBe('dec-pass');
    });
  });
});
