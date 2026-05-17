const ELEVATED_ROLE_KEYS = new Set(['SUPERADMIN', 'SUPER_ADMIN', 'SUPERADMINISTRATOR', 'SUPER_ADMINISTRATOR']);
const AGENT_ROLE_KEYS = new Set(['AGENT', 'SALESAGENT', 'SALES_AGENT']);
const AGENT_PORTAL_STAFF_KEYS = new Set(['ADMIN', 'SUPERADMIN', 'SUPER_ADMIN', 'SUPERADMINISTRATOR', 'SUPER_ADMINISTRATOR']);
const STAFF_DASHBOARD_KEYS = new Set([
  'ADMIN',
  'SUPERADMIN',
  'SUPER_ADMIN',
  'SUPERADMINISTRATOR',
  'SUPER_ADMINISTRATOR',
  'MANAGER',
  'FINANCE',
  'FINANCEMANAGER',
  'FINANCE_MANAGER',
  'OPERATIONS',
  'OPSMANAGER',
  'OPS_MANAGER',
  'STAFF',
  'RELATIONSHIPMANAGER',
  'RELATIONSHIP_MANAGER',
  'CLAIMSOFFICER',
  'CLAIMS_OFFICER',
]);

export function normalizeRoleName(role: string): string {
  return role.trim().replace(/[\s-]+/g, '_').toUpperCase();
}

export function hasElevatedRole(roles: string[]): boolean {
  return roles.some((role) => ELEVATED_ROLE_KEYS.has(normalizeRoleName(role)));
}

export function hasAgentRole(roles: string[]): boolean {
  return roles.some((role) => AGENT_ROLE_KEYS.has(normalizeRoleName(role)));
}

export function hasAgentPortalStaffRole(roles: string[]): boolean {
  return roles.some((role) => AGENT_PORTAL_STAFF_KEYS.has(normalizeRoleName(role)));
}

export function hasStaffDashboardRole(roles: string[]): boolean {
  return roles.some((role) => STAFF_DASHBOARD_KEYS.has(normalizeRoleName(role)));
}

export function hasAnyRole(roles: string[], required: string[]): boolean {
  const userRoles = new Set(roles.map(normalizeRoleName));
  return required.some((role) => userRoles.has(normalizeRoleName(role)));
}
