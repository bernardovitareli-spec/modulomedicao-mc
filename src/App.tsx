import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import AguardandoAprovacao from "./pages/AguardandoAprovacao";
import Clientes from "./pages/Clientes";
import Equipamentos from "./pages/Equipamentos";
import Contratos from "./pages/Contratos";
import ContratoDetalhe from "./pages/ContratoDetalhe";
import ContratoRegras from "./pages/ContratoRegras";
import Importacao from "./pages/Importacao";
import Medicoes from "./pages/Medicoes";
import NovaMedicao from "./pages/NovaMedicao";
import ImportarMedicao from "./pages/ImportarMedicao";
import MedicaoDetalhe from "./pages/MedicaoDetalhe";
import MemoriaCalculo from "./pages/MemoriaCalculo";
import Boletim from "./pages/Boletim";
import Aprovacao from "./pages/Aprovacao";
import Faturamento from "./pages/Faturamento";
import FaturamentoDetalhe from "./pages/FaturamentoDetalhe";
import EmpresaEmissora from "./pages/EmpresaEmissora";
import GerarNotaLocacao from "./pages/GerarNotaLocacao";
import Relatorios from "./pages/Relatorios";
import RelatorioStatusCompetencia from "./pages/RelatorioStatusCompetencia";
import Historico from "./pages/Historico";
import NotFound from "./pages/NotFound";
import Auditoria from "./pages/Auditoria";
import LimparImportacao from "./pages/LimparImportacao";
import Usuarios from "./pages/Usuarios";
import ContaSeguranca from "./pages/ContaSeguranca";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/aguardando-aprovacao" element={<AguardandoAprovacao />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/equipamentos" element={<Equipamentos />} />
              <Route path="/contratos" element={<Contratos />} />
              <Route path="/contratos/regras" element={<ContratoRegras />} />
              <Route path="/contratos/:id" element={<ContratoDetalhe />} />
              <Route path="/importacao" element={<Importacao />} />
              <Route path="/medicoes" element={<Medicoes />} />
              <Route path="/medicoes/nova" element={<NovaMedicao />} />
              <Route path="/medicoes/importar" element={<ImportarMedicao />} />
              <Route path="/medicoes/:id" element={<MedicaoDetalhe />} />
              <Route path="/memoria-calculo" element={<MemoriaCalculo />} />
              <Route path="/memoria-calculo/:itemId" element={<MemoriaCalculo />} />
              <Route path="/boletim" element={<Boletim />} />
              <Route path="/aprovacao" element={<Aprovacao />} />
              <Route path="/faturamento" element={<Faturamento />} />
              <Route path="/faturamento/:id" element={<FaturamentoDetalhe />} />
              <Route path="/faturamento/:id/nota-locacao" element={<GerarNotaLocacao />} />
              <Route path="/empresa-emissora" element={<EmpresaEmissora />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/relatorios/status-competencia" element={<RelatorioStatusCompetencia />} />
              <Route path="/historico" element={<Historico />} />
              <Route path="/auditoria" element={<Auditoria />} />
              <Route path="/admin/limpar-importacao" element={<LimparImportacao />} />
              <Route path="/admin/usuarios" element={<Usuarios />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
