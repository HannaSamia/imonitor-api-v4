import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { WidgetBuilderService } from './widget-builder.service';
import {
  SaveWidgetBuilderDto,
  EditWidgetBuilderDto,
  RenameWidgetBuilderDto,
  ChangeWbOwnerDto,
  ShareWidgetBuilderDto,
} from './dto';

@ApiTags('WidgetBuilder')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/widgetbuilder')
export class WidgetBuilderController {
  constructor(private readonly widgetBuilderService: WidgetBuilderService) {}

  // --- Named GET routes first (before :id wildcard) ---

  @Get('privileges/tables')
  @ApiOperation({ summary: 'Get privileged statistic tables for widget builder side menu' })
  @ApiResponse({ status: 200, description: 'Privileged tables returned' })
  getPrivilegedTables(@CurrentUser('id') userId: string) {
    return this.widgetBuilderService.privilegedStatisticTables(userId);
  }

  @Get()
  @ApiOperation({ summary: 'List current user widget builders' })
  @ApiResponse({ status: 200, description: 'Widget builders list returned' })
  list(@CurrentUser('id') userId: string) {
    return this.widgetBuilderService.list(userId);
  }

  @Get('shared/:id')
  @ApiOperation({ summary: 'Get shared widget builder by ID' })
  @ApiResponse({ status: 200, description: 'Shared widget builder returned' })
  getSharedById(@Param('id') id: string) {
    return this.widgetBuilderService.getSharedById(id);
  }

  @Get('access/:id')
  @ApiOperation({ summary: 'Check user access to widget builder' })
  @ApiResponse({ status: 200, description: 'Access check result returned' })
  access(@Param('id') widgetBuilderId: string, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.hasAccess(widgetBuilderId, userId);
  }

  @Get('closetab/:wbId/:chartId')
  @ApiOperation({ summary: 'Close/delete a widget builder chart tab' })
  @ApiResponse({ status: 200, description: 'Chart tab closed' })
  closeTab(@Param('wbId') wbId: string, @Param('chartId') chartId: string) {
    return this.widgetBuilderService.closeTab(wbId, chartId);
  }

  // --- Wildcard :id routes LAST ---

  @Get(':id')
  @ApiOperation({ summary: 'Get widget builder by ID' })
  @ApiResponse({ status: 200, description: 'Widget builder returned' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.getById(id, userId);
  }

  // --- Mutation routes (POST/PUT/DELETE) ---

  @Post()
  @ApiOperation({ summary: 'Create a new widget builder' })
  @ApiResponse({ status: 201, description: 'Widget builder created' })
  save(@Body() dto: SaveWidgetBuilderDto, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.save(dto, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing widget builder' })
  @ApiResponse({ status: 200, description: 'Widget builder updated' })
  update(@Body() dto: EditWidgetBuilderDto, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.update(dto, userId);
  }

  @Put('rename')
  @ApiOperation({ summary: 'Rename a widget builder' })
  @ApiResponse({ status: 200, description: 'Widget builder renamed' })
  rename(@Body() dto: RenameWidgetBuilderDto, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.rename(dto, userId);
  }

  @Put('favorite/:id')
  @ApiOperation({ summary: 'Toggle widget builder favorite status' })
  @ApiResponse({ status: 200, description: 'Favorite status toggled' })
  favorite(@Param('id') id: string, @Query('isShared') isShared: string) {
    return this.widgetBuilderService.favorite(id, isShared === 'true');
  }

  @Put('transfer/ownership')
  @ApiOperation({ summary: 'Transfer widget builder ownership' })
  @ApiResponse({ status: 200, description: 'Ownership transferred' })
  changeOwner(@Body() dto: ChangeWbOwnerDto, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.changeOwner(dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a widget builder' })
  @ApiResponse({ status: 200, description: 'Widget builder deleted' })
  deleteWidgetBuilder(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.delete(userId, id);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Share widget builder with users' })
  @ApiResponse({ status: 201, description: 'Widget builder shared' })
  share(@Param('id') id: string, @Body() dto: ShareWidgetBuilderDto) {
    return this.widgetBuilderService.share(id, dto);
  }

  @Post('shared/:id')
  @ApiOperation({ summary: 'Save a shared widget builder as own' })
  @ApiResponse({ status: 201, description: 'Shared widget builder saved as own' })
  saveSharedWidgetBuilder(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.widgetBuilderService.saveSharedWidgetBuilder(id, userId);
  }
}
