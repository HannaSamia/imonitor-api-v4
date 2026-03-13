import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrivilegeGuard } from '../../auth/guards/privilege.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BillRunService } from './bill-run.service';
import { BillRunFileType } from './enums/bill-run.enum';

@ApiTags('Bill Run')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/billrun')
export class BillRunController {
  constructor(private readonly billRunService: BillRunService) {}

  @Get()
  @ApiOperation({ summary: 'List bill run processes for current user' })
  @ApiResponse({ status: 200, description: 'List of bill run processes' })
  async list(@CurrentUser('id') userId: string) {
    return this.billRunService.list(userId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('document'))
  @ApiOperation({ summary: 'Upload MSISDN CSV and start a bill run process' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document: { type: 'string', format: 'binary' },
        name: { type: 'string', example: 'March 2026 Bill Run' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Bill run started, returns process ID' })
  async add(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ id: string }> {
    return this.billRunService.add(file, name, userId);
  }

  @Get(':id/download/:type')
  @ApiOperation({ summary: 'Download bill run input CSV or output Excel' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiParam({ name: 'type', description: 'File type: in (input) or out (output)', enum: BillRunFileType })
  @ApiResponse({ status: 200, description: 'File stream' })
  async download(
    @Param('id') id: string,
    @Param('type') type: BillRunFileType,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.billRunService.download(id, type, userId);
    res.download(filePath);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a bill run process and its files' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiResponse({ status: 200, description: 'Process deleted' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string): Promise<void> {
    return this.billRunService.delete(id, userId);
  }
}
