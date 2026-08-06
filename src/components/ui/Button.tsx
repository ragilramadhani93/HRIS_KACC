import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.97]';

  const variants = {
    primary: 'bg-gradient-to-b from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 focus-visible:ring-blue-500 shadow-sm shadow-blue-200/50',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 focus-visible:ring-slate-300',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300',
    danger: 'bg-gradient-to-b from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 focus-visible:ring-red-500 shadow-sm shadow-red-200/50',
    outline: 'border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-slate-300 bg-white',
    success: 'bg-gradient-to-b from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 focus-visible:ring-emerald-500 shadow-sm shadow-emerald-200/50',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
