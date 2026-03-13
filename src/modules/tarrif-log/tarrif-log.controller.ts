import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TarrifLogService } from './tarrif-log.service';
import { TarrifLogDto } from './dto/tarrif-log.dto';

@ApiTags('Tariff Log')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/tarrif')
export class TarrifLogController {
  constructor(private readonly tarrifLogService: TarrifLogService) {}

  @Get()
  @ApiOperation({ summary: 'List all tariff log processes' })
  @ApiResponse({ status: 200, description: 'List of tariff log processes' })
  async list() {
    return this.tarrifLogService.list();
  }

  @Get('trees')
  @ApiOperation({ summary: 'List available tariff types from SERVICE_CLASSES' })
  @ApiResponse({ status: 200, description: 'List of tariff types' })
  async listTarrif() {
    return this.tarrifLogService.listTarrif();
  }

  @Get(':id/dates')
  @ApiOperation({ summary: 'List available tariff tree file dates for a service class' })
  @ApiParam({ name: 'id', description: 'Service class code (sc_code)' })
  @ApiResponse({ status: 200, description: 'List of available dates' })
  async listTreeDates(@Param('id') id: string) {
    return this.tarrifLogService.listTreeDates(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new tariff comparison process' })
  @ApiResponse({ status: 200, description: 'Process created and triggered' })
  async add(@Body() body: TarrifLogDto, @CurrentUser('id') userId: string): Promise<void> {
    return this.tarrifLogService.add(body, userId);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download tariff comparison HTML result' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiResponse({ status: 200, description: 'HTML file stream' })
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const filePath = await this.tarrifLogService.download(id);
    res.download(filePath);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a tariff log process' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiResponse({ status: 200, description: 'Process deleted' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string): Promise<void> {
    return this.tarrifLogService.delete(id, userId);
  }
}
