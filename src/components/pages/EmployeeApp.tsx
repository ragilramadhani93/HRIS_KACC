/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Building2, CalendarDays, CalendarRange, Camera, CheckCircle,
  FileText, Fingerprint, Lock, Printer, RefreshCw, ScanFace,
  ShieldCheck, Upload, User, Wallet, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { findBestMatch } from '../../lib/faceMatch';
import type { FaceProfile } from '../../lib/faceMatch';
import {
  formatDate, formatCurrency, getInitials,
  STATUS_COLORS, ABSENCE_TYPE_LABELS, MONTH_NAMES, createNotification,
} from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { AbsenTab, CameraOverlay, JadwalTab } from './EmployeeAppSections';

// No stored identity — the session is bound to the verified face profile.

export interface OutletView {
  id: string; name: string; outlet_code: string; address?: string | null;
  latitude?: number | null; longitude?: number | null; geofence_radius_meters?: number | null;
}
export interface EmpView {
  id: string; user_id?: string | null; employee_code: string; full_name: string; nik?: string | null;
  phone?: string | null; email?: string | null; job_title?: string | null; department?: string | null;
  status: string; face_registered?: boolean | null; salary_scheme?: string | null;
  primary_outlet_id?: string | null; backup_outlet_id?: string | null;
  primary_outlet?: OutletView | null; backup_outlet?: OutletView | null;
}
export interface AttRow {
  id: string; employee_id: string; attendance_date: string; check_in_time?: string | null;
  check_out_time?: string | null; status?: string; check_in_geofence?: string | null;
  work_duration_minutes?: number | null; shift?: { name?: string; start_time?: string; end_time?: string } | null;
}

type Tab = 'absen' | 'jadwal' | 'izin' | 'slip' | 'profil';

// ─── Face login (auto-login via face recognition) ────────────────────────────
type LoginState = 'idle' | 'capturing' | 'matching' | 'success' | 'error';

// Login candidates: verified face profiles mapped to their employees
interface LoginCandidate {
  profile: FaceProfile;
  emp: EmpView;
}

function FaceLogin({ candidates, onLogin, onExit }: {
  candidates: LoginCandidate[];
  onLogin: (e: EmpView) => void;
  onExit?: () => void;
}) {
  const [state, setState] = useState<LoginState>('idle');
  const [photo, setPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      setState('capturing');
    } catch {
      setMsg('Kamera tidak dapat diakses. Periksa izin kamera di pengaturan aplikasi / browser.');
      setState('error');
    }
  };

  useEffect(() => {
    if (state === 'capturing' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [state]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
    canvasRef.current.toBlob(async (b) => {
      if (!b) return;
      setPhoto(dataUrl);
      stopCamera();
      setState('matching');
      try {
        if (candidates.length === 0) {
          setMsg('Belum ada wajah terdaftar. Silakan hubungi HR untuk pendaftaran wajah.');
          setState('error');
          return;
        }
        const res = await findBestMatch(b, candidates.map((c) => c.profile));
        const score = res?.confidence ?? 0;
        const hit = candidates.find((c) => c.profile.id === res?.profile.id);
        if (hit && score >= 40) {
          setMsg(`Halo ${hit.emp.full_name.split(' ')[0]}! Masuk sebagai ${hit.emp.full_name}.`);
          setState('success');
          setTimeout(() => onLogin(hit.emp), 1400);
        } else {
          setMsg(`Wajah tidak dikenali (${score.toFixed(0)}%). Pastikan pencahayaan cukup dan wajah terlihat jelas.`);
          setState('error');
        }
      } catch {
        setMsg('Verifikasi wajah gagal. Silakan coba lagi.');
        setState('error');
      }
    }, 'image/jpeg', 0.85);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-600 px-5 pt-12 pb-16 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        {onExit && (
          <button onClick={onExit} className="relative flex items-center gap-1.5 text-blue-100 text-xs mb-4">
            <ArrowLeft size={14} /> Kembali
          </button>
        )}
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <ScanFace size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-white text-lg font-bold leading-tight">SmartHRIS Karyawan</h1>
            <p className="text-blue-100 text-xs mt-0.5">Masuk otomatis dengan pengenalan wajah</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-8 pb-8">
        {state === 'idle' && (
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-5 text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center animate-pulse shadow-lg shadow-blue-200">
              <Camera size={40} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-lg">Masuk dengan Wajah</p>
              <p className="text-slate-400 text-xs mt-1">
                Selfie sekali — aplikasi mengenali Anda otomatis. Menu izin & slip gaji hanya bisa diakses oleh wajah Anda.
              </p>
            </div>
            <button
              onClick={startCamera}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            >
              <Camera size={20} /> Scan Wajah Sekarang
            </button>
          </div>
        )}

        {state === 'capturing' && (
          <div className="flex flex-col items-center gap-5 w-full max-w-sm">
            <p className="text-white font-semibold">Posisikan wajah dalam lingkaran</p>
            <div className="relative w-full rounded-3xl overflow-hidden bg-black border border-blue-500/50 aspect-[3/4]">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-52 rounded-full border-4 border-blue-400/70 border-dashed" />
              </div>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <span className="bg-black/50 text-white text-[11px] px-3 py-1.5 rounded-full">Pastikan pencahayaan cukup</span>
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <button
              onClick={capture}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-all"
            >
              Ambil Foto & Kenali
            </button>
          </div>
        )}

        {state === 'matching' && (
          <div className="flex flex-col items-center gap-5">
            {photo && <img src={photo} alt="" className="w-28 h-28 rounded-full object-cover border-4 border-blue-500 shadow-2xl" />}
            <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-white font-semibold">Mengenali wajah...</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center animate-bounce">
              <CheckCircle size={48} className="text-emerald-400" />
            </div>
            <p className="text-white font-bold text-xl">{msg}</p>
            <p className="text-slate-500 text-xs">Membuka aplikasi...</p>
          </div>
        )}

        {state === 'error' && (
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-20 h-20 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
              <XCircle size={40} className="text-red-400" />
            </div>
            <p className="text-slate-700 text-sm font-medium">{msg}</p>
            <button onClick={() => setState('idle')} className="w-full py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <RefreshCw size={15} /> Coba Lagi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}



// ─── Izin tab ─────────────────────────────────────────────────────────────────
const IZIN_TYPES = [
  { value: 'sakit_dengan_surat', label: 'Sakit (Surat Dokter)', icon: '🏥' },
  { value: 'sakit_tanpa_surat', label: 'Sakit (Tanpa Surat)', icon: '🤒' },
  { value: 'izin', label: 'Izin Tidak Masuk', icon: '📋' },
  { value: 'perbantuan', label: 'Perbantuan Outlet', icon: '🏪' },
];

function IzinTab({ emp }: { emp: EmpView }) {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [form, setForm] = useState({ absence_type: 'sakit_dengan_surat', absence_date: '', end_date: '', reason: '' });

  const load = useCallback(() => {
    supabase.from('absence_requests')
      .select('*')
      .eq('employee_id', emp.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setList(data ?? []));
  }, [emp.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.absence_date) { alert('Tanggal wajib diisi'); return; }
    setSaving(true);
    let documentUrl: string | null = null;
    if (docFile) {
      const ext = docFile.name.split('.').pop();
      const path = `absence/${emp.id}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('employee-documents')
        .upload(path, docFile);
      if (uploadErr) { alert('Gagal upload dokumen'); setSaving(false); return; }
      documentUrl = supabase.storage.from('employee-documents').getPublicUrl(uploadData.path).data.publicUrl;
    }
    const endDate = form.end_date || form.absence_date;
    const totalDays = Math.ceil((new Date(endDate).getTime() - new Date(form.absence_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const { error } = await supabase.from('absence_requests').insert({
      employee_id: emp.id,
      absence_type: form.absence_type,
      absence_date: form.absence_date,
      end_date: form.end_date || null,
      total_days: totalDays,
      reason: form.reason || null,
      document_url: documentUrl,
      target_outlet_id: null,
      status: 'pending',
    });
    if (error) { alert(`Gagal mengirim: ${error.message}`); }
    else {
      createNotification('u-admin', 'leave', 'Pengajuan Absen Baru',
        `${emp.full_name} mengajukan ${ABSENCE_TYPE_LABELS[form.absence_type]} mulai ${formatDate(form.absence_date)} (${totalDays} hari).`);
      load();
      setOpen(false);
      setDocFile(null);
      setForm({ absence_type: 'sakit_dengan_surat', absence_date: '', end_date: '', reason: '' });
    }
    setSaving(false);
  };

  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900">Pengajuan Izin</h2>
          <p className="text-xs text-slate-400">Pantau status pengajuan Anda</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl active:scale-95 transition-all shadow-md shadow-blue-200"
        >
          + Ajukan Izin
        </button>
      </div>

      <div className="space-y-2.5">
        {list.map((r: any) => {
          const opt = IZIN_TYPES.find((o) => o.value === r.absence_type);
          return (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{opt?.icon ?? '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{ABSENCE_TYPE_LABELS[r.absence_type]}</p>
                    <Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatDate(r.absence_date)}{r.end_date && r.end_date !== r.absence_date ? ` – ${formatDate(r.end_date)}` : ''} · {r.total_days} hari
                  </p>
                  {r.reason && <p className="text-xs text-slate-400 mt-1 italic truncate">"{r.reason}"</p>}
                  {r.approval_notes && (
                    <p className={`text-[11px] mt-1.5 ${r.status === 'approved' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {r.approval_notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <CalendarDays size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-400 text-sm">Belum ada pengajuan izin</p>
          </div>
        )}
      </div>

      {/* Form sheet */}
      {open && (
        <div className="absolute inset-0 z-40 bg-slate-950/50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[88%] flex flex-col animate-slide-up">
            <div className="px-5 pt-3 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Ajukan Izin / Ketidakhadiran</p>
                <p className="text-xs text-slate-400">Akan diteruskan ke HR untuk disetujui</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <XCircle size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Jenis</p>
                <div className="grid grid-cols-2 gap-2">
                  {IZIN_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setForm({ ...form, absence_type: t.value })}
                      className={`p-3 rounded-2xl border-2 text-left transition-all ${
                        form.absence_type === t.value ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span className="text-xl block mb-1">{t.icon}</span>
                      <span className="text-[11px] font-medium text-slate-700 leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Tanggal Mulai *</p>
                  <input type="date" value={form.absence_date} onChange={(e) => setForm({ ...form, absence_date: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Tanggal Selesai</p>
                  <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Alasan / Keterangan</p>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Jelaskan alasan Anda..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 min-h-[80px] resize-none" />
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">
                  {form.absence_type === 'sakit_dengan_surat' ? 'Surat Dokter (wajib)' : 'Dokumen Pendukung (opsional)'}
                </p>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" id="emp-doc-input"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => document.getElementById('emp-doc-input')?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl px-3 py-3 text-xs text-slate-500 flex items-center justify-center gap-2 hover:border-blue-300 transition-colors">
                  <Upload size={14} /> {docFile ? docFile.name : 'Upload dokumen'}
                </button>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button onClick={() => setOpen(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-semibold">
                Batal
              </button>
              <button onClick={submit} disabled={saving}
                className="flex-[2] py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition-all">
                {saving ? 'Mengirim...' : 'Kirim Pengajuan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Slip gaji tab ────────────────────────────────────────────────────────────
function SlipTab({ emp }: { emp: EmpView }) {
  const [items, setItems] = useState<any[]>([]);
  const [selMonth, setSelMonth] = useState(0);
  const [selItem, setSelItem] = useState<any | null>(null);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1, label: MONTH_NAMES[d.getMonth()] };
    });
  }, []);

  const load = useCallback(() => {
    supabase.from('payroll_items')
      .select('*, run:payroll_runs(period_month, period_year, status)')
      .eq('employee_id', emp.id)
      .then(({ data }) => {
        const arr = (data ?? []).slice().sort((a: any, b: any) => {
          const pa = (a.run?.period_year ?? 0) * 100 + (a.run?.period_month ?? 0);
          const pb = (b.run?.period_year ?? 0) * 100 + (b.run?.period_month ?? 0);
          return pb - pa;
        });
        setItems(arr);
      });
  }, [emp.id]);

  useEffect(() => { load(); }, [load]);

  const sel = months[selMonth];
  const shown = items.filter((i: any) => i.run?.period_month === sel.month && i.run?.period_year === sel.year);

  const printSlip = (item: any) => {
    supabase.from('payroll_item_lines').select('*').eq('payroll_item_id', item.id).then(({ data: lines }) => {
      const earn = (lines ?? []).filter((l: any) => l.component_type === 'earning');
      const ded = (lines ?? []).filter((l: any) => l.component_type === 'deduction');
      const w = window.open('', '_blank')!;
      w.document.write(`<html><head><title>Slip Gaji</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px;max-width:600px;margin:0 auto}
      h2{font-size:16px}table{width:100%;border-collapse:collapse}td{padding:4px 8px}
      .right{text-align:right}.bold{font-weight:700}.earn{color:#047857}.ded{color:#dc2626}
      .border-top td{border-top:1px solid #e5e7eb;padding-top:8px}
      .net{background:#f1f5f9;padding:12px;border-radius:8px;display:flex;justify-content:space-between;margin-top:12px}
      hr{border:none;border-top:1px solid #e5e7eb;margin:8px 0}</style></head><body>
      <h2>SLIP GAJI — ${sel.label.toUpperCase()} ${sel.year}</h2>
      <table><tr><td><b>${emp.full_name}</b></td><td class="right">${emp.employee_code}</td></tr>
      <tr><td>${emp.job_title ?? ''}</td><td class="right">${emp.department ?? ''}</td></tr></table>
      <hr/>
      <table><tr><td colspan="2"><b>Kehadiran</b></td></tr>
      <tr><td>Hari Kerja Periode</td><td class="right">${item.work_days} hari</td></tr>
      <tr><td>Hari Hadir</td><td class="right">${item.present_days} hari</td></tr>
      <tr><td>Terlambat</td><td class="right">${item.late_days} hari</td></tr>
      <tr><td>Absen</td><td class="right">${item.absent_days} hari</td></tr></table><hr/>
      <table><tr><td colspan="2"><b>Penghasilan</b></td></tr>
      ${earn.map((l: any) => `<tr><td>${l.component_name}</td><td class="right earn">${formatCurrency(l.amount)}</td></tr>`).join('')}
      <tr class="border-top"><td><b>Total Penghasilan</b></td><td class="right bold earn">${formatCurrency(item.total_earnings)}</td></tr></table><hr/>
      <table><tr><td colspan="2"><b>Potongan</b></td></tr>
      ${ded.map((l: any) => `<tr><td>${l.component_name}</td><td class="right ded">${formatCurrency(Math.abs(l.amount))}</td></tr>`).join('')}
      <tr class="border-top"><td><b>Total Potongan</b></td><td class="right bold ded">${formatCurrency(item.total_deductions)}</td></tr></table>
      <div class="net"><b>TAKE HOME PAY</b><b style="font-size:16px;color:#1d4ed8">${formatCurrency(item.net_salary)}</b></div>
      </body></html>`);
      w.document.close();
      w.print();
    });
  };

  return (
    <div className="px-4 pt-4 space-y-4">
      <div>
        <h2 className="font-bold text-slate-900">Slip Gaji</h2>
        <p className="text-xs text-slate-400">Pilih periode untuk melihat slip gaji Anda</p>
      </div>

      {/* Month chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {months.map((mth, i) => (
          <button
            key={`${mth.year}-${mth.month}`}
            onClick={() => setSelMonth(i)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selMonth === i ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border border-slate-200 text-slate-500'
            }`}
          >
            {mth.label} {mth.year}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map((item: any) => (
          <button
            key={item.id}
            onClick={() => setSelItem(item)}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left hover:border-blue-300 hover:shadow-md active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                  <Wallet size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{sel.label} {sel.year}</p>
                  <p className="text-[11px] text-slate-400">
                    {item.present_days} hari hadir · {item.late_days > 0 ? `${item.late_days} terlambat · ` : ''}{item.absent_days > 0 ? `${item.absent_days} absen` : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-blue-700">{formatCurrency(item.net_salary)}</p>
                <Badge className={STATUS_COLORS[item.run?.status ?? 'paid']}>{item.run?.status ?? 'paid'}</Badge>
              </div>
            </div>
          </button>
        ))}
        {shown.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <FileText size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-400 text-sm">Slip belum tersedia untuk {sel.label} {sel.year}</p>
          </div>
        )}
      </div>

      {/* Slip detail */}
      {selItem && (
        <div className="absolute inset-0 z-40 bg-slate-950/50 flex items-end">
          <div className="w-full bg-slate-50 rounded-t-3xl max-h-[92%] flex flex-col animate-slide-up">
            <div className="px-5 pt-3 pb-2 border-b border-slate-100 bg-white rounded-t-3xl flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Slip Gaji</p>
                <p className="text-xs text-slate-400">{sel.label} {sel.year}</p>
              </div>
              <button onClick={() => setSelItem(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <XCircle size={18} />
              </button>
            </div>

            <SlipDetail item={selItem} emp={emp} periodLabel={`${sel.label} ${sel.year}`} />

            <div className="px-5 py-4 border-t border-slate-100 bg-white flex gap-2">
              <button onClick={() => setSelItem(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-semibold">
                Tutup
              </button>
              <button onClick={() => printSlip(selItem)}
                className="flex-[2] py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold active:scale-[0.98] transition-all">
                <Printer size={15} className="inline mr-1.5 align-middle" />Print / Simpan PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlipDetail({ item, emp, periodLabel }: { item: any; emp: EmpView; periodLabel: string }) {
  const [lines, setLines] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('payroll_item_lines').select('*').eq('payroll_item_id', item.id).then(({ data }) => setLines(data ?? []));
  }, [item.id]);

  const earnings = lines.filter((l: any) => l.component_type === 'earning');
  const deductions = lines.filter((l: any) => l.component_type === 'deduction');
  const incentiveNames = ['Insentif Penjualan', 'Insentif Prestasi', 'Insentif Kehadiran'];
  const baseEarnings = earnings.filter((l: any) => !incentiveNames.includes(l.component_name));
  const incentives = earnings.filter((l: any) => incentiveNames.includes(l.component_name));

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 text-white rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] font-medium text-blue-200 uppercase tracking-widest">Slip Gaji</p>
            <p className="font-bold text-lg mt-0.5">{periodLabel}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{emp.full_name}</p>
            <p className="text-[11px] text-blue-200">{emp.employee_code}</p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2 pt-4 border-t border-blue-500/40 text-center">
          {[
            { l: 'Hari Kerja', v: item.work_days, u: 'hari' },
            { l: 'Hadir', v: item.present_days, u: 'hari' },
            { l: 'Terlambat', v: item.late_days, u: 'hari', w: item.late_days > 0 },
            { l: 'Absen', v: item.absent_days, u: 'hari', b: item.absent_days > 0 },
            { l: 'Lembur', v: item.overtime_hours, u: 'jam' },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-[9px] text-blue-200">{s.l}</p>
              <p className={`font-bold text-base ${s.b ? 'text-red-300' : s.w ? 'text-yellow-300' : 'text-white'}`}>{s.v}</p>
              <p className="text-[9px] text-blue-300">{s.u}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Penghasilan</p>
        <div className="space-y-2">
          {baseEarnings.map((l: any, i: number) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-slate-600">{l.component_name}</span>
              <span className="font-medium text-emerald-700">{formatCurrency(l.amount)}</span>
            </div>
          ))}
          {incentives.length > 0 && (
            <div className="border-t border-dashed border-slate-200 pt-2">
              {incentives.map((l: any, i: number) => (
                <div key={i} className="flex justify-between text-sm mt-1">
                  <span className="text-slate-600">✨ {l.component_name}</span>
                  <span className="font-medium text-emerald-700">{formatCurrency(l.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between text-sm font-bold border-t-2 border-slate-200 pt-2 mt-2">
            <span className="text-slate-800">Total Penghasilan</span>
            <span className="text-emerald-700">{formatCurrency(item.total_earnings)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Potongan</p>
        <div className="space-y-2">
          {deductions.map((l: any, i: number) => (
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

      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-5 flex justify-between items-center">
        <div>
          <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">Take Home Pay</p>
          <p className="text-slate-500 text-xs mt-0.5">{periodLabel}</p>
        </div>
        <p className="text-2xl font-bold text-blue-700">{formatCurrency(item.net_salary)}</p>
      </div>
    </div>
  );
}

// ─── Profil tab ───────────────────────────────────────────────────────────────
function ProfilTab({ emp, onLock, onExit }: {
  emp: EmpView;
  onLock: () => void;
  onExit?: () => void;
}) {
  const rows: Array<[string, string]> = [
    ['Nama Lengkap', emp.full_name],
    ['Kode Karyawan', emp.employee_code],
    ['NIK', emp.nik ?? '-'],
    ['Jabatan', emp.job_title ?? '-'],
    ['Departemen', emp.department ?? '-'],
    ['Email', emp.email ?? '-'],
    ['Telepon', emp.phone ?? '-'],
    ['Status', emp.status],
  ];
  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-3">
          {getInitials(emp.full_name)}
        </div>
        <p className="font-bold text-slate-900">{emp.full_name}</p>
        <p className="text-xs text-slate-400 mt-0.5">{emp.job_title} · {emp.primary_outlet?.name}</p>
      </div>

      {emp.face_registered && (
        <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">Absen Wajah Aktif</p>
            <p className="text-xs text-slate-400">Masuk & absen otomatis dengan pengenalan wajah Anda</p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 flex-shrink-0">AKTIF</Badge>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
        <div className="space-y-3.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between items-center gap-4">
              <span className="text-xs text-slate-400">{k}</span>
              <span className="text-sm font-medium text-slate-800 text-right">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-600 mb-3">Outlet</p>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Building2 size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{emp.primary_outlet?.name}</p>
            <p className="text-xs text-slate-400">{emp.primary_outlet?.address ?? emp.primary_outlet?.outlet_code}</p>
          </div>
        </div>
      </div>

      <button
        onClick={onLock}
        className="w-full py-3.5 rounded-2xl bg-slate-900 text-white text-sm font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        <Lock size={15} /> Kunci Aplikasi
      </button>
      {onExit && (
        <button
          onClick={onExit}
          className="w-full py-3.5 rounded-2xl border border-slate-200 text-slate-500 text-sm font-semibold active:scale-[0.98] transition-all"
        >
          Kembali ke Halaman Admin
        </button>
      )}
    </div>
  );
}

// ─── Main Employee App ────────────────────────────────────────────────────────
export function EmployeeApp({ onExit }: { onExit?: () => void }) {
  const [tab, setTab] = useState<Tab>('absen');
  const [stage, setStage] = useState<'login' | 'app'>('login');
  const [candidates, setCandidates] = useState<LoginCandidate[]>([]);
  const [emp, setEmp] = useState<EmpView | null>(null);
  const [outlet, setOutlet] = useState<OutletView | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ready, setReady] = useState(false);

  const loadData = useCallback(() => {
    return supabase.from('face_profiles')
      .select('*, employee:employees!inner(*, primary_outlet:outlets!primary_outlet_id(*), backup_outlet:outlets!backup_outlet_id(*))')
      .eq('status', 'verified')
      .then(({ data: fps }) => {
        const cands: LoginCandidate[] = ((fps ?? []) as any[])
          .filter((fp) => fp?.employee)
          .map((fp) => ({ profile: fp as FaceProfile, emp: fp.employee as EmpView }));
        setCandidates(cands);
        setReady(true);
      });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLogin = (e: EmpView) => {
    setEmp(e);
    setOutlet((e.primary_outlet as OutletView | null) ?? null);
    setTab('absen');
    setStage('app');
  };

  const handleLock = () => {
    setEmp(null);
    setOutlet(null);
    setTab('absen');
    setStage('login');
  };

  const NAV: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'absen', label: 'Absen', icon: <Fingerprint size={20} /> },
    { id: 'jadwal', label: 'Jadwal', icon: <CalendarRange size={20} /> },
    { id: 'izin', label: 'Izin', icon: <CalendarDays size={20} /> },
    { id: 'slip', label: 'Slip Gaji', icon: <Wallet size={20} /> },
    { id: 'profil', label: 'Profil', icon: <User size={20} /> },
  ];

  return (
    <div className="h-screen w-full bg-slate-200 flex items-center justify-center">
      <div className="relative h-full w-full max-w-md bg-slate-100 overflow-hidden flex flex-col md:h-[min(900px,calc(100vh-56px))] md:rounded-[2.5rem] md:border-[10px] md:border-slate-900 md:shadow-2xl">
        {!ready ? (
          <div className="h-full flex flex-col items-center justify-center bg-slate-100">
            <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-slate-400 text-sm">Memuat Aplikasi Karyawan...</p>
          </div>
        ) : stage === 'login' ? (
          <FaceLogin
            candidates={candidates}
            onLogin={handleLogin}
            onExit={onExit}
          />
        ) : (
          <>
            {/* Content */}
            <div className="flex-1 overflow-y-auto pb-24 page-enter">
              {tab === 'absen' && emp && outlet && (
                <AbsenTab
                  emp={emp}
                  outlet={outlet}
                  onOutletChange={setOutlet}
                  onOpenCamera={() => setCameraOpen(true)}
                  onRefreshKey={refreshKey}
                />
              )}
              {tab === 'jadwal' && emp && outlet && <JadwalTab emp={emp} outlet={outlet} />}
              {tab === 'izin' && emp && <IzinTab emp={emp} />}
              {tab === 'slip' && emp && <SlipTab emp={emp} />}
              {tab === 'profil' && emp && (
                <ProfilTab
                  emp={emp}
                  onLock={handleLock}
                  onExit={onExit}
                />
              )}
              {emp && !outlet && (
                <div className="px-4 pt-10 text-center">
                  <p className="text-slate-400 text-sm">Outlet belum diatur untuk akun ini. Hubungi HR.</p>
                </div>
              )}
            </div>

            {/* Bottom nav */}
            <nav className="absolute bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-lg border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
              <div className="grid grid-cols-5">
                {NAV.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                      tab === n.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <span className={`transition-transform ${tab === n.id ? '-translate-y-0.5 scale-105' : ''}`}>{n.icon}</span>
                    <span className="text-[10px] font-semibold">{n.label}</span>
                    {tab === n.id && <span className="w-6 h-0.5 rounded-full bg-blue-600 mt-0.5" />}
                  </button>
                ))}
              </div>
            </nav>

            {/* Camera overlay */}
            {cameraOpen && emp && outlet && (
              <CameraOverlay
                emp={emp}
                outlet={outlet}
                onClose={() => setCameraOpen(false)}
                onDone={() => { setCameraOpen(false); setRefreshKey((k) => k + 1); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
