import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveRotatingDashboardDto } from './save-rotating-dashboard.dto';
import { UpdateRotatingDashboardDto } from './update-rotating-dashboard.dto';

describe('RotatingDashboard DTOs', () => {
  describe('SaveRotatingDashboardDto', () => {
    it('should validate a valid save DTO', async () => {
      const dto = plainToInstance(SaveRotatingDashboardDto, {
        name: 'My Rotating Dashboard',
        dashboardIds: ['dash-1', 'dash-2'],
        minutes: 5,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail if name is empty', async () => {
      const dto = plainToInstance(SaveRotatingDashboardDto, {
        name: '',
        dashboardIds: [],
        minutes: 5,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail if minutes is less than 1', async () => {
      const dto = plainToInstance(SaveRotatingDashboardDto, {
        name: 'Test',
        dashboardIds: [],
        minutes: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('UpdateRotatingDashboardDto', () => {
    it('should validate a valid update DTO', async () => {
      const dto = plainToInstance(UpdateRotatingDashboardDto, {
        id: 'rd-1',
        name: 'Updated RD',
        dashboardIds: ['dash-1'],
        minutes: 10,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail if id is missing', async () => {
      const dto = plainToInstance(UpdateRotatingDashboardDto, {
        name: 'Updated',
        dashboardIds: [],
        minutes: 1,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
