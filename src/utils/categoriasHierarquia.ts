import { Categoria, Produto } from '../types';

const CHAVE_VINCULOS_SUBCATS = (lojaId: string) => `hubi_subcategorias_pai_map_${lojaId}`;
const CHAVE_PRODUTO_SUBCATS = (lojaId: string) => `hubi_produtos_subcategoria_map_${lojaId}`;

export function lerMapaCategoriaPaiLocal(lojaId?: string | null): Record<string, string> {
  if (!lojaId) return {};
  try {
    const raw = localStorage.getItem(CHAVE_VINCULOS_SUBCATS(lojaId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function salvarVinculoCategoriaPaiLocal(lojaId: string, subcategoriaId: string, categoriaPaiId: string | null) {
  if (!lojaId || !subcategoriaId) return;
  try {
    const atual = lerMapaCategoriaPaiLocal(lojaId);
    if (categoriaPaiId) {
      atual[subcategoriaId] = categoriaPaiId;
    } else {
      delete atual[subcategoriaId];
    }
    localStorage.setItem(CHAVE_VINCULOS_SUBCATS(lojaId), JSON.stringify(atual));
  } catch {
    // ignore storage quota errors
  }
}

export function lerMapaSubcategoriaProdutoLocal(lojaId?: string | null): Record<string, string> {
  if (!lojaId) return {};
  try {
    const raw = localStorage.getItem(CHAVE_PRODUTO_SUBCATS(lojaId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function salvarVinculoSubcategoriaProdutoLocal(lojaId: string, produtoId: string, subcategoriaId: string | null) {
  if (!lojaId || !produtoId) return;
  try {
    const atual = lerMapaSubcategoriaProdutoLocal(lojaId);
    if (subcategoriaId) {
      atual[produtoId] = subcategoriaId;
    } else {
      delete atual[produtoId];
    }
    localStorage.setItem(CHAVE_PRODUTO_SUBCATS(lojaId), JSON.stringify(atual));
  } catch {
    // ignore
  }
}

export interface CategoriaComFilhas extends Categoria {
  subcategorias: Categoria[];
}

export function obterCategoriaPaiId(cat: Categoria, lojaId?: string | null): string | null {
  if (cat.categoria_pai_id !== undefined && cat.categoria_pai_id !== null) {
    return cat.categoria_pai_id;
  }
  const mapaLocal = lerMapaCategoriaPaiLocal(lojaId || cat.loja_id);
  return mapaLocal[cat.id] || null;
}

/**
 * Normaliza a lista de categorias injetando `categoria_pai_id` (do banco ou fallback local)
 * e retorna todas as categorias enriquecidas.
 */
export function normalizarCategoriasComHierarquia(categorias: Categoria[], lojaId?: string | null): Categoria[] {
  const mapaLocal = lerMapaCategoriaPaiLocal(lojaId || categorias[0]?.loja_id);
  return categorias.map((cat) => {
    const paiId = cat.categoria_pai_id !== undefined && cat.categoria_pai_id !== null
      ? cat.categoria_pai_id
      : (mapaLocal[cat.id] || null);
    return {
      ...cat,
      categoria_pai_id: paiId,
    };
  });
}

/**
 * Retorna apenas as categorias principais (sem pai), cada uma com seu array `subcategorias`.
 */
export function obterArvoreCategorias(categorias: Categoria[], lojaId?: string | null): CategoriaComFilhas[] {
  const normalizadas = normalizarCategoriasComHierarquia(categorias, lojaId);
  const idsExistentes = new Set(normalizadas.map((c) => c.id));

  const principais = normalizadas.filter(
    (c) => !c.categoria_pai_id || !idsExistentes.has(c.categoria_pai_id)
  );

  return principais.map((pai) => ({
    ...pai,
    subcategorias: normalizadas.filter((filha) => filha.categoria_pai_id === pai.id),
  }));
}

/**
 * Retorna as subcategorias filhas diretas de uma categoria pai.
 */
export function obterSubcategoriasDe(categorias: Categoria[], categoriaPaiId?: string | null, lojaId?: string | null): Categoria[] {
  if (!categoriaPaiId) return [];
  const normalizadas = normalizarCategoriasComHierarquia(categorias, lojaId);
  return normalizadas.filter((c) => c.categoria_pai_id === categoriaPaiId);
}

/**
 * Resolve o ID da subcategoria de um produto (do banco ou fallback local).
 */
export function obterSubcategoriaIdProduto(produto: Produto, lojaId?: string | null): string | null {
  if (produto.subcategoria_id) return produto.subcategoria_id;
  const mapa = lerMapaSubcategoriaProdutoLocal(lojaId || produto.loja_id);
  return mapa[produto.id] || null;
}

/**
 * Retorna o texto do badge superior esquerdo do card de produto:
 * Prioriza o nome da Subcategoria (se houver), ou o nome da Categoria principal.
 */
export function obterTextoBadgeCategoriaProduto(
  produto: Produto,
  categorias: Categoria[],
  lojaId?: string | null
): string | null {
  const subId = obterSubcategoriaIdProduto(produto, lojaId);
  if (subId) {
    const sub = categorias.find((c) => c.id === subId);
    if (sub?.nome) return sub.nome;
  }
  if (produto.subcategoria_nome) return produto.subcategoria_nome;
  if (produto.subcategoria?.nome) return produto.subcategoria.nome;

  if (produto.categoria_id) {
    const cat = categorias.find((c) => c.id === produto.categoria_id);
    if (cat?.nome) return cat.nome;
  }
  if (produto.categoria_nome) return produto.categoria_nome;
  if (produto.categoria?.nome) return produto.categoria.nome;

  return null;
}

/**
 * Verifica se um produto pertence à categoria ou subcategoria selecionada no filtro.
 */
export function produtoPertenceAoFiltroCategoria(
  produto: Produto,
  filtroCategoriaId: string,
  categorias: Categoria[],
  lojaId?: string | null
): boolean {
  if (!filtroCategoriaId || filtroCategoriaId === 'todas' || filtroCategoriaId === 'favoritos') {
    return true;
  }

  const subId = obterSubcategoriaIdProduto(produto, lojaId);

  // Match direto na categoria ou subcategoria do produto
  if (produto.categoria_id === filtroCategoriaId || subId === filtroCategoriaId) {
    return true;
  }

  // Se o filtro for uma categoria Pai, verifica se o produto está vinculado a alguma subcategoria filha dessa categoria Pai
  const subcategoriasFilhas = obterSubcategoriasDe(categorias, filtroCategoriaId, lojaId);
  if (subcategoriasFilhas.length > 0) {
    const idsFilhas = new Set(subcategoriasFilhas.map((s) => s.id));
    if ((produto.categoria_id && idsFilhas.has(produto.categoria_id)) || (subId && idsFilhas.has(subId))) {
      return true;
    }
  }

  return false;
}

/**
 * Retorna um emoji representativo para o cabeçalho do bloco de categoria.
 */
export function obterEmojiCategoria(nomeCategoria: string): string {
  const n = (nomeCategoria || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (n.includes('hortifrut') || n.includes('verdura') || n.includes('legume') || n.includes('fruta') || n.includes('salada')) return '🥬';
  if (n.includes('carne') || n.includes('acougue') || n.includes('churrasc') || n.includes('bovin') || n.includes('suin')) return '🥩';
  if (n.includes('ave') || n.includes('frango') || n.includes(' galinha')) return '🍗';
  if (n.includes('peixe') || n.includes('pescad') || n.includes('marisco') || n.includes('frutos do mar')) return '🐟';
  if (n.includes('bebida') || n.includes('refrigerante') || n.includes('suco') || n.includes('agua')) return '🥤';
  if (n.includes('cerveja') || n.includes('chopp') || n.includes('alcool') || n.includes('destilad') || n.includes('vinho') || n.includes('adega')) return '🍺';
  if (n.includes('padaria') || n.includes('pao') || n.includes('paes') || n.includes('confeitaria') || n.includes('bolo')) return '🥖';
  if (n.includes('laticin') || n.includes('frios') || n.includes('queijo') || n.includes('leite') || n.includes('iogurte')) return '🧀';
  if (n.includes('mercearia') || n.includes('graos') || n.includes('cereal') || n.includes('arroz') || n.includes('feijao') || n.includes('massa')) return '🛒';
  if (n.includes('limpeza') || n.includes('lavanderia') || n.includes('detergente')) return '🧼';
  if (n.includes('higiene') || n.includes('perfumaria') || n.includes('cosmetic') || n.includes('beleza')) return '🧴';
  if (n.includes('doce') || n.includes('biscoito') || n.includes('chocolate') || n.includes('sobremesa') || n.includes('bomboniere')) return '🍫';
  if (n.includes('congelad') || n.includes('sorvete') || n.includes('gelo')) return '🧊';
  if (n.includes('pet') || n.includes('racao') || n.includes('animai')) return '🐾';
  if (n.includes('utilidade') || n.includes('azar') || n.includes('casa') || n.includes('cozinha')) return '🏠';
  if (n.includes('eletronic') || n.includes('informatica') || n.includes('celular') || n.includes('acessorio')) return '📱';
  if (n.includes('roupa') || n.includes('vestuario') || n.includes('moda') || n.includes('calcado')) return '👕';
  if (n.includes('farmacia') || n.includes('medicamento') || n.includes('saude')) return '💊';
  if (n.includes('papelaria') || n.includes('escolar') || n.includes('escritorio')) return '✏️';
  if (n.includes('ferramenta') || n.includes('construcao') || n.includes('eletrica') || n.includes('hidraulica')) return '🛠️';
  if (n.includes('auto') || n.includes('moto') || n.includes('veicul') || n.includes('lubrificante')) return '🚗';
  if (n.includes('descartave') || n.includes('embalage')) return '📦';
  if (n.includes('tempero') || n.includes('condimento') || n.includes('molho')) return '🧂';
  if (n.includes('fitness') || n.includes('suplemento') || n.includes('natural')) return '💪';
  return '🏷️';
}

/**
 * Agrupa uma lista de produtos por categoria principal, respeitando a sequência de cadastro (`categorias`).
 */
export interface BlocoCategoriaProdutos {
  categoriaId: string;
  categoriaNome: string;
  emoji: string;
  produtos: Produto[];
}

export function agruparProdutosPorBlocosDeCategoria(
  produtos: Produto[],
  categorias: Categoria[],
  lojaId?: string | null
): BlocoCategoriaProdutos[] {
  if (produtos.length === 0) return [];

  const arvore = obterArvoreCategorias(categorias, lojaId);
  const mapaCategoriaPorId = new Map<string, Categoria>();
  const normalizadas = normalizarCategoriasComHierarquia(categorias, lojaId);
  normalizadas.forEach((c) => mapaCategoriaPorId.set(c.id, c));

  // Mapa de ID de categoria principal -> lista de produtos
  const grupos = new Map<string, Produto[]>();
  const semCategoria: Produto[] = [];

  for (const prod of produtos) {
    let catPaiId: string | null = null;

    if (prod.categoria_id && mapaCategoriaPorId.has(prod.categoria_id)) {
      const catObj = mapaCategoriaPorId.get(prod.categoria_id)!;
      catPaiId = catObj.categoria_pai_id || catObj.id;
    } else {
      const subId = obterSubcategoriaIdProduto(prod, lojaId);
      if (subId && mapaCategoriaPorId.has(subId)) {
        const subObj = mapaCategoriaPorId.get(subId)!;
        catPaiId = subObj.categoria_pai_id || subObj.id;
      }
    }

    if (catPaiId) {
      const lista = grupos.get(catPaiId) || [];
      lista.push(prod);
      grupos.set(catPaiId, lista);
    } else {
      semCategoria.push(prod);
    }
  }

  const blocos: BlocoCategoriaProdutos[] = [];

  // 1. Segue a ordem exata da árvore de categorias cadastradas
  for (const catPai of arvore) {
    const prods = grupos.get(catPai.id);
    if (prods && prods.length > 0) {
      blocos.push({
        categoriaId: catPai.id,
        categoriaNome: catPai.nome,
        emoji: obterEmojiCategoria(catPai.nome),
        produtos: prods,
      });
      grupos.delete(catPai.id);
    }
  }

  // 2. Qualquer categoria remanescente não listada na raiz
  for (const [catId, prods] of grupos.entries()) {
    if (prods.length > 0) {
      const cat = mapaCategoriaPorId.get(catId);
      const nome = cat?.nome || 'Outros';
      blocos.push({
        categoriaId: catId,
        categoriaNome: nome,
        emoji: obterEmojiCategoria(nome),
        produtos: prods,
      });
    }
  }

  // 3. Produtos sem categoria vinculada ao final
  if (semCategoria.length > 0) {
    blocos.push({
      categoriaId: 'sem-categoria',
      categoriaNome: 'Geral / Outros',
      emoji: '📦',
      produtos: semCategoria,
    });
  }

  return blocos;
}
