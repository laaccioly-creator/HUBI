# Plano de Testes Operacional - ERP Hubi (7 Dias)
**Período:** 10/10/2026 a 17/10/2026  
**Domingo (11/10/2026):** Loja física fechada (sem abertura de caixa)

---

## 1. Mapeamento de Papéis e Dispositivos

### Equipe Interna (Operação da Loja)
* **Desktop (Computador / Retaguarda / PDV Balcão):**
  * `LUIZ ACCIOLY` (Admin / Owner): Acesso irrestrito e supervisão geral.
  * `JANAINA ROCHA` (Gerente): Abertura e fechamento de caixa, aprovações web e financeiro.
  * `JOSE CARLOS` (Vendedor): Lançamento de vendas balcão no PDV desktop.
  * `ROSA MARIA` (Vendedora): Lançamento de vendas balcão no PDV desktop.
* **Mobile 1 (Celular Operacional / Campo):**
  * `LUIZ ACCIOLY` (Admin): Acesso ao PDV móvel, baixas externas e rotinas rápidas.

### Clientes Externos (WhatsApp e Catálogo Online)
* **Mobile 2 (Celular Cliente Varejo):**
  * `Adivanei Santana Carvalho`: Pedidos no catálogo móvel, balcão e atendimento WhatsApp.
* **Mobile 3 (Celular Cliente Atacado):**
  * `ADRI PERFUMES`: Pedidos em atacado/autoatacado, fiado e interações com o Bot.

---

## 2. Produtos Utilizados no Ciclo de Teste

1. **Perfume Floratta Red 75ml** (Simples)
   * Preço Custo: R$ 60,00 | Venda Varejo: R$ 120,00 | Atacado (min 6 un): R$ 90,00
2. **Body Splash 200ml** (Com Variações)
   * Variação *Baunilha*: Custo R$ 25,00 | Venda Varejo: R$ 50,00
   * Variação *Ameixa*: Custo R$ 25,00 | Venda Varejo: R$ 50,00
3. **Hidratante Corporal 400ml** (Simples)
   * Preço Custo: R$ 20,00 | Venda Varejo: R$ 45,00

---

## 3. Roteiro Operacional Diário

---

### Dia 1 — 10/10/2026 (Sábado): Abertura Geral, Estoque e Venda Multicanal

#### Ações no Desktop
1. **Abertura de Caixa (Janaina Rocha):**
   * Terminal: `PDV-01`
   * Fundo Inicial em Dinheiro: **R$ 100,00**
2. **Entrada de Estoque Inicial:**
   * Floratta Red 75ml: **20 un**
   * Body Splash Baunilha 200ml: **10 un**
   * Body Splash Ameixa 200ml: **10 un**
   * Hidratante Corporal 400ml: **15 un**
3. **Venda Balcão (Jose Carlos):**
   * Cliente: Consumidor Balcão / Avulso
   * Item: 1x Perfume Floratta Red 75ml (R$ 120,00)
   * Pagamento: Dinheiro (Recebido: R$ 150,00 | Troco: R$ 30,00)
4. **Aprovação Web e Sangria (Janaina Rocha):**
   * Aprovar pedido online da Adri Perfumes (mudar status para `concluido` / `pronto_para_retirar`).
   * Lançar Sangria no caixa: **R$ 100,00** em Dinheiro (motivo: *depósito de segurança*).
5. **Fechamento de Caixa:**
   * Dinheiro Declarado: **R$ 120,00** *(100 fundo + 120 venda - 100 sangria)*
   * PIX Apurado: **R$ 95,00** *(50 Luiz + 45 Adri)*

#### Ações no Mobile
1. **PDV Móvel (Mobile 1 — Luiz Accioly):**
   * Cliente: Adivanei Santana Carvalho
   * Item: 1x Body Splash Baunilha (R$ 50,00)
   * Pagamento: PIX
2. **Catálogo Online (Mobile 3 — ADRI PERFUMES):**
   * Item: 1x Hidratante Corporal 400ml (R$ 45,00)
   * Tipo de Entrega: Retirada na Loja (R$ 0,00)
   * Pagamento: PIX

#### Gabarito Dia 1
* **Faturamento Bruto:** R$ 215,00
* **Dinheiro em Caixa:** R$ 120,00 | **PIX:** R$ 95,00 | **Quebra:** R$ 0,00
* **Estoque Final:** Floratta (19 un), Splash Baunilha (9 un), Splash Ameixa (10 un), Hidratante (14 un).

---

### 11/10/2026 (Domingo): Loja Fechada
* Sem abertura de caixa físico e sem movimentações no PDV balcão.

---

### Dia 2 — 12/10/2026 (Segunda-feira): Cartões, Desconto Balcão e Suprimento

#### Ações no Desktop
1. **Abertura de Caixa (Janaina Rocha):**
   * Terminal: `PDV-01`
   * Fundo Inicial em Dinheiro: **R$ 120,00**
2. **Venda Balcão (Rosa Maria):**
   * Cliente: Adivanei Santana Carvalho
   * Item: 1x Perfume Floratta Red 75ml (R$ 120,00)
   * Desconto Concedido: **R$ 10,00** (Total a pagar: **R$ 110,00**)
   * Pagamento: Cartão de Crédito (2x)
3. **Suprimento de Caixa (Janaina Rocha):**
   * Entrada de **R$ 50,00** em Dinheiro (moedas/troco).
4. **Fechamento de Caixa (Janaina Rocha):**
   * Dinheiro Declarado: **R$ 170,00** *(120 fundo + 50 suprimento)*
   * Cartão de Crédito: **R$ 110,00**
   * Cartão de Débito: **R$ 50,00**

#### Ações no Mobile
1. **PDV Móvel (Mobile 1 — Luiz Accioly):**
   * Cliente: Consumidor Avulso
   * Item: 1x Body Splash Ameixa (R$ 50,00)
   * Pagamento: Cartão de Débito

#### Gabarito Dia 2
* **Faturamento Bruto:** R$ 160,00 (R$ 110 Crédito + R$ 50 Débito)
* **Dinheiro em Caixa:** R$ 170,00 | **Quebra:** R$ 0,00
* **Estoque Final:** Floratta (18 un), Splash Baunilha (9 un), Splash Ameixa (9 un), Hidratante (14 un).

---

### Dia 3 — 13/10/2026 (Terça-feira): Cupons Promocionais e Entrega / Frete

#### Ações no Desktop
1. **Abertura de Caixa (Luiz Accioly):**
   * Terminal: `PDV-01`
   * Fundo Inicial: **R$ 100,00**
2. **Cadastro de Cupom Promocional:**
   * Código: `PROMO10`
   * Tipo: Desconto Fixo de R$ 10,00 com valor mínimo de carrinho de R$ 80,00.
3. **Venda Balcão (Jose Carlos):**
   * Cliente: Consumidor Avulso
   * Item: 1x Body Splash Baunilha (R$ 50,00)
   * Pagamento: Dinheiro (R$ 50,00)
4. **Gestão de Expedição (Janaina Rocha):**
   * Localizar pedido web de Adivanei Santana Carvalho.
   * Associar forma de envio (App/Uber) e despachar pedido.
5. **Fechamento de Caixa (Janaina Rocha):**
   * Dinheiro Declarado: **R$ 150,00** *(100 fundo + 50 venda balcão)*
   * PIX: **R$ 95,00**

#### Ações no Mobile
1. **Catálogo Online (Mobile 2 — Adivanei Santana Carvalho):**
   * Itens: 2x Hidratante Corporal 400ml (2 x R$ 45,00 = R$ 90,00)
   * Cupom Aplicado: `PROMO10` (- R$ 10,00)
   * Entrega: Domicílio / App (Taxa de frete: R$ 15,00)
   * Total do Pedido: **R$ 95,00** (R$ 80 produtos + R$ 15 frete)
   * Pagamento: PIX

#### Gabarito Dia 3
* **Faturamento Bruto:** R$ 145,00 (R$ 50 Balcão + R$ 95 Catálogo)
* **Dinheiro em Caixa:** R$ 150,00 | **PIX:** R$ 95,00 | **Quebra:** R$ 0,00
* **Estoque Final:** Floratta (18 un), Splash Baunilha (8 un), Splash Ameixa (9 un), Hidratante (12 un).

---

### Dia 4 — 14/10/2026 (Quarta-feira): WhatsApp Bot, IA e Transição Humana

#### Ações no Desktop
1. **Abertura de Caixa (Janaina Rocha):**
   * Terminal: `PDV-01`
   * Fundo Inicial: **R$ 100,00**
2. **Atendimento / WhatsApp Web (Rosa Maria / Luiz Accioly):**
   * Monitorar painel de mensagens: transição de status `ia` para `humano`.
   * Confirmar pedido e gerar cobrança PIX para ADRI PERFUMES.
3. **Fechamento de Caixa (Janaina Rocha):**
   * Dinheiro Declarado: **R$ 100,00** (fundo intacto)
   * PIX: **R$ 120,00**

#### Ações no Mobile
1. **Interação com WhatsApp (Mobile 3 — ADRI PERFUMES):**
   * Mensagem: *"Olá, vocês têm Floratta Red disponível e qual o valor?"* (Validação do bot).
   * Mensagem: *"Gostaria de falar com um atendente humano para fechar o pedido"* (Pausa da IA).
2. **PDV Móvel (Mobile 1 — Luiz Accioly):**
   * Confirmação do recebimento do PIX de **R$ 120,00** da Adri Perfumes e baixa do pedido de 1x Floratta Red.

#### Gabarito Dia 4
* **Faturamento Bruto:** R$ 120,00
* **Dinheiro em Caixa:** R$ 100,00 | **PIX:** R$ 120,00 | **Quebra:** R$ 0,00
* **Estoque Final:** Floratta (17 un), Splash Baunilha (8 un), Splash Ameixa (9 un), Hidratante (12 un).

---

### Dia 5 — 15/10/2026 (Quinta-feira): Venda Atacado B2B, Fiado e Amortização

#### Ações no Desktop
1. **Abertura de Caixa (Janaina Rocha):**
   * Terminal: `PDV-01`
   * Fundo Inicial: **R$ 100,00**
2. **Venda Atacado Balcão (Jose Carlos):**
   * Cliente: **ADRI PERFUMES**
   * Item: 6x Perfume Floratta Red 75ml (Preço unitário atacado: R$ 90,00)
   * Subtotal: **R$ 540,00**
   * Forma de Pagamento: **Fiado** (Prazo: 30 dias)
   * *Impacto:* `saldo_devedor_fiado` do cliente atualizado para R$ 540,00.
3. **Fechamento de Caixa (Janaina Rocha):**
   * Dinheiro Declarado: **R$ 100,00**
   * PIX (Amortização fiado): **R$ 200,00**
   * Contas a Receber (Fiado gerado): **R$ 540,00**

#### Ações no Mobile
1. **Amortização de Fiado (Mobile 1 — Luiz Accioly):**
   * Registrar amortização de **R$ 200,00** via PIX feita pela cliente ADRI PERFUMES.
   * *Impacto:* Saldo devedor da cliente reduz de R$ 540,00 para **R$ 340,00**.

#### Gabarito Dia 5
* **Faturamento Bruto:** R$ 540,00 (Venda em Fiado)
* **Entradas Financeiras Líquidas:** R$ 200,00 (Amortização PIX)
* **Saldo Devedor Restante da Adri:** R$ 340,00
* **Dinheiro em Caixa:** R$ 100,00 | **Quebra:** R$ 0,00
* **Estoque Final:** Floratta (11 un), Splash Baunilha (8 un), Splash Ameixa (9 un), Hidratante (12 un).

---

### Dia 6 — 16/10/2026 (Sexta-feira): Expedição, Rastreio e Troca de Mercadoria

#### Ações no Desktop
1. **Abertura de Caixa (Janaina Rocha):**
   * Terminal: `PDV-01`
   * Fundo Inicial: **R$ 100,00**
2. **Venda Balcão (Rosa Maria):**
   * Cliente: Adivanei Santana Carvalho
   * Item: 1x Body Splash Baunilha (R$ 50,00) em Dinheiro.
3. **Conclusão de Expedição (Janaina Rocha):**
   * Inserir dados de despacho e marcar entregas pendentes como `entregue`.
4. **Fechamento de Caixa (Janaina Rocha):**
   * Dinheiro Declarado: **R$ 150,00** *(100 fundo + 50 venda)*

#### Ações no Mobile
1. **Troca Balcão / Devolução (Mobile 1 — Luiz Accioly):**
   * Adivanei solicita a troca do Body Splash Baunilha pelo Body Splash Ameixa de igual valor (R$ 50,00).
   * Lançamento de ajuste/troca no sistema:
     * Retorno ao estoque: +1 un Body Splash Baunilha
     * Saída de estoque: -1 un Body Splash Ameixa
     * Impacto financeiro: R$ 0,00 (troca por valor idêntico)

#### Gabarito Dia 6
* **Faturamento Bruto:** R$ 50,00
* **Dinheiro em Caixa:** R$ 150,00 | **Quebra:** R$ 0,00
* **Estoque Final:** Floratta (11 un), Splash Baunilha (8 un), Splash Ameixa (8 un), Hidratante (12 un).

---

### Dia 7 — 17/10/2026 (Sábado): Despesas, Marketplace e Fechamento Semanal

#### Ações no Desktop
1. **Abertura de Caixa (Luiz Accioly):**
   * Terminal: `PDV-01`
   * Fundo Inicial: **R$ 100,00**
2. **Lançamento de Despesa Operacional (Janaina Rocha):**
   * Tipo: `SAIDA` / `DESPESA` paga direto pela gaveta do caixa.
   * Categoria: Contas de Consumo (Energia / Internet)
   * Valor: **R$ 80,00** em Dinheiro
3. **Venda Balcão (Jose Carlos):**
   * Cliente: Consumidor Balcão
   * Item: 1x Perfume Floratta Red 75ml (R$ 120,00) em Dinheiro.
4. **Vínculo Marketplace (Luiz Accioly):**
   * Vincular anúncio de teste em `marketplace_anuncios` com sincronização de estoque ativa.
5. **Fechamento de Caixa Semanal (Janaina Rocha):**
   * Dinheiro Declarado: **R$ 140,00** *(100 fundo + 120 venda - 80 despesa)*
   * Total Faturado no Dia: **R$ 120,00** | Quebra: **R$ 0,00**

#### Gabarito Dia 7 e Posição Consolidada da Semana
* **Saldo Final de Dinheiro na Gaveta (17/10):** R$ 140,00
* **Contas a Receber Ativas:** R$ 340,00 (Saldo devedor fiado da ADRI PERFUMES)
* **Estoque Final Consolidado:**
  * Perfume Floratta Red 75ml: **10 unidades** (Entrada de 20; Saídas: Dia 1 [1], Dia 2 [1], Dia 4 [1], Dia 5 [6], Dia 7 [1])
  * Body Splash Baunilha: **8 unidades** (Entrada de 10; Saídas: Dia 1 [1], Dia 3 [1], Dia 6 [venda 1, troca +1])
  * Body Splash Ameixa: **8 unidades** (Entrada de 10; Saídas: Dia 2 [1], Dia 6 [troca 1])
  * Hidratante Corporal 400ml: **12 unidades** (Entrada de 15; Saídas: Dia 1 [1], Dia 3 [2])