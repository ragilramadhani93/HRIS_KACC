import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outline' | 'dot';
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'teal' | 'slate';
}

const colorStyles: Record<string, { bg: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  red: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  slate: { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' },
};

export function Badge({ children, className, variant = 'default', color = 'slate' }: BadgeProps) {
  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)}>
        <span className={cn('w-2 h-2 rounded-full', colorStyles[color]?.dot || colorStyles.slate.dot)} />
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-all duration-150',
        variant === 'outline' && 'border border-current bg-transparent',
        variant === 'default' && colorStyles[color]?.bg,
        variant === 'default' && colorStyles[color]?.text,
        className
      )}
    >
      {children}
    </span>
  );
}
