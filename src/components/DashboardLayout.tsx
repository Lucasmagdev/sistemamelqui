import { Outlet } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import AppHeader from '@/components/AppHeader';

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar responsiva: oculta em telas menores */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      <div className="flex flex-1 flex-col md:ml-60 w-full">
        <AppHeader />
        <main className="relative flex-1 p-2 md:p-8 animate-fade-in w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
