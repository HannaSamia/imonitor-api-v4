import { Controller, Get, Post, Put, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { DataAnalysisService } from './data-analysis.service';
import { SaveDataAnalysisDto } from './dto/save-data-analysis.dto';
import { EditDataAnalysisDto } from './dto/edit-data-analysis.dto';
import { ExportDataAnalysisParamsDto } from './dto/export-data-analysis-params.dto';
import { ShareDto, FavoriteDto } from '../../shared/dto/base.dto';

@ApiTags('Data Analysis Routes')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/dataanalysis')
export class DataAnalysisController {
  constructor(private readonly dataAnalysisService: DataAnalysisService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new data analysis' })
  @ApiResponse({ status: 200, description: 'Data analysis created, returns ID' })
  async save(@Body() dto: SaveDataAnalysisDto, @CurrentUser('id') userId: string) {
    const id = await this.dataAnalysisService.save(dto, userId);
    return { id };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing data analysis' })
  @ApiResponse({ status: 200, description: 'Data analysis updated' })
  async update(@Param('id') id: string, @Body() dto: EditDataAnalysisDto, @CurrentUser('id') userId: string) {
    if (dto.id !== id) {
      throw new ForbiddenException(ErrorMessages.IDS_NOT_MATCHING);
    }
    return this.dataAnalysisService.update(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all data analyses for current user' })
  @ApiResponse({ status: 200, description: 'Array of data analyses' })
  async list(@CurrentUser('id') userId: string) {
    return this.dataAnalysisService.list(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get data analysis by ID' })
  @ApiResponse({ status: 200, description: 'Data analysis details' })
  async getById(@Param('id') id: string) {
    return this.dataAnalysisService.getById(id);
  }

  @Post(':dataAnalysisId/share')
  @ApiOperation({ summary: 'Share data analysis with users' })
  @ApiResponse({ status: 200, description: 'Data analysis shared' })
  async share(@Param('dataAnalysisId') dataAnalysisId: string, @Body() body: ShareDto) {
    return this.dataAnalysisService.share(dataAnalysisId, body.userIds);
  }

  @Get('shared/:id')
  @ApiOperation({ summary: 'Get shared data analysis by ID' })
  @ApiResponse({ status: 200, description: 'Data analysis details' })
  async getSharedById(@Param('id') id: string) {
    return this.dataAnalysisService.getSharedById(id);
  }

  @Post('shared/:id')
  @ApiOperation({ summary: 'Duplicate a shared data analysis' })
  @ApiResponse({ status: 200, description: 'New data analysis ID' })
  async saveShared(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const newId = await this.dataAnalysisService.saveShared(id, userId);
    return { id: newId };
  }

  @Post('default/:id')
  @ApiOperation({ summary: 'Copy a default data analysis' })
  @ApiResponse({ status: 200, description: 'New data analysis ID' })
  async saveDefault(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const newId = await this.dataAnalysisService.saveDefault(id, userId);
    return { id: newId };
  }

  @Put('favorite/:id')
  @ApiOperation({ summary: 'Toggle data analysis favorite' })
  @ApiResponse({ status: 200, description: 'New favorite status' })
  async favorite(@Param('id') id: string, @Body() body: FavoriteDto) {
    if (body.id !== id) {
      throw new ForbiddenException(ErrorMessages.IDS_NOT_MATCHING);
    }
    return this.dataAnalysisService.favorite(body.id, body.isShared || false);
  }

  @Get('export/html/:id/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export data analysis to HTML' })
  @ApiResponse({ status: 200, description: 'HTML file path returned' })
  exportHtml(@Param() params: ExportDataAnalysisParamsDto, @CurrentUser('id') userId: string) {
    return this.dataAnalysisService.exportHtml(
      params.id,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/pdf/:id/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export data analysis to PDF' })
  @ApiResponse({ status: 200, description: 'PDF file path returned' })
  exportPdf(@Param() params: ExportDataAnalysisParamsDto, @CurrentUser('id') userId: string) {
    return this.dataAnalysisService.exportPdf(
      params.id,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }

  @Get('export/excel/:id/:status/:fromdate/:todate/:interval')
  @ApiOperation({ summary: 'Export data analysis to Excel' })
  @ApiResponse({ status: 200, description: 'Excel file path returned' })
  exportExcel(@Param() params: ExportDataAnalysisParamsDto, @CurrentUser('id') userId: string) {
    return this.dataAnalysisService.exportExcel(
      params.id,
      params.status,
      params.fromdate,
      params.todate,
      params.interval,
      userId,
    );
  }
}
