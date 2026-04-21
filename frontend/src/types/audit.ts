export type AuditLogItem = {
  id: string;
  companyId: string;
  actorId: string;
  actorEmail: string;
  actorFullName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
};

export type AuditLogsResponse = {
  items: AuditLogItem[];
};

export type AuditLogsQuery = {
  limit?: number;
  offset?: number;
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
};
