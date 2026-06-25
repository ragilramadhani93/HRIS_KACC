import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-100 shadow-sm', padding && 'p-6', className)}>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  change?: string;
  changeType?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function StatCard({ label, value, icon, iconBg = 'bg-blue-50 text-blue-600', change, changeType, className }: StatCardProps) {
  return (
    <Card className={cn('flex items-start gap-4', className)}>
      <div className={cn('p-3 rounded-xl flex-shrink-0', iconBg)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
        {change && (
          <p
            className={cn(
              'text-xs mt-1 font-medium',
              changeType === 'up' && 'text-emerald-600',
              changeType === 'down' && 'text-red-500',
              changeType === 'neutral' && 'text-slate-500'
            )}
          >
            {change}
          </p>
        )}
      </div>
    </Card>
  );
}
