import type { CompanyMembershipSummary, CompanyProfile } from "./companies";
import type { RoleCode } from "./role";

export type LoginInput = {
  email: string;
  password: string;
  clientDiagnostics?: LoginClientDiagnostics;
};

export type LoginClientDiagnostics = {
  submitSource: "form-data";
  emailChangedByNormalization: boolean;
  passwordChangedByNormalization: boolean;
  passwordHadOuterWhitespace: boolean;
  passwordHadZeroWidthCharacters: boolean;
  passwordHadNonAsciiCharacters: boolean;
};

export type ChangeOwnPasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type LoginUser = {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  companyId: string | null;
  companyCode: string | null;
  bootstrapMode: boolean;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: LoginUser;
};

export type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

export type MeResponse = {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: RoleCode;
  };
  company: CompanyProfile | null;
  memberships: CompanyMembershipSummary[];
  bootstrapMode: boolean;
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  companyCode?: string;
  companyId?: string;
};
