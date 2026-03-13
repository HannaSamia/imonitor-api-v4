import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { AutomatedReportService } from './automated-report.service';
import {
  AutomatedReportDto,
  ListAutomatedReportDto,
  SaveAutomatedReportDto,
  UpdateAutomatedReportDto,
} from './dto/automated-report.dto';

@ApiTags('AutomatedReports Routes')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/automatedreports')
export class AutomatedReportController {
  constructor(private readonly automatedReportService: AutomatedReportService) {}

  @Post('/')
  @ApiOperation({ summary: 'INSERT A NEW AUTOMATED REPORT' })
  @ApiResponse({ status: 200, description: ErrorMessages.AR_INSERTED })
  async create(@Body() dto: SaveAutomatedReportDto, @CurrentUser() user: JwtPayload) {
    await this.automatedReportService.create(dto, user.id);
    return { message: ErrorMessages.AR_INSERTED };
  }

  @Put('/:id')
  @ApiOperation({ summary: 'UPDATE A CURRENT AUTOMATEDREPORT' })
  @ApiResponse({ status: 200, description: ErrorMessages.AR_UPDATED })
  async update(@Body() dto: UpdateAutomatedReportDto, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.automatedReportService.update(dto, id, user.id);
    return { message: ErrorMessages.AR_UPDATED };
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'DELETE A CURRENT AUTOMATEDREPORT' })
  @ApiResponse({ status: 200, description: ErrorMessages.AR_DELETED })
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.automatedReportService.delete(id, user.id);
    return { message: ErrorMessages.AR_DELETED };
  }

  @Put('/change/status/:id')
  @ApiOperation({ summary: 'TOGGLE ACTIVE STATUS OF AUTOMATEDREPORT' })
  @ApiResponse({ status: 200, description: ErrorMessages.AR_ACTIVATED_DEACTIVATED })
  async toggleStatus(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.automatedReportService.toggleStatus(id, user.id);
    return { message: ErrorMessages.AR_ACTIVATED_DEACTIVATED, result };
  }

  @Get('/user')
  @ApiOperation({ summary: 'GET AUTOMATEDREPORT FROM USER ID' })
  @ApiResponse({ status: 200, type: [ListAutomatedReportDto] })
  async listByUser(@CurrentUser() user: JwtPayload): Promise<{ result: ListAutomatedReportDto[] }> {
    const result = await this.automatedReportService.listByUser(user.id);
    return { result };
  }

  @Get('/report/:id')
  @ApiOperation({ summary: 'GET AUTOMATEDREPORT FROM REPORT ID' })
  @ApiResponse({ status: 200, type: [ListAutomatedReportDto] })
  async listByReportId(
    @Param('id') reportId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ result: ListAutomatedReportDto[] }> {
    const result = await this.automatedReportService.listByReportId(user.id, reportId);
    return { result };
  }

  @Get('/:id')
  @ApiOperation({ summary: 'GET AUTOMATEDREPORT FROM AUTOMATEDREPORT ID' })
  @ApiResponse({ status: 200, type: AutomatedReportDto })
  async getById(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<{ result: AutomatedReportDto }> {
    const result = await this.automatedReportService.getById(user.id, id);
    return { result };
  }
}
