import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, size = 'md', footer }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAnimating(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      document.body.style.overflow = 'hidden';
    } else {
      setVisible(false);
      const timer = setTimeout(() => setAnimating(false), 200);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen && !animating) return null;

  const sizeMap = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 transition-all duration-200',
          visible ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/0 backdrop-blur-none'
        )}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cn(
          'relative w-full bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]',
          'transition-all duration-200',
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2',
          sizeMap[size]
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-150"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 px-6 py-4 scrollbar-thin">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
