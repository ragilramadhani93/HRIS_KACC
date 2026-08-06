import React from 'react';
import { cn } from '../../lib/utils';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function Table<T>({ columns, data, loading, emptyMessage = 'No data found', rowKey, onRowClick }: TableProps<T>) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="space-y-0">
          {/* Header skeleton */}
          <div className="h-12 bg-slate-50 border-b border-slate-100" />
          {/* Row skeletons with shimmer */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 flex items-center gap-4 px-4 border-b border-slate-50 last:border-0"
            >
              {Array.from({ length: columns.length }).map((_, j) => (
                <div
                  key={j}
                  className="h-3 shimmer rounded flex-1"
                  style={{ maxWidth: j === 0 ? '180px' : `${60 + Math.random() * 80}px` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-card">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
            {columns.map((col) => (
              <th
                key={col.key as string}
                className={cn(
                  'px-4 py-3.5 text-left font-semibold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wider',
                  col.sortable && 'cursor-pointer hover:text-slate-900 select-none',
                  col.className
                )}
              >
                <div className="flex items-center gap-1.5">
                  {col.header}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-400">{emptyMessage}</p>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'transition-all duration-150',
                  index % 2 === 1 ? 'bg-slate-50/30' : 'bg-white',
                  'hover:bg-blue-50/40 hover:shadow-inner',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col) => (
                  <td key={col.key as string} className={cn('px-4 py-3.5 text-slate-700', col.className)}>
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key as string] ?? '-')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
