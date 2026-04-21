import type { RoleCode } from "./role";

export type AdminUserItem = {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: RoleCode;
  membershipCreatedAt: string;
};

export type AdminUsersListResponse = {
  items: AdminUserItem[];
};

export type AdminUserSingleResponse = {
  item: AdminUserItem;
};

export type CreateAdminUserInput = {
  email: string;
  fullName: string;
  password: string;
  role: RoleCode;
};

export type UpdateAdminUserInput = {
  fullName?: string;
  isActive?: boolean;
};

export type ChangeAdminUserRoleInput = {
  role: RoleCode;
};

export type ResetAdminUserPasswordInput = {
  newPassword: string;
};
