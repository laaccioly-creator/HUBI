import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Produto, Categoria } from '../types';

export interface LinhaProdutoImportacao {
  linha: number;
  codigo_barras?: string;
  codigo_interno?: string;
  nome: string;
  categoria?: string;
  descricao?: string;
  tipo_unidade: string;
  preco_venda_varejo: number;
  preco_custo: number;
  preco_venda_atacado?: number;
  preco_venda_autoatacado?: number;
  preco_promocional?: number;
  quantidade_estoque: number;
  estoque_minimo_alerta: number;
  exibir_catalogo: boolean;
  ativo: boolean;
  statusAcao: 'NOVO' | 'ATUALIZAR' | 'ERRO';
  mensagemErro?: string;
  produtoExistenteId?: string;
}

export interface ResultadoParseImportacao {
  totalLinhasLidas: number;
  produtosValidos: LinhaProdutoImportacao[];
  produtosComErro: LinhaProdutoImportacao[];
  novosCadastros: number;
  atualizacoes: number;
  categoriasDetectadas: string[];
}

export interface RelatorioResultadoImportacao {
  sucesso: boolean;
  totalCadastrados: number;
  totalAtualizados: number;
  totalCategoriasCriadas: number;
  erros: string[];
}

// Colunas oficiais do layout padrão
export const COLUNAS_LAYOUT_PRODUTO = [
  { chave: 'codigo_barras', rotulo: 'Código de Barras (EAN)', exemplo: '7891234567890', obrigatorio: false },
  { chave: 'codigo_interno', rotulo: 'Código Interno (SKU)', exemplo: 'PROD-001', obrigatorio: false },
  { chave: 'nome', rotulo: 'Nome do Produto *', exemplo: 'Refrigerante Cola 2L', obrigatorio: true },
  { chave: 'categoria', rotulo: 'Categoria', exemplo: 'Bebidas', obrigatorio: false },
  { chave: 'descricao', rotulo: 'Descrição', exemplo: 'Refrigerante sabor cola garrafa PET 2 Litros', obrigatorio: false },
  { chave: 'tipo_unidade', rotulo: 'Unidade (UN, KG, L, PCT, CX)', exemplo: 'UN', obrigatorio: false },
  { chave: 'preco_venda_varejo', rotulo: 'Preço Venda / Varejo (R$) *', exemplo: '8.50', obrigatorio: true },
  { chave: 'preco_custo', rotulo: 'Preço de Custo (R$)', exemplo: '5.20', obrigatorio: false },
  { chave: 'preco_venda_atacado', rotulo: 'Preço Atacado (R$)', exemplo: '7.80', obrigatorio: false },
  { chave: 'preco_venda_autoatacado', rotulo: 'Preço Distribuidor (R$)', exemplo: '7.20', obrigatorio: false },
  { chave: 'preco_promocional', rotulo: 'Preço Promocional (R$)', exemplo: '7.99', obrigatorio: false },
  { chave: 'quantidade_estoque', rotulo: 'Estoque Atual', exemplo: '50', obrigatorio: false },
  { chave: 'estoque_minimo_alerta', rotulo: 'Estoque Mínimo', exemplo: '10', obrigatorio: false },
  { chave: 'exibir_catalogo', rotulo: 'Exibir no Catálogo (SIM/NAO)', exemplo: 'SIM', obrigatorio: false },
  { chave: 'status', rotulo: 'Status (ATIVO/INATIVO)', exemplo: 'ATIVO', obrigatorio: false }
];

// Exemplos didáticos para a planilha modelo
const LINHAS_EXEMPLO_MODELO = [
  {
    'Código de Barras (EAN)': '7891234567890',
    'Código Interno (SKU)': 'BEB-001',
    'Nome do Produto *': 'Refrigerante Cola 2L',
    'Categoria': 'Bebidas',
    'Descrição': 'Refrigerante sabor cola garrafa PET 2 Litros',
    'Unidade (UN, KG, L, PCT, CX)': 'UN',
    'Preço Venda / Varejo (R$) *': 8.50,
    'Preço de Custo (R$)': 5.20,
    'Preço Atacado (R$)': 7.80,
    'Preço Distribuidor (R$)': 7.20,
    'Preço Promocional (R$)': 7.99,
    'Estoque Atual': 50,
    'Estoque Mínimo': 10,
    'Exibir no Catálogo (SIM/NAO)': 'SIM',
    'Status (ATIVO/INATIVO)': 'ATIVO'
  },
  {
    'Código de Barras (EAN)': '7899876543210',
    'Código Interno (SKU)': 'ALIM-002',
    'Nome do Produto *': 'Arroz Branco Tipo 1 5kg',
    'Categoria': 'Mercearia',
    'Descrição': 'Arroz longo fino tipo 1 pacote 5kg',
    'Unidade (UN, KG, L, PCT, CX)': 'PCT',
    'Preço Venda / Varejo (R$) *': 27.90,
    'Preço de Custo (R$)': 21.00,
    'Preço Atacado (R$)': 25.50,
    'Preço Distribuidor (R$)': 24.00,
    'Preço Promocional (R$)': 26.90,
    'Estoque Atual': 120,
    'Estoque Mínimo': 25,
    'Exibir no Catálogo (SIM/NAO)': 'SIM',
    'Status (ATIVO/INATIVO)': 'ATIVO'
  },
  {
    'Código de Barras (EAN)': '',
    'Código Interno (SKU)': 'LIMP-003',
    'Nome do Produto *': 'Detergente Líquido Neutro 500ml',
    'Categoria': 'Limpeza',
    'Descrição': 'Detergente lava-louças neutro 500ml',
    'Unidade (UN, KG, L, PCT, CX)': 'UN',
    'Preço Venda / Varejo (R$) *': 2.49,
    'Preço de Custo (R$)': 1.40,
    'Preço Atacado (R$)': 2.10,
    'Preço Distribuidor (R$)': 1.90,
    'Preço Promocional (R$)': null,
    'Estoque Atual': 80,
    'Estoque Mínimo': 15,
    'Exibir no Catálogo (SIM/NAO)': 'SIM',
    'Status (ATIVO/INATIVO)': 'ATIVO'
  }
];

/**
 * Extrai o prefixo de 2 letras a partir do nome da categoria.
 * Exemplos:
 *  - "Cosmético" ou "Cosméticos" -> "CO"
 *  - "Brinquedo Erótico" -> "BE"
 *  - "Óleos e Lubrificantes" -> "OL"
 *  - "Lingerie" -> "LI"
 */
export function extrairPrefixoCategoria(categoria?: string | null): string {
  if (!categoria || !categoria.trim()) {
    return 'PR'; // Padrão: PR (Produto)
  }

  // Remove acentos e caracteres não alfanuméricos
  const normalizada = categoria
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  // Conectivos e preposições que não devem ser usados como palavra principal
  const stopWords = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'PARA', 'COM', 'POR', 'NO', 'NA', 'NOS', 'NAS']);

  const palavrasValidas = normalizada
    .split(/[^A-Z0-9]+/)
    .filter(p => p.length > 0 && !stopWords.has(p));

  if (palavrasValidas.length >= 2) {
    // 2 Letras: 1ª letra da 1ª palavra + 1ª letra da 2ª palavra (Ex: BRINQUEDO EROTICO -> BE)
    return (palavrasValidas[0][0] + palavrasValidas[1][0]).toUpperCase();
  }

  if (palavrasValidas.length === 1) {
    const pal = palavrasValidas[0];
    if (pal.length >= 2) {
      // 2 Letras: primeiras duas letras da palavra (Ex: COSMETICO -> CO)
      return pal.substring(0, 2).toUpperCase();
    }
    return (pal + 'X').toUpperCase();
  }

  const todasPalavras = normalizada.split(/[^A-Z0-9]+/).filter(p => p.length > 0);
  if (todasPalavras.length >= 2) {
    return (todasPalavras[0][0] + todasPalavras[1][0]).toUpperCase();
  } else if (todasPalavras.length === 1 && todasPalavras[0].length >= 2) {
    return todasPalavras[0].substring(0, 2).toUpperCase();
  }

  return 'PR';
}

export const productImportExportService = {
  /**
   * Baixa a Planilha Modelo Padrão em formato Excel (.xlsx)
   */
  downloadModeloXLSX() {
    const wb = XLSX.utils.book_new();

    // 1. Aba Produtos (Com exemplos)
    const wsProdutos = XLSX.utils.json_to_sheet(LINHAS_EXEMPLO_MODELO);

    // Ajustar larguras das colunas
    wsProdutos['!cols'] = [
      { wch: 24 }, // Código de Barras
      { wch: 20 }, // SKU
      { wch: 35 }, // Nome
      { wch: 20 }, // Categoria
      { wch: 45 }, // Descrição
      { wch: 28 }, // Unidade
      { wch: 26 }, // Preço Varejo
      { wch: 20 }, // Preço Custo
      { wch: 20 }, // Preço Atacado
      { wch: 24 }, // Preço Distribuidor
      { wch: 22 }, // Preço Promocional
      { wch: 15 }, // Estoque Atual
      { wch: 15 }, // Estoque Mínimo
      { wch: 26 }, // Exibir Catálogo
      { wch: 22 }  // Status
    ];

    XLSX.utils.book_append_sheet(wb, wsProdutos, 'Produtos');

    // 2. Aba de Instruções e Dicas
    const instrucoes = [
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': 'INSTRUÇÕES DE PREENCHIMENTO' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '1. Colunas com asterisco (*) são de preenchimento obrigatório: "Nome do Produto" e "Preço Venda / Varejo".' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '2. Categorias: Se a categoria informada não existir no sistema, ela será criada automaticamente na importação.' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '3. SKU / Código Interno Automático: Se deixar em branco, o sistema gerará automaticamente o código interno a partir da categoria (2 letras da categoria + 4 dígitos sequenciais, ex: Cosmético -> CO0001; Brinquedo Erótico -> BE0001).' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '4. Atualização de Produtos: Se o código de barras, SKU ou nome já existir na sua loja, os dados serão atualizados.' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '5. Novos Produtos: Se o produto não existir no sistema, um novo cadastro será criado com sucesso.' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '5. Preços: Utilize números decimais com ponto ou vírgula (Ex: 12.50 ou 12,50). Não use R$.' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '6. Unidades aceitas: UN, KG, G, L, ML, PCT, CX, FD, M, MT, DZ, PAR.' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '7. Catálogo: Preencha com SIM ou NÃO para controlar a visibilidade na loja online.' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '8. Status: Preencha com ATIVO ou INATIVO.' },
      { 'GUIA DE IMPORTAÇÃO DE PRODUTOS - HUBI': '9. DICA: Você também pode usar a função de "Exportar Produtos" do HUBI para gerar a sua base real, editar no Excel e reimportar!' }
    ];
    const wsInstrucoes = XLSX.utils.json_to_sheet(instrucoes);
    wsInstrucoes['!cols'] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, wsInstrucoes, 'Como Preencher');

    XLSX.writeFile(wb, 'HUBI_Modelo_Importacao_Produtos.xlsx');
  },

  /**
   * Baixa a Planilha Modelo Padrão em formato CSV (.csv) com UTF-8 BOM
   */
  downloadModeloCSV() {
    const cabecalhos = COLUNAS_LAYOUT_PRODUTO.map(c => `"${c.rotulo}"`).join(';');
    const linhas = LINHAS_EXEMPLO_MODELO.map(item => {
      return [
        item['Código de Barras (EAN)'] || '',
        item['Código Interno (SKU)'] || '',
        `"${(item['Nome do Produto *'] || '').replace(/"/g, '""')}"`,
        `"${(item['Categoria'] || '').replace(/"/g, '""')}"`,
        `"${(item['Descrição'] || '').replace(/"/g, '""')}"`,
        item['Unidade (UN, KG, L, PCT, CX)'] || 'UN',
        item['Preço Venda / Varejo (R$) *'],
        item['Preço de Custo (R$)'] ?? '',
        item['Preço Atacado (R$)'] ?? '',
        item['Preço Distribuidor (R$)'] ?? '',
        item['Preço Promocional (R$)'] ?? '',
        item['Estoque Atual'] ?? 0,
        item['Estoque Mínimo'] ?? 0,
        item['Exibir no Catálogo (SIM/NAO)'] || 'SIM',
        item['Status (ATIVO/INATIVO)'] || 'ATIVO'
      ].join(';');
    });

    const csvContent = '\uFEFF' + [cabecalhos, ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'HUBI_Modelo_Importacao_Produtos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Exporta os produtos da loja no mesmo layout exato para XLSX
   */
  exportarProdutosXLSX(produtos: Produto[], categorias: Categoria[], nomeLoja?: string) {
    const categoriasMap = new Map<string, string>();
    categorias.forEach(c => categoriasMap.set(c.id, c.nome));

    const dadosFormatados = produtos.map(p => {
      const nomeCategoria = p.categoria?.nome || (p.categoria_id ? categoriasMap.get(p.categoria_id) : '') || '';
      return {
        'Código de Barras (EAN)': p.codigo_barras || '',
        'Código Interno (SKU)': p.codigo_interno || '',
        'Nome do Produto *': p.nome || '',
        'Categoria': nomeCategoria,
        'Descrição': p.descricao || '',
        'Unidade (UN, KG, L, PCT, CX)': (p.tipo_unidade || 'UN').toUpperCase(),
        'Preço Venda / Varejo (R$) *': Number(p.preco_venda_varejo || 0),
        'Preço de Custo (R$)': Number(p.preco_custo || 0),
        'Preço Atacado (R$)': p.preco_venda_atacado != null ? Number(p.preco_venda_atacado) : '',
        'Preço Distribuidor (R$)': p.preco_venda_autoatacado != null ? Number(p.preco_venda_autoatacado) : '',
        'Preço Promocional (R$)': p.preco_promocional != null ? Number(p.preco_promocional) : '',
        'Estoque Atual': Number(p.quantidade_estoque || 0),
        'Estoque Mínimo': Number(p.estoque_minimo_alerta || 0),
        'Exibir no Catálogo (SIM/NAO)': p.exibir_catalogo !== false ? 'SIM' : 'NÃO',
        'Status (ATIVO/INATIVO)': p.ativo !== false ? 'ATIVO' : 'INATIVO'
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosFormatados);

    ws['!cols'] = [
      { wch: 24 }, // Código de Barras
      { wch: 20 }, // SKU
      { wch: 35 }, // Nome
      { wch: 20 }, // Categoria
      { wch: 45 }, // Descrição
      { wch: 28 }, // Unidade
      { wch: 26 }, // Preço Varejo
      { wch: 20 }, // Preço Custo
      { wch: 20 }, // Preço Atacado
      { wch: 24 }, // Preço Distribuidor
      { wch: 22 }, // Preço Promocional
      { wch: 15 }, // Estoque Atual
      { wch: 15 }, // Estoque Mínimo
      { wch: 26 }, // Exibir Catálogo
      { wch: 22 }  // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');

    const timestamp = new Date().toISOString().slice(0, 10);
    const safeNomeLoja = (nomeLoja || 'HUBI').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `${safeNomeLoja}_Produtos_${timestamp}.xlsx`);
  },

  /**
   * Exporta os produtos da loja no mesmo layout exato para CSV
   */
  exportarProdutosCSV(produtos: Produto[], categorias: Categoria[], nomeLoja?: string) {
    const categoriasMap = new Map<string, string>();
    categorias.forEach(c => categoriasMap.set(c.id, c.nome));

    const cabecalhos = COLUNAS_LAYOUT_PRODUTO.map(c => `"${c.rotulo}"`).join(';');
    const linhas = produtos.map(p => {
      const nomeCategoria = p.categoria?.nome || (p.categoria_id ? categoriasMap.get(p.categoria_id) : '') || '';
      return [
        p.codigo_barras || '',
        p.codigo_interno || '',
        `"${(p.nome || '').replace(/"/g, '""')}"`,
        `"${nomeCategoria.replace(/"/g, '""')}"`,
        `"${(p.descricao || '').replace(/"/g, '""')}"`,
        (p.tipo_unidade || 'UN').toUpperCase(),
        Number(p.preco_venda_varejo || 0),
        Number(p.preco_custo || 0),
        p.preco_venda_atacado != null ? Number(p.preco_venda_atacado) : '',
        p.preco_venda_autoatacado != null ? Number(p.preco_venda_autoatacado) : '',
        p.preco_promocional != null ? Number(p.preco_promocional) : '',
        Number(p.quantidade_estoque || 0),
        Number(p.estoque_minimo_alerta || 0),
        p.exibir_catalogo !== false ? 'SIM' : 'NAO',
        p.ativo !== false ? 'ATIVO' : 'INATIVO'
      ].join(';');
    });

    const csvContent = '\uFEFF' + [cabecalhos, ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeNomeLoja = (nomeLoja || 'HUBI').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeNomeLoja}_Produtos_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Processa e analisa arquivo enviado (XLSX, XLS ou CSV)
   */
  async processarArquivo(
    arquivo: File,
    produtosExistentes: Produto[]
  ): Promise<ResultadoParseImportacao> {
    const buffer = await arquivo.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const primeiraAbaNome = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[primeiraAbaNome];

    // Ler como matriz de objetos brutos
    const dadosBrutos: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    // Mapas para identificação de produtos existentes
    const mapPorCodigoBarras = new Map<string, Produto>();
    const mapPorSku = new Map<string, Produto>();
    const mapPorNome = new Map<string, Produto>();

    // Mapa para controlar os números sequenciais de código interno por prefixo de categoria (ex: CO0001, BE0001)
    const mapaContadoresPorPrefixo = new Map<string, number>();

    produtosExistentes.forEach(p => {
      if (p.codigo_barras) mapPorCodigoBarras.set(p.codigo_barras.trim().toLowerCase(), p);
      if (p.codigo_interno) {
        mapPorSku.set(p.codigo_interno.trim().toLowerCase(), p);
        const match = p.codigo_interno.trim().match(/^([A-Za-z]{2})(\d+)$/);
        if (match) {
          const pref = match[1].toUpperCase();
          const num = parseInt(match[2], 10);
          const maiorAtual = mapaContadoresPorPrefixo.get(pref) || 0;
          if (num > maiorAtual) {
            mapaContadoresPorPrefixo.set(pref, num);
          }
        }
      }
      if (p.nome) mapPorNome.set(p.nome.trim().toLowerCase(), p);
    });

    const produtosValidos: LinhaProdutoImportacao[] = [];
    const produtosComErro: LinhaProdutoImportacao[] = [];
    const setCategorias = new Set<string>();

    dadosBrutos.forEach((row, idx) => {
      const numLinha = idx + 2; // Linha 1 é o cabeçalho no Excel

      // Função auxiliar para obter valor de campo com nomes variados
      const obterValor = (chaves: string[]): string => {
        for (const k of Object.keys(row)) {
          const kNorm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const chave of chaves) {
            const cNorm = chave.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (kNorm.includes(cNorm)) {
              return String(row[k] ?? '').trim();
            }
          }
        }
        return '';
      };

      const parseNumber = (val: string): number => {
        if (!val) return 0;
        const limpo = String(val).replace(/[R$\s]/g, '').replace(',', '.');
        const num = parseFloat(limpo);
        return isNaN(num) ? 0 : num;
      };

      const parseNumberOpcional = (val: string): number | undefined => {
        if (!val && val !== '0') return undefined;
        const limpo = String(val).replace(/[R$\s]/g, '').replace(',', '.');
        const num = parseFloat(limpo);
        return isNaN(num) ? undefined : num;
      };

      const nome = obterValor(['nome', 'produto', 'descricao_produto', 'nome_produto']);
      const codBarras = obterValor(['barras', 'ean', 'gtin', 'codigo_barras']);
      const codInterno = obterValor(['sku', 'codigo_interno', 'cod_interno', 'codigo']);
      const categoria = obterValor(['categoria', 'grupo', 'departamento', 'secao']);
      const descricao = obterValor(['descricao', 'detalhes', 'observacao']);
      const tipoUnidadeRaw = obterValor(['unidade', 'und', 'tipo_unidade', 'medida']).toLowerCase();
      const precoVendaRaw = obterValor(['venda', 'varejo', 'preco_venda', 'preco_varejo', 'preco']);
      const precoCustoRaw = obterValor(['custo', 'preco_custo', 'valor_custo']);
      const precoAtacadoRaw = obterValor(['atacado', 'preco_atacado']);
      const precoAutoatacadoRaw = obterValor(['distribuidor', 'autoatacado', 'preco_distribuidor']);
      const precoPromocionalRaw = obterValor(['promocao', 'promocional', 'preco_promocional']);
      const estoqueRaw = obterValor(['estoque', 'quantidade', 'qtd', 'quantidade_estoque']);
      const estoqueMinimoRaw = obterValor(['minimo', 'estoque_minimo', 'alerta_estoque']);
      const catalogoRaw = obterValor(['catalogo', 'online', 'exibir_catalogo', 'loja_online']).toUpperCase();
      const statusRaw = obterValor(['status', 'ativo', 'situacao']).toUpperCase();

      // Pular linhas completamente vazias
      if (!nome && !codBarras && !precoVendaRaw) {
        return;
      }

      // Validações
      if (!nome) {
        produtosComErro.push({
          linha: numLinha,
          nome: '',
          tipo_unidade: 'un',
          preco_venda_varejo: 0,
          preco_custo: 0,
          quantidade_estoque: 0,
          estoque_minimo_alerta: 0,
          exibir_catalogo: true,
          ativo: true,
          statusAcao: 'ERRO',
          mensagemErro: 'Nome do produto é obrigatório.'
        });
        return;
      }

      const precoVenda = parseNumber(precoVendaRaw);
      if (precoVenda <= 0) {
        produtosComErro.push({
          linha: numLinha,
          nome,
          codigo_barras: codBarras || undefined,
          tipo_unidade: 'un',
          preco_venda_varejo: 0,
          preco_custo: parseNumber(precoCustoRaw),
          quantidade_estoque: parseNumber(estoqueRaw),
          estoque_minimo_alerta: parseNumber(estoqueMinimoRaw),
          exibir_catalogo: true,
          ativo: true,
          statusAcao: 'ERRO',
          mensagemErro: 'Preço de venda deve ser maior que zero.'
        });
        return;
      }

      // Normalizar unidade
      let unidadeFormatada = 'un';
      if (tipoUnidadeRaw.includes('kg') || tipoUnidadeRaw.includes('quilo')) unidadeFormatada = 'kg';
      else if (tipoUnidadeRaw.includes('l') || tipoUnidadeRaw.includes('litro')) unidadeFormatada = 'l';
      else if (tipoUnidadeRaw.includes('pct') || tipoUnidadeRaw.includes('pacote')) unidadeFormatada = 'pct';
      else if (tipoUnidadeRaw.includes('cx') || tipoUnidadeRaw.includes('caixa')) unidadeFormatada = 'cx';
      else if (tipoUnidadeRaw.includes('g') || tipoUnidadeRaw.includes('grama')) unidadeFormatada = 'g';
      else if (tipoUnidadeRaw.includes('ml')) unidadeFormatada = 'ml';
      else if (tipoUnidadeRaw.includes('m') || tipoUnidadeRaw.includes('metro')) unidadeFormatada = 'm';

      // Normalizar categoria
      if (categoria) {
        setCategorias.add(categoria.trim());
      }

      // Identificar se o produto já existe no sistema
      let produtoExistente: Produto | undefined = undefined;
      if (codBarras && mapPorCodigoBarras.has(codBarras.toLowerCase())) {
        produtoExistente = mapPorCodigoBarras.get(codBarras.toLowerCase());
      } else if (codInterno && mapPorSku.has(codInterno.toLowerCase())) {
        produtoExistente = mapPorSku.get(codInterno.toLowerCase());
      } else if (mapPorNome.has(nome.toLowerCase())) {
        produtoExistente = mapPorNome.get(nome.toLowerCase());
      }

      // Lógica de Geração Automática do Código Interno (SKU):
      // Se vier em branco na planilha:
      //  - Se for atualização de produto que já possua código interno no banco, preserva o existente.
      //  - Caso contrário, gera código a partir de 2 letras da categoria + 4 dígitos sequenciais (Ex: CO0001, BE0001).
      let codInternoFinal = codInterno;

      if (!codInternoFinal) {
        if (produtoExistente && produtoExistente.codigo_interno) {
          codInternoFinal = produtoExistente.codigo_interno;
        } else {
          const prefixo = extrairPrefixoCategoria(categoria);
          const ultimoNum = mapaContadoresPorPrefixo.get(prefixo) || 0;
          const proximoNum = ultimoNum + 1;
          mapaContadoresPorPrefixo.set(prefixo, proximoNum);
          codInternoFinal = `${prefixo}${String(proximoNum).padStart(4, '0')}`;
        }
      } else {
        // Se o SKU foi preenchido manualmente e segue padrão de 2 letras + números, atualiza o contador do prefixo
        const matchManual = codInternoFinal.trim().match(/^([A-Za-z]{2})(\d+)$/);
        if (matchManual) {
          const pref = matchManual[1].toUpperCase();
          const num = parseInt(matchManual[2], 10);
          const maior = mapaContadoresPorPrefixo.get(pref) || 0;
          if (num > maior) {
            mapaContadoresPorPrefixo.set(pref, num);
          }
        }
      }

      if (codInternoFinal) {
        mapPorSku.set(codInternoFinal.toLowerCase(), produtoExistente || ({} as any));
      }

      const exibirCatalogo = !catalogoRaw.includes('NAO') && !catalogoRaw.includes('NÃO') && !catalogoRaw.includes('FALSE') && catalogoRaw !== '0';
      const ativo = !statusRaw.includes('INATIV') && !statusRaw.includes('DESATIV') && !statusRaw.includes('FALSE') && statusRaw !== '0';

      const linhaValida: LinhaProdutoImportacao = {
        linha: numLinha,
        codigo_barras: codBarras || undefined,
        codigo_interno: codInternoFinal || undefined,
        nome,
        categoria: categoria || undefined,
        descricao: descricao || undefined,
        tipo_unidade: unidadeFormatada,
        preco_venda_varejo: precoVenda,
        preco_custo: parseNumber(precoCustoRaw),
        preco_venda_atacado: parseNumberOpcional(precoAtacadoRaw),
        preco_venda_autoatacado: parseNumberOpcional(precoAutoatacadoRaw),
        preco_promocional: parseNumberOpcional(precoPromocionalRaw),
        quantidade_estoque: parseNumber(estoqueRaw),
        estoque_minimo_alerta: parseNumber(estoqueMinimoRaw),
        exibir_catalogo: exibirCatalogo,
        ativo: ativo,
        statusAcao: produtoExistente ? 'ATUALIZAR' : 'NOVO',
        produtoExistenteId: produtoExistente?.id
      };

      produtosValidos.push(linhaValida);
    });

    const novos = produtosValidos.filter(p => p.statusAcao === 'NOVO').length;
    const atualizacoes = produtosValidos.filter(p => p.statusAcao === 'ATUALIZAR').length;

    return {
      totalLinhasLidas: dadosBrutos.length,
      produtosValidos,
      produtosComErro,
      novosCadastros: novos,
      atualizacoes: atualizacoes,
      categoriasDetectadas: Array.from(setCategorias)
    };
  },

  /**
   * Executa a importação no Supabase
   */
  async executarImportacao(
    lojaId: string,
    produtosParaImportar: LinhaProdutoImportacao[],
    onProgresso?: (progresso: number, statusTexto: string) => void
  ): Promise<RelatorioResultadoImportacao> {
    if (!lojaId || produtosParaImportar.length === 0) {
      return {
        sucesso: false,
        totalCadastrados: 0,
        totalAtualizados: 0,
        totalCategoriasCriadas: 0,
        erros: ['Nenhum produto válido para importação.']
      };
    }

    try {
      // 1. Obter categorias existentes da loja
      onProgresso?.(10, 'Sincronizando categorias...');
      const { data: categoriasExistentes, error: errCat } = await supabase
        .from('categorias')
        .select('id, nome')
        .eq('loja_id', lojaId);

      if (errCat) throw errCat;

      const mapaCategorias = new Map<string, string>();
      (categoriasExistentes || []).forEach(c => mapaCategorias.set(c.nome.trim().toLowerCase(), c.id));

      // Identificar categorias novas que precisam ser criadas
      const categoriasParaCriar = new Set<string>();
      produtosParaImportar.forEach(p => {
        if (p.categoria && !mapaCategorias.has(p.categoria.trim().toLowerCase())) {
          categoriasParaCriar.add(p.categoria.trim());
        }
      });

      let totalCategoriasCriadas = 0;
      if (categoriasParaCriar.size > 0) {
        onProgresso?.(20, `Criando ${categoriasParaCriar.size} novas categorias...`);
        const payloadNovasCategorias = Array.from(categoriasParaCriar).map((nomeCat, idx) => ({
          loja_id: lojaId,
          nome: nomeCat,
          ordem_exibicao: (categoriasExistentes?.length || 0) + idx + 1,
          ativo: true
        }));

        const { data: novasCategoriasCriadas, error: errNovaCat } = await supabase
          .from('categorias')
          .insert(payloadNovasCategorias)
          .select();

        if (errNovaCat) {
          console.warn('Aviso ao criar categorias automáticas:', errNovaCat);
        } else if (novasCategoriasCriadas) {
          novasCategoriasCriadas.forEach(c => mapaCategorias.set(c.nome.trim().toLowerCase(), c.id));
          totalCategoriasCriadas = novasCategoriasCriadas.length;
        }
      }

      // 2. Separar produtos entre Inserções e Atualizações
      onProgresso?.(40, 'Processando produtos no banco de dados...');
      let totalCadastrados = 0;
      let totalAtualizados = 0;
      const erros: string[] = [];

      const totalItens = produtosParaImportar.length;
      for (let i = 0; i < totalItens; i++) {
        const item = produtosParaImportar[i];
        const categoriaId = item.categoria ? mapaCategorias.get(item.categoria.trim().toLowerCase()) || null : null;

        const payloadProduto: any = {
          loja_id: lojaId,
          nome: item.nome,
          codigo_barras: item.codigo_barras || null,
          codigo_interno: item.codigo_interno || null,
          categoria_id: categoriaId,
          descricao: item.descricao || null,
          tipo_unidade: item.tipo_unidade || 'un',
          preco_venda_varejo: item.preco_venda_varejo,
          preco_custo: item.preco_custo || 0,
          preco_venda_atacado: item.preco_venda_atacado || null,
          preco_venda_autoatacado: item.preco_venda_autoatacado || null,
          preco_promocional: item.preco_promocional || null,
          promocao_ativa: Boolean(item.preco_promocional && item.preco_promocional < item.preco_venda_varejo),
          quantidade_estoque: item.quantidade_estoque || 0,
          estoque_minimo_alerta: item.estoque_minimo_alerta || 0,
          exibir_catalogo: item.exibir_catalogo,
          ativo: item.ativo,
          fotos_urls: []
        };

        try {
          if (item.statusAcao === 'ATUALIZAR' && item.produtoExistenteId) {
            // Update
            const { error: errUp } = await supabase
              .from('produtos')
              .update(payloadProduto)
              .eq('id', item.produtoExistenteId);

            if (errUp) throw errUp;
            totalAtualizados++;
          } else {
            // Insert
            const { error: errIns } = await supabase
              .from('produtos')
              .insert([payloadProduto]);

            if (errIns) throw errIns;
            totalCadastrados++;
          }
        } catch (errProd: any) {
          erros.push(`Linha ${item.linha} ("${item.nome}"): ${errProd.message || 'Erro ao persistir'}`);
        }

        const pct = 40 + Math.round(((i + 1) / totalItens) * 55);
        onProgresso?.(pct, `Importando produtos (${i + 1} de ${totalItens})...`);
      }

      onProgresso?.(100, 'Importação finalizada!');

      return {
        sucesso: erros.length === 0 || totalCadastrados > 0 || totalAtualizados > 0,
        totalCadastrados,
        totalAtualizados,
        totalCategoriasCriadas,
        erros
      };
    } catch (err: any) {
      console.error('Erro global na importação:', err);
      return {
        sucesso: false,
        totalCadastrados: 0,
        totalAtualizados: 0,
        totalCategoriasCriadas: 0,
        erros: [err.message || 'Erro inesperado durante o processamento da importação.']
      };
    }
  }
};
