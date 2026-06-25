import React, { useEffect, useState } from 'react';
import { Shield, Edit2, Search, Plus, Eye, EyeOff, Link2 } from 'lucide-react';
import { Table } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Select, Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui/Toast';
import { formatDate, ROLE_LABELS, STATUS_COLORS } from '../../lib/utils';
import type { UserProfile, AppRole, Employee } from '../../lib/database.types';

export function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Edit role modal
  const [editModal, setEditModal] = useState<UserProfile | null>(null);
  const [newRole, setNewRole] = useState<AppRole>('employee');
  const [saving, setSaving] = useState(false);

  // Create user modal (admin only)
  const [createModal, setCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '', email: '', password: '', role: 'employee' as AppRole,
    company_id: '', linked_employee_id: '',
  });
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  // Link employee modal
  const [linkModal, setLinkModal] = useState<UserProfile | null>(null);
  const [linkEmpId, setLinkEmpId] = useState('');
  const [linking, setLinking] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: u }, { data: e }, { data: c }] = await Promise.all([
      supabase.from('user_profiles').select('*, company:companies(name)').order('full_name'),
      supabase.from('employees').select('id, full_name, employee_code, user_id').eq('status', 'active').order('full_name'),
      supabase.from('companies').select('id, name').eq('is_active', true),
    ]);
    setUsers((u as UserProfile[]) ?? []);
    setEmployees((e as Employee[]) ?? []);
    setCompanies(c ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Create user via Supabase Admin API — we use the service-role edge path
  // In Bolt environment we call supabase auth signUp with service role via edge function
  // Fallback: use standard signUp (works because email confirmation is off)
  const handleCreateUser = async () => {
    const { full_name, email, password, role, company_id, linked_employee_id } = createForm;
    if (!full_name || !email || !password) return toast('error', 'Nama, email, dan password wajib diisi');
    if (password.length < 6) return toast('error', 'Password minimal 6 karakter');
    setCreating(true);

    // Create auth user
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { toast('error', 'Gagal membuat akun', error.message); setCreating(false); return; }
    if (!data.user) { toast('error', 'User tidak terbuat'); setCreating(false); return; }

    // Create profile
    const { error: profileErr } = await supabase.from('user_profiles').upsert({
      id: data.user.id,
      full_name,
      role,
      company_id: company_id || null,
    });
    if (profileErr) { toast('error', 'Gagal membuat profil', profileErr.message); setCreating(false); return; }

    // Link to employee if selected
    if (linked_employee_id) {
      await supabase.from('employees').update({ user_id: data.user.id }).eq('id', linked_employee_id);
    }

    toast('success', `Akun ${full_name} berhasil dibuat`);
    load();
    setCreateModal(false);
    setCreateForm({ full_name: '', email: '', password: '', role: 'employee', company_id: '', linked_employee_id: '' });
    setCreating(false);
  };

  const handleRoleUpdate = async () => {
    if (!editModal) return;
    setSaving(true);
    const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('id', editModal.id);
    if (error) { toast('error', 'Gagal', error.message); } else { toast('success', 'Role diperbarui'); load(); setEditModal(null); }
    setSaving(false);
  };

  const handleToggleActive = async (user: UserProfile) => {
    const { error } = await supabase.from('user_profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    if (error) { toast('error', 'Gagal'); } else { toast('success', 'Status diperbarui'); load(); }
  };

  const handleLinkEmployee = async () => {
    if (!linkModal || !linkEmpId) return;
    setLinking(true);
    // Unlink any previous employee linked to this user
    await supabase.from('employees').update({ user_id: null }).eq('user_id', linkModal.id);
    // Link new employee
    await supabase.from('employees').update({ user_id: linkModal.id }).eq('id', linkEmpId);
    toast('success', 'Karyawan berhasil dihubungkan');
    setLinkModal(null);
    setLinkEmpId('');
    load();
    setLinking(false);
  };

  // Find employee linked to a user profile
  const getLinkedEmployee = (userId: string) => employees.find((e) => e.user_id === userId);

  const roleOptions = (Object.keys(ROLE_LABELS) as AppRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const filteredUsers = users.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()));
  const unlinkedEmployees = employees.filter((e) => !e.user_id || (linkModal && e.user_id === linkModal.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Cari user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={14} />}
            className="w-64"
          />
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Shield size={14} />
            <span>{users.length} users</span>
          </div>
        </div>
        <Button onClick={() => { setCreateForm({ full_name: '', email: '', password: '', role: 'employee', company_id: '', linked_employee_id: '' }); setCreateModal(true); }}>
          <Plus size={16} /> Buat Akun
        </Button>
      </div>

      <Table
        loading={loading}
        rowKey={(u) => u.id}
        data={filteredUsers}
        columns={[
          {
            key: 'full_name', header: 'User',
            render: (u) => {
              const linked = getLinkedEmployee(u.id);
              return (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold flex-shrink-0">
                    {u.full_name?.charAt(0) ?? 'U'}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{u.full_name}</p>
                    {linked
                      ? <p className="text-xs text-emerald-600 flex items-center gap-1"><Link2 size={10} />{linked.full_name} ({linked.employee_code})</p>
                      : <p className="text-xs text-slate-400">Belum terhubung ke karyawan</p>
                    }
                  </div>
                </div>
              );
            },
          },
          { key: 'role', header: 'Role', render: (u) => <Badge className="bg-blue-50 text-blue-700">{ROLE_LABELS[u.role]}</Badge> },
          { key: 'company', header: 'Perusahaan', render: (u) => (u.company as { name?: string })?.name ?? '-' },
          { key: 'is_active', header: 'Status', render: (u) => <Badge className={u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{u.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
          { key: 'created_at', header: 'Bergabung', render: (u) => formatDate(u.created_at) },
          {
            key: 'actions', header: '',
            render: (u) => (
              <div className="flex gap-1 justify-end">
                <Button size="sm" variant="ghost" title="Hubungkan karyawan" onClick={() => { setLinkModal(u); setLinkEmpId(getLinkedEmployee(u.id)?.id ?? ''); }}>
                  <Link2 size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditModal(u); setNewRole(u.role); }}>
                  <Edit2 size={14} />
                </Button>
                <Button size="sm" variant="ghost" className={u.is_active ? 'text-red-500 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'} onClick={() => handleToggleActive(u)}>
                  {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
              </div>
            ),
          },
        ]}
      />

      {/* Create User Modal */}
      <Modal isOpen={createModal} onClose={() => setCreateModal(false)} title="Buat Akun Baru" size="md"
        footer={<><Button variant="outline" onClick={() => setCreateModal(false)}>Batal</Button><Button loading={creating} onClick={handleCreateUser}>Buat Akun</Button></>}
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
            Akun baru hanya dapat dibuat oleh Admin. Karyawan tidak dapat mendaftar sendiri.
          </div>
          <Input label="Nama Lengkap" value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} required />
          <Input label="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
          <Input
            label="Password"
            type={showPwd ? 'text' : 'password'}
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            hint="Minimal 6 karakter"
            rightIcon={
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="text-slate-400 hover:text-slate-600">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Role" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as AppRole })} options={roleOptions} />
            <Select
              label="Perusahaan"
              value={createForm.company_id}
              onChange={(e) => setCreateForm({ ...createForm, company_id: e.target.value })}
              options={[{ value: '', label: 'Pilih perusahaan' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <Select
            label="Hubungkan ke Karyawan (opsional)"
            value={createForm.linked_employee_id}
            onChange={(e) => setCreateForm({ ...createForm, linked_employee_id: e.target.value })}
            options={[
              { value: '', label: 'Tidak dihubungkan' },
              ...employees.filter((e) => !e.user_id).map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` })),
            ]}
          />
        </div>
      </Modal>

      {/* Edit Role Modal */}
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title="Ubah Role" size="sm"
        footer={<><Button variant="outline" onClick={() => setEditModal(null)}>Batal</Button><Button loading={saving} onClick={handleRoleUpdate}>Simpan</Button></>}
      >
        {editModal && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-3 text-sm">
              <p className="font-semibold">{editModal.full_name}</p>
              <p className="text-slate-500">Role saat ini: <strong>{ROLE_LABELS[editModal.role]}</strong></p>
            </div>
            <Select label="Role Baru" value={newRole} onChange={(e) => setNewRole(e.target.value as AppRole)} options={roleOptions} />
          </div>
        )}
      </Modal>

      {/* Link Employee Modal */}
      <Modal isOpen={!!linkModal} onClose={() => setLinkModal(null)} title="Hubungkan ke Karyawan" size="sm"
        footer={<><Button variant="outline" onClick={() => setLinkModal(null)}>Batal</Button><Button loading={linking} onClick={handleLinkEmployee}>Simpan</Button></>}
      >
        {linkModal && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-3 text-sm">
              <p className="font-semibold">{linkModal.full_name}</p>
              <p className="text-slate-400">Pilih data karyawan yang sesuai dengan akun ini.</p>
            </div>
            <Select
              label="Karyawan"
              value={linkEmpId}
              onChange={(e) => setLinkEmpId(e.target.value)}
              options={[
                { value: '', label: 'Tidak dihubungkan' },
                ...unlinkedEmployees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` })),
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
