import { useEffect, useState } from 'react';
import { Plus, Play, CheckCircle, DollarSign, Eye, Settings, FileText, Printer, Edit2, Download, Search, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { Table } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { StatCard } from '../ui/Card';
import { Tabs } from '../ui/Tabs';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useToast } from '../ui/Toast';
import { formatDate, formatCurrency, STATUS_COLORS, MONTH_NAMES, daysInMonth, createNotification, INCENTIVE_TYPE_LABELS } from '../../lib/utils';
import type { PayrollRun, PayrollItem, PayrollComponent, Company, Employee, ComponentType, IncentiveRecord, IncentiveType, AreaSalaryRate, Area } from '../../lib/database.types';

// ─── Payroll Run Processor (supports daily & monthly salary + incentives) ──
async function processPayrollRun(runId: string, companyId: string, year: number, month: number): Promise<{ count: number; error: string | null }> {
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['active', 'probation', 'contract']);
  if (empErr || !employees?.length) return { count: 0, error: empErr?.message ?? 'Tidak ada karyawan aktif' };

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd   = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;

  const [
    { data: attendances },
    { data: overtimes },
    { data: absences },
    { data: components },
    { data: areaRates },
    { data: incentiveRecs },
  ] = await Promise.all([
    supabase.from('attendance').select('employee_id, status, work_duration_minutes')
      .gte('attendance_date', periodStart).lte('attendance_date', periodEnd)
      .in('employee_id', employees.map((e) => e.id)),
    supabase.from('overtime_requests').select('employee_id, duration_hours')
      .gte('overtime_date', periodStart).lte('overtime_date', periodEnd)
      .eq('status', 'approved').in('employee_id', employees.map((e) => e.id)),
    supabase.from('absence_requests').select('employee_id, absence_type, total_days')
      .gte('absence_date', periodStart).lte('absence_date', periodEnd)
      .eq('status', 'approved').in('employee_id', employees.map((e) => e.id)),
    supabase.from('payroll_components').select('*').eq('company_id', companyId).eq('is_active', true),
    supabase.from('area_salary_rates').select('*, area:areas(id)').eq('is_active', true),
    supabase.from('incentive_records')
      .select('*').eq('period_year', year).eq('period_month', month)
      .in('employee_id', employees.map((e) => e.id)),
  ]);

  const totalWorkDays = daysInMonth(year, month);
  let totalGross = 0, totalDeductions = 0, totalNet = 0;

  for (const emp of employees) {
    const empAtt = (attendances ?? []).filter((a) => a.employee_id === emp.id);
    const presentDays = empAtt.filter((a) => ['present', 'overtime'].includes(a.status)).length;
    const lateDays     = empAtt.filter((a) => a.status === 'late').length;
    const absentDays   = Math.max(totalWorkDays - presentDays - lateDays, 0);
    const overtimeHours = (overtimes ?? []).filter((o) => o.employee_id === emp.id)
      .reduce((s, o) => s + (o.duration_hours ?? 0), 0);
    const sickNoDays = (absences ?? []).filter((a) => a.employee_id === emp.id && a.absence_type === 'sakit_tanpa_surat')
      .reduce((s, a) => s + (a.total_days ?? 0), 0);
    const absenceDays = (absences ?? []).filter((a) => a.employee_id === emp.id)
      .reduce((s, a) => s + (a.total_days ?? 0), 0);

    // ── Determine effective daily rate ─────────────────────
    // 1. Check area-level override (match by area_id and optional job_title)
    let effectiveDailyRate = 0;
    const empAreaRates = (areaRates ?? []).filter((r) => {
      const areaId = (r.area as { id?: string })?.id;
      return areaId === emp.area_id && (!r.job_title || r.job_title === emp.job_title);
    });
    if (empAreaRates.length > 0) {
      // Most specific match: with job_title first
      const withTitle = empAreaRates.find((r) => r.job_title === emp.job_title);
      effectiveDailyRate = withTitle?.daily_rate ?? empAreaRates[0].daily_rate;
    } else if (emp.salary_scheme === 'daily') {
      effectiveDailyRate = emp.daily_rate ?? 0;
    } else {
      // monthly → derive daily rate
      effectiveDailyRate = totalWorkDays > 0 ? (emp.basic_salary ?? 0) / totalWorkDays : 0;
    }

    // ── Gross calculation ──────────────────────────────────
    let grossBase: number;
    if (emp.salary_scheme === 'daily') {
      // Daily: only pay for days worked (present + late counted as worked)
      grossBase = effectiveDailyRate * (presentDays + lateDays);
    } else {
      grossBase = emp.basic_salary ?? 0;
    }

    // Component allowances
    const componentLines: { name: string; type: ComponentType; amount: number; is_taxable: boolean }[] = [];
    for (const comp of (components ?? [])) {
      if (comp.component_type === 'earning') {
        componentLines.push({ name: comp.name, type: 'earning', amount: comp.default_amount, is_taxable: comp.is_taxable });
      }
    }
    const compEarnings = componentLines.reduce((s, c) => s + c.amount, 0);

    // Overtime: 1.5× hourly rate
    const hourlyRate = effectiveDailyRate / 8;
    const overtimePay = overtimeHours * hourlyRate * 1.5;

    // ── Incentives ─────────────────────────────────────────
    const empIncentives = (incentiveRecs ?? []).filter((r) => r.employee_id === emp.id);
    const salesIncentive = empIncentives.find((r) => r.incentive_type === 'sales')?.amount ?? 0;
    const achievementIncentive = empIncentives.find((r) => r.incentive_type === 'achievement')?.amount ?? 0;

    // Attendance incentive: Rp 150,000 if no absence + no late + no sick without doc
    let attendanceIncentive = 0;
    const attIncRec = empIncentives.find((r) => r.incentive_type === 'attendance');
    if (attIncRec) {
      attendanceIncentive = attIncRec.qualified ? attIncRec.amount : 0;
    } else {
      // Auto-calculate: qualify only if 0 absent + 0 late + 0 sakit_tanpa_surat
      const qualifies = absentDays === 0 && lateDays === 0 && sickNoDays === 0;
      attendanceIncentive = qualifies ? 150000 : 0;
      // Upsert the attendance incentive record
      await supabase.from('incentive_records').upsert({
        employee_id: emp.id,
        incentive_type: 'attendance',
        period_year: year,
        period_month: month,
        qualified: qualifies,
        absent_days: absentDays,
        late_days: lateDays,
        sick_no_doc_days: sickNoDays,
        amount: attendanceIncentive,
      }, { onConflict: 'employee_id,incentive_type,period_year,period_month' });
    }

    const totalIncentives = salesIncentive + achievementIncentive + attendanceIncentive;
    const totalEarnings = grossBase + compEarnings + overtimePay + totalIncentives;

    // ── Deductions ─────────────────────────────────────────
    const bpjsBase = emp.salary_scheme === 'daily' ? grossBase : (emp.basic_salary ?? 0);
    const bpjsKes = bpjsBase * (emp.bpjs_kes_employee ?? 0.01);
    const bpjsTk  = bpjsBase * (emp.bpjs_tk_jht_employee ?? 0.02);
    const annualGross = totalEarnings * 12;
    const ptkp = 54000000;
    const tax = annualGross > ptkp ? (annualGross - ptkp) * 0.05 / 12 : 0;

    // Monthly only: absent/late deductions (daily already excluded unpaid days from gross)
    const absentDeduction = emp.salary_scheme === 'monthly' && absentDays > 0 ? effectiveDailyRate * absentDays : 0;
    const lateDeduction   = emp.salary_scheme === 'monthly' && lateDays > 0 ? hourlyRate * lateDays : 0;

    const totalDed = absentDeduction + lateDeduction + bpjsKes + bpjsTk + tax;
    const net = totalEarnings - totalDed;

    totalGross      += totalEarnings;
    totalDeductions += totalDed;
    totalNet        += net;

    const { data: item } = await supabase.from('payroll_items').upsert({
      payroll_run_id: runId, employee_id: emp.id,
      basic_salary: emp.salary_scheme === 'daily' ? effectiveDailyRate : (emp.basic_salary ?? 0),
      total_earnings: parseFloat(totalEarnings.toFixed(2)),
      total_deductions: parseFloat(totalDed.toFixed(2)),
      total_bpjs_kes: parseFloat(bpjsKes.toFixed(2)),
      total_bpjs_tk: parseFloat(bpjsTk.toFixed(2)),
      total_tax: parseFloat(tax.toFixed(2)),
      net_salary: parseFloat(net.toFixed(2)),
      work_days: totalWorkDays,
      present_days: presentDays,
      absent_days: absentDays,
      late_days: lateDays,
      overtime_hours: parseFloat(overtimeHours.toFixed(2)),
      leave_days: absenceDays,
    }, { onConflict: 'payroll_run_id,employee_id' }).select('id').maybeSingle();

    if (item?.id) {
      await supabase.from('payroll_item_lines').delete().eq('payroll_item_id', item.id);
      const schemeLabel = emp.salary_scheme === 'daily'
        ? `Gaji Harian (${presentDays + lateDays} hari × ${formatCurrency(effectiveDailyRate)})`
        : 'Gaji Pokok (Bulanan)';
      const lines = [
        { payroll_item_id: item.id, component_name: schemeLabel, component_type: 'earning' as ComponentType, amount: parseFloat(grossBase.toFixed(2)), is_taxable: true },
        ...componentLines.map((c) => ({ payroll_item_id: item.id, component_name: c.name, component_type: c.type, amount: c.amount, is_taxable: c.is_taxable })),
        ...(overtimePay > 0 ? [{ payroll_item_id: item.id, component_name: 'Lembur', component_type: 'earning' as ComponentType, amount: parseFloat(overtimePay.toFixed(2)), is_taxable: true }] : []),
        ...(salesIncentive > 0 ? [{ payroll_item_id: item.id, component_name: 'Insentif Penjualan', component_type: 'earning' as ComponentType, amount: salesIncentive, is_taxable: false }] : []),
        ...(achievementIncentive > 0 ? [{ payroll_item_id: item.id, component_name: 'Insentif Prestasi', component_type: 'earning' as ComponentType, amount: achievementIncentive, is_taxable: false }] : []),
        ...(attendanceIncentive > 0 ? [{ payroll_item_id: item.id, component_name: 'Insentif Kehadiran', component_type: 'earning' as ComponentType, amount: attendanceIncentive, is_taxable: false }] : []),
        ...(absentDeduction > 0 ? [{ payroll_item_id: item.id, component_name: 'Potongan Absen', component_type: 'deduction' as ComponentType, amount: parseFloat((-absentDeduction).toFixed(2)), is_taxable: false }] : []),
        ...(lateDeduction > 0 ? [{ payroll_item_id: item.id, component_name: 'Potongan Terlambat', component_type: 'deduction' as ComponentType, amount: parseFloat((-lateDeduction).toFixed(2)), is_taxable: false }] : []),
        { payroll_item_id: item.id, component_name: 'BPJS Kesehatan', component_type: 'deduction' as ComponentType, amount: parseFloat((-bpjsKes).toFixed(2)), is_taxable: false },
        { payroll_item_id: item.id, component_name: 'BPJS TK JHT', component_type: 'deduction' as ComponentType, amount: parseFloat((-bpjsTk).toFixed(2)), is_taxable: false },
        ...(tax > 0 ? [{ payroll_item_id: item.id, component_name: 'PPh 21 (Est.)', component_type: 'deduction' as ComponentType, amount: parseFloat((-tax).toFixed(2)), is_taxable: false }] : []),
      ];
      if (lines.length > 0) await supabase.from('payroll_item_lines').insert(lines);
    }
  }

  await supabase.from('payroll_runs').update({
    total_gross: parseFloat(totalGross.toFixed(2)),
    total_deductions: parseFloat(totalDeductions.toFixed(2)),
    total_net: parseFloat(totalNet.toFixed(2)),
    employee_count: employees.length,
    status: 'review',
  }).eq('id', runId);

  return { count: employees.length, error: null };
}

// ─── Pay Slip Modal ─────────────────────────────────────────
function PaySlipModal({ item, periodLabel, onClose }: { item: PayrollItem; periodLabel: string; onClose: () => void }) {
  const [lines, setLines] = useState<{ component_name: string; component_type: string; amount: number }[]>([]);
  const [empDetail, setEmpDetail] = useState<{ salary_scheme?: string; daily_rate?: number; basic_salary?: number } | null>(null);
  useEffect(() => {
    Promise.all([
      supabase.from('payroll_item_lines').select('*').eq('payroll_item_id', item.id).order('component_type').order('amount', { ascending: false }),
      supabase.from('employees').select('salary_scheme, daily_rate, basic_salary').eq('id', item.employee_id).maybeSingle(),
    ]).then(([{ data: l }, { data: e }]) => {
      setLines(l ?? []);
      setEmpDetail(e);
    });
  }, [item.id]);

  const earnings   = lines.filter((l) => l.component_type === 'earning');
  const deductions = lines.filter((l) => l.component_type === 'deduction');
  const emp = item.employee as { full_name?: string; employee_code?: string; job_title?: string } | undefined;
  const isDaily = empDetail?.salary_scheme === 'daily';

  // Identify incentive lines
  const incentiveNames = ['Insentif Penjualan', 'Insentif Prestasi', 'Insentif Kehadiran'];
  const baseEarnings  = earnings.filter((l) => !incentiveNames.includes(l.component_name));
  const incentives    = earnings.filter((l) => incentiveNames.includes(l.component_name));
  const totalIncentives = incentives.reduce((s, l) => s + l.amount, 0);

  const printSlip = () => {
    const w = window.open('', '_blank')!;
    w.document.write(`<html><head><title>Slip Gaji</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px;max-width:600px;margin:0 auto}
    h2{font-size:16px}table{width:100%;border-collapse:collapse}td{padding:4px 8px}
    .right{text-align:right}.bold{font-weight:700}.earn{color:#047857}.ded{color:#dc2626}
    .border-top td{border-top:1px solid #e5e7eb;padding-top:8px}.net{background:#f1f5f9;padding:12px;border-radius:8px;display:flex;justify-content:space-between;margin-top:12px}
    hr{border:none;border-top:1px solid #e5e7eb;margin:8px 0}</style></head><body>
    <h2>SLIP GAJI — ${periodLabel}</h2>
    <table><tr><td><b>${emp?.full_name}</b></td><td class="right">${emp?.employee_code}</td></tr>
    <tr><td>${emp?.job_title ?? ''}</td><td class="right">${isDaily ? 'Gaji Harian' : 'Gaji Bulanan'}</td></tr></table>
    <hr/>
    <table><tr><td colspan="2"><b>Kehadiran</b></td></tr>
    <tr><td>Hari Kerja Periode</td><td class="right">${item.work_days} hari</td></tr>
    <tr><td>Hari Hadir</td><td class="right">${item.present_days} hari</td></tr>
    <tr><td>Terlambat</td><td class="right">${item.late_days} hari</td></tr>
    <tr><td>Absen/Tidak Hadir</td><td class="right">${item.absent_days} hari</td></tr>
    ${item.overtime_hours > 0 ? `<tr><td>Jam Lembur</td><td class="right">${item.overtime_hours} jam</td></tr>` : ''}
    </table><hr/>
    <table><tr><td colspan="2"><b>Penghasilan</b></td></tr>
    ${baseEarnings.map((l) => `<tr><td>${l.component_name}</td><td class="right earn">${formatCurrency(l.amount)}</td></tr>`).join('')}
    ${incentives.length > 0 ? `<tr><td colspan="2"><i>Insentif:</i></td></tr>` : ''}
    ${incentives.map((l) => `<tr><td>&nbsp;&nbsp;${l.component_name}</td><td class="right earn">${formatCurrency(l.amount)}</td></tr>`).join('')}
    <tr class="border-top"><td><b>Total Penghasilan</b></td><td class="right bold earn">${formatCurrency(item.total_earnings)}</td></tr>
    </table><hr/>
    <table><tr><td colspan="2"><b>Potongan</b></td></tr>
    ${deductions.map((l) => `<tr><td>${l.component_name}</td><td class="right ded">${formatCurrency(Math.abs(l.amount))}</td></tr>`).join('')}
    <tr class="border-top"><td><b>Total Potongan</b></td><td class="right bold ded">${formatCurrency(item.total_deductions)}</td></tr>
    </table>
    <div class="net"><b>TAKE HOME PAY</b><b style="font-size:16px;color:#1d4ed8">${formatCurrency(item.net_salary)}</b></div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <Modal isOpen onClose={onClose} title="Slip Gaji" size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Tutup</Button><Button variant="secondary" onClick={printSlip}><Printer size={14} /> Print</Button></>}
    >
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-blue-200 uppercase tracking-widest">Slip Gaji</p>
              <p className="text-xl font-bold mt-0.5">{periodLabel}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-lg">{emp?.full_name}</p>
              <p className="text-sm text-blue-200">{emp?.employee_code} · {emp?.job_title}</p>
              <span className="inline-block mt-1 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                {isDaily ? 'Gaji Harian' : 'Gaji Bulanan'}
              </span>
            </div>
          </div>

          {/* Attendance stats */}
          <div className="grid grid-cols-5 gap-2 pt-4 border-t border-blue-500">
            {[
              { label: 'Hari Kerja', val: item.work_days, unit: 'hari' },
              { label: 'Hadir', val: item.present_days, unit: 'hari', hi: true },
              { label: 'Terlambat', val: item.late_days, unit: 'hari', warn: item.late_days > 0 },
              { label: 'Absen', val: item.absent_days, unit: 'hari', bad: item.absent_days > 0 },
              { label: 'Lembur', val: item.overtime_hours, unit: 'jam' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-xs text-blue-200">{s.label}</p>
                <p className={`font-bold text-xl ${s.bad ? 'text-red-300' : s.warn ? 'text-yellow-300' : 'text-white'}`}>{s.val}</p>
                <p className="text-xs text-blue-300">{s.unit}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Daily rate info */}
        {isDaily && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
            <div className="text-blue-700">
              <span className="font-semibold">Skema Harian (Tarif Area): </span>
              {formatCurrency(item.basic_salary)} × {item.present_days + item.late_days} hari hadir
            </div>
            <span className="font-bold text-blue-800">{formatCurrency(item.basic_salary * (item.present_days + item.late_days))}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Earnings */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Penghasilan</p>
            <div className="space-y-2">
              {/* Base earnings */}
              {baseEarnings.map((l, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600">{l.component_name}</span>
                  <span className="font-medium text-emerald-700">{formatCurrency(l.amount)}</span>
                </div>
              ))}

              {/* Incentives grouped */}
              {incentives.length > 0 && (
                <>
                  <div className="border-t border-dashed border-slate-200 pt-2 mt-2">
                    <p className="text-xs text-slate-400 font-medium mb-1.5">Insentif</p>
                    {incentives.map((l, i) => (
                      <div key={i} className="flex justify-between text-sm mb-1.5">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className={`w-2 h-2 rounded-full inline-block ${
                            l.component_name === 'Insentif Kehadiran' ? 'bg-amber-400' :
                            l.component_name === 'Insentif Penjualan' ? 'bg-emerald-400' : 'bg-blue-400'
                          }`} />
                          {l.component_name}
                        </span>
                        <span className="font-medium text-emerald-700">{formatCurrency(l.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-slate-500 border-t border-slate-100 pt-1">
                      <span>Subtotal Insentif</span>
                      <span className="font-medium text-emerald-600">{formatCurrency(totalIncentives)}</span>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-between text-sm font-bold border-t-2 border-slate-200 pt-2 mt-2">
                <span className="text-slate-800">Total Penghasilan</span>
                <span className="text-emerald-700">{formatCurrency(item.total_earnings)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Potongan</p>
            <div className="space-y-2">
              {deductions.map((l, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600">{l.component_name}</span>
                  <span className="font-medium text-red-600">{formatCurrency(Math.abs(l.amount))}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t-2 border-slate-200 pt-2 mt-2">
                <span className="text-slate-800">Total Potongan</span>
                <span className="text-red-600">{formatCurrency(item.total_deductions)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net */}
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-5 flex justify-between items-center">
          <div>
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wider">Take Home Pay</p>
            <p className="text-slate-500 text-sm mt-0.5">{periodLabel}</p>
          </div>
          <p className="text-3xl font-bold text-blue-700">{formatCurrency(item.net_salary)}</p>
        </div>
      </div>
    </Modal>
  );
}

// ─── Payroll Items Table ────────────────────────────────────
function PayrollItemsModal({ run, onClose }: { run: PayrollRun; onClose: () => void }) {
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [slipItem, setSlipItem] = useState<PayrollItem | null>(null);
  const [search, setSearch] = useState('');
  const periodLabel = `${MONTH_NAMES[run.period_month - 1]} ${run.period_year}`;

  useEffect(() => {
    supabase.from('payroll_items')
      .select('*, employee:employees(full_name, employee_code, job_title, salary_scheme, daily_rate, basic_salary)')
      .eq('payroll_run_id', run.id)
      .order('employee_id')
      .then(({ data }) => { setItems((data as PayrollItem[]) ?? []); setLoading(false); });
  }, [run.id]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    // Fetch all item lines for full detail
    const { data: allLines } = await supabase
      .from('payroll_item_lines')
      .select('payroll_item_id, component_name, component_type, amount')
      .in('payroll_item_id', items.map((i) => i.id));

    const rows = items.map((i) => {
      const emp = i.employee as { full_name?: string; employee_code?: string; job_title?: string; salary_scheme?: string; daily_rate?: number; basic_salary?: number };
      const empLines = (allLines ?? []).filter((l) => l.payroll_item_id === i.id);
      const getLine = (name: string) => empLines.find((l) => l.component_name === name)?.amount ?? 0;
      return {
        'Kode': emp?.employee_code ?? '',
        'Nama': emp?.full_name ?? '',
        'Jabatan': emp?.job_title ?? '',
        'Skema': emp?.salary_scheme === 'daily' ? 'Harian' : 'Bulanan',
        'Tarif': emp?.salary_scheme === 'daily' ? (i.basic_salary ?? 0) : (emp?.basic_salary ?? 0),
        'Hari Kerja': i.work_days,
        'Hari Hadir': i.present_days,
        'Terlambat': i.late_days,
        'Absen': i.absent_days,
        'Jam Lembur': i.overtime_hours,
        'Gaji Pokok/Harian': empLines.find((l) => l.component_name.startsWith('Gaji'))?.amount ?? 0,
        'Tunjangan Transport': getLine('Tunjangan Transport'),
        'Tunjangan Makan': getLine('Tunjangan Makan'),
        'Tunjangan Jabatan': getLine('Tunjangan Jabatan'),
        'Lembur': getLine('Lembur'),
        'Insentif Penjualan': getLine('Insentif Penjualan'),
        'Insentif Prestasi': getLine('Insentif Prestasi'),
        'Insentif Kehadiran': getLine('Insentif Kehadiran'),
        'Total Penghasilan': i.total_earnings,
        'BPJS Kesehatan': Math.abs(getLine('BPJS Kesehatan')),
        'BPJS TK JHT': Math.abs(getLine('BPJS TK JHT')),
        'PPh 21': Math.abs(getLine('PPh 21 (Est.)')),
        'Potongan Absen': Math.abs(getLine('Potongan Absen')),
        'Potongan Terlambat': Math.abs(getLine('Potongan Terlambat')),
        'Total Potongan': i.total_deductions,
        'Take Home Pay': i.net_salary,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    XLSX.writeFile(wb, `Payroll_${periodLabel.replace(' ', '_')}.xlsx`);
  };

  const filtered = items.filter((i) => {
    const emp = i.employee as { full_name?: string; employee_code?: string };
    return !search || emp?.full_name?.toLowerCase().includes(search.toLowerCase()) || emp?.employee_code?.includes(search);
  });

  return (
    <Modal isOpen onClose={onClose} title={`Detail Payroll — ${periodLabel}`} size="2xl"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button variant="secondary" onClick={exportExcel}><Download size={14} /> Export Excel</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Karyawan', val: run.employee_count, cls: 'bg-slate-50 text-slate-800', fmt: (v: number) => v },
            { label: 'Total Penghasilan', val: run.total_gross, cls: 'bg-emerald-50 text-emerald-800', fmt: formatCurrency },
            { label: 'Total Potongan', val: run.total_deductions, cls: 'bg-red-50 text-red-800', fmt: formatCurrency },
            { label: 'Take Home Pay', val: run.total_net, cls: 'bg-blue-50 text-blue-800', fmt: formatCurrency },
          ].map((s) => (
            <div key={s.label} className={`${s.cls} rounded-xl p-3 text-center`}>
              <p className="text-xs font-medium opacity-70">{s.label}</p>
              <p className="font-bold text-base mt-0.5">{s.fmt(s.val)}</p>
            </div>
          ))}
        </div>

        <Input placeholder="Cari karyawan..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={14} />} className="w-64" />

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Karyawan', 'Skema', 'Kehadiran', 'Penghasilan', 'Insentif', 'Potongan', 'Take Home', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">Memuat...</td></tr>
              ) : filtered.map((item) => {
                const emp = item.employee as { full_name?: string; employee_code?: string; job_title?: string; salary_scheme?: string; daily_rate?: number; basic_salary?: number };
                const isDaily = emp?.salary_scheme === 'daily';
                const attRate = item.work_days > 0 ? Math.round((item.present_days + item.late_days) / item.work_days * 100) : 0;

  
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{emp?.full_name}</p>
                      <p className="text-xs text-slate-400 font-mono">{emp?.employee_code}</p>
                      <p className="text-xs text-slate-500">{emp?.job_title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isDaily ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isDaily ? 'Harian' : 'Bulanan'}
                      </span>
                      <p className="text-xs text-slate-500 mt-1">
                        {isDaily ? `${formatCurrency(item.basic_salary)}/hari (Tarif Area)` : formatCurrency(emp?.basic_salary ?? 0)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 w-20">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${attRate}%` }} />
                          </div>
                          <span className="text-xs text-slate-600 font-medium">{attRate}%</span>
                        </div>
                        <p className="text-xs text-slate-600">
                          <span className="text-emerald-600 font-medium">{item.present_days}</span> hadir ·{' '}
                          {item.late_days > 0 && <span className="text-amber-600">{item.late_days} tlmbt · </span>}
                          {item.absent_days > 0 && <span className="text-red-500">{item.absent_days} absen</span>}
                          {item.absent_days === 0 && item.late_days === 0 && <span className="text-emerald-500">Sempurna</span>}
                        </p>
                        {item.overtime_hours > 0 && <p className="text-xs text-blue-600">{item.overtime_hours}j lembur</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-emerald-700">{formatCurrency(item.total_earnings)}</p>
                      {isDaily && (
                        <p className="text-xs text-slate-400">
                          {item.present_days + item.late_days} hari × {formatCurrency(item.basic_salary)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* Quick incentive indicator — exact shown in slip */}
                      <button onClick={() => setSlipItem(item)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <FileText size={11} /> Lihat detail
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-red-600">{formatCurrency(item.total_deductions)}</p>
                      <p className="text-xs text-slate-400">BPJS + Pajak</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-blue-700 text-base">{formatCurrency(item.net_salary)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" onClick={() => setSlipItem(item)} title="Lihat slip gaji">
                        <Eye size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {slipItem && <PaySlipModal item={slipItem} periodLabel={periodLabel} onClose={() => setSlipItem(null)} />}
    </Modal>
  );
}

// ─── Payroll Components Tab ─────────────────────────────────
function PayrollComponentsTab() {
  const { toast } = useToast();
  const [components, setComponents] = useState<PayrollComponent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollComponent | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ company_id: '', name: '', code: '', component_type: 'earning', is_taxable: false, is_fixed: true, default_amount: '0' });

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: comp }] = await Promise.all([
      supabase.from('companies').select('id, name').eq('is_active', true),
      supabase.from('payroll_components').select('*, company:companies(name)').order('component_type').order('name'),
    ]);
    setCompanies(c ?? []);
    setComponents(comp ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.code || !form.company_id) return toast('error', 'All fields required');
    setSaving(true);
    const payload = { ...form, default_amount: parseFloat(form.default_amount) || 0, component_type: form.component_type as ComponentType };
    const op = editing ? supabase.from('payroll_components').update(payload).eq('id', editing.id) : supabase.from('payroll_components').insert(payload);
    const { error } = await op;
    if (error) { toast('error', 'Failed', error.message); } else { toast('success', editing ? 'Updated' : 'Created'); load(); setModalOpen(false); }
    setSaving(false);
  };

  const handleDelete = async (comp: PayrollComponent) => {
    if (!confirm(`Hapus komponen gaji "${comp.name}" (${comp.code})? Komponen ini tidak akan dipakai lagi pada proses payroll berikutnya.`)) return;
    const { error } = await supabase.from('payroll_components').delete().eq('id', comp.id);
    if (error) { toast('error', 'Gagal menghapus', error.message); } else { toast('success', 'Komponen gaji dihapus'); load(); }
  };

  const typeColors: Record<string, string> = { earning: 'bg-emerald-100 text-emerald-700', deduction: 'bg-red-100 text-red-700', benefit: 'bg-blue-100 text-blue-700' };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setEditing(null); setForm({ company_id: companies[0]?.id ?? '', name: '', code: '', component_type: 'earning', is_taxable: false, is_fixed: true, default_amount: '0' }); setModalOpen(true); }}>
          <Plus size={16} /> Add Component
        </Button>
      </div>
      <Table loading={loading} rowKey={(c) => c.id} data={components} columns={[
        { key: 'code', header: 'Code', render: (c) => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{c.code}</span> },
        { key: 'name', header: 'Name', render: (c) => <span className="font-medium">{c.name}</span> },
        { key: 'component_type', header: 'Type', render: (c) => <Badge className={typeColors[c.component_type]}>{c.component_type}</Badge> },
        { key: 'default_amount', header: 'Default Amount', render: (c) => formatCurrency(c.default_amount) },
        { key: 'is_taxable', header: 'Taxable', render: (c) => c.is_taxable ? <Badge className="bg-amber-100 text-amber-700">Yes</Badge> : <span className="text-slate-400 text-sm">No</span> },
        { key: 'is_active', header: 'Status', render: (c) => <Badge className={c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{c.is_active ? 'Active' : 'Inactive'}</Badge> },
        { key: 'actions', header: '', render: (c) => (
          <div className="flex items-center gap-0.5">
            <Button size="sm" variant="ghost" title="Edit komponen" onClick={() => { setEditing(c); setForm({ company_id: c.company_id, name: c.name, code: c.code, component_type: c.component_type, is_taxable: c.is_taxable, is_fixed: c.is_fixed, default_amount: c.default_amount.toString() }); setModalOpen(true); }}><Edit2 size={14} /></Button>
            <Button size="sm" variant="ghost" title="Hapus komponen" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(c)}><Trash2 size={14} /></Button>
          </div>
        ) },
      ]} />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Component' : 'Add Component'} size="sm"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Select label="Company" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} options={companies.map((c) => ({ value: c.id, label: c.name }))} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Type" value={form.component_type} onChange={(e) => setForm({ ...form, component_type: e.target.value })} options={[{ value: 'earning', label: 'Earning' }, { value: 'deduction', label: 'Deduction' }, { value: 'benefit', label: 'Benefit' }]} />
            <Input label="Default Amount (IDR)" type="number" value={form.default_amount} onChange={(e) => setForm({ ...form, default_amount: e.target.value })} />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" checked={form.is_taxable} onChange={(e) => setForm({ ...form, is_taxable: e.target.checked })} className="rounded" />
              <span>Taxable</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input type="checkbox" checked={form.is_fixed} onChange={(e) => setForm({ ...form, is_fixed: e.target.checked })} className="rounded" />
              <span>Fixed Amount</span>
            </label>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Main Payroll Page ──────────────────────────────────────
// ─── Incentives Tab ─────────────────────────────────────────
function IncentivesTab() {
  const { toast } = useToast();
  const [records, setRecords] = useState<IncentiveRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IncentiveRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [form, setForm] = useState({ employee_id: '', incentive_type: 'sales', amount: '', notes: '', period_year: String(currentYear), period_month: String(currentMonth) });

  const load = async () => {
    setLoading(true);
    const [{ data: recs }, { data: emps }] = await Promise.all([
      supabase.from('incentive_records').select('*, employee:employees(full_name, employee_code)').eq('period_year', filterYear).eq('period_month', filterMonth).order('incentive_type'),
      supabase.from('employees').select('id, full_name, employee_code').eq('status', 'active').order('full_name'),
    ]);
    setRecords((recs as IncentiveRecord[]) ?? []);
    setEmployees((emps as Employee[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [filterYear, filterMonth]);

  const handleSave = async () => {
    if (!form.employee_id || !form.amount) return toast('error', 'Karyawan dan nominal wajib diisi');
    setSaving(true);
    const payload = {
      employee_id: form.employee_id,
      incentive_type: form.incentive_type as IncentiveType,
      period_year: parseInt(form.period_year),
      period_month: parseInt(form.period_month),
      amount: parseFloat(form.amount),
      notes: form.notes || null,
      qualified: true,
    };
    const op = editing
      ? supabase.from('incentive_records').update(payload).eq('id', editing.id)
      : supabase.from('incentive_records').upsert(payload, { onConflict: 'employee_id,incentive_type,period_year,period_month' });
    const { error } = await op;
    if (error) { toast('error', 'Gagal', error.message); } else { toast('success', editing ? 'Diperbarui' : 'Disimpan'); load(); setModalOpen(false); }
    setSaving(false);
  };

  const typeColors: Record<string, string> = {
    sales: 'bg-emerald-100 text-emerald-700',
    achievement: 'bg-blue-100 text-blue-700',
    attendance: 'bg-amber-100 text-amber-700',
  };

  const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions = [2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }));

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2">
          <Select value={String(filterMonth)} onChange={(e) => setFilterMonth(parseInt(e.target.value))} options={monthOptions} className="w-36" />
          <Select value={String(filterYear)} onChange={(e) => setFilterYear(parseInt(e.target.value))} options={yearOptions} className="w-28" />
        </div>
        <Button onClick={() => { setEditing(null); setForm({ employee_id: '', incentive_type: 'sales', amount: '', notes: '', period_year: String(filterYear), period_month: String(filterMonth) }); setModalOpen(true); }}>
          <Plus size={16} /> Input Insentif Manual
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
        <strong>Insentif Kehadiran</strong> (Rp 150.000) dihitung otomatis saat proses payroll:
        diberikan jika dalam 1 periode tidak ada absen, terlambat, atau sakit tanpa surat dokter.
        <br />
        <strong>Insentif Penjualan & Prestasi</strong> diinput manual di sini sebelum proses payroll dijalankan.
      </div>

      <Table
        loading={loading}
        rowKey={(r) => r.id}
        data={records}
        emptyMessage="Belum ada insentif untuk periode ini"
        columns={[
          { key: 'employee', header: 'Karyawan', render: (r) => <div><p className="font-medium">{(r.employee as { full_name?: string })?.full_name}</p><p className="text-xs text-slate-400 font-mono">{(r.employee as { employee_code?: string })?.employee_code}</p></div> },
          { key: 'incentive_type', header: 'Jenis', render: (r) => <Badge className={typeColors[r.incentive_type]}>{INCENTIVE_TYPE_LABELS[r.incentive_type]}</Badge> },
          { key: 'amount', header: 'Nominal', render: (r) => <span className={`font-semibold ${r.amount > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(r.amount)}</span> },
          { key: 'qualified', header: 'Kualifikasi', render: (r) => r.qualified ? <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle size={10} className="inline mr-1" />Memenuhi</Badge> : <Badge className="bg-red-100 text-red-700">Tidak</Badge> },
          { key: 'notes', header: 'Catatan', render: (r) => <span className="text-sm text-slate-500">{r.notes ?? '-'}</span> },
          { key: 'actions', header: '', render: (r) => r.incentive_type !== 'attendance' ? <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setForm({ employee_id: r.employee_id, incentive_type: r.incentive_type, amount: r.amount.toString(), notes: r.notes ?? '', period_year: String(r.period_year), period_month: String(r.period_month) }); setModalOpen(true); }}><Edit2 size={14} /></Button> : null },
        ]}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Insentif' : 'Input Insentif Manual'} size="sm"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={saving} onClick={handleSave}>Simpan</Button></>}
      >
        <div className="space-y-4">
          <Select label="Karyawan" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} options={[{ value: '', label: 'Pilih karyawan' }, ...employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))]} required />
          <Select label="Jenis Insentif" value={form.incentive_type} onChange={(e) => setForm({ ...form, incentive_type: e.target.value })}
            options={[{ value: 'sales', label: 'Insentif Penjualan' }, { value: 'achievement', label: 'Insentif Prestasi' }]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Bulan" value={form.period_month} onChange={(e) => setForm({ ...form, period_month: e.target.value })} options={monthOptions} />
            <Select label="Tahun" value={form.period_year} onChange={(e) => setForm({ ...form, period_year: e.target.value })} options={yearOptions} />
          </div>
          <Input label="Nominal (IDR)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <Input label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}

// ─── Area Salary Rates Tab ───────────────────────────────────
function AreaSalaryRatesTab() {
  const { toast } = useToast();
  const [rates, setRates] = useState<AreaSalaryRate[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AreaSalaryRate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ area_id: '', job_title: '', daily_rate: '', effective_from: new Date().toISOString().split('T')[0] });

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from('area_salary_rates').select('*, area:areas(name, region:regions(name))').order('area_id'),
      supabase.from('areas').select('id, name').eq('is_active', true).order('name'),
    ]);
    setRates(r as AreaSalaryRate[] ?? []);
    setAreas(a as Area[] ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.area_id || !form.daily_rate) return toast('error', 'Area dan tarif harian wajib diisi');
    setSaving(true);
    const payload = { area_id: form.area_id, job_title: form.job_title || null, daily_rate: parseFloat(form.daily_rate), effective_from: form.effective_from };
    const op = editing ? supabase.from('area_salary_rates').update(payload).eq('id', editing.id) : supabase.from('area_salary_rates').insert(payload);
    const { error } = await op;
    if (error) { toast('error', 'Gagal', error.message); } else { toast('success', editing ? 'Diperbarui' : 'Ditambahkan'); load(); setModalOpen(false); }
    setSaving(false);
  };

  return (
    <>
      <div className="flex justify-between mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex-1 mr-4">
          Tarif area akan <strong>menggantikan</strong> tarif harian karyawan saat proses payroll.
          Jika job title diisi, hanya berlaku untuk karyawan dengan jabatan tersebut di area itu.
        </div>
        <Button onClick={() => { setEditing(null); setForm({ area_id: areas[0]?.id ?? '', job_title: '', daily_rate: '', effective_from: new Date().toISOString().split('T')[0] }); setModalOpen(true); }}>
          <Plus size={16} /> Tambah Tarif Area
        </Button>
      </div>
      <Table loading={loading} rowKey={(r) => r.id} data={rates} emptyMessage="Belum ada tarif area khusus" columns={[
        { key: 'area', header: 'Area', render: (r) => <div><p className="font-medium">{(r.area as { name?: string })?.name}</p><p className="text-xs text-slate-400">{(r.area as { region?: { name?: string } })?.region?.name}</p></div> },
        { key: 'job_title', header: 'Jabatan', render: (r) => r.job_title ? <Badge className="bg-slate-100 text-slate-700">{r.job_title}</Badge> : <span className="text-slate-400 text-sm">Semua Jabatan</span> },
        { key: 'daily_rate', header: 'Tarif Harian', render: (r) => <span className="font-bold text-blue-700">{formatCurrency(r.daily_rate)}</span> },
        { key: 'effective_from', header: 'Berlaku Sejak', render: (r) => formatDate(r.effective_from) },
        { key: 'is_active', header: 'Status', render: (r) => <Badge className={r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
        { key: 'actions', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setForm({ area_id: r.area_id, job_title: r.job_title ?? '', daily_rate: r.daily_rate.toString(), effective_from: r.effective_from }); setModalOpen(true); }}><Edit2 size={14} /></Button> },
      ]} />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Tarif Area' : 'Tambah Tarif Area'} size="sm"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button><Button loading={saving} onClick={handleSave}>Simpan</Button></>}
      >
        <div className="space-y-4">
          <Select label="Area" value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })} options={areas.map((a) => ({ value: a.id, label: a.name }))} required />
          <Input label="Jabatan (kosongkan = berlaku semua)" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="contoh: SPG, Barista" hint="Biarkan kosong agar berlaku untuk semua jabatan di area ini" />
          <Input label="Tarif Harian (IDR)" type="number" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} required />
          <Input label="Berlaku Sejak" type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}

export function PayrollPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [detailRun, setDetailRun] = useState<PayrollRun | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('runs');
  const [form, setForm] = useState({ company_id: '', period_month: String(new Date().getMonth() + 1), period_year: String(new Date().getFullYear()), notes: '' });

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('payroll_runs').select('*, company:companies(name)').order('period_year', { ascending: false }).order('period_month', { ascending: false }),
      supabase.from('companies').select('id, name').eq('is_active', true),
    ]);
    setRuns((r as PayrollRun[]) ?? []);
    setCompanies(c ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.company_id) return toast('error', 'Select a company');
    setSaving(true);
    const { error } = await supabase.from('payroll_runs').insert({
      company_id: form.company_id,
      period_month: parseInt(form.period_month),
      period_year: parseInt(form.period_year),
      notes: form.notes || null,
      created_by: user?.id,
      status: 'draft',
    });
    if (error) { toast('error', 'Failed', error.message); } else { toast('success', 'Payroll run created'); load(); setCreateModal(false); }
    setSaving(false);
  };

  const handleProcess = async (run: PayrollRun) => {
    if (!confirm(`Process payroll for ${MONTH_NAMES[run.period_month - 1]} ${run.period_year}? This will calculate salaries for all active employees.`)) return;
    setProcessing(run.id);
    const { count, error } = await processPayrollRun(run.id, run.company_id, run.period_year, run.period_month);
    if (error) { toast('error', 'Processing failed', error); }
    else { toast('success', `Processed ${count} employees successfully`); load(); }
    setProcessing(null);
  };

  const handleApprove = async (run: PayrollRun) => {
    if (!confirm('Approve this payroll run? It will be marked as approved and ready for payment.')) return;
    await supabase.from('payroll_runs').update({ status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() }).eq('id', run.id);
    toast('success', 'Payroll approved');
    load();
  };

  const handleMarkPaid = async (run: PayrollRun) => {
    if (!confirm('Mark payroll as paid? This action cannot be undone.')) return;
    await supabase.from('payroll_runs').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', run.id);

    // Notify all employees in this run
    const { data: items } = await supabase.from('payroll_items').select('employee:employees(user_id, full_name)').eq('payroll_run_id', run.id);
    for (const item of (items ?? [])) {
      const uid = (item.employee as { user_id?: string | null })?.user_id;
      if (uid) {
        createNotification(uid, 'payroll', 'Payroll Paid',
          `Your salary for ${MONTH_NAMES[run.period_month - 1]} ${run.period_year} has been processed.`);
      }
    }

    toast('success', 'Payroll marked as paid — employees notified');
    load();
  };

  const totalPaidYTD = runs.filter((r) => r.status === 'paid').reduce((s, r) => s + r.total_net, 0);
  const pendingRuns = runs.filter((r) => ['draft', 'review'].includes(r.status)).length;
  const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions = [2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Paid YTD" value={formatCurrency(totalPaidYTD)} icon={<DollarSign size={20} />} iconBg="bg-emerald-50 text-emerald-600" />
        <StatCard label="Total Employees" value={runs[0]?.employee_count ?? 0} icon={<DollarSign size={20} />} iconBg="bg-blue-50 text-blue-600" />
        <StatCard label="Pending Runs" value={pendingRuns} icon={<DollarSign size={20} />} iconBg="bg-amber-50 text-amber-600" />
      </div>

      <Tabs
        tabs={[
          { id: 'runs', label: 'Payroll Runs' },
          { id: 'incentives', label: 'Insentif', icon: <DollarSign size={14} /> },
          { id: 'area_rates', label: 'Tarif Area', icon: <Settings size={14} /> },
          { id: 'components', label: 'Komponen Gaji', icon: <Settings size={14} /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'runs' && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setCreateModal(true)}><Plus size={16} /> New Payroll Run</Button>
          </div>
          <Table
            loading={loading}
            rowKey={(r) => r.id}
            data={runs}
            emptyMessage="No payroll runs yet"
            columns={[
              { key: 'period', header: 'Period', render: (r) => <span className="font-semibold">{MONTH_NAMES[r.period_month - 1]} {r.period_year}</span> },
              { key: 'company', header: 'Company', render: (r) => (r.company as { name?: string })?.name ?? '-' },
              { key: 'employee_count', header: 'Employees', render: (r) => r.employee_count },
              { key: 'total_gross', header: 'Gross', render: (r) => <span className="text-sm">{formatCurrency(r.total_gross)}</span> },
              { key: 'total_deductions', header: 'Deductions', render: (r) => <span className="text-sm text-red-600">{formatCurrency(r.total_deductions)}</span> },
              { key: 'total_net', header: 'Net', render: (r) => <span className="font-bold text-blue-700">{formatCurrency(r.total_net)}</span> },
              { key: 'status', header: 'Status', render: (r) => <Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
              {
                key: 'actions', header: '',
                render: (r) => (
                  <div className="flex gap-1 justify-end">
                    {(r.status === 'review' || r.status === 'approved' || r.status === 'paid') && (
                      <Button size="sm" variant="ghost" onClick={() => setDetailRun(r)}><Eye size={14} /></Button>
                    )}
                    {r.status === 'draft' && (
                      <Button size="sm" variant="primary" loading={processing === r.id} onClick={() => handleProcess(r)}>
                        <Play size={14} /> Process
                      </Button>
                    )}
                    {r.status === 'review' && (
                      <Button size="sm" variant="secondary" onClick={() => handleApprove(r)}><CheckCircle size={14} /> Approve</Button>
                    )}
                    {r.status === 'approved' && (
                      <Button size="sm" variant="secondary" className="text-emerald-700" onClick={() => handleMarkPaid(r)}><DollarSign size={14} /> Mark Paid</Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {activeTab === 'components' && <PayrollComponentsTab />}
      {activeTab === 'incentives' && <IncentivesTab />}
      {activeTab === 'area_rates' && <AreaSalaryRatesTab />}

      <Modal isOpen={createModal} onClose={() => setCreateModal(false)} title="New Payroll Run" size="sm"
        footer={<><Button variant="outline" onClick={() => setCreateModal(false)}>Cancel</Button><Button loading={saving} onClick={handleCreate}>Create</Button></>}
      >
        <div className="space-y-4">
          <Select label="Company" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} options={[{ value: '', label: 'Select Company' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} required />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Month" value={form.period_month} onChange={(e) => setForm({ ...form, period_month: e.target.value })} options={monthOptions} />
            <Select label="Year" value={form.period_year} onChange={(e) => setForm({ ...form, period_year: e.target.value })} options={yearOptions} />
          </div>
          <Textarea label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
      </Modal>

      {detailRun && <PayrollItemsModal run={detailRun} onClose={() => setDetailRun(null)} />}
    </div>
  );
}
