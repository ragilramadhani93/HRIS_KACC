import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Eye, Edit2, UserCheck, UserX, Upload, Trash2, FileText, DollarSign } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { Table } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Tabs } from '../ui/Tabs';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui/Toast';
import { formatDate, formatCurrency, STATUS_COLORS, generateEmployeeCode } from '../../lib/utils';
import type {
  Employee, Company, Region, Area, Outlet,
  GenderType, MaritalStatusType, EmployeeStatus, EmployeeDocument, DocumentType,
} from '../../lib/database.types';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  ktp: 'KTP (ID Card)',
  npwp: 'NPWP (Tax ID)',
  kk: 'Kartu Keluarga',
  bpjs: 'BPJS',
  contract: 'Employment Contract',
  other: 'Other',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'probation', label: 'Probation' },
  { value: 'contract', label: 'Contract' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'terminated', label: 'Terminated' },
];

interface EmployeeFormData {
  employee_code: string; full_name: string; nik: string;
  birth_place: string; birth_date: string; gender: string;
  marital_status: string; phone: string; email: string; address: string;
  job_title: string; department: string; company_id: string;
  region_id: string; area_id: string; primary_outlet_id: string;
  backup_outlet_id: string; supervisor_id: string;
  join_date: string; status: string;
  basic_salary: string; npwp: string; salary_scheme: string; daily_rate: string;
}

const EMPTY_FORM: EmployeeFormData = {
  employee_code: '', full_name: '', nik: '', birth_place: '', birth_date: '',
  gender: '', marital_status: '', phone: '', email: '', address: '',
  job_title: '', department: '', company_id: '', region_id: '', area_id: '',
  primary_outlet_id: '', backup_outlet_id: '', supervisor_id: '',
  join_date: '', status: 'active', basic_salary: '0', npwp: '', salary_scheme: 'monthly', daily_rate: '0',
};

// ─── Documents Tab ─────────────────────────────────────────
function DocumentsTab({ employeeId }: { employeeId: string }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<DocumentType>('ktp');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('employee_documents').select('*').eq('employee_id', employeeId).order('uploaded_at', { ascending: false });
    setDocs(data ?? []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${employeeId}/${docType}_${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('employee-documents').upload(path, file, { upsert: false });
    if (error) { toast('error', 'Upload failed', error.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('employee-documents').getPublicUrl(data.path);
    const { error: dbErr } = await supabase.from('employee_documents').insert({
      employee_id: employeeId, document_type: docType, file_name: file.name, file_url: urlData.publicUrl,
    });
    if (dbErr) { toast('error', 'Record failed', dbErr.message); } else { toast('success', 'Document uploaded'); load(); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (doc: EmployeeDocument) => {
    if (!confirm(`Delete ${doc.file_name}?`)) return;
    await supabase.from('employee_documents').delete().eq('id', doc.id);
    toast('success', 'Document deleted');
    load();
  };

  const docTypeOptions = (Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((k) => ({ value: k, label: DOCUMENT_TYPE_LABELS[k] }));

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 rounded-xl p-4 flex items-end gap-3">
        <Select label="Document Type" value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)} options={docTypeOptions} className="flex-1" />
        <div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} className="hidden" id="doc-upload" />
          <Button variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Upload
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <FileText size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No documents uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileText size={16} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{doc.file_name}</p>
                <p className="text-xs text-slate-500">{DOCUMENT_TYPE_LABELS[doc.document_type]} · {formatDate(doc.uploaded_at)}</p>
              </div>
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-xs font-medium">View</a>
              <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => handleDelete(doc)}><Trash2 size={13} /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Employee Detail Modal ──────────────────────────────────
function EmployeeDetail({ employee, onClose, onEdit }: { employee: Employee; onClose: () => void; onEdit: () => void }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [attendance, setAttendance] = useState<{ date: string; status: string; check_in: string | null }[]>([]);

  useEffect(() => {
    supabase.from('attendance').select('attendance_date, status, check_in_time').eq('employee_id', employee.id).order('attendance_date', { ascending: false }).limit(30)
      .then(({ data }) => setAttendance((data ?? []).map((d) => ({ date: d.attendance_date, status: d.status, check_in: d.check_in_time }))));
  }, [employee.id]);

  const tabs = [
    { id: 'profile', label: 'Personal' },
    { id: 'employment', label: 'Employment' },
    { id: 'salary', label: 'Salary' },
    { id: 'documents', label: 'Documents' },
    { id: 'attendance', label: 'Attendance', count: attendance.length },
  ];

  return (
    <Modal isOpen onClose={onClose} title="Employee Details" size="2xl"
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={onEdit}><Edit2 size={14} /> Edit</Button></>}
    >
      <div className="flex items-start gap-4 pb-4 border-b border-slate-100 mb-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-md">
          {employee.full_name.charAt(0)}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-900">{employee.full_name}</h3>
          <p className="text-slate-500 text-sm">{employee.job_title ?? '-'} · {employee.department ?? '-'}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge className={STATUS_COLORS[employee.status]}>{employee.status}</Badge>
            <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">{employee.employee_code}</span>
            {employee.face_registered && <Badge className="bg-teal-100 text-teal-700">Face Registered</Badge>}
          </div>
        </div>
      </div>
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4" />

      {activeTab === 'profile' && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['NIK', employee.nik], ['Birth Place', employee.birth_place],
            ['Birth Date', formatDate(employee.birth_date)],
            ['Gender', employee.gender ?? '-'], ['Marital Status', employee.marital_status ?? '-'],
            ['Phone', employee.phone ?? '-'], ['Email', employee.email ?? '-'],
          ].map(([label, val]) => (
            <div key={label}><p className="text-xs font-medium text-slate-500">{label}</p><p className="text-slate-800 mt-0.5">{val ?? '-'}</p></div>
          ))}
          <div className="col-span-2"><p className="text-xs font-medium text-slate-500">Address</p><p className="text-slate-800 mt-0.5">{employee.address ?? '-'}</p></div>
        </div>
      )}

      {activeTab === 'employment' && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Company', (employee.company as { name?: string })?.name ?? '-'],
            ['Region', (employee.region as { name?: string })?.name ?? '-'],
            ['Area', (employee.area as { name?: string })?.name ?? '-'],
            ['Primary Outlet', (employee.primary_outlet as { name?: string })?.name ?? '-'],
            ['Backup Outlet', (employee.backup_outlet as { name?: string })?.name ?? '-'],
            ['Supervisor', (employee.supervisor as { full_name?: string })?.full_name ?? '-'],
            ['Join Date', formatDate(employee.join_date)],
          ].map(([label, val]) => (
            <div key={label}><p className="text-xs font-medium text-slate-500">{label}</p><p className="text-slate-800 mt-0.5">{val}</p></div>
          ))}
        </div>
      )}

      {activeTab === 'salary' && (
        <div className="space-y-3 text-sm">
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Basic Salary</p>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(employee.basic_salary)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['BPJS Kes (Employee)', `${(employee.bpjs_kes_employee * 100).toFixed(2)}%`],
              ['BPJS Kes (Employer)', `${(employee.bpjs_kes_employer * 100).toFixed(2)}%`],
              ['BPJS TK JHT (Employee)', `${(employee.bpjs_tk_jht_employee * 100).toFixed(2)}%`],
              ['BPJS TK JHT (Employer)', `${(employee.bpjs_tk_jht_employer * 100).toFixed(2)}%`],
              ['NPWP', employee.npwp ?? '-'],
            ].map(([label, val]) => (
              <div key={label}><p className="text-xs font-medium text-slate-500">{label}</p><p className="font-medium mt-0.5">{val}</p></div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'documents' && <DocumentsTab employeeId={employee.id} />}

      {activeTab === 'attendance' && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {attendance.length === 0 ? (
            <p className="text-center text-slate-400 py-6 text-sm">No attendance records</p>
          ) : (
            attendance.map((a) => (
              <div key={a.date} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                <span className="text-sm text-slate-700">{formatDate(a.date)}</span>
                <div className="flex items-center gap-2">
                  {a.check_in && <span className="text-xs text-slate-500 font-mono">{new Date(a.check_in).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>}
                  <Badge className={STATUS_COLORS[a.status]}>{a.status.replace('_', ' ')}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Main Page ──────────────────────────────────────────────
export function EmployeesPage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [allRegions, setAllRegions] = useState<Region[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allOutlets, setAllOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EmployeeFormData>(EMPTY_FORM);
  const [formTab, setFormTab] = useState('personal');

  // Cascading filter state in form
  const filteredRegions = allRegions.filter((r) => !form.company_id || r.company_id === form.company_id);
  const filteredAreas = allAreas.filter((a) => !form.region_id || a.region_id === form.region_id);
  const filteredOutlets = allOutlets.filter((o) => !form.area_id || o.area_id === form.area_id);

  const loadRefData = async () => {
    const [{ data: c }, { data: r }, { data: a }, { data: o }] = await Promise.all([
      supabase.from('companies').select('id, name, code').eq('is_active', true).order('name'),
      supabase.from('regions').select('id, name, company_id').eq('is_active', true).order('name'),
      supabase.from('areas').select('id, name, region_id').eq('is_active', true).order('name'),
      supabase.from('outlets').select('id, name, area_id').eq('is_active', true).order('name'),
    ]);
    setAllCompanies(c ?? []);
    setAllRegions(r as Region[] ?? []);
    setAllAreas(a as Area[] ?? []);
    setAllOutlets(o as Outlet[] ?? []);
  };

  const loadEmployees = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('employees')
      .select('*, company:companies(name), region:regions(name), area:areas(name), primary_outlet:outlets!primary_outlet_id(name), backup_outlet:outlets!backup_outlet_id(name), supervisor:employees!supervisor_id(full_name)')
      .order('full_name');
    setEmployees((data as Employee[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadRefData(); loadEmployees(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, employee_code: generateEmployeeCode() });
    setFormTab('personal');
    setModalOpen(true);
  };

  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      employee_code: e.employee_code, full_name: e.full_name, nik: e.nik ?? '',
      birth_place: e.birth_place ?? '', birth_date: e.birth_date ?? '',
      gender: e.gender ?? '', marital_status: e.marital_status ?? '',
      phone: e.phone ?? '', email: e.email ?? '', address: e.address ?? '',
      job_title: e.job_title ?? '', department: e.department ?? '',
      company_id: e.company_id, region_id: e.region_id ?? '',
      area_id: e.area_id ?? '', primary_outlet_id: e.primary_outlet_id ?? '',
      backup_outlet_id: e.backup_outlet_id ?? '', supervisor_id: e.supervisor_id ?? '',
      join_date: e.join_date ?? '', status: e.status,
      basic_salary: e.basic_salary.toString(), npwp: e.npwp ?? '',
      salary_scheme: e.salary_scheme ?? 'monthly', daily_rate: (e.daily_rate ?? 0).toString(),
    });
    setFormTab('personal');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name || !form.employee_code || !form.company_id) return toast('error', 'Name, Code, and Company are required');
    setSaving(true);
    const payload = {
      employee_code: form.employee_code, full_name: form.full_name,
      nik: form.nik || null, birth_place: form.birth_place || null,
      birth_date: form.birth_date || null, gender: (form.gender as GenderType) || null,
      marital_status: (form.marital_status as MaritalStatusType) || null,
      phone: form.phone || null, email: form.email || null, address: form.address || null,
      job_title: form.job_title || null, department: form.department || null,
      company_id: form.company_id, region_id: form.region_id || null,
      area_id: form.area_id || null, primary_outlet_id: form.primary_outlet_id || null,
      backup_outlet_id: form.backup_outlet_id || null,
      supervisor_id: form.supervisor_id || null, join_date: form.join_date || null,
      status: form.status as EmployeeStatus,
      basic_salary: parseFloat(form.basic_salary) || 0,
      salary_scheme: (form.salary_scheme as 'monthly' | 'daily') || 'monthly',
      daily_rate: parseFloat(form.daily_rate) || 0,
      npwp: form.npwp || null,
    };
    const op = editing ? supabase.from('employees').update(payload).eq('id', editing.id) : supabase.from('employees').insert(payload);
    const { error } = await op;
    if (error) { toast('error', 'Failed to save', error.message); }
    else { toast('success', editing ? 'Employee updated' : 'Employee created'); loadEmployees(); setModalOpen(false); }
    setSaving(false);
  };

  const handleToggleStatus = async (emp: Employee) => {
    const newStatus: EmployeeStatus = emp.status === 'active' ? 'resigned' : 'active';
    const { error } = await supabase.from('employees').update({ status: newStatus }).eq('id', emp.id);
    if (error) { toast('error', 'Failed', error.message); } else { toast('success', 'Status updated'); loadEmployees(); }
  };

  const companyFilterOptions = [{ value: '', label: 'All Companies' }, ...allCompanies.map((c) => ({ value: c.id, label: c.name }))];

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = e.full_name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q) || (e.job_title ?? '').toLowerCase().includes(q);
    const matchStatus = !filterStatus || e.status === filterStatus;
    const matchCompany = !filterCompany || e.company_id === filterCompany;
    return matchSearch && matchStatus && matchCompany;
  });

  const statusCounts = (['active', 'probation', 'contract', 'resigned', 'terminated'] as EmployeeStatus[]).map((s) => ({
    status: s, count: employees.filter((e) => e.status === s).length,
  }));

  const genderOpts = [{ value: '', label: 'Select' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }];
  const maritalOpts = [{ value: '', label: 'Select' }, { value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }, { value: 'divorced', label: 'Divorced' }, { value: 'widowed', label: 'Widowed' }];
  const statusOpts = [{ value: 'active', label: 'Active' }, { value: 'probation', label: 'Probation' }, { value: 'contract', label: 'Contract' }, { value: 'resigned', label: 'Resigned' }, { value: 'terminated', label: 'Terminated' }];
  const formTabs = [{ id: 'personal', label: 'Personal' }, { id: 'employment', label: 'Employment' }, { id: 'salary', label: 'Salary & Tax' }];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Search by name, code, title..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={14} />} className="w-64" />
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} options={STATUS_OPTIONS} className="w-36" />
          <Select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} options={companyFilterOptions} className="w-44" />
        </div>
        <Button onClick={openCreate}><Plus size={16} /> Add Employee</Button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-5 gap-2">
        {statusCounts.map(({ status, count }) => (
          <button
            key={status}
            onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
            className={`rounded-xl border p-3 text-left transition-all hover:border-blue-200 ${filterStatus === status ? 'ring-2 ring-blue-500 border-blue-300' : 'border-slate-100 bg-white'}`}
          >
            <p className="text-xl font-bold text-slate-900">{count}</p>
            <Badge className={`${STATUS_COLORS[status]} mt-1 text-xs`}>{status}</Badge>
          </button>
        ))}
      </div>

      {/* Table */}
      <Table
        loading={loading}
        rowKey={(e) => e.id}
        data={filtered}
        emptyMessage="No employees found"
        columns={[
          {
            key: 'employee_code', header: 'Employee',
            render: (e) => (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                  {e.full_name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{e.full_name}</p>
                  <p className="text-xs text-slate-400 font-mono">{e.employee_code}</p>
                </div>
              </div>
            ),
          },
          { key: 'job_title', header: 'Position', render: (e) => <div><p className="text-sm font-medium">{e.job_title ?? '-'}</p><p className="text-xs text-slate-400">{e.department ?? ''}</p></div> },
          { key: 'company', header: 'Company', render: (e) => <span className="text-sm">{(e.company as { name?: string })?.name ?? '-'}</span> },
          { key: 'primary_outlet', header: 'Outlet', render: (e) => <span className="text-sm">{(e.primary_outlet as { name?: string })?.name ?? <span className="text-slate-400">-</span>}</span> },
          { key: 'basic_salary', header: 'Salary', render: (e) => <span className="text-sm font-medium text-slate-700">{formatCurrency(e.basic_salary)}</span> },
          { key: 'status', header: 'Status', render: (e) => <Badge className={STATUS_COLORS[e.status]}>{e.status}</Badge> },
          { key: 'face_registered', header: 'Face', render: (e) => e.face_registered ? <Badge className="bg-teal-100 text-teal-700 text-xs">Registered</Badge> : <Badge className="bg-slate-100 text-slate-400 text-xs">Pending</Badge> },
          {
            key: 'actions', header: '',
            render: (e) => (
              <div className="flex gap-1 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setDetailEmployee(e)}><Eye size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Edit2 size={14} /></Button>
                <Button size="sm" variant="ghost" className={e.status === 'active' ? 'text-red-500 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'} onClick={() => handleToggleStatus(e)}>
                  {e.status === 'active' ? <UserX size={14} /> : <UserCheck size={14} />}
                </Button>
              </div>
            ),
          },
        ]}
      />

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Employee' : 'Add Employee'} size="2xl"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save Employee</Button></>}
      >
        <Tabs tabs={formTabs} activeTab={formTab} onChange={setFormTab} className="mb-4" />

        {formTab === 'personal' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              <Input label="Employee Code" value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="NIK" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} />
              <Input label="Birth Place" value={form.birth_place} onChange={(e) => setForm({ ...form, birth_place: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Birth Date" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
              <Select label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} options={genderOpts} />
              <Select label="Marital Status" value={form.marital_status} onChange={(e) => setForm({ ...form, marital_status: e.target.value })} options={maritalOpts} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <Textarea label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        )}

        {formTab === 'employment' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Job Title" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
              <Input label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <Select label="Company" value={form.company_id}
              onChange={(e) => setForm({ ...form, company_id: e.target.value, region_id: '', area_id: '', primary_outlet_id: '', backup_outlet_id: '' })}
              options={[{ value: '', label: 'Select Company' }, ...allCompanies.map((c) => ({ value: c.id, label: c.name }))]} required
            />
            <div className="grid grid-cols-2 gap-4">
              <Select label="Region" value={form.region_id}
                onChange={(e) => setForm({ ...form, region_id: e.target.value, area_id: '', primary_outlet_id: '', backup_outlet_id: '' })}
                options={[{ value: '', label: 'Select Region' }, ...filteredRegions.map((r) => ({ value: r.id, label: r.name }))]}
              />
              <Select label="Area" value={form.area_id}
                onChange={(e) => setForm({ ...form, area_id: e.target.value, primary_outlet_id: '', backup_outlet_id: '' })}
                options={[{ value: '', label: 'Select Area' }, ...filteredAreas.map((a) => ({ value: a.id, label: a.name }))]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Primary Outlet" value={form.primary_outlet_id}
                onChange={(e) => setForm({ ...form, primary_outlet_id: e.target.value })}
                options={[{ value: '', label: 'Select Outlet' }, ...filteredOutlets.map((o) => ({ value: o.id, label: o.name }))]}
              />
              <Select label="Backup Outlet" value={form.backup_outlet_id}
                onChange={(e) => setForm({ ...form, backup_outlet_id: e.target.value })}
                options={[{ value: '', label: 'No Backup' }, ...filteredOutlets.map((o) => ({ value: o.id, label: o.name }))]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Supervisor" value={form.supervisor_id}
                onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}
                options={[{ value: '', label: 'No Supervisor' }, ...employees.filter((e) => !editing || e.id !== editing.id).map((e) => ({ value: e.id, label: e.full_name }))]}
              />
              <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={statusOpts} />
            </div>
            <Input label="Join Date" type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} />
          </div>
        )}

        {formTab === 'salary' && (
          <div className="space-y-4">
            <Select
              label="Skema Gaji"
              value={form.salary_scheme ?? 'monthly'}
              onChange={(e) => setForm({ ...form, salary_scheme: e.target.value })}
              options={[{ value: 'monthly', label: 'Bulanan (Basic Salary)' }, { value: 'daily', label: 'Harian (Gaji Per Hari Masuk)' }]}
              hint="Gaji harian: dibayar sesuai hari kehadiran. Bulanan: dibayar penuh + potongan absen."
            />
            {(form.salary_scheme ?? 'monthly') === 'monthly' ? (
              <Input label="Gaji Pokok / Basic Salary (IDR)" type="number" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} leftIcon={<DollarSign size={14} />} hint="Gaji bulanan penuh" />
            ) : (
              <Input label="Tarif Harian (IDR)" type="number" value={form.daily_rate ?? '0'} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} leftIcon={<DollarSign size={14} />} hint="Akan digantikan oleh Tarif Area jika ada. Kelola di menu Payroll > Tarif Area." />
            )}
            <Input label="NPWP" value={form.npwp} onChange={(e) => setForm({ ...form, npwp: e.target.value })} placeholder="XX.XXX.XXX.X-XXX.XXX" />
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700 mb-2">Tarif BPJS (default)</p>
              <p>BPJS Kesehatan: 1% karyawan / 4% perusahaan</p>
              <p>BPJS TK JHT: 2% karyawan / 3.7% perusahaan</p>
            </div>
          </div>
        )}
      </Modal>

      {detailEmployee && (
        <EmployeeDetail
          employee={detailEmployee}
          onClose={() => setDetailEmployee(null)}
          onEdit={() => { openEdit(detailEmployee); setDetailEmployee(null); }}
        />
      )}
    </div>
  );
}
