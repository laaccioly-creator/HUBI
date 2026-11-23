import type { Produto } from '../types';

export type MotivoDuplicidade = 'nome_identico' | 'nome_similar' | 'codigo_barras';

export interface ProdutoCandidatoDuplicado {
  nome: string;
  codigoBarras?: string | null;
  idIgnorar?: string | null;
}

export interface ResultadoDuplicidade {
  encontrado: boolean;
  motivo?: MotivoDuplicidade;
  produto?: Produto;
  similaridade?: number;
}

const STOPWORDS_PRODUTO = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'em',
  'para',
  'com',
  'sem',
  'tipo',
  'quimico',
  'po',
  'e',
  'o',
  'a',
  'os',
  'as',
  'no',
  'na'
]);

const MAPA_CORES_CANONICAS: Record<string, string> = {
  preto: 'preto',
  preta: 'preto',
  branco: 'branco',
  branca: 'branco',
  azul: 'azul',
  vermelho: 'vermelho',
  vermelha: 'vermelho',
  verde: 'verde',
  amarelo: 'amarelo',
  amarela: 'amarelo',
  rosa: 'rosa',
  roxo: 'roxo',
  roxa: 'roxo',
  cinza: 'cinza',
  prata: 'prata',
  dourado: 'dourado',
  dourada: 'dourado',
  laranja: 'laranja',
  marrom: 'marrom',
  bege: 'bege',
  transparente: 'transparente'
};

const VOLTAGENS_CONHECIDAS = new Set(['110v', '127v', '220v', 'bivolt']);

const REGEX_MEDIDA_GLOBAL =
  /\b(\d+(?:\.\d+)?)\s*(g|gr|kg|ml|l|lt|un|und|cx|pct|cm|mm|m|w|v|gb|tb)\b/g;

function normalizarUnidadeMedida(valorNum: number, unidadeBruta: string): string {
  const u = unidadeBruta.toLowerCase();
  if (u === 'kg') {
    return `${Math.round(valorNum * 1000)}g`;
  }
  if (u === 'gr' || u === 'g') {
    return `${Number(valorNum.toFixed(3))}g`;
  }
  if (u === 'l' || u === 'lt') {
    return `${Math.round(valorNum * 1000)}ml`;
  }
  if (u === 'ml') {
    return `${Number(valorNum.toFixed(3))}ml`;
  }
  if (u === 'und' || u === 'un') {
    return `${Number(valorNum.toFixed(3))}un`;
  }
  return `${Number(valorNum.toFixed(3))}${u}`;
}

export function normalizarTextoProduto(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.\s]+/g, ' ')
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extrairMedidas(textoNorm: string): Set<string> {
  const medidas = new Set<string>();
  const regex = new RegExp(REGEX_MEDIDA_GLOBAL.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(textoNorm)) !== null) {
    const num = parseFloat(match[1]);
    if (!Number.isNaN(num) && num > 0) {
      medidas.add(normalizarUnidadeMedida(num, match[2]));
    }
  }
  return medidas;
}

function extrairCoresEVoltagens(textoNorm: string): {
  cores: Set<string>;
  voltagens: Set<string>;
} {
  const cores = new Set<string>();
  const voltagens = new Set<string>();

  for (const palavra of textoNorm.split(/\s+/)) {
    if (!palavra) continue;
    if (MAPA_CORES_CANONICAS[palavra]) {
      cores.add(MAPA_CORES_CANONICAS[palavra]);
    }
    if (VOLTAGENS_CONHECIDAS.has(palavra)) {
      voltagens.add(palavra);
    }
  }

  return { cores, voltagens };
}

export function extrairTokensPrincipais(textoNorm: string): Set<string> {
  const textoComMedidasUnificadas = textoNorm.replace(
    new RegExp(REGEX_MEDIDA_GLOBAL.source, 'g'),
    (_full, numStr: string, unidade: string) => {
      const num = parseFloat(numStr);
      if (Number.isNaN(num) || num <= 0) return _full;
      return ` ${normalizarUnidadeMedida(num, unidade)} `;
    }
  );

  const tokens = new Set<string>();
  for (const bruto of textoComMedidasUnificadas.split(/\s+/)) {
    const token = bruto.trim();
    if (!token || token.length < 2) continue;
    if (STOPWORDS_PRODUTO.has(token)) continue;
    tokens.add(MAPA_CORES_CANONICAS[token] || token);
  }
  return tokens;
}

function conjuntosSaoIguais(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function buscarProdutoDuplicado(
  produtosLoja: Produto[],
  candidato: ProdutoCandidatoDuplicado
): ResultadoDuplicidade {
  if (!Array.isArray(produtosLoja) || produtosLoja.length === 0) {
    return { encontrado: false };
  }

  const eanCandidato = String(candidato.codigoBarras || '').replace(/\s+/g, '').trim();
  const nomeCandidatoNorm = normalizarTextoProduto(candidato.nome || '');
  const medidasCandidato = extrairMedidas(nomeCandidatoNorm);
  const { cores: coresCandidato, voltagens: voltagensCandidato } =
    extrairCoresEVoltagens(nomeCandidatoNorm);
  const tokensCandidato = extrairTokensPrincipais(nomeCandidatoNorm);

  let melhorMatch: { produto: Produto; score: number } | null = null;

  for (const prod of produtosLoja) {
    if (!prod || prod.ativo === false) continue;
    if (candidato.idIgnorar && prod.id === candidato.idIgnorar) continue;

    // 1. Critério complementar de Código de Barras (somente quando ambos preenchidos)
    const eanExistente = String(prod.codigo_barras || '').replace(/\s+/g, '').trim();
    if (eanCandidato && eanExistente && eanCandidato === eanExistente) {
      return {
        encontrado: true,
        motivo: 'codigo_barras',
        produto: prod,
        similaridade: 1
      };
    }

    if (!nomeCandidatoNorm) continue;

    const nomeExistenteNorm = normalizarTextoProduto(prod.nome || '');
    if (!nomeExistenteNorm) continue;

    // 2. Match exato de nome normalizado
    if (nomeExistenteNorm === nomeCandidatoNorm) {
      return {
        encontrado: true,
        motivo: 'nome_identico',
        produto: prod,
        similaridade: 1
      };
    }

    // 3. Descarte imediato quando ambos possuem especificação/variação distinta
    const medidasExistente = extrairMedidas(nomeExistenteNorm);
    if (
      medidasCandidato.size > 0 &&
      medidasExistente.size > 0 &&
      !conjuntosSaoIguais(medidasCandidato, medidasExistente)
    ) {
      continue;
    }

    const { cores: coresExistente, voltagens: voltagensExistente } =
      extrairCoresEVoltagens(nomeExistenteNorm);
    if (
      coresCandidato.size > 0 &&
      coresExistente.size > 0 &&
      !conjuntosSaoIguais(coresCandidato, coresExistente)
    ) {
      continue;
    }

    if (
      voltagensCandidato.size > 0 &&
      voltagensExistente.size > 0 &&
      !conjuntosSaoIguais(voltagensCandidato, voltagensExistente)
    ) {
      continue;
    }

    // 4. Similaridade semântica dos tokens principais (Jaccard / contenção >= 75%)
    const tokensExistente = extrairTokensPrincipais(nomeExistenteNorm);
    if (tokensCandidato.size === 0 || tokensExistente.size === 0) continue;

    let intersecao = 0;
    for (const tk of tokensCandidato) {
      if (tokensExistente.has(tk)) intersecao++;
    }

    if (intersecao === 0) continue;

    const uniao = tokensCandidato.size + tokensExistente.size - intersecao;
    const jaccard = uniao > 0 ? intersecao / uniao : 0;
    const menorTamanho = Math.min(tokensCandidato.size, tokensExistente.size);
    const contencao = menorTamanho > 0 ? intersecao / menorTamanho : 0;

    const ambosUnitariosIguais =
      tokensCandidato.size === 1 && tokensExistente.size === 1 && intersecao === 1;
    const matchForte =
      ambosUnitariosIguais ||
      (intersecao >= 2 && (jaccard >= 0.75 || (contencao >= 0.85 && jaccard >= 0.6)));

    if (matchForte) {
      const score = Math.max(jaccard, contencao >= 0.85 ? contencao * 0.92 : jaccard);
      if (!melhorMatch || score > melhorMatch.score) {
        melhorMatch = { produto: prod, score };
      }
    }
  }

  if (melhorMatch) {
    return {
      encontrado: true,
      motivo: 'nome_similar',
      produto: melhorMatch.produto,
      similaridade: melhorMatch.score
    };
  }

  return { encontrado: false };
}
