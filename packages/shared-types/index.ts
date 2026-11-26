export type UserRole =
  | 'PATIENT'
  | 'RECEPTIONIST'
  | 'DOCTOR'
  | 'NURSE'
  | 'LAB_TECHNICIAN'
  | 'BILLING_OFFICER'
  | 'HOSPITAL_ADMIN';

export type AppointmentStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type AppointmentType = 'CONSULTATION' | 'FOLLOW_UP' | 'PROCEDURE' | 'EMERGENCY';

export type EncounterStatus = 'IN_PROGRESS' | 'COMPLETED';

export type LabOrderStatus =
  | 'ORDERED'
  | 'SPECIMEN_COLLECTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'CANCELLED';

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'CANCELLED'
  | 'OVERDUE';

export type ConsentCategory = 'TREATMENT' | 'DATA_SHARING' | 'RESEARCH' | 'COMMUNICATION';
export type ConsentStatus = 'GRANTED' | 'REVOKED' | 'EXPIRED';

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details: Array<{ field?: string; message: string; code?: string }>;
  };
  requestId?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
