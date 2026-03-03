import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { SystemConfigService } from '../../shared/services/system-config.service';

@ApiTags('Settings')
@ApiBearerAuth('JWT')
@UseGuards(PrivilegeGuard)
@Controller('api/v1/users')
export class SettingsController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get('settings')
  @ApiOperation({ summary: 'List system configurations' })
  async systemSettings() {
    const keys = ['maxDaysCompare', 'maxHoursCompare', 'maxMonthCompare', 'maxWeekCompare', 'maxYearCompare'];
    const result = await this.systemConfigService.getConfigValues(keys);
    return { result };
  }

  @Get('settings/:name')
  @ApiOperation({ summary: 'Get module settings by name' })
  async getModuleSettings(@Param('name') name: string) {
    const settings = await this.systemConfigService.getSettingsByColumn(name);
    const result: Record<string, string> = {};
    for (const setting of settings) {
      result[setting.confKey] = setting.confVal ?? '';
    }
    return { result };
  }
}
