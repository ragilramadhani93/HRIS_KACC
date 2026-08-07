import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, XCircle, MapPin, RefreshCw, User, LogIn, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { haversineDistance, STATUS_COLORS } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { findBestMatch } from '../../lib/faceMatch';
import type { FaceProfile } from '../../lib/faceMatch';
import type { Employee, Outlet, ShiftTemplate } from '../../lib/database.types';

type KioskState =
  | 'select_outlet'   // choose which outlet this kiosk is for
  | 'idle'            // waiting for someone to tap
  | 'capturing'       // webcam open
  | 'matching'        // face matching in progress (simulated)
  | 'confirm'         // show matched employee, confirm check-in/out
  | 'success'         // success screen
  | 'error';          // error / no match

interface MatchedEmployee {
  employee: Employee;
  action: 'check_in' | 'check_out';
  existingAttId?: string;
}

// (face matching is now done client-side via faceMatch.ts)

export function KioskPage() {
  const [state, setState] = useState<KioskState>('idle');
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [matched, setMatched] = useState<MatchedEmployee | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [clock, setClock] = useState(new Date());
  const [processing, setProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load outlets
  useEffect(() => {
    supabase.from('outlets').select('*, area:areas(name, region:regions(name))').eq('is_active', true).order('name')
      .then(({ data }) => {
        setOutlets(data ?? []);
        if (data?.length === 1) setSelectedOutlet(data[0] as Outlet);
      });
  }, []);

  // Get GPS continuously when a outlet is selected
  useEffect(() => {
    if (!selectedOutlet) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true },
    );
  }, [selectedOutlet]);

  // Reset to idle after success/error
  useEffect(() => {
    if (state === 'success' || state === 'error') {
      const t = setTimeout(() => {
        setState('idle');
        setMatched(null);
        setCapturedPhoto(null);
        setCapturedBlob(null);
        setSuccessMsg('');
        setErrorMsg('');
        stopCamera();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      streamRef.current = stream;
      setState('capturing');
    } catch {
      setErrorMsg('Kamera tidak dapat diakses. Pastikan izin kamera sudah diberikan di browser.');
      setState('error');
    }
  };

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
    if (!videoRef.current || !canvasRef.current || !selectedOutlet) return;
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

      // Load verified face profiles for this outlet
      const { data: fps } = await supabase
        .from('face_profiles')
        .select('*, employee:employees!inner(*, primary_outlet:outlets!primary_outlet_id(*))')
        .eq('status', 'verified');

      const allProfiles = (fps ?? []) as FaceProfile[];
      const outletProfiles = allProfiles.filter((fp) => {
        const emp = fp.employee as Employee;
        return (emp as any).primary_outlet_id === selectedOutlet.id || (emp as any).backup_outlet_id === selectedOutlet.id;
      });

      const candidates = outletProfiles.length > 0 ? outletProfiles : allProfiles;

      if (!candidates.length) {
        setErrorMsg('Belum ada wajah terdaftar & terverifikasi. Hubungi Admin.');
        setState('error');
        return;
      }

      const result = await findBestMatch(blob, candidates);
      const conf = result?.confidence ?? 0;
      const employee = result ? (result.profile.employee as Employee) : null;

      if (!employee || conf < 40) {
        setErrorMsg(`Wajah tidak dikenali (skor ${conf.toFixed(0)}%). Pastikan pencahayaan cukup dan posisi wajah jelas.`);
        setState('error');
        return;
      }

      setConfidence(conf);

      // Check today's attendance
      const today = new Date().toISOString().split('T')[0];
      const { data: att } = await supabase.from('attendance').select('*').eq('employee_id', employee.id).eq('attendance_date', today).maybeSingle();

      const action: 'check_in' | 'check_out' = att && att.check_in_time && !att.check_out_time ? 'check_out' : 'check_in';
      setMatched({ employee, action, existingAttId: att?.id });
      setState('confirm');
    }, 'image/jpeg', 0.85);
  };

  const confirmAction = async () => {
    if (!matched || !selectedOutlet || !capturedBlob) return;
    setProcessing(true);

    const { employee, action, existingAttId } = matched;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Upload photo
    const fileName = `kiosk_${employee.id}_${action}_${Date.now()}.jpg`;
    const { data: uploadData } = await supabase.storage
      .from('attendance-photos')
      .upload(fileName, capturedBlob, { contentType: 'image/jpeg' });

    const photoUrl = uploadData
      ? supabase.storage.from('attendance-photos').getPublicUrl(uploadData.path).data.publicUrl
      : null;

    // Geofence check
    const geofence = gpsLocation && selectedOutlet.latitude && selectedOutlet.longitude
      ? haversineDistance(gpsLocation.lat, gpsLocation.lng, selectedOutlet.latitude!, selectedOutlet.longitude!) <= selectedOutlet.geofence_radius_meters
        ? 'inside' as const : 'outside' as const
      : 'unknown' as const;

    if (action === 'check_in') {
      // Get current shift
      const { data: shiftAssign } = await supabase.from('shift_assignments')
        .select('*, shift_template:shift_templates(*)')
        .eq('employee_id', employee.id)
        .lte('effective_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();

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
        outlet_id: selectedOutlet.id,
        shift_template_id: shift?.id ?? null,
        attendance_date: today,
        check_in_time: now.toISOString(),
        check_in_lat: gpsLocation?.lat ?? null,
        check_in_lng: gpsLocation?.lng ?? null,
        check_in_geofence: geofence,
        check_in_selfie_url: photoUrl,
        check_in_face_score: parseFloat(confidence.toFixed(2)),
        status,
      }, { onConflict: 'employee_id,attendance_date' });

      if (error) { setErrorMsg(`Check-in gagal: ${error.message}`); setState('error'); }
      else {
        setSuccessMsg(`Check-in berhasil${status === 'late' ? ' (Terlambat)' : ''}! Selamat bekerja, ${employee.full_name.split(' ')[0]}.`);
        setState('success');
      }
    } else {
      // Check out
      const checkIn = await supabase.from('attendance').select('check_in_time').eq('id', existingAttId!).maybeSingle();
      const durationMinutes = checkIn.data?.check_in_time
        ? Math.floor((now.getTime() - new Date(checkIn.data.check_in_time).getTime()) / 60000)
        : 0;

      const { error } = await supabase.from('attendance').update({
        check_out_time: now.toISOString(),
        check_out_lat: gpsLocation?.lat ?? null,
        check_out_lng: gpsLocation?.lng ?? null,
        check_out_geofence: geofence,
        check_out_selfie_url: photoUrl,
        work_duration_minutes: durationMinutes,
      }).eq('id', existingAttId!);

      if (error) { setErrorMsg(`Check-out gagal: ${error.message}`); setState('error'); }
      else {
        const h = Math.floor(durationMinutes / 60);
        const m = durationMinutes % 60;
        setSuccessMsg(`Check-out berhasil! Total kerja ${h}j ${m}m. Terima kasih, ${employee.full_name.split(' ')[0]}!`);
        setState('success');
      }
    }
    setProcessing(false);
  };

  // ─── Outlet Selection ─────────────────────────────────────
  if (!selectedOutlet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-8">
        <div className="flex items-center gap-3 mb-8">
          <img src="/kapal-api-logo.png" alt="Kapal Api" className="h-12 w-auto" />
          <div>
            <p className="text-white font-bold text-xl">Kapal Api Coffee Corner</p>
            <p className="text-blue-300 text-sm">Sistem Absensi Wajah</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Pilih Outlet</h2>
          <p className="text-sm text-slate-500 mb-4">Pilih outlet tempat kiosk ini dipasang.</p>
          <div className="space-y-2">
            {outlets.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelectedOutlet(o)}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-100 hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
              >
                <MapPin size={18} className="text-blue-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">{o.name}</p>
                  <p className="text-xs text-slate-400">{o.outlet_code}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Kiosk UI ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <img src="/kapal-api-logo.png" alt="Kapal Api" className="h-10 w-auto" />
          <div>
            <p className="text-white font-bold">Kapal Api Coffee Corner</p>
            <p className="text-blue-300 text-xs flex items-center gap-1">
              <MapPin size={10} /> {selectedOutlet.name}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white text-2xl font-bold font-mono">{clock.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <p className="text-blue-300 text-xs">{clock.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex items-center justify-center p-8">
        {/* IDLE */}
        {state === 'idle' && (
          <div className="text-center">
            <div className="w-40 h-40 rounded-full border-4 border-dashed border-blue-400/40 flex items-center justify-center mx-auto mb-8 animate-pulse">
              <User size={64} className="text-blue-400/60" />
            </div>
            <h1 className="text-white text-3xl font-bold mb-2">Tap untuk Absen</h1>
            <p className="text-blue-300 text-sm mb-8">Posisikan wajah Anda di depan kamera</p>
            <button
              onClick={startCamera}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg px-10 py-4 rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto"
            >
              <Camera size={24} /> Mulai Absen
            </button>
          </div>
        )}

        {/* CAPTURING */}
        {state === 'capturing' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-lg">
            <h2 className="text-white text-2xl font-bold">Posisikan Wajah Anda</h2>
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 w-full aspect-video shadow-2xl border-2 border-blue-500">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {/* Face guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-72 rounded-full border-4 border-blue-400/60 border-dashed" />
              </div>
              <div className="absolute top-4 left-0 right-0 flex justify-center">
                <div className="bg-black/40 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">
                  Pastikan wajah terlihat jelas dan pencahayaan cukup
                </div>
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-4">
              <button onClick={() => { stopCamera(); setState('idle'); }} className="text-white/60 hover:text-white text-sm flex items-center gap-2">
                <XCircle size={16} /> Batal
              </button>
              <button
                onClick={captureAndMatch}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105"
              >
                <Camera size={18} /> Ambil Foto & Kenali
              </button>
            </div>
          </div>
        )}

        {/* MATCHING */}
        {state === 'matching' && (
          <div className="flex flex-col items-center gap-6">
            {capturedPhoto && (
              <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-blue-400 shadow-2xl">
                <img src={capturedPhoto} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white text-xl font-semibold">Mencocokkan Wajah...</p>
              <p className="text-blue-300 text-sm mt-1">Mohon tunggu sebentar</p>
            </div>
          </div>
        )}

        {/* CONFIRM */}
        {state === 'confirm' && matched && (
          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <div className="flex items-center gap-4 w-full bg-white/10 backdrop-blur-sm rounded-2xl p-6">
              {capturedPhoto ? (
                <img src={capturedPhoto} alt="" className="w-20 h-20 rounded-full object-cover border-3 border-blue-400 shadow-lg flex-shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                  {matched.employee.full_name.charAt(0)}
                </div>
              )}
              <div>
                <p className="text-white text-xl font-bold">{matched.employee.full_name}</p>
                <p className="text-blue-300 text-sm">{matched.employee.job_title ?? matched.employee.employee_code}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={`${STATUS_COLORS[matched.action === 'check_in' ? 'present' : 'early_leave']} text-sm`}>
                    {matched.action === 'check_in' ? <LogIn size={12} className="mr-1 inline" /> : <LogOut size={12} className="mr-1 inline" />}
                    {matched.action === 'check_in' ? 'CHECK IN' : 'CHECK OUT'}
                  </Badge>
                  <span className="text-blue-300 text-xs">Face {confidence.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <p className="text-blue-200 text-sm">{new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>

            <div className="flex gap-4">
              <button
                onClick={() => { setMatched(null); setCapturedPhoto(null); setState('idle'); }}
                className="border border-white/30 text-white px-6 py-3 rounded-xl hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <XCircle size={16} /> Bukan Saya
              </button>
              <button
                onClick={confirmAction}
                disabled={processing}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
              >
                {processing ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Memproses...</>
                ) : (
                  <><CheckCircle size={18} /> Konfirmasi</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {state === 'success' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center animate-bounce">
              <CheckCircle size={48} className="text-white" />
            </div>
            <div>
              <h2 className="text-white text-3xl font-bold">{successMsg}</h2>
              <p className="text-emerald-300 mt-2 text-sm">Halaman akan kembali otomatis...</p>
            </div>
          </div>
        )}

        {/* ERROR */}
        {state === 'error' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-24 h-24 rounded-full bg-red-500/80 flex items-center justify-center">
              <XCircle size={48} className="text-white" />
            </div>
            <div>
              <h2 className="text-white text-2xl font-bold">{errorMsg || 'Terjadi kesalahan'}</h2>
              <p className="text-red-300 mt-2 text-sm">Halaman akan kembali otomatis...</p>
            </div>
            <button onClick={() => setState('idle')} className="text-white/60 hover:text-white text-sm flex items-center gap-2">
              <RefreshCw size={14} /> Coba Lagi
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center pb-4">
        <p className="text-slate-600 text-xs">Kapal Api Coffee Corner · {selectedOutlet.name}</p>
      </div>
    </div>
  );
}
