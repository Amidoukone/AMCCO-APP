import { listAuditLogsByCompany } from "../repositories/audit.repository.js";

export async function listCompanyAuditLogs(input: {
  companyId: string;
  limit?: number;
  offset?: number;
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
}) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  return listAuditLogsByCompany({
    companyId: input.companyId,
    limit,
    offset,
    action: input.action,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId
  });
}
