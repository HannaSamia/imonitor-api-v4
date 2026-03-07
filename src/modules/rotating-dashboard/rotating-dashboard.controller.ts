import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { RotatingDashboardService } from './rotating-dashboard.service';
import { SaveRotatingDashboardDto } from './dto/save-rotating-dashboard.dto';
import { UpdateRotatingDashboardDto } from './dto/update-rotating-dashboard.dto';
import { ShareDto, FavoriteDto } from '../../shared/dto/base.dto';

@ApiTags('Rotating Dashboard Routes')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/rotatingdashboard')
export class RotatingDashboardController {
  constructor(private readonly rotatingDashboardService: RotatingDashboardService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new rotating dashboard' })
  @ApiResponse({ status: 200, description: 'Rotating dashboard created, returns ID' })
  async save(@Body() dto: SaveRotatingDashboardDto, @CurrentUser('id') userId: string) {
    const id = await this.rotatingDashboardService.save(dto, userId);
    return { id };
  }

  @Get()
  @ApiOperation({ summary: 'List all rotating dashboards for current user' })
  @ApiResponse({ status: 200, description: 'Array of rotating dashboards' })
  async list(@CurrentUser('id') userId: string) {
    return this.rotatingDashboardService.list(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get rotating dashboard by ID' })
  @ApiResponse({ status: 200, description: 'Rotating dashboard details' })
  async getById(@Param('id') id: string) {
    return this.rotatingDashboardService.getById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a rotating dashboard' })
  @ApiResponse({ status: 200, description: 'Rotating dashboard updated' })
  async update(@Param('id') id: string, @Body() dto: UpdateRotatingDashboardDto, @CurrentUser('id') userId: string) {
    if (dto.id !== id) {
      throw new ForbiddenException(ErrorMessages.IDS_NOT_MATCHING);
    }
    return this.rotatingDashboardService.update(dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a rotating dashboard' })
  @ApiResponse({ status: 200, description: 'Rotating dashboard deleted' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.rotatingDashboardService.delete(id, userId);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Share rotating dashboard with users' })
  @ApiResponse({ status: 200, description: 'Rotating dashboard shared' })
  async share(@Param('id') rotatingDashboardId: string, @Body() body: ShareDto) {
    return this.rotatingDashboardService.share(rotatingDashboardId, body.userIds);
  }

  @Get('shared/:id')
  @ApiOperation({ summary: 'Get shared rotating dashboard by ID' })
  @ApiResponse({ status: 200, description: 'Shared rotating dashboard details' })
  async getSharedById(@Param('id') id: string) {
    return this.rotatingDashboardService.getSharedById(id);
  }

  @Post('shared/:id')
  @ApiOperation({ summary: 'Duplicate a shared rotating dashboard' })
  @ApiResponse({ status: 200, description: 'New rotating dashboard ID' })
  async saveShared(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const newId = await this.rotatingDashboardService.saveShared(id, userId);
    return { id: newId };
  }

  @Put('favorite/:id')
  @ApiOperation({ summary: 'Toggle rotating dashboard favorite' })
  @ApiResponse({ status: 200, description: 'New favorite status' })
  async favorite(@Param('id') id: string, @Body() body: FavoriteDto) {
    if (body.id !== id) {
      throw new ForbiddenException(ErrorMessages.IDS_NOT_MATCHING);
    }
    return this.rotatingDashboardService.favorite(body.id, body.isShared || false);
  }
}
