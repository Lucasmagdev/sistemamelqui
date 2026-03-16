import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import AppSidebar from '@/components/AppSidebar';
import AppHeader from '@/components/AppHeader';
import AdminBottomDock from '@/components/AdminBottomDock';
import { backendRequest } from '@/lib/backendClient';

export default function DashboardLayout() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    void queryClient.prefetchQuery({
      queryKey: ['admin', 'operational-report', { start: monthAgo, end: today }],
      queryFn: () => backendRequest(`/api/reports/operational?start=${monthAgo}&end=${today}`),
      staleTime: 60_000,
    });

    void queryClient.prefetchQuery({
      queryKey: ['admin', 'finance-overview', { start: monthAgo, end: today }],
      queryFn: () => backendRequest(`/api/finance/overview?start=${monthAgo}&end=${today}`),
      staleTime: 60_000,
    });
  }, [queryClient]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar responsiva: oculta em telas menores */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col md:ml-60">
        <AppHeader />
        <main className="relative min-w-0 flex-1 overflow-x-hidden p-2 pb-24 md:p-8 md:pb-28 animate-fade-in">
          <Outlet />
        </main>
        <AdminBottomDock />
      </div>
    </div>
  );
}
