/**
 * HUBI - Serviço de Exportação de Feeds de Parceiros & Relatórios
 * Padrão oficial HUBI (Sales, Products, Customers) e Feeds XML
 */

import { Loja, Produto, Pedido, Cliente, ItemPedido } from '../types';

class FeedExportService {
  /**
   * Gera Feed XML no padrão Google Merchant Center (Google Shopping)
   */
  gerarGoogleMerchantXml(loja: Loja, produtos: Produto[]): string {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://hubi.app';
    const catalogoUrl = `${baseUrl}/catalog/${loja.slug_catalogo || loja.id}`;

    const itemsXml = produtos
      .filter(p => p.ativo && p.exibir_catalogo)
      .map(p => {
        const preco = Number(p.promocao_ativa && p.preco_promocional ? p.preco_promocional : p.preco_venda_varejo).toFixed(2);
        const foto = p.fotos_urls?.[0] || '';
        const estoque = Number(p.quantidade_estoque || 0) > 0 ? 'in stock' : 'out of stock';

        return `    <item>
      <g:id>${p.id}</g:id>
      <g:title><![CDATA[${p.nome}]]></g:title>
      <g:description><![CDATA[${p.descricao || p.nome}]]></g:description>
      <g:link>${catalogoUrl}</g:link>
      <g:image_link>${foto}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>${estoque}</g:availability>
      <g:price>${preco} BRL</g:price>
      <g:brand><![CDATA[${loja.nome_fantasia}]]></g:brand>
      ${p.codigo_barras ? `<g:gtin>${p.codigo_barras}</g:gtin>` : ''}
      ${p.codigo_interno ? `<g:mpn>${p.codigo_interno}</g:mpn>` : ''}
    </item>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title><![CDATA[${loja.nome_fantasia} - Google Shopping]]></title>
    <link>${catalogoUrl}</link>
    <description><![CDATA[Feed de produtos da loja ${loja.nome_fantasia}]]></description>
${itemsXml}
  </channel>
</rss>`;
  }

  /**
   * Gera Feed XML no padrão Facebook & Instagram Shopping
   */
  gerarFacebookCatalogXml(loja: Loja, produtos: Produto[]): string {
    return this.gerarGoogleMerchantXml(loja, produtos);
  }

  /**
   * Formata Data/Hora no padrão DD/MM/YYYY HH:mm
   */
  private formatarDataHora(dataIso?: string | null): string {
    if (!dataIso) return '';
    try {
      const d = new Date(dataIso);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      const hora = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${dia}/${mes}/${ano} ${hora}:${min}`;
    } catch {
      return '';
    }
  }

  /**
   * Formata Data simples DD/MM/YYYY
   */
  private formatarDataSimples(dataIso?: string | null): string {
    if (!dataIso) return '';
    try {
      const d = new Date(dataIso);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      return `${dia}/${mes}/${ano}`;
    } catch {
      return '';
    }
  }

  /**
   * Exporta Relatórios para arquivo CSV formatado exatamente no padrão oficial HUBI
   */
  exportarCsvRelatorio(tipo: 'vendas' | 'produtos' | 'clientes', dados: any[], dataInicio?: string, dataFim?: string): void {
    let colunas: string[] = [];
    let linhas: string[] = [];
    let nomeArquivo = '';

    const dInicioStr = dataInicio ? dataInicio.replace(/-/g, '') : '20260101';
    const dFimStr = dataFim ? dataFim.replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');

    if (tipo === 'vendas') {
      nomeArquivo = `Sales_${dInicioStr}_${dFimStr}.csv`;
      colunas = [
        'Número',
        'Status',
        'Data/Hora',
        'Quantidade',
        'Total de itens',
        'Descri. itens',
        'Subtotal',
        'Desconto',
        'Taxa',
        'Entrega',
        'Total',
        'Lucro',
        'Meios de Pagamento',
        'Cliente',
        'Vendedor',
        'Observação'
      ];

      linhas = dados.map((p: any) => {
        const itens = Array.isArray(p.itens) ? p.itens : [];
        const qtdDistintos = itens.length;
        const totalQtdItens = itens.reduce((acc: number, i: any) => acc + Number(i.quantidade || 0), 0);
        
        const descriItens = itens
          .map((i: any) => `${i.quantidade}x${i.nome_produto || i.produto?.nome || 'Item'}`)
          .join(', ');

        const subtotal = Number(p.subtotal || p.valor_total || 0);
        const desconto = Number(p.valor_desconto || 0);
        const taxa = Number(p.taxa_servico || 0);
        const entrega = Number(p.valor_frete || 0);
        const total = Number(p.valor_total || 0);
        
        // Lucro estimado = Total de Venda - Custo Total dos Itens
        const custoTotalItens = itens.reduce(
          (acc: number, i: any) => acc + (Number(i.preco_custo_unitario || i.produto?.preco_custo || 0) * Number(i.quantidade || 1)),
          0
        );
        const lucro = Math.max(0, total - custoTotalItens);

        const statusTexto = p.status === 'pendente'
          ? (String(p.origem).includes('catalogo') ? 'Pedido Pendente' : 'pendente')
          : p.status === 'pago' || p.status === 'concluido'
          ? 'Pago'
          : p.status;

        const numFormatado = `${p.numero_pedido}-${String(p.origem).includes('catalogo') ? 'c' : '1'}`;
        const meioPag = p.forma_pagamento?.nome || (p.pagamentos?.[0]?.forma_pagamento?.nome) || 'Pix';
        const vendedor = String(p.origem).includes('catalogo') ? 'catalog' : 'Luiz Augusto';

        return [
          this.formatarCampoCsv(numFormatado),
          this.formatarCampoCsv(statusTexto),
          this.formatarCampoCsv(this.formatarDataHora(p.data_venda || p.criado_em)),
          qtdDistintos,
          totalQtdItens,
          this.formatarCampoCsv(descriItens),
          this.formatarCampoCsv(Number(subtotal).toFixed(2).replace('.', ',')),
          this.formatarCampoCsv(Number(desconto).toFixed(2).replace('.', ',')),
          this.formatarCampoCsv(Number(taxa).toFixed(2).replace('.', ',')),
          this.formatarCampoCsv(Number(entrega).toFixed(2).replace('.', ',')),
          this.formatarCampoCsv(Number(total).toFixed(2).replace('.', ',')),
          this.formatarCampoCsv(Number(lucro).toFixed(2).replace('.', ',')),
          this.formatarCampoCsv(meioPag),
          this.formatarCampoCsv(p.cliente?.nome || ''),
          this.formatarCampoCsv(vendedor),
          this.formatarCampoCsv(p.observacoes || '')
        ].join(';');
      });
    } else if (tipo === 'produtos') {
      nomeArquivo = `Products_${dInicioStr}_${dFimStr}.csv`;
      colunas = [
        'Código',
        'Nome',
        'Categoria',
        'Unit / Frac.',
        'Estoque Atual',
        'Estoque Minimo',
        'Preço de Custo',
        'Preço de Venda',
        'Valor Estoque Atual',
        'Custo Estoque Atual',
        'Valor vendido',
        'Quantidade vendida',
        'Lucro'
      ];

      linhas = dados.map((p: any) => {
        const estAtual = p.quantidade_estoque !== null && p.quantidade_estoque !== undefined ? String(p.quantidade_estoque).replace('.', ',') : '';
        const estMin = p.estoque_minimo ? String(p.estoque_minimo).replace('.', ',') : '0';
        const pCusto = Number(p.preco_custo || 0).toFixed(2).replace('.', ',');
        const pVenda = Number(p.preco_venda_varejo || 0).toFixed(2).replace('.', ',');
        
        const valorEstoque = p.quantidade_estoque ? (Number(p.quantidade_estoque) * Number(p.preco_venda_varejo || 0)).toFixed(2).replace('.', ',') : '';
        const custoEstoque = p.quantidade_estoque ? (Number(p.quantidade_estoque) * Number(p.preco_custo || 0)).toFixed(2).replace('.', ',') : '';

        return [
          this.formatarCampoCsv(p.codigo_interno || p.codigo_barras || ''),
          this.formatarCampoCsv(p.nome),
          this.formatarCampoCsv(p.categoria?.nome || 'COSMETICOS'),
          this.formatarCampoCsv(p.tipo_unidade === 'kg' ? 'fracao' : 'unidade'),
          this.formatarCampoCsv(estAtual),
          this.formatarCampoCsv(estMin),
          this.formatarCampoCsv(pCusto),
          this.formatarCampoCsv(pVenda),
          this.formatarCampoCsv(valorEstoque),
          this.formatarCampoCsv(custoEstoque),
          '0,00',
          0,
          '0,00'
        ].join(';');
      });
    } else if (tipo === 'clientes') {
      nomeArquivo = `Customers_${dInicioStr}_${dFimStr}.csv`;
      colunas = [
        'Nome',
        'Telefone',
        'Endereço',
        'Complemento',
        'Email',
        'Telefone 2',
        'N° Doc.',
        'Observações',
        'Valor de Vendas',
        'Quantidade vendas',
        'Data Criação'
      ];

      linhas = dados.map((c: any) => {
        return [
          this.formatarCampoCsv(c.nome),
          this.formatarCampoCsv(c.whatsapp || c.telefone || ''),
          this.formatarCampoCsv(c.endereco_logradouro ? `${c.endereco_logradouro}${c.endereco_numero ? `, ${c.endereco_numero}` : ''}` : ''),
          this.formatarCampoCsv(c.endereco_complemento || c.endereco_bairro || ''),
          this.formatarCampoCsv(c.email || ''),
          this.formatarCampoCsv(c.telefone2 || c.telefone || ''),
          this.formatarCampoCsv(c.numero_documento || ''),
          this.formatarCampoCsv(c.observacoes || ''),
          this.formatarCampoCsv(Number(c.saldo_devedor_fiado || 0).toFixed(2).replace('.', ',')),
          c.total_pedidos ? c.total_pedidos : '',
          this.formatarCampoCsv(this.formatarDataSimples(c.criado_em))
        ].join(';');
      });
    }

    const csvHeader = colunas.map(c => `"${c}"`).join(';');
    const csvContent = '\uFEFF' + [csvHeader, ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', nomeArquivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private formatarCampoCsv(valor: any): string {
    if (valor === null || valor === undefined || valor === '') return '""';
    const str = String(valor).replace(/"/g, '""');
    return `"${str}"`;
  }
}

export const feedExportService = new FeedExportService();
