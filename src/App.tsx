import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { usePermissions } from './hooks/usePermissions';
import { AppLayout } from './components/layout/AppLayout';

import { PosCheckout } from './components/PosCheckout';
import { PedidosLista } from './components/PedidosLista';
import { VendasHistorico } from './components/VendasHistorico';
import { ProdutosEstoque } from './components/ProdutosEstoque';
import { ProdutoCadastro } from './components/ProdutoCadastro';
import { ClientesFiado } from './components/ClientesFiado';
import { FinancasCaixa } from './components/FinancasCaixa';
import { EstatisticasAnalytics } from './components/EstatisticasAnalytics';
import { ConfiguracoesLoja } from './components/ConfiguracoesLoja';
import { AssistenteRubi } from './components/AssistenteRubi';
import { CatalogoPublico } from './components/CatalogoPublico';
import { PedidoAndamentoPublico } from './components/PedidoAndamentoPublico';
import { ConfiguracaoCatalogo } from './components/ConfiguracaoCatalogo';
import { CadastrosAuxiliares } from './components/CadastrosAuxiliares';
import { UsuariosGestao } from './components/UsuariosGestao';

interface RotaProtegidaProps {
  permitido: boolean;
  children: React.ReactElement;
  redirecionarPara?: string;
}

const RotaProtegida: React.FC<RotaProtegidaProps> = ({ permitido, children, redirecionarPara = '/pos' }) => {
  if (!permitido) {
    return <Navigate to={redirecionarPara} replace />;
  }
  return children;
};

const AppRotasInternas: React.FC = () => {
  const permissions = usePermissions();

  return (
    <Routes>
      {/* Rota Pública do Catálogo Online do Cliente */}
      <Route path="/catalog/:slug" element={<CatalogoPublico />} />
      <Route path="/catalog" element={<CatalogoPublico />} />

      {/* Rota Pública de Acompanhamento / Andamento do Pedido (TELA003/TELA003A) */}
      <Route path="/order-tracking/:id" element={<PedidoAndamentoPublico />} />

      {/* Rotas Internas do HUBI */}
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/pos" replace />} />
        <Route path="pos" element={<PosCheckout />} />
        <Route path="orders" element={<PedidosLista />} />
        <Route
          path="sales"
          element={
            <RotaProtegida permitido={permissions.podeAcessarVendas}>
              <VendasHistorico />
            </RotaProtegida>
          }
        />
        
        {/* Produtos & Estoque */}
        <Route path="products" element={<ProdutosEstoque />} />
        <Route
          path="products/create"
          element={
            <RotaProtegida permitido={permissions.podeCadastrarAlterarProdutos} redirecionarPara="/products">
              <ProdutoCadastro />
            </RotaProtegida>
          }
        />
        <Route
          path="products/edit/:id"
          element={
            <RotaProtegida permitido={permissions.podeCadastrarAlterarProdutos} redirecionarPara="/products">
              <ProdutoCadastro />
            </RotaProtegida>
          }
        />

        {/* Cadastros Auxiliares (Apenas Admin/Owner) */}
        <Route
          path="auxiliares"
          element={
            <RotaProtegida permitido={permissions.podeAcessarAuxiliares}>
              <CadastrosAuxiliares />
            </RotaProtegida>
          }
        />

        {/* Clientes */}
        <Route path="customers" element={<ClientesFiado />} />

        {/* Finanças (Gestores / Admin / Owner) */}
        <Route
          path="finances"
          element={
            <RotaProtegida permitido={permissions.podeAcessarFinancas}>
              <FinancasCaixa />
            </RotaProtegida>
          }
        />

        {/* Analytics / Relatórios */}
        <Route
          path="analytics"
          element={
            <RotaProtegida permitido={permissions.podeAcessarAnalytics}>
              <EstatisticasAnalytics />
            </RotaProtegida>
          }
        />

        {/* Gestão de Usuários (Apenas Admin/Owner) */}
        <Route
          path="users"
          element={
            <RotaProtegida permitido={permissions.podeAcessarUsuarios}>
              <UsuariosGestao />
            </RotaProtegida>
          }
        />

        {/* Assistente Rubi IA (Gestores / Admin / Owner) */}
        <Route
          path="smart-assistant"
          element={
            <RotaProtegida permitido={permissions.podeAcessarRubiIA}>
              <AssistenteRubi />
            </RotaProtegida>
          }
        />

        {/* Catálogo Online (Gestão e Personalização) */}
        <Route
          path="catalog-config"
          element={
            <RotaProtegida permitido={permissions.podeAcessarCatalogo}>
              <ConfiguracaoCatalogo />
            </RotaProtegida>
          }
        />
        <Route
          path="catalog-admin"
          element={
            <RotaProtegida permitido={permissions.podeAcessarCatalogo}>
              <ConfiguracaoCatalogo />
            </RotaProtegida>
          }
        />

        {/* Configurações (Apenas Admin/Owner) */}
        <Route
          path="config"
          element={
            <RotaProtegida permitido={permissions.podeAcessarConfig}>
              <ConfiguracoesLoja />
            </RotaProtegida>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/pos" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRotasInternas />
        </Router>
      </CartProvider>
    </AuthProvider>
  );
};
export default App;

