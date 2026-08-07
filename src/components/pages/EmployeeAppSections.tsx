/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarDays, Camera, CheckCircle, Clock, LogIn, LogOut,
  MapPin, RefreshCw, ScanFace, ShieldCheck, User, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { findBestMatch } from '../../lib/faceMatch';
import type { FaceProfile } from '../../lib/faceMatch';
import {
  formatDate, formatTime, getInitials, haversineDistance, STATUS_COLORS,
} from '../../lib/utils';
import { Badge } from '../ui/Badge';
import type { AttRow, EmpView, OutletView } from './EmployeeApp';

// ─── Camera clock-in overlay ──────────────────────────────────────────────────
type CamState = 'idle' | 'capturing' | 'matching' | 'confirm' | 'success' | 'error';

export function CameraOverlay({ emp, outlet, onClose, onDone }: {
  emp: EmpView; outlet: OutletView; onClose: () => void; onDone: () => void;
}) {
  const [state, setState] = useState<CamState>('idle');
  const [photo, setPhoto] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [faceScore, setFaceScore] = useState<number | null>(null);
  const [faceNote, setFaceNote] = useState<string>('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true },
    );
  }, []);

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
      setMsg('Kamera tidak dapat diakses. Periksa izin kamera di pengaturan browser.');
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
      setBlob(b);
      stopCamera();
      setState('matching');

      try {
        const { data: fps } = await supabase
          .from('face_profiles')
          .select('*, employee:employees!inner(*)')
          .eq('status', 'verified');
        const myProfiles = (fps ?? []).filter((fp: any) => fp?.employee?.id === emp.id);
        if (emp.face_registered) {
          // Face is required: a verified profile must exist and score >= 40.
          if (myProfiles.length === 0) {
            setFaceScore(null);
            setFaceNote('Belum ada profil wajah terverifikasi.');
            setMsg('Wajah belum terdaftar/terverifikasi. Daftarkan wajah Anda di tab Profil, atau hubungi HR.');
            setState('error');
            return;
          }
          const res = await findBestMatch(b, myProfiles as FaceProfile[]);
          const conf = res?.confidence ?? 0;
          setFaceScore(conf);
          if (conf >= 40) {
            setFaceNote(`Wajah cocok (${conf.toFixed(0)}%)`);
          } else {
            setMsg(`Wajah tidak dikenali (${conf.toFixed(0)}%). Pastikan pencahayaan cukup dan wajah terlihat jelas.`);
            setState('error');
            return;
          }
        } else {
          // Not registered: selfie + GPS manual mode, optional soft check.
          if (myProfiles.length > 0) {
            const res = await findBestMatch(b, myProfiles as FaceProfile[]);
            const conf = res?.confidence ?? 0;
            setFaceScore(conf);
            setFaceNote(conf >= 40 ? `Wajah cocok (${conf.toFixed(0)}%)` : `Wajah tidak dikenali (${conf.toFixed(0)}%) — lanjut manual?`);
          } else {
            setFaceScore(null);
            setFaceNote('Belum ada wajah terdaftar — mode manual (selfie + GPS)');
          }
        }
      } catch {
        setFaceScore(null);
        setFaceNote('Verifikasi wajah tidak tersedia — mode manual');
      }
      setState('confirm');
    }, 'image/jpeg', 0.85);
  };

  // Hard gate: never allow a registered employee to bypass a failed face check.
  useEffect(() => {
    if (state === 'confirm' && emp.face_registered && (faceScore == null || faceScore < 40)) {
      setMsg('Verifikasi wajah gagal. Silakan coba lagi.');
      setState('error');
    }
  }, [state, emp.face_registered, faceScore]);

  // Determine action (check-in vs check-out) from today's record
  const [todayAtt, setTodayAtt] = useState<AttRow | null>(null);
  useEffect(() => {
    supabase.from('attendance').select('*').eq('employee_id', emp.id).eq('attendance_date', today).maybeSingle()
      .then(({ data }) => setTodayAtt(data as AttRow | null));
  }, [emp.id, today]);
  const action: 'check_in' | 'check_out' = todayAtt?.check_in_time && !todayAtt?.check_out_time ? 'check_out' : 'check_in';

  const confirmAction = async () => {
    setProcessing(true);
    const now = new Date();
    const geofence = gps && outlet.latitude && outlet.longitude
      ? haversineDistance(gps.lat, gps.lng, outlet.latitude!, outlet.longitude!) <= (outlet.geofence_radius_meters ?? 300)
        ? 'inside' as const : 'outside' as const
      : 'unknown' as const;

    let photoUrl: string | null = null;
    if (blob) {
      const fileName = `emp_${emp.id}_${action}_${Date.now()}.jpg`;
      const { data: uploadData } = await supabase.storage
        .from('attendance-photos')
        .upload(fileName, blob, { contentType: 'image/jpeg' });
      photoUrl = uploadData ? supabase.storage.from('attendance-photos').getPublicUrl(uploadData.path).data.publicUrl : null;
    }

    if (action === 'check_in') {
      const { data: shiftAssign } = await supabase.from('shift_assignments')
        .select('*, shift_template:shift_templates(*)')
        .eq('employee_id', emp.id)
        .lte('effective_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      const shift = shiftAssign?.shift_template as { id?: string; start_time?: string; late_tolerance_minutes?: number } | null;
      let status: 'present' | 'late' = 'present';
      if (shift?.start_time) {
        const [h, m] = shift.start_time.split(':').map(Number);
        const shiftStart = new Date(now);
        shiftStart.setHours(h, m + (shift.late_tolerance_minutes ?? 10), 0, 0);
        if (now > shiftStart) status = 'late';
      }
      const { error } = await supabase.from('attendance').upsert({
        employee_id: emp.id,
        outlet_id: outlet.id,
        shift_template_id: shift?.id ?? null,
        attendance_date: today,
        check_in_time: now.toISOString(),
        check_in_lat: gps?.lat ?? null,
        check_in_lng: gps?.lng ?? null,
        check_in_geofence: geofence,
        check_in_selfie_url: photoUrl,
        check_in_face_score: faceScore != null ? parseFloat(faceScore.toFixed(2)) : null,
        status,
        // Re-open: clear any previous check-out so a new session can start (re-check-in).
        check_out_time: null,
        check_out_lat: null,
        check_out_lng: null,
        check_out_geofence: null,
        check_out_selfie_url: null,
        work_duration_minutes: null,
      }, { onConflict: 'employee_id,attendance_date' });

      if (error) { setMsg(`Check-in gagal: ${error.message}`); setState('error'); }
      else {
        setMsg(`Check-in berhasil! ${status === 'late' ? 'Sedikit terlambat.' : 'Tepat waktu. Selamat bekerja!'}`);
        setState('success');
      }
    } else {
      const { data: row } = await supabase.from('attendance').select('check_in_time').eq('id', todayAtt!.id).maybeSingle();
      const dur = row?.check_in_time ? Math.floor((now.getTime() - new Date(row.check_in_time).getTime()) / 60000) : 0;
      const { error } = await supabase.from('attendance').update({
        check_out_time: now.toISOString(),
        check_out_lat: gps?.lat ?? null,
        check_out_lng: gps?.lng ?? null,
        check_out_geofence: geofence,
        check_out_selfie_url: photoUrl,
        work_duration_minutes: dur,
      }).eq('id', todayAtt!.id);
      if (error) { setMsg(`Check-out gagal: ${error.message}`); setState('error'); }
      else {
        const h = Math.floor(dur / 60), m2 = dur % 60;
        setMsg(`Check-out berhasil! Total kerja ${h}j ${m2}m. Terima kasih!`);
        setState('success');
      }
    }
    setProcessing(false);
  };

  useEffect(() => {
    if (state === 'success') {
      const t = setTimeout(() => { onDone(); }, 2600);
      return () => clearTimeout(t);
    }
  }, [state, onDone]);

  const timeNow = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-5 pt-12 pb-2">
        <button onClick={() => { stopCamera(); onClose(); }} className="text-slate-400 hover:text-white text-sm flex items-center gap-1.5">
          <XCircle size={15} /> Batal
        </button>
        <span className="text-white/70 text-sm font-medium">{action === 'check_in' ? 'Clock In' : 'Clock Out'}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {state === 'idle' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-32 h-32 rounded-full border-4 border-dashed border-blue-400/40 flex items-center justify-center animate-pulse">
              <Camera size={52} className="text-blue-300/80" />
            </div>
            <div>
              <p className="text-white font-bold text-xl">{action === 'check_in' ? 'Mulai Bekerja' : 'Akhiri Shift'}</p>
              <p className="text-slate-400 text-sm mt-1">Hadapkan wajah ke kamera untuk absen</p>
            </div>
            <button
              onClick={startCamera}
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold px-10 py-4 rounded-2xl shadow-lg shadow-blue-900/40 active:scale-95 transition-all flex items-center gap-3"
            >
              <Camera size={22} /> Buka Kamera
            </button>
            <button
              onClick={() => { setPhoto(null); setBlob(null); setFaceScore(null); setFaceNote('Absen manual tanpa foto'); setState('confirm'); }}
              className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1.5"
            >
              <User size={13} /> Absen manual tanpa kamera
            </button>
          </div>
        )}

        {state === 'capturing' && (
          <div className="flex flex-col items-center gap-5 w-full">
            <p className="text-white font-semibold">Posisikan wajah dalam lingkaran</p>
            <div className="relative w-full max-w-sm rounded-3xl overflow-hidden bg-black border border-blue-500/50 aspect-[3/4]">
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
              className="w-full max-w-sm bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-all"
            >
              Ambil Foto & Lanjutkan
            </button>
          </div>
        )}

        {state === 'matching' && (
          <div className="flex flex-col items-center gap-5">
            {photo && <img src={photo} alt="" className="w-28 h-28 rounded-full object-cover border-4 border-blue-500 shadow-2xl" />}
            <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-white font-semibold">Memproses absen...</p>
          </div>
        )}

        {state === 'confirm' && (
          <div className="flex flex-col items-center gap-5 w-full max-w-sm">
            <div className="w-full bg-white rounded-3xl p-5 flex items-center gap-4">
              {photo ? (
                <img src={photo} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-blue-300 flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
                  {getInitials(emp.full_name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{emp.full_name}</p>
                <p className="text-xs text-slate-500">{emp.job_title ?? emp.employee_code}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge className={action === 'check_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}>
                    {action === 'check_in' ? <LogIn size={11} className="inline mr-1" /> : <LogOut size={11} className="inline mr-1" />}
                    {action === 'check_in' ? 'CHECK IN' : 'CHECK OUT'}
                  </Badge>
                  {faceScore != null && (
                    <Badge className={faceScore >= 40 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}>
                      <ShieldCheck size={11} className="inline mr-1" />Face {faceScore.toFixed(0)}%
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {faceNote && (
              <p className={`text-xs flex items-center gap-1.5 ${faceScore != null && faceScore < 40 ? 'text-amber-300' : 'text-slate-400'}`}>
                {faceScore != null && faceScore < 40 ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                {faceNote}
              </p>
            )}

            <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 grid grid-cols-3 text-center">
              <div>
                <p className="text-[10px] text-slate-400 uppercase">Waktu</p>
                <p className="text-white font-mono text-sm">{timeNow}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase">Lokasi</p>
                <p className="text-white text-sm">{gps ? (geofenceLabel(outlet, gps)) : 'Menunggu GPS...'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase">Outlet</p>
                <p className="text-white text-xs truncate px-1">{outlet.name}</p>
              </div>
            </div>

            <button
              onClick={confirmAction}
              disabled={processing}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 disabled:from-slate-600 disabled:to-slate-500 text-white font-bold py-4 rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30"
            >
              {processing
                ? <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin align-middle mr-2" />Memproses...</>
                : <><CheckCircle size={18} className="inline mr-2 align-middle" />Konfirmasi Absen</>}
            </button>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center animate-bounce">
              <CheckCircle size={48} className="text-emerald-400" />
            </div>
            <p className="text-white font-bold text-xl">{msg}</p>
            <p className="text-slate-500 text-xs">Mengembalikan...</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="w-24 h-24 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center">
              <XCircle size={44} className="text-red-400" />
            </div>
            <p className="text-white font-semibold">{msg}</p>
            <button onClick={() => setState('idle')} className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1.5">
              <RefreshCw size={14} /> Coba Lagi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function geofenceLabel(outlet: OutletView, gps: { lat: number; lng: number }): string {
  if (!outlet.latitude || !outlet.longitude) return 'Lokasi tersedia';
  const d = haversineDistance(gps.lat, gps.lng, outlet.latitude, outlet.longitude);
  return d <= (outlet.geofence_radius_meters ?? 300) ? 'Di dalam area' : 'Di luar area';
}

// ─── Face self-registration (no admin needed) ────────────────────────────────
type RegStep = 'front' | 'left' | 'right';
const REG_STEPS: Array<{ key: RegStep; label: string; hint: string }> = [
  { key: 'front', label: 'Depan', hint: 'Hadap kamera langsung' },
  { key: 'left', label: 'Kiri', hint: 'Miringkan sedikit ke kiri' },
  { key: 'right', label: 'Kanan', hint: 'Miringkan sedikit ke kanan' },
];

export function FaceRegisterOverlay({ emp, onClose, onDone }: { emp: EmpView; onClose: () => void; onDone: () => void }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [photos, setPhotos] = useState<Record<string, string | null>>({ front: null, left: null, right: null });
  const [live, setLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const step = REG_STEPS[stepIdx];
  const done = stepIdx >= REG_STEPS.length;
  const allCaptured = REG_STEPS.every((s) => !!photos[s.key]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      setLive(true);
    } catch {
      setMsg('Kamera tidak dapat diakses. Periksa izin kamera di pengaturan browser.');
    }
  };

  useEffect(() => {
    if (live && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [live]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    canvasRef.current.toBlob(async (b) => {
      if (!b) return;
      const fileName = `face_${emp.id}_${step.key}_${Date.now()}.jpg`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('face-photos')
        .upload(fileName, b, { contentType: 'image/jpeg', upsert: true });
      if (uploadErr || !uploadData) { setMsg('Gagal mengunggah foto. Coba lagi.'); return; }
      const url = supabase.storage.from('face-photos').getPublicUrl(uploadData.path).data.publicUrl;
      setPhotos((p) => ({ ...p, [step.key]: url }));
      stopCamera();
      setStepIdx((i) => i + 1);
    }, 'image/jpeg', 0.85);
  };

  const save = async () => {
    if (!allCaptured) return;
    setSaving(true);
    const { error } = await supabase.from('face_profiles').upsert({
      employee_id: emp.id,
      photo_front_url: photos.front,
      photo_left_url: photos.left,
      photo_right_url: photos.right,
      status: 'verified',
      registered_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
    }, { onConflict: 'employee_id' });
    if (!error) {
      await supabase.from('employees').update({ face_registered: true }).eq('id', emp.id);
    }
    setSaving(false);
    if (error) { setMsg(`Gagal menyimpan: ${error.message}`); return; }
    onDone();
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-5 pt-12 pb-2">
        <button onClick={() => { stopCamera(); onClose(); }} className="text-slate-400 hover:text-white text-sm flex items-center gap-1.5">
          <XCircle size={15} /> Batal
        </button>
        <span className="text-white/70 text-sm font-medium">Daftarkan Wajah</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {!done ? (
          <div className="flex flex-col items-center gap-5 pt-2">
            {/* Step indicator */}
            <div className="flex gap-3">
              {REG_STEPS.map((s, i) => (
                <div key={s.key} className={`flex items-center gap-1.5 text-[11px] font-semibold ${i < stepIdx ? 'text-emerald-400' : i === stepIdx ? 'text-white' : 'text-slate-500'}`}>
                  {i < stepIdx ? <CheckCircle size={13} /> : <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${i === stepIdx ? 'bg-blue-600' : 'bg-slate-700'}`}>{i + 1}</span>}
                  {s.label}
                </div>
              ))}
            </div>

            <div className="text-center">
              <p className="text-white font-bold text-lg">Foto {step.label} — hadapkan wajah</p>
              <p className="text-slate-400 text-xs mt-1">{step.hint} · pastikan pencahayaan cukup</p>
            </div>

            {live ? (
              <div className="relative w-full max-w-sm rounded-3xl overflow-hidden bg-black border border-blue-500/50 aspect-[3/4]">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-44 h-52 rounded-full border-4 border-blue-400/70 border-dashed" />
                </div>
                <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                  <span className="bg-black/50 text-white text-[11px] px-3 py-1.5 rounded-full">Posisikan wajah dalam lingkaran</span>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-sm aspect-[3/4] rounded-3xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-3 text-slate-500 bg-slate-900/40">
                <ScanFace size={40} />
                <p className="text-xs">{photos[step.key] ? 'Foto siap — lanjut langkah berikutnya' : `Foto ${step.label} belum diambil`}</p>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />

            {msg && <p className="text-red-400 text-xs text-center">{msg}</p>}

            <div className="flex gap-3 w-full max-w-sm">
              {live ? (
                <>
                  <button onClick={stopCamera} className="flex-1 py-3.5 rounded-2xl border border-white/20 text-white text-sm font-semibold">Ulangi</button>
                  <button onClick={capture} className="flex-[2] py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                    <Camera size={16} /> Ambil Foto {step.label}
                  </button>
                </>
              ) : (
                <button onClick={startCamera} className="w-full py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                  <Camera size={16} /> Buka Kamera
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 pt-4">
            <div className="text-center">
              <p className="text-white font-bold text-lg">Foto wajah terkumpul ✅</p>
              <p className="text-slate-400 text-xs mt-1">3 sudut wajah sudah direkam. Simpan untuk mengaktifkan absen wajah.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
              {REG_STEPS.map((s) => (
                <div key={s.key} className="aspect-[3/4] rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
                  {photos[s.key] ? <img src={photos[s.key]!} alt={s.label} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-slate-600"><Camera size={20} /></div>}
                </div>
              ))}
            </div>
            {msg && <p className="text-red-400 text-xs">{msg}</p>}
            <button onClick={save} disabled={saving}
              className="w-full max-w-sm py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-50">
              {saving ? 'Menyimpan...' : <><ShieldCheck size={18} className="inline mr-2 align-middle" />Simpan & Aktifkan Absen Wajah</>}
            </button>
            <button onClick={() => { stopCamera(); setStepIdx(0); setPhotos({ front: null, left: null, right: null }); setMsg(''); }}
              className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1.5">
              <RefreshCw size={12} /> Foto ulang dari awal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Absen tab ────────────────────────────────────────────────────────────────
export function AbsenTab({ emp, outlet, onOutletChange, onOpenCamera, onRefreshKey }: {
  emp: EmpView; outlet: OutletView; onOutletChange: (o: OutletView) => void; onOpenCamera: () => void; onRefreshKey: number;
}) {
  const [clock, setClock] = useState(new Date());
  const [todayAtt, setTodayAtt] = useState<AttRow | null>(null);
  const [recent, setRecent] = useState<AttRow[]>([]);
  const [shiftInfo, setShiftInfo] = useState<string>('');

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    supabase.from('attendance')
      .select('*, shift:shift_templates(name, start_time, end_time)')
      .eq('employee_id', emp.id)
      .eq('attendance_date', today)
      .maybeSingle()
      .then(({ data }) => setTodayAtt(data as AttRow | null));
    supabase.from('attendance')
      .select('*, shift:shift_templates(name, start_time, end_time)')
      .eq('employee_id', emp.id)
      .order('attendance_date', { ascending: false })
      .limit(7)
      .then(({ data }) => setRecent((data as AttRow[]) ?? []));
  }, [emp.id]);

  useEffect(() => { load(); }, [load, onRefreshKey]);

  useEffect(() => {
    supabase.from('shift_assignments')
      .select('*, shift_template:shift_templates(*)')
      .eq('employee_id', emp.id)
      .lte('effective_date', new Date().toISOString().split('T')[0])
      .or(`end_date.is.null,end_date.gte.${new Date().toISOString().split('T')[0]}`)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const s = data?.shift_template as { name?: string; start_time?: string; end_time?: string } | null;
        setShiftInfo(s ? `${s.name} · ${formatTime(s.start_time)}–${formatTime(s.end_time)}` : '');
      });
  }, [emp.id]);

  const checkedIn = !!todayAtt?.check_in_time;
  const checkedOut = checkedIn && !!todayAtt?.check_out_time;

  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Greeting */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 rounded-3xl p-5 text-white shadow-lg shadow-blue-900/20 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
        <div className="flex items-center justify-between relative">
          <div>
            <p className="text-blue-100 text-xs">Halo, selamat {clock.getHours() < 11 ? 'pagi' : clock.getHours() < 15 ? 'siang' : 'sore'} 👋</p>
            <p className="font-bold text-lg mt-0.5">{emp.full_name.split(' ')[0]}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-bold">{clock.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
            <p className="text-blue-100 text-[11px]">{clock.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-blue-100">
          <MapPin size={13} /> {outlet.name} · {outlet.outlet_code}
        </div>
      </div>

      {/* Outlet switch */}
      {emp.backup_outlet && (
        <div className="flex gap-2">
          {[emp.primary_outlet, emp.backup_outlet].filter(Boolean).map((o) => o && (
            <button
              key={o.id}
              onClick={() => onOutletChange(o)}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                outlet.id === o.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <Building2 size={12} className="inline mr-1 align-middle" /> {o.name}
            </button>
          ))}
        </div>
      )}

      {/* Today status */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-slate-900 text-sm">Absen Hari Ini</p>
          {shiftInfo && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock size={11} /> {shiftInfo}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className={`rounded-2xl p-3.5 ${checkedIn ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'}`}>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Clock In</p>
            <p className={`font-bold text-lg ${checkedIn ? 'text-emerald-700' : 'text-slate-400'}`}>
              {checkedIn ? formatTime(todayAtt?.check_in_time) : '--:--'}
            </p>
            {todayAtt?.check_in_geofence && (
              <Badge className={STATUS_COLORS[todayAtt.check_in_geofence]}>
                <MapPin size={10} className="inline mr-1" />{todayAtt.check_in_geofence}
              </Badge>
            )}
          </div>
          <div className={`rounded-2xl p-3.5 ${checkedOut ? 'bg-orange-50 border border-orange-100' : 'bg-slate-50 border border-slate-100'}`}>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Clock Out</p>
            <p className={`font-bold text-lg ${checkedOut ? 'text-orange-700' : 'text-slate-400'}`}>
              {checkedOut ? formatTime(todayAtt?.check_out_time) : '--:--'}
            </p>
            {checkedOut && todayAtt?.work_duration_minutes != null && (
              <p className="text-[11px] text-orange-600 font-medium">
                {Math.floor(todayAtt.work_duration_minutes / 60)}j {todayAtt.work_duration_minutes % 60}m
              </p>
            )}
          </div>
        </div>

        {/* Big action button */}
        {checkedOut ? (
          <>
            <button
              onClick={onOpenCamera}
              className="w-full rounded-2xl py-4 font-bold text-white text-base bg-gradient-to-r from-blue-600 to-blue-500 shadow-blue-200 active:scale-[0.98] transition-all shadow-lg"
            >
              <LogIn size={18} className="inline mr-2 align-middle" />Clock In Lagi
            </button>
            <p className="text-center text-[11px] text-slate-400 font-medium mt-2 flex items-center justify-center gap-1">
              <RefreshCw size={11} /> Shift sudah selesai — klik untuk check-in sesi baru
            </p>
          </>
        ) : (
          <button
            onClick={onOpenCamera}
            className={`w-full rounded-2xl py-4 font-bold text-white text-base active:scale-[0.98] transition-all shadow-lg ${
              checkedIn
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-orange-200'
                : 'bg-gradient-to-r from-blue-600 to-blue-500 shadow-blue-200 animate-pulse-glow'
            }`}
          >
            {checkedIn ? <><LogOut size={18} className="inline mr-2 align-middle" />Clock Out Sekarang</> : <><LogIn size={18} className="inline mr-2 align-middle" />Clock In Sekarang</>}
          </button>
        )}
        {emp.face_registered ? (
          <p className="text-center text-[11px] text-emerald-600 font-medium mt-3 flex items-center justify-center gap-1">
            <ShieldCheck size={11} /> Absen wajib verifikasi wajah (skor ≥ 40%)
          </p>
        ) : (
          <p className="text-center text-[11px] text-slate-400 font-medium mt-3">
            Absen wajah belum aktif — hubungi HR untuk pendaftaran wajah.
          </p>
        )}
      </div>

      {/* Recent */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
        <p className="font-bold text-slate-900 text-sm mb-3">Riwayat Terakhir</p>
        <div className="space-y-2.5">
          {recent.map((a) => (
            <div key={a.id} className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${STATUS_COLORS[a.status ?? 'present']}`}>
                <Clock size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{formatDate(a.attendance_date)}</p>
                <p className="text-[11px] text-slate-400">
                  {a.shift?.name ?? 'Shift'} · {formatTime(a.check_in_time)} – {formatTime(a.check_out_time)}
                </p>
              </div>
              <Badge className={STATUS_COLORS[a.status ?? 'present']}>{a.status}</Badge>
            </div>
          ))}
          {recent.length === 0 && <p className="text-center text-slate-400 text-sm py-4">Belum ada riwayat absensi</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Jadwal minggu ini tab ────────────────────────────────────────────────────
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

interface WeekDay {
  date: Date;
  iso: string;
  dow: number;
}

function weekDays(): WeekDay[] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { date: d, iso: d.toISOString().split('T')[0], dow: d.getDay() };
  });
}

interface ShiftInfo {
  name?: string;
  start_time?: string;
  end_time?: string;
  is_overnight?: boolean;
}

export function JadwalTab({ emp, outlet }: { emp: EmpView; outlet: OutletView }) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const week = useMemo(weekDays, []);

  useEffect(() => {
    const monday = week[0].iso;
    const sunday = week[6].iso;
    Promise.all([
      supabase.from('shift_assignments')
        .select('*, shift_template:shift_templates(*)')
        .eq('employee_id', emp.id)
        .lte('effective_date', sunday)
        .or(`end_date.is.null,end_date.gte.${monday}`),
      supabase.from('outlet_schedules')
        .select('*, shift_template:shift_templates(*)')
        .eq('outlet_id', outlet.id)
        .eq('is_active', true),
    ]).then(([{ data: assigns }, { data: scheds }]) => {
      setAssignments(assigns ?? []);
      setSchedules(scheds ?? []);
      setLoaded(true);
    });
  }, [emp.id, outlet.id, week]);

  const shiftFor = (iso: string, dow: number): ShiftInfo | null => {
    const active = assignments
      .filter((a) => a.effective_date <= iso && (!a.end_date || a.end_date >= iso))
      .sort((a: any, b: any) => (a.effective_date < b.effective_date ? 1 : -1));
    if (active.length && active[0].shift_template) return active[0].shift_template as ShiftInfo;
    const sched = schedules.find((s) => s.day_of_week === dow);
    return (sched?.shift_template as ShiftInfo | undefined) ?? null;
  };

  const todayIso = new Date().toISOString().split('T')[0];
  const workCount = week.filter((d) => shiftFor(d.iso, d.dow)).length;

  return (
    <div className="px-4 pt-4 space-y-4">
      {/* Week header */}
      <div className="bg-gradient-to-br from-indigo-700 via-blue-700 to-blue-600 rounded-3xl p-5 text-white shadow-lg shadow-indigo-900/20 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-xl" />
        <div className="flex items-center justify-between relative">
          <div>
            <p className="text-blue-100 text-xs">Jadwal Minggu Ini</p>
            <p className="font-bold text-lg mt-0.5">
              {week[0].date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – {week[6].date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-blue-100 text-[11px] flex items-center gap-1 mt-1.5">
              <Building2 size={11} /> {outlet.name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{workCount}</p>
            <p className="text-blue-100 text-[11px]">hari kerja</p>
          </div>
        </div>
      </div>

      {/* Day list */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {week.map((d) => {
          const shift = shiftFor(d.iso, d.dow);
          const isToday = d.iso === todayIso;
          return (
            <div
              key={d.iso}
              className={`flex items-center gap-3 px-4 py-3.5 ${isToday ? 'bg-blue-50/70' : ''} ${d.iso !== week[0].iso ? 'border-t border-slate-50' : ''}`}
            >
              <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${isToday ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-slate-100 text-slate-600'}`}>
                <span className="text-[9px] font-bold uppercase tracking-wide">{DAY_NAMES[d.dow].slice(0, 3)}</span>
                <span className="text-base font-bold leading-none mt-0.5">{d.date.getDate()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {isToday ? 'Hari ini' : d.date.toLocaleDateString('id-ID', { weekday: 'long' })}
                </p>
                {shift ? (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                    <Clock size={11} className="flex-shrink-0" /> {shift.name ?? 'Shift'} · {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                    {shift.is_overnight && <span className="text-indigo-500 font-semibold">(malam)</span>}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <CalendarDays size={11} /> Tidak ada shift — hari libur
                  </p>
                )}
              </div>
              {shift ? (
                <Badge className={isToday ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-600'}>
                  {isToday ? 'Hari ini' : formatTime(shift.start_time)}
                </Badge>
              ) : (
                <Badge className={isToday ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}>Libur</Badge>
              )}
            </div>
          );
        })}
      </div>

      {!loaded && (
        <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
          <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" /> Memuat jadwal...
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center pb-2">
        Jadwal dapat berubah sewaktu-waktu — konfirmasi ke supervisor outlet untuk kepastian.
      </p>
    </div>
  );
}
