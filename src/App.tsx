import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './components/ui/Toast';
import { AppLayout } from './components/layout/AppLayout';
import { AuthPage } from './components/auth/AuthPage';
import { DashboardPage } from './components/pages/DashboardPage';
import { OrganizationPage } from './components/pages/OrganizationPage';
import { EmployeesPage } from './components/pages/EmployeesPage';
import { AttendancePage, FaceRegistrationPage } from './components/pages/AttendancePage';
import { ShiftsPage } from './components/pages/ShiftsPage';
import { LeavePage } from './components/pages/LeavePage';
import { PayrollPage } from './components/pages/PayrollPage';
import { ExpensePage } from './components/pages/ExpensePage';
import { ReportsPage } from './components/pages/ReportsPage';
import { KioskPage } from './components/pages/KioskPage';
import { NotificationsPanel, useUnreadCount } from './components/pages/NotificationsPage';
import { UserManagementPage } from './components/pages/UserManagementPage';
import { EmployeeApp } from './components/pages/EmployeeApp';
import { Modal } from './components/ui/Modal';

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Ringkasan workforce' },
  companies: { title: 'Perusahaan', subtitle: 'Manajemen data perusahaan' },
  regions: { title: 'Regional', subtitle: 'Struktur regional' },
  areas: { title: 'Area', subtitle: 'Manajemen area' },
  outlets: { title: 'Outlet', subtitle: 'Direktori outlet & geofencing' },
  employees: { title: 'Karyawan', subtitle: 'Manajemen data karyawan' },
  attendance: { title: 'Absensi', subtitle: 'Check-in/out GPS & rekap kehadiran' },
  shifts: { title: 'Shift', subtitle: 'Template & penugasan shift' },
  leave: { title: 'Ketidakhadiran', subtitle: 'Surat sakit, izin, dan perbantuan' },
  overtime: { title: 'Ketidakhadiran', subtitle: 'Surat sakit, izin, dan perbantuan' },
  payroll: { title: 'Penggajian', subtitle: 'Proses gaji, insentif & slip gaji' },
  expense: { title: 'Klaim Biaya', subtitle: 'Pengajuan dan persetujuan expense' },
  'face-registration': { title: 'Registrasi Wajah', subtitle: 'Setup & verifikasi profil biometrik' },
  reports: { title: 'Laporan & Analitik', subtitle: 'Kehadiran, penggajian, dan insight workforce' },
  'user-management': { title: 'Manajemen Akun', subtitle: 'Role, akses, dan pembuatan akun' },
};

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = useUnreadCount();

  // Native APK build (Capacitor): the app IS the employee app — no admin shell.
  if (Capacitor.isNativePlatform()) {
    return <EmployeeApp />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm font-medium">Memuat KACC HRIS...</p>
        </div>
      </div>
    );
  }

  // Employee mobile app — clock-in without login
  if (currentPage === 'employee-app') {
    return <EmployeeApp onExit={() => setCurrentPage('dashboard')} />;
  }

  if (!user) return <AuthPage onEmployeeMode={() => setCurrentPage('employee-app')} />;

  const pageInfo = PAGE_TITLES[currentPage] ?? { title: currentPage };
  const orgTab = ['companies', 'regions', 'areas', 'outlets'].includes(currentPage) ? currentPage : 'companies';

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':   return <DashboardPage />;
      case 'companies':
      case 'regions':
      case 'areas':
      case 'outlets':     return <OrganizationPage initialTab={orgTab} />;
      case 'employees':   return <EmployeesPage />;
      case 'attendance':  return <AttendancePage />;
      case 'shifts':      return <ShiftsPage />;
      case 'leave':
      case 'overtime':    return <LeavePage />;
      case 'payroll':     return <PayrollPage />;
      case 'expense':     return <ExpensePage />;
      case 'face-registration': return <FaceRegistrationPage />;
      case 'reports':     return <ReportsPage />;
      case 'kiosk':       return <KioskPage />;
      case 'user-management': return <UserManagementPage />;
      default:            return <DashboardPage />;
    }
  };

  return (
    <>
      <AppLayout
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        pageTitle={pageInfo.title}
        pageSubtitle={pageInfo.subtitle}
        onNotificationsClick={() => setNotifOpen(true)}
        unreadCount={unreadCount}
      >
        {renderPage()}
      </AppLayout>

      <Modal isOpen={notifOpen} onClose={() => setNotifOpen(false)} title="" size="md">
        <NotificationsPanel />
      </Modal>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
