import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BulkProcessingService } from './bulk-processing.service';
import {
  AddBulkProcessDto,
  BulkListQueryDto,
  ScheduleBulkProcessDto,
  UpdateBulkProcessDto,
} from './dto/bulk-processing.dto';

@ApiTags('Bulk Processing')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/bulk')
export class BulkProcessingController {
  constructor(private readonly bulkProcessingService: BulkProcessingService) {}

  @Post('balance')
  @UseInterceptors(FileInterceptor('document'))
  @ApiOperation({ summary: 'Upload CSV for bulk balance charging' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { document: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 200, description: 'Upload accepted' })
  async uploadBalance(@UploadedFile() file: Express.Multer.File): Promise<void> {
    return this.bulkProcessingService.bulkChargingCsv(file);
  }

  @Post()
  @UseInterceptors(FileInterceptor('document'))
  @ApiOperation({ summary: 'Add bulk process job' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        methodId: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Process added' })
  async addProcess(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('methodId') methodId: number,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.bulkProcessingService.add(file, { name, methodId: Number(methodId) }, userId);
  }

  @Post('schedule')
  @UseInterceptors(FileInterceptor('document'))
  @ApiOperation({ summary: 'Schedule a bulk process job' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        methodId: { type: 'number' },
        date: { type: 'string', example: '2026-03-15 10:00:00' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Process scheduled' })
  async scheduleProcess(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('methodId') methodId: number,
    @Body('date') date: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.bulkProcessingService.schedule(file, { name, methodId: Number(methodId), date }, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List bulk processes by type' })
  @ApiQuery({ name: 'type', enum: ['AIR', 'EDA'], required: true })
  @ApiResponse({ status: 200, description: 'List of bulk processes' })
  async list(@Query() query: BulkListQueryDto, @CurrentUser('id') userId: string) {
    return this.bulkProcessingService.list(query.type, userId);
  }

  @Get('methods')
  @ApiOperation({ summary: 'List bulk process methods' })
  @ApiQuery({ name: 'type', enum: ['AIR', 'EDA'], required: true })
  @ApiResponse({ status: 200, description: 'List of available methods' })
  async listMethods(@Query() query: BulkListQueryDto, @CurrentUser('id') userId: string) {
    return this.bulkProcessingService.listMethods(query.type, userId);
  }

  @Get('airs')
  @ApiOperation({ summary: 'List available AIR server nodes' })
  @ApiResponse({ status: 200, description: 'List of AIR nodes' })
  async listAirs() {
    return this.bulkProcessingService.listAirs();
  }

  @Get(':id/download/:type')
  @ApiOperation({ summary: 'Download bulk process input or output file' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiParam({ name: 'type', description: 'File type: in (input) or out (output)', enum: ['in', 'out'] })
  @ApiResponse({ status: 200, description: 'File stream' })
  async download(@Param('id') id: string, @Param('type') type: string, @Res() res: Response): Promise<void> {
    const filePath = await this.bulkProcessingService.download(id, type);
    res.download(filePath);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a pending bulk process' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiResponse({ status: 200, description: 'Process updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBulkProcessDto,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    if (dto.id !== id) {
      throw new Error('ID mismatch');
    }
    return this.bulkProcessingService.update(dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a bulk process' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiResponse({ status: 200, description: 'Process deleted' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string): Promise<void> {
    return this.bulkProcessingService.delete(id, userId);
  }
}
