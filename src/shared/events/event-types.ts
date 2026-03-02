/**
 * Typed event name constants organized by domain.
 * Listeners will be implemented in Phase 3 feature modules.
 */

export const AuthEvents = {
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  TOKEN_REFRESH: 'auth.token.refresh',
  PASSWORD_CHANGE: 'auth.password.change',
} as const;

export const DashboardEvents = {
  CREATED: 'dashboard.created',
  UPDATED: 'dashboard.updated',
  DELETED: 'dashboard.deleted',
  SHARED: 'dashboard.shared',
  FAVORITED: 'dashboard.favorited',
} as const;

export const ReportEvents = {
  CREATED: 'report.created',
  UPDATED: 'report.updated',
  DELETED: 'report.deleted',
  SHARED: 'report.shared',
  EXPORTED: 'report.exported',
} as const;

export const NotificationEvents = {
  CREATED: 'notification.created',
  READ: 'notification.read',
  DISMISSED: 'notification.dismissed',
} as const;

export const ObservabilityEvents = {
  ALARM_TRIGGERED: 'observability.alarm.triggered',
  ALARM_RESOLVED: 'observability.alarm.resolved',
  HEALTH_CHECK: 'observability.health.check',
} as const;

export const SystemEvents = {
  CONFIG_UPDATED: 'system.config.updated',
  CACHE_CLEARED: 'system.cache.cleared',
} as const;
