import { Controller, Get, Post, Put, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { DashboardService } from './dashboard.service';
import { SaveDashboardDto } from './dto/save-dashboard.dto';
import { EditDashboardDto } from './dto/edit-dashboard.dto';
import { ShareDto, FavoriteDto } from '../../shared/dto/base.dto';

@ApiTags('Dashboard Routes')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard created, returns ID' })
  async save(@Body() dto: SaveDashboardDto, @CurrentUser('id') userId: string) {
    const id = await this.dashboardService.save(dto, userId);
    return { id };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard updated' })
  async update(@Param('id') id: string, @Body() dto: EditDashboardDto, @CurrentUser('id') userId: string) {
    if (dto.id !== id) {
      throw new ForbiddenException(ErrorMessages.IDS_NOT_MATCHING);
    }
    return this.dashboardService.update(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all dashboards for current user' })
  @ApiResponse({ status: 200, description: 'Array of dashboards' })
  async list(@CurrentUser('id') userId: string) {
    return this.dashboardService.list(userId);
  }

  @Get('open/:id')
  @ApiOperation({ summary: 'Get any dashboard by ID (own or shared)' })
  @ApiResponse({ status: 200, description: 'Dashboard details' })
  async getAnyById(@Param('id') id: string) {
    return this.dashboardService.getAnyById(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dashboard by ID' })
  @ApiResponse({ status: 200, description: 'Dashboard details' })
  async getById(@Param('id') id: string) {
    return this.dashboardService.getById(id);
  }

  @Post(':dashboardId/share')
  @ApiOperation({ summary: 'Share dashboard with users' })
  @ApiResponse({ status: 200, description: 'Dashboard shared' })
  async share(@Param('dashboardId') dashboardId: string, @Body() body: ShareDto) {
    return this.dashboardService.share(dashboardId, body.userIds);
  }

  @Post('shared/:id')
  @ApiOperation({ summary: 'Duplicate a shared dashboard' })
  @ApiResponse({ status: 200, description: 'New dashboard ID' })
  async saveShared(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const newId = await this.dashboardService.saveShared(id, userId);
    return { id: newId };
  }

  @Post('default/:id')
  @ApiOperation({ summary: 'Copy a default dashboard' })
  @ApiResponse({ status: 200, description: 'New dashboard ID' })
  async saveDefault(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const newId = await this.dashboardService.saveDefault(id, userId);
    return { id: newId };
  }

  @Get('shared/:id')
  @ApiOperation({ summary: 'Get shared dashboard by ID' })
  @ApiResponse({ status: 200, description: 'Dashboard details' })
  async getSharedById(@Param('id') id: string) {
    return this.dashboardService.getSharedById(id);
  }

  @Put('favorite/:id')
  @ApiOperation({ summary: 'Toggle dashboard favorite' })
  @ApiResponse({ status: 200, description: 'New favorite status' })
  async favorite(@Param('id') id: string, @Body() body: FavoriteDto) {
    if (body.id !== id) {
      throw new ForbiddenException(ErrorMessages.IDS_NOT_MATCHING);
    }
    return this.dashboardService.favorite(body.id, body.isShared || false);
  }
}
