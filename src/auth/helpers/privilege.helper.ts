import { ROLE_HIERARCHY } from '../../shared/enums/roles.enum';

/**
 * Check if user's role meets the minimum required role.
 * Role hierarchy: superadmin > admin > superuser > user > N/A
 * Matching v3's authorization.util.ts hasPrivilege() exactly.
 */
export function hasPrivilege(userRole: string, minimumRole: string): boolean {
  if (!userRole || !minimumRole) {
    return false;
  }

  const userIndex = ROLE_HIERARCHY.findIndex((r) => r.toLowerCase() === userRole.toLowerCase());
  const minIndex = ROLE_HIERARCHY.findIndex((r) => r.toLowerCase() === minimumRole.toLowerCase());

  // Unknown roles are denied
  if (userIndex === -1 || minIndex === -1) {
    return false;
  }

  // Lower index = higher privilege
  return userIndex <= minIndex;
}
