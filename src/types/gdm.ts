import { TipoItem, TipoUnidade } from '../types';

/**
 * Contratos GDM (Global Data Model / Arquitetura de Dados Mestres)
 * Padronização canônica de entidades e contratos compartilhados do HUBI
 */

export interface GdmVariacaoCanonica {
  sku?: string | null;
  codigo_barras?: string | null;
  valor_variacao_1: string;
  valor_variacao_2?: string | null;
  preco_custo_referencia?: number | null;
  preco_venda_sugerido: number;
  preco_venda_atacado?: number | null;
  preco_venda_autoatacado?: number | null;
}

export interface GdmProdutoCanonico {
  codigo_interno?: string | null;
  codigo_barras?: string | null;
  nome: string;
  tipo_item: TipoItem;
  tipo_unidade: TipoUnidade;
  descricao?: string | null;
  fotos_urls: string[];
  categoria_nome?: string | null;
  preco_custo_referencia: number;
  preco_venda_sugerido: number;
  preco_venda_atacado?: number | null;
  qtd_minima_atacado?: number | null;
  preco_venda_autoatacado?: number | null;
  qtd_minima_autoatacado?: number | null;
  tem_variacoes: boolean;
  rotulo_variacao_1?: string | null;
  rotulo_variacao_2?: string | null;
  variacoes?: GdmVariacaoCanonica[];
}

export interface GdmSincronizacaoCatalogoOpcoes {
  organizacaoId: string;
  lojaOrigemId: string;
  lojaDestinoId: string;
  copiarPrecos?: boolean;
  copiarEstoqueZerado?: boolean;
  copiarCategorias?: boolean;
}

export interface GdmResultadoSincronizacao {
  sucesso: boolean;
  totalCategoriasClonadas: number;
  totalProdutosClonados: number;
  totalVariacoesClonadas: number;
  erros: string[];
  tempoExecucaoMs: number;
}
