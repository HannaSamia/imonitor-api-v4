import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CustomerCareDefaultParamsDto,
  MsisdnParamDto,
  HourlyBalanceParamsDto,
  DaHistoryParamsDto,
  SubscriptionHistoryParamsDto,
  CdrHistoryParamsDto,
  TraceParamsDto,
  GetTraceParamsDto,
  AirTraceParamsDto,
  GetAirTraceParamsDto,
  TraceDateRangeParamsDto,
  ExportTraceQueryDto,
} from './customer-care-params.dto';

describe('Customer Care DTOs', () => {
  // ───────────────────── CustomerCareDefaultParamsDto ─────────────────────

  describe('CustomerCareDefaultParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(CustomerCareDefaultParamsDto, { msisdn: '961123456', test: 'true' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with test=false', async () => {
      const dto = plainToInstance(CustomerCareDefaultParamsDto, { msisdn: '961123456', test: 'false' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(CustomerCareDefaultParamsDto, { test: 'true' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });

    it('should fail validation when test is missing', async () => {
      const dto = plainToInstance(CustomerCareDefaultParamsDto, { msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'test')).toBe(true);
    });

    it('should fail validation when test is not a boolean string', async () => {
      const dto = plainToInstance(CustomerCareDefaultParamsDto, { msisdn: '961123456', test: 'notboolean' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'test')).toBe(true);
    });
  });

  // ───────────────────── MsisdnParamDto ─────────────────────

  describe('MsisdnParamDto', () => {
    it('should pass validation with valid msisdn', async () => {
      const dto = plainToInstance(MsisdnParamDto, { msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(MsisdnParamDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });
  });

  // ───────────────────── HourlyBalanceParamsDto ─────────────────────

  describe('HourlyBalanceParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(HourlyBalanceParamsDto, {
        date: '2024-01-15',
        sdpvip: '10.0.0.1',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when date is missing', async () => {
      const dto = plainToInstance(HourlyBalanceParamsDto, { sdpvip: '10.0.0.1', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'date')).toBe(true);
    });

    it('should fail validation when sdpvip is missing', async () => {
      const dto = plainToInstance(HourlyBalanceParamsDto, { date: '2024-01-15', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'sdpvip')).toBe(true);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(HourlyBalanceParamsDto, { date: '2024-01-15', sdpvip: '10.0.0.1' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });
  });

  // ───────────────────── DaHistoryParamsDto ─────────────────────

  describe('DaHistoryParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(DaHistoryParamsDto, {
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        sdpvip: '10.0.0.1',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when fromdate is missing', async () => {
      const dto = plainToInstance(DaHistoryParamsDto, {
        todate: '2024-01-31',
        sdpvip: '10.0.0.1',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'fromdate')).toBe(true);
    });

    it('should fail validation when todate is missing', async () => {
      const dto = plainToInstance(DaHistoryParamsDto, {
        fromdate: '2024-01-01',
        sdpvip: '10.0.0.1',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'todate')).toBe(true);
    });

    it('should fail validation when sdpvip is missing', async () => {
      const dto = plainToInstance(DaHistoryParamsDto, {
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'sdpvip')).toBe(true);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(DaHistoryParamsDto, {
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        sdpvip: '10.0.0.1',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });
  });

  // ───────────────────── SubscriptionHistoryParamsDto ─────────────────────

  describe('SubscriptionHistoryParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(SubscriptionHistoryParamsDto, {
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        msisdn: '961123456',
        test: 'true',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when fromdate is missing', async () => {
      const dto = plainToInstance(SubscriptionHistoryParamsDto, {
        todate: '2024-01-31',
        msisdn: '961123456',
        test: 'true',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'fromdate')).toBe(true);
    });

    it('should fail validation when test is missing', async () => {
      const dto = plainToInstance(SubscriptionHistoryParamsDto, {
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'test')).toBe(true);
    });

    it('should fail validation when test is not a boolean string', async () => {
      const dto = plainToInstance(SubscriptionHistoryParamsDto, {
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        msisdn: '961123456',
        test: 'invalid',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'test')).toBe(true);
    });
  });

  // ───────────────────── CdrHistoryParamsDto ─────────────────────

  describe('CdrHistoryParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(CdrHistoryParamsDto, {
        fromdate: '2024-01-01',
        todate: '2024-01-31',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when fromdate is missing', async () => {
      const dto = plainToInstance(CdrHistoryParamsDto, { todate: '2024-01-31', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'fromdate')).toBe(true);
    });

    it('should fail validation when todate is missing', async () => {
      const dto = plainToInstance(CdrHistoryParamsDto, { fromdate: '2024-01-01', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'todate')).toBe(true);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(CdrHistoryParamsDto, { fromdate: '2024-01-01', todate: '2024-01-31' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });
  });

  // ───────────────────── TraceParamsDto ─────────────────────

  describe('TraceParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(TraceParamsDto, { sdpvip: '10.0.0.1', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when sdpvip is missing', async () => {
      const dto = plainToInstance(TraceParamsDto, { msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'sdpvip')).toBe(true);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(TraceParamsDto, { sdpvip: '10.0.0.1' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });
  });

  // ───────────────────── GetTraceParamsDto ─────────────────────

  describe('GetTraceParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(GetTraceParamsDto, {
        fromhour: '08:00',
        tohour: '12:00',
        sdpvip: '10.0.0.1',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when fromhour is missing', async () => {
      const dto = plainToInstance(GetTraceParamsDto, { tohour: '12:00', sdpvip: '10.0.0.1', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'fromhour')).toBe(true);
    });

    it('should fail validation when tohour is missing', async () => {
      const dto = plainToInstance(GetTraceParamsDto, { fromhour: '08:00', sdpvip: '10.0.0.1', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'tohour')).toBe(true);
    });

    it('should fail validation when sdpvip is missing', async () => {
      const dto = plainToInstance(GetTraceParamsDto, { fromhour: '08:00', tohour: '12:00', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'sdpvip')).toBe(true);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(GetTraceParamsDto, { fromhour: '08:00', tohour: '12:00', sdpvip: '10.0.0.1' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });
  });

  // ───────────────────── AirTraceParamsDto ─────────────────────

  describe('AirTraceParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(AirTraceParamsDto, { msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(AirTraceParamsDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });
  });

  // ───────────────────── GetAirTraceParamsDto ─────────────────────

  describe('GetAirTraceParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(GetAirTraceParamsDto, {
        fromhour: '08:00',
        tohour: '12:00',
        msisdn: '961123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when fromhour is missing', async () => {
      const dto = plainToInstance(GetAirTraceParamsDto, { tohour: '12:00', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'fromhour')).toBe(true);
    });

    it('should fail validation when tohour is missing', async () => {
      const dto = plainToInstance(GetAirTraceParamsDto, { fromhour: '08:00', msisdn: '961123456' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'tohour')).toBe(true);
    });

    it('should fail validation when msisdn is missing', async () => {
      const dto = plainToInstance(GetAirTraceParamsDto, { fromhour: '08:00', tohour: '12:00' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'msisdn')).toBe(true);
    });
  });

  // ───────────────────── TraceDateRangeParamsDto ─────────────────────

  describe('TraceDateRangeParamsDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(TraceDateRangeParamsDto, { fromdate: '2024-01-01', todate: '2024-01-31' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when fromdate is missing', async () => {
      const dto = plainToInstance(TraceDateRangeParamsDto, { todate: '2024-01-31' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'fromdate')).toBe(true);
    });

    it('should fail validation when todate is missing', async () => {
      const dto = plainToInstance(TraceDateRangeParamsDto, { fromdate: '2024-01-01' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'todate')).toBe(true);
    });
  });

  // ───────────────────── ExportTraceQueryDto ─────────────────────

  describe('ExportTraceQueryDto', () => {
    it('should pass validation with raw=true', async () => {
      const dto = plainToInstance(ExportTraceQueryDto, { raw: 'true' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with raw=false', async () => {
      const dto = plainToInstance(ExportTraceQueryDto, { raw: 'false' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation without raw (optional)', async () => {
      const dto = plainToInstance(ExportTraceQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation with invalid raw value', async () => {
      const dto = plainToInstance(ExportTraceQueryDto, { raw: 'notboolean' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'raw')).toBe(true);
    });
  });
});
