export type BtpProject = {
  id: string;
  companyId: string;
  name: string;
  clientRef: string | null;
  contractRef: string | null;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BtpProjectSingleResponse = {
  item: BtpProject;
};

export type BtpProjectListResponse = {
  items: BtpProject[];
};
