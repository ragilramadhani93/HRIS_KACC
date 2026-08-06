import React from 'react';
import { cn } from '../../lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 relative', className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
              isActive
                ? 'text-blue-700 bg-blue-50 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            )}
          >
            {tab.icon && <span className={cn('transition-colors', isActive ? 'text-blue-600' : 'text-slate-400')}>{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'text-xs rounded-full px-1.5 py-0.5 font-semibold',
                  isActive ? 'bg-blue-200 text-blue-700' : 'bg-slate-100 text-slate-500'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
