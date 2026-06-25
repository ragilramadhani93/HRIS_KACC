export type AppRole =
  | 'super_admin'
  | 'hr_admin'
  | 'regional_manager'
  | 'area_manager'
  | 'supervisor'
  | 'auditor'
  | 'employee';

export type EmployeeStatus = 'active' | 'probation' | 'contract' | 'resigned' | 'terminated';
export type GenderType = 'male' | 'female';
export type MaritalStatusType = 'single' | 'married' | 'divorced' | 'widowed';
export type DocumentType = 'ktp' | 'npwp' | 'kk' | 'bpjs' | 'contract' | 'other';
export type OutletType =
  | 'coffee_shop'
  | 'coffee_corner'
  | 'mobile_coffee'
  | 'warehouse'
  | 'office'
  | 'event_booth'
  | 'distributor';
export type AttendanceStatus = 'present' | 'late' | 'early_leave' | 'absent' | 'holiday' | 'overtime';
export type GeofenceStatus = 'inside' | 'outside' | 'unknown';
export type FaceProfileStatus = 'pending' | 'verified' | 'rejected';
export type RotationType = 'daily' | 'weekly' | 'monthly';
export type LeaveStatus =
  | 'pending'
  | 'approved_supervisor'
  | 'approved_manager'
  | 'approved_hr'
  | 'approved'
  | 'rejected'
  | 'cancelled';
export type OvertimeStatus =
  | 'pending'
  | 'approved_supervisor'
  | 'approved_manager'
  | 'approved'
  | 'rejected'
  | 'cancelled';
export type NotificationType = 'attendance' | 'payroll' | 'leave' | 'overtime' | 'shift' | 'system' | 'approval';
export type PayrollRunStatus = 'draft' | 'review' | 'approved' | 'paid' | 'cancelled';
export type ComponentType = 'earning' | 'deduction' | 'benefit';
export type ExpenseClaimStatus =
  | 'draft'
  | 'submitted'
  | 'approved_supervisor'
  | 'approved_manager'
  | 'approved_finance'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface Company {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Region {
  id: string;
  company_id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  company?: Company;
}

export interface Area {
  id: string;
  region_id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  region?: Region;
}

export interface Outlet {
  id: string;
  area_id: string;
  outlet_code: string;
  name: string;
  outlet_type: OutletType;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  manager_id: string | null;
  manager_employee_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  area?: Area;
}

export interface UserProfile {
  id: string;
  company_id: string | null;
  full_name: string;
  role: AppRole;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  company?: Company;
}

export interface Employee {
  id: string;
  user_id: string | null;
  company_id: string;
  employee_code: string;
  full_name: string;
  nik: string | null;
  birth_place: string | null;
  birth_date: string | null;
  gender: GenderType | null;
  marital_status: MaritalStatusType | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  job_title: string | null;
  department: string | null;
  region_id: string | null;
  area_id: string | null;
  primary_outlet_id: string | null;
  backup_outlet_id: string | null;
  supervisor_id: string | null;
  join_date: string | null;
  status: EmployeeStatus;
  face_registered: boolean;
  basic_salary: number;
  salary_scheme: 'monthly' | 'daily';
  daily_rate: number;
  bpjs_kes_employee: number;
  bpjs_kes_employer: number;
  bpjs_tk_jht_employee: number;
  bpjs_tk_jht_employer: number;
  npwp: string | null;
  created_at: string;
  updated_at: string;
  company?: Company;
  region?: Region;
  area?: Area;
  primary_outlet?: Outlet;
  backup_outlet?: Outlet;
  supervisor?: Employee;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  document_type: DocumentType;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

export interface ShiftTemplate {
  id: string;
  company_id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  late_tolerance_minutes: number;
  rotation: RotationType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: string;
  employee_id: string;
  shift_template_id: string;
  effective_date: string;
  end_date: string | null;
  created_at: string;
  shift_template?: ShiftTemplate;
  employee?: Employee;
}

export interface FaceProfile {
  id: string;
  employee_id: string;
  photo_front_url: string | null;
  photo_left_url: string | null;
  photo_right_url: string | null;
  embedding_data: Record<string, unknown> | null;
  status: FaceProfileStatus;
  registered_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
}

export interface Attendance {
  id: string;
  employee_id: string;
  outlet_id: string | null;
  shift_template_id: string | null;
  attendance_date: string;
  check_in_time: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_geofence: GeofenceStatus;
  check_in_selfie_url: string | null;
  check_in_face_score: number | null;
  check_out_time: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_geofence: GeofenceStatus;
  check_out_selfie_url: string | null;
  status: AttendanceStatus;
  work_duration_minutes: number | null;
  notes: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
  outlet?: Outlet;
}

export interface LeaveType {
  id: string;
  company_id: string;
  name: string;
  code: string;
  days_per_year: number;
  requires_proof: boolean;
  is_active: boolean;
  created_at: string;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_days: number;
  used_days: number;
  pending_days: number;
  updated_at: string;
  leave_type?: LeaveType;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  proof_url: string | null;
  status: LeaveStatus;
  supervisor_id: string | null;
  supervisor_approved_at: string | null;
  supervisor_notes: string | null;
  manager_id: string | null;
  manager_approved_at: string | null;
  manager_notes: string | null;
  hr_id: string | null;
  hr_approved_at: string | null;
  hr_notes: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
  leave_type?: LeaveType;
  supervisor?: Employee;
}

export interface OvertimeRequest {
  id: string;
  employee_id: string;
  overtime_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number | null;
  reason: string | null;
  status: OvertimeStatus;
  supervisor_id: string | null;
  supervisor_approved_at: string | null;
  supervisor_notes: string | null;
  manager_id: string | null;
  manager_approved_at: string | null;
  manager_notes: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  reference_id: string | null;
  reference_table: string | null;
  created_at: string;
}

export interface PayrollComponent {
  id: string;
  company_id: string;
  name: string;
  code: string;
  component_type: ComponentType;
  is_taxable: boolean;
  is_fixed: boolean;
  default_amount: number;
  is_active: boolean;
  created_at: string;
}

export interface PayrollRun {
  id: string;
  company_id: string;
  period_month: number;
  period_year: number;
  run_date: string | null;
  status: PayrollRunStatus;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  company?: Company;
}

export interface PayrollItem {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  basic_salary: number;
  total_earnings: number;
  total_deductions: number;
  total_bpjs_kes: number;
  total_bpjs_tk: number;
  total_tax: number;
  net_salary: number;
  work_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  overtime_hours: number;
  leave_days: number;
  notes: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  employee?: Employee;
  lines?: PayrollItemLine[];
}

export interface PayrollItemLine {
  id: string;
  payroll_item_id: string;
  component_id: string | null;
  component_name: string;
  component_type: ComponentType;
  amount: number;
  is_taxable: boolean;
  notes: string | null;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  company_id: string;
  name: string;
  code: string;
  max_amount: number | null;
  requires_receipt: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ExpenseClaim {
  id: string;
  employee_id: string;
  category_id: string | null;
  claim_date: string;
  title: string;
  description: string | null;
  amount: number;
  receipt_url: string | null;
  status: ExpenseClaimStatus;
  supervisor_id: string | null;
  supervisor_approved_at: string | null;
  supervisor_notes: string | null;
  manager_id: string | null;
  manager_approved_at: string | null;
  manager_notes: string | null;
  finance_id: string | null;
  finance_approved_at: string | null;
  finance_notes: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
  category?: ExpenseCategory;
}

export type AbsenceType = 'sakit_dengan_surat' | 'sakit_tanpa_surat' | 'izin' | 'perbantuan';
export type AbsenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type SalaryScheme = 'monthly' | 'daily';
export type IncentiveType = 'sales' | 'achievement' | 'attendance';

export interface AbsenceRequest {
  id: string;
  employee_id: string;
  absence_type: AbsenceType;
  absence_date: string;
  end_date: string | null;
  total_days: number;
  reason: string | null;
  document_url: string | null;
  target_outlet_id: string | null;
  status: AbsenceStatus;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
  target_outlet?: Outlet;
}

export interface AreaSalaryRate {
  id: string;
  area_id: string;
  job_title: string | null;
  daily_rate: number;
  effective_from: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  area?: Area;
}

export interface IncentiveScheme {
  id: string;
  company_id: string;
  name: string;
  incentive_type: IncentiveType;
  fixed_amount: number;
  is_active: boolean;
  created_at: string;
}

export interface IncentiveRecord {
  id: string;
  employee_id: string;
  payroll_run_id: string | null;
  incentive_scheme_id: string | null;
  incentive_type: IncentiveType;
  period_year: number;
  period_month: number;
  qualified: boolean;
  absent_days: number;
  late_days: number;
  sick_no_doc_days: number;
  amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee;
}

export interface KioskSession {
  id: string;
  outlet_id: string;
  session_token: string;
  is_active: boolean;
  created_by: string | null;
  expires_at: string;
  created_at: string;
  outlet?: Outlet;
}

export type Database = {
  public: {
    Tables: {
      companies: { Row: Company; Insert: Partial<Company>; Update: Partial<Company> };
      regions: { Row: Region; Insert: Partial<Region>; Update: Partial<Region> };
      areas: { Row: Area; Insert: Partial<Area>; Update: Partial<Area> };
      outlets: { Row: Outlet; Insert: Partial<Outlet>; Update: Partial<Outlet> };
      user_profiles: { Row: UserProfile; Insert: Partial<UserProfile>; Update: Partial<UserProfile> };
      employees: { Row: Employee; Insert: Partial<Employee>; Update: Partial<Employee> };
      employee_documents: { Row: EmployeeDocument; Insert: Partial<EmployeeDocument>; Update: Partial<EmployeeDocument> };
      shift_templates: { Row: ShiftTemplate; Insert: Partial<ShiftTemplate>; Update: Partial<ShiftTemplate> };
      shift_assignments: { Row: ShiftAssignment; Insert: Partial<ShiftAssignment>; Update: Partial<ShiftAssignment> };
      face_profiles: { Row: FaceProfile; Insert: Partial<FaceProfile>; Update: Partial<FaceProfile> };
      attendance: { Row: Attendance; Insert: Partial<Attendance>; Update: Partial<Attendance> };
      leave_types: { Row: LeaveType; Insert: Partial<LeaveType>; Update: Partial<LeaveType> };
      leave_balances: { Row: LeaveBalance; Insert: Partial<LeaveBalance>; Update: Partial<LeaveBalance> };
      leave_requests: { Row: LeaveRequest; Insert: Partial<LeaveRequest>; Update: Partial<LeaveRequest> };
      overtime_requests: { Row: OvertimeRequest; Insert: Partial<OvertimeRequest>; Update: Partial<OvertimeRequest> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
      payroll_components: { Row: PayrollComponent; Insert: Partial<PayrollComponent>; Update: Partial<PayrollComponent> };
      payroll_runs: { Row: PayrollRun; Insert: Partial<PayrollRun>; Update: Partial<PayrollRun> };
      payroll_items: { Row: PayrollItem; Insert: Partial<PayrollItem>; Update: Partial<PayrollItem> };
      payroll_item_lines: { Row: PayrollItemLine; Insert: Partial<PayrollItemLine>; Update: Partial<PayrollItemLine> };
      expense_categories: { Row: ExpenseCategory; Insert: Partial<ExpenseCategory>; Update: Partial<ExpenseCategory> };
      expense_claims: { Row: ExpenseClaim; Insert: Partial<ExpenseClaim>; Update: Partial<ExpenseClaim> };
      absence_requests: { Row: AbsenceRequest; Insert: Partial<AbsenceRequest>; Update: Partial<AbsenceRequest> };
      area_salary_rates: { Row: AreaSalaryRate; Insert: Partial<AreaSalaryRate>; Update: Partial<AreaSalaryRate> };
      incentive_schemes: { Row: IncentiveScheme; Insert: Partial<IncentiveScheme>; Update: Partial<IncentiveScheme> };
      incentive_records: { Row: IncentiveRecord; Insert: Partial<IncentiveRecord>; Update: Partial<IncentiveRecord> };
      kiosk_sessions: { Row: KioskSession; Insert: Partial<KioskSession>; Update: Partial<KioskSession> };
    };
  };
};
