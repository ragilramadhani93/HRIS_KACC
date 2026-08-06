import { useEffect, useRef, useState } from 'react';
import { Plus, CheckCircle, XCircle, ChevronRight, Upload, FileText, Building2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { Table } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useToast } from '../ui/Toast';
import { formatDate, STATUS_COLORS, ABSENCE_TYPE_LABELS, createNotification } from '../../lib/utils';
import type { AbsenceRequest, AbsenceType, Employee, Outlet } from '../../lib/database.types';

const ABSENCE_TYPE_OPTIONS = [
  { value: 'sakit_dengan_surat', label: 'Sakit (Dengan Surat Dokter)', icon: '🏥' },
  { value: 'sakit_tanpa_surat', label: 'Sakit (Tanpa Surat Dokter)', icon: '🤒' },
  { value: 'izin', label: 'Izin Tidak Masuk Kerja', icon: '📋' },
  { value: 'perbantuan', label: 'Perbantuan ke Outlet Lain', icon: '🏪' },
];

export function LeavePage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitModal, setSubmitModal] = useState(false);
  const [approvalModal, setApprovalModal] = useState<AbsenceRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<{
    absence_type: AbsenceType;
    absence_date: string;
    end_date: string;
    reason: string;
    target_outlet_id: string;
  }>({
    absence_type: 'sakit_dengan_surat',
    absence_date: '',
    end_date: '',
    reason: '',
    target_outlet_id: '',
  });

  const isAdmin = role && ['super_admin', 'hr_admin', 'supervisor', 'area_manager', 'regional_manager'].includes(role);

  const load = async () => {
    setLoading(true);
    const [{ data: req }, { data: outs }] = await Promise.all([
      supabase.from('absence_requests')
        .select('*, employee:employees(full_name, employee_code, user_id), target_outlet:outlets(name)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('outlets').select('id, name').eq('is_active', true).order('name'),
    ]);
    setRequests((req as AbsenceRequest[]) ?? []);
    setOutlets(outs ?? []);

    if (user) {
      const { data: emp } = await supabase.from('employees').select('*').eq('user_id', user.id).maybeSingle();
      setMyEmployee(emp);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const handleSubmit = async () => {
    if (!myEmployee) return toast('error', 'Akun Anda belum terhubung ke data karyawan. Hubungi Admin.');
    if (!form.absence_date) return toast('error', 'Tanggal wajib diisi');
    if (form.absence_type === 'perbantuan' && !form.target_outlet_id) return toast('error', 'Pilih outlet tujuan perbantuan');

    setSaving(true);

    // Upload surat if attached
    let documentUrl: string | null = null;
    if (docFile) {
      setUploading(true);
      const ext = docFile.name.split('.').pop();
      const path = `absence/${myEmployee.id}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('employee-documents')
        .upload(path, docFile);
      if (uploadErr) { toast('error', 'Gagal upload dokumen', uploadErr.message); setSaving(false); setUploading(false); return; }
      const { data: urlData } = supabase.storage.from('employee-documents').getPublicUrl(uploadData.path);
      documentUrl = urlData.publicUrl;
      setUploading(false);
    }

    const endDate = form.end_date || form.absence_date;
    const totalDays = Math.ceil(
      (new Date(endDate).getTime() - new Date(form.absence_date).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const { error } = await supabase.from('absence_requests').insert({
      employee_id: myEmployee.id,
      absence_type: form.absence_type,
      absence_date: form.absence_date,
      end_date: form.end_date || null,
      total_days: totalDays,
      reason: form.reason || null,
      document_url: documentUrl,
      target_outlet_id: form.target_outlet_id || null,
      status: 'pending',
    });

    if (error) { toast('error', 'Gagal submit', error.message); setSaving(false); return; }

    if (user) {
      createNotification(user.id, 'leave', 'Pengajuan Absen Terkirim',
        `Pengajuan ${ABSENCE_TYPE_LABELS[form.absence_type]} tanggal ${formatDate(form.absence_date)} menunggu persetujuan.`);
    }

    toast('success', 'Pengajuan berhasil dikirim');
    load();
    setSubmitModal(false);
    setDocFile(null);
    setSaving(false);
  };

  const handleDecision = async (req: AbsenceRequest, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !approvalNotes) return toast('error', 'Alasan penolakan wajib diisi');
    setSaving(true);

    const { error } = await supabase.from('absence_requests').update({
      status: decision === 'approve' ? 'approved' : 'rejected',
      approved_by: user?.id ?? null,
      approved_at: decision === 'approve' ? new Date().toISOString() : null,
      approval_notes: approvalNotes || null,
    }).eq('id', req.id);

    if (error) { toast('error', 'Gagal', error.message); setSaving(false); return; }

    // Notify employee
    const empUserId = (req.employee as { user_id?: string | null })?.user_id;
    if (empUserId) {
      createNotification(empUserId, 'leave',
        decision === 'approve' ? 'Pengajuan Absen Disetujui' : 'Pengajuan Absen Ditolak',
        decision === 'approve'
          ? `Pengajuan ${ABSENCE_TYPE_LABELS[req.absence_type]} tanggal ${formatDate(req.absence_date)} disetujui.`
          : `Pengajuan ${ABSENCE_TYPE_LABELS[req.absence_type]} tanggal ${formatDate(req.absence_date)} ditolak. Alasan: ${approvalNotes}`,
      );
    }

    toast('success', decision === 'approve' ? 'Disetujui' : 'Ditolak');
    load();
    setApprovalModal(null);
    setApprovalNotes('');
    setSaving(false);
  };

  const displayRequests = isAdmin
    ? requests
    : requests.filter((r) => r.employee_id === myEmployee?.id);

  // Count by type for summary
  const myCounts = myEmployee
    ? {
        sakit_dengan_surat: requests.filter((r) => r.employee_id === myEmployee.id && r.absence_type === 'sakit_dengan_surat' && r.status === 'approved').reduce((s, r) => s + r.total_days, 0),
        sakit_tanpa_surat: requests.filter((r) => r.employee_id === myEmployee.id && r.absence_type === 'sakit_tanpa_surat' && r.status === 'approved').reduce((s, r) => s + r.total_days, 0),
        izin: requests.filter((r) => r.employee_id === myEmployee.id && r.absence_type === 'izin' && r.status === 'approved').reduce((s, r) => s + r.total_days, 0),
        perbantuan: requests.filter((r) => r.employee_id === myEmployee.id && r.absence_type === 'perbantuan' && r.status === 'approved').reduce((s, r) => s + r.total_days, 0),
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Employee summary cards */}
      {!isAdmin && myCounts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ABSENCE_TYPE_OPTIONS.map((opt) => (
            <div key={opt.value} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <p className="text-xl mb-1">{opt.icon}</p>
              <p className="text-xs text-slate-500 leading-tight">{opt.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {myCounts[opt.value as keyof typeof myCounts]}
              </p>
              <p className="text-xs text-slate-400">hari disetujui</p>
            </div>
          ))}
        </div>
      )}

      {/* Warning for employees: no annual leave quota */}
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>Info:</strong> Tidak ada jatah cuti tahunan. Form ini hanya untuk mengajukan{' '}
            <strong>surat sakit</strong>, <strong>izin tidak masuk</strong>, dan{' '}
            <strong>perbantuan ke outlet lain</strong>.
            Sakit tanpa surat dokter mempengaruhi insentif kehadiran.
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        {!isAdmin && (
          <Button onClick={() => {
            setForm({ absence_type: 'sakit_dengan_surat', absence_date: '', end_date: '', reason: '', target_outlet_id: '' });
            setDocFile(null);
            setSubmitModal(true);
          }}>
            <Plus size={16} /> Ajukan Ketidakhadiran
          </Button>
        )}
        {isAdmin && (
          <div className="text-sm text-slate-500 font-medium">
            {requests.filter((r) => r.status === 'pending').length} pengajuan menunggu persetujuan
          </div>
        )}
      </div>

      <Table
        loading={loading}
        rowKey={(r) => r.id}
        data={displayRequests}
        emptyMessage="Belum ada pengajuan ketidakhadiran"
        onRowClick={(r) => {
          if (isAdmin && r.status === 'pending') { setApprovalModal(r); setApprovalNotes(''); }
        }}
        columns={[
          {
            key: 'employee', header: 'Karyawan',
            render: (r) => (
              <div>
                <p className="font-medium">{(r.employee as { full_name?: string })?.full_name ?? '-'}</p>
                <p className="text-xs text-slate-400 font-mono">{(r.employee as { employee_code?: string })?.employee_code}</p>
              </div>
            ),
          },
          {
            key: 'absence_type', header: 'Jenis',
            render: (r) => {
              const opt = ABSENCE_TYPE_OPTIONS.find((o) => o.value === r.absence_type);
              return (
                <div className="flex items-center gap-1.5">
                  <span>{opt?.icon}</span>
                  <Badge className={STATUS_COLORS[r.absence_type]}>{ABSENCE_TYPE_LABELS[r.absence_type]}</Badge>
                </div>
              );
            },
          },
          {
            key: 'dates', header: 'Tanggal',
            render: (r) => (
              <div>
                <p className="text-sm">{formatDate(r.absence_date)}{r.end_date && r.end_date !== r.absence_date ? ` – ${formatDate(r.end_date)}` : ''}</p>
                <p className="text-xs text-slate-400">{r.total_days} hari</p>
              </div>
            ),
          },
          {
            key: 'target_outlet', header: 'Outlet Tujuan',
            render: (r) => r.target_outlet_id
              ? <span className="text-sm flex items-center gap-1"><Building2 size={12} />{(r.target_outlet as { name?: string })?.name}</span>
              : <span className="text-slate-400 text-sm">-</span>,
          },
          {
            key: 'document_url', header: 'Dokumen',
            render: (r) => r.document_url
              ? <a href={r.document_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1"><FileText size={12} />Lihat</a>
              : <span className="text-slate-400 text-xs">-</span>,
          },
          { key: 'status', header: 'Status', render: (r) => <Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
          {
            key: 'action', header: '',
            render: (r) => isAdmin && r.status === 'pending'
              ? <ChevronRight size={16} className="text-blue-400" /> : null,
          },
        ]}
      />

      {/* Submit Modal */}
      <Modal
        isOpen={submitModal}
        onClose={() => setSubmitModal(false)}
        title="Ajukan Ketidakhadiran"
        size="md"
        footer={
          <><Button variant="outline" onClick={() => setSubmitModal(false)}>Batal</Button>
          <Button loading={saving || uploading} onClick={handleSubmit}>Kirim Pengajuan</Button></>
        }
      >
        <div className="space-y-4">
          {/* Type selector as cards */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Jenis Ketidakhadiran <span className="text-red-500">*</span></p>
            <div className="grid grid-cols-2 gap-2">
              {ABSENCE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, absence_type: opt.value as AbsenceType })}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.absence_type === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-100 bg-white hover:border-slate-200'
                  }`}
                >
                  <span className="text-xl block mb-1">{opt.icon}</span>
                  <span className="text-xs font-medium text-slate-700 leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {form.absence_type === 'sakit_tanpa_surat' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-xs text-orange-800 flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              Sakit tanpa surat dokter akan mempengaruhi insentif kehadiran pada periode ini.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tanggal Mulai"
              type="date"
              value={form.absence_date}
              onChange={(e) => setForm({ ...form, absence_date: e.target.value })}
              required
            />
            <Input
              label="Tanggal Selesai (opsional)"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              hint="Kosongkan jika hanya 1 hari"
            />
          </div>

          {form.absence_type === 'perbantuan' && (
            <Select
              label="Outlet Tujuan Perbantuan"
              value={form.target_outlet_id}
              onChange={(e) => setForm({ ...form, target_outlet_id: e.target.value })}
              options={[{ value: '', label: 'Pilih outlet' }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]}
              required
            />
          )}

          <Textarea
            label="Keterangan / Alasan"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Jelaskan alasan ketidakhadiran..."
          />

          {/* Document upload */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">
              {form.absence_type === 'sakit_dengan_surat' ? 'Surat Dokter (wajib)' : 'Dokumen Pendukung (opsional)'}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Upload Dokumen
              </Button>
              {docFile && <span className="text-sm text-slate-600 truncate">{docFile.name}</span>}
            </div>
          </div>
        </div>
      </Modal>

      {/* Approval Modal */}
      {approvalModal && (
        <Modal
          isOpen
          onClose={() => setApprovalModal(null)}
          title="Persetujuan Ketidakhadiran"
          size="md"
          footer={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setApprovalModal(null)}>Batal</Button>
              <Button variant="danger" loading={saving} onClick={() => handleDecision(approvalModal, 'reject')}>
                <XCircle size={14} /> Tolak
              </Button>
              <Button loading={saving} onClick={() => handleDecision(approvalModal, 'approve')}>
                <CheckCircle size={14} /> Setujui
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{ABSENCE_TYPE_OPTIONS.find((o) => o.value === approvalModal.absence_type)?.icon}</span>
                <div>
                  <p className="font-semibold text-slate-900">{(approvalModal.employee as { full_name?: string })?.full_name}</p>
                  <p className="text-sm text-slate-600">{ABSENCE_TYPE_LABELS[approvalModal.absence_type]}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {formatDate(approvalModal.absence_date)}
                    {approvalModal.end_date && approvalModal.end_date !== approvalModal.absence_date
                      ? ` – ${formatDate(approvalModal.end_date)}` : ''}
                    {' '}({approvalModal.total_days} hari)
                  </p>
                  {approvalModal.reason && (
                    <p className="text-sm text-slate-600 mt-2 italic">"{approvalModal.reason}"</p>
                  )}
                  {approvalModal.absence_type === 'perbantuan' && approvalModal.target_outlet_id && (
                    <p className="text-sm text-teal-700 mt-1 flex items-center gap-1">
                      <Building2 size={12} /> Tujuan: {(approvalModal.target_outlet as { name?: string })?.name}
                    </p>
                  )}
                  {approvalModal.document_url && (
                    <a href={approvalModal.document_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-2">
                      <FileText size={12} /> Lihat Dokumen
                    </a>
                  )}
                </div>
              </div>
            </div>

            {approvalModal.absence_type === 'sakit_tanpa_surat' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-xs text-orange-800 flex items-start gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                Jenis absen ini akan mengurangi insentif kehadiran karyawan pada periode ini.
              </div>
            )}

            <Textarea
              label="Catatan (wajib jika menolak)"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Tambahkan catatan..."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
