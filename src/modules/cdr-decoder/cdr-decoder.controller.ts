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
import { CdrDecoderService } from './cdr-decoder.service';
import { CDRFileType } from './enums/cdr-decoder.enum';

@ApiTags('CDR Decoder')
@ApiBearerAuth()
@UseGuards(PrivilegeGuard)
@Controller('api/v1/cdr/decoder')
export class CdrDecoderController {
  constructor(private readonly cdrDecoderService: CdrDecoderService) {}

  @Get('list')
  @ApiOperation({ summary: 'List CDR decode processes for current user' })
  @ApiResponse({ status: 200, description: 'List of CDR decode processes' })
  async list(@CurrentUser('id') userId: string) {
    return this.cdrDecoderService.list(userId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('document'))
  @ApiOperation({ summary: 'Submit a compressed CDR file (.zip or .gz) for decoding' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document: { type: 'string', format: 'binary' },
        name: { type: 'string', example: 'My CDR Job' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Decode process started, returns process ID' })
  async decode(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ id: string }> {
    return this.cdrDecoderService.decode(file, name, userId);
  }

  @Get(':id/download/:type')
  @ApiOperation({ summary: 'Download original or decoded CDR file' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiParam({ name: 'type', description: 'File type: in (original) or out (decoded)', enum: CDRFileType })
  @ApiResponse({ status: 200, description: 'File stream' })
  async download(
    @Param('id') id: string,
    @Param('type') type: CDRFileType,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.cdrDecoderService.download(id, type, userId);
    res.download(filePath);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a CDR decode process and its files' })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiResponse({ status: 200, description: 'Process deleted' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string): Promise<void> {
    return this.cdrDecoderService.delete(id, userId);
  }
}
