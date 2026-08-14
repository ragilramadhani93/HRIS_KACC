import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Building2, MapPin } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { Table } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Tabs } from '../ui/Tabs';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui/Toast';
import { formatDate, OUTLET_TYPE_LABELS } from '../../lib/utils';
import type { Company, Region, Area, Outlet, OutletType } from '../../lib/database.types';

// ─── Companies ────────────────────────────────────────────
function CompaniesTab() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', address: '', phone: '', email: '', is_active: true });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('companies').select('*').order('name');
    setCompanies(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '', address: '', phone: '', email: '', is_active: true }); setModalOpen(true); };
  const openEdit = (c: Company) => { setEditing(c); setForm({ name: c.name, code: c.code, address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '', is_active: c.is_active }); setModalOpen(true); };

  const toggleStatus = async (c: Company) => {
    const next = !c.is_active;
    const { error } = await supabase.from('companies').update({ is_active: next }).eq('id', c.id);
    if (error) { toast('error', 'Failed to update status', error.message); } else { toast('success', next ? 'Company activated' : 'Company deactivated'); load(); }
  };

  const handleSave = async () => {
    if (!form.name || !form.code) return toast('error', 'Name and Code are required');
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from('companies').update(form).eq('id', editing.id);
      if (error) { toast('error', 'Failed to update', error.message); } else { toast('success', 'Company updated'); load(); setModalOpen(false); }
    } else {
      const { error } = await supabase.from('companies').insert(form);
      if (error) { toast('error', 'Failed to create', error.message); } else { toast('success', 'Company created'); load(); setModalOpen(false); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this company? All related data will be removed.')) return;
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) { toast('error', 'Cannot delete', error.message); } else { toast('success', 'Deleted'); load(); }
  };

  const filtered = companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Input placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={14} />} className="w-72" />
        <Button onClick={openCreate}><Plus size={16} /> Add Company</Button>
      </div>
      <Table
        loading={loading}
        rowKey={(r) => r.id}
        data={filtered}
        columns={[
          { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{r.code}</span> },
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'email', header: 'Email', render: (r) => r.email ?? '-' },
          { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '-' },
          { key: 'is_active', header: 'Status', render: (r) => (
            <button type="button" onClick={() => toggleStatus(r)} title="Click to toggle status" className="cursor-pointer transition-transform active:scale-95">
              <Badge className={r.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
            </button>
          ) },
          { key: 'created_at', header: 'Created', render: (r) => formatDate(r.created_at) },
          { key: 'actions', header: '', render: (r) => (
            <div className="flex gap-1 justify-end">
              <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Edit2 size={14} /></Button>
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(r.id)}><Trash2 size={14} /></Button>
            </div>
          )},
        ]}
      />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Company' : 'Add Company'} size="md"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Company Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Textarea label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div>
            <p className="block text-xs font-medium text-slate-500 mb-1.5">Status</p>
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 p-1 bg-slate-50">
              <button type="button" onClick={() => setForm({ ...form, is_active: true })}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${form.is_active ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                Active
              </button>
              <button type="button" onClick={() => setForm({ ...form, is_active: false })}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${!form.is_active ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                Inactive
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Regions ──────────────────────────────────────────────
function RegionsTab() {
  const { toast } = useToast();
  const [regions, setRegions] = useState<Region[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Region | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', company_id: '', is_active: true });

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('regions').select('*, company:companies(name)').order('name'),
      supabase.from('companies').select('id, name').eq('is_active', true),
    ]);
    setRegions((r as Region[]) ?? []);
    setCompanies((c as Company[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '', company_id: companies[0]?.id ?? '', is_active: true }); setModalOpen(true); };
  const openEdit = (r: Region) => { setEditing(r); setForm({ name: r.name, code: r.code, company_id: r.company_id, is_active: r.is_active }); setModalOpen(true); };

  const toggleRegionStatus = async (r: Region) => {
    const next = !r.is_active;
    const { error } = await supabase.from('regions').update({ is_active: next }).eq('id', r.id);
    if (error) { toast('error', 'Failed to update status', error.message); } else { toast('success', next ? 'Region activated' : 'Region deactivated'); load(); }
  };

  const handleSave = async () => {
    if (!form.name || !form.code || !form.company_id) return toast('error', 'All fields required');
    setSaving(true);
    const op = editing
      ? supabase.from('regions').update(form).eq('id', editing.id)
      : supabase.from('regions').insert(form);
    const { error } = await op;
    if (error) { toast('error', 'Failed', error.message); } else { toast('success', editing ? 'Updated' : 'Created'); load(); setModalOpen(false); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this region? All areas and outlets under it will also be removed.')) return;
    const { error } = await supabase.from('regions').delete().eq('id', id);
    if (error) { toast('error', 'Cannot delete', error.message); } else { toast('success', 'Region deleted'); load(); }
  };

  const filtered = regions.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Input placeholder="Search regions..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={14} />} className="w-72" />
        <Button onClick={openCreate}><Plus size={16} /> Add Region</Button>
      </div>
      <Table loading={loading} rowKey={(r) => r.id} data={filtered} columns={[
        { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{r.code}</span> },
        { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'company', header: 'Company', render: (r) => (r.company as { name?: string })?.name ?? '-' },
        { key: 'is_active', header: 'Status', render: (r) => (
          <button type="button" onClick={() => toggleRegionStatus(r)} title="Click to toggle status" className="cursor-pointer transition-transform active:scale-95">
            <Badge className={r.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
          </button>
        ) },
        { key: 'actions', header: '', render: (r) => (
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Edit2 size={14} /></Button>
            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(r.id)}><Trash2 size={14} /></Button>
          </div>
        ) },
      ]} />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Region' : 'Add Region'} size="sm"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Select label="Company" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} options={companies.map((c) => ({ value: c.id, label: c.name }))} required />
          <Input label="Region Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
          <div>
            <p className="block text-xs font-medium text-slate-500 mb-1.5">Status</p>
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 p-1 bg-slate-50">
              <button type="button" onClick={() => setForm({ ...form, is_active: true })}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${form.is_active ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                Active
              </button>
              <button type="button" onClick={() => setForm({ ...form, is_active: false })}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${!form.is_active ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                Inactive
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Areas ────────────────────────────────────────────────
function AreasTab() {
  const { toast } = useToast();
  const [areas, setAreas] = useState<Area[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', region_id: '', is_active: true });

  const load = async () => {
    setLoading(true);
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from('areas').select('*, region:regions(name, company:companies(name))').order('name'),
      supabase.from('regions').select('id, name').eq('is_active', true),
    ]);
    setAreas((a as Area[]) ?? []);
    setRegions((r as Region[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '', region_id: regions[0]?.id ?? '', is_active: true }); setModalOpen(true); };
  const openEdit = (a: Area) => { setEditing(a); setForm({ name: a.name, code: a.code, region_id: a.region_id, is_active: a.is_active }); setModalOpen(true); };

  const toggleAreaStatus = async (a: Area) => {
    const next = !a.is_active;
    const { error } = await supabase.from('areas').update({ is_active: next }).eq('id', a.id);
    if (error) { toast('error', 'Failed to update status', error.message); } else { toast('success', next ? 'Area activated' : 'Area deactivated'); load(); }
  };

  const handleSave = async () => {
    if (!form.name || !form.code || !form.region_id) return toast('error', 'All fields required');
    setSaving(true);
    const op = editing ? supabase.from('areas').update(form).eq('id', editing.id) : supabase.from('areas').insert(form);
    const { error } = await op;
    if (error) { toast('error', 'Failed', error.message); } else { toast('success', editing ? 'Updated' : 'Created'); load(); setModalOpen(false); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this area? All outlets under it will also be removed.')) return;
    const { error } = await supabase.from('areas').delete().eq('id', id);
    if (error) { toast('error', 'Cannot delete', error.message); } else { toast('success', 'Area deleted'); load(); }
  };

  const filtered = areas.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Input placeholder="Search areas..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={14} />} className="w-72" />
        <Button onClick={openCreate}><Plus size={16} /> Add Area</Button>
      </div>
      <Table loading={loading} rowKey={(a) => a.id} data={filtered} columns={[
        { key: 'code', header: 'Code', render: (a) => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{a.code}</span> },
        { key: 'name', header: 'Name', render: (a) => <span className="font-medium">{a.name}</span> },
        { key: 'region', header: 'Region', render: (a) => (a.region as { name?: string })?.name ?? '-' },
        { key: 'company', header: 'Company', render: (a) => (a.region as { company?: { name?: string } })?.company?.name ?? '-' },
        { key: 'is_active', header: 'Status', render: (a) => (
          <button type="button" onClick={() => toggleAreaStatus(a)} title="Click to toggle status" className="cursor-pointer transition-transform active:scale-95">
            <Badge className={a.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
          </button>
        ) },
        { key: 'actions', header: '', render: (a) => (
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Edit2 size={14} /></Button>
            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(a.id)}><Trash2 size={14} /></Button>
          </div>
        ) },
      ]} />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Area' : 'Add Area'} size="sm"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <Select label="Region" value={form.region_id} onChange={(e) => setForm({ ...form, region_id: e.target.value })} options={regions.map((r) => ({ value: r.id, label: r.name }))} required />
          <Input label="Area Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
          <div>
            <p className="block text-xs font-medium text-slate-500 mb-1.5">Status</p>
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 p-1 bg-slate-50">
              <button type="button" onClick={() => setForm({ ...form, is_active: true })}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${form.is_active ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                Active
              </button>
              <button type="button" onClick={() => setForm({ ...form, is_active: false })}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${!form.is_active ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                Inactive
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Outlets ──────────────────────────────────────────────
function OutletsTab() {
  const { toast } = useToast();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    outlet_code: '', name: '', area_id: '', outlet_type: 'coffee_shop' as OutletType,
    address: '', latitude: '', longitude: '', geofence_radius_meters: '100', is_active: true,
  });

  const load = async () => {
    setLoading(true);
    const [{ data: o }, { data: a }] = await Promise.all([
      supabase.from('outlets').select('*, area:areas(name, region:regions(name))').order('name'),
      supabase.from('areas').select('id, name').eq('is_active', true),
    ]);
    setOutlets(o ?? []);
    setAreas((a as Area[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ outlet_code: '', name: '', area_id: areas[0]?.id ?? '', outlet_type: 'coffee_shop', address: '', latitude: '', longitude: '', geofence_radius_meters: '100', is_active: true });
    setModalOpen(true);
  };
  const openEdit = (o: Outlet) => {
    setEditing(o);
    setForm({ outlet_code: o.outlet_code, name: o.name, area_id: o.area_id, outlet_type: o.outlet_type, address: o.address ?? '', latitude: o.latitude?.toString() ?? '', longitude: o.longitude?.toString() ?? '', geofence_radius_meters: o.geofence_radius_meters.toString(), is_active: o.is_active });
    setModalOpen(true);
  };

  const toggleOutletStatus = async (o: Outlet) => {
    const next = !o.is_active;
    const { error } = await supabase.from('outlets').update({ is_active: next }).eq('id', o.id);
    if (error) { toast('error', 'Failed to update status', error.message); } else { toast('success', next ? 'Outlet activated' : 'Outlet deactivated'); load(); }
  };

  const handleSave = async () => {
    if (!form.outlet_code || !form.name || !form.area_id) return toast('error', 'Code, Name, and Area are required');
    setSaving(true);
    const payload = {
      outlet_code: form.outlet_code, name: form.name, area_id: form.area_id,
      outlet_type: form.outlet_type, address: form.address || null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      geofence_radius_meters: parseInt(form.geofence_radius_meters) || 100,
      is_active: form.is_active,
    };
    const op = editing ? supabase.from('outlets').update(payload).eq('id', editing.id) : supabase.from('outlets').insert(payload);
    const { error } = await op;
    if (error) { toast('error', 'Failed', error.message); } else { toast('success', editing ? 'Updated' : 'Created'); load(); setModalOpen(false); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this outlet? Related schedules, kiosk sessions, and employee references will be cleaned up.')) return;
    const { error } = await supabase.from('outlets').delete().eq('id', id);
    if (error) { toast('error', 'Cannot delete', error.message); } else { toast('success', 'Outlet deleted'); load(); }
  };

  const outletTypeOptions = Object.entries(OUTLET_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }));
  const filtered = outlets.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()) || o.outlet_code.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Input placeholder="Search outlets..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={14} />} className="w-72" />
        <Button onClick={openCreate}><Plus size={16} /> Add Outlet</Button>
      </div>
      <Table loading={loading} rowKey={(o) => o.id} data={filtered} columns={[
        { key: 'outlet_code', header: 'Code', render: (o) => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{o.outlet_code}</span> },
        { key: 'name', header: 'Name', render: (o) => <div><p className="font-medium">{o.name}</p><p className="text-xs text-slate-400">{(o.area as { name?: string })?.name}</p></div> },
        { key: 'outlet_type', header: 'Type', render: (o) => <Badge className="bg-blue-50 text-blue-700 border border-blue-100">{OUTLET_TYPE_LABELS[o.outlet_type]}</Badge> },
        { key: 'geofence', header: 'Geofence', render: (o) => o.latitude ? <span className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{o.geofence_radius_meters}m</span> : <span className="text-xs text-slate-400">Not set</span> },
        { key: 'is_active', header: 'Status', render: (o) => (
          <button type="button" onClick={() => toggleOutletStatus(o)} title="Click to toggle status" className="cursor-pointer transition-transform active:scale-95">
            <Badge className={o.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}>{o.is_active ? 'Active' : 'Inactive'}</Badge>
          </button>
        ) },
        { key: 'actions', header: '', render: (o) => (
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" onClick={() => openEdit(o)}><Edit2 size={14} /></Button>
            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(o.id)}><Trash2 size={14} /></Button>
          </div>
        ) },
      ]} />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Outlet' : 'Add Outlet'} size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button loading={saving} onClick={handleSave}>Save</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Outlet Code" value={form.outlet_code} onChange={(e) => setForm({ ...form, outlet_code: e.target.value.toUpperCase() })} required />
            <Input label="Outlet Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Area" value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })} options={areas.map((a) => ({ value: a.id, label: a.name }))} required />
            <Select label="Outlet Type" value={form.outlet_type} onChange={(e) => setForm({ ...form, outlet_type: e.target.value as OutletType })} options={outletTypeOptions} />
          </div>
          <Textarea label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Latitude" type="number" step="0.0000001" placeholder="-6.2088" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
            <Input label="Longitude" type="number" step="0.0000001" placeholder="106.8456" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
            <Input label="Geofence Radius (m)" type="number" value={form.geofence_radius_meters} onChange={(e) => setForm({ ...form, geofence_radius_meters: e.target.value })} />
          </div>
          <div>
            <p className="block text-xs font-medium text-slate-500 mb-1.5">Status</p>
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 p-1 bg-slate-50">
              <button type="button" onClick={() => setForm({ ...form, is_active: true })}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${form.is_active ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                Active
              </button>
              <button type="button" onClick={() => setForm({ ...form, is_active: false })}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${!form.is_active ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                Inactive
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────
const TABS = [
  { id: 'companies', label: 'Companies', icon: <Building2 size={14} /> },
  { id: 'regions', label: 'Regions', icon: <MapPin size={14} /> },
  { id: 'areas', label: 'Areas', icon: <MapPin size={14} /> },
  { id: 'outlets', label: 'Outlets', icon: <Building2 size={14} /> },
];

interface OrganizationPageProps {
  initialTab?: string;
}

export function OrganizationPage({ initialTab = 'companies' }: OrganizationPageProps) {
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.id === initialTab) ? initialTab : 'companies'
  );

  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      <div>
        {activeTab === 'companies' && <CompaniesTab />}
        {activeTab === 'regions' && <RegionsTab />}
        {activeTab === 'areas' && <AreasTab />}
        {activeTab === 'outlets' && <OutletsTab />}
      </div>
    </div>
  );
}
