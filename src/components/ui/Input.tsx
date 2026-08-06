import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative group">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500">{leftIcon}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400',
              'transition-all duration-200',
              'hover:border-slate-300',
              'focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none',
              'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed disabled:hover:border-slate-200',
              error && 'border-red-300 hover:border-red-400 focus:border-red-500 focus:ring-red-100',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500">{rightIcon}</span>
          )}
        </div>
        {error && <p className="text-xs font-medium text-red-500 animate-fade-in">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative group">
          <select
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900',
              'transition-all duration-200 appearance-none cursor-pointer',
              'hover:border-slate-300',
              'focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none',
              'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed disabled:hover:border-slate-200',
              error && 'border-red-300 hover:border-red-400 focus:border-red-500 focus:ring-red-100',
              className
            )}
            {...props}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors group-focus-within:text-blue-500">
            <ChevronDown size={16} />
          </span>
        </div>
        {error && <p className="text-xs font-medium text-red-500 animate-fade-in">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative group">
          <textarea
            ref={ref}
            id={inputId}
            rows={3}
            className={cn(
              'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 resize-none',
              'transition-all duration-200',
              'hover:border-slate-300',
              'focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none',
              error && 'border-red-300 hover:border-red-400 focus:border-red-500 focus:ring-red-100',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs font-medium text-red-500 animate-fade-in">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
