import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { ApiKeyGuard } from '../../auth/guards/api-key.guard';
import { ConsolidateDto } from './dto/utility.dto';
import { UtilityService } from './utility.service';

@ApiTags('Utility')
@Controller('api/v1/utilities')
export class UtilityController {
  constructor(private readonly utilityService: UtilityService) {}

  @Public()
  @Get('ping')
  @ApiOperation({ summary: 'Health ping — returns pong' })
  @ApiResponse({ status: 200, description: 'pong', type: String })
  ping(): string {
    return this.utilityService.ping();
  }

  @Post('consolidate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Consolidate hourly/daily stats for given tables' })
  @ApiResponse({ status: 200, description: 'Consolidation complete' })
  async consolidate(@Body() dto: ConsolidateDto): Promise<void> {
    return this.utilityService.consolidate(dto.tables, dto.date);
  }
}
