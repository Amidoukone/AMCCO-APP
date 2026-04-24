import type { RoleCode } from "./role.js";

export type AuthContext = {
  userId: string;
  companyId: string;
  role: RoleCode;
  email: string;
  fullName?: string;
};

export type AccessTokenPayload = AuthContext & {
  type: "access";
};

export type RefreshTokenPayload = AuthContext & {
  type: "refresh";
  sessionId: string;
};
