import { Controller, Get, Put, Patch, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { ListSentNotificationsQueryDto, TestEmailParamsDto } from './dto/notification.dto';

@ApiTags('Notification Routes')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List sent notifications with pagination and search' })
  @ApiResponse({ status: 200, description: 'Paginated notification list' })
  async listSent(@CurrentUser('id') userId: string, @Query() query: ListSentNotificationsQueryDto) {
    return this.notificationService.listSent(userId, query.page, query.size, query.search);
  }

  @Get('settings')
  @ApiOperation({ summary: 'List user notification settings (subscriptions)' })
  @ApiResponse({ status: 200, description: 'Array of notification settings with messages' })
  async listSettings(@CurrentUser('id') userId: string) {
    return this.notificationService.listNotificationsSettings(userId);
  }

  @Put('view')
  @ApiOperation({ summary: 'Mark all notifications as viewed' })
  @ApiResponse({ status: 200, description: 'All notifications marked as viewed' })
  async viewAll(@CurrentUser('id') userId: string) {
    return this.notificationService.viewAll(userId);
  }

  @Patch('view/:id')
  @ApiOperation({ summary: 'Mark single notification as viewed' })
  @ApiResponse({ status: 200, description: 'Notification marked as viewed' })
  async view(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.notificationService.markAsViewed(id, userId);
  }

  @Patch('unsubscribe/:id')
  @ApiOperation({ summary: 'Unsubscribe from notification setting' })
  @ApiResponse({ status: 200, description: 'User unsubscribed' })
  async unsubscribe(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.notificationService.unsubscribeUserFromNotification(id, userId);
  }

  @Get('test/:email')
  @ApiOperation({ summary: 'Send test notification email' })
  @ApiResponse({ status: 200, description: 'Test email sent' })
  async testEmail(@Param() params: TestEmailParamsDto) {
    return this.notificationService.testEmail(params.email);
  }
}
