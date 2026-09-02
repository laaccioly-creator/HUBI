import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Pedido, Cliente, Produto, FormaPagamento, StatusPedido, OrigemVenda } from '../types';

export interface ItemPedidoImportacao {
  linha: number;
  identificadorProduto: string;
  produtoEncontrado?: Produto;
  nomeProduto: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  observacoes?: string;
  erro?: string;
}

export interface PedidoAgrupadoImportacao {
  chaveAgrupamento: string;
  numeroPedidoOriginal?: number;
  dataVenda: string;
  identificadorCliente?: string;
  clienteEncontrado?: Cliente;
  status: StatusPedido;
  nomeFormaPagamento?: string;
  formaPagamentoEncontrada?: FormaPagamento;
  desconto: number;
  frete: number;
  observacoes?: string;
  itens: ItemPedidoImportacao[];
  subtotal: number;
  total: number;
  statusAcao: 'VALIDO' | 'ERRO';
  mensagensErro: string[];
}

export interface ResultadoParsePedidoImportacao {
  totalLinhasLidas: number;
  pedidosValidos: PedidoAgrupadoImportacao[];
  pedidosComErro: PedidoAgrupadoImportacao[];
  totalItensValidos: number;
  valorTotalGeral: number;
}

export interface RelatorioResultadoPedidoImportacao {
  sucesso: boolean;
  totalPedidosCriados: number;
  totalItensCriados: number;
  erros: string[];
}

const LINHAS_EXEMPLO_PEDIDOS = [
  {
    'Número do Pedido': 1001,
    'Data da Venda (DD/MM/AAAA HH:MM)': '02/09/2026 14:30',
    'Cliente (Nome, Telefone ou CPF)': 'Maria da Silva Oliveira',
    'Código ou Nome do Produto *': 'Refrigerante Cola 2L',
    'Quantidade *': 2,
    'Preço Unitário (R$) *': 8.50,
    'Desconto do Pedido (R$)': 0.00,
    'Taxa / Frete (R$)': 5.00,
    'Status (PAGO/PENDENTE/CONCLUIDO)': 'PAGO',
    'Forma de Pagamento (Pix, Dinheiro, Cartão, Fiado)': 'Pix',
    'Observações': 'Entregar na portaria'
  },
  {
    'Número do Pedido': 1001,
    'Data da Venda (DD/MM/AAAA HH:MM)': '02/09/2026 14:30',
    'Cliente (Nome, Telefone ou CPF)': 'Maria da Silva Oliveira',
    'Código ou Nome do Produto *': 'Arroz Branco Tipo 1 5kg',
    'Quantidade *': 1,
    'Preço Unitário (R$) *': 27.90,
    'Desconto do Pedido (R$)': 0.00,
    'Taxa / Frete (R$)': 5.00,
    'Status (PAGO/PENDENTE/CONCLUIDO)': 'PAGO',
    'Forma de Pagamento (Pix, Dinheiro, Cartão, Fiado)': 'Pix',
    'Observações': 'Entregar na portaria'
  },
  {
    'Número do Pedido': 1002,
    'Data da Venda (DD/MM/AAAA HH:MM)': '02/09/2026 16:15',
    'Cliente (Nome, Telefone ou CPF)': 'João Pedro Santos',
    'Código ou Nome do Produto *': 'Arroz Branco Tipo 1 5kg',
    'Quantidade *': 5,
    'Preço Unitário (R$) *': 25.50,
    'Desconto do Pedido (R$)': 10.00,
    'Taxa / Frete (R$)': 0.00,
    'Status (PAGO/PENDENTE/CONCLUIDO)': 'PENDENTE',
    'Forma de Pagamento (Pix, Dinheiro, Cartão, Fiado)': 'Fiado',
    'Observações': 'Faturado para 30 dias'
  }
];

export const orderImportExportService = {
  downloadModeloXLSX() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(LINHAS_EXEMPLO_PEDIDOS);

    ws['!cols'] = [
      { wch: 18 }, // Número do Pedido
      { wch: 32 }, // Data da Venda
      { wch: 35 }, // Cliente
      { wch: 35 }, // Código ou Nome do Produto
      { wch: 14 }, // Quantidade
      { wch: 22 }, // Preço Unitário
      { wch: 22 }, // Desconto
      { wch: 18 }, // Frete
      { wch: 28 }, // Status
      { wch: 35 }, // Forma de Pagamento
      { wch: 30 }  // Observações
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Modelo_Pedidos');
    XLSX.writeFile(wb, 'HUBI_Modelo_Importacao_Pedidos.xlsx');
  },

  downloadModeloCSV() {
    const colunas = Object.keys(LINHAS_EXEMPLO_PEDIDOS[0]);
    const cabecalhos = colunas.join(';');

    const linhas = LINHAS_EXEMPLO_PEDIDOS.map(item => {
      return [
        item['Número do Pedido'],
        `"${item['Data da Venda (DD/MM/AAAA HH:MM)']}"`,
        `"${item['Cliente (Nome, Telefone ou CPF)']}"`,
        `"${item['Código ou Nome do Produto *']}"`,
        item['Quantidade *'],
        item['Preço Unitário (R$) *'].toFixed(2),
        item['Desconto do Pedido (R$)'].toFixed(2),
        item['Taxa / Frete (R$)'].toFixed(2),
        `"${item['Status (PAGO/PENDENTE/CONCLUIDO)']}"`,
        `"${item['Forma de Pagamento (Pix, Dinheiro, Cartão, Fiado)']}"`,
        `"${item['Observações']}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [cabecalhos, ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'HUBI_Modelo_Importacao_Pedidos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  async processarArquivo(
    arquivo: File,
    clientesExistentes: Cliente[],
    produtosExistentes: Produto[],
    formasPagamentoExistentes: FormaPagamento[]
  ): Promise<ResultadoParsePedidoImportacao> {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();

      leitor.onload = (e) => {
        try {
          const dados = e.target?.result;
          if (!dados) throw new Error('Arquivo vazio ou ilegível');

          const workbook = XLSX.read(dados, { type: 'binary', cellDates: true });
          const primeiroNomeSheet = workbook.SheetNames[0];
          if (!primeiroNomeSheet) throw new Error('Planilha sem abas válidas');

          const worksheet = workbook.Sheets[primeiroNomeSheet];
          const linhasBrutas: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

          if (!linhasBrutas || linhasBrutas.length === 0) {
            throw new Error('Nenhuma linha de dados encontrada na planilha');
          }

          // Dicionários para busca rápida
          const limparDigitos = (v?: string | null) => (v ? v.replace(/\D/g, '') : '');

          const mapaClientesPorDoc = new Map<string, Cliente>();
          const mapaClientesPorTel = new Map<string, Cliente>();
          const mapaClientesPorNome = new Map<string, Cliente>();

          clientesExistentes.forEach(c => {
            const doc = limparDigitos(c.numero_documento);
            if (doc) mapaClientesPorDoc.set(doc, c);

            const tel = limparDigitos(c.telefone);
            if (tel) mapaClientesPorTel.set(tel, c);

            const zap = limparDigitos(c.whatsapp);
            if (zap) mapaClientesPorTel.set(zap, c);

            const nome = c.nome.trim().toLowerCase();
            if (nome) mapaClientesPorNome.set(nome, c);
          });

          const mapaProdutosPorBarras = new Map<string, Produto>();
          const mapaProdutosPorSku = new Map<string, Produto>();
          const mapaProdutosPorNome = new Map<string, Produto>();

          produtosExistentes.forEach(p => {
            if (p.codigo_barras) mapaProdutosPorBarras.set(p.codigo_barras.trim().toLowerCase(), p);
            if (p.codigo_interno) mapaProdutosPorSku.set(p.codigo_interno.trim().toLowerCase(), p);
            if (p.nome) mapaProdutosPorNome.set(p.nome.trim().toLowerCase(), p);
          });

          const mapaFormasPagamento = new Map<string, FormaPagamento>();
          formasPagamentoExistentes.forEach(fp => {
            mapaFormasPagamento.set(fp.nome.trim().toLowerCase(), fp);
            mapaFormasPagamento.set(fp.tipo.trim().toLowerCase(), fp);
          });

          // Agrupamento de linhas por pedido
          const pedidosMap = new Map<string, PedidoAgrupadoImportacao>();

          linhasBrutas.forEach((linhaRaw, index) => {
            const numLinha = index + 2;

            const numeroPedidoRaw = this.obterValor(linhaRaw, ['número do pedido', 'numero do pedido', 'pedido', 'numero', 'n° pedido']);
            const dataVendaRaw = this.obterValor(linhaRaw, ['data da venda (dd/mm/aaaa hh:mm)', 'data da venda', 'data/hora', 'data', 'data venda']);
            const clienteRaw = this.obterValor(linhaRaw, ['cliente (nome, telefone ou cpf)', 'cliente', 'nome do cliente', 'destinatario']);
            const produtoRaw = this.obterValor(linhaRaw, ['código ou nome do produto *', 'codigo ou nome do produto', 'produto', 'item', 'nome produto']);
            const qtdRaw = this.obterValor(linhaRaw, ['quantidade *', 'quantidade', 'qtd', 'quant']);
            const precoUnitRaw = this.obterValor(linhaRaw, ['preço unitário (r$) *', 'preco unitario (r$)', 'preço unitário', 'preco unitario', 'valor unitario']);
            const descontoRaw = this.obterValor(linhaRaw, ['desconto do pedido (r$)', 'desconto (r$)', 'desconto', 'desc']);
            const freteRaw = this.obterValor(linhaRaw, ['taxa / frete (r$)', 'frete (r$)', 'frete', 'taxa', 'entrega']);
            const statusRaw = this.obterValor(linhaRaw, ['status (pago/pendente/concluido)', 'status', 'situacao']);
            const formaPagRaw = this.obterValor(linhaRaw, ['forma de pagamento (pix, dinheiro, cartão, fiado)', 'forma de pagamento', 'meio de pagamento', 'pagamento']);
            const obsRaw = this.obterValor(linhaRaw, ['observações', 'observacoes', 'obs']);

            // Chave de agrupamento do pedido:
            // Usa número do pedido se existir, ou combina cliente + data aproximada, ou gera chave por linha
            let chavePedido = '';
            let numPedidoNumero: number | undefined = undefined;
            if (numeroPedidoRaw && !isNaN(parseInt(numeroPedidoRaw, 10))) {
              numPedidoNumero = parseInt(numeroPedidoRaw, 10);
              chavePedido = `NUM_${numPedidoNumero}`;
            } else if (clienteRaw && dataVendaRaw) {
              chavePedido = `CLI_${clienteRaw.trim().toLowerCase()}_${dataVendaRaw.trim()}`;
            } else {
              chavePedido = `LINHA_${numLinha}`;
            }

            // Localizar produto
            let produtoEncontrado: Produto | undefined = undefined;
            if (produtoRaw) {
              const pBusca = produtoRaw.trim().toLowerCase();
              produtoEncontrado = mapaProdutosPorBarras.get(pBusca) || mapaProdutosPorSku.get(pBusca) || mapaProdutosPorNome.get(pBusca);

              // Busca flexível por aproximação no nome se não encontrou exato
              if (!produtoEncontrado) {
                produtoEncontrado = produtosExistentes.find(p => p.nome.toLowerCase().includes(pBusca) || pBusca.includes(p.nome.toLowerCase()));
              }
            }

            const quantidade = Math.max(0.001, this.converterNumero(qtdRaw) || 1);
            const precoUnit = this.converterNumero(precoUnitRaw) || (produtoEncontrado ? Number(produtoEncontrado.preco_venda_varejo) : 0);
            const subtotalItem = Number((quantidade * precoUnit).toFixed(2));

            const itemErro = !produtoRaw || !produtoRaw.trim()
              ? 'Nome ou código do produto não informado.'
              : !produtoEncontrado
              ? `Produto "${produtoRaw}" não encontrado na base de produtos da loja.`
              : precoUnit <= 0
              ? 'Preço unitário do item deve ser maior que zero.'
              : undefined;

            const item: ItemPedidoImportacao = {
              linha: numLinha,
              identificadorProduto: produtoRaw || '(Em branco)',
              produtoEncontrado,
              nomeProduto: produtoEncontrado ? produtoEncontrado.nome : (produtoRaw || 'Item desconhecido'),
              quantidade,
              precoUnitario: precoUnit,
              subtotal: subtotalItem,
              observacoes: obsRaw,
              erro: itemErro
            };

            // Se pedido ainda não existe no mapa, inicializa
            if (!pedidosMap.has(chavePedido)) {
              // Localizar cliente
              let clienteEncontrado: Cliente | undefined = undefined;
              if (clienteRaw) {
                const cBuscaDoc = limparDigitos(clienteRaw);
                const cBuscaNome = clienteRaw.trim().toLowerCase();
                if (cBuscaDoc && mapaClientesPorDoc.has(cBuscaDoc)) {
                  clienteEncontrado = mapaClientesPorDoc.get(cBuscaDoc);
                } else if (cBuscaDoc && mapaClientesPorTel.has(cBuscaDoc)) {
                  clienteEncontrado = mapaClientesPorTel.get(cBuscaDoc);
                } else if (mapaClientesPorNome.has(cBuscaNome)) {
                  clienteEncontrado = mapaClientesPorNome.get(cBuscaNome);
                } else {
                  clienteEncontrado = clientesExistentes.find(c => c.nome.toLowerCase().includes(cBuscaNome));
                }
              }

              // Normalizar status
              let statusPedido: StatusPedido = 'concluido';
              if (statusRaw) {
                const sLow = statusRaw.toLowerCase();
                if (sLow.includes('pendente')) statusPedido = 'pendente';
                else if (sLow.includes('cancel')) statusPedido = 'cancelado';
                else if (sLow.includes('exped')) statusPedido = 'em_expedicao';
                else if (sLow.includes('separ')) statusPedido = 'em_separacao';
                else if (sLow.includes('entrega')) statusPedido = 'saiu_para_entrega';
                else if (sLow.includes('retirar')) statusPedido = 'pronto_para_retirar';
                else if (sLow.includes('pago') || sLow.includes('concluid') || sLow.includes('entregue')) statusPedido = 'concluido';
              }

              // Localizar forma de pagamento
              let formaPagamentoEncontrada: FormaPagamento | undefined = undefined;
              if (formaPagRaw) {
                const fpBusca = formaPagRaw.trim().toLowerCase();
                formaPagamentoEncontrada = mapaFormasPagamento.get(fpBusca) || formasPagamentoExistentes.find(f => f.nome.toLowerCase().includes(fpBusca));
              }

              const dataIso = this.formatarDataIsoComHora(dataVendaRaw) || new Date().toISOString();
              const desconto = this.converterNumero(descontoRaw);
              const frete = this.converterNumero(freteRaw);

              pedidosMap.set(chavePedido, {
                chaveAgrupamento: chavePedido,
                numeroPedidoOriginal: numPedidoNumero,
                dataVenda: dataIso,
                identificadorCliente: clienteRaw,
                clienteEncontrado,
                status: statusPedido,
                nomeFormaPagamento: formaPagRaw,
                formaPagamentoEncontrada,
                desconto,
                frete,
                observacoes: obsRaw,
                itens: [item],
                subtotal: subtotalItem,
                total: Math.max(0, subtotalItem - desconto + frete),
                statusAcao: 'VALIDO',
                mensagensErro: []
              });
            } else {
              // Adiciona item ao pedido já existente no mapa
              const pedidoExistente = pedidosMap.get(chavePedido)!;
              pedidoExistente.itens.push(item);
              pedidoExistente.subtotal = Number((pedidoExistente.subtotal + subtotalItem).toFixed(2));
              pedidoExistente.total = Number(Math.max(0, pedidoExistente.subtotal - pedidoExistente.desconto + pedidoExistente.frete).toFixed(2));
            }
          });

          // Validação final de cada pedido agrupado
          const pedidosValidos: PedidoAgrupadoImportacao[] = [];
          const pedidosComErro: PedidoAgrupadoImportacao[] = [];
          let totalItensValidos = 0;
          let valorTotalGeral = 0;

          pedidosMap.forEach(p => {
            const erros: string[] = [];

            if (p.itens.length === 0) {
              erros.push('Nenhum item válido informado no pedido.');
            }

            p.itens.forEach(it => {
              if (it.erro) erros.push(`Item "${it.identificadorProduto}": ${it.erro}`);
            });

            if (p.identificadorCliente && !p.clienteEncontrado) {
              erros.push(`Cliente "${p.identificadorCliente}" não foi encontrado no cadastro de clientes.`);
            }

            if (erros.length > 0) {
              p.statusAcao = 'ERRO';
              p.mensagensErro = erros;
              pedidosComErro.push(p);
            } else {
              p.statusAcao = 'VALIDO';
              pedidosValidos.push(p);
              totalItensValidos += p.itens.length;
              valorTotalGeral += p.total;
            }
          });

          resolve({
            totalLinhasLidas: linhasBrutas.length,
            pedidosValidos,
            pedidosComErro,
            totalItensValidos,
            valorTotalGeral: Number(valorTotalGeral.toFixed(2))
          });
        } catch (err) {
          reject(err);
        }
      };

      leitor.onerror = () => reject(new Error('Falha ao ler o arquivo de pedidos.'));
      leitor.readAsBinaryString(arquivo);
    });
  },

  async executarImportacao(
    lojaId: string,
    pedidos: PedidoAgrupadoImportacao[],
    onProgresso?: (porcentagem: number, texto: string) => void
  ): Promise<RelatorioResultadoPedidoImportacao> {
    let totalPedidosCriados = 0;
    let totalItensCriados = 0;
    const erros: string[] = [];

    const total = pedidos.length;

    for (let i = 0; i < total; i++) {
      const p = pedidos[i];
      const progresso = Math.round(((i + 1) / total) * 100);
      if (onProgresso) {
        onProgresso(progresso, `Importando pedido ${i + 1} de ${total}...`);
      }

      try {
        const payloadPedido: any = {
          loja_id: lojaId,
          cliente_id: p.clienteEncontrado?.id || null,
          origem: 'pdv_desktop' as OrigemVenda,
          tabela_preco_aplicada: p.clienteEncontrado?.tabela_preco_padrao || 'varejo',
          status: p.status,
          subtotal: p.subtotal,
          valor_desconto: p.desconto,
          valor_frete: p.frete,
          valor_total: p.total,
          valor_pago: p.status === 'concluido' ? p.total : 0,
          saldo_devedor: p.status === 'concluido' ? 0 : p.total,
          fiado_quitado: p.status === 'concluido',
          observacoes: p.observacoes || null,
          data_venda: p.dataVenda
        };

        const { data: pedidoCriado, error: erroPedido } = await supabase
          .from('pedidos')
          .insert([payloadPedido])
          .select()
          .single();

        if (erroPedido || !pedidoCriado) {
          throw new Error(erroPedido?.message || 'Falha ao gravar pedido no banco');
        }

        // Itens do Pedido
        const itensPayload = p.itens.map(it => ({
          loja_id: lojaId,
          pedido_id: pedidoCriado.id,
          produto_id: it.produtoEncontrado!.id,
          tabela_preco_utilizada: p.clienteEncontrado?.tabela_preco_padrao || 'varejo',
          nome_produto: it.nomeProduto,
          preco_custo_unitario: Number(it.produtoEncontrado?.preco_custo || 0),
          preco_venda_unitario: it.precoUnitario,
          quantidade: it.quantidade,
          subtotal: it.subtotal,
          observacoes: it.observacoes || null
        }));

        const { error: erroItens } = await supabase
          .from('itens_pedido')
          .insert(itensPayload);

        if (erroItens) {
          throw new Error(`Pedido criado, mas erro ao gravar itens: ${erroItens.message}`);
        }

        // Pagamento se houver forma de pagamento associada
        if (p.formaPagamentoEncontrada?.id && p.status === 'concluido') {
          try {
            await supabase.from('pagamentos_pedido').insert([{
              loja_id: lojaId,
              pedido_id: pedidoCriado.id,
              forma_pagamento_id: p.formaPagamentoEncontrada.id,
              valor: p.total,
              parcelas: 1,
              valor_taxa: 0,
              valor_liquido: p.total,
              data_pagamento: p.dataVenda,
              eh_pagamento_fiado: p.formaPagamentoEncontrada.tipo === 'fiado'
            }]);
          } catch {
            // Ignora erro não crítico de histórico de pagamento
          }
        }

        totalPedidosCriados++;
        totalItensCriados += p.itens.length;
      } catch (err: any) {
        erros.push(`Pedido ${p.numeroPedidoOriginal || i + 1}: ${err.message}`);
      }
    }

    return {
      sucesso: erros.length === 0,
      totalPedidosCriados,
      totalItensCriados,
      erros
    };
  },

  exportarPedidosXLSX(pedidos: any[], nomeLoja?: string) {
    const dadosFormatados = pedidos.map(p => {
      const itens = Array.isArray(p.itens) ? p.itens : [];
      const totalQtdItens = itens.reduce((acc: number, i: any) => acc + Number(i.quantidade || 0), 0);
      const descriItens = itens
        .map((i: any) => `${i.quantidade}x ${i.nome_produto || i.produto?.nome || 'Item'}`)
        .join(', ');

      const meioPag = p.forma_pagamento?.nome || (p.pagamentos?.[0]?.forma_pagamento?.nome) || 'Pix';

      return {
        'Número do Pedido': p.numero_pedido || '',
        'Status': (p.status || '').toUpperCase(),
        'Data / Hora': p.data_venda ? new Date(p.data_venda).toLocaleString('pt-BR') : '',
        'Total Itens': totalQtdItens,
        'Itens': descriItens,
        'Subtotal (R$)': Number(p.subtotal || 0),
        'Desconto (R$)': Number(p.valor_desconto || 0),
        'Taxa / Frete (R$)': Number(p.valor_frete || 0),
        'Total (R$)': Number(p.valor_total || 0),
        'Forma de Pagamento': meioPag,
        'Cliente': p.cliente?.nome || '',
        'Documento Cliente': p.cliente?.numero_documento || '',
        'Observações': p.observacoes || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosFormatados);

    ws['!cols'] = [
      { wch: 18 }, // Número
      { wch: 16 }, // Status
      { wch: 22 }, // Data
      { wch: 14 }, // Qtd
      { wch: 45 }, // Descricao Itens
      { wch: 16 }, // Subtotal
      { wch: 16 }, // Desconto
      { wch: 16 }, // Frete
      { wch: 16 }, // Total
      { wch: 22 }, // Forma Pagamento
      { wch: 28 }, // Cliente
      { wch: 20 }, // Documento
      { wch: 30 }  // Observações
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos_Vendas');
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeNomeLoja = (nomeLoja || 'HUBI').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `${safeNomeLoja}_Pedidos_${timestamp}.xlsx`);
  },

  exportarPedidosCSV(pedidos: any[], nomeLoja?: string) {
    const colunas = [
      'Número',
      'Status',
      'Data/Hora',
      'Itens',
      'Subtotal',
      'Desconto',
      'Frete',
      'Total',
      'Forma de Pagamento',
      'Cliente',
      'Documento',
      'Observações'
    ];

    const linhas = pedidos.map(p => {
      const itens = Array.isArray(p.itens) ? p.itens : [];
      const descriItens = itens
        .map((i: any) => `${i.quantidade}x ${i.nome_produto || i.produto?.nome || 'Item'}`)
        .join(', ');
      const meioPag = p.forma_pagamento?.nome || (p.pagamentos?.[0]?.forma_pagamento?.nome) || 'Pix';

      return [
        this.formatarCampoCsv(p.numero_pedido || ''),
        this.formatarCampoCsv((p.status || '').toUpperCase()),
        this.formatarCampoCsv(p.data_venda ? new Date(p.data_venda).toLocaleString('pt-BR') : ''),
        this.formatarCampoCsv(descriItens),
        Number(p.subtotal || 0).toFixed(2).replace('.', ','),
        Number(p.valor_desconto || 0).toFixed(2).replace('.', ','),
        Number(p.valor_frete || 0).toFixed(2).replace('.', ','),
        Number(p.valor_total || 0).toFixed(2).replace('.', ','),
        this.formatarCampoCsv(meioPag),
        this.formatarCampoCsv(p.cliente?.nome || ''),
        this.formatarCampoCsv(p.cliente?.numero_documento || ''),
        this.formatarCampoCsv(p.observacoes || '')
      ].join(';');
    });

    const csvHeader = colunas.map(c => `"${c}"`).join(';');
    const csvContent = '\uFEFF' + [csvHeader, ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeNomeLoja = (nomeLoja || 'HUBI').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeNomeLoja}_Pedidos_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  obterValor(obj: any, chavesPossiveis: string[]): string | undefined {
    const chavesObj = Object.keys(obj);
    for (const cp of chavesPossiveis) {
      const chaveEncontrada = chavesObj.find(k => k.trim().toLowerCase() === cp);
      if (chaveEncontrada && obj[chaveEncontrada] !== undefined && obj[chaveEncontrada] !== null) {
        const v = String(obj[chaveEncontrada]).trim();
        if (v !== '') return v;
      }
    }
    return undefined;
  },

  converterNumero(v?: any): number {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    const str = String(v).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  },

  formatarDataIsoComHora(v?: string): string | undefined {
    if (!v) return undefined;
    const limpo = v.trim();
    // Ex: AAAA-MM-DD ou AAAA-MM-DDTHH:mm:ss
    if (/^\d{4}-\d{2}-\d{2}/.test(limpo)) {
      try {
        return new Date(limpo).toISOString();
      } catch {
        return undefined;
      }
    }

    // Ex: DD/MM/AAAA ou DD/MM/AAAA HH:MM
    const match = limpo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
    if (match) {
      const dia = parseInt(match[1], 10);
      const mes = parseInt(match[2], 10) - 1;
      const ano = parseInt(match[3], 10);
      const hora = match[4] ? parseInt(match[4], 10) : 12;
      const min = match[5] ? parseInt(match[5], 10) : 0;
      const seg = match[6] ? parseInt(match[6], 10) : 0;
      const date = new Date(ano, mes, dia, hora, min, seg);
      return date.toISOString();
    }
    return undefined;
  },

  formatarCampoCsv(valor: any): string {
    if (valor === null || valor === undefined || valor === '') return '""';
    const str = String(valor).replace(/"/g, '""');
    return `"${str}"`;
  }
};
