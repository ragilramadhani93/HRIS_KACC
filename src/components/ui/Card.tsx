import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, padding = true, hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-slate-100 shadow-card transition-all duration-200',
        hover && 'hover:shadow-card-hover hover:border-slate-200 hover:-translate-y-0.5 cursor-pointer',
        padding && 'p-6',
        className
      )}
    >
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
  onClick?: () => void;
}

export function StatCard({ label, value, icon, iconBg = 'bg-blue-50 text-blue-600', change, changeType, className, onClick }: StatCardProps) {
  return (
    <Card
      hover={!!onClick}
      onClick={onClick}
      className={cn('flex items-start gap-4 group', className)}
    >
      <div className={cn('p-3 rounded-xl flex-shrink-0 transition-all duration-200 group-hover:scale-110 group-hover:shadow-inner', iconBg)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5 group-hover:text-blue-700 transition-colors">{value}</p>
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
