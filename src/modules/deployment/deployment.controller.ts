import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { DeploymentService } from './deployment.service';
import { AppModuleDto } from './dto/deployment.dto';

@ApiTags('Deployment')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/deploy')
export class DeploymentController {
  constructor(private readonly deploymentService: DeploymentService) {}

  @Post('fix/:tableType')
  @ApiOperation({ summary: 'Fix/insert table fields for a given table type' })
  @ApiParam({ name: 'tableType', description: 'Table type to process (e.g. node, param)' })
  @ApiResponse({ status: 201, description: 'Table fields fixed' })
  async tableFieldsFixer(@Param('tableType') tableType: string): Promise<void> {
    return this.deploymentService.tableFieldsFixer(tableType);
  }

  @Post('module')
  @ApiOperation({ summary: 'Insert a new application module and assign N/A privileges to all users' })
  @ApiResponse({ status: 201, description: 'Module inserted' })
  async moduleInserter(@Body() dto: AppModuleDto): Promise<void> {
    return this.deploymentService.moduleInserter(dto);
  }
}
