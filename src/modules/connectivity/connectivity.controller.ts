import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ConnectivityService } from './connectivity.service';
import { ConnectivityHistoryParamsDto } from './dto/connectivity.dto';

@ApiTags('Connectivity Routes')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/connectivities')
export class ConnectivityController {
  constructor(private readonly connectivityService: ConnectivityService) {}

  @Get()
  @ApiOperation({ summary: 'Get current connectivity status of all nodes' })
  @ApiResponse({ status: 200, description: 'Current connectivity data with headers and body' })
  async getAllConnectivities(@CurrentUser('id') userId: string) {
    return this.connectivityService.getAllConnectivities(userId);
  }

  @Get(':fromdate/:todate/:filter')
  @ApiOperation({ summary: 'Get connectivity history within date range' })
  @ApiResponse({ status: 200, description: 'Historical connectivity data with headers and body' })
  async getConnectivityHistory(@Param() params: ConnectivityHistoryParamsDto, @CurrentUser('id') userId: string) {
    return this.connectivityService.getUserConnectivityHistory(userId, params.fromdate, params.todate, params.filter);
  }

  @Get('export/excel/:fromdate/:todate/:filter')
  @ApiOperation({ summary: 'Export connectivity history to Excel' })
  @ApiResponse({ status: 200, description: 'Excel file path' })
  async exportExcel(@Param() params: ConnectivityHistoryParamsDto, @CurrentUser('id') userId: string) {
    return this.connectivityService.exportExcel(userId, params.fromdate, params.todate, params.filter);
  }
}
