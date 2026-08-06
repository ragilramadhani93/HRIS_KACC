import { useEffect, useRef, useState } from 'react';
import { Plus, CheckCircle, XCircle, ChevronRight, Settings, Upload, Receipt } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { Table } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Tabs } from '../ui/Tabs';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useToast } from '../ui/Toast';
import { formatDate, formatCurrency, STATUS_COLORS, createNotification } from '../../lib/utils';
import type { ExpenseClaim, ExpenseCategory, Employee, Company } from '../../lib/database.types';

function ExpenseCategoriesTab() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ company_id: '', name: '', code: '', max_amount: '', requires_receipt: true });

  const load = async () => {
    setLoading(true);
    const [{ data: cat }, { data: c }] = await Promise.all([
      supabase.from('expense_categories').select('*, company:companies(name)').order('name'),
      supabase.from('companies').select('id, name').eq('is_active', true),
    ]);
    setCategories(cat ?? []);
    setCompanies(c ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.code || !form.company_id) return toast('error', 'All required fields missing');
    setSaving(true);
    const payload = { name: form.name, code: form.code, company_id: form.company_id, max_amount: form.max_amount ? parseFloat(form.max_amount) : null, requires_receipt: form.requires_receipt };
    const op = editing ? supabase.from('expense_categories').update(payload).eq('id', editing.id) : supabase.from('expense_categories').insert(payload);
    const { error } = await op;
    if (error) { toast('error', 'Failed', error.message); } else { toast('success', editing ? 'Updated' : 'Created'); load(); setModalOpen(false); }
    setSaving(false);
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setEditing(null); setForm({ company_id: companies[0]?.id ?? '', name: '', code: '', max_amount: '', requires_receipt: true }); setModalOpen(true); }}>
          <Plus size={16} /> Add Category
        </Button>
      </div>
      <Table loading={loading} rowKey={(c) => c.id} data={categories} columns={[
        { key: 'code', header: 'Code', render: (c) => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{c.code}</span> },
        { key: 'name', header: 'Category', render: (c) => <span className="font-medium">{c.name}</span> },
        { key: 'max_amount', header: 'Max Claim', render: (c) => c.max_amount ? formatCurrency(c.max_amount) : <span className="text-slate-400">No limit</span> },
        { key: 'requires_receipt', header: 'Receipt', render: (c) => c.requires_receipt ? <Badge className="bg-amber-100 text-amber-700">Required</Badge> : <span className="text-slate-400 text-sm">Optional</span> },
        { key: 'is_active', header: 'Status', render: (c) => <Badge className={c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{c.is_active ? 'Active' : 'Inactive'}</Badge> },
        { key: 'actions', header: '', render: (c) => <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setForm({ company_id: c.company_id, name: c.name, code: c.code, max_amount: c.max_amount?.toString() ?? '', requires_receipt: c.requires_receipt }); setModalOpen(true); }}><Settings size={14} /></Button> },
      ]} />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Category' : 'Add Category'} size="sm"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Select label="Company" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} options={companies.map((c) => ({ value: c.id, label: c.name }))} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Category Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
          </div>
          <Input label="Max Claim Amount (IDR, optional)" type="number" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} />
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input type="checkbox" checked={form.requires_receipt} onChange={(e) => setForm({ ...form, requires_receipt: e.target.checked })} className="rounded" />
            <span>Receipt / proof required</span>
          </label>
        </div>
      </Modal>
    </>
  );
}

function ExpenseClaimsTab() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitModal, setSubmitModal] = useState(false);
  const [approvalModal, setApprovalModal] = useState<ExpenseClaim | null>(null);
  const [saving, setSaving] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ category_id: '', claim_date: '', title: '', description: '', amount: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = role && ['super_admin', 'hr_admin', 'supervisor', 'area_manager', 'regional_manager'].includes(role);

  const load = async () => {
    setLoading(true);
    const [{ data: cl }, { data: cat }] = await Promise.all([
      supabase.from('expense_claims').select('*, employee:employees(full_name, employee_code, user_id), category:expense_categories(name, code)').order('created_at', { ascending: false }).limit(100),
      supabase.from('expense_categories').select('*').eq('is_active', true).order('name'),
    ]);
    setClaims((cl as ExpenseClaim[]) ?? []);
    setCategories(cat ?? []);
    if (user) {
      const { data: emp } = await supabase.from('employees').select('*').eq('user_id', user.id).maybeSingle();
      setMyEmployee(emp);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!myEmployee) return toast('error', 'No employee record linked to your account');
    if (!form.category_id || !form.claim_date || !form.title || !form.amount) return toast('error', 'All required fields must be filled');
    setSaving(true);

    let receiptUrl: string | null = null;
    if (receiptFile) {
      setUploading(true);
      const ext = receiptFile.name.split('.').pop();
      const path = `receipts/${myEmployee.id}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage.from('employee-documents').upload(path, receiptFile);
      if (uploadErr) { toast('error', 'Receipt upload failed', uploadErr.message); setSaving(false); setUploading(false); return; }
      const { data: urlData } = supabase.storage.from('employee-documents').getPublicUrl(uploadData.path);
      receiptUrl = urlData.publicUrl;
      setUploading(false);
    }

    const { error } = await supabase.from('expense_claims').insert({
      employee_id: myEmployee.id,
      category_id: form.category_id || null,
      claim_date: form.claim_date,
      title: form.title,
      description: form.description || null,
      amount: parseFloat(form.amount),
      receipt_url: receiptUrl,
      status: 'submitted',
    });

    if (error) { toast('error', 'Failed', error.message); } else {
      toast('success', 'Expense claim submitted');
      if (user) createNotification(user.id, 'approval', 'Expense Claim Submitted', `Your claim "${form.title}" for ${formatCurrency(parseFloat(form.amount))} is pending approval.`);
      load(); setSubmitModal(false); setReceiptFile(null);
    }
    setSaving(false);
  };

  const handleDecision = async (claim: ExpenseClaim, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !approvalNotes) return toast('error', 'Rejection reason required');
    setSaving(true);

    let newStatus: string;
    if (decision === 'reject') {
      newStatus = 'rejected';
    } else if (role === 'supervisor' || role === 'area_manager') {
      newStatus = 'approved_supervisor';
    } else if (role === 'regional_manager') {
      newStatus = 'approved_manager';
    } else {
      newStatus = 'approved';
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status: newStatus };
    if (role === 'supervisor' || role === 'area_manager') {
      updates.supervisor_approved_at = decision === 'approve' ? now : null;
      updates.supervisor_notes = approvalNotes || null;
    } else if (role === 'regional_manager') {
      updates.manager_approved_at = decision === 'approve' ? now : null;
      updates.manager_notes = approvalNotes || null;
    } else {
      updates.finance_approved_at = decision === 'approve' ? now : null;
      updates.finance_notes = approvalNotes || null;
    }

    const { error } = await supabase.from('expense_claims').update(updates).eq('id', claim.id);
    if (error) { toast('error', 'Failed', error.message); setSaving(false); return; }

    const empUserId = (claim.employee as { user_id?: string | null })?.user_id;
    if (empUserId) {
      createNotification(empUserId, 'approval',
        decision === 'approve' ? 'Expense Claim Approved' : 'Expense Claim Rejected',
        decision === 'approve'
          ? `Your claim "${claim.title}" has been approved.`
          : `Your claim "${claim.title}" was rejected. Reason: ${approvalNotes}`,
      );
    }

    toast('success', `Claim ${decision === 'approve' ? 'approved' : 'rejected'}`);
    load(); setApprovalModal(null); setApprovalNotes('');
    setSaving(false);
  };

  const displayClaims = isAdmin ? claims : claims.filter((c) => c.employee_id === myEmployee?.id);

  return (
    <div className="space-y-4">
      {/* My pending claims summary for employees */}
      {!isAdmin && myEmployee && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending', status: 'submitted', color: 'bg-amber-50 border-amber-200 text-amber-800' },
            { label: 'Approved', status: 'approved', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
            { label: 'Rejected', status: 'rejected', color: 'bg-red-50 border-red-200 text-red-800' },
          ].map(({ label, status, color }) => {
            const filtered = claims.filter((c) => c.employee_id === myEmployee.id && c.status === status);
            const total = filtered.reduce((s, c) => s + c.amount, 0);
            return (
              <div key={status} className={`border rounded-xl p-3 ${color}`}>
                <p className="text-xs font-medium">{label}</p>
                <p className="text-lg font-bold">{filtered.length} claims</p>
                <p className="text-xs">{formatCurrency(total)}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        {!isAdmin && (
          <Button onClick={() => { setForm({ category_id: '', claim_date: new Date().toISOString().split('T')[0], title: '', description: '', amount: '' }); setReceiptFile(null); setSubmitModal(true); }}>
            <Plus size={16} /> New Expense Claim
          </Button>
        )}
      </div>

      <Table
        loading={loading}
        rowKey={(c) => c.id}
        data={displayClaims}
        emptyMessage="No expense claims"
        onRowClick={(c) => {
          if (isAdmin && ['submitted', 'approved_supervisor', 'approved_manager'].includes(c.status)) {
            setApprovalModal(c); setApprovalNotes('');
          }
        }}
        columns={[
          { key: 'employee', header: 'Employee', render: (c) => <div><p className="font-medium">{(c.employee as { full_name?: string })?.full_name}</p><p className="text-xs text-slate-400">{(c.employee as { employee_code?: string })?.employee_code}</p></div> },
          { key: 'title', header: 'Description', render: (c) => <div><p className="font-medium text-sm">{c.title}</p><Badge className="bg-slate-100 text-slate-600 text-xs mt-0.5">{(c.category as { name?: string })?.name ?? 'Uncategorized'}</Badge></div> },
          { key: 'claim_date', header: 'Date', render: (c) => formatDate(c.claim_date) },
          { key: 'amount', header: 'Amount', render: (c) => <span className="font-semibold text-blue-700">{formatCurrency(c.amount)}</span> },
          { key: 'receipt_url', header: 'Receipt', render: (c) => c.receipt_url ? <a href={c.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1"><Receipt size={12} />View</a> : <span className="text-slate-400 text-xs">-</span> },
          { key: 'status', header: 'Status', render: (c) => <Badge className={STATUS_COLORS[c.status]}>{c.status.replace(/_/g, ' ')}</Badge> },
          { key: 'arrow', header: '', render: (c) => isAdmin && ['submitted', 'approved_supervisor', 'approved_manager'].includes(c.status) ? <ChevronRight size={14} className="text-blue-400" /> : null },
        ]}
      />

      {/* Submit Modal */}
      <Modal isOpen={submitModal} onClose={() => setSubmitModal(false)} title="New Expense Claim" size="md"
        footer={<><Button variant="outline" onClick={() => setSubmitModal(false)}>Cancel</Button><Button loading={saving || uploading} onClick={handleSubmit}>Submit Claim</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} options={[{ value: '', label: 'Select category' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
            <Input label="Date" type="date" value={form.claim_date} onChange={(e) => setForm({ ...form, claim_date: e.target.value })} required />
          </div>
          <Input label="Title / Description" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Team lunch with client" />
          <Input label="Amount (IDR)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <Textarea label="Additional Notes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">Receipt / Proof</p>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} className="hidden" id="receipt-upload" />
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload Receipt</Button>
              {receiptFile && <span className="text-sm text-slate-600 truncate">{receiptFile.name}</span>}
            </div>
          </div>
        </div>
      </Modal>

      {/* Approval Modal */}
      {approvalModal && (
        <Modal isOpen onClose={() => setApprovalModal(null)} title="Expense Approval" size="md"
          footer={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setApprovalModal(null)}>Cancel</Button>
              <Button variant="danger" loading={saving} onClick={() => handleDecision(approvalModal, 'reject')}><XCircle size={14} /> Reject</Button>
              <Button loading={saving} onClick={() => handleDecision(approvalModal, 'approve')}><CheckCircle size={14} /> Approve</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="font-semibold text-slate-900">{(approvalModal.employee as { full_name?: string })?.full_name}</p>
              <p className="text-sm text-slate-600 mt-1">{approvalModal.title}</p>
              <p className="text-xl font-bold text-blue-700 mt-2">{formatCurrency(approvalModal.amount)}</p>
              <div className="flex items-center gap-3 mt-2">
                <Badge className="bg-slate-100 text-slate-600">{(approvalModal.category as { name?: string })?.name ?? 'Uncategorized'}</Badge>
                <span className="text-sm text-slate-500">{formatDate(approvalModal.claim_date)}</span>
              </div>
              {approvalModal.description && <p className="text-sm text-slate-500 mt-2 italic">{approvalModal.description}</p>}
              {approvalModal.receipt_url && (
                <a href={approvalModal.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-2">
                  <Receipt size={12} /> View Receipt
                </a>
              )}
            </div>
            <Textarea label="Notes (required for rejection)" value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} placeholder="Add approval/rejection notes..." />
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ExpensePage() {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState('claims');
  const isAdmin = role && ['super_admin', 'hr_admin'].includes(role);

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'claims', label: 'Expense Claims', icon: <Receipt size={14} /> },
          ...(isAdmin ? [{ id: 'categories', label: 'Categories', icon: <Settings size={14} /> }] : []),
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === 'claims' && <ExpenseClaimsTab />}
      {activeTab === 'categories' && isAdmin && <ExpenseCategoriesTab />}
    </div>
  );
}
