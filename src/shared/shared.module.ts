import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreSysConfig } from '../database/entities/core-sys-config.entity';
import { DateHelperService } from './services/date-helper.service';
import { PasswordService } from './services/password.service';
import { SystemConfigService } from './services/system-config.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([CoreSysConfig])],
  providers: [DateHelperService, PasswordService, SystemConfigService],
  exports: [DateHelperService, PasswordService, SystemConfigService],
})
export class SharedModule {}
