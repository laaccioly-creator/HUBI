import * as XLSX from 'xlsx';

export interface ItemTransacaoExportacao {
  id?: string;
  tipo?: 'ENTRADA' | 'SAIDA' | string;
  categoria?: string;
  descricao?: string;
  valor: number;
  data?: string;
  status?: string;
  ehRecorrente?: boolean;
  formaPagamento?: string;
}

function formatarDataHoraBR(dataStr?: string): string {
  if (!dataStr) return '';
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return dataStr;
  return d.toLocaleString('pt-BR');
}

function formatarDataBR(dataStr?: string): string {
  if (!dataStr) return '';
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return dataStr;
  return d.toLocaleDateString('pt-BR');
}

function limparDescricao(desc?: string): string {
  if (!desc) return '';
  return desc.replace(/\s*\(entrada manual\)/gi, '').trim();
}

function sanitizarNomeLoja(nomeLoja?: string): string {
  return (nomeLoja || 'HUBI').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function obterTimestamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export const financeExportService = {
  /**
   * Exporta transações de Entradas Gerais para Excel (.xlsx)
   */
  exportarEntradasXLSX(entradas: ItemTransacaoExportacao[], nomeLoja?: string) {
    const dadosFormatados = entradas.map(e => ({
      'Data / Hora': formatarDataHoraBR(e.data),
      'Descrição': limparDescricao(e.descricao) || 'Recebimento',
      'Categoria': e.categoria || 'Venda Balcão / PDV',
      'Forma de Pagamento': e.formaPagamento || 'Não informada',
      'Valor (R$)': Number(e.valor || 0),
      'Status': (e.status || 'Pago').toUpperCase()
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosFormatados);

    ws['!cols'] = [
      { wch: 22 }, // Data / Hora
      { wch: 42 }, // Descrição
      { wch: 26 }, // Categoria
      { wch: 24 }, // Forma de Pagamento
      { wch: 16 }, // Valor (R$)
      { wch: 14 }  // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Entradas_Gerais');
    const safeNomeLoja = sanitizarNomeLoja(nomeLoja);
    const timestamp = obterTimestamp();
    XLSX.writeFile(wb, `${safeNomeLoja}_Entradas_Gerais_${timestamp}.xlsx`);
  },

  /**
   * Exporta transações de Despesas Gerais pagas para Excel (.xlsx)
   */
  exportarDespesasXLSX(despesas: ItemTransacaoExportacao[], nomeLoja?: string) {
    const dadosFormatados = despesas.map(d => ({
      'Data / Vencimento': formatarDataHoraBR(d.data),
      'Descrição': limparDescricao(d.descricao) || 'Despesa',
      'Categoria': d.categoria || 'Despesas Gerais',
      'Forma de Pagamento': d.formaPagamento || 'Não informada',
      'Recorrente': d.ehRecorrente ? 'Sim (Mensal)' : 'Não',
      'Valor (R$)': Number(d.valor || 0),
      'Status': (d.status || 'Pago').toUpperCase()
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosFormatados);

    ws['!cols'] = [
      { wch: 22 }, // Data / Vencimento
      { wch: 42 }, // Descrição
      { wch: 26 }, // Categoria
      { wch: 24 }, // Forma de Pagamento
      { wch: 16 }, // Recorrente
      { wch: 16 }, // Valor (R$)
      { wch: 14 }  // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Despesas_Gerais');
    const safeNomeLoja = sanitizarNomeLoja(nomeLoja);
    const timestamp = obterTimestamp();
    XLSX.writeFile(wb, `${safeNomeLoja}_Despesas_Gerais_${timestamp}.xlsx`);
  },

  /**
   * Exporta Contas a Pagar pendentes para Excel (.xlsx)
   */
  exportarContasPagarXLSX(contasPagar: ItemTransacaoExportacao[], nomeLoja?: string) {
    const dadosFormatados = contasPagar.map(c => ({
      'Data de Vencimento': formatarDataBR(c.data),
      'Descrição': limparDescricao(c.descricao) || 'Conta a Pagar',
      'Categoria': c.categoria || 'Despesas Gerais',
      'Forma de Pagamento': c.formaPagamento || 'A Definir',
      'Recorrente': c.ehRecorrente ? 'Sim (Mensal)' : 'Não',
      'Valor (R$)': Number(c.valor || 0),
      'Status': (c.status || 'Pendente').toUpperCase()
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosFormatados);

    ws['!cols'] = [
      { wch: 20 }, // Data de Vencimento
      { wch: 42 }, // Descrição
      { wch: 26 }, // Categoria
      { wch: 24 }, // Forma de Pagamento
      { wch: 16 }, // Recorrente
      { wch: 16 }, // Valor (R$)
      { wch: 14 }  // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Contas_A_Pagar');
    const safeNomeLoja = sanitizarNomeLoja(nomeLoja);
    const timestamp = obterTimestamp();
    XLSX.writeFile(wb, `${safeNomeLoja}_Contas_A_Pagar_${timestamp}.xlsx`);
  }
};
