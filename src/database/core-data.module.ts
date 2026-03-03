import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreApplicationUsers } from './entities/core-application-users.entity';
import { CoreApplicationRoles } from './entities/core-application-roles.entity';
import { CoreApplicationRefreshToken } from './entities/core-application-refresh-token.entity';
import { CorePrivileges } from './entities/core-privileges.entity';
import { CoreModules } from './entities/core-modules.entity';
import { CoreMinimumPrivileges } from './entities/core-minimum-privileges.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoreApplicationUsers,
      CoreApplicationRoles,
      CoreApplicationRefreshToken,
      CorePrivileges,
      CoreModules,
      CoreMinimumPrivileges,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CoreDataModule {}
