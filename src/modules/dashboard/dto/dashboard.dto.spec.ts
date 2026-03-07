import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveDashboardDto } from './save-dashboard.dto';
import { EditDashboardDto } from './edit-dashboard.dto';
import { DashboardChartsDto } from './dashboard-charts.dto';

describe('Dashboard DTOs', () => {
  describe('DashboardChartsDto', () => {
    it('should validate a valid chart DTO', async () => {
      const dto = plainToInstance(DashboardChartsDto, {
        chartId: 'chart-1',
        widgetBuilderId: 'wb-1',
        cols: 6,
        rows: 4,
        x: 0,
        y: 0,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail if chartId is empty', async () => {
      const dto = plainToInstance(DashboardChartsDto, {
        chartId: '',
        widgetBuilderId: 'wb-1',
        cols: 6,
        rows: 4,
        x: 0,
        y: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept optional isTitle and value', async () => {
      const dto = plainToInstance(DashboardChartsDto, {
        chartId: 'chart-1',
        widgetBuilderId: 'wb-1',
        cols: 12,
        rows: 1,
        x: 0,
        y: 0,
        isTitle: true,
        value: 'My Title',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('SaveDashboardDto', () => {
    it('should validate a valid save DTO', async () => {
      const dto = plainToInstance(SaveDashboardDto, {
        name: 'Test Dashboard',
        charts: [{ chartId: 'c1', widgetBuilderId: 'wb1', cols: 6, rows: 4, x: 0, y: 0 }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail if name is empty', async () => {
      const dto = plainToInstance(SaveDashboardDto, {
        name: '',
        charts: [],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept optional isDefault', async () => {
      const dto = plainToInstance(SaveDashboardDto, {
        name: 'Default',
        charts: [],
        isDefault: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('EditDashboardDto', () => {
    it('should validate a valid edit DTO', async () => {
      const dto = plainToInstance(EditDashboardDto, {
        id: 'dash-1',
        name: 'Updated Dashboard',
        charts: [],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail if id is missing', async () => {
      const dto = plainToInstance(EditDashboardDto, {
        name: 'Updated',
        charts: [],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
