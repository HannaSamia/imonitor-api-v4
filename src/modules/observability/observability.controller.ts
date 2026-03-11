import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ParseEnumPipe,
  ParseArrayPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { FavoriteDto } from '../../shared/dto/base.dto';
import { MetricChartFilters } from '../../shared/enums/observability.enum';
import { ObservabilityService } from './observability.service';
import {
  SaveObservabilityMetricDto,
  UpdateObservabilityMetricDto,
  GenerateObservabilityMetricDto,
  GetMetricsByNodeIdsDto,
} from './dto/observability-metric.dto';
import {
  SaveObservabilityChartDto,
  UpdateObservabilityChartDto,
  VerticalStatusPanelDto,
  HorizontalStatusPanelDto,
  CounterListChartDto,
  HexagonChartDto,
  ObservabilityTrendChartDto,
  ObservabilityVerticalBarChartDto,
  ConnectivityChartDto,
  TimeTravelChartDto,
} from './dto/observability-chart.dto';
import { SaveObservabilityDashboardDto, UpdateObservabilityDashboardDto } from './dto/observability-dashboard.dto';

@ApiTags('Observability Routes')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/observability')
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  // =========================================================================
  // METRICS — Nodes & Fields
  // =========================================================================

  @Get('metrics/nodes')
  @ApiOperation({ summary: 'List module nodes (isNode=true)' })
  @ApiResponse({ status: 200, description: 'Array of module nodes' })
  async fetchNodes() {
    return this.observabilityService.fetchNodes();
  }

  @Post('metrics/nodes/fields')
  @ApiOperation({ summary: 'Fetch statistics table fields by node IDs' })
  @ApiResponse({ status: 200, description: 'Side tables with fields' })
  async fetchFieldsByNode(@Body(new ParseArrayPipe({ items: Number })) ids: number[]) {
    return this.observabilityService.fetchFieldsByNode(ids);
  }

  @Post('nodes/metrics')
  @ApiOperation({ summary: 'Get metrics by node IDs' })
  @ApiResponse({ status: 200, description: 'Array of metric IDs and names' })
  async getMetricsByNode(@Body() body: GetMetricsByNodeIdsDto) {
    return this.observabilityService.getMetricsByNodeIds(body);
  }

  // =========================================================================
  // METRICS — CRUD
  // =========================================================================

  @Get('metrics')
  @ApiOperation({ summary: 'List all observability metrics' })
  @ApiResponse({ status: 200, description: 'Array of metrics' })
  async listMetrics() {
    return this.observabilityService.listMetrics();
  }

  @Get('metrics/reports/:id')
  @ApiOperation({ summary: 'Convert metric to report configuration' })
  @ApiResponse({ status: 200, description: 'Report-compatible configuration' })
  async goToReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.observabilityService.goToReport(id);
  }

  @Get('metrics/:id')
  @ApiOperation({ summary: 'Get metric by ID with full configuration' })
  @ApiResponse({ status: 200, description: 'Metric details with thresholds and alarms' })
  async getMetricById(@Param('id', ParseUUIDPipe) id: string) {
    return this.observabilityService.getMetricById(id);
  }

  @Post('metrics')
  @ApiOperation({ summary: 'Create a new observability metric' })
  @ApiResponse({ status: 200, description: 'Metric created, returns ID' })
  async saveMetric(@Body() dto: SaveObservabilityMetricDto, @CurrentUser('id') userId: string) {
    const id = await this.observabilityService.saveMetric(dto, userId);
    return { id };
  }

  @Put('metrics/:id')
  @ApiOperation({ summary: 'Update an existing observability metric' })
  @ApiResponse({ status: 200, description: 'Metric updated' })
  async updateMetric(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObservabilityMetricDto,
    @CurrentUser('id') userId: string,
  ) {
    dto.id = id;
    return this.observabilityService.updateMetric(userId, dto);
  }

  @Put('favorite/:id')
  @ApiOperation({ summary: 'Toggle metric favorite' })
  @ApiResponse({ status: 200, description: 'New favorite status' })
  async favorite(@Param('id', ParseUUIDPipe) id: string, @Body() body: FavoriteDto) {
    return this.observabilityService.favorite(id);
  }

  // =========================================================================
  // METRICS — Query Execution
  // =========================================================================

  @Post('metrics/generate/tabular')
  @ApiOperation({ summary: 'Execute tabular query for metric' })
  @ApiResponse({ status: 200, description: 'Tabular result with headers and body' })
  async executeQuery(@Body() dto: GenerateObservabilityMetricDto) {
    return this.observabilityService.executeQuery(dto);
  }

  @Post('metrics/generate/single')
  @ApiOperation({ summary: 'Execute single metric query (value + threshold color)' })
  @ApiResponse({ status: 200, description: 'Metric value with color' })
  async executeMetricQuery(@Body() dto: GenerateObservabilityMetricDto) {
    return this.observabilityService.executeMetricQuery(dto);
  }

  // =========================================================================
  // CHARTS — CRUD
  // =========================================================================

  @Get('charts/metrics/:filter')
  @ApiOperation({ summary: 'List metrics filtered for chart selection' })
  @ApiResponse({ status: 200, description: 'Filtered metrics array' })
  async listChartsMetric(@Param('filter', new ParseEnumPipe(MetricChartFilters)) filter: MetricChartFilters) {
    return this.observabilityService.listMetricsForCharts(filter);
  }

  @Get('charts')
  @ApiOperation({ summary: 'List all observability charts' })
  @ApiResponse({ status: 200, description: 'Array of charts' })
  async listCharts() {
    return this.observabilityService.listCharts();
  }

  @Get('charts/:id')
  @ApiOperation({ summary: 'Get chart by ID' })
  @ApiResponse({ status: 200, description: 'Chart details with parsed data' })
  async getChartById(@Param('id', ParseUUIDPipe) id: string) {
    return this.observabilityService.getChartById(id);
  }

  @Post('charts')
  @ApiOperation({ summary: 'Create a new observability chart' })
  @ApiResponse({ status: 200, description: 'Chart created, returns ID' })
  async saveChart(@Body() dto: SaveObservabilityChartDto, @CurrentUser('id') userId: string) {
    return this.observabilityService.saveChart(dto, userId);
  }

  @Put('charts/:id')
  @ApiOperation({ summary: 'Update an existing observability chart' })
  @ApiResponse({ status: 200, description: 'Chart updated' })
  async updateChart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObservabilityChartDto,
    @CurrentUser('id') userId: string,
  ) {
    dto.id = id;
    return this.observabilityService.updateChart(dto, userId);
  }

  @Put('charts/favorite/:id')
  @ApiOperation({ summary: 'Toggle chart favorite' })
  @ApiResponse({ status: 200, description: 'New favorite status' })
  async favoriteChart(@Param('id', ParseUUIDPipe) id: string, @Body() body: FavoriteDto) {
    return this.observabilityService.favoriteChart(id);
  }

  // =========================================================================
  // CHART GENERATORS — 8 types
  // =========================================================================

  @Post('generate/status-panel/vertical')
  @ApiOperation({ summary: 'Generate vertical status panel chart' })
  @ApiResponse({ status: 200, description: 'Chart data' })
  async generateVerticalStatusPanel(@Body() dto: VerticalStatusPanelDto) {
    return this.observabilityService.generateVerticalStatusPanel(dto as Record<string, unknown>);
  }

  @Post('generate/status-panel/horizontal')
  @ApiOperation({ summary: 'Generate horizontal status panel chart' })
  @ApiResponse({ status: 200, description: 'Chart data' })
  async generateHorizontalStatus(@Body() dto: HorizontalStatusPanelDto) {
    return this.observabilityService.generateHorizontalStatusPanel(dto as Record<string, unknown>);
  }

  @Post('generate/counter-list')
  @ApiOperation({ summary: 'Generate counter list chart' })
  @ApiResponse({ status: 200, description: 'Chart data' })
  async generateCounterListChart(@Body() dto: CounterListChartDto) {
    return this.observabilityService.generateCounterListChart(dto as Record<string, unknown>);
  }

  @Post('generate/hexagon')
  @ApiOperation({ summary: 'Generate hexagon chart' })
  @ApiResponse({ status: 200, description: 'Chart data' })
  async generateHexagonChart(@Body() dto: HexagonChartDto) {
    return this.observabilityService.generateHexagonChart(dto as Record<string, unknown>);
  }

  @Post('generate/trend')
  @ApiOperation({ summary: 'Generate observability trend chart' })
  @ApiResponse({ status: 200, description: 'Chart data' })
  async generateTrendChart(@Body() dto: ObservabilityTrendChartDto) {
    return this.observabilityService.generateTrendChart(dto as Record<string, unknown>);
  }

  @Post('generate/bar')
  @ApiOperation({ summary: 'Generate observability vertical bar chart' })
  @ApiResponse({ status: 200, description: 'Chart data' })
  async generateVerticalBarChart(@Body() dto: ObservabilityVerticalBarChartDto) {
    return this.observabilityService.generateVerticalBarChart(dto as Record<string, unknown>);
  }

  @Post('generate/connectivity')
  @ApiOperation({ summary: 'Generate connectivity chart' })
  @ApiResponse({ status: 200, description: 'Chart data with node status' })
  async generateConnectivityChart(@Body() dto: ConnectivityChartDto) {
    return this.observabilityService.generateConnectivityChart(dto as Record<string, unknown>);
  }

  @Post('generate/time/travel')
  @ApiOperation({ summary: 'Generate time travel chart' })
  @ApiResponse({ status: 200, description: 'Chart data with timeline segments' })
  async generateTimeTravelChart(@Body() dto: TimeTravelChartDto) {
    return this.observabilityService.generateTimeTravelChart(dto as Record<string, unknown>);
  }

  // =========================================================================
  // DASHBOARDS — CRUD
  // =========================================================================

  @Post('dashboards')
  @ApiOperation({ summary: 'Create a new observability dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard created, returns ID' })
  async saveDashboard(@Body() dto: SaveObservabilityDashboardDto, @CurrentUser('id') userId: string) {
    return this.observabilityService.saveDashboard(dto, userId);
  }

  @Get('dashboards')
  @ApiOperation({ summary: 'List all observability dashboards' })
  @ApiResponse({ status: 200, description: 'Array of dashboards' })
  async listDashboards() {
    return this.observabilityService.listDashboards();
  }

  @Get('dashboards/:id')
  @ApiOperation({ summary: 'Get dashboard by ID with chart layout' })
  @ApiResponse({ status: 200, description: 'Dashboard details with charts' })
  async getDashboardById(@Param('id', ParseUUIDPipe) id: string) {
    return this.observabilityService.getDashboardById(id);
  }

  @Put('dashboards/:id')
  @ApiOperation({ summary: 'Update an existing observability dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard updated' })
  async updateDashboard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObservabilityDashboardDto,
    @CurrentUser('id') userId: string,
  ) {
    dto.id = id;
    return this.observabilityService.updateDashboard(userId, dto);
  }

  @Put('dashboards/favorite/:id')
  @ApiOperation({ summary: 'Toggle dashboard favorite' })
  @ApiResponse({ status: 200, description: 'New favorite status' })
  async favoriteDashboard(@Param('id', ParseUUIDPipe) id: string, @Body() body: FavoriteDto) {
    return this.observabilityService.favoriteDashboard(id);
  }
}
