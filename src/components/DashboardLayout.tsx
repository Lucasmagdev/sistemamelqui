import { Outlet } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import AppHeader from '@/components/AppHeader';

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col ml-60">
        <AppHeader />
        <main className="relative flex-1 p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
