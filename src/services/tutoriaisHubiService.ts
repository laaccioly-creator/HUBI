import { getGeminiApiKey, executarRequisicaoGemini } from './geminiService';
import { Loja, UsuarioLoja } from '../types';

export interface ArtigoTutorial {
  id: string;
  titulo: string;
  categoria: 'impressao' | 'vendas' | 'pedidos' | 'relatorios' | 'usuarios' | 'estoque' | 'catalogo' | 'financas' | 'fiado' | 'geral' | 'ia';
  resumo: string;
  conteudo: string;
  passos: string[];
  tags: string[];
}

export const TUTORIAIS_HUBI: ArtigoTutorial[] = [
  // 1. PRODUTOS & CADASTRO INTELIGENTE COM IA (DESTAQUE HUBI)
  {
    id: 'cadastro-produtos-ia',
    titulo: 'Como cadastrar produtos usando Inteligência Artificial (Foto, Código de Barras e Descrição)',
    categoria: 'ia',
    resumo: 'Cadastre produtos em segundos usando a IA do HUBI: por foto do produto, leitor de código de barras ou gerador automático de descrições.',
    conteudo: `O HUBI possui o cadastro de produtos mais rápido e inteligente do mercado com 3 recursos de IA:
1. 📸 Cadastro por Foto / Imagem com IA:
   Tire uma foto do produto com a câmera do celular ou envie uma imagem no computador. A IA reconhece o produto, identifica a embalagem e preenche automaticamente o Nome, Categoria sugerida e Descrição de vendas.
2. 🏷️ Gerador de Descrições Comerciais com IA:
   Basta digitar o nome básico do produto e clicar no botão 'Gerar com IA ✨'. A IA cria uma descrição atrativa, vendedora e profissional, ideal para o Catálogo Online e vitrine do WhatsApp.
3. 📦 Leitor de Código de Barras (EAN):
   Aponte a câmera do celular ou o leitor de código de barras. O HUBI consulta a base de produtos e preenche os dados cadastrais instantaneamente.
4. 🎨 Grade e Variações:
   Adicione variações de cores, tamanhos, voltagens ou sabores com controle de estoque e código individual.`,
    passos: [
      'Acesse a aba Produtos & Estoque e clique em "Novo Produto"',
      'Para cadastrar por Foto: Toque em "Escanear Produto com IA" ou envie a foto',
      'Para cadastrar por Código de Barras: Aponte o leitor de código de barras',
      'Para gerar a Descrição: Digite o nome do item e clique em "Gerar Descrição com IA ✨"',
      'Informe o preço de custo e preço de venda e clique em "Salvar Produto"'
    ],
    tags: ['produto', 'cadastrar produto', 'ia', 'foto', 'codigo de barras', 'descricao ia', 'camera', 'inteligencia artificial', 'novo produto', 'estoque', 'grade', 'variacoes']
  },
  {
    id: 'cadastrar-produtos-grade',
    titulo: 'Como cadastrar produtos com variações (Cores, Tamanhos, Sabores)',
    categoria: 'estoque',
    resumo: 'Crie grades de produtos com controle de estoque individual por variação.',
    conteudo: `Para produtos que possuem tamanhos, cores ou modelos diferentes:
1. Acesse Produtos & Estoque > Novo Produto.
2. Preencha Nome, Categoria e Preço base.
3. Ative a opção 'Tem variações'.
4. Defina os atributos (ex: Tamanho: P, M, G, GG | Cor: Preto, Branco, Azul).
5. O HUBI gera a matriz de variações com controle de estoque, código de barras e foto individual para cada combinação.`,
    passos: [
      'Acesse Produtos & Estoque > Cadastrar Produto',
      'Ative a opção "Tem variações"',
      'Adicione as opções de tamanho, cor ou sabor',
      'Informe a quantidade em estoque de cada variação e clique em Salvar'
    ],
    tags: ['produto', 'variacao', 'grade', 'tamanho', 'cor', 'estoque', 'matriz']
  },
  {
    id: 'tabelas-preco-atacado',
    titulo: 'Como configurar preços de Atacado e Distribuidor (Autoatacado)',
    categoria: 'estoque',
    resumo: 'Defina preços escalonados por quantidade para compras em volume e atacado.',
    conteudo: `No HUBI, cada produto pode ter faixas de preços automáticas:
• Varejo: Preço padrão para compras individuais no balcão e no catálogo.
• Atacado: Aplicado automaticamente quando o cliente compra acima da quantidade mínima de atacado (ex: 5 peças).
• Distribuidor (Autoatacado): Preço especial para revendedores em grandes volumes (ex: 20 peças).`,
    passos: [
      'No cadastro ou edição do produto, vá na seção Precificação',
      'Preencha o Preço Atacado e a Quantidade Mínima',
      'Preencha o Preço Distribuidor e a Quantidade Mínima',
      'No PDV e no Catálogo Online, o desconto por quantidade será aplicado automaticamente'
    ],
    tags: ['atacado', 'distribuidor', 'autoatacado', 'tabela de preco', 'desconto volume', 'preco']
  },
  {
    id: 'combos-promocionais',
    titulo: 'Como criar Combos e Kits de Produtos Promocionais',
    categoria: 'catalogo',
    resumo: 'Agrupe produtos diferentes em kits com preço especial promocional para aumentar vendas.',
    conteudo: `Kits promocionais aumentam o ticket médio da sua loja:
• No cadastro ou edição do produto, ative a opção 'Este produto é um Combo / Kit'.
• Selecione os itens que compõem o kit e as respectivas quantidades.
• Quando o combo é vendido no PDV ou Catálogo, o HUBI abate automaticamente o estoque dos produtos individuais que o compõem.`,
    passos: [
      'Acesse Produtos & Estoque > Novo Produto',
      'Ative a opção "É um Combo / Kit"',
      'Selecione os produtos que fazem parte do pacote e quantidades',
      'Defina o preço promocional do combo e salve'
    ],
    tags: ['combo', 'kit', 'promocao', 'pacote', 'oferta', 'produtos juntos', 'como criar combo']
  },

  // 2. IMPRESSÃO & RECIBOS
  {
    id: 'impressoras-recibo',
    titulo: 'Como instalar impressoras de recibo no HUBI',
    categoria: 'impressao',
    resumo: 'Passo a passo para conectar impressoras térmicas (58mm/80mm), Bluetooth e impressoras comuns A4.',
    conteudo: `O HUBI possui um motor de impressão universal compatível com qualquer impressora instalada no Windows/Mac ou conectada via Bluetooth no celular:
1. Impressoras Térmicas USB/Rede (58mm ou 80mm): Instale o driver oficial do fabricante no computador (ex: Elgin, Bematech, Epson, Pos-58/80). Ao clicar em 'Térmica 58/80mm' no recibo, selecione sua impressora e imprima em alta velocidade.
2. Impressoras Bluetooth no Celular/Tablet: Pareie a mini-impressora nas configurações Bluetooth do aparelho e selecione imprimir recibo.
3. Impressoras Comuns (Folha A4): Utilize o botão 'Imprimir A4' ou 'Baixar PDF'.`,
    passos: [
      'Abra qualquer pedido ou venda e clique no ícone de Recibo',
      'Escolha o formato desejado: Térmica 58/80mm ou Imprimir A4',
      'Selecione sua impressora na janela do sistema e confirme a impressão',
      'Você também pode configurar cabeçalho e rodapé em Editar meu recibo'
    ],
    tags: ['impressora', 'recibo', 'termica', '58mm', '80mm', 'a4', 'bluetooth', 'bobina', 'comprovante']
  },
  {
    id: 'configurar-recibo',
    titulo: 'Como personalizar os dados, logotipo e textos do recibo',
    categoria: 'impressao',
    resumo: 'Edite o logotipo, nome fantasia, endereço, telefones, mensagem de cabeçalho e rodapé do cupom.',
    conteudo: `Personalize o recibo entregue ao seu cliente:
• Cabeçalho: Nome da loja, endereço completo, CNPJ/CPF e telefones de contato.
• Logotipo: Exibido no topo do recibo impresso e digital.
• Rodapé: Mensagem de agradecimento, termos de troca ou chave Pix.`,
    passos: [
      'Ao visualizar um recibo, clique em "Editar meu recibo"',
      'Edite os dados da loja, cabeçalho e rodapé na gaveta lateral',
      'Clique em "Salvar"',
      'Todos os novos recibos impressos e enviados por WhatsApp utilizarão os novos dados'
    ],
    tags: ['recibo', 'personalizar', 'cabecalho', 'rodape', 'logo', 'configuracao', 'cupom']
  },

  // 3. VENDAS & PDV
  {
    id: 'como-fazer-venda-pdv',
    titulo: 'Como fazer uma venda rápida no PDV (Frente de Caixa)',
    categoria: 'vendas',
    resumo: 'Passo a passo para registrar uma venda rápida no balcão, bipar produtos, cobrar e emitir recibo.',
    conteudo: `O PDV do HUBI foi desenvolvido para registrar vendas em poucos segundos:
1. **Adicione os produtos**: Selecione os produtos tocando nos cards de categorias, digitando o nome na busca rápida ou escaneando o código de barras com o leitor / câmera.
2. **Ajuste quantidades**: Toque no produto no carrinho para alterar a quantidade.
3. **Desconto ou Cliente (Opcional)**: Toque em 'Desconto' para abater valor em R$ ou % ou 'Vincular Cliente' para identificar a compra.
4. **Cobrar / Finalizar**: Clique no botão verde 'Cobrar'. Escolha a forma de pagamento (Dinheiro, Pix, Cartão ou Fiado).
5. **Comprovante**: Emita o recibo na impressora térmica (58/80mm) ou envie diretamente pelo WhatsApp do cliente!`,
    passos: [
      'Acesse a aba Vender (PDV) no menu principal',
      'Adicione os produtos desejados pelo nome, código de barras ou categorias',
      'Se desejar, aplique desconto ou vincule um cliente no topo do carrinho',
      'Clique no botão verde "Cobrar / Finalizar"',
      'Escolha a forma de pagamento (Dinheiro com troco automático, Pix, Cartão ou Fiado)',
      'Confirme a venda e imprima o recibo ou envie pelo WhatsApp'
    ],
    tags: [
      'venda', 'como fazer venda', 'fazer venda', 'como vender', 'como faco uma venda', 'como faço uma venda',
      'passar venda', 'registrar venda', 'pdv', 'frente de caixa', 'cobrar', 'caixa', 'balcao', 'vender'
    ]
  },
  {
    id: 'aplicar-desconto-venda',
    titulo: 'Como aplicar descontos em uma venda ou produto no PDV',
    categoria: 'vendas',
    resumo: 'Como conceder descontos em porcentagem (%) ou valor em dinheiro (R$) no carrinho do PDV.',
    conteudo: `No HUBI você pode conceder descontos com total flexibilidade durante o atendimento:
• **Desconto em Reais (R$)**: Insira um valor fixo de abatimento sobre o total da compra (ex: R$ 10,00 de desconto).
• **Desconto em Porcentagem (%)**: Aplique uma porcentagem de abatimento (ex: 5% ou 10% de desconto).
• O total da venda é recalculado instantaneamente e o valor do desconto sai detalhado no cupom do cliente.`,
    passos: [
      'Com os produtos adicionados no carrinho do PDV, clique no botão "Desconto"',
      'Escolha o formato: R$ (valor em dinheiro) ou % (porcentagem)',
      'Digite o valor do desconto desejado',
      'Clique em "Aplicar Desconto"',
      'O valor final da venda será atualizado com o desconto aplicado'
    ],
    tags: ['desconto', 'dar desconto', 'como dar desconto', 'como aplicar desconto', 'porcentagem', 'reais', 'promocao', 'abater', 'cupom']
  },
  {
    id: 'formas-pagamento-troco',
    titulo: 'Como receber pagamentos, calcular troco e formas aceitas',
    categoria: 'vendas',
    resumo: 'Suporte a Dinheiro com cálculo automático de troco, Pix com QR Code, Cartões e Fiado.',
    conteudo: `O HUBI gerencia todas as formas de pagamento do comércio:
1. **Dinheiro**: Digite o valor entregue pelo cliente em cédulas. O HUBI calcula na hora o troco exato a devolver, evitando erros de caixa.
2. **Pix**: Exiba a chave Pix da loja ou gere a cobrança rápida.
3. **Cartão de Crédito / Débito**: Registre a bandeira e as taxas configuradas da maquininha são descontadas automaticamente da apuração do lucro.
4. **Venda Fiado**: Lance na conta do cliente com controle de limite e vencimento.`,
    passos: [
      'No PDV, clique no botão verde "Cobrar"',
      'Selecione a forma de pagamento desejada',
      'Se for Dinheiro: informe o valor recebido e confira o troco calculado na tela',
      'Confirme o recebimento para liquidar a venda'
    ],
    tags: ['pagamento', 'formas de pagamento', 'troco', 'calcular troco', 'dinheiro', 'pix', 'cartao', 'debito', 'credito', 'cobrar']
  },
  {
    id: 'concluir-pedido-venda',
    titulo: 'Como concluir um pedido e transformar em venda no histórico',
    categoria: 'pedidos',
    resumo: 'Entenda a separação entre Pedidos em andamento e Histórico de Vendas finalizadas.',
    conteudo: `No HUBI, existe uma separação clara entre Pedidos e Vendas:
• Pedidos: Abrange todo o fluxo de produção, separação e entrega (Pendente, Confirmado, Em produção, Saiu para entrega).
• Vendas: Quando o pedido é finalizado e o pagamento é confirmado, clique em 'Concluir venda'. O pedido passa para Concluído e migra automaticamente para a aba Vendas.`,
    passos: [
      'Na tela de Pedidos, clique no código do pedido para abrir a visão detalhada',
      'Verifique os itens e o cliente',
      'Clique no botão verde "Concluir venda"',
      'Selecione o meio de pagamento recebido e confirme',
      'O pedido é finalizado com sucesso e registrado em Vendas'
    ],
    tags: ['pedidos', 'vendas', 'concluir venda', 'fluxo', 'status', 'finalizar', 'historico']
  },
  {
    id: 'cancelar-pedido-venda',
    titulo: 'Como cancelar um pedido ou venda e estornar estoque',
    categoria: 'pedidos',
    resumo: 'Procedimento para cancelamento seguro de pedidos e vendas.',
    conteudo: `Para cancelar um pedido que não será atendido:
1. Abra os detalhes do pedido clicando no seu código.
2. Clique no botão vermelho de cancelamento.
3. Confirme no modal 'Cancelar pedido? Este pedido não poderá ser alterado'.
4. O status mudará para Cancelado e não impactará o faturamento.`,
    passos: [
      'Acesse Pedidos ou Vendas',
      'Clique no código do pedido',
      'Clique no botão Cancelar',
      'Confirme o cancelamento'
    ],
    tags: ['cancelar', 'estorno', 'devolucao', 'cancelado', 'pedido', 'venda']
  },

  // 4. FIADO & CRÉDITO DE CLIENTES
  {
    id: 'venda-fiado',
    titulo: 'Como fazer uma venda no fiado e controle de crédito',
    categoria: 'fiado',
    resumo: 'Registro de vendas fiado, limites de crédito para clientes e quitação de débitos.',
    conteudo: `O HUBI possui controle completo de fiado e conta-corrente de clientes:
1. No PDV ou ao Concluir Pedido, selecione a forma de pagamento 'Venda Fiado'.
2. O sistema exige que a venda seja vinculada a um Cliente cadastrado.
3. O saldo devedor do cliente é atualizado automaticamente.
4. Para receber: Acesse a tela de Clientes > Selecione o cliente > Clique em 'Receber Pagamento Fiado'.`,
    passos: [
      'Vincule um cliente cadastrado ao pedido ou venda',
      'Selecione a forma de pagamento "Venda Fiado"',
      'Confirme a venda; o saldo devedor será lançado na ficha do cliente',
      'Acesse a tela Clientes para consultar saldos devedores e emitir cobrança por WhatsApp'
    ],
    tags: ['fiado', 'credito', 'cliente', 'pagamento', 'saldo devedor', 'cobranca', 'prazo']
  },
  {
    id: 'receber-fiado',
    titulo: 'Como receber pagamentos de fiado de clientes',
    categoria: 'fiado',
    resumo: 'Como dar baixa em débitos de clientes e abater saldo devedor.',
    conteudo: `Quando o cliente for pagar a conta fiado:
1. Acesse o módulo Clientes.
2. Localize o cliente pelo nome ou telefone.
3. Clique em 'Receber Fiado / Abater Saldo'.
4. Informe o valor pago (total ou parcial) e a forma de pagamento (Pix, Dinheiro, Cartão).
5. O saldo devedor do cliente é reduzido imediatamente e a entrada é lançada no Caixa.`,
    passos: [
      'Acesse Clientes',
      'Abra a ficha do cliente com saldo devedor',
      'Clique em "Receber Pagamento"',
      'Informe o valor e confirme'
    ],
    tags: ['receber fiado', 'abater divida', 'baixa fiado', 'quitar fiado', 'saldo cliente', 'como receber fiado']
  },
  {
    id: 'cadastrar-clientes',
    titulo: 'Como cadastrar clientes, dados de contato e limite de fiado',
    categoria: 'geral',
    resumo: 'Cadastre nomes, telefones, WhatsApp e defina limite de crédito fiado.',
    conteudo: `Cadastrar clientes no HUBI agiliza o atendimento e previne inadimplência:
• Acesse a aba Clientes e clique em 'Novo Cliente'.
• Preencha Nome, Telefone / WhatsApp e endereço.
• Defina se o cliente tem permissão para comprar no Fiado e estipule um Limite de Crédito seguro em R$.`,
    passos: [
      'Acesse o menu Clientes no menu lateral ou inferior',
      'Clique no botão "+ Novo Cliente"',
      'Preencha nome e WhatsApp (com DDD)',
      'Defina o limite de fiado e clique em Salvar'
    ],
    tags: ['cliente', 'cadastrar cliente', 'novo cliente', 'como cadastrar cliente', 'telefone', 'whatsapp', 'limite fiado']
  },

  // 5. CATÁLOGO ONLINE & WHATSAPP
  {
    id: 'catalogo-online-config',
    titulo: 'Como ativar e personalizar o Catálogo Online para vender pelo WhatsApp',
    categoria: 'catalogo',
    resumo: 'Crie sua vitrine digital com link personalizado para clientes fazerem pedidos pelo WhatsApp.',
    conteudo: `O Catálogo Online do HUBI permite que seus clientes comprem direto pelo celular:
1. Acesse Mais > Configuração do Catálogo.
2. Defina o link exclusivo da sua loja (ex: hubi.app/catalog/sualoja).
3. Adicione banners promocionais, horário de funcionamento, formas de entrega e chave Pix.
4. Quando o cliente finaliza o pedido na vitrine, ele chega instantaneamente na sua tela de Pedidos com alerta sonoro!`,
    passos: [
      'Acesse Mais > Configuração do Catálogo',
      'Ative a vitrine online e defina o slug da loja',
      'Compartilhe o link no Instagram e WhatsApp',
      'Receba pedidos em tempo real na tela Pedidos'
    ],
    tags: ['catalogo online', 'vitrine', 'whatsapp', 'pedidos online', 'cardapio', 'link da bio']
  },
  {
    id: 'compartilhar-andamento-pedido',
    titulo: 'Como compartilhar o link de andamento do pedido com o cliente',
    categoria: 'catalogo',
    resumo: 'Permita que o cliente acompanhe em tempo real o status do pedido pelo WhatsApp.',
    conteudo: `Todo pedido possui um link público e seguro de acompanhamento em tempo real:
• O cliente pode abrir no celular para ver se o pedido está confirmado, em produção ou pronto para retirada.
• Também permite que o cliente visualize o endereço, itens e contato da loja com botão Como Chegar.`,
    passos: [
      'Abra os detalhes do pedido',
      'No topo, clique em "Copiar link" ou "WhatsApp"',
      'Envie o link para o cliente no WhatsApp',
      'O cliente verá a página interativa de andamento do pedido'
    ],
    tags: ['link', 'andamento', 'rastreamento', 'cliente', 'whatsapp', 'compartilhar', 'tracking']
  },

  // 6. USUÁRIOS & PERMISSÕES
  {
    id: 'usuarios-permissoes',
    titulo: 'Como cadastrar, inativar e apagar usuários / operadores',
    categoria: 'usuarios',
    resumo: 'Controle de operadores, níveis de acesso (Admin, Gerente, Vendedor) e permissões de segurança.',
    conteudo: `O controle de usuários do HUBI permite definir exatamente o que cada operador pode fazer:
• Perfis disponíveis: Owner (Dono), Admin (Acesso total), Gerente (Financeiro e relatórios) e Vendedor/Comum (Frente de caixa e pedidos próprios).
• Permissões individuais: Bloqueio de uso em celular pessoal, permissão para dar desconto, visualização de transações de outros operadores e permissão de gerenciar estoque.`,
    passos: [
      'Acesse o menu Mais > Gestão de Usuários (ou /users)',
      'Clique em "Novo Usuário" para cadastrar nome, e-mail, perfil e permissões',
      'Para inativar, desmarque a opção "Ativo" no cartão do operador',
      'Usuários inativos perdem o acesso ao sistema imediatamente'
    ],
    tags: ['usuarios', 'operadores', 'permissoes', 'vendedores', 'acesso', 'senha', 'inativar', 'seguranca']
  },

  // 7. FINANÇAS & FLUXO DE CAIXA
  {
    id: 'abertura-fechamento-caixa',
    titulo: 'Como fazer a abertura e fechamento de caixa diário',
    categoria: 'financas',
    resumo: 'Controle o saldo inicial de troco, retiradas e conciliação de valores no fim do dia.',
    conteudo: `Mantenha seu caixa 100% conciliado:
• **Abertura de Caixa**: Informe o valor de troco inicial em dinheiro na gaveta ao abrir o dia.
• **Durante o expediente**: Todas as vendas em dinheiro, Pix e cartões são contabilizadas em tempo real.
• **Fechamento**: No final do expediente, conte os valores em dinheiro na gaveta e clique em 'Fechar Caixa'. O sistema aponta automaticamente se houve quebra ou sobra de caixa.`,
    passos: [
      'Acesse a tela Finanças & Caixa',
      'Para abrir o caixa: Clique em "Abrir Caixa" e digite o fundo de troco inicial',
      'No fim do dia: Clique em "Fechar Caixa" e informe o dinheiro apurado na gaveta',
      'Confirme para gerar o resumo do turno'
    ],
    tags: ['caixa', 'abertura de caixa', 'fechamento de caixa', 'como abrir caixa', 'como fechar caixa', 'troco', 'gaveta', 'financas']
  },
  {
    id: 'sangria-suprimento-caixa',
    titulo: 'Como realizar Sangria e Suprimento no Caixa Diário',
    categoria: 'financas',
    resumo: 'Como registrar retiradas rápidas de dinheiro (sangria) ou reforço de troco (suprimento).',
    conteudo: `Controle as entradas e saídas avulsas de dinheiro da gaveta:
• **Sangria**: Retirada de dinheiro do caixa para despesas rápidas (ex: motoboy, água, lanche) ou depósito.
• **Suprimento**: Entrada de dinheiro extra na gaveta para reforçar o troco durante o dia.`,
    passos: [
      'Na tela Finanças & Caixa, clique no botão "Sangria" (para retirar) ou "Suprimento" (para adicionar)',
      'Informe o valor em R$',
      'Digite uma breve descrição (ex: Reforço de moedas ou Pagamento avulso)',
      'Confirme a movimentação'
    ],
    tags: ['sangria', 'suprimento', 'retirada', 'reforco', 'troco', 'gaveta', 'despesa', 'como fazer sangria']
  },

  // 8. RELATÓRIOS & EXPORTAÇÃO
  {
    id: 'exportar-relatorios',
    titulo: 'Exporte os relatórios de seu negócio em Excel/CSV',
    categoria: 'relatorios',
    resumo: 'Como gerar planilhas em Excel/CSV de pedidos, vendas, clientes e movimentações financeiras.',
    conteudo: `Você pode exportar relatórios completos com 1 clique:
• Na tela de Pedidos ou Vendas: Clique no botão 'Exportar' para baixar a planilha detalhada em CSV/Excel com todos os itens, clientes, valores e formas de pagamento.
• Na tela de Finanças: Acesse o Fluxo de Caixa para exportar entradas, saídas e conciliações.
• Na tela de Estatísticas: Visualize gráficos de faturamento por período, ticket médio e produtos mais vendidos.`,
    passos: [
      'Acesse a tela de Pedidos, Vendas ou Finanças',
      'Aplique os filtros de data e período desejados',
      'Clique no botão "Exportar" (ícone de download)',
      'O arquivo .csv compatível com Excel será baixado instantaneamente'
    ],
    tags: ['exportar', 'relatorios', 'excel', 'csv', 'planilha', 'financeiro', 'vendas', 'estatisticas']
  }
];

export interface DadosLojaRubi {
  faturamento: number;
  totalPedidos: number;
  produtosAlerta: any[];
  totalFiado: number;
  produtosTotal: number;
  clientesTotal: number;
}

/**
 * Normaliza strings removendo acentos e caracteres especiais para busca robusta
 */
export const normalizarTexto = (txt: string): string => {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const primeiroNomeUsuario = (nomeCompleto?: string | null): string => {
  if (!nomeCompleto) return 'Lojista';
  return nomeCompleto.split(' ')[0] || 'Lojista';
};

/**
 * Localiza o tutorial mais relevante com algoritmo inteligente de pontuação
 */
export const encontrarTutorialMaisRelevante = (pergunta: string): ArtigoTutorial | null => {
  const normQuery = normalizarTexto(pergunta);
  const palavrasQuery = normQuery.split(' ').filter(w => w.length > 2);

  // 1. Mapeamentos diretos de alta prioridade para dúvidas operacionais mais frequentes
  if (
    normQuery.includes('fazer venda') ||
    normQuery.includes('faco uma venda') ||
    normQuery.includes('faco venda') ||
    normQuery.includes('como vender') ||
    normQuery.includes('passar venda') ||
    normQuery.includes('nova venda') ||
    normQuery.includes('venda no pdv') ||
    normQuery.includes('registrar venda') ||
    (normQuery.includes('como') && normQuery.includes('venda'))
  ) {
    const tVenda = TUTORIAIS_HUBI.find(t => t.id === 'como-fazer-venda-pdv');
    if (tVenda) return tVenda;
  }

  if (normQuery.includes('desconto')) {
    const tDesc = TUTORIAIS_HUBI.find(t => t.id === 'aplicar-desconto-venda');
    if (tDesc) return tDesc;
  }

  if (normQuery.includes('troco') || normQuery.includes('forma de pagamento') || normQuery.includes('formas de pagamento')) {
    const tTroco = TUTORIAIS_HUBI.find(t => t.id === 'formas-pagamento-troco');
    if (tTroco) return tTroco;
  }

  if (normQuery.includes('cadastr') && (normQuery.includes('produt') || normQuery.includes('item'))) {
    const tProd = TUTORIAIS_HUBI.find(t => t.id === 'cadastro-produtos-ia');
    if (tProd) return tProd;
  }

  if (normQuery.includes('impress') || normQuery.includes('recibo') || normQuery.includes('cupom') || normQuery.includes('termica')) {
    const tImp = TUTORIAIS_HUBI.find(t => t.id === 'impressoras-recibo');
    if (tImp) return tImp;
  }

  if (normQuery.includes('abrir caixa') || normQuery.includes('fechar caixa') || normQuery.includes('abertura de caixa') || normQuery.includes('fechamento de caixa')) {
    const tCaixa = TUTORIAIS_HUBI.find(t => t.id === 'abertura-fechamento-caixa');
    if (tCaixa) return tCaixa;
  }

  if (normQuery.includes('sangria') || normQuery.includes('suprimento')) {
    const tSangria = TUTORIAIS_HUBI.find(t => t.id === 'sangria-suprimento-caixa');
    if (tSangria) return tSangria;
  }

  if (normQuery.includes('fiado')) {
    if (normQuery.includes('receber') || normQuery.includes('baixa') || normQuery.includes('abater') || normQuery.includes('quitar')) {
      const tRecFiado = TUTORIAIS_HUBI.find(t => t.id === 'receber-fiado');
      if (tRecFiado) return tRecFiado;
    }
    const tVendaFiado = TUTORIAIS_HUBI.find(t => t.id === 'venda-fiado');
    if (tVendaFiado) return tVendaFiado;
  }

  if (normQuery.includes('cancelar')) {
    const tCanc = TUTORIAIS_HUBI.find(t => t.id === 'cancelar-pedido-venda');
    if (tCanc) return tCanc;
  }

  if (normQuery.includes('concluir') && (normQuery.includes('pedido') || normQuery.includes('venda'))) {
    const tConc = TUTORIAIS_HUBI.find(t => t.id === 'concluir-pedido-venda');
    if (tConc) return tConc;
  }

  // 2. Pontuação dinâmica com base em tags, título e conteúdo
  let melhorScore = 0;
  let melhorTutorial: ArtigoTutorial | null = null;

  for (const t of TUTORIAIS_HUBI) {
    let score = 0;
    const normTitulo = normalizarTexto(t.titulo);
    const normConteudo = normalizarTexto(t.conteudo);

    for (const tag of t.tags) {
      const normTag = normalizarTexto(tag);
      if (normQuery.includes(normTag)) {
        score += normTag.length > 5 ? 40 : 20;
      }
    }

    for (const word of palavrasQuery) {
      if (normTitulo.includes(word)) score += 15;
      if (normConteudo.includes(word)) score += 5;
    }

    if (score > melhorScore) {
      melhorScore = score;
      melhorTutorial = t;
    }
  }

  return melhorScore >= 15 ? melhorTutorial : null;
};

/**
 * Consulta a IA Especialista em Suporte HUBI
 */
export const responderDuvidaSuporteIA = async (
  duvida: string,
  usuario?: UsuarioLoja | null,
  loja?: Loja | null
): Promise<string> => {
  const apiKey = getGeminiApiKey();
  const nomeUsuario = primeiroNomeUsuario(usuario?.nome_completo);
  const nomeLoja = loja?.nome_fantasia || 'HUBI PDV';

  // Base de conhecimento condensada de todos os tutoriais
  const baseConhecimentoTexto = TUTORIAIS_HUBI.map(
    (t, idx) => `[TUTORIAL ${idx + 1}: ${t.titulo} (${t.categoria.toUpperCase()})]\nResumo: ${t.resumo}\nConteúdo: ${t.conteudo}\nPassos: ${t.passos.join(' -> ')}`
  ).join('\n\n');

  const prompt = `
Você é a **Rubi**, a assistente virtual e especialista oficial em suporte do **Sistema HUBI** (sistema de gestão comercial e PDV).
Seu objetivo é ajudar o usuário (${nomeUsuario}, da loja ${nomeLoja}) respondendo dúvidas operacionais com extrema clareza, precisão, assertividade e empatia.

DIRETRIZES FUNDAMENTAIS:
1. Responda em português brasileiro com tom prestativo, ágil, profissional e encorajador.
2. DÚVIDAS OPERACIONAIS ("Como faço...", "Como funciona...", "Passo a passo", "Onde clico..."):
   - Forneça um PASSO A PASSO numerado e claro de como realizar a ação no sistema HUBI.
   - NUNCA dê um relatório ou resumo financeiro de faturamento quando o usuário perguntar COMO FAZER uma operação (ex: "como faço uma venda", "como dar desconto", "como cadastrar produto").
3. NOME DO SISTEMA:
   - O nome exclusivo do sistema é **HUBI**. NUNCA mencione outros softwares. Sempre se refira ao sistema como **HUBI** ou **HUBI PDV**.
4. Use formatação markdown (negritos, tópicos numerados e emojis) para leitura fácil e agradável.
5. Finalize sempre se colocando à disposição para ajudar com qualquer outra dúvida.

BASE OFICIAL DE TUTORIAIS DO HUBI (MENUS DE AJUDA):
${baseConhecimentoTexto}

PERGUNTA DO USUÁRIO:
"${duvida}"
`;

  if (apiKey) {
    try {
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 850 }
      };

      const resData = await executarRequisicaoGemini(apiKey, requestBody);
      const resposta = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (resposta && resposta.trim()) {
        return resposta.trim();
      }
    } catch (e) {
      console.warn('Erro ao consultar Gemini para suporte:', e);
    }
  }

  // Fallback inteligente garantido através da base de conhecimento de tutoriais
  const tutorialEncontrado = encontrarTutorialMaisRelevante(duvida);

  if (tutorialEncontrado) {
    return `Olá, **${nomeUsuario}**! 😊\n\nAqui está o passo a passo sobre **${tutorialEncontrado.titulo}** no HUBI:\n\n${tutorialEncontrado.conteudo}\n\n**Passo a passo prático:**\n${tutorialEncontrado.passos.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nSe precisar de mais detalhes ou tiver outra dúvida, conte comigo! 👍`;
  }

  return `Olá, **${nomeUsuario}**! 👋\n\nSou a **Rubi**, sua assistente no **HUBI**! Posso te ensinar qualquer rotina do sistema:\n\n• **Vendas & PDV**: Como fazer uma venda rápida, dar descontos em R$ ou % e emitir recibos.\n• **Cadastro com IA**: Como cadastrar produtos tirando foto, escaneando código de barras ou gerando descrições com IA.\n• **Gestão de Pedidos**: Concluir pedidos, alterar status e cancelamento com estorno.\n• **Fiado & Clientes**: Vender no fiado, consultar saldos e dar baixa em pagamentos.\n• **Caixa & Finanças**: Abertura, fechamento, sangrias e suprimentos de troco.\n• **Impressão**: Configuração de impressoras térmicas (58/80mm) Bluetooth/USB e recibos A4.\n\nQual operação você gostaria de realizar agora?`;
};

/**
 * Processador Unificado da Inteligência Rubi IA:
 * Roteia inteligentemente entre dúvidas operacionais de suporte (tutoriais) e consultas de métricas ao vivo da loja.
 */
export const processarPerguntaRubiIA = async (
  pergunta: string,
  usuario?: UsuarioLoja | null,
  loja?: Loja | null,
  dadosLoja?: DadosLojaRubi
): Promise<string> => {
  const pNorm = normalizarTexto(pergunta);

  // 1. Identificar se é uma pergunta operacional / de ajuda / "como fazer"
  const termosComoFazer = [
    'como', 'passo a passo', 'tutorial', 'ensina', 'onde fica', 'onde clico',
    'duvida', 'duvidas', 'ajuda', 'manual', 'explicar', 'explica', 'guia',
    'como fazer', 'como faco', 'como cadastrar', 'como vender', 'como registrar',
    'como funciona', 'como emitir', 'como imprimir', 'como cobrar', 'como cancelar',
    'como abrir', 'como fechar', 'como dar', 'como criar', 'como alterar', 'como usar',
    'nao sei como', 'me ajuda'
  ];

  const ehPerguntaOperacional = termosComoFazer.some(termo => pNorm.includes(termo));

  // 2. Se for pergunta operacional, NUNCA retorna resumo de faturamento. Vai direto ao tutorial/suporte!
  if (ehPerguntaOperacional) {
    return await responderDuvidaSuporteIA(pergunta, usuario, loja);
  }

  // 3. Consultas de Métricas Financeiras e Faturamento da Loja (Apenas se NÃO for pergunta operacional)
  const termosResumoVendas = [
    'resumo de venda', 'resumo de vendas', 'faturamento de hoje', 'quanto vendi',
    'total de vendas hoje', 'total vendido', 'vendas de hoje', 'relatorio de vendas hoje',
    'como estao as vendas', 'faturamento total', 'ticket medio', 'volume de vendas',
    'faturamento'
  ];

  const ehConsultaMetricasVendas =
    termosResumoVendas.some(t => pNorm.includes(t)) ||
    pNorm === 'vendas' ||
    pNorm === 'resumo vendas' ||
    pNorm === 'vendas hoje';

  if (ehConsultaMetricasVendas && dadosLoja) {
    const { faturamento, totalPedidos } = dadosLoja;
    const ticketMedio = totalPedidos > 0 ? faturamento / totalPedidos : 0;
    return `📊 **Resumo de Vendas & Faturamento:**\n\n• **Faturamento Total:** R$ ${faturamento.toFixed(2)}\n• **Volume de Vendas:** ${totalPedidos} pedidos confirmados\n• **Ticket Médio:** R$ ${ticketMedio.toFixed(2)}\n\nSuas vendas estão registradas no sistema! Quer ajuda com alguma rotina de vendas ou dicas para impulsionar o negócio?`;
  }

  // 4. Consultas de Alerta de Estoque
  const termosAlertaEstoque = [
    'estoque baixo', 'alerta de estoque', 'produtos acabando', 'estoque no limite',
    'o que esta acabando', 'falta no estoque', 'estoque zerado'
  ];

  const ehConsultaEstoque = termosAlertaEstoque.some(t => pNorm.includes(t));

  if (ehConsultaEstoque && dadosLoja) {
    const { produtosAlerta, produtosTotal } = dadosLoja;
    if (produtosAlerta && produtosAlerta.length > 0) {
      const getEstoque = (p: any) => {
        if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
          return p.variacoes.reduce((acc: number, v: any) => acc + Number(v.quantidade_estoque || 0), 0);
        }
        return Number(p.quantidade_estoque || 0);
      };
      const listaAlerta = produtosAlerta.slice(0, 4).map(p => `• **${p.nome}**: restam ${getEstoque(p)} un`).join('\n');
      return `⚠️ **Atenção ao Estoque:**\n\nVocê possui **${produtosAlerta.length} produto(s)** com estoque no limite ou abaixo do mínimo:\n\n${listaAlerta}\n\nRecomendo repor esses itens com seus fornecedores para não perder vendas!`;
    } else {
      return `✅ **Estoque Regularizado!**\n\nTodos os seus ${produtosTotal || 0} produtos cadastrados estão com quantidades acima do nível mínimo de alerta.`;
    }
  }

  // 5. Consultas de Saldo Devedor em Fiado
  const termosConsultaFiado = [
    'total em fiado', 'quanto tenho a receber', 'saldo devedor fiado', 'total fiado',
    'quem esta me devendo', 'devedores'
  ];

  const ehConsultaFiado = termosConsultaFiado.some(t => pNorm.includes(t));

  if (ehConsultaFiado && dadosLoja) {
    return `💰 **Controle de Fiado:**\n\nAtualmente há um total de **R$ ${dadosLoja.totalFiado.toFixed(2)}** em haver com clientes.\n\nVocê pode ir na aba **Clientes** para consultar os nomes e enviar lembretes amigáveis de pagamento direto pelo WhatsApp em 1 clique!`;
  }

  // 6. Para qualquer outra dúvida, consulta a base de tutoriais ou IA Gemini
  return await responderDuvidaSuporteIA(pergunta, usuario, loja);
};
