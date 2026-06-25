import React, { useEffect, useState } from 'react';
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
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold">
          Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'},{' '}
          {profile?.full_name?.split(' ')[0] || 'User'}!
        </h2>
        <p className="text-blue-100 mt-1 text-sm">
          Today is {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span>{stats.presentToday} present</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400"></div>
            <span>{stats.lateToday} late</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white/60"></div>
            <span>{attendanceRate}% attendance rate</span>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Employees"
          value={loading ? '...' : stats.totalEmployees}
          icon={<Users size={20} />}
          iconBg="bg-blue-50 text-blue-600"
          className="col-span-1"
        />
        <StatCard
          label="Present Today"
          value={loading ? '...' : stats.presentToday}
          icon={<CheckCircle size={20} />}
          iconBg="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Late Today"
          value={loading ? '...' : stats.lateToday}
          icon={<AlertCircle size={20} />}
          iconBg="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="On Leave"
          value={loading ? '...' : stats.onLeave}
          icon={<Calendar size={20} />}
          iconBg="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Active Outlets"
          value={loading ? '...' : stats.activeOutlets}
          icon={<Building2 size={20} />}
          iconBg="bg-teal-50 text-teal-600"
        />
        <StatCard
          label="Attendance Rate"
          value={loading ? '...' : `${attendanceRate}%`}
          icon={<TrendingUp size={20} />}
          iconBg="bg-indigo-50 text-indigo-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Attendance */}
        <Card padding={false}>
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Activity size={16} className="text-blue-500" /> Today's Attendance
            </h3>
            <span className="text-xs text-slate-500">{new Date().toLocaleDateString('id-ID')}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-6 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-36" />
                    <div className="h-2.5 bg-slate-100 rounded animate-pulse w-24" />
                  </div>
                </div>
              ))
            ) : recentAttendance.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-400 text-sm">No attendance records today</div>
            ) : (
              recentAttendance.map((att) => (
                <div key={att.id} className="px-6 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                    {(att.employee as { full_name?: string })?.full_name?.charAt(0) ?? 'E'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {(att.employee as { full_name?: string })?.full_name ?? 'Employee'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {(att.employee as { job_title?: string })?.job_title ?? '-'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge className={STATUS_COLORS[att.status]}>
                      {att.status.replace('_', ' ')}
                    </Badge>
                    {att.check_in_time && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(att.check_in_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Pending Leave Approvals */}
        <Card padding={false}>
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Clock size={16} className="text-amber-500" /> Pending Leave Requests
            </h3>
            {stats.pendingApprovals > 0 && (
              <Badge className="bg-amber-100 text-amber-700">{stats.pendingApprovals}</Badge>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-6 py-3">
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-40 mb-2" />
                  <div className="h-2.5 bg-slate-100 rounded animate-pulse w-28" />
                </div>
              ))
            ) : pendingLeaves.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-400 text-sm">No pending requests</div>
            ) : (
              pendingLeaves.map((req) => (
                <div key={req.id} className="px-6 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold flex-shrink-0">
                    {(req.employee as { full_name?: string })?.full_name?.charAt(0) ?? 'E'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {(req.employee as { full_name?: string })?.full_name ?? 'Employee'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(req.leave_type as { name?: string })?.name ?? 'Leave'} &bull;{' '}
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
