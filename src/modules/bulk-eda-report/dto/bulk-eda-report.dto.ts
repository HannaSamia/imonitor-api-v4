// Response interfaces (mirroring v3 DTOs)
export interface ListBulkEdaDTO {
  id: string;
  name: string;
  status: string;
  processingDate: string;
  createdAt: string;
  createdBy: string;
}

export interface GetEdaInfoBulkDto {
  phoneNumber: string;
}
