import type { RoleCode } from "./role";

export type LoginInput = {
  email: string;
  password: string;
  companyCode: string;
};

export type LoginUser = {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  companyId: string;
  companyCode: string;
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
  companyId: string;
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  companyCode?: string;
};
