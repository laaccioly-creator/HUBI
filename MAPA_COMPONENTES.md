# 🗺️ MAPA DE COMPONENTES E ARQUITETURA FRONTEND (HUBI)

> **Versão do Documento:** 1.5.0  
> **Data de Atualização:** 12/10/2026  
> **Classificação:** Guia de Referência Rápida de Componentes, Hooks, Serviços e Utilitários  
> **Objetivo:** Localização cirúrgica de arquivos em `src/`, agilizando a navegação de desenvolvedores e agentes de IA com máxima economia de contexto.

---

## 📑 ÍNDICE DE MÓDULOS
1. [PDV e Frente de Caixa (Desktop & Mobile)](#1-pdv-e-frente-de-caixa-desktop--mobile)
2. [Cockpit Executivo F1, Analytics e Metas](#2-cockpit-executivo-f1-analytics-e-metas)
3. [Gestão de Pedidos, Andamento e Recibos](#3-gestão-de-pedidos-andamento-e-recibos)
4. [Logística, Despacho e Rastreamento](#4-logística-despacho-e-rastreamento)
5. [Catálogo Online, Vitrine e Área do Cliente (PWA)](#5-catálogo-online-vitrine-e-área-do-cliente-pwa)
6. [Produtos, Estoque, Variações e Categorias](#6-produtos-estoque-variações-e-categorias)
7. [Clientes, Crediário Fiado e Usuários](#7-clientes-crediário-fiado-e-usuários)
8. [Finanças, Caixa e Turnos Operacionais](#8-finanças-caixa-e-turnos-operacionais)
9. [Assistentes Virtuais Rubi IA e Suporte Inteligente](#9-assistentes-virtuais-rubi-ia-e-suporte-inteligente)
10. [Central de Importação, Exportação e Feeds](#10-central-de-importação-exportação-e-feeds)
11. [Layout, Navegação e Componentes Globais / Modais](#11-layout-navegação-e-componentes-globais--modais)
12. [Camada de Estado (Contexts) e Hooks Customizados](#12-camada-de-estado-contexts-e-hooks-customizados)
13. [Camada de Serviços de Negócio e Infraestrutura (`src/services/`)](#13-camada-de-serviços-de-negócio-e-infraestrutura-srcservices)
14. [Utilitários e Formatadores (`src/utils/`)](#14-utilitários-e-formatadores-srcutils)

---

## 1. PDV e Frente de Caixa (Desktop & Mobile)

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Frente de Caixa Desktop** | `src/components/PosCheckout.tsx` | Tela mestre do PDV desktop, leitor ótico/laser, atalhos de teclado (F2-F10), split de pagamento e recibo pós-venda. |
| **Frente de Caixa Mobile** | `src/components/PosCheckoutMobile.tsx` | Versão tátil para celulares e tablets com teclado numérico ágil, leitor de câmera e finalização rápida. |
| **Terminal de Venda / Balcão** | `src/components/CadastroPdv.tsx` | Atalho para venda rápida integrada na visão de retaguarda. |
| **Carrinho de Venda Isolado** | `src/components/vendas/CarrinhoVenda.tsx` | Componente reutilizável de carrinho de compras e cálculo de subtotais. |
| **Modal de Liquidação / Pagamento** | `src/components/ModalPagamentoFechamento.tsx` | Modal com split de pagamentos (Dinheiro, Cartões, PIX, Fiado) e conferência de troco. |
| **Leitor de Código de Barras (Câmera)**| `src/components/ModalLeitorCodigoBarras.tsx` | Leitor ótico por câmera de dispositivo móvel para escaneamento instantâneo de EAN/GTIN. |
| **Recebimento de Pedido Pendente** | `src/components/ModalReceberPagamento.tsx` | Modal para quitação financeira de pedidos pendentes ou com saldo restante. |

---

## 2. Cockpit Executivo F1, Analytics e Metas

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Velocímetro Analógico F1 (Gauge)** | `src/components/dashboard/CockpitGaugeF1.tsx` | Gauge SVG com ponteiro dinâmico, arcos coloridos, zonas de tolerância e comparação meta vs. realizado. |
| **Drawer Analítico de Métrica F1** | `src/components/dashboard/CockpitMetricDrawer.tsx` | Drawer lateral com decomposição profunda da métrica (canais, formas de pagamento, horários de pico, DRE real e insights Jev). |
| **Configuração de Metas da Loja** | `src/components/configuracoes/ConfiguracoesMetas.tsx` | Painel para parametrização de metas (faturamento, pedidos, ticket médio, lucro, inadimplência e giro). |
| **Estatísticas e Analytics Clássico** | `src/components/EstatisticasAnalytics.tsx` | Painel de relatórios gráficos de faturamento, curvas de vendas e giro de estoque. |

---

## 3. Gestão de Pedidos, Andamento e Recibos

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Central de Pedidos Desktop** | `src/components/PedidosLista.tsx` | Kanban e listagem com filtros de status, busca por cliente, edição de pedidos e drawer de detalhes. |
| **Central de Pedidos Mobile** | `src/components/PedidosListaMobile.tsx` | Painel de pedidos com cards táteis, abas de status e drawer de ações otimizado para celular. |
| **Modal de Itens do Pedido** | `src/components/ModalItensPedido.tsx` | Visualizador rápido dos produtos, variações, quantidades e preços do pedido. |
| **Modal de Alteração de Status** | `src/components/ModalAlterarStatusPedido.tsx` | Modal para avançar ou regredir status do pedido com justificativa e persistência de histórico auditado. |
| **Definição de Envio em Pedido** | `src/components/pedidos/ModalDefinirEnvio.tsx` | Seleção de transportadora e modalidade de entrega para pedidos pendentes. |
| **Modal de Recibo do Pedido** | `src/components/pedidos/ReciboPedidoModal.tsx` | Visualização do cupom térmico (58/80mm), envio via WhatsApp e atalhos de impressão direta. |
| **Visualizador de Recibo Genérico** | `src/components/ModalReciboPedido.tsx` | Componente de pré-visualização e impressão de cupom fiscal/não-fiscal. |
| **Página Pública do Recibo** | `src/components/ReciboPublico.tsx` | Página web pública (`/recibo/:id`) acessível via QR Code ou link compartilhado com o cliente. |
| **Acompanhamento Público do Pedido** | `src/components/PedidoAndamentoPublico.tsx` | Tela pública de tracking (`/order-tracking/:id`) com progresso em tempo real do preparo e entrega. |
| **Resumo Financeiro do Recibo** | `src/components/shipping/OrderReceiptFinancialSummary.tsx` | Bloco discriminado de subtotal, frete, desconto e valor final do pedido. |
| **Histórico de Vendas Concluídas** | `src/components/VendasHistorico.tsx` | Grid desktop de vendas finalizadas com filtros por data operacional e reimpressão de cupons. |
| **Histórico de Vendas Mobile** | `src/components/VendasHistoricoMobile.tsx` | Histórico tátil para consulta e estorno de vendas no smartphone. |

---

## 4. Logística, Despacho e Rastreamento

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Configuração de Frete e Entregas** | `src/components/shipping/ShippingSettingsScreen.tsx` | Hub de logística: Frete Próprio (fixo/km/manual), Uber Direct, Melhor Envio, Apps de Corrida e Transportadoras. |
| **Seletor de Entrega / Frete** | `src/components/shipping/ShippingFulfillmentSelector.tsx` | Seletor com abas de Retirada na Loja, Frete Grátis e cotação de transportadoras. |
| **Modal de Despacho Multimodal** | `src/components/shipping/ModalDespacharPedido.tsx` | Despacho manual em 4 modalidades: Correios (PAC/SEDEX), App de Corrida, Transportadora Privada e Motoboy Próprio. |
| **Modal de Impressão de Etiqueta** | `src/components/shipping/ModalImprimirEtiqueta.tsx` | Pré-visualização e impressão de etiqueta térmica dos Correios/Melhor Envio com código de barras Code128. |
| **Modal de Rastreio do Pedido** | `src/components/shipping/ModalRastreioPedido.tsx` | Stepper progressivo e linha do tempo de eventos SRO dos Correios ou Melhor Rastreio. |
| **Seleção de Outro Endereço** | `src/components/shipping/ModalEscolherOutroEndereco.tsx` | Modal de escolha entre múltiplos endereços cadastrados do cliente. |
| **Atualização de Endereço do Cliente** | `src/components/shipping/ModalAtualizarEnderecoCliente.tsx` | Cadastro e edição de endereços com geocodificação e validação contra duplicidade. |
| **Visualizador de Raio no Mapa** | `src/components/shipping/ModalVerNoMapaLoja.tsx` | Mapa interativo com raio de entrega da loja física e endereço do cliente. |
| **Tutorial de Integração Uber Direct** | `src/components/shipping/ModalTutorialUberDirect.tsx` | Guia passo a passo para configuração de credenciais BYOK da Uber Direct. |
| **Tutorial de Integração Melhor Envio** | `src/components/shipping/ModalTutorialMelhorEnvio.tsx` | Guia passo a passo para integração de token e geração de etiquetas do Melhor Envio. |

---

## 5. Catálogo Online, Vitrine e Área do Cliente (PWA)

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Vitrine Pública do Catálogo** | `src/components/CatalogoPublico.tsx` | E-commerce PWA (`/catalog/:slug`) com carrossel de destaques, busca, categorias e carrinho com termômetro de frete grátis. |
| **Área do Cliente: Login & Onboarding** | `src/components/ModalOnboardingCliente.tsx` | Modal de identificação, cadastro e autenticação por WhatsApp e senha com Web Crypto SHA-256. |
| **Área do Cliente: Histórico de Pedidos** | `src/components/ModalPedidosCliente.tsx` | Visualização dos pedidos anteriores do cliente, status em tempo real e reordenação com 1 clique. |
| **Área do Cliente: Favoritos** | `src/components/ModalFavoritosCliente.tsx` | Gerenciamento de produtos favoritados persistidos na tabela `cliente_favoritos`. |
| **Área do Cliente: Notificações** | `src/components/ModalNotificacoesCliente.tsx` | Central de avisos, promoções e atualizações de entrega da loja para o cliente. |
| **Área do Cliente: Meus Endereços** | `src/components/ModalEnderecoClienteCatalogo.tsx` | Gerenciamento de múltiplos endereços de entrega pelo próprio cliente final. |
| **Busca Inteligente no Catálogo** | `src/components/ModalBuscaClienteCatalogo.tsx` | Modal de busca instantânea com filtros e sugestões semânticas. |
| **Detalhes do Produto no Catálogo** | `src/components/ModalDetalhesProdutoCatalogo.tsx` | Modal completo com galeria de fotos, grade de variações, preços por volume e botão de sacola. |
| **Dúvidas de Produto com IA** | `src/components/ModalDuvidaProdutoIA.tsx` | Esclarecimento de dúvidas técnicas sobre o item usando IA sem alucinação. |
| **Assistente Rubi no Catálogo** | `src/components/ChatRubiCatalogo.tsx` | Chat flutuante de atendimento e recomendação de produtos com tecnologia Jev / System One. |
| **Contato e Informações da Loja** | `src/components/ModalContatoClienteCatalogo.tsx` | Dados de contato, WhatsApp de suporte, mapa e horários de funcionamento da loja. |
| **Configuração do Catálogo (Desktop)** | `src/components/ConfiguracaoCatalogo.tsx` | Gestão de identidade visual, cores, banners promocionais e links da vitrine. |
| **Configuração do Catálogo (Mobile)** | `src/components/ConfiguracaoCatalogoMobile.tsx` | Versão mobile para ajustes rápidos da vitrine virtual na palma da mão. |

---

## 6. Produtos, Estoque, Variações e Categorias

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Estoque de Produtos Desktop** | `src/components/ProdutosEstoque.tsx` | Catálogo geral desktop com filtros por categoria, saldo de estoque, custo, margens e ações em lote. |
| **Gestão de Produtos Mobile** | `src/components/ProdutosMobile.tsx` | Gestão completa e fluida de produtos no celular com cards responsivos e edição rápida. |
| **Cadastro e Edição de Produto** | `src/components/ProdutoCadastro.tsx` | Formulário completo com grade de até 2 eixos de variação, preços progressivos (Atacado/Autoatacado) e fotos. |
| **Detalhes Rápidos do Produto** | `src/components/ModalDetalhesProduto.tsx` | Ficha técnica com estoque de cada variação, SKU e código de barras. |
| **Entrada Rápida de Estoque** | `src/components/ModalEntradaEstoque.tsx` | Lançamento ágil de compras e ajustes com atualização do custo médio e auditoria de movimentação. |
| **Gestão de Categorias** | `src/components/ModalGerenciarCategorias.tsx` | Modal para criação, edição e ordenação de categorias da loja. |
| **Renderizador de Descrição** | `src/components/DescricaoFormatadaProduto.tsx` | Exibição de textos com formatação enriquecida, quebras de linha e destaques em negrito. |

---

## 7. Clientes, Crediário Fiado e Usuários

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Gestão de Clientes e Fiado Desktop** | `src/components/ClientesFiado.tsx` | Painel geral de clientes, limite de crédito, saldo devedor fiado, bloqueio e extrato. |
| **Perfil Financeiro do Cliente Mobile** | `src/components/ClientePerfilMobile.tsx` | Visão mobile do cliente com compras a prazo pendentes e histórico de pagamentos. |
| **Cadastro Rápido de Novo Cliente** | `src/components/ModalNovoCliente.tsx` | Cadastro ágil de cliente com busca de CEP via ViaCEP e limite de crédito inicial. |
| **Histórico de Compras Fiado** | `src/components/ModalHistoricoFiadoCliente.tsx` | Modal detalhado de pedidos comprados no fiado com status aberto, parcial e quitado. |
| **Amortização e Quitação de Fiado** | `src/components/ModalReceberFiado.tsx` | Baixa de débitos de fiado com split de pagamento e envio de comprovante via WhatsApp. |
| **Gestão de Usuários e Permissões** | `src/components/UsuariosGestao.tsx` | Controle de operadores da loja com controle RBAC (Admin, Gerente, Vendedor) e restrições de tela. |
| **Drawer de Usuário e Loja** | `src/components/ModalUsuarioDrawer.tsx` | Drawer lateral para perfil do operador, seleção da tela inicial padrão e alternância de filial. |

---

## 8. Finanças, Caixa e Turnos Operacionais

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Controle de Caixa e Finanças Desktop**| `src/components/FinancasCaixa.tsx` | Abertura/fechamento de caixa, sangrias, suprimentos, conferência cega e contas a pagar/receber. |
| **Controle Financeiro Mobile** | `src/components/FinancasMobile.tsx` | Versão mobile para lançamentos de despesas e conferência do turno do PDV. |
| **Banner de Data Operacional** | `src/components/BannerDataOperacao.tsx` | Alerta visual permanente indicando operação em data simulada ou retroativa. |
| **Seletor de Data Operacional** | `src/components/ModalSeletorDataOperacao.tsx` | Modal para troca controlada da data contábil ativa para auditoria ou lançamentos passados. |

---

## 9. Assistentes Virtuais Rubi IA e Suporte Inteligente

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Assistente Executiva Rubi IA** | `src/components/AssistenteRubi.tsx` | Chat principal conectado às métricas da loja, estoque estagnado, previsões e insights de vendas. |
| **Chat de Ajuda e Tutoriais IA** | `src/components/ChatAjudaIA.tsx` | Assistente contextual para tirar dúvidas operacionais sobre o sistema com passo a passo. |
| **Busca de Fotos com SerpApi** | `src/components/ModalPesquisaFotosInternet.tsx` | Busca automática de fotos em alta resolução no Google Imagens por EAN ou descrição. |
| **Onboarding da Chave SerpApi** | `src/components/ModalOnboardingSerpApi.tsx` | Modal explicativo para o lojista cadastrar sua chave BYOK da SerpApi. |
| **Alerta de Quota SerpApi** | `src/components/ModalQuotaExcedidaSerpApi.tsx` | Aviso amigável quando o limite gratuito mensal de consultas da SerpApi é atingido. |
| **Feedback Visual de IA** | `src/components/SpinnerPesquisandoIA.tsx` | Animação elegante de processamento para operações assistidas por inteligência artificial. |

---

## 10. Central de Importação, Exportação e Feeds

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Central de Importação/Exportação** | `src/components/CentralImportarExportar.tsx` | Hub consolidado para intercâmbio de dados em planilhas Excel (XLSX). |
| **Importar/Exportar Produtos** | `src/components/ImportarExportarProdutos.tsx` | Carga e download de produtos, grades de variação, preços e fotos. |
| **Importar Clientes** | `src/components/ImportarClientes.tsx` | Importação em lote de clientes com telefones, endereços e saldos de fiado. |
| **Exportar Clientes** | `src/components/ExportarClientes.tsx` | Exportação da base de clientes para planilhas gerenciais. |
| **Importar Pedidos** | `src/components/ImportarPedidos.tsx` | Migração e importação de histórico de pedidos legados. |
| **Exportar Pedidos** | `src/components/ExportarPedidos.tsx` | Relatório consolidado de pedidos e itens vendidos por período. |

---

## 11. Layout, Navegação e Componentes Globais / Modais

| Nome Visual / Elemento | Caminho do Arquivo | Resumo da Responsabilidade |
| :--- | :--- | :--- |
| **Layout Mestre da Aplicação** | `src/components/layout/AppLayout.tsx` | Barra de navegação superior, badges de conexão, troca de tema e atalhos rápidos. |
| **Menu Lateral Mobile** | `src/components/layout/MobileMenuDrawer.tsx` | Drawer de navegação responsivo para dispositivos móveis com suporte a gestos e histórico. |
| **Configurações Gerais da Loja** | `src/components/ConfiguracoesLoja.tsx` | Cadastro da empresa, CNPJ, dados de contato, impressoras térmicas e preferências. |
| **Gestão de Cupons Promocionais** | `src/components/CuponsGestao.tsx` | Criação e controle de validade de cupons de desconto fixo ou percentual. |
| **Cadastros Auxiliares** | `src/components/CadastrosAuxiliares.tsx` | Cadastro de fornecedores, categorias e dados auxiliares do ERP. |
| **Configuração de Recibo** | `src/components/ModalConfigurarRecibo.tsx` | Personalização do cabeçalho, rodapé e logotipo dos cupons impressos. |
| **Confirmação de Exclusão** | `src/components/ModalConfirmacaoExclusao.tsx` | Modal com trava de segurança para deleções irreversíveis de registros. |
| **Diálogo de Alerta / Feedback** | `src/components/ModalAlertaFeedback.tsx` | Modal acessível de feedback para mensagens de sucesso, alerta ou erro operacional. |
| **Prompt de Atualização PWA** | `src/components/pwa/ReloadPrompt.tsx` | Toast discreto de notificação para recarregar quando uma nova versão do app estiver pronta. |
| **Prompt de Instalação Desktop** | `src/components/DesktopAppPrompt.tsx` | Convite contextual para instalação do HUBI como aplicativo nativo no computador. |

---

## 12. Camada de Estado (Contexts) e Hooks Customizados

### Contextos Globais (`src/contexts/`)
| Contexto | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| **CartContext** | `src/contexts/CartContext.tsx` | Carrinho do PDV, tabelas de atacado/autoatacado, frete, rascunho em `localStorage` e recálculos. |
| **AuthContext** | `src/contexts/AuthContext.tsx` | Sessão do usuário Supabase Auth, perfil ativo, permissões RBAC e isolamento multi-tenant (`loja_id`). |
| **DataOperacaoContext** | `src/contexts/DataOperacaoContext.tsx` | Gestão da data contábil/fiscal ativa para fechamento de turnos e auditorias retroativas. |
| **FeedbackContext** | `src/contexts/FeedbackContext.tsx` | Sistema global de alertas, toasts e diálogos de confirmação padronizados em `pt-BR`. |
| **ThemeContext** | `src/contexts/ThemeContext.tsx` | Alternância de temas visuais (Dark Slate e Light Mode Mobile). |

### Hooks Customizados (`src/hooks/`)
| Hook | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| **useRegisterOverlay** | `src/hooks/useRegisterOverlay.ts` | Registra modais e drawers na pilha global, conectando-os à tecla ESC e ao botão voltar do celular. |
| **usePedidosRealtime** | `src/hooks/usePedidosRealtime.ts` | Assinatura WebSocket do Supabase Realtime para atualização instantânea da central de pedidos. |
| **useProdutos** | `src/hooks/useProdutos.ts` | Hook reativo para listagem, filtros rápidos e cache em memória do catálogo de produtos. |
| **usePermissions** | `src/hooks/usePermissions.ts` | Validação declarativa de permissões RBAC do operador autenticado. |
| **useNetworkStatus** | `src/hooks/useNetworkStatus.ts` | Monitoramento contínuo do status online/offline da conexão com a internet. |

---

## 13. Camada de Serviços de Negócio e Infraestrutura (`src/services/`)

### Orquestradores, Logística e Hardware
| Serviço | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| **shippingOrchestrator** | `src/services/shippingOrchestrator.ts` | Motor unificado de frete: comparação Frete Próprio vs. Uber vs. Melhor Envio, múltiplos endereços e subsídios. |
| **uberDirectService** | `src/services/uberDirectService.ts` | Conexão com API Uber Direct v1 para cotação e despacho de corridas ponto a ponto. |
| **melhorEnvioService** | `src/services/melhorEnvioService.ts` | Conexão com Melhor Envio para fretes com Correios/Jadlog e emissão de etiquetas. |
| **printService** | `src/services/printService.ts` | Motor térmico ESC/POS via Web Bluetooth API (58/80mm), fallback HTML e recibo digital WhatsApp. |
| **receiptPdfService** | `src/services/receiptPdfService.ts` | Geração vetorial de comprovantes e orçamentos em folhas A4 em PDF via `jspdf`. |
| **audioService** | `src/services/audioService.ts` | Feedback sonoro sintetizado nativamente pela Web Audio API para scanners e finalização de vendas. |
| **overlayStackService** | `src/services/overlayStackService.ts` | Gerenciamento de pilha de overlays, interceptação do evento `popstate` e tecla ESC sem conflitos. |

### Finanças, Vendas, Estoque e Operações
| Serviço | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| **dashboardService** | `src/services/dashboardService.ts` | Motor do Cockpit F1: cálculo de faturamento, pedidos, ticket médio, DRE real, CMV, inadimplência e metas. |
| **caixaService** | `src/services/caixaService.ts` | Abertura de turno, suprimentos, sangrias, conferência cega e apuração de quebra/sobra. |
| **pricingEngine** | `src/services/pricingEngine.ts` | Aplicação automática de regras de Atacado (6+ un), Autoatacado (24+ un) e Promoções ativas. |
| **estoquePedidoService**| `src/services/estoquePedidoService.ts`| Baixa e estorno estritamente idempotentes de estoque de pedidos com log em `movimentacoes_estoque`. |
| **vendaService** | `src/services/vendaService.ts` | Transações de finalização de vendas do PDV e split de meios de pagamento. |
| **cupomService** | `src/services/cupomService.ts` | Validação de regras e aplicação de cupons de desconto no PDV e catálogo. |
| **clienteCatalogoService**| `src/services/clienteCatalogoService.ts`| Autenticação com Web Crypto SHA-256, sincronização de carrinho, favoritos e notificações do cliente. |
| **syncService** | `src/services/syncService.ts` | Sincronização em segundo plano entre o banco local IndexedDB e o Supabase. |
| **offlineDb** | `src/services/offlineDb.ts` | Armazenamento local persistente em IndexedDB para operação em contingência offline. |
| **paymentGatewayService**| `src/services/paymentGatewayService.ts`| Emissão de cobranças e QR Code PIX dinâmico (Mercado Pago / Asaas). |
| **usuarioService** | `src/services/usuarioService.ts` | CRUD e controle de operadores da loja com preferências de tela inicial. |
| **serpApiService** | `src/services/serpApiService.ts` | Integração com Edge Function para busca de imagens de produtos no Google Imagens. |

### Inteligência Artificial e Família TypeSafe AI / Jev
| Serviço | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| **typesafeService** | `src/services/typesafeService.ts` | Cliente das primitivas System One (Choice, Noul, Score) via Edge Function blindada. |
| **rubiRouterService** | `src/services/rubiRouterService.ts` | Roteador híbrido de IA: classifica intenções com Jev (< 250ms) e roteia para tutoriais locais ou Gemini. |
| **dashboardJevService** | `src/services/dashboardJevService.ts` | Análise preditiva e diagnósticos operacionais executivos para o Cockpit F1. |
| **catalogJevService** | `src/services/catalogJevService.ts` | Busca semântica e recomendação inteligente de produtos na vitrine virtual. |
| **rubiCatalogoJevService**| `src/services/rubiCatalogoJevService.ts`| Assistente de atendimento ao cliente final no catálogo para auxílio na sacola de compras. |
| **rubiCatalogoService** | `src/services/rubiCatalogoService.ts` | Serviço de orquestração do chat flutuante do catálogo com histórico de mensagens. |
| **rubiChatService** | `src/services/rubiChatService.ts` | Orquestração do chat administrativo da Rubi IA com histórico e contexto da loja. |
| **tutoriaisHubiService** | `src/services/tutoriaisHubiService.ts` | Base de conhecimento e guias passo a passo de todas as funcionalidades do HUBI. |
| **geminiService** | `src/services/geminiService.ts` | Motor gerativo complementar para redação criativa e respostas abertas assistidas. |
| **addressParserJevService**| `src/services/addressParserJevService.ts`| Extração e estruturação inteligente de endereços informados em texto livre ou WhatsApp. |
| **cashAuditJevService** | `src/services/cashAuditJevService.ts` | Auditoria inteligente de fechamento de turnos e detecção de padrões de quebra/sobra. |
| **creditRiskJevService**| `src/services/creditRiskJevService.ts`| Avaliação probabilística de risco de crédito para concessão de fiado a clientes. |
| **orderGuardJevService** | `src/services/orderGuardJevService.ts` | Guardião contra anomalias em pedidos, fraudes de frete e inconsistências de valores. |

### Importação, Exportação e Feeds
| Serviço | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| **productImportExportService**| `src/services/productImportExportService.ts`| Parsing e geração de planilhas Excel (XLSX) de produtos e variações. |
| **clientImportExportService** | `src/services/clientImportExportService.ts` | Parsing e geração de planilhas de clientes e saldos de crediário. |
| **orderImportExportService** | `src/services/orderImportExportService.ts` | Exportação de histórico de vendas e importação de pedidos legados. |
| **financeExportService** | `src/services/financeExportService.ts` | Exportação de lançamentos financeiros, despesas e fluxo de caixa em XLSX. |
| **feedExportService** | `src/services/feedExportService.ts` | Geração de catálogo XML/CSV para integração com Google Shopping e Meta Catalog. |

---

## 14. Utilitários e Formatadores (`src/utils/`)

| Utilitário | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| **correiosValidator.ts** | `src/utils/correiosValidator.ts` | Validador sintático de SRO dos Correios com algoritmo de módulo 11 e mapeamento PAC/SEDEX. |
| **dataOperacao.ts** | `src/utils/dataOperacao.ts` | Helpers de cálculo temporal considerando a data contábil simulada vs. data do relógio. |
| **formatters.ts** | `src/utils/formatters.ts` | Formatadores puros: `formatarMoeda`, `formatarDocumento` (CPF/CNPJ), `formatarTelefone`, etc. |
| **geoUtils.ts** | `src/utils/geoUtils.ts` | Cálculos de distância euclidiana/Haversine e geocodificação de endereços. |
| **historicoPedidoUtils.ts**| `src/utils/historicoPedidoUtils.ts` | Formatação e categorização visual de logs da tabela `historico_pedidos`. |
| **shippingDisplay.ts** | `src/utils/shippingDisplay.ts` | Helpers visuais para badges de frete grátis, etiquetas de prazos e nomes de transportadoras. |
| **statusPedidoUtils.ts** | `src/utils/statusPedidoUtils.ts` | Rótulos em `pt-BR`, cores e fluxos de transição dos estados de pedidos. |
| **imageCompressor.ts** | `src/utils/imageCompressor.ts` | Compressor de fotos no cliente via `createObjectURL` e Canvas para prevenir Out-of-Memory (OOM) no mobile. |
