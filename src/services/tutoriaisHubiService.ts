import { getGeminiApiKey, executarRequisicaoGemini } from './geminiService';
import { Loja, UsuarioLoja } from '../types';

export interface ArtigoTutorial {
  id: string;
  titulo: string;
  categoria: 'impressao' | 'vendas' | 'pedidos' | 'relatorios' | 'usuarios' | 'estoque' | 'catalogo' | 'financas' | 'fiado' | 'geral';
  resumo: string;
  conteudo: string;
  passos: string[];
  tags: string[];
}

export const TUTORIAIS_HUBI: ArtigoTutorial[] = [
  // 1. IMPRESSÃO & RECIBOS
  {
    id: 'impressoras-recibo',
    titulo: 'Como instalar impressoras de recibo no HUBI / Kyte',
    categoria: 'impressao',
    resumo: 'Passo a passo para conectar impressoras térmicas (58mm/80mm), Bluetooth e impressoras comuns A4.',
    conteudo: `O HUBI possui um motor de impressão universal compatível com qualquer impressora instalada no Windows/Mac ou conectada via Bluetooth no celular:
1. Impressoras Térmicas USB/Rede (58mm ou 80mm): Instale o driver oficial do fabricante (ex: Elgin, Bematech, Epson, Pos-58/80). Ao clicar em 'Térmica 58/80mm' no recibo, selecione sua impressora no diálogo do sistema.
2. Impressoras Bluetooth no Celular/Tablet: Pareie a mini-impressora nas configurações Bluetooth do Android/iOS e selecione imprimir recibo.
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
    conteudo: `Personalize o recibo entregue ao cliente:
• Cabeçalho: Nome da loja, endereço completo, CNPJ/CPF e telefones de contato.
• Logotipo: Exibido no topo do recibo impresso e digital.
• Rodapé: Mensagem de agradecimento, termos de troca ou chaves Pix.`,
    passos: [
      'Ao visualizar um recibo, clique em "Editar meu recibo"',
      'Edite os dados da loja, cabeçalho e rodapé na gaveta lateral',
      'Clique em "Salvar"',
      'Todos os novos recibos impressos e enviados por WhatsApp utilizarão os novos dados'
    ],
    tags: ['recibo', 'personalizar', 'cabecalho', 'rodape', 'logo', 'configuracao', 'cupom']
  },

  // 2. VENDAS & PDV
  {
    id: 'como-fazer-venda-pdv',
    titulo: 'Como fazer uma venda rápida no PDV (Frente de Caixa)',
    categoria: 'vendas',
    resumo: 'Como adicionar produtos, aplicar descontos, vincular clientes e finalizar a venda.',
    conteudo: `O PDV do HUBI permite registrar vendas em segundos:
1. Adicione produtos digitando o nome, escaneando o código de barras ou clicando nos cards de categorias.
2. Para aplicar desconto: Clique em Desconto no carrinho e insira em R$ ou %.
3. Para vincular cliente: Clique em 'Vincular Cliente' no topo do carrinho.
4. Clique em 'Cobrar', escolha a forma de pagamento (Dinheiro, Pix, Cartão, Fiado) e confirme.`,
    passos: [
      'Acesse a aba Vender (PDV)',
      'Selecione os produtos desejados',
      'Clique no botão verde "Cobrar / Finalizar"',
      'Escolha a forma de pagamento e informe o valor recebido',
      'Imprima o recibo ou envie pelo WhatsApp'
    ],
    tags: ['venda', 'pdv', 'frente de caixa', 'cobrar', 'desconto', 'pagamento', 'balcao']
  },
  {
    id: 'concluir-pedido-venda',
    titulo: 'Como concluir um pedido e transformar em venda no histórico',
    categoria: 'pedidos',
    resumo: 'Entenda a separação entre Pedidos em andamento e Histórico de Vendas finalizadas.',
    conteudo: `No HUBI, existe uma separação clara entre Pedidos e Vendas:
• Pedidos: Abrange todo o fluxo de produção, separação e entrega (Pendente, Confirmado, Em produção, Saiu para entrega).
• Vendas: Quando o pedido é finalizado e o pagamento é confirmado, clique em 'Concluir venda'. O pedido passa para Concluído e migra automaticamente para o Histórico de Vendas.`,
    passos: [
      'Na tela de Pedidos, clique no código do pedido para abrir os detalhes',
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
2. Clique no ícone vermelho de bloqueio (Cancelar pedido).
3. Confirme o cancelamento no modal 'Cancelar pedido? Este pedido não poderá ser alterado'.
4. O status mudará para Cancelado e os produtos não impactarão o faturamento.`,
    passos: [
      'Acesse Pedidos ou Vendas',
      'Clique no código do pedido',
      'Clique no botão Cancelar',
      'Confirme o cancelamento'
    ],
    tags: ['cancelar', 'estorno', 'devolucao', 'cancelado', 'pedido', 'venda']
  },

  // 3. FIADO & CRÉDITO DE CLIENTES
  {
    id: 'venda-fiado',
    titulo: 'Como fazer uma venda no fiado e controle de crédito',
    categoria: 'fiado',
    resumo: 'Registro de vendas fiado, limites de crédito para clientes e quitação de parcelas.',
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
4. Informe o valor pago (total ou parcial) e o meio de pagamento (Pix, Dinheiro, Cartão).
5. O saldo devedor do cliente é reduzido imediatamente e a entrada é lançada no Caixa.`,
    passos: [
      'Acesse Clientes',
      'Abra a ficha do cliente com saldo devedor',
      'Clique em "Receber Pagamento"',
      'Informe o valor e confirme'
    ],
    tags: ['receber fiado', 'abater divida', 'baixa fiado', 'quitar fiado', 'saldo cliente']
  },

  // 4. PRODUTOS & ESTOQUE
  {
    id: 'cadastrar-produtos-grade',
    titulo: 'Como cadastrar produtos com variações (Cores, Tamanhos, Sabores)',
    categoria: 'estoque',
    resumo: 'Crie grades de produtos com controle de estoque individual por variação.',
    conteudo: `Para produtos com múltiplos tamanhos ou cores:
1. Acesse Produtos & Estoque > Novo Produto.
2. Preencha Nome, Categoria e Preço.
3. Ative a opção 'Tem variações'.
4. Defina os atributos (ex: Tamanho: P, M, G | Cor: Preto, Branco).
5. O HUBI gera a matriz de variações onde você pode definir estoque e código de barras individual para cada combinação.`,
    passos: [
      'Acesse Produtos & Estoque > Cadastrar Produto',
      'Ative o switch "Tem variações"',
      'Adicione as opções de tamanho, cor ou sabor',
      'Informe a quantidade em estoque de cada variação e salve'
    ],
    tags: ['produto', 'variacao', 'grade', 'tamanho', 'cor', 'estoque', 'matriz']
  },
  {
    id: 'tabelas-preco-atacado',
    titulo: 'Como configurar preços de Atacado e Distribuidor (Autoatacado)',
    categoria: 'estoque',
    resumo: 'Defina preços escalonados por quantidade para vendas no atacado.',
    conteudo: `No HUBI, cada produto pode ter 3 faixas de preços:
• Varejo: Preço padrão para compras individuais.
• Atacado: Aplicado automaticamente quando o cliente compra acima da quantidade mínima de atacado (ex: 5 peças).
• Distribuidor (Autoatacado): Preço especial para revendedores em grandes volumes (ex: 20 peças).`,
    passos: [
      'No cadastro ou edição do produto, vá na seção Precificação',
      'Preencha o Preço Atacado e a Quantidade Mínima de Atacado',
      'Preencha o Preço Distribuidor e a Quantidade Mínima',
      'No PDV e no Catálogo, o desconto por volume será aplicado automaticamente'
    ],
    tags: ['atacado', 'distribuidor', 'autoatacado', 'tabela de preco', 'desconto volume', 'preco']
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
• O cliente pode abrir no celular para ver se o pedido está confirmado, em produção ou saiu para entrega.
• Também permite que o cliente visualize o endereço, itens e contato da loja.`,
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
    conteudo: `O controle de usuários permite definir exatamente o que cada operador pode fazer:
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
    titulo: 'Como fazer a abertura, sangria e fechamento de caixa diário',
    categoria: 'financas',
    resumo: 'Controle o saldo inicial de troco, retiradas e conciliação de valores no fim do dia.',
    conteudo: `Mantenha seu caixa 100% conciliado:
• Abertura de Caixa: Informe o valor de troco inicial em dinheiro na gaveta.
• Sangria / Suprimento: Registre saídas para pagamentos rápidos ou aportes de troco.
• Fechamento: No final do expediente, conte os valores em dinheiro, confira os totais de cartões e Pix e clique em 'Fechar Caixa'. O sistema gera o relatório de conferência.`,
    passos: [
      'Acesse Finanças & Caixa',
      'Verifique as movimentações do turno',
      'Utilize os botões Sangria ou Suprimento quando necessário',
      'Clique em "Fechar Caixa" para gerar o resumo do turno'
    ],
    tags: ['caixa', 'abertura de caixa', 'fechamento de caixa', 'sangria', 'troco', 'suprimento', 'financas']
  },

  // 8. RELATÓRIOS & EXPORTAÇÃO
  {
    id: 'exportar-relatorios',
    titulo: 'Exporte os relatórios de seu negócio em Excel/CSV',
    categoria: 'relatorios',
    resumo: 'Como gerar planilhas em Excel/CSV de pedidos, vendas, clientes e movimentações financeiras.',
    conteudo: `Você pode exportar relatórios completos com 1 clique:
• Na tela de Pedidos ou Vendas: Clique no botão 'Exportar' no canto superior direito para baixar a planilha detalhada em CSV/Excel com todos os itens, clientes, valores e formas de pagamento.
• Na tela de Finanças: Acesse o Fluxo de Caixa para exportar entradas, saídas e previsões financeiras.
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

/**
 * Consulta a IA Especialista em Suporte HUBI / Kyte
 */
export const responderDuvidaSuporteIA = async (
  duvida: string,
  usuario?: UsuarioLoja | null,
  loja?: Loja | null
): Promise<string> => {
  const apiKey = getGeminiApiKey();
  const nomeUsuario = usuario?.nome_completo || 'Lojista';
  const nomeLoja = loja?.nome_fantasia || 'HUBI PDV';

  // Base de conhecimento condensada de todos os tutoriais
  const baseConhecimentoTexto = TUTORIAIS_HUBI.map(
    (t, idx) => `[TUTORIAL ${idx + 1}: ${t.titulo} (${t.categoria.toUpperCase()})]\nResumo: ${t.resumo}\nConteúdo: ${t.conteudo}\nPassos: ${t.passos.join(' -> ')}`
  ).join('\n\n');

  const prompt = `
Você é a **Rubi**, a assistente virtual e especialista oficial em suporte do sistema **HUBI** (totalmente compatível com as funcionalidades e fluxos operacionais do Kyte e HUBI).
Seu objetivo é ajudar o usuário (${nomeUsuario}, da loja ${nomeLoja}) respondendo dúvidas operacionais com extrema clareza, objetividade, assertividade e empatia.

BASE OFICIAL DE TUTORIAIS DO SISTEMA:
${baseConhecimentoTexto}

DIRETRIZES DE RESPOSTA:
1. Responda em português brasileiro com tom prestativo, profissional e encorajador.
2. Seja direto ao ponto: forneça um passo a passo numerado e claro quando for uma dúvida de como fazer algo.
3. Use a base de tutoriais acima como verdade absoluta para ensinar como usar impressoras térmicas 58/80mm, PDV, fiado, pedidos, vendas, variações de produtos, catálogo online e relatórios.
4. Use formatação markdown (negritos, tópicos e emojis) para tornar a leitura visualmente excelente.
5. Termine sempre de forma acolhedora se colocando à disposição para tirar qualquer outra dúvida!

PERGUNTA DO USUÁRIO:
"${duvida}"
`;

  if (apiKey) {
    try {
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 800 }
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

  // Fallback inteligente baseado em busca por palavras-chave caso sem API key
  const dLower = duvida.toLowerCase();
  const tutorialEncontrado = TUTORIAIS_HUBI.find(
    (t) =>
      t.tags.some((tag) => dLower.includes(tag)) ||
      t.titulo.toLowerCase().split(' ').some((w) => w.length > 3 && dLower.includes(w))
  );

  if (tutorialEncontrado) {
    return `Olá, **${nomeUsuario}**! 😊\n\nAqui está como resolver sua dúvida sobre **${tutorialEncontrado.titulo}**:\n\n${tutorialEncontrado.conteudo}\n\n**Passo a passo prático:**\n${tutorialEncontrado.passos.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nSe precisar de mais detalhes, estou por aqui! 👍`;
  }

  return `Olá, **${nomeUsuario}**! 👋\n\nComo posso ajudar você no **HUBI** hoje?\n\n• **Vendas & PDV**: Registro rápido com Dinheiro, Pix, Cartão ou Fiado.\n• **Gestão de Pedidos**: Acompanhe o fluxo de produção e clique em *Concluir Venda* para registrar no Histórico de Vendas.\n• **Impressão de Recibos**: Suporte a impressoras térmicas (58/80mm), Bluetooth e folhas A4.\n• **Estoque com Grade**: Cadastro de variações (cores e tamanhos) e preços de atacado.\n• **Relatórios**: Exportação de planilhas completas em Excel/CSV.\n\nQual operação você gostaria de realizar agora?`;
};
