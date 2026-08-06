import { useEffect, useState } from 'react';
import { Users, Clock, Calendar, TrendingUp, Building2, CheckCircle, AlertCircle, Activity } from 'lucide-react';
import { StatCard, Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDate, STATUS_COLORS } from '../../lib/utils';
import type { Attendance, LeaveRequest } from '../../lib/database.types';

interface DashboardStats {
  totalEmployees: number;
  presentToday: number;
  onLeave: number;
  pendingApprovals: number;
  activeOutlets: number;
  lateToday: number;
}

export function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0, presentToday: 0, onLeave: 0,
    pendingApprovals: 0, activeOutlets: 0, lateToday: 0,
  });
  const [recentAttendance, setRecentAttendance] = useState<Attendance[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];

    Promise.all([
      supabase.from('employees').select('id', { count: 'exact' }).eq('status', 'active'),
      supabase.from('attendance').select('id', { count: 'exact' }).eq('attendance_date', today).eq('status', 'present'),
      supabase.from('attendance').select('id', { count: 'exact' }).eq('attendance_date', today).eq('status', 'late'),
      supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('outlets').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('attendance')
        .select('*, employee:employees(full_name, job_title, primary_outlet:outlets(name))')
        .eq('attendance_date', today)
        .order('check_in_time', { ascending: false })
        .limit(8),
      supabase.from('leave_requests')
        .select('*, employee:employees(full_name, job_title), leave_type:leave_types(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
    ]).then(([empRes, presRes, lateRes, leaveRes, outletRes, attRes, pendingRes]) => {
      setStats({
        totalEmployees: empRes.count ?? 0,
        presentToday: presRes.count ?? 0,
        lateToday: lateRes.count ?? 0,
        onLeave: leaveRes.count ?? 0,
        pendingApprovals: (leaveRes.count ?? 0),
        activeOutlets: outletRes.count ?? 0,
      });
      setRecentAttendance((attRes.data as Attendance[]) ?? []);
      setPendingLeaves((pendingRes.data as LeaveRequest[]) ?? []);
      setLoading(false);
    });
  }, []);

  const attendanceRate =
    stats.totalEmployees > 0
      ? Math.round(((stats.presentToday + stats.lateToday) / stats.totalEmployees) * 100)
      : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-2xl p-6 text-white shadow-lg">
        {/* Pattern overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 25px 25px, rgba(255,255,255,0.2) 1px, transparent 0)`,
            backgroundSize: '50px 50px',
          }}
        />
        <div className="relative">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {new Date().getHours() < 12 ? 'Selamat Pagi' : new Date().getHours() < 17 ? 'Selamat Siang' : 'Selamat Malam'},{' '}
                <span className="text-blue-100">{profile?.full_name?.split(' ')[0] || 'User'}</span>!
              </h2>
              <p className="text-blue-200 mt-1 text-sm">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-5 text-sm flex-wrap">
            <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 glow-pulse" />
              <span><strong className="font-semibold">{stats.presentToday}</strong> Hadir</span>
            </div>
            <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span><strong className="font-semibold">{stats.lateToday}</strong> Terlambat</span>
            </div>
            <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
              <div className="w-2.5 h-2.5 rounded-full bg-white/60" />
              <span><strong className="font-semibold">{attendanceRate}%</strong> Kehadiran</span>
            </div>
          </div>
        </div>

        {/* Decorative line chart */}
        <svg className="absolute bottom-0 right-0 w-48 h-24 opacity-10" viewBox="0 0 200 100" fill="none">
          <path d="M0 80 Q25 60 50 70 T100 40 T150 30 T200 20" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 90 Q25 75 50 80 T100 55 T150 45 T200 35" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        </svg>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Karyawan', value: stats.totalEmployees, icon: <Users size={20} />, bg: 'bg-blue-50 text-blue-600' },
          { label: 'Hadir Hari Ini', value: stats.presentToday, icon: <CheckCircle size={20} />, bg: 'bg-emerald-50 text-emerald-600' },
          { label: 'Terlambat', value: stats.lateToday, icon: <AlertCircle size={20} />, bg: 'bg-amber-50 text-amber-600' },
          { label: 'Cuti/Izin', value: stats.onLeave, icon: <Calendar size={20} />, bg: 'bg-purple-50 text-purple-600' },
          { label: 'Outlet Aktif', value: stats.activeOutlets, icon: <Building2 size={20} />, bg: 'bg-teal-50 text-teal-600' },
          { label: 'Tingkat Hadir', value: `${attendanceRate}%`, icon: <TrendingUp size={20} />, bg: 'bg-indigo-50 text-indigo-600' },
        ].map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={loading ? '...' : item.value}
            icon={item.icon}
            iconBg={item.bg}
          />
        ))}
      </div>

      {/* Lists Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Attendance */}
        <Card padding={false} className="overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Activity size={15} />
              </div>
              Kehadiran Hari Ini
            </h3>
            <span className="text-xs font-medium text-slate-400">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-6 py-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full shimmer" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 shimmer rounded w-36" />
                    <div className="h-2.5 shimmer rounded w-24" />
                  </div>
                </div>
              ))
            ) : recentAttendance.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
                  <Clock size={20} className="text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">Belum ada data kehadiran hari ini</p>
              </div>
            ) : (
              recentAttendance.map((att) => (
                <div key={att.id} className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                    {(att.employee as { full_name?: string })?.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {(att.employee as { full_name?: string })?.full_name ?? 'Karyawan'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {(att.employee as { job_title?: string })?.job_title ?? '-'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge className={STATUS_COLORS[att.status]}>
                      {att.status === 'present' ? 'Hadir' : att.status === 'late' ? 'Terlambat' : att.status.replace('_', ' ')}
                    </Badge>
                    {att.check_in_time && (
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {new Date(att.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Pending Approvals */}
        <Card padding={false} className="overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Clock size={15} />
              </div>
              Pengajuan Menunggu
            </h3>
            {stats.pendingApprovals > 0 && (
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full">
                {stats.pendingApprovals} tertunda
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-6 py-3.5">
                  <div className="h-3 shimmer rounded w-40 mb-2" />
                  <div className="h-2.5 shimmer rounded w-28" />
                </div>
              ))
            ) : pendingLeaves.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle size={20} className="text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">Tidak ada pengajuan tertunda</p>
              </div>
            ) : (
              pendingLeaves.map((req) => (
                <div key={req.id} className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                    {(req.employee as { full_name?: string })?.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {(req.employee as { full_name?: string })?.full_name ?? 'Karyawan'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {(req.leave_type as { name?: string })?.name ?? 'Cuti'} &bull;{' '}
                      {formatDate(req.start_date)} - {formatDate(req.end_date)}
                    </p>
                  </div>
                  <Badge className={STATUS_COLORS[req.status]}>pending</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
