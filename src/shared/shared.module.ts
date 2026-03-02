import { Module, Global } from '@nestjs/common';
import { DateHelperService } from './services/date-helper.service';
import { PasswordService } from './services/password.service';

@Global()
@Module({
  providers: [DateHelperService, PasswordService],
  exports: [DateHelperService, PasswordService],
})
export class SharedModule {}
