import type { BusinessActivityCode } from "../config/businessActivities";

export type ActivityFieldDefinition = {
  key: string;
  label: string;
  required: boolean;
  helpText: string;
};

export type ActivityWorkflowStep = {
  code: string;
  label: string;
  description: string;
};

export type ActivityReportHighlight = {
  code: string;
  label: string;
  description: string;
  value: string;
  emphasis: "INFO" | "WARNING" | "CRITICAL";
};

export type BusinessActivityProfile = {
  activityCode: BusinessActivityCode;
  label: string;
  description: string;
  operationsModel: string;
  finance: {
    allowedTransactionTypes: Array<"CASH_IN" | "CASH_OUT">;
    allowedCurrencies: string[];
    requiresDescription: boolean;
    requiresProof: boolean;
    fields: ActivityFieldDefinition[];
    metadataFields?: ActivityFieldDefinition[];
    workflow: ActivityWorkflowStep[];
  };
  tasks: {
    requiresDescription: boolean;
    requiresDueDate: boolean;
    requiresAssignee: boolean;
    completionRequiresAssignee: boolean;
    blockedRequiresAssignee: boolean;
    blockedAlertSeverity: "INFO" | "WARNING" | "CRITICAL";
    fields: ActivityFieldDefinition[];
    metadataFields?: ActivityFieldDefinition[];
    workflow: ActivityWorkflowStep[];
  };
  reporting: {
    focusArea: string;
    exportSections: string[];
  };
};

export type CompanyActivityItem = {
  code: BusinessActivityCode;
  label: string;
  description: string;
  isEnabled: boolean;
};

export type CompanyActivitiesResponse = {
  items: CompanyActivityItem[];
  profiles: BusinessActivityProfile[];
};

export type AdminCompanyActivitiesResponse = {
  items: CompanyActivityItem[];
  profiles: BusinessActivityProfile[];
  legacySummary: {
    unclassifiedTransactionsCount: number;
    unclassifiedTasksCount: number;
  };
};

export type AdminCompanyActivitySingleResponse = {
  item: CompanyActivityItem;
};

export type ReclassifyLegacyActivitiesInput = {
  targetActivityCode: BusinessActivityCode;
  scope: "TRANSACTIONS" | "TASKS" | "BOTH";
};

export type ReclassifyLegacyActivitiesResponse = {
  item: {
    targetActivityCode: BusinessActivityCode;
    scope: "TRANSACTIONS" | "TASKS" | "BOTH";
    updatedTransactionsCount: number;
    updatedTasksCount: number;
  };
};
