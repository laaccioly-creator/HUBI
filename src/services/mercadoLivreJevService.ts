// Serviço de Inteligência TypeSafe/Jev para Categorização e Ficha Técnica do Mercado Livre
// Descoberta de categoria semântica com Jev (`jev-latest`) + preenchimento calibrado em lote único.

import { supabase } from '../lib/supabase';
import {
  mercadoLivreService,
  MlAtributoObrigatorioCategoria,
  MlAtributoValorOpcao,
  MlConsultaCategoriaResultado,
  MlSugestaoCategoria,
} from './mercadoLivreService';
import { PerguntaTypeSafe, typesafeService } from './typesafeService';

export interface FichaProdutoMlHubi {
  produtoId: string;
  variacaoId?: string | null;
  nome: string;
  descricao?: string | null;
  categoriaLocal?: string | null;
  subcategoriaLocal?: string | null;
  codigoBarras?: string | null;
  codigoInterno?: string | null;
  variacaoNome?: string | null;
  rotuloVariacao1?: string | null;
  valorVariacao1?: string | null;
  rotuloVariacao2?: string | null;
  valorVariacao2?: string | null;
  marca?: string | null;
  modelo?: string | null;
  pesoKg?: number | null;
  alturaCm?: number | null;
  larguraCm?: number | null;
  comprimentoCm?: number | null;
}

export interface ValorAtributoPreenchidoMl {
  value_id?: string;
  value_name: string;
}

export interface ResultadoPreenchimentoAtributosMl {
  marca?: string;
  modelo?: string;
  atributosPreenchidos: Record<string, ValorAtributoPreenchidoMl>;
  atributosTextoLivrePendentes: MlAtributoObrigatorioCategoria[];
}

interface EntradaCacheTtl<T> {
  expiraEm: number;
  valor: T;
}

interface MlDetalhesCategoriaDireto {
  categoria: MlConsultaCategoriaResultado['categoria'];
  atributos_obrigatorios: MlAtributoObrigatorioCategoria[];
}

interface CacheAtributosResultadoBruto {
  marca?: string;
  modelo?: string;
  atributosPreenchidos: Record<string, ValorAtributoPreenchidoMl>;
}

const TTL_CACHE_MS = 10 * 60 * 1000;
const LIMITE_ITENS_CACHE = 200;
const TIMEOUT_ML_API_MS = 2500;
const TIMEOUT_JEV_CATEGORIA_MS = 900;
const TIMEOUT_JEV_ATRIBUTOS_MS = 850;
const TIMEOUT_GEMINI_FALLBACK_MS = 4000;
const MAX_OPCOES_CHOICE_JEV = 19;
const MAX_PERGUNTAS_LOTE_JEV = 15;

const cacheSugestoesMl = new Map<string, EntradaCacheTtl<MlSugestaoCategoria[]>>();
const cacheDetalhesCategoriaMl = new Map<string, EntradaCacheTtl<MlDetalhesCategoriaDireto>>();
const emVooDetalhesCategoria = new Map<string, Promise<MlDetalhesCategoriaDireto>>();
const cacheEscolhaCategoriaJev = new Map<string, EntradaCacheTtl<string>>();
const cacheAtributosJev = new Map<string, EntradaCacheTtl<CacheAtributosResultadoBruto>>();
const cacheGeminiTextoLivre = new Map<string, EntradaCacheTtl<Record<string, ValorAtributoPreenchidoMl>>>();

const IDS_PESO = new Set(['WEIGHT', 'NET_WEIGHT', 'PACKAGE_WEIGHT', 'UNIT_WEIGHT']);
const IDS_ALTURA = new Set(['HEIGHT', 'PACKAGE_HEIGHT']);
const IDS_LARGURA = new Set(['WIDTH', 'PACKAGE_WIDTH']);
const IDS_COMPRIMENTO = new Set(['LENGTH', 'DEPTH', 'PACKAGE_LENGTH']);
const IDS_CODIGO_BARRAS = new Set(['EAN', 'UPC', 'BARCODE']);
const IDS_NOME_PRODUTO = new Set(['TITLE', 'PRODUCT_NAME', 'NAME']);
const TERMOS_MARCA_IGNORADOS = new Set(['generico', 'generica', 'outro', 'outra', 'outros', 'sem marca', 'nao se aplica']);
const ROTULOS_OPCAO_NEUTRA = ['generica', 'generico', 'outro', 'outros', 'sem genero', 'unissex', 'nao se aplica', 'padrao'];

function obterCacheTtl<T>(mapa: Map<string, EntradaCacheTtl<T>>, chave: string): T | null {
  const entrada = mapa.get(chave);
  if (!entrada) return null;
  if (Date.now() > entrada.expiraEm) {
    mapa.delete(chave);
    return null;
  }
  return entrada.valor;
}

function salvarCacheTtl<T>(mapa: Map<string, EntradaCacheTtl<T>>, chave: string, valor: T): void {
  if (mapa.size >= LIMITE_ITENS_CACHE) {
    const primeiraChave = mapa.keys().next().value;
    if (primeiraChave !== undefined) {
      mapa.delete(primeiraChave);
    }
  }
  mapa.set(chave, {
    expiraEm: Date.now() + TTL_CACHE_MS,
    valor,
  });
}

function sanitizarTermoBuscaMl(texto: string, maxLen = 80): string {
  return texto
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, ' ')
    .replace(/[/\\|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .trim();
}

function normalizarTextoComparacao(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizarChaveEstado(texto: string): string {
  const normalizado = normalizarTextoComparacao(texto).replace(/\s+/g, '_');
  return normalizado.slice(0, 32) || 'eixo';
}

function ehRegistroObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function temTagAtributoMl(tags: unknown, tagNome: string): boolean {
  if (!tags) return false;
  if (Array.isArray(tags)) {
    return tags.some((t) => String(t).toLowerCase() === tagNome);
  }
  if (ehRegistroObjeto(tags)) {
    return tags[tagNome] === true;
  }
  return false;
}

async function fetchJsonComTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resposta = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status} ao consultar API do Mercado Livre.`);
    }

    return (await resposta.json()) as T;
  } finally {
    window.clearTimeout(timerId);
  }
}

async function buscarSugestoesCategoriaDiretoMl(
  titulo: string,
  limit = 5
): Promise<MlSugestaoCategoria[]> {
  const termoLimpo = sanitizarTermoBuscaMl(titulo, 80);
  if (!termoLimpo) return [];

  const chaveCache = `${termoLimpo.toLowerCase()}::${limit}`;
  const emCache = obterCacheTtl(cacheSugestoesMl, chaveCache);
  if (emCache) return emCache;

  const url = `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=${limit}&q=${encodeURIComponent(termoLimpo)}`;
  const listaRaw = await fetchJsonComTimeout<unknown>(url, TIMEOUT_ML_API_MS);

  if (!Array.isArray(listaRaw)) return [];

  const vistos = new Set<string>();
  const sugestoes: MlSugestaoCategoria[] = [];

  for (const item of listaRaw) {
    if (!ehRegistroObjeto(item)) continue;
    const catId = typeof item.category_id === 'string' ? item.category_id.trim() : String(item.category_id || '').trim();
    if (!catId || vistos.has(catId)) continue;
    vistos.add(catId);
    sugestoes.push({
      category_id: catId,
      category_name: typeof item.category_name === 'string' && item.category_name.trim() ? item.category_name.trim() : catId,
      domain_name: typeof item.domain_name === 'string' ? item.domain_name.trim() : '',
    });
  }

  salvarCacheTtl(cacheSugestoesMl, chaveCache, sugestoes);
  return sugestoes;
}

async function buscarDetalhesEAtributosCategoriaDiretoMl(
  categoryId: string
): Promise<MlDetalhesCategoriaDireto> {
  const idLimpo = categoryId.trim();
  const emCache = obterCacheTtl(cacheDetalhesCategoriaMl, idLimpo);
  if (emCache) return emCache;

  const requisicaoEmVoo = emVooDetalhesCategoria.get(idLimpo);
  if (requisicaoEmVoo) return requisicaoEmVoo;

  const promessa = (async (): Promise<MlDetalhesCategoriaDireto> => {
    const encodedId = encodeURIComponent(idLimpo);
    const [dadosCatRaw, listaAttrsRaw] = await Promise.all([
      fetchJsonComTimeout<unknown>(`https://api.mercadolibre.com/categories/${encodedId}`, TIMEOUT_ML_API_MS),
      fetchJsonComTimeout<unknown>(`https://api.mercadolibre.com/categories/${encodedId}/attributes`, TIMEOUT_ML_API_MS).catch(() => []),
    ]);

    if (!ehRegistroObjeto(dadosCatRaw)) {
      throw new Error(`Categoria ${idLimpo} inválida na resposta do Mercado Livre.`);
    }

    const pathFromRoot = Array.isArray(dadosCatRaw.path_from_root)
      ? dadosCatRaw.path_from_root
          .filter(ehRegistroObjeto)
          .map((p) => ({
            id: String(p.id || ''),
            name: String(p.name || ''),
          }))
          .filter((p) => p.name.length > 0)
      : [];

    const catName = String(dadosCatRaw.name || idLimpo);
    const caminhoCompleto =
      pathFromRoot.length > 0 ? pathFromRoot.map((p) => p.name).join(' > ') : catName;

    const ehFolha = !Array.isArray(dadosCatRaw.children_categories) || dadosCatRaw.children_categories.length === 0;
    const settings = ehRegistroObjeto(dadosCatRaw.settings) ? dadosCatRaw.settings : null;
    const permiteAnuncio = settings?.listing_allowed !== false;

    const attrsArray = Array.isArray(listaAttrsRaw) ? listaAttrsRaw : [];
    const atributosObrigatorios: MlAtributoObrigatorioCategoria[] = [];

    for (const attr of attrsArray) {
      if (!ehRegistroObjeto(attr) || !attr.id) continue;
      const idUpper = String(attr.id).trim().toUpperCase();
      if (idUpper === 'ITEM_CONDITION' || idUpper === 'GTIN') continue;

      const ehObrigatorio =
        temTagAtributoMl(attr.tags, 'required') ||
        temTagAtributoMl(attr.tags, 'catalog_required') ||
        temTagAtributoMl(attr.tags, 'new_required');

      const ehOcultoOuLeitura =
        temTagAtributoMl(attr.tags, 'hidden') ||
        temTagAtributoMl(attr.tags, 'read_only') ||
        temTagAtributoMl(attr.tags, 'fixed');

      if (!ehObrigatorio || ehOcultoOuLeitura) continue;

      const values: MlAtributoValorOpcao[] = Array.isArray(attr.values)
        ? attr.values
            .filter(ehRegistroObjeto)
            .filter((v) => v.id && v.name)
            .map((v) => ({ id: String(v.id), name: String(v.name) }))
        : [];

      const hintTexto =
        typeof attr.hint === 'string' && attr.hint.trim()
          ? attr.hint
          : typeof attr.tooltip === 'string' && attr.tooltip.trim()
            ? attr.tooltip
            : null;

      atributosObrigatorios.push({
        id: idUpper,
        name: String(attr.name || idUpper).trim(),
        value_type: String(attr.value_type || 'string'),
        default_unit: typeof attr.default_unit === 'string' && attr.default_unit.trim() ? attr.default_unit : null,
        hint: hintTexto,
        values,
      });
    }

    const resultado: MlDetalhesCategoriaDireto = {
      categoria: {
        id: String(dadosCatRaw.id || idLimpo),
        name: catName,
        caminho_completo: caminhoCompleto,
        path_from_root: pathFromRoot,
        eh_folha: ehFolha,
        permite_anuncio: permiteAnuncio,
      },
      atributos_obrigatorios: atributosObrigatorios,
    };

    salvarCacheTtl(cacheDetalhesCategoriaMl, idLimpo, resultado);
    return resultado;
  })();

  emVooDetalhesCategoria.set(idLimpo, promessa);
  try {
    return await promessa;
  } finally {
    emVooDetalhesCategoria.delete(idLimpo);
  }
}

async function selecionarCategoriaComJev(
  sugestoes: MlSugestaoCategoria[],
  ficha: FichaProdutoMlHubi
): Promise<string | null> {
  if (sugestoes.length === 0) return null;
  if (sugestoes.length === 1) return sugestoes[0].category_id;

  const chaveCache = `${ficha.produtoId}::${ficha.variacaoId || 'base'}::${sugestoes.map((s) => s.category_id).join(',')}`;
  const emCache = obterCacheTtl(cacheEscolhaCategoriaJev, chaveCache);
  if (emCache && sugestoes.some((s) => s.category_id === emCache)) {
    return emCache;
  }

  const criteria: Record<string, string> = {};
  const mapaChaves = new Map<string, string>();

  sugestoes.forEach((sug, idx) => {
    const idSeguro = sug.category_id.replace(/[^a-zA-Z0-9]/g, '');
    const chave = `cat_${idx}_${idSeguro || idx}`;
    criteria[chave] = sug.domain_name
      ? `${sug.category_name} (Domínio: ${sug.domain_name})`
      : sug.category_name;
    mapaChaves.set(chave, sug.category_id);
  });

  const categoriaLocal =
    [ficha.categoriaLocal, ficha.subcategoriaLocal].filter(Boolean).join(' > ') || 'Não informada';

  const estado = {
    produto_nome: ficha.nome,
    descricao: (ficha.descricao || '').trim().slice(0, 400) || 'Não informada',
    categoria_local_hubi: categoriaLocal,
    ...(ficha.variacaoNome ? { variacao: ficha.variacaoNome } : {}),
  };

  try {
    const resultado = await typesafeService.avaliar(
      estado,
      {
        categoria_ml: typesafeService.criarChoice(
          'Selecione a categoria oficial do Mercado Livre que classifica com maior precisão este produto comercial, considerando o nome, a descrição e a categoria local na Rubi.',
          criteria
        ),
      },
      'jev-latest',
      TIMEOUT_JEV_CATEGORIA_MS
    );

    const resposta = resultado.answers?.categoria_ml;
    if (resposta?.type === 'choice' && mapaChaves.has(resposta.choice)) {
      const catIdEscolhida = mapaChaves.get(resposta.choice)!;
      salvarCacheTtl(cacheEscolhaCategoriaJev, chaveCache, catIdEscolhida);
      return catIdEscolhida;
    }
  } catch (err) {
    console.warn('[mercadoLivreJevService] Fallback para primeira sugestão ML:', (err as Error).message);
  }

  return sugestoes[0].category_id;
}

function garantirSugestaoSelecionada(
  sugestoes: MlSugestaoCategoria[],
  categoria: MlConsultaCategoriaResultado['categoria']
): MlSugestaoCategoria[] {
  if (sugestoes.some((s) => s.category_id === categoria.id)) {
    return sugestoes;
  }
  return [
    {
      category_id: categoria.id,
      category_name: categoria.name,
      domain_name: '',
    },
    ...sugestoes,
  ];
}

function resolverOpcaoPermitida(
  opcoes: MlAtributoValorOpcao[],
  valorCandidato: string
): MlAtributoValorOpcao | null {
  const norm = normalizarTextoComparacao(valorCandidato);
  if (!norm) return null;

  const matchExato = opcoes.find((o) => normalizarTextoComparacao(o.name) === norm);
  if (matchExato) return matchExato;

  return (
    opcoes.find((o) => {
      const optNorm = normalizarTextoComparacao(o.name);
      return optNorm.length >= 2 && (optNorm.includes(norm) || norm.includes(optNorm));
    }) || null
  );
}

function extrairCampoRotuladoDescricao(descricao: string | null | undefined, rotulo: string): string | null {
  if (!descricao) return null;
  const regex = new RegExp(`(?:^|\\n|\\r|;|\\|)\\s*${escaparRegex(rotulo)}\\s*[:=-]\\s*([^\\n\\r;|]{1,60})`, 'i');
  const match = descricao.match(regex);
  if (match && match[1]) {
    const valor = match[1].trim();
    return valor || null;
  }
  return null;
}

function extrairMarcaDeterministica(
  ficha: FichaProdutoMlHubi,
  attrBrand?: MlAtributoObrigatorioCategoria
): string | null {
  if (ficha.marca && ficha.marca.trim()) {
    return ficha.marca.trim();
  }

  const rotulada = extrairCampoRotuladoDescricao(ficha.descricao, 'Marca');
  if (rotulada) {
    return rotulada.slice(0, 40).trim();
  }

  if (attrBrand && attrBrand.values.length > 0) {
    const textoNorm = ` ${normalizarTextoComparacao(`${ficha.nome} ${ficha.descricao || ''}`)} `;
    const opcoesOrdenadas = [...attrBrand.values].sort((a, b) => b.name.length - a.name.length);
    for (const opcao of opcoesOrdenadas) {
      const nomeNorm = normalizarTextoComparacao(opcao.name);
      if (nomeNorm.length < 2 || TERMOS_MARCA_IGNORADOS.has(nomeNorm)) continue;
      const regexFronteira = new RegExp(`(?:^|[^a-z0-9])${escaparRegex(nomeNorm)}(?:$|[^a-z0-9])`);
      if (regexFronteira.test(textoNorm)) {
        return opcao.name;
      }
    }
  }

  return null;
}

function extrairModeloDeterministico(ficha: FichaProdutoMlHubi): string | null {
  if (ficha.modelo && ficha.modelo.trim()) {
    return ficha.modelo.trim();
  }

  const rotulado = extrairCampoRotuladoDescricao(ficha.descricao, 'Modelo');
  if (rotulado) {
    return rotulado.slice(0, 50).trim();
  }

  return null;
}

function formatarNumeroMedidaParaAtributo(
  valor: number | null | undefined,
  unidadeFonte: 'kg' | 'cm',
  attr: MlAtributoObrigatorioCategoria
): string | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return null;

  let convertido = valor;
  const unitLower = (attr.default_unit || '').trim().toLowerCase();

  if (unidadeFonte === 'kg') {
    if (unitLower === 'g') {
      convertido = Math.round(valor * 1000 * 100) / 100;
    }
  } else if (unidadeFonte === 'cm') {
    if (unitLower === 'mm') {
      convertido = Math.round(valor * 10 * 100) / 100;
    } else if (unitLower === 'm') {
      convertido = Math.round((valor / 100) * 1000) / 1000;
    }
  }

  const numStr = String(convertido);
  if (attr.value_type === 'number_unit' && !attr.default_unit) {
    return `${numStr} ${unidadeFonte}`;
  }
  return numStr;
}

function extrairValorNumericoPorUnidade(
  ficha: FichaProdutoMlHubi,
  attr: MlAtributoObrigatorioCategoria
): string | null {
  const unit = (attr.default_unit || '').trim();
  if (!unit) return null;
  if (attr.value_type !== 'number' && attr.value_type !== 'number_unit') return null;

  // Evita ambiguidade em medidas genéricas (altura/largura/comprimento usam campos próprios)
  if (IDS_ALTURA.has(attr.id) || IDS_LARGURA.has(attr.id) || IDS_COMPRIMENTO.has(attr.id) || IDS_PESO.has(attr.id)) {
    return null;
  }

  const texto = `${ficha.nome || ''} ${ficha.descricao || ''} ${ficha.variacaoNome || ''}`;
  const unitLower = unit.toLowerCase();
  const unidadeEspecifica = unitLower.length >= 2 || ['l', 'v', 'w', 'g'].includes(unitLower);
  if (!unidadeEspecifica) return null;

  const regex = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*${escaparRegex(unit)}(?=$|[^a-zA-Z0-9])`,
    'i'
  );
  const match = texto.match(regex);
  if (!match || !match[1]) return null;

  return match[1].replace(',', '.');
}

function extrairAtributoDinamicoDeterministico(
  attr: MlAtributoObrigatorioCategoria,
  ficha: FichaProdutoMlHubi
): ValorAtributoPreenchidoMl | null {
  // Booleanos nunca devem ser forçados via texto solto se houver dúvida; deixamos ao Jev
  if (attr.value_type !== 'boolean') {
    let valorBruto: string | null = null;

    if (IDS_PESO.has(attr.id)) {
      valorBruto = formatarNumeroMedidaParaAtributo(ficha.pesoKg, 'kg', attr);
    } else if (IDS_ALTURA.has(attr.id)) {
      valorBruto = formatarNumeroMedidaParaAtributo(ficha.alturaCm, 'cm', attr);
    } else if (IDS_LARGURA.has(attr.id)) {
      valorBruto = formatarNumeroMedidaParaAtributo(ficha.larguraCm, 'cm', attr);
    } else if (IDS_COMPRIMENTO.has(attr.id)) {
      valorBruto = formatarNumeroMedidaParaAtributo(ficha.comprimentoCm, 'cm', attr);
    } else if (IDS_CODIGO_BARRAS.has(attr.id) && ficha.codigoBarras && ficha.codigoBarras.trim().length >= 8) {
      valorBruto = ficha.codigoBarras.trim();
    } else if (IDS_NOME_PRODUTO.has(attr.id) && ficha.nome.trim()) {
      valorBruto = ficha.nome.trim();
    }

    if (!valorBruto) {
      const attrNomeNorm = normalizarTextoComparacao(attr.name);
      const paresVariacao: Array<{ rotulo?: string | null; valor?: string | null }> = [
        { rotulo: ficha.rotuloVariacao1, valor: ficha.valorVariacao1 },
        { rotulo: ficha.rotuloVariacao2, valor: ficha.valorVariacao2 },
      ];

      for (const par of paresVariacao) {
        if (!par.rotulo || !par.valor?.trim()) continue;
        const rotNorm = normalizarTextoComparacao(par.rotulo);
        if (rotNorm && (rotNorm === attrNomeNorm || attrNomeNorm.includes(rotNorm) || rotNorm.includes(attrNomeNorm))) {
          valorBruto = par.valor.trim();
          break;
        }
      }
    }

    if (!valorBruto) {
      valorBruto = extrairCampoRotuladoDescricao(ficha.descricao, attr.name);
    }

    if (!valorBruto) {
      valorBruto = extrairValorNumericoPorUnidade(ficha, attr);
    }

    if (valorBruto) {
      if (attr.values.length > 0) {
        const opcao = resolverOpcaoPermitida(attr.values, valorBruto);
        if (opcao) {
          return { value_id: opcao.id, value_name: opcao.name };
        }
      } else {
        return { value_name: valorBruto };
      }
    }

    if (attr.values.length === 1) {
      return { value_id: attr.values[0].id, value_name: attr.values[0].name };
    }
  }

  return null;
}

function selecionarCandidatosOpcoes(
  opcoes: MlAtributoValorOpcao[],
  textoProdutoNorm: string,
  maxOpcoes: number
): MlAtributoValorOpcao[] {
  if (opcoes.length <= maxOpcoes) {
    return opcoes;
  }

  const tokensProduto = new Set(textoProdutoNorm.split(' ').filter((t) => t.length >= 2));

  const ranqueadas = opcoes.map((opt, indiceOriginal) => {
    const optNorm = normalizarTextoComparacao(opt.name);
    let score = 0;

    if (optNorm && textoProdutoNorm.includes(optNorm)) {
      score += 10;
    }

    const tokensOpt = optNorm.split(' ').filter((t) => t.length >= 2);
    for (const token of tokensOpt) {
      if (tokensProduto.has(token)) {
        score += 3;
      }
    }

    if (ROTULOS_OPCAO_NEUTRA.some((neutro) => optNorm === neutro || optNorm.includes(neutro))) {
      score += 1;
    }

    return { opt, score, indiceOriginal };
  });

  ranqueadas.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.indiceOriginal - b.indiceOriginal));
  return ranqueadas.slice(0, maxOpcoes).map((r) => r.opt);
}

function montarResultadoComValoresAtuais(
  bruto: CacheAtributosResultadoBruto,
  atributosObrigatorios: MlAtributoObrigatorioCategoria[],
  marcaAtual?: string,
  modeloAtual?: string,
  valoresAtuais?: Record<string, ValorAtributoPreenchidoMl>
): ResultadoPreenchimentoAtributosMl {
  const attrsMap = new Map(atributosObrigatorios.map((a) => [a.id, a]));
  const atributosPreenchidos: Record<string, ValorAtributoPreenchidoMl> = {};

  for (const [attrId, valor] of Object.entries(bruto.atributosPreenchidos)) {
    const metaAttr = attrsMap.get(attrId);
    if (!metaAttr) continue;
    if (valoresAtuais?.[attrId]?.value_name?.trim()) continue;
    if (metaAttr.values.length > 0 && valor.value_id) {
      const aindaValida = metaAttr.values.some((v) => v.id === valor.value_id);
      if (!aindaValida) continue;
    }
    atributosPreenchidos[attrId] = valor;
  }

  const atributosTextoLivrePendentes = atributosObrigatorios.filter((attr) => {
    if (attr.id === 'BRAND' || attr.id === 'MODEL' || attr.id === 'ITEM_CONDITION' || attr.id === 'GTIN') {
      return false;
    }
    if (attr.value_type === 'boolean' || attr.values.length > 0) {
      return false;
    }
    const jaPreenchidoUsuario = Boolean(valoresAtuais?.[attr.id]?.value_name?.trim());
    const jaPreenchidoAutomatico = Boolean(atributosPreenchidos[attr.id]?.value_name?.trim());
    return !jaPreenchidoUsuario && !jaPreenchidoAutomatico;
  });

  return {
    marca: marcaAtual?.trim() ? undefined : bruto.marca,
    modelo: modeloAtual?.trim() ? undefined : bruto.modelo,
    atributosPreenchidos,
    atributosTextoLivrePendentes,
  };
}

function extrairTextoRespostaGemini(data: unknown): string {
  if (!ehRegistroObjeto(data)) return '';
  const candidates = data.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';
  const first = candidates[0];
  if (!ehRegistroObjeto(first) || !ehRegistroObjeto(first.content)) return '';
  const parts = first.content.parts;
  if (!Array.isArray(parts) || parts.length === 0) return '';
  const firstPart = parts[0];
  if (!ehRegistroObjeto(firstPart)) return '';
  return typeof firstPart.text === 'string' ? firstPart.text : '';
}

export const mercadoLivreJevService = {
  /**
   * Descobre e carrega a categoria oficial do Mercado Livre usando `domain_discovery` + Jev Choice (`jev-latest`).
   */
  async descobrirECarregarCategoriaMl(params: {
    lojaId: string;
    tituloConsulta?: string;
    categoryIdEspecifico?: string;
    fichaProduto: FichaProdutoMlHubi;
  }): Promise<MlConsultaCategoriaResultado> {
    const { lojaId, tituloConsulta, categoryIdEspecifico, fichaProduto } = params;
    const catEspecificaLimpa = (categoryIdEspecifico || '').trim();

    if (catEspecificaLimpa) {
      try {
        const detalhes = await buscarDetalhesEAtributosCategoriaDiretoMl(catEspecificaLimpa);
        return {
          sucesso: true,
          categoria: detalhes.categoria,
          sugestoes: [],
          atributos_obrigatorios: detalhes.atributos_obrigatorios,
        };
      } catch {
        const fallback = await mercadoLivreService.consultarCategoria({
          lojaId,
          categoryId: catEspecificaLimpa,
        });
        salvarCacheTtl(cacheDetalhesCategoriaMl, fallback.categoria.id, {
          categoria: fallback.categoria,
          atributos_obrigatorios: fallback.atributos_obrigatorios,
        });
        return {
          ...fallback,
          sugestoes: [],
        };
      }
    }

    const tituloLimpo = (tituloConsulta || '').trim();
    if (!tituloLimpo) {
      throw new Error('Informe o nome ou termo do produto para consultar a categoria no Mercado Livre.');
    }

    let sugestoes: MlSugestaoCategoria[] = [];
    let resultadoFallbackEdge: MlConsultaCategoriaResultado | null = null;

    try {
      sugestoes = await buscarSugestoesCategoriaDiretoMl(tituloLimpo, 5);
    } catch {
      resultadoFallbackEdge = await mercadoLivreService.consultarCategoria({
        lojaId,
        titulo: tituloLimpo,
      });
      salvarCacheTtl(cacheDetalhesCategoriaMl, resultadoFallbackEdge.categoria.id, {
        categoria: resultadoFallbackEdge.categoria,
        atributos_obrigatorios: resultadoFallbackEdge.atributos_obrigatorios,
      });
      sugestoes = Array.isArray(resultadoFallbackEdge.sugestoes) ? resultadoFallbackEdge.sugestoes : [];
    }

    if (sugestoes.length === 0) {
      if (resultadoFallbackEdge?.categoria?.id) {
        return {
          ...resultadoFallbackEdge,
          sugestoes: garantirSugestaoSelecionada([], resultadoFallbackEdge.categoria),
        };
      }
      throw new Error(
        'Não foi possível identificar uma categoria no Mercado Livre para este produto. Tente buscar por outro termo.'
      );
    }

    let categoryIdAlvo = sugestoes[0].category_id;

    if (sugestoes.length >= 2) {
      const [idEscolhidoJev] = await Promise.all([
        selecionarCategoriaComJev(sugestoes, fichaProduto),
        // Prefetch especulativo paralelo caso a escolha coincida com a 1ª sugestão (deduplicado por emVooDetalhesCategoria)
        resultadoFallbackEdge ? Promise.resolve(null) : buscarDetalhesEAtributosCategoriaDiretoMl(sugestoes[0].category_id).catch(() => null),
      ]);

      if (idEscolhidoJev) {
        categoryIdAlvo = idEscolhidoJev;
      }
    }

    if (resultadoFallbackEdge && resultadoFallbackEdge.categoria.id === categoryIdAlvo) {
      return {
        ...resultadoFallbackEdge,
        sugestoes: garantirSugestaoSelecionada(sugestoes, resultadoFallbackEdge.categoria),
      };
    }

    try {
      const detalhes = await buscarDetalhesEAtributosCategoriaDiretoMl(categoryIdAlvo);
      return {
        sucesso: true,
        categoria: detalhes.categoria,
        sugestoes: garantirSugestaoSelecionada(sugestoes, detalhes.categoria),
        atributos_obrigatorios: detalhes.atributos_obrigatorios,
      };
    } catch {
      const fallbackEspecifica = await mercadoLivreService.consultarCategoria({
        lojaId,
        categoryId: categoryIdAlvo,
      });
      salvarCacheTtl(cacheDetalhesCategoriaMl, fallbackEspecifica.categoria.id, {
        categoria: fallbackEspecifica.categoria,
        atributos_obrigatorios: fallbackEspecifica.atributos_obrigatorios,
      });
      return {
        ...fallbackEspecifica,
        sugestoes: garantirSugestaoSelecionada(sugestoes, fallbackEspecifica.categoria),
      };
    }
  },

  /**
   * Pré-preenche atributos obrigatórios com extração determinística (0ms) + lote único Jev (`choice`/`noul`).
   */
  async preencherAtributosCalibradosComJev(params: {
    categoryId: string;
    atributosObrigatorios: MlAtributoObrigatorioCategoria[];
    fichaProduto: FichaProdutoMlHubi;
    marcaAtual?: string;
    modeloAtual?: string;
    valoresAtuais?: Record<string, ValorAtributoPreenchidoMl>;
  }): Promise<ResultadoPreenchimentoAtributosMl> {
    const {
      categoryId,
      atributosObrigatorios,
      fichaProduto,
      marcaAtual,
      modeloAtual,
      valoresAtuais,
    } = params;

    const chaveCache = `${fichaProduto.produtoId}::${fichaProduto.variacaoId || 'base'}::${categoryId}`;
    const brutoEmCache = obterCacheTtl(cacheAtributosJev, chaveCache);
    if (brutoEmCache) {
      return montarResultadoComValoresAtuais(
        brutoEmCache,
        atributosObrigatorios,
        marcaAtual,
        modeloAtual,
        valoresAtuais
      );
    }

    // Etapa A: Extração determinística direta (0ms)
    const attrBrand = atributosObrigatorios.find((a) => a.id === 'BRAND');
    let marcaDetectada = !marcaAtual?.trim() ? extrairMarcaDeterministica(fichaProduto, attrBrand) || undefined : undefined;
    const modeloDetectado = !modeloAtual?.trim() ? extrairModeloDeterministico(fichaProduto) || undefined : undefined;

    const atributosPreenchidos: Record<string, ValorAtributoPreenchidoMl> = {};

    for (const attr of atributosObrigatorios) {
      if (attr.id === 'BRAND' || attr.id === 'MODEL' || attr.id === 'ITEM_CONDITION' || attr.id === 'GTIN') {
        continue;
      }
      if (valoresAtuais?.[attr.id]?.value_name?.trim()) continue;

      const valorDet = extrairAtributoDinamicoDeterministico(attr, fichaProduto);
      if (valorDet) {
        atributosPreenchidos[attr.id] = valorDet;
      }
    }

    // Etapa B: Lote único Jev para lista fechada (`choice`) e booleanos (`noul`)
    const perguntas: Record<string, PerguntaTypeSafe> = {};
    const metadadosPergunta = new Map<
      string,
      {
        attr: MlAtributoObrigatorioCategoria;
        tipo: 'noul' | 'choice';
        mapaOpcoes?: Map<string, MlAtributoValorOpcao>;
      }
    >();

    const textoProdutoNorm = normalizarTextoComparacao(
      `${fichaProduto.nome} ${fichaProduto.descricao || ''} ${fichaProduto.categoriaLocal || ''} ${fichaProduto.subcategoriaLocal || ''} ${fichaProduto.variacaoNome || ''}`
    );

    const adicionarPergunta = (attr: MlAtributoObrigatorioCategoria) => {
      if (Object.keys(perguntas).length >= MAX_PERGUNTAS_LOTE_JEV) return;
      const key = `q_${attr.id}`;

      if (attr.value_type === 'boolean') {
        perguntas[key] = typesafeService.criarNoul(
          `O produto comercial descrito possui ou atende ao atributo "${attr.name}"?${attr.hint ? ` (${attr.hint})` : ''}`,
          {
            true: `Sim, aplica-se / verdadeiro para "${attr.name}"`,
            false: `Não se aplica / falso ou não informado`,
          }
        );
        metadadosPergunta.set(key, { attr, tipo: 'noul' });
        return;
      }

      if (attr.values.length > 0) {
        const candidatas = selecionarCandidatosOpcoes(attr.values, textoProdutoNorm, MAX_OPCOES_CHOICE_JEV);
        const criterios: Record<string, string> = {};
        const mapaOpcoes = new Map<string, MlAtributoValorOpcao>();

        candidatas.forEach((opt, idx) => {
          const optKey = `op_${idx}_${opt.id.replace(/[^a-zA-Z0-9]/g, '')}`;
          criterios[optKey] = opt.name;
          mapaOpcoes.set(optKey, opt);
        });
        criterios.nao_identificado = 'Não é possível identificar com segurança pela ficha do produto';

        perguntas[key] = typesafeService.criarChoice(
          `Selecione a opção oficial mais precisa para o atributo "${attr.name}" deste produto.${attr.hint ? ` Observação: ${attr.hint}` : ''}`,
          criterios
        );
        metadadosPergunta.set(key, { attr, tipo: 'choice', mapaOpcoes });
      }
    };

    if (!marcaAtual?.trim() && !marcaDetectada && attrBrand && attrBrand.value_type !== 'boolean' && attrBrand.values.length > 0) {
      adicionarPergunta(attrBrand);
    }

    for (const attr of atributosObrigatorios) {
      if (attr.id === 'BRAND' || attr.id === 'MODEL' || attr.id === 'ITEM_CONDITION' || attr.id === 'GTIN') {
        continue;
      }
      if (valoresAtuais?.[attr.id]?.value_name?.trim() || atributosPreenchidos[attr.id]?.value_name?.trim()) {
        continue;
      }
      if (attr.value_type === 'boolean' || attr.values.length > 0) {
        adicionarPergunta(attr);
      }
    }

    if (Object.keys(perguntas).length > 0) {
      const marcaContexto = marcaAtual?.trim() || marcaDetectada;
      const modeloContexto = modeloAtual?.trim() || modeloDetectado;
      const categoriaLocalTexto = [fichaProduto.categoriaLocal, fichaProduto.subcategoriaLocal]
        .filter(Boolean)
        .join(' > ');

      const estadoFicha: Record<string, unknown> = {
        nome: fichaProduto.nome,
        descricao: (fichaProduto.descricao || '').trim().slice(0, 500) || 'Não informada',
        categoria_local: categoriaLocalTexto || 'Não informada',
        ...(fichaProduto.variacaoNome ? { variacao: fichaProduto.variacaoNome } : {}),
        ...(fichaProduto.rotuloVariacao1 && fichaProduto.valorVariacao1
          ? { [`variacao_1_${sanitizarChaveEstado(fichaProduto.rotuloVariacao1)}`]: fichaProduto.valorVariacao1 }
          : {}),
        ...(fichaProduto.rotuloVariacao2 && fichaProduto.valorVariacao2
          ? { [`variacao_2_${sanitizarChaveEstado(fichaProduto.rotuloVariacao2)}`]: fichaProduto.valorVariacao2 }
          : {}),
        ...(marcaContexto ? { marca: marcaContexto } : {}),
        ...(modeloContexto ? { modelo: modeloContexto } : {}),
      };

      try {
        const resJev = await typesafeService.avaliar(
          estadoFicha,
          perguntas,
          'jev-latest',
          TIMEOUT_JEV_ATRIBUTOS_MS
        );

        for (const [key, meta] of metadadosPergunta.entries()) {
          const resp = resJev.answers?.[key];
          if (!resp) continue;

          if (meta.tipo === 'noul' && resp.type === 'noul') {
            const opcaoSim = meta.attr.values.find(
              (v) => v.id === '242085' || normalizarTextoComparacao(v.name) === 'sim'
            );
            const opcaoNao = meta.attr.values.find(
              (v) => v.id === '242084' || normalizarTextoComparacao(v.name) === 'nao'
            );

            if (resp.noul >= 0.6) {
              atributosPreenchidos[meta.attr.id] = {
                value_id: opcaoSim?.id || '242085',
                value_name: opcaoSim?.name || 'Sim',
              };
            } else if (resp.noul <= 0.4) {
              atributosPreenchidos[meta.attr.id] = {
                value_id: opcaoNao?.id || '242084',
                value_name: opcaoNao?.name || 'Não',
              };
            }
          } else if (meta.tipo === 'choice' && resp.type === 'choice') {
            if (resp.choice !== 'nao_identificado' && resp.confidence >= 0.45) {
              const opcao = meta.mapaOpcoes?.get(resp.choice);
              if (opcao) {
                if (meta.attr.id === 'BRAND') {
                  if (!marcaDetectada) marcaDetectada = opcao.name;
                } else {
                  atributosPreenchidos[meta.attr.id] = {
                    value_id: opcao.id,
                    value_name: opcao.name,
                  };
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[mercadoLivreJevService] Lote Jev de atributos degradou graciosamente:', (err as Error).message);
      }
    }

    const bruto: CacheAtributosResultadoBruto = {
      marca: marcaDetectada,
      modelo: modeloDetectado,
      atributosPreenchidos,
    };

    salvarCacheTtl(cacheAtributosJev, chaveCache, bruto);

    return montarResultadoComValoresAtuais(
      bruto,
      atributosObrigatorios,
      marcaAtual,
      modeloAtual,
      valoresAtuais
    );
  },

  /**
   * Fallback restrito via `gemini-proxy` exclusivamente para atributos obrigatórios de texto livre/numérico
   * que não puderam ser preenchidos pelos campos locais do HUBI nem pelas primitivas Jev.
   */
  async preencherAtributosTextoLivreViaGemini(params: {
    lojaId: string;
    categoryId: string;
    fichaProduto: FichaProdutoMlHubi;
    marcaAtual?: string;
    modeloAtual?: string;
    atributosPendentes: MlAtributoObrigatorioCategoria[];
  }): Promise<Record<string, ValorAtributoPreenchidoMl>> {
    const { lojaId, categoryId, fichaProduto, marcaAtual, modeloAtual, atributosPendentes } = params;
    if (!lojaId || atributosPendentes.length === 0) return {};

    const chaveCache = `${fichaProduto.produtoId}::${fichaProduto.variacaoId || 'base'}::${categoryId}`;
    const emCache = obterCacheTtl(cacheGeminiTextoLivre, chaveCache);
    if (emCache) return emCache;

    const contextoProduto = {
      nome: fichaProduto.nome,
      descricao: (fichaProduto.descricao || '').trim().slice(0, 600) || null,
      categoria_local: [fichaProduto.categoriaLocal, fichaProduto.subcategoriaLocal].filter(Boolean).join(' > ') || null,
      marca: marcaAtual?.trim() || fichaProduto.marca || null,
      modelo: modeloAtual?.trim() || fichaProduto.modelo || null,
      codigo_barras: fichaProduto.codigoBarras || null,
      variacao: fichaProduto.variacaoNome || null,
    };

    const camposSolicitados = atributosPendentes.map((attr) => ({
      id: attr.id,
      nome: attr.name,
      tipo: attr.value_type,
      unidade_padrao: attr.default_unit || null,
      dica: attr.hint || null,
    }));

    const prompt = [
      'Extraia APENAS os atributos técnicos de texto livre/numérico solicitados a partir da ficha do produto.',
      'Regras estritas:',
      '1. Responda exclusivamente com um objeto JSON plano no formato {"ATTR_ID": "valor curto" | null}.',
      '2. Se não houver evidência clara na ficha do produto para preencher o atributo, retorne null.',
      '3. Para tipo "number" ou "number_unit" com unidade_padrao informada, retorne apenas o número (ex: "500").',
      '',
      `Produto Rubi: ${JSON.stringify(contextoProduto)}`,
      `Atributos solicitados: ${JSON.stringify(camposSolicitados)}`,
    ].join('\n');

    try {
      const requisicao = supabase.functions.invoke('gemini-proxy', {
        body: {
          model: 'gemini-3.8-flash',
          action: 'generateContent',
          loja_id: lojaId,
          requestBody: {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 256,
              responseMimeType: 'application/json',
              thinkingConfig: { thinkingBudget: 0 },
            },
          },
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout fallback Gemini')), TIMEOUT_GEMINI_FALLBACK_MS)
      );

      const { data, error } = await Promise.race([requisicao, timeoutPromise]);
      if (error) return {};

      const textoJson = extrairTextoRespostaGemini(data);
      if (!textoJson.trim()) return {};

      const jsonLimpo = textoJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed: unknown = JSON.parse(jsonLimpo);
      if (!ehRegistroObjeto(parsed)) return {};

      const preenchidos: Record<string, ValorAtributoPreenchidoMl> = {};
      for (const attr of atributosPendentes) {
        const valorRaw = parsed[attr.id];
        if (typeof valorRaw !== 'string' && typeof valorRaw !== 'number') continue;

        let valorStr = String(valorRaw).trim();
        if (!valorStr || /^(null|undefined|n\/a|nao informado|não informado)$/i.test(valorStr)) continue;

        if (attr.value_type === 'number') {
          const matchNum = valorStr.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
          if (!matchNum) continue;
          valorStr = matchNum[0];
        }

        preenchidos[attr.id] = { value_name: valorStr.slice(0, 60) };
      }

      salvarCacheTtl(cacheGeminiTextoLivre, chaveCache, preenchidos);
      return preenchidos;
    } catch {
      return {};
    }
  },
};
