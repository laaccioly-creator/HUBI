/**
 * HUBI - Serviço de Exportação de Feeds de Parceiros & Relatórios
 * Facebook/Instagram Shopping XML, Google Merchant Center Feed e Exportador CSV/Excel
 */

import { Loja, Produto, Pedido, Cliente } from '../types';

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
    return this.gerarGoogleMerchantXml(loja, produtos); // Padrão RSS 2.0 Google é 100% suportado pelo Meta Commerce Manager
  }

  /**
   * Exporta Relatórios para arquivo CSV formatado em UTF-8 com BOM (compatível com Excel)
   */
  exportarCsvRelatorio(tipo: 'vendas' | 'produtos' | 'clientes', dados: any[]): void {
    let colunas: string[] = [];
    let linhas: string[] = [];

    if (tipo === 'vendas') {
      colunas = ['Nº Pedido', 'Data', 'Origem', 'Status', 'Cliente', 'Subtotal', 'Frete', 'Desconto', 'Total (R$)', 'Saldo Devedor (Fiado)'];
      linhas = dados.map((p: Pedido) => [
        p.numero_pedido,
        p.data_venda ? new Date(p.data_venda).toLocaleDateString('pt-BR') : '',
        p.origem,
        p.status,
        p.cliente?.nome || 'Cliente Balcão',
        Number(p.subtotal || 0).toFixed(2),
        Number(p.valor_frete || 0).toFixed(2),
        Number(p.valor_desconto || 0).toFixed(2),
        Number(p.valor_total || 0).toFixed(2),
        Number(p.saldo_devedor || 0).toFixed(2)
      ].map(this.formatarCampoCsv).join(';'));
    } else if (tipo === 'produtos') {
      colunas = ['Código', 'Nome', 'Unidade', 'Preço Custo', 'Preço Varejo', 'Preço Atacado', 'Estoque Atual', 'Status'];
      linhas = dados.map((p: Produto) => [
        p.codigo_interno || p.codigo_barras || '',
        p.nome,
        p.tipo_unidade || 'un',
        Number(p.preco_custo || 0).toFixed(2),
        Number(p.preco_venda_varejo || 0).toFixed(2),
        p.preco_venda_atacado ? Number(p.preco_venda_atacado).toFixed(2) : '',
        Number(p.quantidade_estoque || 0),
        p.ativo ? 'Ativo' : 'Inativo'
      ].map(this.formatarCampoCsv).join(';'));
    } else if (tipo === 'clientes') {
      colunas = ['Nome', 'WhatsApp', 'Telefone', 'Email', 'Documento', 'Cidade', 'Saldo Devedor Fiado (R$)', 'Limite de Crédito'];
      linhas = dados.map((c: Cliente) => [
        c.nome,
        c.whatsapp || '',
        c.telefone || c.telefone2 || '',
        c.email || '',
        c.numero_documento || '',
        c.endereco_cidade || '',
        Number(c.saldo_devedor_fiado || 0).toFixed(2),
        Number(c.limite_credito || 0).toFixed(2)
      ].map(this.formatarCampoCsv).join(';'));
    }

    const csvContent = '\uFEFF' + [colunas.join(';'), ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_${tipo}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private formatarCampoCsv(valor: any): string {
    if (valor === null || valor === undefined) return '""';
    const str = String(valor).replace(/"/g, '""');
    return `"${str}"`;
  }
}

export const feedExportService = new FeedExportService();
