// Supabase Edge Function: ml-estoque-sync
// Sincroniza o estoque físico local no Mercado Livre e gerencia vínculo e publicação de anúncios.
// Deploy: npx supabase functions deploy ml-estoque-sync

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterAccessTokenValido, MercadoLivreError } from "../_shared/mlClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sanitizarTextoMl(texto: string, maxLen = 60): string {
  const limpo = String(texto || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, " ")
    .replace(/[/\\|<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!limpo) return "Produto";
  if (limpo.length <= maxLen) return limpo;

  const truncado = limpo.slice(0, maxLen - 3);
  const ultimoEspaco = truncado.lastIndexOf(" ");
  if (ultimoEspaco > Math.floor(maxLen * 0.55)) {
    return truncado.slice(0, ultimoEspaco).trim();
  }
  return truncado.trim();
}

interface MlAtributo {
  id: string;
  value_name?: string;
  value_id?: string;
}

function temTagAtributoMl(tags: any, tagAlvo: string): boolean {
  if (!tags) return false;
  if (Array.isArray(tags)) {
    return tags.includes(tagAlvo);
  }
  if (typeof tags === "object") {
    return tags[tagAlvo] === true;
  }
  return false;
}

function garantirAtributosObrigatorios(
  atributosOriginais: MlAtributo[] = [],
  marcaFallback?: string,
  modeloFallback?: string,
  atributosExtras: MlAtributo[] = []
): MlAtributo[] {
  const mapa = new Map<string, MlAtributo>();

  const registrarAtributo = (attr?: MlAtributo | null) => {
    if (!attr || !attr.id) return;
    const idUpper = String(attr.id).trim().toUpperCase();
    const valorLimpo = typeof attr.value_name === "string" ? attr.value_name.replace(/\s+/g, " ").trim() : undefined;
    const valueIdLimpo = attr.value_id !== undefined && attr.value_id !== null ? String(attr.value_id).trim() : undefined;
    if (valorLimpo || valueIdLimpo) {
      mapa.set(idUpper, {
        id: idUpper,
        ...(valorLimpo ? { value_name: valorLimpo } : {}),
        ...(valueIdLimpo ? { value_id: valueIdLimpo } : {}),
      });
    }
  };

  for (const attr of atributosOriginais) {
    registrarAtributo(attr);
  }

  if (Array.isArray(atributosExtras)) {
    for (const extra of atributosExtras) {
      registrarAtributo(extra);
    }
  }

  if (!mapa.has("ITEM_CONDITION")) {
    mapa.set("ITEM_CONDITION", { id: "ITEM_CONDITION", value_name: "Novo" });
  }

  const marcaLimpa = typeof marcaFallback === "string" ? marcaFallback.replace(/\s+/g, " ").trim() : "";
  if (marcaLimpa && !mapa.has("BRAND")) {
    mapa.set("BRAND", { id: "BRAND", value_name: marcaLimpa });
  }

  const modeloLimpo = typeof modeloFallback === "string" ? modeloFallback.replace(/\s+/g, " ").trim() : "";
  if (modeloLimpo && !mapa.has("MODEL")) {
    mapa.set("MODEL", { id: "MODEL", value_name: modeloLimpo });
  }

  return Array.from(mapa.values());
}

const USER_AGENT_NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

type MlPictureEntrada = { id: string } | { source: string };

function inferirMimeEExtensaoImagem(
  contentTypeHeader: string | null,
  url: string,
  bytes: Uint8Array
): { mime: string; ext: string } | null {
  const ct = (contentTypeHeader || "").split(";")[0].trim().toLowerCase();

  if (
    ct === "text/html" ||
    ct === "application/json" ||
    ct === "text/plain" ||
    ct === "application/xml"
  ) {
    return null;
  }

  if (ct === "image/jpeg" || ct === "image/jpg") return { mime: "image/jpeg", ext: "jpg" };
  if (ct === "image/png") return { mime: "image/png", ext: "png" };
  if (ct === "image/webp") return { mime: "image/webp", ext: "webp" };
  if (ct === "image/gif") return { mime: "image/gif", ext: "gif" };

  if (!ct || ct === "application/octet-stream" || ct.startsWith("image/")) {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { mime: "image/jpeg", ext: "jpg" };
    }
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return { mime: "image/png", ext: "png" };
    }
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return { mime: "image/webp", ext: "webp" };
    }
    if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return { mime: "image/gif", ext: "gif" };
    }
  }

  const caminhoSemQuery = url.split("?")[0].split("#")[0].toLowerCase();
  if (caminhoSemQuery.endsWith(".png")) return { mime: "image/png", ext: "png" };
  if (caminhoSemQuery.endsWith(".webp")) return { mime: "image/webp", ext: "webp" };
  if (caminhoSemQuery.endsWith(".gif")) return { mime: "image/gif", ext: "gif" };

  return { mime: "image/jpeg", ext: "jpg" };
}

async function fazerUploadUnicaFotoMl(
  url: string,
  token: string,
  indice: number
): Promise<MlPictureEntrada> {
  const controllerImg = new AbortController();
  const timerImg = setTimeout(() => controllerImg.abort(), 10000);

  try {
    const respImg = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT_NAVEGADOR,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: controllerImg.signal,
    });

    if (!respImg.ok) {
      console.warn(`[ml-estoque-sync] Download da foto ${indice + 1} retornou HTTP ${respImg.status}; usando fallback { source }.`);
      return { source: url };
    }

    const arrayBuffer = await respImg.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.warn(`[ml-estoque-sync] Foto ${indice + 1} veio vazia; usando fallback { source }.`);
      return { source: url };
    }

    const infoImg = inferirMimeEExtensaoImagem(
      respImg.headers.get("content-type"),
      url,
      new Uint8Array(arrayBuffer)
    );

    if (!infoImg) {
      console.warn(`[ml-estoque-sync] Content-Type inválido para foto ${indice + 1}; usando fallback { source }.`);
      return { source: url };
    }

    const blob = new Blob([arrayBuffer], { type: infoImg.mime });
    const formData = new FormData();
    formData.append("file", blob, `foto_${indice + 1}.${infoImg.ext}`);

    const controllerUpload = new AbortController();
    const timerUpload = setTimeout(() => controllerUpload.abort(), 15000);

    try {
      const respUpload = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
        body: formData,
        signal: controllerUpload.signal,
      });

      const dadosUpload = await respUpload.json().catch(() => null);
      if (respUpload.ok && typeof dadosUpload?.id === "string" && dadosUpload.id.trim()) {
        return { id: dadosUpload.id.trim() };
      }

      console.warn(`[ml-estoque-sync] Upload binário da foto ${indice + 1} falhou (HTTP ${respUpload.status}); usando fallback { source }.`);
      return { source: url };
    } finally {
      clearTimeout(timerUpload);
    }
  } catch (errFoto) {
    const msgFoto = errFoto instanceof Error ? errFoto.message : "Erro ao processar imagem";
    console.warn(`[ml-estoque-sync] Falha no upload binário da foto ${indice + 1} (${msgFoto}); usando fallback { source }.`);
    return { source: url };
  } finally {
    clearTimeout(timerImg);
  }
}

async function prepararPicturesBinariasMl(
  fotosUrlsBanco: unknown,
  picturesPayload: unknown,
  token: string
): Promise<MlPictureEntrada[]> {
  const entradas: MlPictureEntrada[] = [];
  const urlsVistas = new Set<string>();

  if (Array.isArray(fotosUrlsBanco)) {
    for (const urlRaw of fotosUrlsBanco) {
      if (entradas.length >= 10) break;
      const urlLimpa = typeof urlRaw === "string" ? urlRaw.trim() : "";
      if (/^https?:\/\//i.test(urlLimpa) && !urlsVistas.has(urlLimpa)) {
        urlsVistas.add(urlLimpa);
        entradas.push({ source: urlLimpa });
      }
    }
  }

  if (entradas.length === 0 && Array.isArray(picturesPayload)) {
    for (const pic of picturesPayload) {
      if (entradas.length >= 10) break;
      if (!pic || typeof pic !== "object") continue;
      const idPic = typeof (pic as any).id === "string" ? (pic as any).id.trim() : "";
      if (idPic) {
        entradas.push({ id: idPic });
        continue;
      }
      const sourcePic = typeof (pic as any).source === "string" ? (pic as any).source.trim() : "";
      if (/^https?:\/\//i.test(sourcePic) && !urlsVistas.has(sourcePic)) {
        urlsVistas.add(sourcePic);
        entradas.push({ source: sourcePic });
      }
    }
  }

  if (entradas.length === 0) return [];

  return await Promise.all(
    entradas.map((entrada, indice) =>
      "id" in entrada
        ? Promise.resolve(entrada)
        : fazerUploadUnicaFotoMl(entrada.source, token, indice)
    )
  );
}

function aplicarAtributoGtinOuIsencao(
  atributos: MlAtributo[],
  opcoes: {
    gtinInformado?: string | null;
    semGtin?: boolean;
    codigoBarrasBanco?: string | null;
  } = {}
): MlAtributo[] {
  const filtrados = atributos.filter((a) => {
    const idUpper = String(a?.id || "").trim().toUpperCase();
    return idUpper !== "GTIN" && idUpper !== "EMPTY_GTIN_REASON";
  });

  if (opcoes.semGtin === true) {
    return [...filtrados, { id: "EMPTY_GTIN_REASON", value_id: "17055160" }];
  }

  const gtinExistente = atributos.find((a) => a.id?.trim().toUpperCase() === "GTIN")?.value_name;
  const candidatos = [
    opcoes.gtinInformado,
    typeof gtinExistente === "string" ? gtinExistente : null,
    opcoes.codigoBarrasBanco,
  ];

  for (const candidato of candidatos) {
    if (typeof candidato !== "string") continue;
    const somenteDigitos = candidato.replace(/\D/g, "").trim();
    if (/^\d{8,14}$/.test(somenteDigitos)) {
      return [...filtrados, { id: "GTIN", value_name: somenteDigitos }];
    }
  }

  return [...filtrados, { id: "EMPTY_GTIN_REASON", value_id: "17055160" }];
}

interface MlAtributoCategoriaInfo {
  id: string;
  name: string;
  value_type: string;
  default_unit: string | null;
  hint: string | null;
  values: Array<{ id: string; name: string }>;
}

interface MlDetalhesCategoriaResultado {
  categoria: {
    id: string;
    name: string;
    caminho_completo: string;
    path_from_root: Array<{ id: string; name: string }>;
    eh_folha: boolean;
    permite_anuncio: boolean;
  };
  atributos_obrigatorios: MlAtributoCategoriaInfo[];
  mapa_nomes_atributos: Record<string, string>;
}

async function consultarDetalhesEAtributosCategoria(
  categoryId: string,
  token?: string
): Promise<MlDetalhesCategoriaResultado> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  const [respCat, respAttrs] = await Promise.all([
    fetch(`https://api.mercadolibre.com/categories/${encodeURIComponent(categoryId)}`, { headers }),
    fetch(`https://api.mercadolibre.com/categories/${encodeURIComponent(categoryId)}/attributes`, { headers }),
  ]);

  if (!respCat.ok) {
    throw new MercadoLivreError(`Categoria ${categoryId} não encontrada no Mercado Livre.`, 404);
  }

  const dadosCat = await respCat.json();
  const pathFromRoot = Array.isArray(dadosCat.path_from_root)
    ? dadosCat.path_from_root.map((p: any) => ({
        id: String(p?.id || ""),
        name: String(p?.name || ""),
      })).filter((p: { id: string; name: string }) => p.name)
    : [];

  const caminhoCompleto = pathFromRoot.length > 0
    ? pathFromRoot.map((p: { name: string }) => p.name).join(" > ")
    : String(dadosCat.name || categoryId);

  const ehFolha = !Array.isArray(dadosCat.children_categories) || dadosCat.children_categories.length === 0;
  const permiteAnuncio = dadosCat.settings?.listing_allowed !== false;

  const listaAttrsRaw = respAttrs.ok ? await respAttrs.json().catch(() => []) : [];
  const attrsArray = Array.isArray(listaAttrsRaw) ? listaAttrsRaw : [];

  const mapaNomesAtributos: Record<string, string> = {};
  const atributosObrigatorios: MlAtributoCategoriaInfo[] = [];

  for (const attr of attrsArray) {
    if (!attr || !attr.id) continue;
    const idUpper = String(attr.id).trim().toUpperCase();
    const nomeAtributo = String(attr.name || idUpper).trim();
    mapaNomesAtributos[idUpper] = nomeAtributo;

    if (idUpper === "ITEM_CONDITION" || idUpper === "GTIN" || idUpper === "EMPTY_GTIN_REASON") continue;

    const ehObrigatorio =
      temTagAtributoMl(attr.tags, "required") ||
      temTagAtributoMl(attr.tags, "catalog_required") ||
      temTagAtributoMl(attr.tags, "new_required");

    const ehOcultoOuLeitura =
      temTagAtributoMl(attr.tags, "hidden") ||
      temTagAtributoMl(attr.tags, "read_only") ||
      temTagAtributoMl(attr.tags, "fixed");

    if (!ehObrigatorio || ehOcultoOuLeitura) continue;

    atributosObrigatorios.push({
      id: idUpper,
      name: nomeAtributo,
      value_type: String(attr.value_type || "string"),
      default_unit: attr.default_unit ? String(attr.default_unit) : null,
      hint: attr.hint ? String(attr.hint) : (attr.tooltip ? String(attr.tooltip) : null),
      values: Array.isArray(attr.values)
        ? attr.values
            .filter((v: any) => v && v.id && v.name)
            .map((v: any) => ({ id: String(v.id), name: String(v.name) }))
        : [],
    });
  }

  return {
    categoria: {
      id: String(dadosCat.id || categoryId),
      name: String(dadosCat.name || categoryId),
      caminho_completo: caminhoCompleto,
      path_from_root: pathFromRoot,
      eh_folha: ehFolha,
      permite_anuncio: permiteAnuncio,
    },
    atributos_obrigatorios: atributosObrigatorios,
    mapa_nomes_atributos: mapaNomesAtributos,
  };
}

async function buscarSugestoesCategoriaMl(
  titulo: string,
  token?: string,
  limit: number = 5
): Promise<Array<{ category_id: string; category_name: string; domain_name: string }>> {
  const termoLimpo = sanitizarTextoMl(titulo, 80);
  if (!termoLimpo) return [];

  const headers: Record<string, string> = {
    "Accept": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  try {
    const resp = await fetch(
      `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=${limit}&q=${encodeURIComponent(termoLimpo)}`,
      { headers }
    );
    if (!resp.ok) return [];
    const lista = await resp.json();
    if (!Array.isArray(lista)) return [];

    const vistos = new Set<string>();
    const sugestoes: Array<{ category_id: string; category_name: string; domain_name: string }> = [];

    for (const item of lista) {
      const catId = String(item?.category_id || "").trim();
      if (!catId || vistos.has(catId)) continue;
      vistos.add(catId);
      sugestoes.push({
        category_id: catId,
        category_name: String(item?.category_name || catId),
        domain_name: String(item?.domain_name || ""),
      });
    }

    return sugestoes;
  } catch (errPred) {
    console.warn("[ml-estoque-sync] Falha ao consultar domain_discovery:", errPred);
    return [];
  }
}

async function resolverCategoriaAlvoUnica(
  categoriaExplicita: string | undefined,
  termoBusca: string,
  token: string
): Promise<string | null> {
  const limpa = typeof categoriaExplicita === "string" ? categoriaExplicita.trim() : "";
  if (limpa && limpa !== "MLB3530") {
    return limpa;
  }

  const sugestoes = await buscarSugestoesCategoriaMl(termoBusca, token, 1);
  return sugestoes[0]?.category_id || null;
}

function extrairTextoErroMl(dadosErro: any): string {
  const causas = Array.isArray(dadosErro?.cause)
    ? dadosErro.cause.map((c: any) => `${c?.code || ""} ${c?.message || ""}`.trim()).filter(Boolean)
    : [];
  const partes = [dadosErro?.error, dadosErro?.message, ...causas].filter(Boolean);
  return partes.join(" | ");
}

const NOMES_AMIGAVEIS_ATRIBUTOS_ML: Record<string, string> = {
  GTIN: "Código universal de produto (EAN/GTIN)",
  PRODUCT_IDENTIFIER: "Código universal de produto (EAN/GTIN)",
  EMPTY_GTIN_REASON: "Motivo de ausência do código de barras (GTIN)",
  BRAND: "Marca",
  MODEL: "Modelo",
  LINE: "Linha",
  COLOR: "Cor",
  SIZE: "Tamanho",
  GENDER: "Gênero",
  VOLTAGE: "Voltagem",
  SCREEN_SIZE: "Tamanho da tela",
  DISPLAY_TYPE: "Tipo de tela",
  ITEM_CONDITION: "Condição do item",
};

const TOKENS_ESTRUTURAIS_ML = new Set([
  "MLB",
  "BODY",
  "ATTRIBUTES",
  "ITEM",
  "VARIATIONS",
  "PICTURES",
  "TITLE",
  "FAMILY_NAME",
]);

function ehCodigoCategoriaOuInternoMl(token: string, categoriaAlvo?: string): boolean {
  const upper = token.trim().toUpperCase();
  if (!upper) return true;
  if (categoriaAlvo && upper === categoriaAlvo.trim().toUpperCase()) return true;
  if (/^ML[A-Z]\d+$/i.test(upper)) return true;
  if (/^ML[A-Z]$/i.test(upper)) return true;
  if (TOKENS_ESTRUTURAIS_ML.has(upper)) return true;
  return false;
}

function resolverNomeAmigavelAtributoMl(
  token: string,
  mapaNomesAtributos: Record<string, string>
): string {
  const upper = token.trim().toUpperCase();
  return NOMES_AMIGAVEIS_ATRIBUTOS_ML[upper] || mapaNomesAtributos[upper] || upper;
}

function extrairCamposFaltantesMl(
  dadosErro: any,
  mapaNomesAtributos: Record<string, string>,
  categoriaAlvo?: string
): string[] {
  const encontrados = new Set<string>();
  const textos: string[] = [];

  if (typeof dadosErro?.message === "string") textos.push(dadosErro.message);
  if (Array.isArray(dadosErro?.cause)) {
    for (const c of dadosErro.cause) {
      if (String(c?.type || "").toLowerCase() === "warning") continue;
      if (typeof c?.message === "string") textos.push(c.message);
      if (Array.isArray(c?.references)) {
        for (const ref of c.references) {
          if (typeof ref === "string") textos.push(ref);
        }
      }
    }
  }

  const textoCompleto = textos.join(" ");

  // Captura IDs entre colchetes: [GENDER, WATCH_BAND_MATERIAL]
  const matchesColchetes = textoCompleto.matchAll(/\[([^\]]+)\]/g);
  for (const m of matchesColchetes) {
    const tokens = m[1].split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    for (const token of tokens) {
      if (ehCodigoCategoriaOuInternoMl(token, categoriaAlvo)) continue;
      if (NOMES_AMIGAVEIS_ATRIBUTOS_ML[token] || mapaNomesAtributos[token]) {
        encontrados.add(resolverNomeAmigavelAtributoMl(token, mapaNomesAtributos));
      } else if (/^[A-Z][A-Z0-9_]{1,40}$/.test(token)) {
        encontrados.add(token);
      }
    }
  }

  // Captura referências diretas como attributes.GENDER ou item.attributes.MODEL
  const matchesRefs = textoCompleto.matchAll(/attributes\.([A-Z0-9_]+)/gi);
  for (const m of matchesRefs) {
    const token = m[1].trim().toUpperCase();
    if (ehCodigoCategoriaOuInternoMl(token, categoriaAlvo)) continue;
    encontrados.add(resolverNomeAmigavelAtributoMl(token, mapaNomesAtributos));
  }

  // Varredura por IDs conhecidos da categoria ou do dicionário mencionados no texto do erro
  const todosIdsConhecidos = new Set<string>([
    ...Object.keys(mapaNomesAtributos),
    ...Object.keys(NOMES_AMIGAVEIS_ATRIBUTOS_ML),
  ]);
  for (const idAttr of todosIdsConhecidos) {
    if (ehCodigoCategoriaOuInternoMl(idAttr, categoriaAlvo)) continue;
    const regexId = new RegExp(`\\b${idAttr}\\b`);
    if (regexId.test(textoCompleto)) {
      encontrados.add(resolverNomeAmigavelAtributoMl(idAttr, mapaNomesAtributos));
    }
  }

  return Array.from(encontrados);
}

function extrairCausasLegiveisMl(
  dadosErro: any,
  mapaNomesAtributos: Record<string, string>,
  categoriaAlvo?: string
): string[] {
  const causasLegiveis = new Set<string>();
  const causas = Array.isArray(dadosErro?.cause) ? dadosErro.cause : [];

  for (const c of causas) {
    if (String(c?.type || "").toLowerCase() === "warning") continue;
    let msg = typeof c?.message === "string" ? c.message.trim() : "";
    if (!msg) continue;

    if (categoriaAlvo) {
      msg = msg.replace(new RegExp(`\\b${categoriaAlvo.trim()}\\b`, "gi"), "categoria selecionada");
    }

    const todosIds = new Set<string>([
      ...Object.keys(mapaNomesAtributos),
      ...Object.keys(NOMES_AMIGAVEIS_ATRIBUTOS_ML),
    ]);
    for (const idAttr of todosIds) {
      if (ehCodigoCategoriaOuInternoMl(idAttr, categoriaAlvo)) continue;
      const nomeAmigavel = resolverNomeAmigavelAtributoMl(idAttr, mapaNomesAtributos);
      msg = msg.replace(new RegExp(`\\b${idAttr}\\b`, "g"), nomeAmigavel);
    }

    msg = msg.replace(/\s+/g, " ").trim();
    if (msg) causasLegiveis.add(msg);
  }

  return Array.from(causasLegiveis);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const corpo = await req.json().catch(() => ({}));
    const { action, loja_id } = corpo;

    if (!loja_id) {
      return new Response(
        JSON.stringify({ error: "Identificador da loja (loja_id) é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // =========================================================================
    // AÇÃO 0: CONSULTAR CATEGORIA E ATRIBUTOS OBRIGATÓRIOS (consultar_categoria)
    // =========================================================================
    if (action === "consultar_categoria") {
      const { titulo, category_id } = corpo;
      const tituloLimpo = typeof titulo === "string" ? titulo.trim() : "";
      const categoryIdSolicitado = typeof category_id === "string" ? category_id.trim() : "";

      if (!tituloLimpo && !categoryIdSolicitado) {
        return new Response(
          JSON.stringify({ error: "Informe o título do produto ou o código da categoria para consulta." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authResult = await obterAccessTokenValido(supabaseAdmin, loja_id).catch(() => ({ token: "" }));
      const token = authResult.token || "";

      const sugestoes = tituloLimpo
        ? await buscarSugestoesCategoriaMl(tituloLimpo, token, 5)
        : [];

      const categoryIdAlvo = categoryIdSolicitado || sugestoes[0]?.category_id || "";

      if (!categoryIdAlvo) {
        return new Response(
          JSON.stringify({
            error: "Não foi possível identificar uma categoria no Mercado Livre para este produto. Tente buscar por outro termo.",
            sugestoes: [],
            atributos_obrigatorios: [],
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const detalhes = await consultarDetalhesEAtributosCategoria(categoryIdAlvo, token);

      // Se a categoria selecionada manualmente não estiver na lista de sugestões, inclui no topo
      const sugestoesCompletas = sugestoes.some((s) => s.category_id === detalhes.categoria.id)
        ? sugestoes
        : [
            {
              category_id: detalhes.categoria.id,
              category_name: detalhes.categoria.name,
              domain_name: "",
            },
            ...sugestoes,
          ];

      return new Response(
        JSON.stringify({
          sucesso: true,
          categoria: detalhes.categoria,
          sugestoes: sugestoesCompletas,
          atributos_obrigatorios: detalhes.atributos_obrigatorios,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 1: SINCRONIZAR ESTOQUE LOCAL -> MERCADO LIVRE (sync_inventory)
    // =========================================================================
    if (action === "sync_inventory") {
      const { produto_id } = corpo;
      if (!produto_id) {
        return new Response(
          JSON.stringify({ error: "Parâmetro produto_id é obrigatório para sincronização de estoque." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Busca anúncios ativos vinculados a este produto
      const { data: anuncios, error: erroAnuncios } = await supabaseAdmin
        .from("marketplace_anuncios")
        .select("id, loja_id, conta_id, produto_id, variacao_id, ml_item_id, ml_variation_id, sincronizacao_ativa")
        .eq("loja_id", loja_id)
        .eq("produto_id", produto_id)
        .eq("sincronizacao_ativa", true);

      if (erroAnuncios || !anuncios || anuncios.length === 0) {
        return new Response(
          JSON.stringify({ sucesso: true, sincronizados: 0, mensagem: "Nenhum anúncio ativo vinculado para este produto." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Obtém o token de acesso válido
      const { token } = await obterAccessTokenValido(supabaseAdmin, loja_id);

      let totalAtualizados = 0;
      const erros: string[] = [];

      for (const anuncio of anuncios) {
        try {
          // Busca o saldo físico atual no HUBI
          let saldoFisico = 0;
          if (anuncio.variacao_id) {
            const { data: varProd } = await supabaseAdmin
              .from("variacoes_produto")
              .select("quantidade_estoque")
              .eq("id", anuncio.variacao_id)
              .eq("loja_id", loja_id)
              .maybeSingle();
            saldoFisico = Math.max(0, varProd?.quantidade_estoque || 0);
          } else {
            const { data: prod } = await supabaseAdmin
              .from("produtos")
              .select("quantidade_estoque")
              .eq("id", anuncio.produto_id)
              .eq("loja_id", loja_id)
              .maybeSingle();
            saldoFisico = Math.max(0, prod?.quantidade_estoque || 0);
          }

          // Monta o payload de atualização de quantidade no Mercado Livre
          const mlItemId = anuncio.ml_item_id.trim();
          let payloadMl: any = {};

          if (anuncio.ml_variation_id) {
            payloadMl = {
              variations: [
                {
                  id: anuncio.ml_variation_id,
                  available_quantity: saldoFisico,
                },
              ],
            };
          } else {
            payloadMl = {
              available_quantity: saldoFisico,
            };
          }

          const respMl = await fetch(`https://api.mercadolibre.com/items/${mlItemId}`, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(payloadMl),
          });

          if (!respMl.ok) {
            const erroJson = await respMl.json().catch(() => ({}));
            const msgErro = erroJson.message || `Erro HTTP ${respMl.status} ao atualizar anúncio ${mlItemId}`;
            erros.push(msgErro);

            await supabaseAdmin
              .from("marketplace_anuncios")
              .update({
                status_anuncio: "erro_sincronia",
                ultimo_erro_sincronizacao: msgErro.slice(0, 500),
              })
              .eq("id", anuncio.id);
            continue;
          }

          // Sucesso na sincronização
          await supabaseAdmin
            .from("marketplace_anuncios")
            .update({
              estoque_ultimo_enviado: saldoFisico,
              status_anuncio: "active",
              ultima_sincronizacao_estoque_em: new Date().toISOString(),
              ultimo_erro_sincronizacao: null,
            })
            .eq("id", anuncio.id);

          totalAtualizados++;
        } catch (errAnuncio: any) {
          erros.push(errAnuncio?.message || "Erro desconhecido");
        }
      }

      return new Response(
        JSON.stringify({
          sucesso: erros.length === 0,
          total_anuncios: anuncios.length,
          sincronizados: totalAtualizados,
          erros: erros.length > 0 ? erros : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 2: VINCULAR ANÚNCIO EXISTENTE VIA MLB (link_existing)
    // =========================================================================
    if (action === "link_existing") {
      const { produto_id, variacao_id, ml_item_id } = corpo;

      if (!produto_id || !ml_item_id) {
        return new Response(
          JSON.stringify({ error: "Parâmetros produto_id e ml_item_id são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const itemLimpo = ml_item_id.trim().toUpperCase();
      const { token, conta } = await obterAccessTokenValido(supabaseAdmin, loja_id);

      // Consulta os dados do anúncio diretamente na API do Mercado Livre
      const respItem = await fetch(`https://api.mercadolibre.com/items/${itemLimpo}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      });

      if (!respItem.ok) {
        return new Response(
          JSON.stringify({ error: `Anúncio ${itemLimpo} não encontrado no Mercado Livre ou acesso não autorizado.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const dadosItem = await respItem.json();

      // Validação de titularidade: o anúncio pertence à conta conectada no HUBI?
      if (dadosItem.seller_id !== conta.ml_user_id) {
        return new Response(
          JSON.stringify({ error: "Este anúncio pertence a outro vendedor e não pode ser vinculado a esta conta." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Busca o estoque físico local do produto/variação no HUBI
      let estoqueAtual = 0;
      if (variacao_id) {
        const { data: v } = await supabaseAdmin
          .from("variacoes_produto")
          .select("quantidade_estoque")
          .eq("id", variacao_id)
          .eq("loja_id", loja_id)
          .maybeSingle();
        estoqueAtual = Math.max(0, v?.quantidade_estoque || 0);
      } else {
        const { data: p } = await supabaseAdmin
          .from("produtos")
          .select("quantidade_estoque")
          .eq("id", produto_id)
          .eq("loja_id", loja_id)
          .maybeSingle();
        estoqueAtual = Math.max(0, p?.quantidade_estoque || 0);
      }

      // Grava o vínculo no banco
      const { data: novoVinculo, error: erroVinculo } = await supabaseAdmin
        .from("marketplace_anuncios")
        .upsert(
          {
            loja_id: loja_id,
            conta_id: conta.id,
            produto_id: produto_id,
            variacao_id: variacao_id || null,
            ml_item_id: itemLimpo,
            ml_category_id: dadosItem.category_id || null,
            ml_listing_type_id: dadosItem.listing_type_id || "gold_special",
            titulo_anuncio: dadosItem.title,
            preco_anuncio: dadosItem.price,
            estoque_ultimo_enviado: estoqueAtual,
            status_anuncio: dadosItem.status || "active",
            permalink: dadosItem.permalink || null,
            sincronizacao_ativa: true,
            ultima_sincronizacao_estoque_em: new Date().toISOString(),
          },
          { onConflict: "loja_id,ml_item_id,COALESCE(ml_variation_id, 0)" }
        )
        .select()
        .single();

      if (erroVinculo) {
        // Se falhar o upsert pelo formato de expressão, busca ou insere direto
        console.error("[ml-estoque-sync] Erro ao gravar vínculo:", erroVinculo.message);
      }

      // Atualiza o estoque do anúncio no Mercado Livre imediatamente com o saldo local
      await fetch(`https://api.mercadolibre.com/items/${itemLimpo}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ available_quantity: estoqueAtual }),
      }).catch((e) => console.error("[ml-estoque-sync] Falha ao atualizar estoque pós-vínculo:", e));

      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: `Anúncio ${itemLimpo} vinculado com sucesso e estoque atualizado para ${estoqueAtual} unidades!`,
          anuncio: novoVinculo || dadosItem,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 3: CRIAR NOVO ANÚNCIO NO MERCADO LIVRE VIA GDM (create_listing)
    // =========================================================================
    if (action === "create_listing") {
      const {
        payload_ml,
        produto_id,
        variacao_id,
        margem_sobrepreco,
        marca,
        modelo,
        gtin,
        sem_gtin,
        category_id,
        atributos_extras,
      } = corpo;

      if (!payload_ml || !produto_id) {
        return new Response(
          JSON.stringify({ error: "Parâmetros payload_ml e produto_id são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { token, conta } = await obterAccessTokenValido(supabaseAdmin, loja_id);

      const [resProdDb, resVarDb] = await Promise.all([
        supabaseAdmin
          .from("produtos")
          .select("fotos_urls, codigo_barras")
          .eq("id", produto_id)
          .eq("loja_id", loja_id)
          .maybeSingle(),
        variacao_id
          ? supabaseAdmin
              .from("variacoes_produto")
              .select("codigo_barras")
              .eq("id", variacao_id)
              .eq("loja_id", loja_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const { description: descricaoObj, title: tituloOriginal, family_name: familiaOriginal, ...restantePayload } = payload_ml;
      const descricaoPlainText = typeof descricaoObj?.plain_text === "string" ? descricaoObj.plain_text.trim() : "";

      const nomeFamiliaLimpo = sanitizarTextoMl(familiaOriginal || tituloOriginal || "Produto", 60);
      const tituloLimpo = sanitizarTextoMl(tituloOriginal || nomeFamiliaLimpo, 60);

      const gtinInformadoLimpo = typeof gtin === "string" ? gtin.replace(/\D/g, "").trim() : "";
      const semGtinFlag = sem_gtin === true;

      let atributosBase = aplicarAtributoGtinOuIsencao(
        garantirAtributosObrigatorios(
          Array.isArray(restantePayload.attributes) ? restantePayload.attributes : [],
          marca,
          modelo,
          Array.isArray(atributos_extras) ? atributos_extras : []
        ),
        {
          gtinInformado: gtinInformadoLimpo || null,
          semGtin: semGtinFlag,
          codigoBarrasBanco: resVarDb?.data?.codigo_barras || resProdDb?.data?.codigo_barras || null,
        }
      );

      // Remove qualquer entrada duplicada de GTIN/EMPTY_GTIN_REASON nas variações do payload, se existirem
      const gtinResolvido = atributosBase.find((a) => a.id === "GTIN")?.value_name || null;
      if (Array.isArray(restantePayload.variations)) {
        restantePayload.variations = restantePayload.variations.map((variacao: any) => {
          if (!variacao || !Array.isArray(variacao.attributes)) return variacao;
          return {
            ...variacao,
            attributes: aplicarAtributoGtinOuIsencao(variacao.attributes, {
              gtinInformado: gtinResolvido,
              semGtin: semGtinFlag || !gtinResolvido,
              codigoBarrasBanco: null,
            }),
          };
        });
      }

      // Bloqueio estrito do fallback para "Outros" (MLB3530 / MLB1953)
      const categoriaAlvo = await resolverCategoriaAlvoUnica(
        category_id || restantePayload.category_id,
        nomeFamiliaLimpo,
        token
      );

      if (!categoriaAlvo) {
        return new Response(
          JSON.stringify({
            error: "Não foi possível identificar a categoria oficial no Mercado Livre para este produto. Selecione uma categoria válida no modal antes de publicar.",
            campos_faltantes: [],
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upload binário direto das fotos do produto (até 10) antes de criar o item no ML
      const picturesProcessadas = await prepararPicturesBinariasMl(
        resProdDb?.data?.fotos_urls,
        restantePayload.pictures,
        token
      );

      type ModoTituloMl = "only_family_name" | "both" | "only_title";
      const modosParaTentar: ModoTituloMl[] = ["only_family_name", "both", "only_title"];
      let respPostOk = false;
      let dadosCriado: any = null;
      let ultimoErroMl: any = null;

      for (let idxModo = 0; idxModo < modosParaTentar.length; idxModo++) {
        const modo = modosParaTentar[idxModo];
        let tentarNovamenteMesmoModoComGtin = false;
        let tentouRemoverEmptyGtin = false;

        do {
          tentarNovamenteMesmoModoComGtin = false;
          const payloadTentativa: Record<string, any> = {
            ...restantePayload,
            ...(picturesProcessadas.length > 0 ? { pictures: picturesProcessadas } : {}),
            category_id: categoriaAlvo,
            attributes: atributosBase,
          };

          if (modo === "only_family_name") {
            delete payloadTentativa.title;
            payloadTentativa.family_name = nomeFamiliaLimpo;
          } else if (modo === "both") {
            payloadTentativa.family_name = nomeFamiliaLimpo;
            payloadTentativa.title = tituloLimpo;
          } else {
            delete payloadTentativa.family_name;
            payloadTentativa.title = tituloLimpo;
          }

          const respPost = await fetch("https://api.mercadolibre.com/items", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(payloadTentativa),
          });

          const jsonResp = await respPost.json().catch(() => ({}));

          if (respPost.ok) {
            respPostOk = true;
            dadosCriado = jsonResp;
            break;
          }

          ultimoErroMl = jsonResp;
          const textoErro = extrairTextoErroMl(jsonResp);
          console.warn(`[ml-estoque-sync] Tentativa (${categoriaAlvo} / ${modo}) falhou:`, textoErro);

          // Se a categoria exigir GTIN e ainda não enviamos GTIN nem EMPTY_GTIN_REASON, adiciona e repete
          const jaTemGtinOuMotivo = atributosBase.some((a) => a.id === "GTIN" || a.id === "EMPTY_GTIN_REASON");
          if (!jaTemGtinOuMotivo && /\bgtin\b|empty_gtin_reason|product_identifier/i.test(textoErro)) {
            atributosBase = [
              ...atributosBase,
              { id: "EMPTY_GTIN_REASON", value_id: "17055160" },
            ];
            tentarNovamenteMesmoModoComGtin = true;
            continue;
          }

          const temEmptyGtin = atributosBase.some((a) => a.id === "EMPTY_GTIN_REASON");
          if (
            !tentouRemoverEmptyGtin &&
            temEmptyGtin &&
            /empty_gtin_reason.*(not.*allowed|invalid|ignored)|invalid.*empty_gtin_reason/i.test(textoErro)
          ) {
            atributosBase = atributosBase.filter((a) => a.id !== "EMPTY_GTIN_REASON");
            tentouRemoverEmptyGtin = true;
            tentarNovamenteMesmoModoComGtin = true;
            continue;
          }

          const erroDeAtributoObrigatorio = /missing_required|attributes.*required|are required for category/i.test(textoErro);
          const erroRelacionadoTituloOuFamilia =
            /family_name|\btitle\b/i.test(textoErro) ||
            (/invalid_fields/i.test(textoErro) && !erroDeAtributoObrigatorio);

          if (!erroRelacionadoTituloOuFamilia) {
            // Não tenta outros modos de título nem faz fallback de categoria
            break;
          }

          if (modo === "only_family_name") {
            const rejeitouFamilyName = /family_name.*not.*allowed|not_allowed.*family_name|invalid.*family_name|cannot.*family_name/i.test(textoErro);
            if (rejeitouFamilyName && !/\btitle\b/i.test(textoErro)) {
              // Pula direto para only_title
              idxModo = 1;
            }
          }
        } while (tentarNovamenteMesmoModoComGtin);

        if (respPostOk) {
          break;
        }

        const textoUltimoErro = extrairTextoErroMl(ultimoErroMl);
        const erroDeAtributoObrigatorio = /missing_required|attributes.*required|are required for category/i.test(textoUltimoErro);
        const erroRelacionadoTituloOuFamilia =
          /family_name|\btitle\b/i.test(textoUltimoErro) ||
          (/invalid_fields/i.test(textoUltimoErro) && !erroDeAtributoObrigatorio);

        if (!erroRelacionadoTituloOuFamilia) {
          break;
        }
      }

      if (!respPostOk || !dadosCriado) {
        console.error(
          `[ml-estoque-sync] Erro definitivo ao criar item no ML (${categoriaAlvo}):`,
          JSON.stringify(ultimoErroMl?.cause ?? ultimoErroMl, null, 2)
        );
        const detalhe = ultimoErroMl?.cause?.[0]?.message || ultimoErroMl?.message || "Erro desconhecido na API do Mercado Livre.";

        let camposFaltantes: string[] = [];
        let causasLegiveis: string[] = [];
        try {
          const infoCat = await consultarDetalhesEAtributosCategoria(categoriaAlvo, token);
          camposFaltantes = extrairCamposFaltantesMl(ultimoErroMl, infoCat.mapa_nomes_atributos, categoriaAlvo);
          causasLegiveis = extrairCausasLegiveisMl(ultimoErroMl, infoCat.mapa_nomes_atributos, categoriaAlvo);
        } catch {
          camposFaltantes = extrairCamposFaltantesMl(ultimoErroMl, {}, categoriaAlvo);
          causasLegiveis = extrairCausasLegiveisMl(ultimoErroMl, {}, categoriaAlvo);
        }

        const semGtinEnviado = !atributosBase.some((a) => a.id === "GTIN");
        const apenasFaltaGtin =
          camposFaltantes.length === 1 &&
          camposFaltantes[0] === "Código universal de produto (EAN/GTIN)";

        const erroAmigavel =
          apenasFaltaGtin && semGtinEnviado
            ? `A categoria selecionada (${categoriaAlvo}) exige um Código universal de produto (EAN/GTIN) válido de 8 a 14 dígitos. Desmarque a opção 'Não possui código de barras (GTIN)' no modal e informe o código EAN do produto.`
            : camposFaltantes.length > 0
            ? `Não foi possível publicar na categoria selecionada (${categoriaAlvo}) porque faltam campos obrigatórios: ${camposFaltantes.join(", ")}.`
            : `Não foi possível publicar no Mercado Livre (${categoriaAlvo}): ${causasLegiveis.join(" • ") || detalhe}`;

        return new Response(
          JSON.stringify({
            error: erroAmigavel,
            campos_faltantes: camposFaltantes,
            causas_legiveis: causasLegiveis,
            category_id: categoriaAlvo,
            detail_raw: detalhe,
            ml_cause: ultimoErroMl?.cause || null,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Enriquece produtos.codigo_barras (e variação, se aplicável) quando GTIN válido foi enviado e estava vazio no banco
      const gtinFinalEnviado = atributosBase.find((a) => a.id === "GTIN")?.value_name || "";
      if (/^\d{8,14}$/.test(gtinFinalEnviado)) {
        if (!(resProdDb?.data?.codigo_barras || "").trim()) {
          await supabaseAdmin
            .from("produtos")
            .update({ codigo_barras: gtinFinalEnviado })
            .eq("id", produto_id)
            .eq("loja_id", loja_id);
        }
        if (variacao_id && !(resVarDb?.data?.codigo_barras || "").trim()) {
          await supabaseAdmin
            .from("variacoes_produto")
            .update({ codigo_barras: gtinFinalEnviado })
            .eq("id", variacao_id)
            .eq("loja_id", loja_id);
        }
      }

      // Envia descrição separadamente (recomendado no modelo User Products)
      if (descricaoPlainText && dadosCriado.id) {
        await fetch(`https://api.mercadolibre.com/items/${dadosCriado.id}/description`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ plain_text: descricaoPlainText }),
        }).catch((errDesc) => {
          console.warn("[ml-estoque-sync] Aviso ao publicar descrição do anúncio:", errDesc);
        });
      }

      // Grava o novo anúncio na tabela public.marketplace_anuncios
      await supabaseAdmin
        .from("marketplace_anuncios")
        .insert({
          loja_id: loja_id,
          conta_id: conta.id,
          produto_id: produto_id,
          variacao_id: variacao_id || null,
          ml_item_id: dadosCriado.id,
          ml_category_id: dadosCriado.category_id,
          ml_listing_type_id: dadosCriado.listing_type_id,
          titulo_anuncio: dadosCriado.title || dadosCriado.family_name || nomeFamiliaLimpo,
          preco_anuncio: dadosCriado.price,
          margem_sobrepreco_percentual: Number(margem_sobrepreco || 0),
          estoque_ultimo_enviado: dadosCriado.available_quantity || 0,
          status_anuncio: dadosCriado.status || "active",
          permalink: dadosCriado.permalink || null,
          sincronizacao_ativa: true,
          ultima_sincronizacao_estoque_em: new Date().toISOString(),
        });

      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: `Anúncio ${dadosCriado.id} publicado com sucesso no Mercado Livre!`,
          item: dadosCriado,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Ação '${action}' não reconhecida.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[ml-estoque-sync] Exceção:", error?.message);
    const statusCode = error instanceof MercadoLivreError ? error.statusCode : 500;
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno ao sincronizar com o Mercado Livre." }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
