import { useEffect, useState } from 'react';
import * as React from 'react';
import { BarChart3, Users, Calendar, TrendingUp, Download, Search, FileText, DollarSign, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '../ui/Card';

import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { formatCurrency, MONTH_NAMES, STATUS_COLORS, haversineDistance } from '../../lib/utils';

// ─── Mini bar chart ────────────────────────────────────────────
function MiniBar({ value, max, color = 'bg-blue-500', label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-slate-500 w-28 truncate shrink-0">{label}</span>}
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-10 text-right shrink-0">{value}</span>
    </div>
  );
}

// ─── KPI Stat Card ─────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`${color} rounded-2xl p-5`}>
      <div className="flex justify-between items-start mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
        <div className="w-8 h-8 rounded-xl bg-white/30 flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Tab: Ringkasan ───────────────────────────────────────────
function OverviewTab({ companyId, year, month }: { companyId: string; year: number; month: number }) {
  const [data, setData] = useState<{
    totalEmp: number; activeEmp: number; outletCount: number;
    presentToday: number; lateToday: number;
    attByDate: { date: string; present: number; late: number; absent: number }[];
    deptCount: { dept: string; count: number }[];
    outletAtt: { outlet: string; rate: number; total: number }[];
    approvedOT: number; netPayroll: number;
  } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd   = `${year}-${String(month).padStart(2, '0')}-31`;
    const todayStr    = new Date().toISOString().split('T')[0];

    // First fetch employee IDs for this company, then use the array in .in()
    supabase.from('employees').select('id').eq('company_id', companyId).then(({ data: empIds }) => {
      const ids = (empIds ?? []).map((e) => e.id);
      return Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active'),
        supabase.from('outlets').select('id', { count: 'exact', head: true }),
        ids.length > 0
          ? supabase.from('attendance').select('status').eq('attendance_date', todayStr).in('employee_id', ids)
          : Promise.resolve({ data: [] as any[] }),
        ids.length > 0
          ? supabase.from('attendance').select('attendance_date, status')
              .gte('attendance_date', periodStart).lte('attendance_date', periodEnd)
              .in('employee_id', ids)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('employees').select('department').eq('company_id', companyId),
        ids.length > 0
          ? supabase.from('overtime_requests').select('duration_hours')
              .gte('overtime_date', periodStart).lte('overtime_date', periodEnd).eq('status', 'approved')
              .in('employee_id', ids)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('payroll_runs').select('total_net').eq('company_id', companyId).eq('period_year', year).eq('period_month', month),
      ]);
    }).then(([
      { count: total }, { count: active }, { count: outletCnt },
      { data: todayAtt }, { data: attData },
      { data: empDept }, { data: otData }, { data: payData },
    ]) => {
      const presentToday = (todayAtt ?? []).filter((a) => ['present','overtime'].includes(a.status)).length;
      const lateToday    = (todayAtt ?? []).filter((a) => a.status === 'late').length;

      // Attendance by date
      const dateMap: Record<string, { present: number; late: number; absent: number }> = {};
      (attData ?? []).forEach((a) => {
        if (!dateMap[a.attendance_date]) dateMap[a.attendance_date] = { present: 0, late: 0, absent: 0 };
        if (['present','overtime'].includes(a.status)) dateMap[a.attendance_date].present++;
        else if (a.status === 'late') dateMap[a.attendance_date].late++;
      });
      const attByDate = Object.entries(dateMap).sort(([a], [b]) => a < b ? -1 : 1).slice(-14).map(([date, v]) => ({ date, ...v }));

      // Dept headcount
      const deptMap: Record<string, number> = {};
      (empDept ?? []).forEach((e) => { const d = e.department ?? 'Lainnya'; deptMap[d] = (deptMap[d] ?? 0) + 1; });
      const deptCount = Object.entries(deptMap).map(([dept, count]) => ({ dept, count })).sort((a, b) => b.count - a.count);

      const approvedOT = (otData ?? []).reduce((s, o) => s + (o.duration_hours ?? 0), 0);
      const netPayroll = (payData ?? []).reduce((s, p) => s + (p.total_net ?? 0), 0);

      setData({ totalEmp: total ?? 0, activeEmp: active ?? 0, outletCount: outletCnt ?? 0, presentToday, lateToday, attByDate, deptCount, outletAtt: [], approvedOT, netPayroll });
    });
  }, [companyId, year, month]);

  if (!data) return <div className="text-center py-16 text-slate-400">Memuat data...</div>;

  const maxDept = Math.max(...data.deptCount.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={<Users size={16} />} label="Total Karyawan" value={String(data.totalEmp)} sub={`${data.activeEmp} aktif`} color="bg-gradient-to-br from-blue-600 to-blue-700 text-white" />
        <StatCard icon={<Calendar size={16} />} label="Hadir Hari Ini" value={String(data.presentToday)} sub={data.lateToday > 0 ? `${data.lateToday} terlambat` : 'Tepat waktu'} color="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white" />
        <StatCard icon={<BarChart3 size={16} />} label="Outlet" value={String(data.outletCount)} color="bg-gradient-to-br from-slate-700 to-slate-800 text-white" />
        <StatCard icon={<Clock size={16} />} label="Jam Lembur" value={`${data.approvedOT}j`} sub={`Periode ${MONTH_NAMES[month - 1]}`} color="bg-gradient-to-br from-amber-500 to-amber-600 text-white" />
        <StatCard icon={<DollarSign size={16} />} label="Net Payroll" value={data.netPayroll > 0 ? formatCurrency(data.netPayroll) : '-'} sub={`${MONTH_NAMES[month - 1]} ${year}`} color="bg-gradient-to-br from-teal-600 to-teal-700 text-white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance trend */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp size={16} className="text-blue-600" />
              <h3 className="font-semibold text-slate-900">Tren Kehadiran (14 Hari Terakhir)</h3>
            </div>
            <div className="space-y-2">
              {data.attByDate.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Tidak ada data kehadiran</p>}
              {data.attByDate.map((d) => {
                const total = d.present + d.late;
                const maxV = Math.max(...data.attByDate.map((x) => x.present + x.late), 1);
                return (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 w-20 shrink-0">{d.date.slice(5)}</span>
                    <div className="flex-1 flex gap-0.5 rounded-full overflow-hidden h-5">
                      <div className="bg-emerald-500 flex items-center justify-end pr-1 text-white text-[10px] font-bold" style={{ width: `${(d.present / (maxV || 1)) * 100}%`, minWidth: d.present > 0 ? '16px' : '0' }}>{d.present > 0 ? d.present : ''}</div>
                      <div className="bg-amber-400" style={{ width: `${(d.late / (maxV || 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right shrink-0">{total}</span>
                  </div>
                );
              })}
              <div className="flex gap-4 pt-2 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Hadir</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Terlambat</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Dept headcount */}
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <Users size={16} className="text-blue-600" />
            <h3 className="font-semibold text-slate-900">Headcount per Departemen</h3>
          </div>
          <div className="space-y-3">
            {data.deptCount.map((d) => <MiniBar key={d.dept} label={d.dept} value={d.count} max={maxDept} color="bg-blue-500" />)}
            {data.deptCount.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Tidak ada data</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Laporan Payroll ──────────────────────────────────────
function PayrollReportTab({ companyId, year, month }: { companyId: string; year: number; month: number }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!companyId) return;
    supabase.from('payroll_runs').select('*').eq('company_id', companyId).eq('period_year', year).eq('period_month', month).then(({ data }) => {
      setRuns(data ?? []);
      if (data?.length) setSelectedRun(data[0].id);
    });
  }, [companyId, year, month]);

  useEffect(() => {
    if (!selectedRun) return;
    setLoading(true);
    supabase.from('payroll_items')
      .select('*, employee:employees(full_name, employee_code, job_title, department, salary_scheme, daily_rate, basic_salary, primary_outlet:outlets!primary_outlet_id(name))')
      .eq('payroll_run_id', selectedRun)
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [selectedRun]);

  const filtered = items.filter((i) => {
    const emp = i.employee as any;
    return !search || emp?.full_name?.toLowerCase().includes(search.toLowerCase()) || emp?.employee_code?.includes(search);
  });

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const { data: allLines } = await supabase.from('payroll_item_lines').select('*').in('payroll_item_id', items.map((i) => i.id));

    const rows = items.map((i) => {
      const emp = i.employee as any;
      const empLines = (allLines ?? []).filter((l: any) => l.payroll_item_id === i.id);
      const gl = (name: string) => Math.abs(empLines.find((l: any) => l.component_name === name)?.amount ?? 0);
      return {
        'Kode': emp?.employee_code, 'Nama': emp?.full_name, 'Jabatan': emp?.job_title,
        'Departemen': emp?.department, 'Outlet': emp?.primary_outlet?.name,
        'Skema Gaji': emp?.salary_scheme === 'daily' ? 'Harian' : 'Bulanan',
        'Tarif': emp?.salary_scheme === 'daily' ? i.basic_salary : emp?.basic_salary,
        'Hari Kerja': i.work_days, 'Hari Hadir': i.present_days, 'Terlambat': i.late_days,
        'Absen': i.absent_days, 'Jam Lembur': i.overtime_hours,
        'Gaji Pokok/Harian': empLines.find((l: any) => l.component_name?.startsWith('Gaji'))?.amount ?? 0,
        'Tunjangan Transport': gl('Tunjangan Transport'),
        'Tunjangan Makan': gl('Tunjangan Makan'),
        'Tunjangan Jabatan': gl('Tunjangan Jabatan'),
        'Lembur': gl('Lembur'),
        'Insentif Penjualan': gl('Insentif Penjualan'),
        'Insentif Prestasi': gl('Insentif Prestasi'),
        'Insentif Kehadiran': gl('Insentif Kehadiran'),
        'Total Penghasilan': i.total_earnings,
        'BPJS Kesehatan': gl('BPJS Kesehatan'),
        'BPJS TK JHT': gl('BPJS TK JHT'),
        'PPh 21': gl('PPh 21 (Est.)'),
        'Potongan Absen': gl('Potongan Absen'),
        'Potongan Terlambat': gl('Potongan Terlambat'),
        'Total Potongan': i.total_deductions,
        'Take Home Pay': i.net_salary,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    XLSX.writeFile(wb, `Laporan_Payroll_${MONTH_NAMES[month - 1]}_${year}.xlsx`);
  };

  const run = runs.find((r) => r.id === selectedRun);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3 items-center flex-wrap">
          {runs.length > 1 && (
            <select value={selectedRun} onChange={(e) => setSelectedRun(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {runs.map((r) => <option key={r.id} value={r.id}>Run #{r.id.slice(-6)} — {r.status}</option>)}
            </select>
          )}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari karyawan..."
              className="border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
          </div>
        </div>
        <Button variant="outline" onClick={exportExcel} disabled={!items.length}>
          <Download size={14} /> Export Excel
        </Button>
      </div>

      {/* Run summary */}
      {run && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { l: 'Karyawan', v: run.employee_count, fmt: (x: number) => String(x) },
            { l: 'Total Penghasilan', v: run.total_gross, fmt: formatCurrency },
            { l: 'Total Potongan',   v: run.total_deductions, fmt: formatCurrency },
            { l: 'Take Home Pay',   v: run.total_net, fmt: formatCurrency },
          ].map((s) => (
            <div key={s.l} className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 font-medium">{s.l}</p>
              <p className="font-bold text-slate-900 text-lg mt-0.5">{s.fmt(s.v)}</p>
            </div>
          ))}
        </div>
      )}

      {!run && !loading && (
        <div className="text-center py-16">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Belum ada payroll run untuk periode ini</p>
          <p className="text-slate-400 text-sm mt-1">Buat dan proses payroll di menu Penggajian terlebih dahulu.</p>
        </div>
      )}

      {run && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Karyawan', 'Outlet', 'Skema', 'Kehadiran', 'Penghasilan', 'Insentif', 'Potongan', 'Take Home'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && <tr><td colSpan={8} className="text-center py-10 text-slate-400">Memuat...</td></tr>}
              {filtered.map((i) => {
                const emp = i.employee as any;
                const isDaily = emp?.salary_scheme === 'daily';
                return (
                  <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{emp?.full_name}</p>
                      <p className="text-xs text-slate-400 font-mono">{emp?.employee_code}</p>
                      <p className="text-xs text-slate-500">{emp?.job_title}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{emp?.primary_outlet?.name ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge className={isDaily ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}>
                        {isDaily ? 'Harian' : 'Bulanan'}
                      </Badge>
                      <p className="text-xs text-slate-400 mt-1">
                        {isDaily ? `${formatCurrency(i.basic_salary)}/hari (Tarif Area)` : formatCurrency(emp?.basic_salary)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm"><span className="text-emerald-600 font-medium">{i.present_days}</span> hadir</p>
                      {i.late_days > 0 && <p className="text-xs text-amber-600">{i.late_days} terlambat</p>}
                      {i.absent_days > 0 && <p className="text-xs text-red-500">{i.absent_days} absen</p>}
                      {isDaily && <p className="text-xs text-blue-600">{i.present_days + i.late_days} hari dibayar</p>}
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-700">{formatCurrency(i.total_earnings)}</td>
                    <td className="px-4 py-3">
                      {/* incentive indicator */}
                      <p className="text-xs text-slate-500">Lihat slip detail</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-red-600">{formatCurrency(i.total_deductions)}</td>
                    <td className="px-4 py-3 font-bold text-blue-700">{formatCurrency(i.net_salary)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Absensi Per Karyawan ─────────────────────────────────
function AttendanceReportTab({ companyId, year, month }: { companyId: string; year: number; month: number }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterOutlet, setFilterOutlet] = useState('');
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [geoOutlets, setGeoOutlets] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd   = `${year}-${String(month).padStart(2, '0')}-31`;

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    // Fetch employees first, then use their IDs in the attendance query
    supabase.from('employees')
      .select('id, area_id, full_name, employee_code, job_title, department, salary_scheme, daily_rate, basic_salary, primary_outlet:outlets!primary_outlet_id(id, name)')
      .eq('company_id', companyId).eq('status', 'active').order('full_name')
      .then(({ data: emps }) => {
        setEmployees(emps ?? []);
        const ids = (emps ?? []).map((e) => e.id);
        return Promise.all([
          ids.length > 0
            ? supabase.from('attendance').select('employee_id, attendance_date, check_in_time, check_out_time, status, work_duration_minutes, check_in_geofence, check_in_lat, check_in_lng, check_out_lat, check_out_lng').gte('attendance_date', periodStart).lte('attendance_date', periodEnd).in('employee_id', ids)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
          supabase.from('area_salary_rates').select('*, area:areas(id)').eq('is_active', true),
          supabase.from('outlets').select('id, name, latitude, longitude, geofence_radius_meters'),
        ]);
      })
      .then(([{ data: att }, { data: outs }, { data: rates }, { data: geoOutlets }]) => {
        setAttendance(att ?? []);
        setOutlets(outs ?? []);
        setRates(rates ?? []);
        setGeoOutlets(geoOutlets ?? []);
        setLoading(false);
      });
  }, [companyId, year, month]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows: any[] = [];

    employees.filter((e) => {
      if (filterOutlet && e.primary_outlet?.id !== filterOutlet) return false;
      if (search && !e.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).forEach((emp) => {
      const empAtt = attendance.filter((a) => a.employee_id === emp.id);
      const present  = empAtt.filter((a) => ['present','overtime'].includes(a.status)).length;
      const late     = empAtt.filter((a) => a.status === 'late').length;
      const absent   = empAtt.filter((a) => a.status === 'absent').length;
      const totalMin = empAtt.reduce((s, a) => s + (a.work_duration_minutes ?? 0), 0);
      const outside  = empAtt.filter((a) => a.check_in_geofence === 'outside').length;

      rows.push({
        'Kode': emp.employee_code, 'Nama': emp.full_name, 'Jabatan': emp.job_title,
        'Departemen': emp.department, 'Outlet': emp.primary_outlet?.name,
        'Skema': emp.salary_scheme === 'daily' ? 'Harian' : 'Bulanan',
        'Total Records': empAtt.length, 'Hadir': present, 'Terlambat': late,
        'Absen': absent, 'Di Luar Geofence': outside,
        'Total Jam Kerja': Math.round(totalMin / 60 * 10) / 10,
        'Rata-rata Jam/Hari': empAtt.length > 0 ? Math.round(totalMin / empAtt.length / 60 * 10) / 10 : 0,
      });

      // Detail per hari
      empAtt.sort((a, b) => a.attendance_date < b.attendance_date ? -1 : 1).forEach((a) => {
        rows.push({
          'Kode': '',
          'Nama': `  ${a.attendance_date}`,
          'Jabatan': a.status,
          'Departemen': a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString('id-ID') : '-',
          'Outlet': a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString('id-ID') : '-',
          'Skema': a.work_duration_minutes ? `${Math.floor(a.work_duration_minutes / 60)}j ${a.work_duration_minutes % 60}m` : '-',
          'Total Records': '',
          'Hadir': '',
          'Terlambat': '',
          'Absen': '',
          'Di Luar Geofence': a.check_in_geofence,
          'Lokasi Masuk': locExport(a.check_in_lat, a.check_in_lng),
          'Lokasi Keluar': locExport(a.check_out_lat, a.check_out_lng),
          'Total Jam Kerja': '',
          'Rata-rata Jam/Hari': '',
        });
      });
      rows.push({});
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Absensi Per Karyawan');
    XLSX.writeFile(wb, `Laporan_Absensi_${MONTH_NAMES[month - 1]}_${year}.xlsx`);
  };

  const filtered = employees.filter((e) => {
    if (filterOutlet && e.primary_outlet?.id !== filterOutlet) return false;
    if (search && !e.full_name.toLowerCase().includes(search.toLowerCase()) && !e.employee_code.includes(search)) return false;
    return true;
  });

  // Tarif harian efektif: mengikuti Tarif Area (area + jabatan), fallback ke tarif lama karyawan
  const effectiveRate = (emp: any) => {
    const matches = (rates ?? []).filter((r: any) => {
      const areaId = (r.area as { id?: string })?.id;
      return areaId === emp.area_id && (!r.job_title || r.job_title === emp.job_title);
    });
    if (matches.length > 0) {
      return matches.find((r: any) => r.job_title === emp.job_title)?.daily_rate ?? matches[0].daily_rate;
    }
    return emp.daily_rate ?? 0;
  };

  // Format koordinat lokasi (lat/lng) untuk tampilan & export
  const fmtCoord = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v).toFixed(6));
  const coordText = (lat: any, lng: any) => (fmtCoord(lat) && fmtCoord(lng) ? `${fmtCoord(lat)}, ${fmtCoord(lng)}` : '');

  // Petakan koordinat ke outlet: prioritas outlet yang radius-nya mencakup titik, fallback ke outlet terdekat
  const locationInfo = (lat: any, lng: any) => {
    if (!fmtCoord(lat) || !fmtCoord(lng)) return null;
    const latN = Number(lat), lngN = Number(lng);
    const ranked = (geoOutlets ?? [])
      .filter((o: any) => o.latitude != null && o.longitude != null)
      .map((o: any) => ({
        outlet: o,
        dist: haversineDistance(latN, lngN, Number(o.latitude), Number(o.longitude)),
      }))
      .sort((a: any, b: any) => a.dist - b.dist);
    if (!ranked.length) return null;
    const inside = ranked.find((r: any) => r.dist <= (r.outlet.geofence_radius_meters ?? 300));
    const nearest = inside ?? ranked[0];
    return { outlet: nearest.outlet, dist: nearest.dist, inside: !!inside };
  };

  const locExport = (lat: any, lng: any) => {
    const loc = locationInfo(lat, lng);
    const coords = coordText(lat, lng);
    const base = loc ? (loc.inside ? loc.outlet.name : `${loc.outlet.name} (≈${Math.round(loc.dist)}m)`) : '';
    return [base, coords].filter(Boolean).join(' - ');
  };

  const LocationCell = (lat: any, lng: any) => {
    const loc = locationInfo(lat, lng);
    if (!loc) return <span className="text-slate-300">-</span>;
    return (
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className={`text-[11px] font-medium truncate ${loc.inside ? 'text-emerald-700' : 'text-amber-700'}`}>
          {loc.outlet.name}{!loc.inside && ` · ≈${Math.round(loc.dist)}m`}
        </span>
        <a
          href={`https://www.google.com/maps?q=${fmtCoord(lat)},${fmtCoord(lng)}`}
          target="_blank" rel="noreferrer"
          className="font-mono text-blue-600 hover:underline text-[10px] truncate"
          title="Buka di Google Maps"
        >
          {fmtCoord(lat)}, {fmtCoord(lng)}
        </a>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari karyawan..."
              className="border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
          </div>
          <select value={filterOutlet} onChange={(e) => setFilterOutlet(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Semua Outlet</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <Button variant="outline" onClick={exportExcel} disabled={!employees.length}>
          <Download size={14} /> Export Excel (Detail)
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['Karyawan', 'Outlet', 'Skema', 'Hadir', 'Terlambat', 'Absen', 'Total Jam', 'Geofence OK', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && <tr><td colSpan={9} className="text-center py-10 text-slate-400">Memuat data...</td></tr>}
            {filtered.map((emp) => {
              const empAtt = attendance.filter((a) => a.employee_id === emp.id);
              const present  = empAtt.filter((a) => ['present','overtime'].includes(a.status)).length;
              const late     = empAtt.filter((a) => a.status === 'late').length;
              const absent   = empAtt.filter((a) => a.status === 'absent').length;
              const totalMin = empAtt.reduce((s: number, a: any) => s + (a.work_duration_minutes ?? 0), 0);
              const insideGeo = empAtt.filter((a) => a.check_in_geofence === 'inside').length;
              const geoRate  = empAtt.length > 0 ? Math.round(insideGeo / empAtt.length * 100) : 0;
              const attRate  = empAtt.length > 0 ? Math.round((present + late) / empAtt.length * 100) : 0;
              const isExpanded = expanded === emp.id;

              return (
                <React.Fragment key={emp.id}>
                  <tr className={`hover:bg-slate-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                    onClick={() => setExpanded(isExpanded ? null : emp.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown size={14} className="text-blue-500" /> : <ChevronRight size={14} className="text-slate-400" />}
                        <div>
                          <p className="font-semibold text-slate-900">{emp.full_name}</p>
                          <p className="text-xs text-slate-400 font-mono">{emp.employee_code} · {emp.job_title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{emp.primary_outlet?.name ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge className={emp.salary_scheme === 'daily' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}>
                        {emp.salary_scheme === 'daily' ? `Harian ${formatCurrency(effectiveRate(emp))}` : 'Bulanan'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-emerald-600 text-base">{present}</span>
                      <span className="text-xs text-slate-400 ml-1">hari</span>
                    </td>
                    <td className="px-4 py-3">
                      {late > 0 ? <span className="font-medium text-amber-600">{late}</span> : <span className="text-slate-300">0</span>}
                    </td>
                    <td className="px-4 py-3">
                      {absent > 0 ? <span className="font-medium text-red-500">{absent}</span> : <span className="text-emerald-500">0</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {Math.floor(totalMin / 60)}j {totalMin % 60}m
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${geoRate}%` }} />
                        </div>
                        <span className="text-xs text-slate-600">{geoRate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg ${attRate >= 90 ? 'bg-emerald-100 text-emerald-700' : attRate >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                        {attRate}%
                      </span>
                    </td>
                  </tr>

                  {/* Expanded daily detail */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="px-8 pb-3 bg-blue-50">
                        <div className="bg-white rounded-xl border border-blue-100 overflow-hidden mt-1">
                          <div className="grid grid-cols-9 text-xs font-semibold text-slate-500 px-4 py-2 border-b border-slate-100 bg-slate-50">
                            <span>Tanggal</span><span>Masuk</span><span>Keluar</span><span>Durasi</span><span>Status</span><span>Geofence</span><span className="col-span-2">Lokasi Masuk</span><span className="col-span-2">Lokasi Keluar</span>
                          </div>
                          {empAtt.sort((a: any, b: any) => a.attendance_date < b.attendance_date ? -1 : 1).map((a: any) => (
                            <div key={a.attendance_date} className="grid grid-cols-9 text-xs px-4 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50">
                              <span className="font-mono text-slate-600">{a.attendance_date}</span>
                              <span className="font-mono font-medium">{a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                              <span className="font-mono text-slate-500">{a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                              <span>{a.work_duration_minutes ? `${Math.floor(a.work_duration_minutes / 60)}j ${a.work_duration_minutes % 60}m` : '-'}</span>
                              <span><Badge className={`${STATUS_COLORS[a.status]} text-[10px]`}>{a.status}</Badge></span>
                              <span className={a.check_in_geofence === 'outside' ? 'text-red-500 font-medium' : 'text-slate-400'}>{a.check_in_geofence ?? '-'}</span>
                              <span className="col-span-2">{LocationCell(a.check_in_lat, a.check_in_lng)}</span>
                              <span className="col-span-2">{LocationCell(a.check_out_lat, a.check_out_lng)}</span>
                            </div>
                          ))}
                          {empAtt.length === 0 && <div className="text-center py-4 text-slate-400 text-xs">Tidak ada data</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Reports Page ─────────────────────────────────────────
export function ReportsPage() {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear]   = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<'overview' | 'payroll' | 'attendance'>('overview');

  useEffect(() => {
    supabase.from('companies').select('id, name').eq('is_active', true).then(({ data }) => {
      setCompanies(data ?? []);
      if (data?.length) setSelectedCompany(data[0].id);
    });
  }, []);

  const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions  = [2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="space-y-6">
      {/* Top filter bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1">Perusahaan</label>
            <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1">Bulan</label>
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1">Tahun</label>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-slate-400">Periode</p>
            <p className="font-semibold text-slate-900">{MONTH_NAMES[month - 1]} {year}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: 'overview', label: 'Ringkasan', icon: <BarChart3 size={14} /> },
          { id: 'payroll',  label: 'Laporan Payroll', icon: <DollarSign size={14} /> },
          { id: 'attendance', label: 'Absensi Per Karyawan', icon: <Calendar size={14} /> },
        ].map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {selectedCompany && (
        <>
          {activeTab === 'overview'    && <OverviewTab    companyId={selectedCompany} year={year} month={month} />}
          {activeTab === 'payroll'     && <PayrollReportTab companyId={selectedCompany} year={year} month={month} />}
          {activeTab === 'attendance'  && <AttendanceReportTab companyId={selectedCompany} year={year} month={month} />}
        </>
      )}
    </div>
  );
}
