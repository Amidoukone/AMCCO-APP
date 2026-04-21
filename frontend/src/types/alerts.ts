export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type AlertItem = {
  id: string;
  companyId: string;
  targetUserId: string;
  code: string;
  message: string;
  severity: AlertSeverity;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
};

export type AlertListResponse = {
  items: AlertItem[];
  unreadCount: number;
};

export type AlertSummaryResponse = {
  item: {
    unreadCount: number;
  };
};
