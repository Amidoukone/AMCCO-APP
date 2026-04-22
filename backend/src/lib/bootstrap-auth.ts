export const BOOTSTRAP_COMPANY_ID = "__bootstrap__";
export const BOOTSTRAP_COMPANY_CODE = "SETUP";

export function isBootstrapCompanyId(companyId: string): boolean {
  return companyId === BOOTSTRAP_COMPANY_ID;
}
