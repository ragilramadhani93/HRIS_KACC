import { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, Calendar, Users, Store, Trash2, Check, X, Info, Download, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { Table } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Tabs } from '../ui/Tabs';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui/Toast';
import { formatDate } from '../../lib/utils';
import type { ShiftTemplate, ShiftAssignment, Employee, Company } from '../../lib/database.types';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// ─── Shift Templates ──────────────────────────────────────────
function ShiftTemplatesTab() {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', company_id: '', start_time: '08:00', end_time: '17:00',
    is_overnight: false, late_tolerance_minutes: 15, rotation: 'daily',
  });

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('shift_templates').select('*, company:companies(name)').order('name'),
      supabase.from('companies').select('id, name').eq('is_active', true),
    ]);
    setShifts(s ?? []);
    setCompanies(c ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', company_id: companies[0]?.id ?? '', start_time: '08:00', end_time: '17:00', is_overnight: false, late_tolerance_minutes: 15, rotation: 'daily' });
    setModalOpen(true);
  };
  const openEdit = (s: ShiftTemplate) => {
    setEditing(s);
    setForm({ name: s.name, company_id: s.company_id, start_time: s.start_time, end_time: s.end_time, is_overnight: s.is_overnight, late_tolerance_minutes: s.late_tolerance_minutes, rotation: s.rotation });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.company_id) return toast('error', 'Nama dan Perusahaan wajib diisi');
    setSaving(true);
    const op = editing ? supabase.from('shift_templates').update(form).eq('id', editing.id) : supabase.from('shift_templates').insert(form);
    const { error } = await op;
    if (error) toast('error', 'Gagal', error.message); else { toast('success', editing ? 'Diperbarui' : 'Dibuat'); load(); setModalOpen(false); }
    setSaving(false);
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}><Plus size={16} /> Tambah Shift</Button>
      </div>
      <Table loading={loading} rowKey={(s) => s.id} data={shifts} columns={[
        { key: 'name', header: 'Nama Shift', render: (s) => <span className="font-semibold">{s.name}</span> },
        { key: 'time', header: 'Jam', render: (s) => <span className="font-mono text-sm">{s.start_time.substring(0, 5)} – {s.end_time.substring(0, 5)}{s.is_overnight ? ' (+1)' : ''}</span> },
        { key: 'company', header: 'Perusahaan', render: (s) => (s as { company?: { name?: string } }).company?.name ?? '-' },
        { key: 'late_tolerance_minutes', header: 'Toleransi Terlambat', render: (s) => `${s.late_tolerance_minutes} menit` },
        { key: 'rotation', header: 'Rotasi', render: (s) => <Badge className="bg-blue-50 text-blue-700">{s.rotation}</Badge> },
        { key: 'is_active', header: 'Status', render: (s) => <Badge className={s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{s.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
        { key: 'actions', header: '', render: (s) => <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit2 size={14} /></Button> },
      ]} />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Shift' : 'Tambah Shift'} size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={saving} onClick={handleSave}>Simpan</Button></>}
      >
        <div className="space-y-4">
          <Select label="Perusahaan" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} options={companies.map((c) => ({ value: c.id, label: c.name }))} required />
          <Input label="Nama Shift" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth. Shift Pagi" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Jam Mulai" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            <Input label="Jam Selesai" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Toleransi Terlambat (menit)" type="number" value={form.late_tolerance_minutes.toString()} onChange={(e) => setForm({ ...form, late_tolerance_minutes: parseInt(e.target.value) || 15 })} />
            <Select label="Rotasi" value={form.rotation} onChange={(e) => setForm({ ...form, rotation: e.target.value })} options={[{ value: 'daily', label: 'Harian' }, { value: 'weekly', label: 'Mingguan' }, { value: 'monthly', label: 'Bulanan' }]} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_overnight} onChange={(e) => setForm({ ...form, is_overnight: e.target.checked })} className="rounded" />
            <span className="text-sm text-slate-700">Shift lintas hari (selesai keesokan hari)</span>
          </label>
        </div>
      </Modal>
    </>
  );
}

// ─── Outlet Schedule ──────────────────────────────────────────
interface OutletSchedule {
  id: string;
  outlet_id: string;
  shift_template_id: string;
  day_of_week: number;
  min_staff: number;
  max_staff: number | null;
  is_active: boolean;
  notes: string | null;
}

interface ScheduleRow {
  outlet_id: string;
  outlet_name: string;
  outlet_code: string;
  area_name: string;
  schedules: OutletSchedule[];
}

// Color palette for shift badges
const SHIFT_COLORS = [
  'bg-blue-500 text-white',
  'bg-emerald-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-violet-500 text-white',
  'bg-teal-500 text-white',
];

function OutletScheduleTab() {
  const { toast } = useToast();
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterArea, setFilterArea] = useState('');
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OutletSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ outlet_id: '', shift_template_id: '', day_of_week: 1, min_staff: 1, max_staff: '', notes: '', is_active: true });

  const load = async () => {
    setLoading(true);
    const [{ data: sched }, { data: outletData }, { data: shiftData }, { data: areaData }] = await Promise.all([
      supabase.from('outlet_schedules').select('*').order('day_of_week'),
      supabase.from('outlets').select('id, name, outlet_code, area:areas(id, name)').eq('is_active', true).order('name'),
      supabase.from('shift_templates').select('id, name, start_time, end_time').eq('is_active', true).order('name'),
      supabase.from('areas').select('id, name').eq('is_active', true).order('name'),
    ]);

    setShifts(shiftData ?? []);
    setAreas(areaData ?? []);

    const rows: ScheduleRow[] = (outletData ?? []).map((o: any) => ({
      outlet_id: o.id,
      outlet_name: o.name,
      outlet_code: o.outlet_code,
      area_name: o.area?.name ?? '-',
      schedules: (sched ?? []).filter((s: any) => s.outlet_id === o.id),
    }));
    setScheduleRows(rows);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = (outletId = '') => {
    setEditing(null);
    setForm({ outlet_id: outletId, shift_template_id: shifts[0]?.id ?? '', day_of_week: 1, min_staff: 1, max_staff: '', notes: '', is_active: true });
    setModalOpen(true);
  };

  const openEdit = (s: OutletSchedule) => {
    setEditing(s);
    setForm({ outlet_id: s.outlet_id, shift_template_id: s.shift_template_id, day_of_week: s.day_of_week, min_staff: s.min_staff, max_staff: s.max_staff?.toString() ?? '', notes: s.notes ?? '', is_active: s.is_active });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.outlet_id || !form.shift_template_id) return toast('error', 'Outlet dan Shift wajib diisi');
    setSaving(true);
    const payload = {
      outlet_id: form.outlet_id,
      shift_template_id: form.shift_template_id,
      day_of_week: form.day_of_week,
      min_staff: form.min_staff,
      max_staff: form.max_staff ? parseInt(form.max_staff) : null,
      notes: form.notes || null,
      is_active: form.is_active,
    };
    const op = editing
      ? supabase.from('outlet_schedules').update(payload).eq('id', editing.id)
      : supabase.from('outlet_schedules').upsert(payload, { onConflict: 'outlet_id,shift_template_id,day_of_week' });
    const { error } = await op;
    if (error) toast('error', 'Gagal', error.message); else { toast('success', editing ? 'Jadwal diperbarui' : 'Jadwal ditambahkan'); load(); setModalOpen(false); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('outlet_schedules').delete().eq('id', id);
    if (error) toast('error', 'Gagal hapus', error.message); else { toast('success', 'Jadwal dihapus'); load(); }
  };

  // Quick toggle a day for a shift on an outlet directly from the grid
  const toggleDayShift = async (outletId: string, shiftId: string, dow: number, existing: OutletSchedule | undefined) => {
    if (existing) {
      await supabase.from('outlet_schedules').update({ is_active: !existing.is_active }).eq('id', existing.id);
    } else {
      await supabase.from('outlet_schedules').upsert({ outlet_id: outletId, shift_template_id: shiftId, day_of_week: dow, min_staff: 1 }, { onConflict: 'outlet_id,shift_template_id,day_of_week' });
    }
    load();
  };

  const filteredRows = filterArea ? scheduleRows.filter((r) => areas.find((a) => a.name === r.area_name)?.id === filterArea) : scheduleRows;

  const shiftColorMap: Record<string, string> = {};
  shifts.forEach((s, i) => { shiftColorMap[s.id] = SHIFT_COLORS[i % SHIFT_COLORS.length]; });

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Semua Area</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info size={13} />
            Klik sel untuk toggle jadwal aktif/nonaktif
          </div>
        </div>
        <Button onClick={() => openCreate()}><Plus size={16} /> Tambah Jadwal</Button>
      </div>

      {/* Shift legend */}
      <div className="flex flex-wrap gap-2 mb-5">
        {shifts.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 bg-white border border-slate-100 rounded-lg px-3 py-1.5 shadow-sm">
            <span className={`w-3 h-3 rounded-sm ${shiftColorMap[s.id]}`} />
            <span className="text-xs font-medium text-slate-700">{s.name}</span>
            <span className="text-xs text-slate-400 font-mono">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Memuat jadwal...</div>
      ) : (
        <div className="space-y-5">
          {filteredRows.map((row) => (
            <Card key={row.outlet_id} padding={false}>
              {/* Outlet header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Store size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{row.outlet_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{row.outlet_code} · {row.area_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">
                    {row.schedules.filter((s) => s.is_active).length} slot aktif
                  </span>
                  <Button size="sm" variant="outline" onClick={() => openCreate(row.outlet_id)}>
                    <Plus size={13} /> Tambah
                  </Button>
                </div>
              </div>

              {/* Weekly grid */}
              <div className="p-5">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-semibold text-slate-400 pb-3 w-36">Shift</th>
                        {DAYS.map((_, i) => (
                          <th key={i} className={`text-center text-xs font-semibold pb-3 w-16 ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-amber-500' : 'text-slate-500'}`}>
                            {DAY_SHORT[i]}
                          </th>
                        ))}
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {shifts.map((shift) => {
                        const rowSlots = row.schedules.filter((s) => s.shift_template_id === shift.id);
                        return (
                          <tr key={shift.id} className="group">
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${shiftColorMap[shift.id]}`} />
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{shift.name}</p>
                                  <p className="text-xs text-slate-400 font-mono">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</p>
                                </div>
                              </div>
                            </td>
                            {DAYS.map((_, dow) => {
                              const slot = rowSlots.find((s) => s.day_of_week === dow);
                              const isWeekend = dow === 0 || dow === 6;
                              return (
                                <td key={dow} className="py-3 text-center">
                                  <button
                                    onClick={() => toggleDayShift(row.outlet_id, shift.id, dow, slot)}
                                    className={`relative inline-flex flex-col items-center justify-center w-12 h-12 rounded-xl border-2 transition-all hover:scale-105 ${
                                      slot?.is_active
                                        ? `border-transparent ${shiftColorMap[shift.id]} shadow-sm`
                                        : slot
                                          ? 'border-dashed border-slate-200 bg-slate-50 opacity-50'
                                          : `border-dashed hover:border-slate-300 ${isWeekend ? 'border-rose-100 bg-rose-50/30' : 'border-slate-100 bg-slate-50/50'}`
                                    }`}
                                    title={slot?.is_active ? `Aktif · Min ${slot.min_staff}${slot.max_staff ? `/Maks ${slot.max_staff}` : ''} orang` : slot ? 'Nonaktif (klik untuk aktifkan)' : 'Belum dijadwalkan (klik untuk tambah)'}
                                  >
                                    {slot?.is_active ? (
                                      <>
                                        <Check size={14} className="text-white" />
                                        <span className="text-[9px] text-white/80 leading-none mt-0.5">{slot.min_staff}{slot.max_staff ? `–${slot.max_staff}` : '+'}</span>
                                      </>
                                    ) : slot ? (
                                      <X size={14} className="text-slate-300" />
                                    ) : (
                                      <Plus size={12} className="text-slate-300 group-hover:text-slate-400" />
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="py-3 pl-2">
                              {rowSlots.length > 0 && (
                                <button
                                  onClick={() => openEdit(rowSlots[0])}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  title="Edit detail jadwal"
                                >
                                  <Edit2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Active slots list with staff counts */}
                {row.schedules.filter((s) => s.is_active).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-50">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Detail Slot Aktif</p>
                    <div className="flex flex-wrap gap-2">
                      {row.schedules
                        .filter((s) => s.is_active)
                        .sort((a, b) => a.day_of_week - b.day_of_week)
                        .map((s) => {
                          const shiftInfo = shifts.find((sh) => sh.id === s.shift_template_id);
                          return (
                            <div key={s.id} className="group/slot flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                              <span className={`w-2 h-2 rounded-sm flex-shrink-0 ${shiftColorMap[s.shift_template_id]}`} />
                              <span className="text-xs font-medium text-slate-700">{DAY_SHORT[s.day_of_week]}</span>
                              <span className="text-xs text-slate-400">{shiftInfo?.name}</span>
                              <span className="text-xs text-slate-500 bg-white border border-slate-100 rounded-lg px-1.5 py-0.5">
                                <Users size={9} className="inline mr-0.5" />
                                {s.min_staff}{s.max_staff ? `–${s.max_staff}` : '+'}
                              </span>
                              <button
                                onClick={() => openEdit(s)}
                                className="opacity-0 group-hover/slot:opacity-100 p-0.5 text-slate-400 hover:text-blue-600 transition-all"
                              >
                                <Edit2 size={11} />
                              </button>
                              <button
                                onClick={() => handleDelete(s.id)}
                                className="opacity-0 group-hover/slot:opacity-100 p-0.5 text-slate-400 hover:text-red-500 transition-all"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {row.schedules.length === 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-3 text-slate-400">
                    <Info size={14} />
                    <span className="text-sm">Belum ada jadwal. Klik sel di atas atau tombol Tambah untuk menjadwalkan shift.</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Jadwal Outlet' : 'Tambah Jadwal Outlet'} size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={saving} onClick={handleSave}>Simpan</Button></>}
      >
        <div className="space-y-4">
          <Select
            label="Outlet"
            value={form.outlet_id}
            onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
            options={[{ value: '', label: 'Pilih Outlet' }, ...scheduleRows.map((r) => ({ value: r.outlet_id, label: `${r.outlet_name} (${r.outlet_code})` }))]}
            required
          />
          <Select
            label="Template Shift"
            value={form.shift_template_id}
            onChange={(e) => setForm({ ...form, shift_template_id: e.target.value })}
            options={[{ value: '', label: 'Pilih Shift' }, ...shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)})` }))]}
            required
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Hari</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setForm({ ...form, day_of_week: i })}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                    form.day_of_week === i
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : `border-slate-200 text-slate-600 hover:border-blue-300 ${i === 0 || i === 6 ? 'bg-rose-50' : 'bg-white'}`
                  }`}
                >
                  {DAY_SHORT[i]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Min. Staf" type="number" min="1" value={form.min_staff.toString()} onChange={(e) => setForm({ ...form, min_staff: parseInt(e.target.value) || 1 })} hint="Minimum karyawan yang harus hadir" />
            <Input label="Maks. Staf (opsional)" type="number" min="1" value={form.max_staff} onChange={(e) => setForm({ ...form, max_staff: e.target.value })} hint="Kosongkan jika tidak dibatasi" />
          </div>
          <Input label="Catatan (opsional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="cth. Prioritas staf senior" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
            <span className="text-sm text-slate-700">Jadwal aktif</span>
          </label>
        </div>
      </Modal>
    </>
  );
}

// ─── Shift Assignments ────────────────────────────────────────
function ShiftAssignmentsTab() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [filterOutlet, setFilterOutlet] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ employee_id: '', shift_template_id: '', effective_date: '', end_date: '' });
  // Bulk import
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<{ ok: any[]; skipped: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: a }, { data: e }, { data: s }, { data: o }] = await Promise.all([
      supabase.from('shift_assignments').select('*, employee:employees(full_name, employee_code), shift_template:shift_templates(name, start_time, end_time)').order('effective_date', { ascending: false }).limit(50),
      supabase.from('employees').select('id, full_name, employee_code, primary_outlet_id').eq('status', 'active').order('full_name'),
      supabase.from('shift_templates').select('id, name').eq('is_active', true).order('name'),
      supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
    ]);
    setAssignments((a as ShiftAssignment[]) ?? []);
    setEmployees((e as Employee[]) ?? []);
    setShifts(s ?? []);
    setOutlets(o ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filteredEmployees = filterOutlet ? employees.filter((em) => (em as any).primary_outlet_id === filterOutlet) : employees;

  const handleSave = async () => {
    if (!form.employee_id || !form.shift_template_id || !form.effective_date) return toast('error', 'Semua field wajib diisi');
    setSaving(true);
    const { error } = await supabase.from('shift_assignments').insert({ employee_id: form.employee_id, shift_template_id: form.shift_template_id, effective_date: form.effective_date, end_date: form.end_date || null });
    if (error) toast('error', 'Gagal', error.message); else { toast('success', 'Penugasan dibuat'); load(); setModalOpen(false); }
    setSaving(false);
  };

  // ─── Bulk import ─────────────────────────────────────────────
  const downloadTemplate = (ext: 'xlsx' | 'csv') => {
    const rows = [
      { employee_code: 'KAR-0001', shift_name: 'Shift Pagi', effective_date: '2026-08-10', end_date: '' },
    ];
    if (ext === 'csv') {
      const header = ['employee_code', 'shift_name', 'effective_date', 'end_date'];
      const csv = '\uFEFF' + [header.join(','), rows.map((r) => [r.employee_code, r.shift_name, r.effective_date, r.end_date].join(',')).join('\n')].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Template_Bulk_Jadwal.csv';
      a.click(); URL.revokeObjectURL(url);
      return;
    }
    import('xlsx').then((XLSX) => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Jadwal');
      XLSX.writeFile(wb, 'Template_Bulk_Jadwal.xlsx');
    });
  };

  const toDateStr = (v: any): string => {
    if (!v) return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
      return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    }
    const s = String(v).trim();
    const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m1) return `${m1[1]}-${String(m1[2]).padStart(2, '0')}-${String(m1[3]).padStart(2, '0')}`;
    const m2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m2) return `${m2[3]}-${String(m2[2]).padStart(2, '0')}-${String(m2[1]).padStart(2, '0')}`;
    return s;
  };

  const parseFile = async (file: File) => {
    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
      const empByCode = new Map(employees.map((em) => [em.employee_code, em.id]));
      const shiftByName = new Map(shifts.map((s) => [s.name.trim().toLowerCase(), s.id]));
      const ok: any[] = [];
      const skipped: string[] = [];
      raw.forEach((r: any, i: number) => {
        const empCode = String(r.employee_code ?? r['Kode Karyawan'] ?? '').trim();
        const shiftName = String(r.shift_name ?? r['Nama Shift'] ?? '').trim();
        const eff = toDateStr(r.effective_date ?? r['Berlaku Mulai']);
        const end = toDateStr(r.end_date ?? r['Berakhir']);
        const empId = empByCode.get(empCode);
        const shiftId = shiftByName.get(shiftName.toLowerCase());
        const line = `Baris ${i + 2}`;
        if (!empId) { skipped.push(`${line}: kode karyawan "${empCode || '-'}" tidak ditemukan`); return; }
        if (!shiftId) { skipped.push(`${line}: shift "${shiftName || '-'}" tidak ditemukan`); return; }
        if (!eff) { skipped.push(`${line}: tanggal berlaku wajib diisi`); return; }
        ok.push({ employee_id: empId, shift_template_id: shiftId, effective_date: eff, end_date: end || null });
      });
      setParseResult({ ok, skipped });
    } catch (err: any) {
      setParseResult({ ok: [], skipped: [`Gagal membaca file: ${err?.message ?? 'format tidak dikenali'}`] });
    }
    setImporting(false);
  };

  const runImport = async () => {
    if (!parseResult || parseResult.ok.length === 0) return;
    setImporting(true);
    const { error } = await supabase.from('shift_assignments').insert(parseResult.ok);
    setImporting(false);
    if (error) { toast('error', 'Import gagal', error.message); return; }
    toast('success', `${parseResult.ok.length} penugasan shift berhasil dibuat`);
    setImportOpen(false);
    setParseResult(null);
    if (fileRef.current) fileRef.current.value = '';
    load();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={filterOutlet}
            onChange={(e) => setFilterOutlet(e.target.value)}
            options={[{ value: '', label: 'Semua Outlet' }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]}
            className="w-52"
          />
          <span className="text-xs text-slate-400">{filteredEmployees.length} karyawan</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => downloadTemplate('xlsx')}><Download size={14} /> Template Excel</Button>
          <Button variant="outline" onClick={() => downloadTemplate('csv')}><Download size={14} /> Template CSV</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload size={14} /> Upload Bulk Jadwal</Button>
          <Button onClick={() => { setForm({ employee_id: '', shift_template_id: '', effective_date: new Date().toISOString().split('T')[0], end_date: '' }); setModalOpen(true); }}>
            <Plus size={16} /> Tugaskan Shift
          </Button>
        </div>
      </div>
      <Table loading={loading} rowKey={(a) => a.id} data={assignments} columns={[
        { key: 'employee', header: 'Karyawan', render: (a) => <div><p className="font-medium">{(a.employee as { full_name?: string })?.full_name}</p><p className="text-xs text-slate-400 font-mono">{(a.employee as { employee_code?: string })?.employee_code}</p></div> },
        { key: 'shift', header: 'Shift', render: (a) => <div><p className="font-medium">{(a.shift_template as { name?: string })?.name}</p><p className="text-xs text-slate-400 font-mono">{(a.shift_template as { start_time?: string })?.start_time?.substring(0, 5)} – {(a.shift_template as { end_time?: string })?.end_time?.substring(0, 5)}</p></div> },
        { key: 'effective_date', header: 'Berlaku Mulai', render: (a) => formatDate(a.effective_date) },
        { key: 'end_date', header: 'Berakhir', render: (a) => a.end_date ? formatDate(a.end_date) : <Badge className="bg-emerald-100 text-emerald-700">Ongoing</Badge> },
      ]} />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Tugaskan Shift" size="sm"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={saving} onClick={handleSave}>Tugaskan</Button></>}
      >
        <div className="space-y-4">
          <Select label="Karyawan" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            options={[{ value: '', label: 'Pilih Karyawan' }, ...filteredEmployees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))]}
            required
            hint={filterOutlet ? `Menampilkan ${filteredEmployees.length} karyawan outlet terpilih` : `${filteredEmployees.length} karyawan aktif`}
          />
          <Select label="Shift" value={form.shift_template_id} onChange={(e) => setForm({ ...form, shift_template_id: e.target.value })} options={[{ value: '', label: 'Pilih Shift' }, ...shifts.map((s) => ({ value: s.id, label: s.name }))]} required />
          <Input label="Berlaku Mulai" type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} required />
          <Input label="Berakhir (opsional)" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} hint="Kosongkan untuk jadwal berkelanjutan" />
        </div>
      </Modal>

      {/* Bulk import modal */}
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Upload Bulk Jadwal" size="md"
        footer={<>
          <Button variant="outline" onClick={() => setImportOpen(false)}>Tutup</Button>
          {parseResult && parseResult.ok.length > 0 && (
            <Button loading={importing} onClick={runImport}>Import {parseResult.ok.length} baris</Button>
          )}
        </>}
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
            <p className="font-semibold mb-1">Format file (.xlsx / .csv)</p>
            <p className="text-xs">Kolom: <code className="font-mono">employee_code</code>, <code className="font-mono">shift_name</code>, <code className="font-mono">effective_date</code>, <code className="font-mono">end_date</code> (opsional).</p>
            <p className="text-xs mt-1">Tanggal: <code className="font-mono">YYYY-MM-DD</code> atau <code className="font-mono">DD/MM/YYYY</code>. Unduh template untuk contoh.</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" id="bulk-shift-file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
          <Button variant="outline" loading={importing} className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Pilih File Jadwal
          </Button>
          {parseResult && (
            <div className="space-y-2 text-xs">
              <p className="font-semibold text-emerald-600">{parseResult.ok.length} baris siap diimport</p>
              {parseResult.skipped.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-amber-700 max-h-40 overflow-y-auto">
                  <p className="font-semibold mb-1">Dilewati ({parseResult.skipped.length}):</p>
                  {parseResult.skipped.map((msg, i) => <p key={i}>• {msg}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

// ─── Page ──────────────────────────────────────────────────────
export function ShiftsPage() {
  const [activeTab, setActiveTab] = useState('outlet_schedule');
  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'outlet_schedule', label: 'Jadwal per Outlet', icon: <Store size={14} /> },
          { id: 'assignments',     label: 'Penugasan Karyawan', icon: <Users size={14} /> },
          { id: 'templates',       label: 'Template Shift', icon: <Calendar size={14} /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === 'outlet_schedule' && <OutletScheduleTab />}
      {activeTab === 'assignments'     && <ShiftAssignmentsTab />}
      {activeTab === 'templates'       && <ShiftTemplatesTab />}
    </div>
  );
}
