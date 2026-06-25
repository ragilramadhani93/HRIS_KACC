import { type ClassValue, clsx } from 'clsx';
import { supabase } from './supabase';
import type { NotificationType } from './database.types';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return '-';
  if (time.includes('T')) {
    return new Date(time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  return time.substring(0, 5);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}

export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function generateEmployeeCode(prefix = 'EMP'): string {
  const num = Math.floor(Math.random() * 90000) + 10000;
  return `${prefix}${num}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthName(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/** Creates a notification for a user. Fire-and-forget — do not await in critical paths. */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  referenceId?: string,
  referenceTable?: string,
) {
  await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    reference_id: referenceId ?? null,
    reference_table: referenceTable ?? null,
  });
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  hr_admin: 'HR Admin',
  regional_manager: 'Regional Manager',
  area_manager: 'Area Manager',
  supervisor: 'Supervisor',
  auditor: 'Auditor',
  employee: 'Employee',
};

export const OUTLET_TYPE_LABELS: Record<string, string> = {
  coffee_shop: 'Coffee Shop',
  coffee_corner: 'Coffee Corner',
  mobile_coffee: 'Mobile Coffee',
  warehouse: 'Warehouse',
  office: 'Office',
  event_booth: 'Event Booth',
  distributor: 'Distributor',
};

export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export const STATUS_COLORS: Record<string, string> = {
  // Employee
  active: 'bg-emerald-100 text-emerald-700',
  probation: 'bg-amber-100 text-amber-700',
  contract: 'bg-blue-100 text-blue-700',
  resigned: 'bg-slate-100 text-slate-600',
  terminated: 'bg-red-100 text-red-700',
  // Attendance
  present: 'bg-emerald-100 text-emerald-700',
  late: 'bg-amber-100 text-amber-700',
  early_leave: 'bg-orange-100 text-orange-700',
  absent: 'bg-red-100 text-red-700',
  holiday: 'bg-blue-100 text-blue-700',
  overtime: 'bg-indigo-100 text-indigo-700',
  // Leave / overtime
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  approved_supervisor: 'bg-blue-100 text-blue-700',
  approved_manager: 'bg-teal-100 text-teal-700',
  approved_hr: 'bg-cyan-100 text-cyan-700',
  approved_finance: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
  // Geofence
  inside: 'bg-emerald-100 text-emerald-700',
  outside: 'bg-red-100 text-red-700',
  unknown: 'bg-slate-100 text-slate-600',
  // Face
  verified: 'bg-emerald-100 text-emerald-700',
  // Payroll
  draft: 'bg-slate-100 text-slate-600',
  review: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  // Expense
  submitted: 'bg-blue-100 text-blue-700',
  // Absence types
  sakit_dengan_surat: 'bg-blue-100 text-blue-700',
  sakit_tanpa_surat: 'bg-orange-100 text-orange-700',
  izin: 'bg-purple-100 text-purple-700',
  perbantuan: 'bg-teal-100 text-teal-700',
};

export const ABSENCE_TYPE_LABELS: Record<string, string> = {
  sakit_dengan_surat: 'Sakit (Dengan Surat Dokter)',
  sakit_tanpa_surat: 'Sakit (Tanpa Surat Dokter)',
  izin: 'Izin Tidak Masuk',
  perbantuan: 'Perbantuan ke Outlet Lain',
};

export const INCENTIVE_TYPE_LABELS: Record<string, string> = {
  sales: 'Insentif Penjualan',
  achievement: 'Insentif Prestasi',
  attendance: 'Insentif Kehadiran',
};
