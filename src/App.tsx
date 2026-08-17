import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { LayoutNavegacao } from './components/LayoutNavegacao';

import { PosCheckout } from './components/PosCheckout';
import { PedidosLista } from './components/PedidosLista';
import { ProdutosEstoque } from './components/ProdutosEstoque';
import { ProdutoCadastro } from './components/ProdutoCadastro';
import { ClientesFiado } from './components/ClientesFiado';
import { FinancasCaixa } from './components/FinancasCaixa';
import { EstatisticasAnalytics } from './components/EstatisticasAnalytics';
import { ConfiguracoesLoja } from './components/ConfiguracoesLoja';
import { AssistenteKai } from './components/AssistenteKai';
import { CatalogoPublico } from './components/CatalogoPublico';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Rota Pública do Catálogo Online do Cliente */}
            <Route path="/catalog/:slug" element={<CatalogoPublico />} />
            <Route path="/catalog" element={<CatalogoPublico />} />

            {/* Rotas Internas do HUBI */}
            <Route path="/" element={<LayoutNavegacao />}>
              <Route index element={<Navigate to="/pos" replace />} />
              <Route path="pos" element={<PosCheckout />} />
              <Route path="orders" element={<PedidosLista />} />
              <Route path="products" element={<ProdutosEstoque />} />
              <Route path="products/create" element={<ProdutoCadastro />} />
              <Route path="customers" element={<ClientesFiado />} />
              <Route path="finances" element={<FinancasCaixa />} />
              <Route path="analytics" element={<EstatisticasAnalytics />} />
              <Route path="smart-assistant" element={<AssistenteKai />} />
              <Route path="config" element={<ConfiguracoesLoja />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/pos" replace />} />
          </Routes>
        </Router>
      </CartProvider>
    </AuthProvider>
  );
};
export default App;
