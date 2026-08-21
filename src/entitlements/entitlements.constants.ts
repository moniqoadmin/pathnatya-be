export const ADMIN_LOGIN_ELECTRON_APP = 'ADMIN_LOGIN_ELECTRON_APP';
export const SHOW_ANALYTICS = 'SHOW_ANALYTICS';

export type DefaultEntitlement = {
  key: string;
  enabled: boolean;
  description: string;
};

/**
 * Seeded into `entitlements` when the table is created (or when a known key is
 * missing). Existing rows are never overwritten, so SuperAdmin toggles stick.
 */
export const DEFAULT_ENTITLEMENTS: DefaultEntitlement[] = [
  {
    key: ADMIN_LOGIN_ELECTRON_APP,
    enabled: true,
    description:
      'When true, Admin, SuperAdmin, and Developer may log in from the Electron app as well as the admin UI. When false, those roles may only log in with ?admin=true; the Electron app accepts User roles only.',
  },
  {
    key: SHOW_ANALYTICS,
    enabled: true,
    description:
      'When true, the admin dashboard shows login analytics and GET /accounts/analytics is allowed. When false, the dashboard should hide analytics and that endpoint returns 403.',
  },
];
