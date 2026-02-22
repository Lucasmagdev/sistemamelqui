import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EstoquePage from "@/pages/EstoquePage";
import CadastroLotePage from "@/pages/CadastroLotePage";
import PedidosPage from "@/pages/PedidosPage";
import NovoPedidoPage from "@/pages/NovoPedidoPage";
import RelatoriosPage from "@/pages/RelatoriosPage";
import ProductsAdminPage from "@/pages/ProductsAdminPage";
import ClientePage from "@/pages/ClientePage";
import NotFound from "@/pages/NotFound";
import ClientesAdminPage from "@/pages/ClientesAdminPage";
import CadastroPage from "@/pages/CadastroPage";

const queryClient = new QueryClient();

const AdminRoute = () => {
  const { role } = useAuth();
  return role === "admin" ? <Outlet /> : <Navigate to="/login" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
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
                  <Route index element={<DashboardPage />} />
                  <Route path="estoque" element={<EstoquePage />} />
                  <Route path="lotes/novo" element={<CadastroLotePage />} />
                  <Route path="pedidos" element={<PedidosPage />} />
                  <Route path="pedidos/novo" element={<NovoPedidoPage />} />
                  <Route path="clientes" element={<ClientesAdminPage />} />
                  <Route path="produtos" element={<ProductsAdminPage />} />
                  <Route path="relatorios" element={<RelatoriosPage />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
