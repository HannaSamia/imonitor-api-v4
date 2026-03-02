export enum AvailableRoles {
  SUPER_ADMIN = 'superadmin',
  ADMIN = 'admin',
  SUPER_USER = 'superuser',
  USER = 'user',
  DEFAULT = 'N/A',
}

/** Role hierarchy — higher index = lower privilege */
export const ROLE_HIERARCHY: string[] = [
  AvailableRoles.SUPER_ADMIN,
  AvailableRoles.ADMIN,
  AvailableRoles.SUPER_USER,
  AvailableRoles.USER,
  AvailableRoles.DEFAULT,
];
