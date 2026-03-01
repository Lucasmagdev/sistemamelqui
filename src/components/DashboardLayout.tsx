import { Outlet } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import AppHeader from '@/components/AppHeader';

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar responsiva: oculta em telas menores */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col md:ml-60">
        <AppHeader />
        <main className="relative min-w-0 flex-1 overflow-x-hidden p-2 md:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
