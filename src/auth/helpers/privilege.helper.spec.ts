import { hasPrivilege } from './privilege.helper';
import { AvailableRoles } from '../../shared/enums/roles.enum';

describe('hasPrivilege', () => {
  // ─── Hierarchy: superadmin > admin > superuser > user > N/A ───────────

  describe('superadmin role', () => {
    it('should grant access to superadmin-required routes', () => {
      expect(hasPrivilege(AvailableRoles.SUPER_ADMIN, AvailableRoles.SUPER_ADMIN)).toBe(true);
    });

    it('should grant access to all lower roles', () => {
      expect(hasPrivilege(AvailableRoles.SUPER_ADMIN, AvailableRoles.ADMIN)).toBe(true);
      expect(hasPrivilege(AvailableRoles.SUPER_ADMIN, AvailableRoles.SUPER_USER)).toBe(true);
      expect(hasPrivilege(AvailableRoles.SUPER_ADMIN, AvailableRoles.USER)).toBe(true);
      expect(hasPrivilege(AvailableRoles.SUPER_ADMIN, AvailableRoles.DEFAULT)).toBe(true);
    });
  });

  describe('admin role', () => {
    it('should grant access to admin and below', () => {
      expect(hasPrivilege(AvailableRoles.ADMIN, AvailableRoles.ADMIN)).toBe(true);
      expect(hasPrivilege(AvailableRoles.ADMIN, AvailableRoles.SUPER_USER)).toBe(true);
      expect(hasPrivilege(AvailableRoles.ADMIN, AvailableRoles.USER)).toBe(true);
      expect(hasPrivilege(AvailableRoles.ADMIN, AvailableRoles.DEFAULT)).toBe(true);
    });

    it('should deny access to superadmin', () => {
      expect(hasPrivilege(AvailableRoles.ADMIN, AvailableRoles.SUPER_ADMIN)).toBe(false);
    });
  });

  describe('user role', () => {
    it('should grant access to user and N/A only', () => {
      expect(hasPrivilege(AvailableRoles.USER, AvailableRoles.USER)).toBe(true);
      expect(hasPrivilege(AvailableRoles.USER, AvailableRoles.DEFAULT)).toBe(true);
    });

    it('should deny access to higher roles', () => {
      expect(hasPrivilege(AvailableRoles.USER, AvailableRoles.SUPER_ADMIN)).toBe(false);
      expect(hasPrivilege(AvailableRoles.USER, AvailableRoles.ADMIN)).toBe(false);
      expect(hasPrivilege(AvailableRoles.USER, AvailableRoles.SUPER_USER)).toBe(false);
    });
  });

  describe('N/A (default) role', () => {
    it('should only grant access to N/A', () => {
      expect(hasPrivilege(AvailableRoles.DEFAULT, AvailableRoles.DEFAULT)).toBe(true);
    });

    it('should deny access to all other roles', () => {
      expect(hasPrivilege(AvailableRoles.DEFAULT, AvailableRoles.USER)).toBe(false);
      expect(hasPrivilege(AvailableRoles.DEFAULT, AvailableRoles.ADMIN)).toBe(false);
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should return false for empty userRole', () => {
      expect(hasPrivilege('', AvailableRoles.USER)).toBe(false);
    });

    it('should return false for empty minimumRole', () => {
      expect(hasPrivilege(AvailableRoles.ADMIN, '')).toBe(false);
    });

    it('should return false for unknown userRole', () => {
      expect(hasPrivilege('unknown', AvailableRoles.USER)).toBe(false);
    });

    it('should return false for unknown minimumRole', () => {
      expect(hasPrivilege(AvailableRoles.ADMIN, 'unknown')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(hasPrivilege('Admin', 'user')).toBe(true);
      expect(hasPrivilege('SUPERADMIN', 'admin')).toBe(true);
      expect(hasPrivilege('User', 'ADMIN')).toBe(false);
    });

    it('should return false for null-like inputs', () => {
      expect(hasPrivilege(null as any, AvailableRoles.USER)).toBe(false);
      expect(hasPrivilege(undefined as any, AvailableRoles.USER)).toBe(false);
      expect(hasPrivilege(AvailableRoles.USER, null as any)).toBe(false);
      expect(hasPrivilege(AvailableRoles.USER, undefined as any)).toBe(false);
    });
  });
});
