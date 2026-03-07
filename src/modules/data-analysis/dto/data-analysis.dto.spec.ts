import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveDataAnalysisDto } from './save-data-analysis.dto';
import { EditDataAnalysisDto } from './edit-data-analysis.dto';

describe('DataAnalysis DTOs', () => {
  describe('SaveDataAnalysisDto', () => {
    it('should validate a valid save DTO', async () => {
      const dto = plainToInstance(SaveDataAnalysisDto, {
        name: 'My Data Analysis',
        charts: [{ chartId: 'c1', reportId: 'r1', cols: 6, rows: 4, x: 0, y: 0 }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail if name is empty', async () => {
      const dto = plainToInstance(SaveDataAnalysisDto, {
        name: '',
        charts: [],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('EditDataAnalysisDto', () => {
    it('should validate a valid edit DTO', async () => {
      const dto = plainToInstance(EditDataAnalysisDto, {
        id: 'da-1',
        name: 'Updated DA',
        charts: [{ chartId: 'c1', reportId: 'r1', cols: 6, rows: 4, x: 0, y: 0 }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail if id is missing', async () => {
      const dto = plainToInstance(EditDataAnalysisDto, {
        name: 'Updated',
        charts: [],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
