import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AppLayout } from './components/layout/AppLayout';

import { PosPage } from './pages/pos/PosPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { ProductCreatePage } from './pages/products/ProductCreatePage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { FinancesPage } from './pages/finances/FinancesPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { ConfigPage } from './pages/config/ConfigPage';
import { KaiAssistantPage } from './pages/smart-assistant/KaiAssistantPage';
import { OnlineCatalogPage } from './pages/catalog/OnlineCatalogPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <Router>
          <Routes>
            {/* Rota Pública do Catálogo Online do Cliente */}
            <Route path="/catalog/:slug" element={<OnlineCatalogPage />} />
            <Route path="/catalog" element={<OnlineCatalogPage />} />

            {/* Rotas Internas do Sistema HUBI */}
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/pos" replace />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/create" element={<ProductCreatePage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="finances" element={<FinancesPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="smart-assistant" element={<KaiAssistantPage />} />
              <Route path="config" element={<ConfigPage />} />
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
