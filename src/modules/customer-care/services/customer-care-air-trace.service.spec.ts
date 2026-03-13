import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerCareAirTraceService } from './customer-care-air-trace.service';
import { SystemConfigService } from '../../../shared/services/system-config.service';
import { DateHelperService } from '../../../shared/services/date-helper.service';
import { LegacyDataDbService } from '../../../database/legacy-data-db/legacy-data-db.service';
import { ExportHelperService } from '../../../shared/services/export-helper.service';
import { CoreTraceTracker, TraceTrackerStatus } from '../../../database/entities/core-trace-tracker.entity';
import { ErrorMessages } from '../../../shared/constants/error-messages';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_AIR_CRED = {
  ip_address: '10.0.0.1',
  ssh_user: 'admin',
  ssh_pass: 'pass123',
  gui_user: 'guiuser',
  gui_pass: 'guipass',
};

const MOCK_USER_ID = 'user-123';
const MOCK_MSISDN = '961123456';

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe('CustomerCareAirTraceService', () => {
  let service: CustomerCareAirTraceService;
  let systemConfigService: Record<string, jest.Mock>;
  let dateHelperService: Record<string, jest.Mock>;
  let legacyDataDbService: Record<string, jest.Mock>;
  let exportHelperService: Record<string, jest.Mock>;
  let traceTrackerRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    systemConfigService = {
      getConfigValues: jest.fn().mockResolvedValue([]),
    };

    dateHelperService = {
      differenceInMinutes: jest.fn().mockReturnValue(5),
      formatDate: jest.fn().mockImplementation((_fmt: string, date: Date) => date.toISOString()),
    };

    legacyDataDbService = {
      query: jest.fn().mockResolvedValue([]),
    };

    exportHelperService = {
      exportHtml: jest.fn().mockResolvedValue('/path/to/export.html'),
    };

    traceTrackerRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      query: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerCareAirTraceService,
        { provide: SystemConfigService, useValue: systemConfigService },
        { provide: DateHelperService, useValue: dateHelperService },
        { provide: LegacyDataDbService, useValue: legacyDataDbService },
        { provide: ExportHelperService, useValue: exportHelperService },
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation(
                (key: string) => ({ DB_CORE_NAME: 'iMonitorV3_1', DB_DATA_NAME: 'iMonitorData' })[key],
              ),
          },
        },
        { provide: getRepositoryToken(CoreTraceTracker), useValue: traceTrackerRepo },
      ],
    }).compile();

    service = module.get<CustomerCareAirTraceService>(CustomerCareAirTraceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── setAirTrace ───────────────────────────────────────────────────────

  describe('setAirTrace', () => {
    it('should throw BadRequestException when no AIR credentials found', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([]);

      await expect(service.setAirTrace(MOCK_MSISDN, MOCK_USER_ID)).rejects.toThrow(ErrorMessages.CC_SFTP_SSH_FAILED);
    });

    it('should throw BadRequestException when all nodes have PATH_NOT_FOUND', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeAirTraceOnNode').mockRejectedValue(new Error('PATH_NOT_FOUND'));

      await expect(service.setAirTrace(MOCK_MSISDN, MOCK_USER_ID)).rejects.toThrow(ErrorMessages.CC_AIR_PATH_NOT_FOUND);
    });

    it('should throw BadRequestException when all nodes have SSH failures', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeAirTraceOnNode').mockRejectedValue(new Error('SSH_FAILED'));

      await expect(service.setAirTrace(MOCK_MSISDN, MOCK_USER_ID)).rejects.toThrow(ErrorMessages.CC_SFTP_SSH_FAILED);
    });

    it('should throw BadRequestException when all nodes have upload failures', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeAirTraceOnNode').mockRejectedValue(new Error('UPLOAD_FAILED'));

      await expect(service.setAirTrace(MOCK_MSISDN, MOCK_USER_ID)).rejects.toThrow(ErrorMessages.CC_SFTP_UPLOAD_FAILED);
    });

    it('should throw BadRequestException when all nodes return false (trace error)', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeAirTraceOnNode').mockResolvedValue(false);

      await expect(service.setAirTrace(MOCK_MSISDN, MOCK_USER_ID)).rejects.toThrow(
        ErrorMessages.CC_ERROR_SETTING_TRACE,
      );
    });

    it('should record trace in DB when at least one node succeeds', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeAirTraceOnNode').mockResolvedValue(true);

      await service.setAirTrace(MOCK_MSISDN, MOCK_USER_ID);

      expect(traceTrackerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TraceTrackerStatus.SET,
          node: 'AIR',
          phoneNumber: MOCK_MSISDN,
          createdby: MOCK_USER_ID,
        }),
      );
      expect(traceTrackerRepo.save).toHaveBeenCalled();
    });

    it('should succeed even if some nodes fail but not all', async () => {
      const creds = [
        { ...MOCK_AIR_CRED, ip_address: '10.0.0.1' },
        { ...MOCK_AIR_CRED, ip_address: '10.0.0.2' },
      ];
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue(creds);
      jest
        .spyOn(service as any, 'executeAirTraceOnNode')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await service.setAirTrace(MOCK_MSISDN, MOCK_USER_ID);

      expect(traceTrackerRepo.save).toHaveBeenCalled();
    });
  });

  // ─── unsetAirTrace ─────────────────────────────────────────────────────

  describe('unsetAirTrace', () => {
    it('should throw BadRequestException when no AIR credentials found', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([]);

      await expect(service.unsetAirTrace(MOCK_MSISDN, MOCK_USER_ID)).rejects.toThrow(ErrorMessages.CC_SFTP_SSH_FAILED);
    });

    it('should throw BadRequestException when all nodes fail with trace errors', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeAirTraceOnNode').mockResolvedValue(false);

      await expect(service.unsetAirTrace(MOCK_MSISDN, MOCK_USER_ID)).rejects.toThrow(
        ErrorMessages.CC_ERROR_SETTING_TRACE,
      );
    });

    it('should record unset trace in DB on success', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeAirTraceOnNode').mockResolvedValue(true);

      await service.unsetAirTrace(MOCK_MSISDN, MOCK_USER_ID);

      expect(traceTrackerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TraceTrackerStatus.UNSET,
          node: 'AIR',
          phoneNumber: MOCK_MSISDN,
          createdby: MOCK_USER_ID,
        }),
      );
      expect(traceTrackerRepo.save).toHaveBeenCalled();
    });
  });

  // ─── fetchAirTrace ─────────────────────────────────────────────────────

  describe('fetchAirTrace', () => {
    const fromTime = '2026-03-12 10:00:00';
    const toTime = '2026-03-12 10:05:00';

    it('should throw BadRequestException when time range exceeds 10 minutes', async () => {
      dateHelperService.differenceInMinutes.mockReturnValue(15);

      await expect(service.fetchAirTrace(fromTime, toTime, MOCK_MSISDN)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no AIR credentials found', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([]);

      await expect(service.fetchAirTrace(fromTime, toTime, MOCK_MSISDN)).rejects.toThrow(
        ErrorMessages.CC_SFTP_SSH_FAILED,
      );
    });

    it('should throw BadRequestException when all nodes fail', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeSshCommand').mockRejectedValue(new Error('ssh fail'));

      await expect(service.fetchAirTrace(fromTime, toTime, MOCK_MSISDN)).rejects.toThrow(
        ErrorMessages.CC_TRACE_DATA_FAILURE,
      );
    });

    it('should return AirDownloadableDTO with "No trace" message when SSH returns empty', async () => {
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeSshCommand').mockResolvedValue('');

      const result = await service.fetchAirTrace(fromTime, toTime, MOCK_MSISDN);

      expect(result).toEqual({ data: '<span>No trace was found!</span>' });
      expect(result.downloadUrl).toBeUndefined();
    });

    it('should return AirDownloadableDTO with processed trace data', async () => {
      const rawTrace = `Module: TestModule|Info: data for ${MOCK_MSISDN}|`;
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeSshCommand').mockResolvedValue(rawTrace);

      const result = await service.fetchAirTrace(fromTime, toTime, MOCK_MSISDN);

      expect(result.data).toContain(`<span style="color:red">${MOCK_MSISDN}</span>`);
      expect(result.data).toContain('<b>');
      expect(result.downloadUrl).toBeUndefined();
    });

    it('should return downloadUrl when trace exceeds 4MB and baseUrl is provided', async () => {
      // Generate large trace data (>4MB)
      const largeData = 'x'.repeat(5 * 1024 * 1024);
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeSshCommand').mockResolvedValue(largeData + '|');

      const baseUrl = 'http://localhost:5011';
      const result = await service.fetchAirTrace(fromTime, toTime, MOCK_MSISDN, baseUrl);

      expect(result.downloadUrl).toBeDefined();
      expect(result.downloadUrl).toContain('/api/v1/operations/trace/air/download/');
      expect(result.data).toBe(result.downloadUrl);
    });

    it('should NOT return downloadUrl when trace exceeds 4MB but no baseUrl', async () => {
      const largeData = 'x'.repeat(5 * 1024 * 1024);
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue([MOCK_AIR_CRED]);
      jest.spyOn(service as any, 'executeSshCommand').mockResolvedValue(largeData + '|');

      const result = await service.fetchAirTrace(fromTime, toTime, MOCK_MSISDN);

      expect(result.downloadUrl).toBeUndefined();
    });

    it('should skip nodes with missing credentials', async () => {
      const creds = [{ ip_address: '', ssh_user: '', ssh_pass: '', gui_user: '', gui_pass: '' }, MOCK_AIR_CRED];
      jest.spyOn(service as any, 'getAirNodeCredentials').mockResolvedValue(creds);
      const sshSpy = jest.spyOn(service as any, 'executeSshCommand').mockResolvedValue('data|');

      await service.fetchAirTrace(fromTime, toTime, MOCK_MSISDN);

      expect(sshSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── exportAirTraceHtml ────────────────────────────────────────────────

  describe('exportAirTraceHtml', () => {
    const fromTime = '2026-03-12 10:00:00';
    const toTime = '2026-03-12 10:05:00';

    it('should call fetchAirTrace and exportHtml on success', async () => {
      jest.spyOn(service, 'fetchAirTrace').mockResolvedValue({ data: '<b>trace data</b>' });

      const result = await service.exportAirTraceHtml(fromTime, toTime, MOCK_MSISDN);

      expect(service.fetchAirTrace).toHaveBeenCalledWith(fromTime, toTime, MOCK_MSISDN, undefined);
      expect(exportHelperService.exportHtml).toHaveBeenCalledWith('<b>trace data</b>');
      expect(result).toBe('/path/to/export.html');
    });

    it('should throw BadRequestException when trace has downloadUrl (too large)', async () => {
      jest.spyOn(service, 'fetchAirTrace').mockResolvedValue({
        data: 'http://localhost/download',
        downloadUrl: 'http://localhost/download',
      });

      await expect(service.exportAirTraceHtml(fromTime, toTime, MOCK_MSISDN, 'http://localhost')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include download URL in error message when trace is too large', async () => {
      const downloadUrl = 'http://localhost:5011/api/v1/operations/trace/air/download/2026/2026/961';
      jest.spyOn(service, 'fetchAirTrace').mockResolvedValue({
        data: downloadUrl,
        downloadUrl,
      });

      await expect(service.exportAirTraceHtml(fromTime, toTime, MOCK_MSISDN, 'http://localhost:5011')).rejects.toThrow(
        downloadUrl,
      );
    });
  });

  // ─── downloadAirTrace ──────────────────────────────────────────────────

  describe('downloadAirTrace', () => {
    const fromTime = '2026-03-12 10:00:00';
    const toTime = '2026-03-12 10:05:00';

    it('should return ITextToFile with content and fileName', async () => {
      jest.spyOn(service, 'fetchAirTrace').mockResolvedValue({ data: '<b>trace content</b>' });

      const result = await service.downloadAirTrace(fromTime, toTime, MOCK_MSISDN);

      expect(result.content).toBe('<b>trace content</b>');
      expect(result.fileName).toBe(`trace_${fromTime}_${toTime}`);
    });

    it('should call fetchAirTrace without baseUrl', async () => {
      jest.spyOn(service, 'fetchAirTrace').mockResolvedValue({ data: 'data' });

      await service.downloadAirTrace(fromTime, toTime, MOCK_MSISDN);

      expect(service.fetchAirTrace).toHaveBeenCalledWith(fromTime, toTime, MOCK_MSISDN);
    });
  });

  // ─── fetchTraceHistory ─────────────────────────────────────────────────

  describe('fetchTraceHistory', () => {
    const fromDate = '2026-03-01';
    const toDate = '2026-03-12';

    it('should return header and body from trace tracker query', async () => {
      const mockRows = [
        { node: 'SDP', status: 'set', phoneNumber: '961123456', createdAt: '2026-03-12 10:00:00', CreatedBy: 'admin' },
      ];
      traceTrackerRepo.query.mockResolvedValue(mockRows);

      const result = await service.fetchTraceHistory(fromDate, toDate);

      expect(result.header).toHaveLength(5);
      expect(result.header[0]).toEqual(expect.objectContaining({ field: 'node', cellsalign: 'left' }));
      expect(result.body).toEqual(mockRows);
    });

    it('should return empty header and body when no results', async () => {
      traceTrackerRepo.query.mockResolvedValue([]);

      const result = await service.fetchTraceHistory(fromDate, toDate);

      expect(result.header).toEqual([]);
      expect(result.body).toEqual([]);
    });

    it('should call traceTrackerRepo.query with SQL containing date range', async () => {
      traceTrackerRepo.query.mockResolvedValue([]);

      await service.fetchTraceHistory(fromDate, toDate);

      expect(traceTrackerRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('core_trace_tracker'),
        expect.arrayContaining([expect.any(String), expect.any(String)]),
      );
    });

    it('should generate proper header from row keys', async () => {
      const mockRows = [{ phoneNumber: '123', createdAt: '2026-03-12' }];
      traceTrackerRepo.query.mockResolvedValue(mockRows);

      const result = await service.fetchTraceHistory(fromDate, toDate);

      // phoneNumber -> "Phone Number"
      const phoneHeader = result.header.find((h) => h.field === 'phoneNumber');
      expect(phoneHeader).toBeDefined();
      expect(phoneHeader!.header).toBe('Phone Number');
    });
  });

  // ─── fetchTracedNumbers ────────────────────────────────────────────────

  describe('fetchTracedNumbers', () => {
    it('should return header and body for currently traced numbers', async () => {
      const mockRows = [{ phoneNumber: '961123456', node: 'AIR', setAt: '2026-03-12 10:00:00', setBy: 'admin' }];
      traceTrackerRepo.query.mockResolvedValue(mockRows);

      const result = await service.fetchTracedNumbers();

      expect(result.header).toHaveLength(4);
      expect(result.body).toEqual(mockRows);
    });

    it('should return empty header and body when no traced numbers', async () => {
      traceTrackerRepo.query.mockResolvedValue([]);

      const result = await service.fetchTracedNumbers();

      expect(result.header).toEqual([]);
      expect(result.body).toEqual([]);
    });

    it('should query with status = set and latest record per phone number', async () => {
      traceTrackerRepo.query.mockResolvedValue([]);

      await service.fetchTracedNumbers();

      expect(traceTrackerRepo.query).toHaveBeenCalledWith(expect.stringContaining("status = 'set'"));
      expect(traceTrackerRepo.query).toHaveBeenCalledWith(expect.stringContaining('MAX(createdAt)'));
    });

    it('should exclude fetch status from latest record lookup', async () => {
      traceTrackerRepo.query.mockResolvedValue([]);

      await service.fetchTracedNumbers();

      expect(traceTrackerRepo.query).toHaveBeenCalledWith(expect.stringContaining("status != 'fetch'"));
    });
  });
});
