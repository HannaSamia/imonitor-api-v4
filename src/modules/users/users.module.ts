import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserPrivilegesService } from './user-privileges.service';
import { UserPasswordService } from './user-password.service';
import { UsersController } from './users.controller';
import { SettingsController } from './settings.controller';

@Module({
  controllers: [UsersController, SettingsController],
  providers: [UsersService, UserPrivilegesService, UserPasswordService],
  exports: [UsersService, UserPrivilegesService, UserPasswordService],
})
export class UsersModule {}
