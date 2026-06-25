import React, { useEffect, useRef, useState } from 'react';
import { GitBranch, Eye, EyeOff, Mail, Lock, Camera, CheckCircle, XCircle, RefreshCw, User, LogIn, LogOut, ChevronLeft } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { haversineDistance, STATUS_COLORS } from '../../lib/utils';
import type { Employee, Outlet, ShiftTemplate } from '../../lib/database.types';
import { findBestMatch } from '../../lib/faceMatch';
import type { FaceProfile } from '../../lib/faceMatch';

// ─── Inline Kiosk Panel ───────────────────────────────────────────────────────
type KioskState = 'idle' | 'capturing' | 'matching' | 'confirm' | 'success' | 'error';

interface MatchResult {
  employee: Employee;
  action: 'check_in' | 'check_out';
  existingAttId?: string;
}

function KioskPanel({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<KioskState>('idle');
  const [matched, setMatched] = useState<MatchResult | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [processing, setProcessing] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // GPS
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true },
    );
  }, []);

  // Auto-reset
  useEffect(() => {
    if (state === 'success' || state === 'error') {
      const t = setTimeout(() => {
        setState('idle');
        setMatched(null);
        setCapturedPhoto(null);
        setCapturedBlob(null);
        stopCamera();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      setState('capturing');
    } catch {
      setErrorMsg('Kamera tidak dapat diakses. Pastikan izin kamera sudah diberikan di browser.');
      setState('error');
    }
  };

  // Attach stream to video element after 'capturing' state renders the <video> tag
  useEffect(() => {
    if (state === 'capturing' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [state]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const captureAndMatch = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      setCapturedPhoto(dataUrl);
      setCapturedBlob(blob);
      stopCamera();
      setState('matching');

      const { data: fps } = await supabase
        .from('face_profiles')
        .select('*, employee:employees(*, primary_outlet:outlets!primary_outlet_id(*))')
        .eq('status', 'verified');

      if (!fps?.length) {
        setErrorMsg('Belum ada wajah terdaftar & terverifikasi. Hubungi Admin.');
        setState('error');
        return;
      }

      const result = await findBestMatch(blob, fps as FaceProfile[]);
      const conf = result?.confidence ?? 0;
      const emp  = result ? (result.profile.employee as Employee) : null;

      if (!emp || conf < 40) {
        setErrorMsg(`Wajah tidak dikenali (skor ${conf.toFixed(0)}%). Pastikan pencahayaan cukup dan posisi wajah jelas, lalu coba lagi.`);
        setState('error');
        return;
      }

      setConfidence(conf);
      const today = new Date().toISOString().split('T')[0];
      const { data: att } = await supabase.from('attendance').select('*').eq('employee_id', employee.id).eq('attendance_date', today).maybeSingle();
      const action: 'check_in' | 'check_out' = att?.check_in_time && !att?.check_out_time ? 'check_out' : 'check_in';
      setMatched({ employee, action, existingAttId: att?.id });
      setState('confirm');
    }, 'image/jpeg', 0.85);
  };

  const confirmAction = async () => {
    if (!matched || !capturedBlob) return;
    setProcessing(true);
    const { employee, action, existingAttId } = matched;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Upload selfie
    const fileName = `kiosk_${employee.id}_${action}_${Date.now()}.jpg`;
    const { data: uploadData } = await supabase.storage.from('attendance-photos').upload(fileName, capturedBlob, { contentType: 'image/jpeg' });
    const photoUrl = uploadData ? supabase.storage.from('attendance-photos').getPublicUrl(uploadData.path).data.publicUrl : null;

    // Geofence vs primary outlet
    const outlet = employee.primary_outlet as Outlet | null;
    const geofence = gps && outlet?.latitude && outlet?.longitude
      ? haversineDistance(gps.lat, gps.lng, outlet.latitude, outlet.longitude) <= outlet.geofence_radius_meters
        ? 'inside' as const : 'outside' as const
      : 'unknown' as const;

    if (action === 'check_in') {
      const { data: shiftAssign } = await supabase.from('shift_assignments')
        .select('*, shift_template:shift_templates(*)')
        .eq('employee_id', employee.id)
        .lte('effective_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('effective_date', { ascending: false })
        .limit(1).maybeSingle();
      const shift = shiftAssign?.shift_template as ShiftTemplate | null;

      let status: 'present' | 'late' = 'present';
      if (shift) {
        const [h, m] = shift.start_time.split(':').map(Number);
        const shiftStart = new Date(now);
        shiftStart.setHours(h, m + shift.late_tolerance_minutes, 0, 0);
        if (now > shiftStart) status = 'late';
      }

      const { error } = await supabase.from('attendance').upsert({
        employee_id: employee.id,
        outlet_id: outlet?.id ?? null,
        shift_template_id: shift?.id ?? null,
        attendance_date: today,
        check_in_time: now.toISOString(),
        check_in_lat: gps?.lat ?? null,
        check_in_lng: gps?.lng ?? null,
        check_in_geofence: geofence,
        check_in_selfie_url: photoUrl,
        check_in_face_score: parseFloat(confidence.toFixed(2)),
        status,
      }, { onConflict: 'employee_id,attendance_date' });

      if (error) { setErrorMsg(`Gagal check-in: ${error.message}`); setState('error'); }
      else {
        setSuccessMsg(`Selamat datang, ${employee.full_name.split(' ')[0]}! ${status === 'late' ? '⚠️ Terlambat' : '✓ Tepat waktu'}`);
        setState('success');
      }
    } else {
      const { data: attRow } = await supabase.from('attendance').select('check_in_time').eq('id', existingAttId!).maybeSingle();
      const dur = attRow?.check_in_time ? Math.floor((now.getTime() - new Date(attRow.check_in_time).getTime()) / 60000) : 0;

      const { error } = await supabase.from('attendance').update({
        check_out_time: now.toISOString(),
        check_out_lat: gps?.lat ?? null,
        check_out_lng: gps?.lng ?? null,
        check_out_geofence: geofence,
        check_out_selfie_url: photoUrl,
        work_duration_minutes: dur,
      }).eq('id', existingAttId!);

      if (error) { setErrorMsg(`Gagal check-out: ${error.message}`); setState('error'); }
      else {
        const h = Math.floor(dur / 60), m = dur % 60;
        setSuccessMsg(`Sampai jumpa, ${employee.full_name.split(' ')[0]}! Total kerja ${h}j ${m}m.`);
        setState('success');
      }
    }
    setProcessing(false);
  };

  return (
    <div className="flex flex-col">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm mb-4 self-start transition-colors">
        <ChevronLeft size={16} /> Kembali ke Login
      </button>

      <h2 className="text-xl font-bold text-slate-900 mb-1">Kiosk Absensi</h2>
      <p className="text-sm text-slate-500 mb-5">Arahkan wajah ke kamera untuk absen otomatis.</p>

      {/* IDLE */}
      {state === 'idle' && (
        <div className="flex flex-col items-center gap-5 py-4">
          <div className="w-28 h-28 rounded-full border-4 border-dashed border-blue-200 flex items-center justify-center animate-pulse bg-blue-50">
            <User size={44} className="text-blue-300" />
          </div>
          <p className="text-slate-500 text-sm text-center">Klik tombol di bawah lalu hadapkan wajah ke kamera</p>
          <button
            onClick={startCamera}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md"
          >
            <Camera size={20} /> Mulai Absen Wajah
          </button>
        </div>
      )}

      {/* CAPTURING */}
      {state === 'capturing' && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 aspect-video shadow-inner border border-slate-700">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-36 h-44 rounded-full border-4 border-dashed border-blue-400/70" />
            </div>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full">Posisikan wajah dalam lingkaran</span>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex w-full gap-2">
            <button onClick={() => { stopCamera(); setState('idle'); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              <XCircle size={15} /> Batal
            </button>
            <button onClick={captureAndMatch} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
              <Camera size={15} /> Ambil & Kenali
            </button>
          </div>
        </div>
      )}

      {/* MATCHING */}
      {state === 'matching' && (
        <div className="flex flex-col items-center gap-4 py-6">
          {capturedPhoto && (
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-blue-400 shadow-lg">
              <img src={capturedPhoto} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Mencocokkan wajah...</p>
          <p className="text-slate-400 text-xs">Mohon tunggu sebentar</p>
        </div>
      )}

      {/* CONFIRM */}
      {state === 'confirm' && matched && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-full bg-slate-50 rounded-xl p-4 flex items-center gap-4">
            {capturedPhoto ? (
              <img src={capturedPhoto} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-blue-300 flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {matched.employee.full_name.charAt(0)}
              </div>
            )}
            <div>
              <p className="font-bold text-slate-900">{matched.employee.full_name}</p>
              <p className="text-sm text-slate-500">{matched.employee.job_title ?? matched.employee.employee_code}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge className={matched.action === 'check_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}>
                  {matched.action === 'check_in'
                    ? <><LogIn size={11} className="inline mr-1" />CHECK IN</>
                    : <><LogOut size={11} className="inline mr-1" />CHECK OUT</>
                  }
                </Badge>
                <span className="text-xs text-slate-400">Face {confidence.toFixed(0)}%</span>
              </div>
            </div>
          </div>
          <p className="text-slate-500 text-sm font-mono">
            {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <div className="flex w-full gap-2">
            <button
              onClick={() => { setMatched(null); setCapturedPhoto(null); setState('idle'); }}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <XCircle size={15} /> Bukan Saya
            </button>
            <button
              onClick={confirmAction}
              disabled={processing}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {processing
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Memproses...</>
                : <><CheckCircle size={15} />Konfirmasi</>
              }
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {state === 'success' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle size={40} className="text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-lg">{successMsg}</p>
            <p className="text-slate-400 text-xs mt-1">Kembali otomatis dalam 4 detik...</p>
          </div>
        </div>
      )}

      {/* ERROR */}
      {state === 'error' && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle size={40} className="text-red-500" />
          </div>
          <div>
            <p className="font-bold text-slate-900">{errorMsg || 'Terjadi kesalahan'}</p>
            <p className="text-slate-400 text-xs mt-1">Kembali otomatis dalam 4 detik...</p>
          </div>
          <button onClick={() => setState('idle')} className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1.5 font-medium">
            <RefreshCw size={13} /> Coba Lagi
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'kiosk'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-blue-400/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg">
            <GitBranch size={30} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">SmartHRIS</h1>
          <p className="text-slate-400 mt-1 text-sm">Enterprise Workforce Management</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              Login Admin / Staff
            </button>
            <button
              onClick={() => setMode('kiosk')}
              className={`flex-1 py-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                mode === 'kiosk'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Camera size={14} /> Absen Wajah
            </button>
          </div>

          <div className="p-8">
            {mode === 'login' && (
              <>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Selamat Datang</h2>
                <p className="text-sm text-slate-500 mb-6">Masuk dengan akun yang diberikan oleh Admin.</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    label="Email"
                    type="email"
                    placeholder="nama@perusahaan.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    leftIcon={<Mail size={16} />}
                    required
                  />
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    leftIcon={<Lock size={16} />}
                    rightIcon={
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                    required
                  />

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <Button type="submit" loading={loading} className="w-full" size="lg">
                    Masuk
                  </Button>
                </form>

                <p className="text-center text-xs text-slate-400 mt-6">
                  Hubungi Admin untuk mendapatkan akses akun.
                </p>
              </>
            )}

            {mode === 'kiosk' && (
              <KioskPanel onBack={() => setMode('login')} />
            )}
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          &copy; 2026 SmartHRIS. All rights reserved.
        </p>
      </div>
    </div>
  );
}
