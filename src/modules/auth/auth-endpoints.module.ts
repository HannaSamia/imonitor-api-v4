import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [AuthModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthEndpointsModule {}
