import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PrivilegeGuard } from './guards/privilege.guard';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_KEY'),
        signOptions: {
          algorithm: 'HS256',
        },
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard],
  exports: [JwtAuthGuard, RolesGuard, PrivilegeGuard, ApiKeyGuard, JwtModule],
})
export class AuthModule {}
