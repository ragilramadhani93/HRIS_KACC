import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertCircle, MapPin, RefreshCw, X, ShieldCheck, ShieldX, Clock, Download, Search, Filter } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Table } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useToast } from '../ui/Toast';
import { haversineDistance, formatDate, STATUS_COLORS, createNotification } from '../../lib/utils';
import type { Attendance, Employee, Outlet, ShiftTemplate } from '../../lib/database.types';

// ─── Webcam capture ────────────────────────────────────────
function WebcamCapture({
  onCapture,
  onClose,
  label = 'Take Photo',
}: {
  onCapture: (blob: Blob, dataUrl: string) => void;
  onClose: () => void;
  label?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      .then((s) => {
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; setStreaming(true); }
      })
      .catch(() => setError('Camera access denied or not available'));

    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
    canvasRef.current.toBlob((blob) => { if (blob) onCapture(blob, dataUrl); }, 'image/jpeg', 0.85);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 text-sm w-full">
          <AlertCircle size={24} className="mx-auto mb-2" />
          {error}
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-slate-900 w-full aspect-video">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {!streaming && <div className="absolute inset-0 flex items-center justify-center text-white text-sm">Loading camera...</div>}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-60 rounded-full border-2 border-dashed border-white/40" />
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex gap-3">
        <Button variant="outline" onClick={onClose}><X size={14} /> Cancel</Button>
        <Button onClick={capture} disabled={!streaming}><Camera size={14} /> {label}</Button>
      </div>
    </div>
  );
}

// ─── Face Registration ─────────────────────────────────────
export function FaceRegistrationPage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [faceProfiles, setFaceProfiles] = useState<Record<string, { status: string; registered_at: string | null }>>({});
  const [selectedEmp, setSelectedEmp] = useState('');
  const [photos, setPhotos] = useState<{ front?: string; left?: string; right?: string }>({});
  const [capturing, setCapturing] = useState<'front' | 'left' | 'right' | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // Admin verification
  const [verifyModal, setVerifyModal] = useState<{ empId: string; name: string; profile: { photo_front_url?: string | null; photo_left_url?: string | null; photo_right_url?: string | null; id: string } } | null>(null);
  const { role } = useAuth();
  const isAdmin = role && ['super_admin', 'hr_admin'].includes(role);

  const load = async () => {
    setLoading(true);
    const [{ data: emps }, { data: fps }] = await Promise.all([
      supabase.from('employees').select('id, full_name, employee_code, face_registered').eq('status', 'active').order('full_name'),
      supabase.from('face_profiles').select('employee_id, status, registered_at, photo_front_url, photo_left_url, photo_right_url, id'),
    ]);
    setEmployees((emps as Employee[]) ?? []);
    const fpMap: Record<string, { status: string; registered_at: string | null; photo_front_url?: string | null; photo_left_url?: string | null; photo_right_url?: string | null; id: string }> = {};
    (fps ?? []).forEach((fp) => { fpMap[fp.employee_id] = fp as { status: string; registered_at: string | null; photo_front_url?: string | null; photo_left_url?: string | null; photo_right_url?: string | null; id: string }; });
    setFaceProfiles(fpMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCapture = async (type: 'front' | 'left' | 'right', blob: Blob) => {
    setCapturing(null);
    const fileName = `face_${selectedEmp}_${type}_${Date.now()}.jpg`;
    const { data, error } = await supabase.storage.from('face-photos').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) { toast('error', 'Upload failed', error.message); return; }
    const { data: urlData } = supabase.storage.from('face-photos').getPublicUrl(data.path);
    setPhotos((prev) => ({ ...prev, [type]: urlData.publicUrl }));
    toast('success', `${type.charAt(0).toUpperCase() + type.slice(1)} photo captured`);
  };

  const handleSave = async () => {
    if (!selectedEmp) return toast('error', 'Select an employee first');
    if (!photos.front || !photos.left || !photos.right) return toast('error', 'All three photos required');
    setSaving(true);
    const { error } = await supabase.from('face_profiles').upsert({
      employee_id: selectedEmp,
      photo_front_url: photos.front,
      photo_left_url: photos.left,
      photo_right_url: photos.right,
      status: 'pending',
      registered_at: new Date().toISOString(),
    }, { onConflict: 'employee_id' });
    if (error) { toast('error', 'Save failed', error.message); setSaving(false); return; }
    await supabase.from('employees').update({ face_registered: true }).eq('id', selectedEmp);
    toast('success', 'Face profile registered — pending admin verification');
    setPhotos({});
    setSelectedEmp('');
    load();
    setSaving(false);
  };

  const handleVerify = async (empId: string, action: 'verified' | 'rejected') => {
    const { error } = await supabase.from('face_profiles').update({
      status: action,
      verified_at: action === 'verified' ? new Date().toISOString() : null,
    }).eq('employee_id', empId);
    if (error) { toast('error', 'Failed', error.message); return; }
    toast('success', `Face profile ${action}`);
    setVerifyModal(null);
    load();
  };

  const photoSteps = [
    { key: 'front' as const, label: 'Front', hint: 'Face camera directly' },
    { key: 'left' as const, label: 'Left', hint: 'Turn slightly left' },
    { key: 'right' as const, label: 'Right', hint: 'Turn slightly right' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Face Profile Registration</h2>
        <p className="text-sm text-slate-500 mb-4">Register 3-angle face photos for an employee. After registration, an admin must verify the profile before it can be used for attendance.</p>
        <select
          value={selectedEmp}
          onChange={(e) => { setSelectedEmp(e.target.value); setPhotos({}); }}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Employee to Register</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
          ))}
        </select>
      </Card>

      {selectedEmp && (
        <Card>
          <h3 className="font-semibold text-slate-800 mb-1">Capture Photos</h3>
          <p className="text-sm text-slate-500 mb-4">Take photos in a well-lit environment. Remove glasses or headwear if possible.</p>
          <div className="grid grid-cols-3 gap-4">
            {photoSteps.map(({ key, label, hint }) => (
              <div key={key} className="flex flex-col items-center gap-2">
                <div className={`w-full aspect-square rounded-xl border-2 overflow-hidden flex items-center justify-center transition-all ${photos[key] ? 'border-emerald-400' : 'border-dashed border-slate-200 bg-slate-50'}`}>
                  {photos[key] ? (
                    <img src={photos[key]} alt={label} className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={32} className="text-slate-300" />
                  )}
                </div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-slate-400 text-center">{hint}</p>
                <Button size="sm" variant={photos[key] ? 'secondary' : 'primary'} onClick={() => setCapturing(key)}>
                  {photos[key] ? <RefreshCw size={12} /> : <Camera size={12} />}
                  {photos[key] ? 'Retake' : 'Capture'}
                </Button>
                {photos[key] && <CheckCircle size={16} className="text-emerald-500" />}
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end">
            <Button onClick={handleSave} loading={saving} disabled={!photos.front || !photos.left || !photos.right}>
              <CheckCircle size={16} /> Save Face Profile
            </Button>
          </div>
        </Card>
      )}

      <Modal isOpen={!!capturing} onClose={() => setCapturing(null)} title={`Capture ${capturing ? capturing.charAt(0).toUpperCase() + capturing.slice(1) : ''} Photo`} size="md">
        {capturing && <WebcamCapture label={`Capture ${capturing}`} onCapture={(blob) => handleCapture(capturing, blob)} onClose={() => setCapturing(null)} />}
      </Modal>

      {/* Verification table (admin only) */}
      <Card padding={false}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Face Profile Status</h3>
          {isAdmin && <Badge className="bg-amber-100 text-amber-700">{employees.filter((e) => faceProfiles[e.id]?.status === 'pending').length} pending verification</Badge>}
        </div>
        <Table
          loading={loading}
          rowKey={(e) => e.id}
          data={employees}
          columns={[
            { key: 'full_name', header: 'Employee', render: (e) => <span className="font-medium">{e.full_name}</span> },
            { key: 'employee_code', header: 'Code', render: (e) => <span className="font-mono text-xs text-slate-500">{e.employee_code}</span> },
            {
              key: 'status', header: 'Status',
              render: (e) => {
                const fp = faceProfiles[e.id];
                if (!fp) return <Badge className="bg-slate-100 text-slate-500">Not Registered</Badge>;
                return <Badge className={STATUS_COLORS[fp.status]}>{fp.status.charAt(0).toUpperCase() + fp.status.slice(1)}</Badge>;
              },
            },
            {
              key: 'photos', header: 'Photos',
              render: (e) => {
                const fp = faceProfiles[e.id] as { photo_front_url?: string | null; photo_left_url?: string | null; photo_right_url?: string | null; id?: string } | undefined;
                if (!fp?.photo_front_url) return <span className="text-xs text-slate-400">-</span>;
                return (
                  <div className="flex gap-1">
                    {[fp.photo_front_url, fp.photo_left_url, fp.photo_right_url].filter(Boolean).map((url, i) => (
                      <img key={i} src={url!} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200" />
                    ))}
                  </div>
                );
              },
            },
            {
              key: 'actions', header: '',
              render: (e) => {
                if (!isAdmin) return null;
                const fp = faceProfiles[e.id] as { photo_front_url?: string | null; photo_left_url?: string | null; photo_right_url?: string | null; id: string; status?: string } | undefined;
                if (!fp || fp.status === 'verified') return null;
                return (
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="text-emerald-600 hover:bg-emerald-50"
                      onClick={() => setVerifyModal({ empId: e.id, name: e.full_name, profile: fp })}>
                      <ShieldCheck size={14} /> Verify
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50"
                      onClick={() => handleVerify(e.id, 'rejected')}>
                      <ShieldX size={14} /> Reject
                    </Button>
                  </div>
                );
              },
            },
          ]}
        />
      </Card>

      {/* Verify modal */}
      {verifyModal && (
        <Modal isOpen onClose={() => setVerifyModal(null)} title={`Verify: ${verifyModal.name}`} size="md"
          footer={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setVerifyModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleVerify(verifyModal.empId, 'rejected')}><ShieldX size={14} /> Reject</Button>
              <Button onClick={() => handleVerify(verifyModal.empId, 'verified')}><ShieldCheck size={14} /> Approve & Verify</Button>
            </div>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            {[verifyModal.profile.photo_front_url, verifyModal.profile.photo_left_url, verifyModal.profile.photo_right_url].map((url, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-slate-300"><Camera size={24} /></div>}
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-500 mt-4">Review all three photos. Approve only if the face is clearly visible and all angles match the same person.</p>
        </Modal>
      )}
    </div>
  );
}

// ─── Attendance Page ───────────────────────────────────────
export function AttendancePage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [todayAtt, setTodayAtt] = useState<Attendance | null>(null);
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([]);
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [myShift, setMyShift] = useState<ShiftTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState<'in' | 'out' | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo]   = useState(new Date().toISOString().split('T')[0]);
  const [rangeMode, setRangeMode] = useState(false);
  const [filterOutlet, setFilterOutlet] = useState('');
  const [filterArea, setFilterArea]     = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchEmp, setSearchEmp]       = useState('');
  const [outlets, setOutlets] = useState<{id:string;name:string;area_id:string}[]>([]);
  const [areas,   setAreas]   = useState<{id:string;name:string;region_id:string}[]>([]);
  const [regions, setRegions] = useState<{id:string;name:string}[]>([]);

  const today = new Date().toISOString().split('T')[0];
  const isAdmin = profile?.role && ['super_admin', 'hr_admin', 'supervisor', 'area_manager', 'regional_manager'].includes(profile.role);

  const loadData = async () => {
    setLoading(true);

    if (user) {
      const { data: empData } = await supabase
        .from('employees')
        .select('*, primary_outlet:outlets!primary_outlet_id(*)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (empData) {
        setMyEmployee(empData as Employee);
        const { data: att } = await supabase.from('attendance').select('*').eq('employee_id', empData.id).eq('attendance_date', today).maybeSingle();
        setTodayAtt(att);
        const { data: shiftAssign } = await supabase
          .from('shift_assignments')
          .select('*, shift_template:shift_templates(*)')
          .eq('employee_id', empData.id)
          .lte('effective_date', today)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('effective_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (shiftAssign?.shift_template) setMyShift(shiftAssign.shift_template as ShiftTemplate);
      }
    }

    // Load org filters
    const [{ data: oData }, { data: aData }, { data: rData }] = await Promise.all([
      supabase.from('outlets').select('id, name, area_id').eq('is_active', true).order('name'),
      supabase.from('areas').select('id, name, region_id').eq('is_active', true).order('name'),
      supabase.from('regions').select('id, name').order('name'),
    ]);
    setOutlets(oData ?? []);
    setAreas(aData ?? []);
    setRegions(rData ?? []);

    // Load attendance
    let q = supabase
      .from('attendance')
      .select('*, employee:employees(full_name, employee_code, area_id, region_id, primary_outlet_id), outlet:outlets(name, area_id)')
      .order('check_in_time', { ascending: false })
      .limit(500);

    if (rangeMode) {
      q = q.gte('attendance_date', dateFrom).lte('attendance_date', dateTo);
    } else {
      q = q.eq('attendance_date', dateFilter);
    }
    if (filterOutlet) q = q.eq('outlet_id', filterOutlet);

    const { data: attData } = await q;
    setAllAttendance((attData as Attendance[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [dateFilter, dateFrom, dateTo, rangeMode, filterOutlet, user]);

  const getGPS = () => {
    setGpsLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsLoading(false); },
      () => { setLocationError('Unable to get GPS location. Please allow location access.'); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const computeAttendanceStatus = (checkInTime: Date, shift: ShiftTemplate | null): 'present' | 'late' => {
    if (!shift) return 'present';
    const [h, m] = shift.start_time.split(':').map(Number);
    const shiftStart = new Date(checkInTime);
    shiftStart.setHours(h, m + shift.late_tolerance_minutes, 0, 0);
    return checkInTime > shiftStart ? 'late' : 'present';
  };

  const doCheckIn = async (blob: Blob) => {
    setWebcamOpen(null);
    if (!location) { toast('error', 'GPS required', 'Please get your location first'); return; }
    if (!myEmployee) { toast('error', 'No employee record linked to your account'); return; }
    setCheckingIn(true);

    const fileName = `attendance_checkin_${myEmployee.id}_${Date.now()}.jpg`;
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('attendance-photos')
      .upload(fileName, blob, { contentType: 'image/jpeg' });
    if (uploadErr) { toast('error', 'Photo upload failed', uploadErr.message); setCheckingIn(false); return; }
    const { data: urlData } = supabase.storage.from('attendance-photos').getPublicUrl(uploadData.path);

    const outlet = myEmployee.primary_outlet as Outlet | null;
    const geofence = outlet?.latitude && outlet?.longitude
      ? haversineDistance(location.lat, location.lng, outlet.latitude, outlet.longitude) <= outlet.geofence_radius_meters
        ? 'inside' as const : 'outside' as const
      : 'unknown' as const;

    const now = new Date();
    const status = computeAttendanceStatus(now, myShift);

    const { error } = await supabase.from('attendance').upsert({
      employee_id: myEmployee.id,
      outlet_id: outlet?.id ?? null,
      shift_template_id: myShift?.id ?? null,
      attendance_date: today,
      check_in_time: now.toISOString(),
      check_in_lat: location.lat,
      check_in_lng: location.lng,
      check_in_geofence: geofence,
      check_in_selfie_url: urlData.publicUrl,
      check_in_face_score: 92.5, // stub — replace with real face comparison
      status,
    }, { onConflict: 'employee_id,attendance_date' });

    if (error) { toast('error', 'Check-in failed', error.message); }
    else {
      const msg = geofence === 'outside'
        ? 'Checked in successfully (outside geofence — recorded for review)'
        : status === 'late'
          ? `Checked in — marked LATE (shift started ${myShift?.start_time?.substring(0, 5)})`
          : 'Checked in successfully';
      toast(geofence === 'outside' || status === 'late' ? 'warning' : 'success', msg);
      if (user) {
        createNotification(user.id, 'attendance', 'Check-In Recorded',
          `${status === 'late' ? 'Late check-in' : 'Check-in'} at ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}${geofence === 'outside' ? ' (outside geofence)' : ''}`);
      }
      loadData();
    }
    setCheckingIn(false);
  };

  const doCheckOut = async (blob: Blob) => {
    setWebcamOpen(null);
    if (!location || !todayAtt) return;
    setCheckingOut(true);

    const fileName = `attendance_checkout_${myEmployee?.id}_${Date.now()}.jpg`;
    const { data: uploadData } = await supabase.storage.from('attendance-photos').upload(fileName, blob, { contentType: 'image/jpeg' });
    if (!uploadData) { toast('error', 'Upload failed'); setCheckingOut(false); return; }
    const { data: urlData } = supabase.storage.from('attendance-photos').getPublicUrl(uploadData.path);

    const outlet = myEmployee?.primary_outlet as Outlet | null;
    const checkOutGeofence = outlet?.latitude && outlet?.longitude
      ? haversineDistance(location.lat, location.lng, outlet.latitude, outlet.longitude) <= outlet.geofence_radius_meters
        ? 'inside' as const : 'outside' as const
      : 'unknown' as const;

    const now = new Date();
    const checkIn = new Date(todayAtt.check_in_time!);
    const durationMinutes = Math.floor((now.getTime() - checkIn.getTime()) / 60000);

    const { error } = await supabase.from('attendance').update({
      check_out_time: now.toISOString(),
      check_out_lat: location.lat,
      check_out_lng: location.lng,
      check_out_geofence: checkOutGeofence,
      check_out_selfie_url: urlData.publicUrl,
      work_duration_minutes: durationMinutes,
    }).eq('id', todayAtt.id);

    if (error) { toast('error', 'Check-out failed', error.message); }
    else {
      const h = Math.floor(durationMinutes / 60);
      const m = durationMinutes % 60;
      toast('success', `Checked out — worked ${h}h ${m}m`);
      if (user) {
        createNotification(user.id, 'attendance', 'Check-Out Recorded',
          `Checked out at ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} — ${h}h ${m}m`);
      }
      loadData();
    }
    setCheckingOut(false);
  };

  const shiftInfo = myShift
    ? `${myShift.name} · ${myShift.start_time.substring(0, 5)}–${myShift.end_time.substring(0, 5)}`
    : 'No shift assigned';

  // Client-side post-filter (area/region/status/search — outlet already server-filtered)
  const filteredAttendance = allAttendance.filter((a) => {
    const emp = a.employee as { full_name?: string; employee_code?: string; area_id?: string; region_id?: string } | undefined;
    if (filterArea   && emp?.area_id   !== filterArea)   return false;
    if (filterRegion && emp?.region_id !== filterRegion) return false;
    if (filterStatus && a.status !== filterStatus)        return false;
    if (searchEmp) {
      const q = searchEmp.toLowerCase();
      if (!emp?.full_name?.toLowerCase().includes(q) && !emp?.employee_code?.includes(q)) return false;
    }
    return true;
  });

  const exportAttendanceExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = filteredAttendance.map((a) => {
      const emp = a.employee as { full_name?: string; employee_code?: string } | undefined;
      return {
        'Tanggal': a.attendance_date,
        'Kode': emp?.employee_code ?? '',
        'Nama': emp?.full_name ?? '',
        'Outlet': (a.outlet as { name?: string })?.name ?? '',
        'Jam Masuk': a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString('id-ID') : '',
        'Jam Keluar': a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString('id-ID') : '',
        'Durasi (menit)': a.work_duration_minutes ?? '',
        'Status': a.status,
        'Geofence Masuk': a.check_in_geofence ?? '',
        'Face Score': a.check_in_face_score ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Absensi');
    const label = rangeMode ? `${dateFrom}_${dateTo}` : dateFilter;
    XLSX.writeFile(wb, `Absensi_${label}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Check-in card — employees only */}
      {!isAdmin && (
        <Card>
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Left: GPS + Shift Info */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Today's Shift</p>
                <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                  <Clock size={14} className="text-blue-500" />{shiftInfo}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">GPS Location</p>
                {location ? (
                  <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <MapPin size={14} /> {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  </p>
                ) : (
                  <Button variant="outline" size="sm" loading={gpsLoading} onClick={getGPS}>
                    <MapPin size={14} /> {gpsLoading ? 'Getting location...' : 'Get GPS Location'}
                  </Button>
                )}
                {locationError && <p className="text-xs text-red-500 mt-1">{locationError}</p>}
              </div>
            </div>

            {/* Right: Status + Actions */}
            <div className="flex flex-col items-center justify-center gap-3 sm:min-w-48">
              {todayAtt ? (
                <div className="text-center w-full">
                  <Badge className={`${STATUS_COLORS[todayAtt.status]} text-sm px-3 py-1`}>
                    {todayAtt.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                    {todayAtt.check_in_time && <p>In: <strong>{new Date(todayAtt.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</strong></p>}
                    {todayAtt.check_out_time && <p>Out: <strong>{new Date(todayAtt.check_out_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</strong></p>}
                    {todayAtt.work_duration_minutes && <p>Worked: <strong>{Math.floor(todayAtt.work_duration_minutes / 60)}h {todayAtt.work_duration_minutes % 60}m</strong></p>}
                    {todayAtt.check_in_geofence === 'outside' && (
                      <p className="text-amber-600 flex items-center justify-center gap-1"><AlertCircle size={11} /> Outside geofence</p>
                    )}
                  </div>
                </div>
              ) : (
                <Badge className="bg-slate-100 text-slate-500 text-sm px-3 py-1">NOT CHECKED IN</Badge>
              )}

              {!todayAtt && (
                <Button
                  onClick={() => { if (!location) { toast('error', 'Get GPS location first'); return; } setWebcamOpen('in'); }}
                  loading={checkingIn}
                  className="w-full"
                >
                  <Camera size={16} /> Check In
                </Button>
              )}
              {todayAtt && !todayAtt.check_out_time && (
                <Button
                  variant="secondary"
                  onClick={() => { if (!location) { toast('error', 'Get GPS location first'); return; } setWebcamOpen('out'); }}
                  loading={checkingOut}
                  className="w-full"
                >
                  <Camera size={16} /> Check Out
                </Button>
              )}
              {todayAtt?.check_out_time && (
                <p className="text-xs text-emerald-600 text-center">Attendance complete for today</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-slate-400" />
              <span className="font-semibold text-slate-900 text-sm">Filter Absensi</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRangeMode(!rangeMode)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${ rangeMode ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50' }`}
              >{rangeMode ? 'Mode Rentang' : 'Mode Harian'}</button>
              <button
                onClick={exportAttendanceExcel}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              ><Download size={13} /> Export Excel</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            {/* Date filter */}
            {rangeMode ? (
              <>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Dari</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Sampai</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs text-slate-500 block mb-1">Tanggal</label>
                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {/* Region filter */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Regional</label>
              <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterArea(''); setFilterOutlet(''); }}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Semua Regional</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            {/* Area filter */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Area</label>
              <select value={filterArea} onChange={(e) => { setFilterArea(e.target.value); setFilterOutlet(''); }}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Semua Area</option>
                {areas.filter((a) => !filterRegion || a.region_id === filterRegion).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Outlet filter */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Outlet</label>
              <select value={filterOutlet} onChange={(e) => setFilterOutlet(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Semua Outlet</option>
                {outlets.filter((o) => !filterArea || o.area_id === filterArea).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Semua Status</option>
                {['present','late','absent','overtime','early_leave'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Employee search */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Karyawan</label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={searchEmp} onChange={(e) => setSearchEmp(e.target.value)} placeholder="Cari nama..."
                  className="border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <Table
          loading={loading}
          rowKey={(a) => a.id}
          data={filteredAttendance}
          emptyMessage="Tidak ada data absensi untuk filter ini"
          columns={[
            {
              key: 'attendance_date', header: 'Tanggal',
              render: (a) => <span className="font-mono text-xs text-slate-600">{a.attendance_date}</span>,
            },
            {
              key: 'employee', header: 'Karyawan',
              render: (a) => (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                    {String((a.employee as { full_name?: string })?.full_name ?? 'E').charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{(a.employee as { full_name?: string })?.full_name ?? '-'}</p>
                    <p className="text-xs text-slate-400 font-mono">{(a.employee as { employee_code?: string })?.employee_code}</p>
                  </div>
                </div>
              ),
            },
            { key: 'outlet', header: 'Outlet', render: (a) => <span className="text-xs text-slate-600">{(a.outlet as { name?: string })?.name ?? '-'}</span> },
            { key: 'check_in_time', header: 'Masuk', render: (a) => a.check_in_time ? <span className="font-mono text-sm font-medium">{new Date(a.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span> : <span className="text-slate-300">-</span> },
            { key: 'check_out_time', header: 'Keluar', render: (a) => a.check_out_time ? <span className="font-mono text-sm">{new Date(a.check_out_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span> : <span className="text-slate-300">-</span> },
            {
              key: 'work_duration_minutes', header: 'Durasi',
              render: (a) => a.work_duration_minutes
                ? <span className="text-sm text-slate-700">{Math.floor(a.work_duration_minutes / 60)}j {a.work_duration_minutes % 60}m</span>
                : <span className="text-slate-300">-</span>,
            },
            { key: 'status', header: 'Status', render: (a) => <Badge className={STATUS_COLORS[a.status]}>{a.status.replace('_', ' ')}</Badge> },
            {
              key: 'check_in_geofence', header: 'Geofence',
              render: (a) => (
                <Badge className={STATUS_COLORS[a.check_in_geofence ?? 'unknown']}>
                  {a.check_in_geofence === 'inside' ? <CheckCircle size={9} className="mr-1 inline" /> : a.check_in_geofence === 'outside' ? <AlertCircle size={9} className="mr-1 inline" /> : null}
                  {a.check_in_geofence ?? '-'}
                </Badge>
              ),
            },
            {
              key: 'check_in_face_score', header: 'Face',
              render: (a) => a.check_in_face_score != null
                ? <span className={`text-xs font-semibold ${a.check_in_face_score >= 85 ? 'text-emerald-600' : 'text-red-500'}`}>{a.check_in_face_score.toFixed(0)}%</span>
                : <span className="text-slate-300">-</span>,
            },
            {
              key: 'selfie', header: 'Foto',
              render: (a) => a.check_in_selfie_url
                ? <img src={a.check_in_selfie_url} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm" />
                : <span className="text-slate-300 text-xs">-</span>,
            },
          ]}
        />
        {/* Summary bar */}
        <div className="px-6 py-3 border-t border-slate-50 flex items-center gap-6 text-xs text-slate-500 flex-wrap">
          <span>{filteredAttendance.length} records</span>
          {(['present','late','absent','overtime'] as const).map((s) => {
            const cnt = filteredAttendance.filter((a) => a.status === s).length;
            return cnt > 0 ? <span key={s}><Badge className={STATUS_COLORS[s]}>{cnt}</Badge> {s}</span> : null;
          })}
        </div>
      </Card>

      {/* Webcam modal */}
      <Modal isOpen={!!webcamOpen} onClose={() => setWebcamOpen(null)} title={webcamOpen === 'in' ? 'Check In — Take Selfie' : 'Check Out — Take Selfie'} size="md">
        {webcamOpen && (
          <WebcamCapture
            label={webcamOpen === 'in' ? 'Check In' : 'Check Out'}
            onCapture={webcamOpen === 'in' ? (blob) => doCheckIn(blob) : (blob) => doCheckOut(blob)}
            onClose={() => setWebcamOpen(null)}
          />
        )}
      </Modal>
    </div>
  );
}
