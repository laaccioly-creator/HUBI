# 🗺️ MAPA DE COMPONENTES E TELAS (HUBI FRONTEND)

Guia de referência rápida para localização cirúrgica de arquivos em `src/`, facilitando a navegação de agentes e economizando tokens de contexto.

---

## 1. PDV / Frente de Caixa

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Frente de Caixa Desktop** | `src/components/PosCheckout.tsx` | Tela principal do PDV desktop, leitor de código de barras, atalhos, carrinho e fechamento. |
| **Frente de Caixa Mobile** | `src/components/PosCheckoutMobile.tsx` | Versão mobile tátil para celular com teclado de valores e leitor de câmera. |
| **Terminal de Venda / Balcão** | `src/components/CadastroPdv.tsx` | Operação e atalho de vendas rápidas na interface de retaguarda. |
| **Carrinho e Totais** | `src/contexts/CartContext.tsx` | Estado do carrinho, aplicação de tabelas de atacado/promoção e limpeza. |
| **Modal de Liquidação / Pagamento** | `src/components/PosCheckout.tsx` | Modal com Dinheiro, Cartões, PIX, Fiado e Pagamento Misto no final da venda. |
| **Recebimento de Pedido Pendente** | `src/components/ModalReceberPagamento.tsx` | Modal para registrar pagamento em pedidos em aberto ou parciais. |
| **Seletor de Entrega / Frete** | `src/components/shipping/ShippingFulfillmentSelector.tsx` | Seletor de modalidade (Retirada, Frete Próprio Fixo/Km/Manual, Uber Direct, Melhor Envio). |
| **Seleção de Outro Endereço** | `src/components/shipping/ModalEscolherOutroEndereco.tsx` | Modal de escolha entre os endereços salvos do cliente no PDV. |
| **Edição / Cadastro de Endereço** | `src/components/shipping/ModalAtualizarEnderecoCliente.tsx` | Formulário para cadastrar ou editar endereço durante o fechamento. |
| **Visualizador de Raio no Mapa** | `src/components/shipping/ModalVerNoMapaLoja.tsx` | Mapa interativo com raio de entrega da loja e endereço do cliente. |
| **Cadastro Rápido de Cliente** | `src/components/ModalNovoCliente.tsx` | Modal de cadastro ágil de cliente com busca automática por CEP. |

---

## 2. Recibos e Impressão

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Visualizador de Recibo (Desktop)** | `src/components/PedidosLista.tsx` | Modal desktop de pré-visualização do recibo térmico com botões de impressão. |
| **Visualizador de Recibo (Mobile)** | `src/components/PedidosListaMobile.tsx` | Modal mobile de visualização e compartilhamento do recibo de venda. |
| **Recibo Pós-Venda Imediato** | `src/components/PosCheckout.tsx` | Modal de venda concluída exibindo o cupom térmico e atalhos de impressão. |
| **Recibo no Histórico de Vendas** | `src/components/VendasHistorico.tsx` | Modal de consulta e reimpressão de cupom a partir das vendas finalizadas. |
| **Página Pública do Recibo** | `src/components/ReciboPublico.tsx` | Página web pública do recibo acessível por link ou QR Code do cliente. |
| **Resumo Financeiro do Recibo** | `src/components/shipping/OrderReceiptFinancialSummary.tsx` | Bloco discriminado de subtotal, frete, desconto e valor total do recibo. |
| **Configurador do Recibo** | `src/components/ModalConfigurarRecibo.tsx` | Modal para personalizar dados da loja, logo, cabeçalho e rodapé do cupom. |
| **Driver de Impressão Térmica** | `src/services/printService.ts` | Motor de impressão em bobinas térmicas (58mm/80mm), Bluetooth ESC/POS e HTML. |
| **Gerador de Recibo em PDF** | `src/services/receiptPdfService.ts` | Geração de recibos estruturados em folha A4 e download em PDF. |

---

## 3. Gestão de Pedidos

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Central de Pedidos Desktop** | `src/components/PedidosLista.tsx` | Grid/lista desktop com filtros de status, busca por cliente e abas operacionais. |
| **Central de Pedidos Mobile** | `src/components/PedidosListaMobile.tsx` | Painel de pedidos otimizado para celular com cards táteis e drawer de ações. |
| **Drawer de Detalhes do Pedido** | `src/components/PedidosLista.tsx` | Painel lateral com itens, dados de entrega, histórico e transições de status. |
| **Modal de Itens do Pedido** | `src/components/ModalItensPedido.tsx` | Modal compacto de visualização dos produtos e variações do pedido. |
| **Despacho e Atribuição de Entregador** | `src/components/PedidosLista.tsx` | Modal de envio com seleção de motoboy/entregador e disparo via WhatsApp. |
| **Rastreio em Tempo Real (Cliente)** | `src/components/PedidoAndamentoPublico.tsx` | Página pública para o cliente acompanhar o status de preparo e entrega. |

---

## 4. Configurações e Cadastros

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Configuração de Frete e Entregas** | `src/components/shipping/ShippingSettingsScreen.tsx` | Gestão de Frete Próprio (fixo/km/manual), Uber Direct e Melhor Envio. |
| **Configurações Gerais da Loja** | `src/components/ConfiguracoesLoja.tsx` | Dados cadastrais da empresa, horários, gateways, impressoras e logo. |
| **Listagem e Estoque de Produtos** | `src/components/ProdutosEstoque.tsx` | Catálogo de produtos desktop com saldo de estoque, preços e busca rápida. |
| **Gestão de Produtos Mobile** | `src/components/ProdutosMobile.tsx` | Gestão completa de catálogo, preços e estoque otimizada para smartphones. |
| **Cadastro de Produto e Variações** | `src/components/ProdutoCadastro.tsx` | Formulário de produto com grade de 2 eixos, tabela de preços por volume e fotos. |
| **Gestão de Categorias** | `src/components/ModalGerenciarCategorias.tsx` | Modal para criação, edição e ordenação de categorias da loja. |
| **Entrada Rápida de Estoque** | `src/components/ModalEntradaEstoque.tsx` | Modal para lançamento de notas de entrada ou ajustes manuais de saldo. |
| **Gestão de Clientes e Fiado** | `src/components/ClientesFiado.tsx` | Painel desktop de clientes, limites de crédito, saldo devedor e extratos. |
| **Perfil Financeiro do Cliente (Mobile)**| `src/components/ClientePerfilMobile.tsx` | Ficha do cliente mobile com compras fiado pendentes e histórico. |
| **Histórico de Compras Fiado** | `src/components/ModalHistoricoFiadoCliente.tsx` | Modal com faturas fiado abertas, parciais e quitadas de um cliente. |
| **Amortização e Quitação de Fiado** | `src/components/ModalReceberFiado.tsx` | Modal para liquidar dívidas de clientes com emissão de comprovante. |

---

## 5. Camada Global (Estado e Serviços)

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Contexto do Carrinho** | `src/contexts/CartContext.tsx` | Hook `useCart` com controle de itens, descontos progressivos e totalizadores. |
| **Contexto de Autenticação** | `src/contexts/AuthContext.tsx` | Sessão Supabase, perfil de usuário, permissões e isolamento multitenant (`loja_id`). |
| **Contexto da Data Operacional** | `src/contexts/DataOperacaoContext.tsx` | Gestão da data fiscal/contábil ativa para abertura e fechamento de turnos. |
| **Contexto de Notificações / Toasts** | `src/contexts/FeedbackContext.tsx` | Toasts e diálogos de alerta e confirmação do sistema. |
| **Orquestrador Central de Fretes** | `src/services/shippingOrchestrator.ts` | Motor unificado de cotação comparativa (Frete Local vs Uber vs Melhor Envio). |
| **Motor de Precificação por Volume** | `src/services/pricingEngine.ts` | Aplicação dinâmica de regras de Varejo, Atacado, Autoatacado e Promoção. |
| **Serviço de Fluxo de Caixa** | `src/services/caixaService.ts` | Abertura, suprimentos, sangrias, conferência e fechamento do caixa PDV. |
| **API Uber Direct** | `src/services/uberDirectService.ts` | Conexão com API Uber para solicitação de entregas expressas com entregador. |
| **API Melhor Envio** | `src/services/melhorEnvioService.ts` | Conexão com Melhor Envio para cotações e geração de frete Correios/Jadlog. |
| **Banco Local Offline** | `src/services/offlineDb.ts` | Armazenamento IndexedDB para vendas e produtos em modo offline. |
