import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { I18nProvider } from "@/contexts/I18nContext";
import DashboardLayout from "@/components/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import ClientePage from "@/pages/ClientePage";
import NotFound from "@/pages/NotFound";
import CadastroPage from "@/pages/CadastroPage";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const EstoquePage = lazy(() => import("@/pages/EstoquePage"));
const CadastroLotePage = lazy(() => import("@/pages/CadastroLotePage"));
const PedidosPage = lazy(() => import("@/pages/PedidosPage"));
const NovoPedidoPage = lazy(() => import("@/pages/NovoPedidoPage"));
const RelatoriosPage = lazy(() => import("@/pages/RelatoriosPage"));
const ProductsAdminPage = lazy(() => import("@/pages/ProductsAdminPage"));
const ClientesAdminPage = lazy(() => import("@/pages/ClientesAdminPage"));
const VendasPage = lazy(() => import("@/pages/VendasPage"));
const FinanceiroPage = lazy(() => import("@/pages/FinanceiroPage"));
const FuncionariosPage = lazy(() => import("@/pages/FuncionariosPage"));
const AssistentePage = lazy(() => import("@/pages/AssistentePage"));
const ConfiguracoesPage = lazy(() => import("@/pages/ConfiguracoesPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const AdminRoute = () => {
  const { role, loading } = useAuth();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Carregando sessao...</div>;
  }
  return role === "admin" ? <Outlet /> : <Navigate to="/login" replace />;
};

const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
    Carregando pagina...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <AuthProvider>
        <TenantProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<ClientePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/cadastro" element={<CadastroPage />} />

                <Route path="/admin" element={<AdminRoute />}>
                  <Route element={<DashboardLayout />}>
                    <Route index element={<Suspense fallback={<RouteFallback />}><DashboardPage /></Suspense>} />
                    <Route path="estoque" element={<Suspense fallback={<RouteFallback />}><EstoquePage /></Suspense>} />
                    <Route path="lotes/novo" element={<Suspense fallback={<RouteFallback />}><CadastroLotePage /></Suspense>} />
                    <Route path="pedidos" element={<Suspense fallback={<RouteFallback />}><PedidosPage /></Suspense>} />
                    <Route path="pedidos/novo" element={<Suspense fallback={<RouteFallback />}><NovoPedidoPage /></Suspense>} />
                    <Route path="clientes" element={<Suspense fallback={<RouteFallback />}><ClientesAdminPage /></Suspense>} />
                    <Route path="produtos" element={<Suspense fallback={<RouteFallback />}><ProductsAdminPage /></Suspense>} />
                    <Route path="vendas" element={<Suspense fallback={<RouteFallback />}><VendasPage /></Suspense>} />
                    <Route path="financeiro" element={<Suspense fallback={<RouteFallback />}><FinanceiroPage /></Suspense>} />
                    <Route path="funcionarios" element={<Suspense fallback={<RouteFallback />}><FuncionariosPage /></Suspense>} />
                    <Route path="relatorios" element={<Suspense fallback={<RouteFallback />}><RelatoriosPage /></Suspense>} />
                    <Route path="assistente" element={<Suspense fallback={<RouteFallback />}><AssistentePage /></Suspense>} />
                    <Route path="configuracoes" element={<Suspense fallback={<RouteFallback />}><ConfiguracoesPage /></Suspense>} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </TenantProvider>
      </AuthProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
