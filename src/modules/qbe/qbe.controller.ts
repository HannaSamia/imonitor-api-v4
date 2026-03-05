import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { SaveQbeDto, UpdateQbeDto, ProcessQbeDto, GenerateQbeChartDto } from './dto';
import { QbeService } from './qbe.service';

@ApiTags('QBE')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/qbe')
export class QbeController {
  constructor(private readonly qbeService: QbeService) {}

  // --- Named GET routes first (before :id wildcard) ---

  @Get('tables')
  @ApiOperation({ summary: 'Get accessible statistic tables for QBE autocomplete' })
  @ApiResponse({ status: 200, description: 'QBE autocomplete tables returned' })
  getTables(@CurrentUser('id') userId: string) {
    return this.qbeService.privilegedStatisticTables(userId);
  }

  @Get('shared/:id')
  @ApiOperation({ summary: 'Get shared QBE report by shared ID' })
  @ApiResponse({ status: 200, description: 'Shared QBE report returned' })
  getSharedById(@Param('id') sharedId: string, @CurrentUser('id') userId: string) {
    return this.qbeService.getSharedById(sharedId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get QBE report by ID' })
  @ApiResponse({ status: 200, description: 'QBE report returned' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.qbeService.getById(id, userId);
  }

  // --- Mutations ---

  @Post()
  @ApiOperation({ summary: 'Save new QBE report' })
  @ApiResponse({ status: 201, description: 'QBE report saved' })
  save(@Body() dto: SaveQbeDto, @CurrentUser('id') userId: string) {
    return this.qbeService.save(dto, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update existing QBE report' })
  @ApiResponse({ status: 200, description: 'QBE report updated' })
  update(@Param('id') id: string, @Body() dto: UpdateQbeDto, @CurrentUser('id') userId: string) {
    return this.qbeService.update(id, dto, userId);
  }

  @Post('shared/:id')
  @ApiOperation({ summary: 'Save shared QBE report as own copy' })
  @ApiResponse({ status: 201, description: 'Shared QBE saved as own report' })
  saveSharedQbe(@Param('id') sharedId: string, @CurrentUser('id') userId: string) {
    return this.qbeService.saveSharedQbe(sharedId, userId);
  }

  @Post('run')
  @ApiOperation({ summary: 'Execute QBE query and return tabular data' })
  @ApiResponse({ status: 200, description: 'QBE query result returned' })
  run(@Body() dto: ProcessQbeDto, @CurrentUser('id') userId: string) {
    return this.qbeService.generateQbe(dto, userId);
  }

  // --- Chart Generation ---

  @Post('generate/pie')
  @ApiOperation({ summary: 'Generate pie chart from QBE query' })
  @ApiResponse({ status: 200, description: 'Pie chart data returned' })
  pie(@Body() dto: GenerateQbeChartDto, @CurrentUser('id') userId: string) {
    return this.qbeService.generateChart('pie', dto, userId);
  }

  @Post('generate/doughnut')
  @ApiOperation({ summary: 'Generate doughnut chart from QBE query' })
  @ApiResponse({ status: 200, description: 'Doughnut chart data returned' })
  doughnut(@Body() dto: GenerateQbeChartDto, @CurrentUser('id') userId: string) {
    return this.qbeService.generateChart('doughnut', dto, userId);
  }

  @Post('generate/trend')
  @ApiOperation({ summary: 'Generate trend chart from QBE query' })
  @ApiResponse({ status: 200, description: 'Trend chart data returned' })
  trend(@Body() dto: GenerateQbeChartDto, @CurrentUser('id') userId: string) {
    return this.qbeService.generateChart('trend', dto, userId);
  }

  @Post('generate/bar/vertical')
  @ApiOperation({ summary: 'Generate vertical bar chart from QBE query' })
  @ApiResponse({ status: 200, description: 'Vertical bar chart data returned' })
  verticalBar(@Body() dto: GenerateQbeChartDto, @CurrentUser('id') userId: string) {
    return this.qbeService.generateChart('vertical_bar', dto, userId);
  }

  @Post('generate/bar/horizontal')
  @ApiOperation({ summary: 'Generate horizontal bar chart from QBE query' })
  @ApiResponse({ status: 200, description: 'Horizontal bar chart data returned' })
  horizontalBar(@Body() dto: GenerateQbeChartDto, @CurrentUser('id') userId: string) {
    return this.qbeService.generateChart('horizontal_bar', dto, userId);
  }

  @Post('generate/progress')
  @ApiOperation({ summary: 'Generate progress chart from QBE query' })
  @ApiResponse({ status: 200, description: 'Progress chart data returned' })
  progress(@Body() dto: GenerateQbeChartDto, @CurrentUser('id') userId: string) {
    return this.qbeService.generateChart('progress', dto, userId);
  }

  @Post('generate/progress/exploded')
  @ApiOperation({ summary: 'Generate exploded progress chart from QBE query' })
  @ApiResponse({ status: 200, description: 'Exploded progress chart data returned' })
  explodedProgress(@Body() dto: GenerateQbeChartDto, @CurrentUser('id') userId: string) {
    return this.qbeService.generateChart('exploded_progress', dto, userId);
  }
}
