import React, { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/utils';
import type { Notification, NotificationType } from '../../lib/database.types';

const TYPE_COLORS: Record<NotificationType, string> = {
  attendance: 'bg-blue-100 text-blue-700',
  payroll: 'bg-emerald-100 text-emerald-700',
  leave: 'bg-purple-100 text-purple-700',
  overtime: 'bg-amber-100 text-amber-700',
  shift: 'bg-indigo-100 text-indigo-700',
  system: 'bg-slate-100 text-slate-600',
  approval: 'bg-teal-100 text-teal-700',
};

export function NotificationsPanel({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-slate-600" />
          <h2 className="font-semibold text-slate-900">Notifications</h2>
          {unread > 0 && <Badge className="bg-red-100 text-red-700">{unread} new</Badge>}
        </div>
        {unread > 0 && (
          <Button size="sm" variant="ghost" onClick={markAllRead}><CheckCheck size={14} /> Mark all read</Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Bell size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex gap-3 p-4 rounded-xl border transition-all cursor-pointer hover:border-blue-200 ${n.is_read ? 'bg-white border-slate-100' : 'bg-blue-50/50 border-blue-100'}`}
              onClick={() => !n.is_read && markRead(n.id)}
            >
              <div className="flex-shrink-0 mt-0.5">
                <Badge className={TYPE_COLORS[n.type]}>{n.type}</Badge>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                <p className="text-xs text-slate-400 mt-1">{formatDateTime(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .then(({ count: c }) => setCount(c ?? 0));

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        setCount((c) => c + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}
