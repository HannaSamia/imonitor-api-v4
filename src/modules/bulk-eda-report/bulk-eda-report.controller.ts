import { Controller, Delete, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BulkEdaReportService } from './bulk-eda-report.service';

@ApiTags('Bulk EDA Report')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/eda')
export class BulkEdaReportController {
  constructor(private readonly bulkEdaReportService: BulkEdaReportService) {}

  @Get()
  @ApiOperation({ summary: 'List EDA bulk report processes' })
  @ApiResponse({ status: 200, description: 'List of EDA bulk processes' })
  async list() {
    return this.bulkEdaReportService.list();
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('document'))
  @ApiOperation({ summary: 'Upload CSV for bulk EDA report (max 50 rows)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { document: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Process created, returns process ID' })
  async uploadCSV(@UploadedFile() file: Express.Multer.File, @CurrentUser('id') userId: string): Promise<string> {
    return this.bulkEdaReportService.uploadCSV(userId, file);
  }

  @Get(':id/download/:type')
  @ApiOperation({ summary: 'Download EDA bulk process input CSV or output Excel' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiParam({ name: 'type', description: 'File type: in (input CSV) or out (output Excel)', enum: ['in', 'out'] })
  @ApiResponse({ status: 200, description: 'File stream' })
  async download(@Param('id') id: string, @Param('type') type: string, @Res() res: Response): Promise<void> {
    const filePath = await this.bulkEdaReportService.download(id, type);
    res.download(filePath);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an EDA bulk process (owner only)' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiResponse({ status: 200, description: 'Process deleted' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string): Promise<string> {
    return this.bulkEdaReportService.delete(userId, id);
  }
}
