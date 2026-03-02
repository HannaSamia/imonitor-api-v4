import { SetMetadata } from '@nestjs/common';
import { AvailableRoles } from '../../shared/enums/roles.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AvailableRoles[]) => SetMetadata(ROLES_KEY, roles);
