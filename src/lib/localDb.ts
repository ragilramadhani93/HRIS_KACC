/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SmartHRIS Local Database
 * ----------------------------------------------------------------------------
 * A self-contained, browser-first database that replaces Supabase entirely.
 *
 * - Tables are persisted to localStorage (seeded with realistic demo data).
 * - The query builder mirrors the PostgREST / supabase-js API surface used by
 *   the app (select with embedded relations, filters, ordering, mutations,
 *   upsert with onConflict, counts, sub-queries in .in()).
 * - Auth (sign in / sign up / session) is simulated against a local users
 *   table, so no external identity provider is required.
 * - Storage uploads are stored as data-URLs in localStorage, so photo
 *   uploads (attendance selfies, face registration, employee documents)
 *   keep working offline.
 *
 * No environment variables, no network, no external service.
 */

// ─── Public types (drop-in for @supabase/supabase-js) ───────────────────────

export interface User {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: User;
}

export interface QueryError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

export interface QueryResult<TData = any> {
  data: TData;
  error: QueryError | null;
  count: number | null;
}

type Row = any;

// ─── Persistence keys ────────────────────────────────────────────────────────

const DB_KEY = 'smarthris_local_db_v1';
const SESSION_KEY = 'smarthris_local_session_v1';
const FILES_KEY = 'smarthris_local_files_v1';
const SEED_VERSION = 'v2';

// ─── Low-level store ─────────────────────────────────────────────────────────

interface LocalUser {
  id: string;
  email: string;
  password: string;
  created_at: string;
}

interface DbShape {
  seed: string;
  tables: Record<string, Row[]>;
  users: LocalUser[];
}

let dbCache: DbShape | null = null;
let filesCache: Record<string, string> | null = null;

function dbRef(): DbShape {
  if (!dbCache) {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DbShape;
        if (parsed && parsed.seed === SEED_VERSION && parsed.tables) {
          dbCache = parsed;
        }
      }
    } catch {
      /* corrupted storage — reseed below */
    }
    if (!dbCache) {
      dbCache = buildSeed();
      persistDb();
      console.info('[SmartHRIS] Local database initialized with demo data. Login: admin@kacc.id / admin123');
    }
  }
  return dbCache;
}

function persistDb(): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(dbCache));
  } catch {
    /* quota exceeded — keep in-memory only for this session */
  }
}

function filesRef(): Record<string, string> {
  if (filesCache === null) {
    let loaded: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(FILES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') loaded = parsed as Record<string, string>;
      }
    } catch {
      /* corrupted storage — start empty */
    }
    filesCache = loaded;
  }
  return filesCache;
}

function persistFiles(): void {
  try {
    localStorage.setItem(FILES_KEY, JSON.stringify(filesCache));
  } catch {
    /* quota exceeded — keep in-memory only for this session */
  }
}

function getTable(name: string): Row[] {
  const db = dbRef();
  if (!db.tables[name]) db.tables[name] = [];
  return db.tables[name];
}

function genId(prefix = 'id_'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}${rand}${Date.now().toString(36).slice(-4)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── Seed data ───────────────────────────────────────────────────────────────

function buildSeed(): DbShape {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const iso = (d: Date) => d.toISOString();
  const at = (d: Date, h: number, m: number) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const ago = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d;
  };

  const created = iso(ago(120));
  const updated = iso(ago(1));

  // ── Payroll descriptor (kept in sync with the employees table below) ──────
  const empPayroll: Array<{ id: string; scheme: string; basic: number; daily: number; bpjsKes: number; bpjsTk: number }> = [
    { id: 'e1', scheme: 'monthly', basic: 4200000, daily: 0, bpjsKes: 42000, bpjsTk: 84000 },
    { id: 'e2', scheme: 'monthly', basic: 3900000, daily: 0, bpjsKes: 39000, bpjsTk: 78000 },
    { id: 'e3', scheme: 'monthly', basic: 5500000, daily: 0, bpjsKes: 55000, bpjsTk: 110000 },
    { id: 'e4', scheme: 'daily', basic: 0, daily: 145000, bpjsKes: 40000, bpjsTk: 80000 },
    { id: 'e5', scheme: 'daily', basic: 0, daily: 130000, bpjsKes: 38000, bpjsTk: 76000 },
    { id: 'e6', scheme: 'daily', basic: 0, daily: 120000, bpjsKes: 36000, bpjsTk: 72000 },
  ];

  // ── Generated workday attendance for the current month (before today) ────
  const dstr = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const todaySeed = dstr(now);
  const workdays: string[] = [];
  {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) workdays.push(dstr(d));
    }
  }

  const shiftCfg: Record<string, { start: string; late: string; end: string; outlet: string; tmpl: string }> = {
    e1: { start: '07:55', late: '08:12', end: '16:05', outlet: 'o1', tmpl: 'st1' },
    e2: { start: '13:55', late: '14:12', end: '22:05', outlet: 'o1', tmpl: 'st2' },
    e3: { start: '07:55', late: '08:12', end: '16:05', outlet: 'o1', tmpl: 'st1' },
    e4: { start: '07:55', late: '08:12', end: '16:05', outlet: 'o2', tmpl: 'st1' },
    e5: { start: '13:55', late: '14:12', end: '22:05', outlet: 'o3', tmpl: 'st2' },
    e6: { start: '07:55', late: '08:12', end: '16:05', outlet: 'o4', tmpl: 'st1' },
  };

  const latePlan: Record<string, string[]> = { e1: [], e2: [], e3: [], e4: [], e5: [], e6: [] };
  const absentPlan: Record<string, string[]> = { e1: [], e2: [], e3: [], e4: [], e5: [], e6: [] };
  if (workdays.length > 1) {
    latePlan.e1 = [workdays[0]];
    latePlan.e3 = workdays.length > 4 ? [workdays[1], workdays[3]] : [workdays[workdays.length - 1]];
    latePlan.e4 = workdays.length > 2 ? [workdays[2]] : [];
    latePlan.e5 = [workdays[workdays.length - 2]];
    absentPlan.e5 = workdays.length > 3 ? [workdays[2]] : [];
    absentPlan.e6 = workdays.length > 1 ? [workdays[1]] : [];
  }

  const generatedAttendance: Row[] = [];
  for (const empId of Object.keys(shiftCfg)) {
    for (const d of workdays) {
      if (d >= todaySeed) continue; // today is covered by the static rows below
      if (absentPlan[empId].includes(d)) continue;
      const cfg = shiftCfg[empId];
      const late = latePlan[empId].includes(d);
      const startDate = new Date(`${d}T${late ? cfg.late : cfg.start}:00`);
      const endDate = new Date(`${d}T${cfg.end}:00`);
      const duration = Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 60000), 0);
      generatedAttendance.push({
        id: genId('att_'), employee_id: empId, outlet_id: cfg.outlet, shift_template_id: cfg.tmpl,
        attendance_date: d, check_in_time: startDate.toISOString(),
        check_in_lat: null, check_in_lng: null, check_in_geofence: 'inside', check_in_selfie_url: null, check_in_face_score: null,
        check_out_time: endDate.toISOString(), check_out_lat: null, check_out_lng: null, check_out_geofence: 'inside',
        check_out_selfie_url: null, status: late ? 'late' : 'present', work_duration_minutes: duration,
        notes: null, approved_by: null, created_at: startDate.toISOString(), updated_at: endDate.toISOString(),
      });
    }
  }

  // ── Demo payroll for the current period (so employee slips are ready) ────
  const periodPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const elapsedWorkdays = Math.max(workdays.filter((w) => w <= todaySeed).length, 1);
  const payrollRuns: Row[] = [];
  const payrollItems: Row[] = [];
  const payrollLines: Row[] = [];
  {
    const runId = 'run-1';
    const monthAtt = [...generatedAttendance].filter((a) => String(a.attendance_date).startsWith(periodPrefix));
    let gTot = 0, dTot = 0, nTot = 0;
    for (const p of empPayroll) {
      const eAtt = monthAtt.filter((a) => a.employee_id === p.id);
      const present = eAtt.filter((a) => a.status === 'present').length;
      const late = eAtt.filter((a) => a.status === 'late').length;
      const absent = Math.max(elapsedWorkdays - present - late, 0);
      const isDaily = p.scheme === 'daily';
      const grossBase = isDaily ? p.daily * (present + late) : p.basic;
      const compEarnings = 875000; // Tunjangan Transport 500k + Makan 375k
      const attIncentive = absent === 0 && late === 0 ? 150000 : 0;
      const totalEarnings = grossBase + compEarnings + attIncentive;
      const annualGross = totalEarnings * 12;
      const tax = annualGross > 54000000 ? Math.max(((annualGross - 54000000) * 0.05) / 12, 0) : 0;
      const dailyRate = isDaily ? p.daily : p.basic / workdays.length;
      const hourlyRate = dailyRate / 8;
      const absentDed = !isDaily && absent > 0 ? dailyRate * absent : 0;
      const lateDed = !isDaily && late > 0 ? hourlyRate * late : 0;
      const totalDed = absentDed + lateDed + p.bpjsKes + p.bpjsTk + tax;
      const net = totalEarnings - totalDed;
      gTot += totalEarnings; dTot += totalDed; nTot += net;

      const itemId = `pit-${p.id}`;
      payrollItems.push({
        id: itemId, payroll_run_id: runId, employee_id: p.id,
        basic_salary: isDaily ? p.daily : p.basic,
        total_earnings: +totalEarnings.toFixed(2), total_deductions: +totalDed.toFixed(2),
        total_bpjs_kes: p.bpjsKes, total_bpjs_tk: p.bpjsTk, total_tax: +tax.toFixed(2),
        net_salary: +net.toFixed(2), work_days: elapsedWorkdays, present_days: present,
        absent_days: absent, late_days: late, overtime_hours: 0, leave_days: 0,
      });

      const schemeName = isDaily
        ? `Gaji Harian (${present + late} hari × Rp ${p.daily.toLocaleString('id-ID')})`
        : 'Gaji Pokok (Bulanan)';
      payrollLines.push(
        { payroll_item_id: itemId, component_name: schemeName, component_type: 'earning', amount: +grossBase.toFixed(2), is_taxable: true },
        { payroll_item_id: itemId, component_name: 'Tunjangan Transport', component_type: 'earning', amount: 500000, is_taxable: false },
        { payroll_item_id: itemId, component_name: 'Tunjangan Makan', component_type: 'earning', amount: 375000, is_taxable: false },
        ...(attIncentive > 0 ? [{ payroll_item_id: itemId, component_name: 'Insentif Kehadiran', component_type: 'earning' as const, amount: attIncentive, is_taxable: false }] : []),
        ...(absentDed > 0 ? [{ payroll_item_id: itemId, component_name: 'Potongan Absen', component_type: 'deduction' as const, amount: +(-absentDed).toFixed(2), is_taxable: false }] : []),
        ...(lateDed > 0 ? [{ payroll_item_id: itemId, component_name: 'Potongan Terlambat', component_type: 'deduction' as const, amount: +(-lateDed).toFixed(2), is_taxable: false }] : []),
        { payroll_item_id: itemId, component_name: 'BPJS Kesehatan', component_type: 'deduction', amount: -p.bpjsKes, is_taxable: false },
        { payroll_item_id: itemId, component_name: 'BPJS TK JHT', component_type: 'deduction', amount: -p.bpjsTk, is_taxable: false },
        ...(tax > 0 ? [{ payroll_item_id: itemId, component_name: 'PPh 21 (Est.)', component_type: 'deduction' as const, amount: +(-tax).toFixed(2), is_taxable: false }] : []),
      );
    }
    payrollRuns.push({
      id: runId, company_id: 'c1', period_month: now.getMonth() + 1, period_year: now.getFullYear(),
      notes: 'Demo payroll periode berjalan', status: 'paid', created_by: 'u-admin', approved_by: 'u-admin',
      approved_at: iso(now), paid_at: iso(now),
      total_gross: +gTot.toFixed(2), total_deductions: +dTot.toFixed(2), total_net: +nTot.toFixed(2),
      employee_count: empPayroll.length, created_at: iso(now), updated_at: iso(now),
    });
  }

  const tables: Record<string, Row[]> = {
    companies: [
      {
        id: 'c1', name: 'PT KACC Indonesia', code: 'KACC',
        address: 'Jl. Jend. Sudirman Kav. 1, Jakarta Selatan', phone: '021-5550123',
        email: 'corporate@kacc.id', logo_url: null, is_active: true,
        created_at: created, updated_at: updated,
      },
    ],

    regions: [
      { id: 'r1', company_id: 'c1', name: 'Jabodetabek', code: 'R-JKT', is_active: true, created_at: created, updated_at: updated },
      { id: 'r2', company_id: 'c1', name: 'Jawa Timur', code: 'R-JTM', is_active: true, created_at: created, updated_at: updated },
      { id: 'r3', company_id: 'c1', name: 'Jawa Barat', code: 'R-JBR', is_active: true, created_at: created, updated_at: updated },
    ],

    areas: [
      { id: 'a1', region_id: 'r1', name: 'Jakarta Pusat', code: 'A-JP', is_active: true, created_at: created, updated_at: updated },
      { id: 'a2', region_id: 'r1', name: 'Jakarta Selatan', code: 'A-JS', is_active: true, created_at: created, updated_at: updated },
      { id: 'a3', region_id: 'r2', name: 'Surabaya', code: 'A-SBY', is_active: true, created_at: created, updated_at: updated },
      { id: 'a4', region_id: 'r3', name: 'Bandung', code: 'A-BDG', is_active: true, created_at: created, updated_at: updated },
    ],

    outlets: [
      {
        id: 'o1', area_id: 'a1', outlet_code: 'KACC-001', name: 'KACC Cikini',
        outlet_type: 'coffee_shop', address: 'Jl. Cikini Raya No. 12, Jakarta Pusat',
        latitude: -6.1941, longitude: 106.8446, geofence_radius_meters: 300,
        manager_id: null, manager_employee_id: 'e3', is_active: true, created_at: created, updated_at: updated,
      },
      {
        id: 'o2', area_id: 'a2', outlet_code: 'KACC-002', name: 'KACC Senopati',
        outlet_type: 'coffee_shop', address: 'Jl. Senopati No. 45, Jakarta Selatan',
        latitude: -6.2275, longitude: 106.8108, geofence_radius_meters: 300,
        manager_id: null, manager_employee_id: 'e4', is_active: true, created_at: created, updated_at: updated,
      },
      {
        id: 'o3', area_id: 'a3', outlet_code: 'KACC-003', name: 'KACC Darmo',
        outlet_type: 'coffee_corner', address: 'Jl. Darmo Permai No. 8, Surabaya',
        latitude: -7.2883, longitude: 112.7444, geofence_radius_meters: 250,
        manager_id: null, manager_employee_id: 'e5', is_active: true, created_at: created, updated_at: updated,
      },
      {
        id: 'o4', area_id: 'a4', outlet_code: 'KACC-004', name: 'KACC Dago',
        outlet_type: 'coffee_shop', address: 'Jl. Ir. H. Juanda No. 21, Bandung',
        latitude: -6.8901, longitude: 107.6106, geofence_radius_meters: 300,
        manager_id: null, manager_employee_id: 'e6', is_active: true, created_at: created, updated_at: updated,
      },
    ],

    user_profiles: [
      {
        id: 'u-admin', company_id: 'c1', full_name: 'Admin HRIS', role: 'hr_admin',
        avatar_url: null, phone: '0811-0000-0001', is_active: true, created_at: created, updated_at: updated,
      },
      {
        id: 'u-emp1', company_id: 'c1', full_name: 'Budi Santoso', role: 'employee',
        avatar_url: null, phone: '0812-1111-1111', is_active: true, created_at: created, updated_at: updated,
      },
      {
        id: 'u-emp2', company_id: 'c1', full_name: 'Siti Rahayu', role: 'employee',
        avatar_url: null, phone: '0812-2222-2222', is_active: true, created_at: created, updated_at: updated,
      },
      {
        id: 'u-emp3', company_id: 'c1', full_name: 'Agus Wijaya', role: 'supervisor',
        avatar_url: null, phone: '0812-3333-3333', is_active: true, created_at: created, updated_at: updated,
      },
    ],

    employees: [
      {
        id: 'e1', user_id: 'u-emp1', company_id: 'c1', employee_code: 'KACC-0001',
        full_name: 'Budi Santoso', nik: '3171010101900001', birth_place: 'Jakarta', birth_date: '1990-01-01',
        gender: 'male', marital_status: 'married', phone: '0812-1111-1111', email: 'budi@kacc.id',
        address: 'Jl. Melati No. 3, Jakarta', job_title: 'Barista', department: 'Operasional',
        region_id: 'r1', area_id: 'a1', primary_outlet_id: 'o1', backup_outlet_id: 'o2',
        supervisor_id: 'e3', join_date: '2021-03-15', status: 'active', face_registered: false,
        basic_salary: 4200000, salary_scheme: 'monthly', daily_rate: 0,
        bpjs_kes_employee: 42000, bpjs_kes_employer: 168000,
        bpjs_tk_jht_employee: 84000, bpjs_tk_jht_employer: 168000,
        npwp: null, created_at: created, updated_at: updated,
      },
      {
        id: 'e2', user_id: 'u-emp2', company_id: 'c1', employee_code: 'KACC-0002',
        full_name: 'Siti Rahayu', nik: '3171020202900002', birth_place: 'Bogor', birth_date: '1992-02-02',
        gender: 'female', marital_status: 'single', phone: '0812-2222-2222', email: 'siti@kacc.id',
        address: 'Jl. Anggrek No. 7, Bogor', job_title: 'Kasir', department: 'Operasional',
        region_id: 'r1', area_id: 'a1', primary_outlet_id: 'o1', backup_outlet_id: 'o2',
        supervisor_id: 'e3', join_date: '2021-06-01', status: 'active', face_registered: false,
        basic_salary: 3900000, salary_scheme: 'monthly', daily_rate: 0,
        bpjs_kes_employee: 39000, bpjs_kes_employer: 156000,
        bpjs_tk_jht_employee: 78000, bpjs_tk_jht_employer: 156000,
        npwp: null, created_at: created, updated_at: updated,
      },
      {
        id: 'e3', user_id: 'u-emp3', company_id: 'c1', employee_code: 'KACC-0003',
        full_name: 'Agus Wijaya', nik: '3171030303900003', birth_place: 'Tangerang', birth_date: '1988-03-03',
        gender: 'male', marital_status: 'married', phone: '0812-3333-3333', email: 'agus@kacc.id',
        address: 'Jl. Kenanga No. 11, Tangerang', job_title: 'Supervisor', department: 'Manajemen',
        region_id: 'r1', area_id: 'a1', primary_outlet_id: 'o1', backup_outlet_id: 'o2',
        supervisor_id: null, join_date: '2019-01-10', status: 'active', face_registered: false,
        basic_salary: 5500000, salary_scheme: 'monthly', daily_rate: 0,
        bpjs_kes_employee: 55000, bpjs_kes_employer: 220000,
        bpjs_tk_jht_employee: 110000, bpjs_tk_jht_employer: 220000,
        npwp: null, created_at: created, updated_at: updated,
      },
      {
        id: 'e4', user_id: null, company_id: 'c1', employee_code: 'KACC-0004',
        full_name: 'Dewi Lestari', nik: '3171040404900004', birth_place: 'Depok', birth_date: '1995-04-04',
        gender: 'female', marital_status: 'single', phone: '0812-4444-4444', email: 'dewi@kacc.id',
        address: 'Jl. Mawar No. 5, Depok', job_title: 'Barista', department: 'Operasional',
        region_id: 'r1', area_id: 'a2', primary_outlet_id: 'o2', backup_outlet_id: 'o1',
        supervisor_id: 'e3', join_date: '2022-02-14', status: 'active', face_registered: false,
        basic_salary: 4000000, salary_scheme: 'daily', daily_rate: 145000,
        bpjs_kes_employee: 40000, bpjs_kes_employer: 160000,
        bpjs_tk_jht_employee: 80000, bpjs_tk_jht_employer: 160000,
        npwp: null, created_at: created, updated_at: updated,
      },
      {
        id: 'e5', user_id: null, company_id: 'c1', employee_code: 'KACC-0005',
        full_name: 'Rudi Hartono', nik: '3578010505900005', birth_place: 'Surabaya', birth_date: '1993-05-05',
        gender: 'male', marital_status: 'married', phone: '0812-5555-5555', email: 'rudi@kacc.id',
        address: 'Jl. Bunga No. 9, Surabaya', job_title: 'Barista', department: 'Operasional',
        region_id: 'r2', area_id: 'a3', primary_outlet_id: 'o3', backup_outlet_id: null,
        supervisor_id: null, join_date: '2022-08-01', status: 'active', face_registered: false,
        basic_salary: 3800000, salary_scheme: 'daily', daily_rate: 130000,
        bpjs_kes_employee: 38000, bpjs_kes_employer: 152000,
        bpjs_tk_jht_employee: 76000, bpjs_tk_jht_employer: 152000,
        npwp: null, created_at: created, updated_at: updated,
      },
      {
        id: 'e6', user_id: null, company_id: 'c1', employee_code: 'KACC-0006',
        full_name: 'Maya Puspita', nik: '3273010606900006', birth_place: 'Bandung', birth_date: '1996-06-06',
        gender: 'female', marital_status: 'single', phone: '0812-6666-6666', email: 'maya@kacc.id',
        address: 'Jl. Dahlia No. 2, Bandung', job_title: 'Kasir', department: 'Operasional',
        region_id: 'r3', area_id: 'a4', primary_outlet_id: 'o4', backup_outlet_id: null,
        supervisor_id: null, join_date: '2023-01-16', status: 'probation', face_registered: false,
        basic_salary: 3600000, salary_scheme: 'daily', daily_rate: 120000,
        bpjs_kes_employee: 36000, bpjs_kes_employer: 144000,
        bpjs_tk_jht_employee: 72000, bpjs_tk_jht_employer: 144000,
        npwp: null, created_at: created, updated_at: updated,
      },
    ],

    employee_documents: [],

    shift_templates: [
      {
        id: 'st1', company_id: 'c1', name: 'Shift Pagi', start_time: '08:00', end_time: '16:00',
        is_overnight: false, late_tolerance_minutes: 10, rotation: 'daily', is_active: true,
        created_at: created, updated_at: updated,
      },
      {
        id: 'st2', company_id: 'c1', name: 'Shift Sore', start_time: '14:00', end_time: '22:00',
        is_overnight: false, late_tolerance_minutes: 10, rotation: 'weekly', is_active: true,
        created_at: created, updated_at: updated,
      },
      {
        id: 'st3', company_id: 'c1', name: 'Shift Malam', start_time: '22:00', end_time: '06:00',
        is_overnight: true, late_tolerance_minutes: 15, rotation: 'monthly', is_active: true,
        created_at: created, updated_at: updated,
      },
    ],

    shift_assignments: [
      { id: 'sa1', employee_id: 'e1', shift_template_id: 'st1', effective_date: iso(ago(60)), end_date: null, created_at: created },
      { id: 'sa2', employee_id: 'e2', shift_template_id: 'st2', effective_date: iso(ago(60)), end_date: null, created_at: created },
      { id: 'sa3', employee_id: 'e3', shift_template_id: 'st1', effective_date: iso(ago(60)), end_date: null, created_at: created },
      { id: 'sa4', employee_id: 'e4', shift_template_id: 'st1', effective_date: iso(ago(30)), end_date: null, created_at: created },
      { id: 'sa5', employee_id: 'e5', shift_template_id: 'st2', effective_date: iso(ago(30)), end_date: null, created_at: created },
      { id: 'sa6', employee_id: 'e6', shift_template_id: 'st1', effective_date: iso(ago(30)), end_date: null, created_at: created },
    ],

    face_profiles: [],

    attendance: [
      ...generatedAttendance,
      {
        id: 'att-1', employee_id: 'e1', outlet_id: 'o1', shift_template_id: 'st1',
        attendance_date: today, check_in_time: at(now, 7, 52), check_in_lat: -6.1941, check_in_lng: 106.8446,
        check_in_geofence: 'inside', check_in_selfie_url: null, check_in_face_score: null,
        check_out_time: null, check_out_lat: null, check_out_lng: null, check_out_geofence: 'unknown',
        check_out_selfie_url: null, status: 'present', work_duration_minutes: null,
        notes: null, approved_by: null, created_at: iso(now), updated_at: iso(now),
      },
      {
        id: 'att-2', employee_id: 'e2', outlet_id: 'o1', shift_template_id: 'st2',
        attendance_date: today, check_in_time: at(now, 13, 58), check_in_lat: -6.1941, check_in_lng: 106.8446,
        check_in_geofence: 'inside', check_in_selfie_url: null, check_in_face_score: null,
        check_out_time: at(now, 21, 59), check_out_lat: -6.1941, check_out_lng: 106.8446,
        check_out_geofence: 'inside', check_out_selfie_url: null, status: 'present', work_duration_minutes: 481,
        notes: null, approved_by: null, created_at: iso(now), updated_at: iso(now),
      },
      {
        id: 'att-3', employee_id: 'e3', outlet_id: 'o1', shift_template_id: 'st1',
        attendance_date: today, check_in_time: at(now, 8, 14), check_in_lat: -6.1941, check_in_lng: 106.8446,
        check_in_geofence: 'inside', check_in_selfie_url: null, check_in_face_score: null,
        check_out_time: at(now, 16, 10), check_out_lat: -6.1941, check_out_lng: 106.8446,
        check_out_geofence: 'inside', check_out_selfie_url: null, status: 'late', work_duration_minutes: 476,
        notes: null, approved_by: null, created_at: iso(now), updated_at: iso(now),
      },
      {
        id: 'att-4', employee_id: 'e4', outlet_id: 'o2', shift_template_id: 'st1',
        attendance_date: today, check_in_time: at(now, 8, 1), check_in_lat: -6.2275, check_in_lng: 106.8108,
        check_in_geofence: 'inside', check_in_selfie_url: null, check_in_face_score: null,
        check_out_time: at(now, 15, 58), check_out_lat: -6.2275, check_out_lng: 106.8108,
        check_out_geofence: 'inside', check_out_selfie_url: null, status: 'late', work_duration_minutes: 477,
        notes: null, approved_by: null, created_at: iso(now), updated_at: iso(now),
      },
      {
        id: 'att-5', employee_id: 'e1', outlet_id: 'o1', shift_template_id: 'st1',
        attendance_date: iso(ago(1)).slice(0, 10), check_in_time: at(ago(1), 7, 55), check_in_lat: -6.1941, check_in_lng: 106.8446,
        check_in_geofence: 'inside', check_in_selfie_url: null, check_in_face_score: null,
        check_out_time: at(ago(1), 16, 5), check_out_lat: -6.1941, check_out_lng: 106.8446,
        check_out_geofence: 'inside', check_out_selfie_url: null, status: 'present', work_duration_minutes: 490,
        notes: null, approved_by: null, created_at: iso(ago(1)), updated_at: iso(ago(1)),
      },
      {
        id: 'att-6', employee_id: 'e1', outlet_id: 'o1', shift_template_id: 'st1',
        attendance_date: iso(ago(2)).slice(0, 10), check_in_time: at(ago(2), 8, 20), check_in_lat: -6.1941, check_in_lng: 106.8446,
        check_in_geofence: 'inside', check_in_selfie_url: null, check_in_face_score: null,
        check_out_time: at(ago(2), 16, 0), check_out_lat: -6.1941, check_out_lng: 106.8446,
        check_out_geofence: 'inside', check_out_selfie_url: null, status: 'late', work_duration_minutes: 460,
        notes: null, approved_by: null, created_at: iso(ago(2)), updated_at: iso(ago(2)),
      },
      {
        id: 'att-7', employee_id: 'e2', outlet_id: 'o1', shift_template_id: 'st2',
        attendance_date: iso(ago(1)).slice(0, 10), check_in_time: at(ago(1), 13, 55), check_in_lat: -6.1941, check_in_lng: 106.8446,
        check_in_geofence: 'inside', check_in_selfie_url: null, check_in_face_score: null,
        check_out_time: at(ago(1), 22, 2), check_out_lat: -6.1941, check_out_lng: 106.8446,
        check_out_geofence: 'inside', check_out_selfie_url: null, status: 'present', work_duration_minutes: 487,
        notes: null, approved_by: null, created_at: iso(ago(1)), updated_at: iso(ago(1)),
      },
    ],

    leave_types: [
      { id: 'lt1', company_id: 'c1', name: 'Cuti Tahunan', code: 'CT', days_per_year: 12, requires_proof: false, is_active: true, created_at: created },
      { id: 'lt2', company_id: 'c1', name: 'Cuti Sakit', code: 'CS', days_per_year: 6, requires_proof: true, is_active: true, created_at: created },
      { id: 'lt3', company_id: 'c1', name: 'Cuti Menikah', code: 'CM', days_per_year: 3, requires_proof: false, is_active: true, created_at: created },
    ],

    leave_balances: [
      { id: 'lb1', employee_id: 'e1', leave_type_id: 'lt1', year: now.getFullYear(), total_days: 12, used_days: 3, pending_days: 1, updated_at: updated },
      { id: 'lb2', employee_id: 'e2', leave_type_id: 'lt1', year: now.getFullYear(), total_days: 12, used_days: 1, pending_days: 0, updated_at: updated },
      { id: 'lb3', employee_id: 'e3', leave_type_id: 'lt1', year: now.getFullYear(), total_days: 12, used_days: 5, pending_days: 2, updated_at: updated },
      { id: 'lb4', employee_id: 'e1', leave_type_id: 'lt2', year: now.getFullYear(), total_days: 6, used_days: 2, pending_days: 0, updated_at: updated },
    ],

    leave_requests: [
      {
        id: 'lr1', employee_id: 'e3', leave_type_id: 'lt1',
        start_date: iso(ago(-2)).slice(0, 10), end_date: iso(ago(-1)).slice(0, 10), total_days: 2,
        reason: 'Liburan keluarga', proof_url: null, status: 'pending',
        supervisor_id: null, supervisor_approved_at: null, supervisor_notes: null,
        manager_id: null, manager_approved_at: null, manager_notes: null,
        hr_id: null, hr_approved_at: null, hr_notes: null,
        created_at: iso(ago(1)), updated_at: iso(ago(1)),
      },
      {
        id: 'lr2', employee_id: 'e1', leave_type_id: 'lt2',
        start_date: iso(ago(5)).slice(0, 10), end_date: iso(ago(4)).slice(0, 10), total_days: 2,
        reason: 'Sakit dan istirahat di rumah', proof_url: null, status: 'approved',
        supervisor_id: 'e3', supervisor_approved_at: iso(ago(4)), supervisor_notes: 'Dokter sudah diverifikasi',
        manager_id: null, manager_approved_at: null, manager_notes: null,
        hr_id: 'u-admin', hr_approved_at: iso(ago(3)), hr_notes: 'Setuju',
        created_at: iso(ago(6)), updated_at: iso(ago(3)),
      },
    ],

    overtime_requests: [
      {
        id: 'ot1', employee_id: 'e4', overtime_date: today, start_time: '18:00', end_time: '20:00',
        duration_hours: 2, reason: 'Event promo akhir bulan', status: 'pending',
        supervisor_id: null, supervisor_approved_at: null, supervisor_notes: null,
        manager_id: null, manager_approved_at: null, manager_notes: null,
        created_at: iso(now), updated_at: iso(now),
      },
    ],

    notifications: [
      {
        id: 'n1', user_id: 'u-admin', type: 'system', title: 'Selamat datang di SmartHRIS',
        message: 'Akun admin berhasil dibuat. Mulai kelola data karyawan dari menu Karyawan.',
        is_read: false, reference_id: null, reference_table: null, created_at: iso(ago(1)),
      },
      {
        id: 'n2', user_id: 'u-admin', type: 'approval', title: 'Izin baru menunggu persetujuan',
        message: 'Siti Rahayu mengajukan izin dengan alasan keperluan keluarga.',
        is_read: false, reference_id: 'abs-1', reference_table: 'absence_requests', created_at: iso(now),
      },
      {
        id: 'n3', user_id: 'u-admin', type: 'leave', title: 'Cuti baru menunggu persetujuan',
        message: 'Agus Wijaya mengajukan cuti 2 hari (Liburan keluarga).',
        is_read: false, reference_id: 'lr1', reference_table: 'leave_requests', created_at: iso(ago(1)),
      },
      {
        id: 'n4', user_id: 'u-emp1', type: 'shift', title: 'Shift hari ini: Pagi',
        message: 'Jadwal shift Anda hari ini pukul 08:00 - 16:00 di KACC Cikini.',
        is_read: false, reference_id: null, reference_table: null, created_at: iso(now),
      },
      {
        id: 'n5', user_id: 'u-emp1', type: 'system', title: 'Akun berhasil dibuat',
        message: 'Selamat datang, Budi Santoso! Login menggunakan email Anda.',
        is_read: true, reference_id: null, reference_table: null, created_at: iso(ago(1)),
      },
    ],

    payroll_components: [
      { id: 'pc1', company_id: 'c1', name: 'Gaji Pokok', code: 'GAPOK', component_type: 'earning', is_taxable: true, is_fixed: true, default_amount: 4000000, is_active: true, created_at: created },
      { id: 'pc2', company_id: 'c1', name: 'Tunjangan Transport', code: 'TRANSPORT', component_type: 'earning', is_taxable: false, is_fixed: true, default_amount: 500000, is_active: true, created_at: created },
      { id: 'pc3', company_id: 'c1', name: 'Tunjangan Makan', code: 'MAKAN', component_type: 'earning', is_taxable: false, is_fixed: true, default_amount: 375000, is_active: true, created_at: created },
      { id: 'pc4', company_id: 'c1', name: 'BPJS Kesehatan', code: 'BPJSKES', component_type: 'deduction', is_taxable: false, is_fixed: true, default_amount: 40000, is_active: true, created_at: created },
      { id: 'pc5', company_id: 'c1', name: 'BPJS Ketenagakerjaan', code: 'BPJSTK', component_type: 'deduction', is_taxable: false, is_fixed: true, default_amount: 80000, is_active: true, created_at: created },
    ],

    area_salary_rates: [
      { id: 'asr1', area_id: 'a1', job_title: 'Barista', daily_rate: 145000, effective_from: '2024-01-01', is_active: true, created_at: created, updated_at: updated },
      { id: 'asr2', area_id: 'a1', job_title: 'Kasir', daily_rate: 135000, effective_from: '2024-01-01', is_active: true, created_at: created, updated_at: updated },
      { id: 'asr3', area_id: 'a2', job_title: 'Barista', daily_rate: 140000, effective_from: '2024-01-01', is_active: true, created_at: created, updated_at: updated },
      { id: 'asr4', area_id: 'a3', job_title: 'Barista', daily_rate: 130000, effective_from: '2024-01-01', is_active: true, created_at: created, updated_at: updated },
      { id: 'asr5', area_id: 'a4', job_title: 'Kasir', daily_rate: 125000, effective_from: '2024-01-01', is_active: true, created_at: created, updated_at: updated },
    ],

    incentive_schemes: [
      { id: 'is1', company_id: 'c1', name: 'Bonus Penjualan', incentive_type: 'sales', fixed_amount: 500000, is_active: true, created_at: created },
      { id: 'is2', company_id: 'c1', name: 'Insentif Kehadiran', incentive_type: 'attendance', fixed_amount: 200000, is_active: true, created_at: created },
    ],

    incentive_records: [],

    expense_categories: [
      { id: 'ec1', company_id: 'c1', name: 'Transportasi', code: 'TRP', max_amount: 500000, requires_receipt: true, is_active: true, created_at: created },
      { id: 'ec2', company_id: 'c1', name: 'Konsumsi', code: 'KNS', max_amount: 200000, requires_receipt: false, is_active: true, created_at: created },
      { id: 'ec3', company_id: 'c1', name: 'Alat Tulis Kantor', code: 'ATK', max_amount: 300000, requires_receipt: true, is_active: true, created_at: created },
    ],

    expense_claims: [
      {
        id: 'ec1c1', employee_id: 'e5', category_id: 'ec1', claim_date: iso(ago(1)).slice(0, 10),
        title: 'Transport pengiriman merchandise', description: 'Ojek ke 3 titik pengiriman promo', amount: 150000,
        receipt_url: null, status: 'submitted',
        supervisor_id: null, supervisor_approved_at: null, supervisor_notes: null,
        manager_id: null, manager_approved_at: null, manager_notes: null,
        finance_id: null, finance_approved_at: null, finance_notes: null,
        paid_at: null, created_at: iso(ago(1)), updated_at: iso(ago(1)),
      },
      {
        id: 'ec2c1', employee_id: 'e2', category_id: 'ec2', claim_date: iso(ago(3)).slice(0, 10),
        title: 'Konsumsi meeting tim', description: 'Snack rapat operasional bulanan', amount: 180000,
        receipt_url: null, status: 'approved',
        supervisor_id: 'e3', supervisor_approved_at: iso(ago(2)), supervisor_notes: 'OK',
        manager_id: null, manager_approved_at: null, manager_notes: null,
        finance_id: 'u-admin', finance_approved_at: iso(ago(1)), finance_notes: 'Disetujui',
        paid_at: iso(ago(1)), created_at: iso(ago(3)), updated_at: iso(ago(1)),
      },
    ],

    absence_requests: [
      {
        id: 'abs-1', employee_id: 'e2', absence_type: 'izin', absence_date: today, end_date: null,
        total_days: 1, reason: 'Keperluan keluarga', document_url: null,
        target_outlet_id: null, status: 'pending', approved_by: null, approved_at: null,
        approval_notes: null, created_at: iso(now), updated_at: iso(now),
      },
      {
        id: 'abs-2', employee_id: 'e1', absence_type: 'sakit_dengan_surat', absence_date: iso(ago(4)).slice(0, 10), end_date: iso(ago(3)).slice(0, 10),
        total_days: 2, reason: 'Sakit demam, surat dokter dilampirkan', document_url: null,
        target_outlet_id: null, status: 'approved', approved_by: 'u-admin', approved_at: iso(ago(3)),
        approval_notes: 'Surat dokter valid', created_at: iso(ago(5)), updated_at: iso(ago(3)),
      },
    ],

    payroll_runs: payrollRuns,
    payroll_items: payrollItems,
    payroll_item_lines: payrollLines,
    kiosk_sessions: [],
  };

  const users: LocalUser[] = [
    { id: 'u-admin', email: 'admin@kacc.id', password: 'admin123', created_at: created },
    { id: 'u-emp1', email: 'budi@kacc.id', password: 'budi123', created_at: created },
    { id: 'u-emp2', email: 'siti@kacc.id', password: 'siti123', created_at: created },
    { id: 'u-emp3', email: 'agus@kacc.id', password: 'agus123', created_at: created },
  ];

  return { seed: SEED_VERSION, tables, users };
}

// ─── Select / join parsing ───────────────────────────────────────────────────

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

interface RelSpec {
  alias: string;
  table: string;
  fk?: string;
  inner: boolean;
  sub?: string;
}

function parseRel(token: string): RelSpec | null {
  const m = token.match(/^([A-Za-z_][\w]*):([A-Za-z_][\w]*)(![A-Za-z_]+)?\((.+)\)$/);
  if (m) {
    const hint = m[3] ?? '';
    return {
      alias: m[1],
      table: m[2],
      fk: hint.startsWith('!inner') ? undefined : hint.slice(1) || undefined,
      inner: hint === '!inner',
      sub: m[4],
    };
  }
  const m2 = token.match(/^([A-Za-z_][\w]*)\((.+)\)$/);
  if (m2) return { alias: m2[1], table: m2[1], inner: false, sub: m2[2] };
  return null;
}

function singularTable(t: string): string {
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
  return t.replace(/s$/, '');
}

function parseSelect(cols: string): { plain: string[]; rels: RelSpec[] } {
  const plain: string[] = [];
  const rels: RelSpec[] = [];
  for (const token of splitTopLevel(cols)) {
    if (token === '*') {
      plain.push('*');
    } else {
      const rel = parseRel(token);
      if (rel) rels.push(rel);
      else plain.push(token);
    }
  }
  return { plain, rels };
}

/** Project one row according to the parsed select. Returns null when an inner join drops it. */
function projectRow(row: Row, plain: string[], rels: RelSpec[], tables: Record<string, Row[]>): Row | null {
  const out: Row = {};
  if (plain.includes('*')) {
    Object.assign(out, row);
  } else {
    for (const c of plain) {
      if (c in row) out[c] = row[c];
    }
  }
  for (const rel of rels) {
    const fkCol = rel.fk ?? `${singularTable(rel.table)}_id`;
    const fkVal = row[fkCol];
    const matches = (tables[rel.table] ?? []).filter((r) => r.id === fkVal);
    let val: Row | null = null;
    if (matches.length > 0) {
      const parsed = rel.sub ? parseSelect(rel.sub) : { plain: ['*'], rels: [] };
      val = projectRow(matches[0], parsed.plain, parsed.rels, tables);
    }
    if (rel.inner && !val) return null;
    out[rel.alias] = val;
  }
  return out;
}

// ─── Filter helpers ──────────────────────────────────────────────────────────

function likeMatch(value: unknown, pattern: string): boolean {
  if (typeof value !== 'string') return false;
  const regex = new RegExp(
    '^' + pattern.split('%').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    'i',
  );
  return regex.test(value);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

// ─── Realtime (local event bus) ──────────────────────────────────────────────

interface ChannelListener {
  event: string;
  table: string;
  filter?: (row: Row) => boolean;
  cb: (payload: any) => void;
}

const channelListeners: ChannelListener[] = [];

function dispatch(event: string, table: string, rows: Row[]): void {
  for (const row of rows) {
    for (const l of channelListeners) {
      if (l.event === event && l.table === table && (!l.filter || l.filter(row))) {
        l.cb({ eventType: event, table, new: row });
      }
    }
  }
}

// ─── Auth (local) ────────────────────────────────────────────────────────────

const authListeners: Array<(event: string, session: Session | null) => void> = [];

function toUser(u: LocalUser): User {
  return { id: u.id, email: u.email, user_metadata: {}, app_metadata: {} };
}

function makeSession(u: LocalUser): Session {
  return {
    access_token: genId('tok_') + genId(),
    refresh_token: genId('ref_') + genId(),
    expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    user: toUser(u),
  };
}

function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s.expires_at && s.expires_at < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

// ─── Query builder ───────────────────────────────────────────────────────────

type BuilderMode = 'select' | 'insert' | 'upsert' | 'update' | 'delete';

export class LocalQueryBuilder {
  private mode: BuilderMode = 'select';
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private limitN: number | null = null;
  private offset: number | null = null;
  private plain: string[] = ['*'];
  private rels: RelSpec[] = [];
  private countMode = false;
  private headMode = false;
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private insertRows: Row[] = [];
  private conflictCols: string[] = ['id'];
  private updateObj: Row = {};

  constructor(private table: string) {}

  // ── select chain ──
  select(columns?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    if (columns) {
      const parsed = parseSelect(columns);
      this.plain = parsed.plain.length ? parsed.plain : ['*'];
      this.rels = parsed.rels;
    }
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.headMode = true;
    return this;
  }

  returns<T = unknown>(): this {
    // keep the type parameter referenced so callers can annotate row types
    void (null as T);
    return this;
  }

  eq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  neq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] !== value);
    return this;
  }
  gt(col: string, value: any): this {
    this.filters.push((r) => r[col] > value);
    return this;
  }
  gte(col: string, value: any): this {
    this.filters.push((r) => r[col] >= value);
    return this;
  }
  lt(col: string, value: any): this {
    this.filters.push((r) => r[col] < value);
    return this;
  }
  lte(col: string, value: any): this {
    this.filters.push((r) => r[col] <= value);
    return this;
  }
  is(col: string, value: unknown): this {
    if (value === null) this.filters.push((r) => r[col] == null);
    else this.filters.push((r) => r[col] === value);
    return this;
  }
  in(col: string, values: unknown): this {
    let arr: unknown[] = [];
    if (values && typeof values === 'object' && 'execute' in (values as any)) {
      const sub = (values as any).execute() as QueryResult;
      arr = Array.isArray(sub.data) ? sub.data.map((r: Row) => r[Object.keys(r)[0]] ?? r) : [];
    } else if (Array.isArray(values)) {
      arr = values;
    }
    this.filters.push((r) => arr.includes(r[col]));
    return this;
  }
  like(col: string, pattern: string): this {
    this.filters.push((r) => likeMatch(r[col], pattern));
    return this;
  }
  ilike(col: string, pattern: string): this {
    this.filters.push((r) => likeMatch(r[col], pattern));
    return this;
  }
  or(spec: string): this {
    this.filters.push((r) => {
      return spec.split(',').some((cond) => this.evalCondition(r, cond.trim()));
    });
    return this;
  }

  private evalCondition(r: Row, cond: string): boolean {
    const dot = cond.indexOf('.');
    if (dot < 0) return false;
    const col = cond.slice(0, dot);
    const rest = cond.slice(dot + 1);
    const dot2 = rest.indexOf('.');
    if (dot2 < 0) return false;
    const op = rest.slice(0, dot2);
    const value = rest.slice(dot2 + 1);
    const v = r[col];
    switch (op) {
      case 'is':
        return value === 'null' ? v == null : v === value;
      case 'eq':
        return v === value;
      case 'neq':
        return v !== value;
      case 'gt':
        return v > value;
      case 'gte':
        return v >= value;
      case 'lt':
        return v < value;
      case 'lte':
        return v <= value;
      case 'like':
      case 'ilike':
        return likeMatch(v, value);
      default:
        return false;
    }
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number): this {
    this.offset = from;
    this.limitN = to - from + 1;
    return this;
  }
  single(): LocalSingleQueryBuilder {
    this.singleMode = 'single';
    return this as unknown as LocalSingleQueryBuilder;
  }
  maybeSingle(): LocalSingleQueryBuilder {
    this.singleMode = 'maybeSingle';
    return this as unknown as LocalSingleQueryBuilder;
  }
  abortSignal(): this {
    return this;
  }

  // ── mutations ──
  insert(rows: Row | Row[]): this {
    this.mode = 'insert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.mode = 'upsert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    if (opts?.onConflict) this.conflictCols = opts.onConflict.split(',').map((s) => s.trim());
    return this;
  }
  update(values: Row): this {
    this.mode = 'update';
    this.updateObj = values;
    return this;
  }
  delete(): this {
    this.mode = 'delete';
    return this;
  }

  // ── execution (synchronous core, awaited via then) ──
  execute(): QueryResult {
    try {
      switch (this.mode) {
        case 'insert':
          return this.execInsert();
        case 'upsert':
          return this.execUpsert();
        case 'update':
          return this.execUpdate();
        case 'delete':
          return this.execDelete();
        default:
          return this.execSelect();
      }
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) }, count: null };
    }
  }

  private execInsert(): QueryResult {
    const table = getTable(this.table);
    const inserted = this.insertRows.map((r) => ({
      ...r,
      id: r.id ?? genId(),
      created_at: r.created_at ?? nowIso(),
      updated_at: r.updated_at ?? nowIso(),
    }));
    table.push(...inserted);
    persistDb();
    dispatch('INSERT', this.table, inserted);
    return this.finish(inserted);
  }

  private execUpsert(): QueryResult {
    const table = getTable(this.table);
    const out: Row[] = [];
    for (const r of this.insertRows) {
      const match = table.find((ex) => this.conflictCols.every((c) => ex[c] === r[c]));
      if (match) {
        Object.assign(match, r, { updated_at: nowIso() });
        out.push(match);
      } else {
        const nr = { ...r, id: r.id ?? genId(), created_at: r.created_at ?? nowIso(), updated_at: nowIso() };
        table.push(nr);
        out.push(nr);
      }
    }
    persistDb();
    dispatch('UPSERT', this.table, out);
    return this.finish(out);
  }

  private execUpdate(): QueryResult {
    const table = getTable(this.table);
    const affected = table.filter((r) => this.filters.every((f) => f(r)));
    for (const r of affected) Object.assign(r, this.updateObj, { updated_at: nowIso() });
    persistDb();
    dispatch('UPDATE', this.table, affected);
    return this.finish(affected);
  }

  private execDelete(): QueryResult {
    const table = getTable(this.table);
    const affected = table.filter((r) => this.filters.every((f) => f(r)));
    const db = dbRef();
    db.tables[this.table] = table.filter((r) => !this.filters.every((f) => f(r)));
    persistDb();
    dispatch('DELETE', this.table, affected);
    return this.finish(affected);
  }

  /** Wrap affected rows with optional projection (for .select() chains after mutations). */
  private finish(rows: Row[]): QueryResult {
    if (this.plain.length === 1 && this.plain[0] === '*' && this.rels.length === 0) {
      return { data: null, error: null, count: null };
    }
    const data = this.project(rows);
    return { data, error: null, count: null };
  }

  private project(rows: Row[]): Row[] {
    const tables = dbRef().tables;
    return rows
      .map((r) => projectRow(r, this.plain, this.rels, tables))
      .filter((r): r is Row => r !== null);
  }

  private execSelect(): QueryResult {
    let rows = getTable(this.table).slice();
    rows = rows.filter((r) => this.filters.every((f) => f(r)));
    const count = rows.length;

    if (this.headMode) {
      return { data: [], error: null, count };
    }

    const projected = this.project(rows);

    if (this.orders.length) {
      projected.sort((a, b) => {
        for (const o of this.orders) {
          const cmp = compareValues(a[o.col], b[o.col]);
          if (cmp !== 0) return o.asc ? cmp : -cmp;
        }
        return 0;
      });
    }

    let data: Row[] = projected;
    if (this.offset) data = data.slice(this.offset);
    if (this.limitN != null) data = data.slice(0, this.limitN);

    if (this.singleMode === 'single') {
      if (data.length > 1) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' }, count: this.countMode ? count : null };
      }
      return { data: data[0] ?? null, error: null, count: this.countMode ? count : null };
    }
    if (this.singleMode === 'maybeSingle') {
      return { data: data[0] ?? null, error: null, count: this.countMode ? count : null };
    }
    return { data, error: null, count: this.countMode ? count : null };
  }

  // thenable — lets `await supabase.from(...).select(...)` work like supabase-js
  then<TResult1 = QueryResult<Row[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Row[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    try {
      return Promise.resolve(this.execute()).then(onfulfilled as any, onrejected);
    } catch (err) {
      return Promise.reject(err).then(onfulfilled as any, onrejected);
    }
  }
}

/**
 * Terminal builder returned by `.single()` / `.maybeSingle()` — resolves a
 * single row (or null) instead of an array.
 */
export class LocalSingleQueryBuilder extends LocalQueryBuilder {
  override then<TResult1 = QueryResult<Row | null>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Row | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return super.then(onfulfilled as any, onrejected);
  }
}

// ─── Channel (local realtime) ────────────────────────────────────────────────

export class LocalChannel {
  private listeners: ChannelListener[] = [];

  constructor(public name: string) {}

  on(event: string, config: any, cb: any): this {
    if (event === 'postgres_changes') {
      const { table, filter } = (config ?? {}) as { table?: string; filter?: string };
      let matcher: ((row: Row) => boolean) | undefined;
      if (filter && typeof filter === 'string') {
        const m = filter.match(/^([\w.]+)=eq\.(.+)$/);
        if (m) {
          const col = m[1];
          const val = m[2];
          matcher = (row) => row[col] === val;
        }
      }
      const listener: ChannelListener = { event: 'INSERT', table: table ?? '', filter: matcher, cb };
      channelListeners.push(listener);
      this.listeners.push(listener);
    }
    return this;
  }

  subscribe(): this {
    return this;
  }

  unsubscribe(): void {
    for (const l of this.listeners) {
      const idx = channelListeners.indexOf(l);
      if (idx >= 0) channelListeners.splice(idx, 1);
    }
    this.listeners = [];
  }
}

// ─── Storage (local, data-URL based) ─────────────────────────────────────────

class LocalStorageBucket {
  constructor(private bucket: string) {}

  upload(path: string, file: Blob | File, _opts?: { contentType?: string; upsert?: boolean }): Promise<{ data: { path: string }; error: QueryError | null }> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const key = `${this.bucket}/${path}`;
        filesRef()[key] = reader.result as string;
        persistFiles();
        resolve({ data: { path }, error: null });
      };
      reader.onerror = () => resolve({ data: { path }, error: { message: 'Gagal membaca file' } });
      reader.readAsDataURL(file);
    });
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const key = `${this.bucket}/${path}`;
    return { data: { publicUrl: filesRef()[key] ?? '' } };
  }

  remove(paths: string | string[]): Promise<{ data: null; error: null }> {
    const list = Array.isArray(paths) ? paths : [paths];
    for (const p of list) delete filesRef()[`${this.bucket}/${p}`];
    persistFiles();
    return Promise.resolve({ data: null, error: null });
  }

  list(prefix = ''): Promise<{ data: { name: string }[]; error: null }> {
    const names = Object.keys(filesRef())
      .filter((k) => k.startsWith(`${this.bucket}/${prefix}`))
      .map((k) => ({ name: k.slice(this.bucket.length + 1) }));
    return Promise.resolve({ data: names, error: null });
  }
}

// ─── Database client (drop-in for the supabase client) ──────────────────────

export class LocalDatabase {
  from(table: string): LocalQueryBuilder {
    return new LocalQueryBuilder(table);
  }

  auth = {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const u = dbRef().users.find((x) => x.email.toLowerCase() === email.toLowerCase());
      if (!u || u.password !== password) {
        return { data: { user: null, session: null }, error: { message: 'Email atau password salah.' } as QueryError };
      }
      const session = makeSession(u);
      saveSession(session);
      emitAuth('SIGNED_IN', session);
      return { data: { user: session.user, session }, error: null };
    },

    signUp: async ({ email, password }: { email: string; password: string }) => {
      const db = dbRef();
      if (db.users.find((x) => x.email.toLowerCase() === email.toLowerCase())) {
        return { data: { user: null, session: null }, error: { message: 'Email sudah terdaftar.' } as QueryError };
      }
      const user: LocalUser = { id: genId('u_'), email, password, created_at: nowIso() };
      db.users.push(user);
      persistDb();
      return { data: { user: toUser(user), session: null }, error: null };
    },

    signOut: async () => {
      saveSession(null);
      emitAuth('SIGNED_OUT', null);
      return { error: null };
    },

    getSession: async () => {
      return { data: { session: loadSession() }, error: null };
    },

    getUser: async () => {
      const session = loadSession();
      return { data: { user: session?.user ?? null }, error: null };
    },

    updateUser: async (_attributes: Record<string, unknown>) => {
      const session = loadSession();
      return { data: { user: session?.user ?? null }, error: null };
    },

    onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
      const listener = cb;
      authListeners.push(listener);
      setTimeout(() => listener('INITIAL_SESSION', loadSession()), 0);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              const idx = authListeners.indexOf(listener);
              if (idx >= 0) authListeners.splice(idx, 1);
            },
          },
        },
      };
    },
  };

  storage = {
    from: (bucket: string) => new LocalStorageBucket(bucket),
  };

  channel(name: string): LocalChannel {
    return new LocalChannel(name);
  }

  removeChannel(channel: LocalChannel): void {
    channel?.unsubscribe();
  }
}

function emitAuth(event: string, session: Session | null): void {
  for (const cb of authListeners.slice()) cb(event, session);
}
