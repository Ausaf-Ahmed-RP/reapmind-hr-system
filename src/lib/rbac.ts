export type Role = 'FRONT_DESK' | 'HR' | 'DIRECTOR' | 'CEO' | 'ADMIN';

export const PERMISSIONS = {
  CAN_ADD_CANDIDATE: ['FRONT_DESK', 'HR', 'ADMIN'] as Role[],
  CAN_VIEW_ALL_CANDIDATES: ['HR', 'DIRECTOR', 'CEO', 'ADMIN'] as Role[],
  CAN_ASSIGN: ['HR', 'DIRECTOR', 'CEO', 'ADMIN'] as Role[], // Front Desk can if setting is enabled
  CAN_ADD_FEEDBACK: ['HR', 'DIRECTOR', 'CEO'] as Role[], // Admin cannot add feedback per matrix
  CAN_VIEW_FEEDBACK: ['HR', 'DIRECTOR', 'CEO', 'ADMIN'] as Role[], // Front Desk strictly cannot
  CAN_CHANGE_STATUS: ['HR', 'DIRECTOR', 'CEO', 'ADMIN'] as Role[],
  CAN_DOWNLOAD_RESUME: ['HR', 'DIRECTOR', 'CEO', 'ADMIN'] as Role[],
  CAN_EXPORT_REPORTS: ['HR', 'DIRECTOR', 'CEO', 'ADMIN'] as Role[],
  CAN_MANAGE_ADMIN: ['ADMIN'] as Role[],
};

export function hasPermission(role: string, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(role as Role);
}
