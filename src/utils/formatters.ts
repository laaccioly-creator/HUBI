export interface FormatarMoedaOpcoes {
  semSimbolo?: boolean;
}

/**
 * Formata qualquer valor numérico/string para moeda brasileira (pt-BR).
 * Ex: 42 -> "R$ 42,00" ou "42,00" (se semSimbolo: true)
 * Ex: 1250.5 -> "R$ 1.250,50" ou "1.250,50"
 * Ponto (.) como separador de milhar e vírgula (,) como separador de centavos, 2 casas fixas.
 */
export const formatarMoeda = (
  valor: number | string | null | undefined,
  opcoes?: FormatarMoedaOpcoes
): string => {
  if (valor === null || valor === undefined || valor === '') {
    return opcoes?.semSimbolo ? '0,00' : 'R$ 0,00';
  }
  let num: number;
  if (typeof valor === 'number') {
    num = isNaN(valor) ? 0 : valor;
  } else {
    const limpo = String(valor).trim().replace('R$', '').trim();
    if (limpo.includes(',') && limpo.includes('.')) {
      num = parseFloat(limpo.replace(/\./g, '').replace(',', '.')) || 0;
    } else if (limpo.includes(',')) {
      num = parseFloat(limpo.replace(',', '.')) || 0;
    } else {
      num = parseFloat(limpo) || 0;
    }
  }

  if (isNaN(num)) {
    return opcoes?.semSimbolo ? '0,00' : 'R$ 0,00';
  }

  const formatado = num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return opcoes?.semSimbolo ? formatado : `R$ ${formatado}`;
};

/**
 * Converte valor digitado com máscara ou vírgula de volta para float limpo do PostgreSQL.
 * Ex: "1.250,50" -> 1250.50
 * Ex: "42" -> 42.00
 * Ex: "68,6" -> 68.60
 */
export const parseMoedaBanco = (valor: string | number | null | undefined): number => {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  const limpo = String(valor).trim().replace('R$', '').trim();
  if (!limpo) return 0;

  // Se tiver tanto ponto quanto vírgula (ex: "1.250,50" ou "1,250.50")
  if (limpo.includes(',') && limpo.includes('.')) {
    const num = parseFloat(limpo.replace(/\./g, '').replace(',', '.'));
    return isNaN(num) ? 0 : num;
  }

  // Se tiver apenas vírgula (ex: "12,50" ou "1250,50")
  if (limpo.includes(',')) {
    const num = parseFloat(limpo.replace(',', '.'));
    return isNaN(num) ? 0 : num;
  }

  // Se tiver múltiplos pontos (ex: "1.000.000"), são separadores de milhar sem centavos
  const partesPonto = limpo.split('.');
  if (partesPonto.length > 2) {
    const num = parseFloat(limpo.replace(/\./g, ''));
    return isNaN(num) ? 0 : num;
  }

  // Decimal padrão JS / PostgreSQL (ex: "12.00", "25.00", "1250.50") ou inteiro puro ("42")
  const numero = parseFloat(limpo);
  return isNaN(numero) ? 0 : numero;
};

export const formatarValorBRL = (valor: number | string | null | undefined): string => {
  return formatarMoeda(valor, { semSimbolo: true });
};

export const formatarData = (dataIso?: string | null): string => {
  if (!dataIso) return '-';
  return new Date(dataIso).toLocaleDateString('pt-BR');
};

export const formatarDataHora = (dataIso?: string | null): string => {
  if (!dataIso) return '-';
  return new Date(dataIso).toLocaleString('pt-BR');
};

export const formatarTelefone = (tel?: string | null): string => {
  if (!tel) return '';
  const digits = tel.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return tel;
};

/**
 * Limpa e extrai a observação real de um pedido, removendo tags técnicas de sistema
 * ([PAG_PREVISTO:...], [DESCONTO_PERC:...], <!--HUBI_HISTORICO:...-->) e cabeçalhos legados
 * automáticos de cliente gerados pelo catálogo público (ex: "Cliente: Nome (Fone). CPF/CNPJ: ... E-mail: ...").
 */
export const extrairObservacaoLimpa = (obs?: string | null): string => {
  if (!obs || typeof obs !== 'string') return '';

  let limpa = obs
    .replace(/\[PAG_PREVISTO:.*?\]/g, '')
    .replace(/\[DESCONTO_PERC:[0-9.]+\]/g, '')
    .replace(/<!--HUBI_HISTORICO:.*?-->/g, '')
    .trim();

  // Padrão 1: Gerado pelo Catálogo com Telefone entre parênteses: "Cliente: Nome (11999999999)..."
  const matchCatalogo = limpa.match(/^Cliente:\s*.*?(?:\(\+?\d+.*?\))(?:[\s\S]*?)(?:\.\s*Obs:\s*([\s\S]*)|$)/i);
  if (matchCatalogo) {
    return matchCatalogo[1] ? matchCatalogo[1].trim() : '';
  }

  // Padrão 2: Gerado pelo Catálogo com CPF/CNPJ ou E-mail ou Cupom no cabeçalho
  const matchCatalogo2 = limpa.match(/^Cliente:\s*.*?(?:CPF\/CNPJ:|E-mail:|\[Cupom:)(?:[\s\S]*?)(?:\.\s*Obs:\s*([\s\S]*)|$)/i);
  if (matchCatalogo2) {
    return matchCatalogo2[1] ? matchCatalogo2[1].trim() : '';
  }

  return limpa;
};

/**
 * Identifica se um produto ou item opera sob regime de peso ou fração (KG, G, L, etc.)
 */
export const ehProdutoFracionado = (produto?: {
  tipo_unidade?: string | null;
  unidade_medida?: string | null;
  permite_fracionado?: boolean | null;
  venda_por_peso?: boolean | null;
} | null): boolean => {
  if (!produto) return false;
  if (produto.venda_por_peso === true || produto.permite_fracionado === true) {
    return true;
  }
  const unidadesFracionadas = ['kg', 'g', 'l', 'ml', 'm', 'cm', 'quilo', 'quilos', 'grama', 'gramas'];
  const tipoUn = (produto.tipo_unidade || '').trim().toLowerCase();
  const unMedida = (produto.unidade_medida || '').trim().toLowerCase();
  return unidadesFracionadas.includes(tipoUn) || unidadesFracionadas.includes(unMedida);
};

/**
 * Normaliza e obtém a sigla da unidade de medida do produto para exibição
 */
export const obterSiglaUnidade = (produto?: {
  tipo_unidade?: string | null;
  unidade_medida?: string | null;
  permite_fracionado?: boolean | null;
  venda_por_peso?: boolean | null;
} | null): string => {
  if (!produto) return 'un';
  const tipoUn = (produto.tipo_unidade || '').trim().toLowerCase();
  const unMedida = (produto.unidade_medida || '').trim().toLowerCase();
  if (tipoUn && tipoUn !== 'un') return tipoUn;
  if (unMedida && unMedida !== 'un') return unMedida;
  if (produto.venda_por_peso === true || produto.permite_fracionado === true) return 'kg';
  return tipoUn || unMedida || 'un';
};

/**
 * Formata a quantidade para apresentação na UI ou cupom.
 * Itens pesáveis/fracionados recebem 3 casas decimais (ex: 1,250 kg).
 * Itens unitários recebem formatação inteira ou até 3 casas caso haja fração.
 */
export const formatarQuantidadeUnidade = (
  quantidade: number | string | null | undefined,
  unidade?: string | null
): string => {
  const num = Number(quantidade) || 0;
  const un = (unidade || 'un').trim().toLowerCase();

  const ehPeso = ['kg', 'g', 'l', 'ml', 'm', 'cm'].includes(un) || num % 1 !== 0;

  if (ehPeso) {
    const formatado = num.toLocaleString('pt-BR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    });
    return `${formatado} ${un}`;
  }

  return `${num} ${un}`;
};

/**
 * Formata a linha de cálculo comercial:
 * Ex fracionado: "1,250 kg x R$ 6,40/kg = R$ 8,00"
 * Ex unitário:   "2 un x R$ 10,00/un = R$ 20,00"
 */
export const formatarLinhaCalculoItem = (
  quantidade: number,
  precoUnitario: number,
  unidade?: string | null
): string => {
  const un = (unidade || 'un').trim().toLowerCase();
  const subtotal = Number((quantidade * precoUnitario).toFixed(2));
  const ehFrac = ['kg', 'g', 'l', 'ml', 'm', 'cm'].includes(un) || quantidade % 1 !== 0;

  const qtdTexto = ehFrac
    ? `${quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${un}`
    : `${quantidade} ${un}`;

  return `${qtdTexto} x ${formatarMoeda(precoUnitario)}/${un} = ${formatarMoeda(subtotal)}`;
};

