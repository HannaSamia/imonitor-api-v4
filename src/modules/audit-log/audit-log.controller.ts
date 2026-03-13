import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { ErrorMessages } from '../../shared/constants/error-messages';
import { AuditLogService } from './audit-log.service';
import { AuditLogsTableResponseDto } from './dto/audit-log.dto';

@ApiTags('Audit Log')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/auditlog')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * IMPORTANT: /operations must be declared BEFORE /:id/:request to avoid
   * NestJS routing ambiguity — "operations" would otherwise match ":id".
   */
  @Get('operations')
  @ApiOperation({ summary: 'Get list of audit log operations' })
  @ApiResponse({ status: 200, description: 'List of operations', type: [String] })
  async getOperations(): Promise<string[]> {
    return this.auditLogService.getAuditOperations();
  }

  @Get(':fromdate/:todate/:operation')
  @ApiOperation({ summary: 'Get audit logs table with header and body' })
  @ApiParam({ name: 'fromdate', description: 'Start date (YYYY-MM-DD HH:mm:ss)' })
  @ApiParam({ name: 'todate', description: 'End date (YYYY-MM-DD HH:mm:ss)' })
  @ApiParam({ name: 'operation', description: 'JSON-stringified array of operations' })
  @ApiResponse({ status: 200, description: 'Audit logs table', type: AuditLogsTableResponseDto })
  async getAuditLogsTable(
    @Param('fromdate') fromDate: string,
    @Param('todate') toDate: string,
    @Param('operation') operationParam: string,
  ): Promise<AuditLogsTableResponseDto> {
    let operation: string[];
    try {
      operation = JSON.parse(operationParam) as string[];
    } catch {
      operation = [];
    }

    if (!operation || operation.length === 0) {
      throw new BadRequestException(ErrorMessages.AUDIT_MISSING_OPERATION);
    }

    return this.auditLogService.getAuditLogsTable(fromDate, toDate, operation);
  }

  @Get(':id/:request')
  @ApiOperation({ summary: 'Get audit log request or response detail' })
  @ApiParam({ name: 'id', description: 'Concatenated id1+id2 value' })
  @ApiParam({ name: 'request', description: "'true' for request, 'false' for response" })
  @ApiResponse({ status: 200, description: 'Audit log detail value', type: String })
  async getAuditDetails(@Param('id') id: string, @Param('request') requestParam: string): Promise<string> {
    const isRequest = requestParam === 'true';
    return this.auditLogService.getAuditDetails(id, isRequest);
  }
}
