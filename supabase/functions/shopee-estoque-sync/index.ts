// Supabase Edge Function: shopee-estoque-sync
// Espelha o contrato de ml-estoque-sync para a Shopee Open Platform API v2.
// Deploy: npx supabase functions deploy shopee-estoque-sync

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SHOPEE_API_BASE,
  ShopeeError,
  assinarRequisicaoLojaShopee,
  chamarApiShopeeLoja,
  obterAccessTokenShopeeValido,
} from "../_shared/shopeeClient.ts";
import {
  baixarImagemExterna,
  ehUrlSupabaseStorageProjeto,
  espelharImagemExternaNoStorage,
  normalizarUrlImagemExterna,
} from "../_shared/imagemStorageHelper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function validarGtinGs1(codigo: string): boolean {
  const digitos = String(codigo || "").replace(/\D/g, "").trim();
  if (![8, 12, 13, 14].includes(digitos.length)) return false;
  if (/^(\d)\1+$/.test(digitos)) return false;

  let soma = 0;
  for (let i = digitos.length - 2; i >= 0; i--) {
    const num = Number(digitos[i]);
    const posDaDireita = digitos.length - 2 - i;
    soma += num * (posDaDireita % 2 === 0 ? 3 : 1);
  }
  const digitoVerificadorEsperado = (10 - (soma % 10)) % 10;
  return digitoVerificadorEsperado === Number(digitos[digitos.length - 1]);
}

function normalizarStatusShopeeParaHubi(itemStatus: string): "active" | "paused" | "under_review" | "closed" {
  const upper = String(itemStatus || "").trim().toUpperCase();
  if (upper === "NORMAL") return "active";
  if (upper === "UNLIST") return "paused";
  if (upper === "REVIEWING") return "under_review";
  if (upper === "DELETED" || upper === "BANNED" || upper === "SELLER_DELETE" || upper === "SHOPEE_DELETE") {
    return "closed";
  }
  return "active";
}

function mapearAtributosShopeeParaFormulario(atributosBrutos: any[]): Array<{
  id: string;
  name: string;
  value_type: string;
  default_unit?: string | null;
  hint?: string | null;
  values: Array<{ id: string; name: string }>;
}> {
  if (!Array.isArray(atributosBrutos)) return [];

  return atributosBrutos
    .filter((attr) => Boolean(attr?.is_mandatory))
    .map((attr) => {
      const listaValores = Array.isArray(attr.attribute_value_list)
        ? attr.attribute_value_list
            .map((v: any) => ({
              id: String(v?.value_id ?? ""),
              name: String(v?.display_value_name || v?.original_value_name || "").trim(),
            }))
            .filter((v: { id: string; name: string }) => Boolean(v.id && v.name))
            .slice(0, 60)
        : [];

      const inputType = String(attr?.input_type || "").toUpperCase();
      const valueType =
        listaValores.length > 0 && (inputType.includes("DROP_DOWN") || inputType.includes("COMBO"))
          ? "list"
          : inputType.includes("NUMERIC") || attr?.format_type === "QUANTITATIVE_WITH_UNIT"
          ? "number_unit"
          : "string";

      const unidades = Array.isArray(attr?.attribute_unit) ? attr.attribute_unit : [];

      return {
        id: String(attr.attribute_id),
        name: String(attr.display_attribute_name || attr.original_attribute_name || `Atributo ${attr.attribute_id}`).trim(),
        value_type: valueType,
        default_unit: unidades[0] ? String(unidades[0]) : null,
        hint: attr?.is_mandatory ? "Campo obrigatório nesta categoria da Shopee" : null,
        values: listaValores,
      };
    });
}

async function consultarCanaisLogisticosAtivosShopee(params: {
  token: string;
  shopId: number;
  partnerId: string;
  partnerKey: string;
}) {
  const res = await chamarApiShopeeLoja<any>({
    apiPath: "/api/v2/logistics/get_channel_list",
    method: "GET",
    ...params,
  });

  const listaBruta = res?.response?.logistics_channel_list;
  if (!Array.isArray(listaBruta)) return [];

  return listaBruta
    .filter((ch: any) => Boolean(ch?.enabled))
    .map((ch: any) => ({
      logistics_channel_id: Number(ch.logistics_channel_id),
      logistics_channel_name: String(ch.logistics_channel_name || `Canal ${ch.logistics_channel_id}`),
      enabled: true,
    }))
    .filter((ch: any) => Number.isFinite(ch.logistics_channel_id) && ch.logistics_channel_id > 0);
}

async function fazerUploadImagemMediaSpaceShopee(params: {
  urlOriginal: string;
  token: string;
  shopId: number;
  partnerId: string;
  partnerKey: string;
  supabaseAdmin: any;
  lojaId: string;
  supabaseUrl: string;
  indice: number;
}): Promise<{ imageId: string | null; urlStorage: string }> {
  const {
    urlOriginal,
    token,
    shopId,
    partnerId,
    partnerKey,
    supabaseAdmin,
    lojaId,
    supabaseUrl,
    indice,
  } = params;

  const urlNorm = normalizarUrlImagemExterna(urlOriginal);
  let urlFinal = urlNorm;
  let bytes: Uint8Array | null = null;
  let mime = "image/jpeg";
  let ext = "jpg";

  // 1. Garante imagem hospedada no Supabase Storage do projeto (anti-hotlink)
  if (!ehUrlSupabaseStorageProjeto(urlNorm, supabaseUrl)) {
    const espelhada = await espelharImagemExternaNoStorage(supabaseAdmin, {
      url: urlNorm,
      lojaId,
      supabaseUrl,
    });
    if (espelhada.sucesso) {
      urlFinal = espelhada.urlPublica;
      if (espelhada.bytes && espelhada.mime && espelhada.ext) {
        bytes = espelhada.bytes;
        mime = espelhada.mime;
        ext = espelhada.ext;
      }
    }
  }

  // 2. Se os bytes ainda não vieram do espelhamento, baixa do Storage
  if (!bytes) {
    const baixada = await baixarImagemExterna(urlFinal, 15000);
    if (!baixada.sucesso) {
      return { imageId: null, urlStorage: urlFinal };
    }
    bytes = baixada.bytes;
    mime = baixada.mime;
    ext = baixada.ext;
  }

  // 3. Upload binário para /api/v2/media_space/upload_image
  const apiPath = "/api/v2/media_space/upload_image";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await assinarRequisicaoLojaShopee(
    partnerId,
    partnerKey,
    apiPath,
    timestamp,
    token,
    shopId
  );

  const formData = new FormData();
  const blob = new Blob([bytes], { type: mime });
  formData.append("image", blob, `produto_${indice + 1}.${ext}`);

  const urlUpload = `${SHOPEE_API_BASE}${apiPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&access_token=${encodeURIComponent(token)}&shop_id=${shopId}&sign=${sign}`;
  const respUpload = await fetch(urlUpload, {
    method: "POST",
    headers: { "Accept": "application/json" },
    body: formData,
  });

  const dadosUpload = await respUpload.json().catch(() => ({}));
  const imageId = dadosUpload?.response?.image_info?.image_id;
  if (respUpload.ok && typeof imageId === "string" && imageId.trim()) {
    return { imageId: imageId.trim(), urlStorage: urlFinal };
  }

  console.warn(
    `[shopee-estoque-sync] Upload media_space da foto ${indice + 1} falhou:`,
    dadosUpload?.message || dadosUpload?.error || `HTTP ${respUpload.status}`
  );
  return { imageId: null, urlStorage: urlFinal };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
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
    // AÇÃO 0: CONSULTAR CATEGORIA RECOMENDADA, ATRIBUTOS E LOGÍSTICA
    // =========================================================================
    if (action === "consultar_categoria") {
      const titulo = typeof corpo?.titulo === "string" ? corpo.titulo.trim() : "";
      const categoryIdInformado = Number(corpo?.category_id || 0);

      if (!titulo && !categoryIdInformado) {
        return new Response(
          JSON.stringify({ error: "Informe o título ou o código da categoria Shopee." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const auth = await obterAccessTokenShopeeValido(supabaseAdmin, loja_id);

      let sugestoes: Array<{ category_id: string; category_name: string; domain_name: string }> = [];
      if (titulo) {
        const resRec = await chamarApiShopeeLoja<any>({
          apiPath: "/api/v2/product/category_recommend",
          method: "GET",
          token: auth.token,
          shopId: auth.shopId,
          partnerId: auth.partnerId,
          partnerKey: auth.partnerKey,
          queryParams: { item_name: titulo.slice(0, 120) },
        }).catch(() => ({}));

        const idsRec: number[] = Array.isArray(resRec?.response?.category_id)
          ? resRec.response.category_id
          : [];

        if (idsRec.length > 0) {
          const resCats = await chamarApiShopeeLoja<any>({
            apiPath: "/api/v2/product/get_category",
            method: "GET",
            token: auth.token,
            shopId: auth.shopId,
            partnerId: auth.partnerId,
            partnerKey: auth.partnerKey,
            queryParams: { language: "pt-br" },
          }).catch(() => ({}));

          const todasCategorias: any[] = Array.isArray(resCats?.response?.category_list)
            ? resCats.response.category_list
            : [];
          const mapaCat = new Map<number, any>();
          for (const c of todasCategorias) {
            mapaCat.set(Number(c.category_id), c);
          }

          sugestoes = idsRec.slice(0, 5).map((cid) => {
            const cat = mapaCat.get(Number(cid));
            return {
              category_id: String(cid),
              category_name: String(
                cat?.display_category_name || cat?.original_category_name || `Categoria ${cid}`
              ),
              domain_name: "Shopee BR",
            };
          });
        }
      }

      const categoryIdAlvo = categoryIdInformado || Number(sugestoes[0]?.category_id || 0);
      if (!categoryIdAlvo) {
        return new Response(
          JSON.stringify({
            error: "Não foi possível recomendar uma categoria oficial na Shopee para este produto.",
            sugestoes: [],
            atributos_obrigatorios: [],
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const [resAttr, canaisLogisticos] = await Promise.all([
        chamarApiShopeeLoja<any>({
          apiPath: "/api/v2/product/get_attributes",
          method: "GET",
          token: auth.token,
          shopId: auth.shopId,
          partnerId: auth.partnerId,
          partnerKey: auth.partnerKey,
          queryParams: { category_id: categoryIdAlvo, language: "pt-br" },
        }).catch(() => ({})),
        consultarCanaisLogisticosAtivosShopee(auth).catch(() => []),
      ]);

      const atributosObrigatorios = mapearAtributosShopeeParaFormulario(
        resAttr?.response?.attribute_list || []
      );
      const nomeCatAlvo =
        sugestoes.find((s) => Number(s.category_id) === categoryIdAlvo)?.category_name ||
        `Categoria ${categoryIdAlvo}`;

      return new Response(
        JSON.stringify({
          sucesso: true,
          categoria: {
            id: String(categoryIdAlvo),
            name: nomeCatAlvo,
            caminho_completo: nomeCatAlvo,
            path_from_root: [{ id: String(categoryIdAlvo), name: nomeCatAlvo }],
            eh_folha: true,
            permite_anuncio: true,
          },
          sugestoes,
          atributos_obrigatorios: atributosObrigatorios,
          canais_logisticos: canaisLogisticos,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 1: VINCULAR ANÚNCIO EXISTENTE DA SHOPEE (link_existing)
    // =========================================================================
    if (action === "link_existing") {
      const { produto_id, variacao_id, item_id } = corpo;
      const itemIdNum = Number(String(item_id || "").replace(/\D/g, ""));

      if (!produto_id || !itemIdNum) {
        return new Response(
          JSON.stringify({ error: "Informe o produto e o ID numérico do anúncio na Shopee." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const auth = await obterAccessTokenShopeeValido(supabaseAdmin, loja_id);
      const resInfo = await chamarApiShopeeLoja<any>({
        apiPath: "/api/v2/product/get_item_base_info",
        method: "GET",
        token: auth.token,
        shopId: auth.shopId,
        partnerId: auth.partnerId,
        partnerKey: auth.partnerKey,
        queryParams: { item_id_list: [itemIdNum] },
      });

      const itemShopee = resInfo?.response?.item_list?.[0];
      if (!itemShopee) {
        throw new ShopeeError(`Anúncio #${itemIdNum} não encontrado nesta conta da Shopee.`, 404);
      }

      const precoAnuncio =
        Number(itemShopee?.price_info?.[0]?.current_price || itemShopee?.price_info?.[0]?.original_price || 0);
      const statusAnuncio = normalizarStatusShopeeParaHubi(itemShopee.item_status);
      const permalink = `https://shopee.com.br/product/${auth.shopId}/${itemIdNum}`;

      const { data: anuncioSalvo, error: erroInsert } = await supabaseAdmin
        .from("marketplace_anuncios")
        .upsert(
          {
            loja_id,
            conta_id: auth.conta.id,
            produto_id,
            variacao_id: variacao_id || null,
            plataforma: "shopee",
            ml_item_id: String(itemIdNum),
            ml_category_id: itemShopee.category_id ? String(itemShopee.category_id) : null,
            ml_listing_type_id: "shopee_padrao",
            titulo_anuncio: String(itemShopee.item_name || `Anúncio ${itemIdNum}`).slice(0, 250),
            preco_anuncio: Number.isFinite(precoAnuncio) && precoAnuncio >= 0 ? precoAnuncio : 0,
            estoque_ultimo_enviado: Number(itemShopee?.stock_info_v2?.summary_info?.total_available_stock || 0),
            status_anuncio: statusAnuncio,
            permalink,
            sincronizacao_ativa: true,
            ultima_sincronizacao_estoque_em: new Date().toISOString(),
          },
          { onConflict: "loja_id,plataforma,ml_item_id" }
        )
        .select()
        .maybeSingle();

      if (erroInsert) {
        // Fallback caso unique expression index tenha nome composto: tenta delete+insert seguro
        await supabaseAdmin
          .from("marketplace_anuncios")
          .delete()
          .eq("loja_id", loja_id)
          .eq("plataforma", "shopee")
          .eq("ml_item_id", String(itemIdNum));

        await supabaseAdmin.from("marketplace_anuncios").insert({
          loja_id,
          conta_id: auth.conta.id,
          produto_id,
          variacao_id: variacao_id || null,
          plataforma: "shopee",
          ml_item_id: String(itemIdNum),
          ml_category_id: itemShopee.category_id ? String(itemShopee.category_id) : null,
          ml_listing_type_id: "shopee_padrao",
          titulo_anuncio: String(itemShopee.item_name || `Anúncio ${itemIdNum}`).slice(0, 250),
          preco_anuncio: Number.isFinite(precoAnuncio) && precoAnuncio >= 0 ? precoAnuncio : 0,
          estoque_ultimo_enviado: Number(itemShopee?.stock_info_v2?.summary_info?.total_available_stock || 0),
          status_anuncio: statusAnuncio,
          permalink,
          sincronizacao_ativa: true,
          ultima_sincronizacao_estoque_em: new Date().toISOString(),
        });
      }

      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: `Anúncio Shopee #${itemIdNum} vinculado com sucesso!`,
          permalink,
          anuncio: anuncioSalvo || { ml_item_id: String(itemIdNum), permalink },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 2: PUBLICAR NOVO ANÚNCIO NA SHOPEE (create_listing)
    // =========================================================================
    if (action === "create_listing") {
      const {
        produto_id,
        variacao_id,
        item_name,
        description,
        original_price,
        normal_stock,
        category_id,
        margem_sobrepreco,
        marca,
        gtin,
        sem_gtin,
        atributos_extras,
        fotos_urls: fotosPayload,
      } = corpo;

      if (!produto_id) {
        return new Response(
          JSON.stringify({ error: "Identificador do produto (produto_id) é obrigatório." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const auth = await obterAccessTokenShopeeValido(supabaseAdmin, loja_id);

      const [resProdDb, resVarDb] = await Promise.all([
        supabaseAdmin
          .from("produtos")
          .select("nome, descricao, fotos_urls, codigo_barras, preco_venda_varejo, preco_promocional, promocao_ativa, quantidade_estoque, peso_kg, altura_cm, largura_cm, comprimento_cm")
          .eq("id", produto_id)
          .eq("loja_id", loja_id)
          .maybeSingle(),
        variacao_id
          ? supabaseAdmin
              .from("variacoes_produto")
              .select("codigo_barras, preco_venda_varejo, preco_promocional, quantidade_estoque")
              .eq("id", variacao_id)
              .eq("loja_id", loja_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const prodDb = resProdDb?.data;
      if (!prodDb) {
        return new Response(
          JSON.stringify({ error: "Produto não encontrado nesta loja." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const nomeItem = String(item_name || prodDb.nome || "Produto").trim().slice(0, 120);
      const descricaoTexto = String(description || prodDb.descricao || nomeItem).trim().slice(0, 5000);
      const precoFinal = Number(
        original_price ||
          resVarDb?.data?.preco_promocional ||
          resVarDb?.data?.preco_venda_varejo ||
          (prodDb.promocao_ativa ? prodDb.preco_promocional : null) ||
          prodDb.preco_venda_varejo ||
          0
      );
      const estoqueFinal = Math.max(
        0,
        Math.floor(
          Number(
            normal_stock ?? resVarDb?.data?.quantidade_estoque ?? prodDb.quantidade_estoque ?? 0
          )
        )
      );

      // 1. Espelha imagens no Storage + upload para /api/v2/media_space/upload_image
      const urlsOrigem: string[] = Array.isArray(prodDb.fotos_urls) && prodDb.fotos_urls.length > 0
        ? prodDb.fotos_urls
        : Array.isArray(fotosPayload)
        ? fotosPayload
        : [];

      const urlsUnicas = urlsOrigem
        .map((u) => (typeof u === "string" ? u.trim() : ""))
        .filter((u) => /^https?:\/\//i.test(u))
        .slice(0, 9);

      if (urlsUnicas.length === 0) {
        return new Response(
          JSON.stringify({ error: "O produto precisa de pelo menos 1 foto válida para publicar na Shopee." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const uploads = await Promise.all(
        urlsUnicas.map((urlOrig, idx) =>
          fazerUploadImagemMediaSpaceShopee({
            urlOriginal: urlOrig,
            token: auth.token,
            shopId: auth.shopId,
            partnerId: auth.partnerId,
            partnerKey: auth.partnerKey,
            supabaseAdmin,
            lojaId: loja_id,
            supabaseUrl,
            indice: idx,
          })
        )
      );

      const imageIdList = uploads
        .map((u) => u.imageId)
        .filter((id): id is string => Boolean(id));

      if (imageIdList.length === 0) {
        throw new ShopeeError(
          "Não foi possível enviar as fotos do produto para a mídia da Shopee. Verifique se as imagens estão acessíveis.",
          400
        );
      }

      // Retroalimenta URLs espelhadas no Supabase Storage caso alguma tenha mudado
      const novasUrlsBanco = uploads.map((u) => u.urlStorage);
      if (novasUrlsBanco.some((u, idx) => u !== urlsUnicas[idx])) {
        await supabaseAdmin
          .from("produtos")
          .update({ fotos_urls: novasUrlsBanco })
          .eq("id", produto_id)
          .eq("loja_id", loja_id);
      }

      // 2. Resolve category_id + canais logísticos ativos
      let categoryIdAlvo = Number(category_id || 0);
      if (!categoryIdAlvo) {
        const resRec = await chamarApiShopeeLoja<any>({
          apiPath: "/api/v2/product/category_recommend",
          method: "GET",
          token: auth.token,
          shopId: auth.shopId,
          partnerId: auth.partnerId,
          partnerKey: auth.partnerKey,
          queryParams: { item_name: nomeItem },
        }).catch(() => ({}));
        categoryIdAlvo = Number(resRec?.response?.category_id?.[0] || 0);
      }

      if (!categoryIdAlvo) {
        throw new ShopeeError("Não foi possível identificar a categoria na Shopee para este produto.", 400);
      }

      const canaisAtivos = await consultarCanaisLogisticosAtivosShopee(auth);
      if (canaisAtivos.length === 0) {
        throw new ShopeeError(
          "Nenhum canal de envio (Shopee Xpress / Correios) está ativo na sua conta da Shopee. Ative ao menos um canal no Seller Center.",
          400
        );
      }

      const logisticInfo = canaisAtivos.map((ch) => ({
        logistic_id: ch.logistics_channel_id,
        enabled: true,
      }));

      // 3. Mapeia atributos da Shopee (somente valores reais válidos)
      const attributeList: Array<{ attribute_id: number; attribute_value_list: Array<{ value_id: number; original_value_name?: string }> }> = [];
      if (Array.isArray(atributos_extras)) {
        for (const attr of atributos_extras) {
          const attrIdNum = Number(attr?.id || attr?.attribute_id || 0);
          if (!Number.isFinite(attrIdNum) || attrIdNum <= 0) continue;
          const valIdNum = Number(attr?.value_id || 0);
          const valNome = String(attr?.value_name || "").trim();
          if (!valIdNum && !valNome) continue;
          attributeList.push({
            attribute_id: attrIdNum,
            attribute_value_list: [
              valIdNum > 0
                ? { value_id: valIdNum, ...(valNome ? { original_value_name: valNome } : {}) }
                : { value_id: 0, original_value_name: valNome },
            ],
          });
        }
      }

      // 4. EAN/GTIN + dimensões/peso
      const gtinCandidato = !sem_gtin
        ? String(gtin || resVarDb?.data?.codigo_barras || prodDb.codigo_barras || "").replace(/\D/g, "").trim()
        : "";
      const gtinValido = gtinCandidato && validarGtinGs1(gtinCandidato) ? gtinCandidato : "";

      const pesoKg = Math.max(0.1, Number(prodDb.peso_kg || 0.35));
      const dimComprimento = Math.max(1, Math.round(Number(prodDb.comprimento_cm || 20)));
      const dimLargura = Math.max(1, Math.round(Number(prodDb.largura_cm || 15)));
      const dimAltura = Math.max(1, Math.round(Number(prodDb.altura_cm || 10)));

      const payloadShopee: Record<string, unknown> = {
        item_name: nomeItem,
        description: descricaoTexto.length >= 20 ? descricaoTexto : `${nomeItem} - Produto novo e original com nota fiscal.`,
        original_price: Number(precoFinal.toFixed(2)),
        seller_stock: [{ stock: estoqueFinal }],
        category_id: categoryIdAlvo,
        image: { image_id_list: imageIdList },
        weight: Number(pesoKg.toFixed(2)),
        dimension: {
          package_length: dimComprimento,
          package_width: dimLargura,
          package_height: dimAltura,
        },
        logistic_info: logisticInfo,
        condition: "NEW",
        item_status: "NORMAL",
        ...(attributeList.length > 0 ? { attribute_list: attributeList } : {}),
        ...(marca && !/^gen[eé]rico$/i.test(String(marca))
          ? { brand: { brand_id: 0, original_brand_name: String(marca).trim() } }
          : { brand: { brand_id: 0, original_brand_name: "NoBrand" } }),
        ...(gtinValido ? { gtin_code: gtinValido } : {}),
      };

      const resCriacao = await chamarApiShopeeLoja<any>({
        apiPath: "/api/v2/product/add_item",
        method: "POST",
        token: auth.token,
        shopId: auth.shopId,
        partnerId: auth.partnerId,
        partnerKey: auth.partnerKey,
        bodyJson: payloadShopee,
      });

      const novoItemId = Number(resCriacao?.response?.item_id || 0);
      if (!novoItemId) {
        throw new ShopeeError("A Shopee não retornou o identificador do anúncio criado.", 502);
      }

      // Retroalimenta EAN validado para o cadastro do Rubi
      if (gtinValido) {
        if (variacao_id) {
          await supabaseAdmin
            .from("variacoes_produto")
            .update({ codigo_barras: gtinValido })
            .eq("id", variacao_id)
            .eq("loja_id", loja_id);
        }
        if (!variacao_id || String(prodDb.codigo_barras || "").trim() !== gtinValido) {
          await supabaseAdmin
            .from("produtos")
            .update({ codigo_barras: gtinValido })
            .eq("id", produto_id)
            .eq("loja_id", loja_id);
        }
      }

      const permalink = `https://shopee.com.br/product/${auth.shopId}/${novoItemId}`;

      await supabaseAdmin.from("marketplace_anuncios").insert({
        loja_id,
        conta_id: auth.conta.id,
        produto_id,
        variacao_id: variacao_id || null,
        plataforma: "shopee",
        ml_item_id: String(novoItemId),
        ml_category_id: String(categoryIdAlvo),
        ml_listing_type_id: "shopee_padrao",
        titulo_anuncio: nomeItem,
        preco_anuncio: Number(precoFinal.toFixed(2)),
        margem_sobrepreco_percentual: Number(margem_sobrepreco || 0),
        estoque_ultimo_enviado: estoqueFinal,
        status_anuncio: "active",
        permalink,
        sincronizacao_ativa: true,
        ultima_sincronizacao_estoque_em: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem: `Anúncio #${novoItemId} publicado com sucesso na Shopee!`,
          permalink,
          gtin_sincronizado: gtinValido || null,
          item: {
            id: String(novoItemId),
            category_id: String(categoryIdAlvo),
            price: Number(precoFinal.toFixed(2)),
            permalink,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 3: SINCRONIZAR ESTOQUE (Rubi -> Shopee)
    // =========================================================================
    if (action === "sync_stock" || action === "sync_inventory") {
      const { produto_id } = corpo;
      if (!produto_id) {
        return new Response(
          JSON.stringify({ error: "produto_id é obrigatório para sincronização de estoque." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const auth = await obterAccessTokenShopeeValido(supabaseAdmin, loja_id);
      if (!auth.conta.sincronizar_estoque_automatico) {
        return new Response(
          JSON.stringify({ sucesso: true, mensagem: "Sincronização automática de estoque desativada para Shopee." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: anuncios } = await supabaseAdmin
        .from("marketplace_anuncios")
        .select("id, ml_item_id, ml_variation_id, variacao_id")
        .eq("loja_id", loja_id)
        .eq("produto_id", produto_id)
        .eq("plataforma", "shopee")
        .eq("sincronizacao_ativa", true);

      if (!Array.isArray(anuncios) || anuncios.length === 0) {
        return new Response(
          JSON.stringify({ sucesso: true, mensagem: "Nenhum anúncio Shopee vinculado a este produto." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: prod } = await supabaseAdmin
        .from("produtos")
        .select("quantidade_estoque")
        .eq("id", produto_id)
        .eq("loja_id", loja_id)
        .maybeSingle();

      const { data: variacoes } = await supabaseAdmin
        .from("variacoes_produto")
        .select("id, quantidade_estoque")
        .eq("produto_id", produto_id)
        .eq("loja_id", loja_id);

      const mapaVar = new Map<string, number>();
      if (Array.isArray(variacoes)) {
        for (const v of variacoes) {
          mapaVar.set(v.id, Math.max(0, Number(v.quantidade_estoque || 0)));
        }
      }

      let atualizados = 0;
      for (const anuncio of anuncios) {
        const itemIdNum = Number(anuncio.ml_item_id);
        if (!Number.isFinite(itemIdNum) || itemIdNum <= 0) continue;

        const estoqueAlvo = anuncio.variacao_id
          ? mapaVar.get(anuncio.variacao_id) ?? Math.max(0, Number(prod?.quantidade_estoque || 0))
          : Math.max(0, Number(prod?.quantidade_estoque || 0));

        await chamarApiShopeeLoja<any>({
          apiPath: "/api/v2/product/update_stock",
          method: "POST",
          token: auth.token,
          shopId: auth.shopId,
          partnerId: auth.partnerId,
          partnerKey: auth.partnerKey,
          bodyJson: {
            item_id: itemIdNum,
            stock_list: [
              {
                model_id: Number(anuncio.ml_variation_id || 0),
                seller_stock: [{ stock: estoqueAlvo }],
              },
            ],
          },
        }).then(async () => {
          atualizados += 1;
          await supabaseAdmin
            .from("marketplace_anuncios")
            .update({
              estoque_ultimo_enviado: estoqueAlvo,
              ultima_sincronizacao_estoque_em: new Date().toISOString(),
              ultimo_erro_sincronizacao: null,
            })
            .eq("id", anuncio.id)
            .eq("loja_id", loja_id);
        }).catch(async (errSync) => {
          await supabaseAdmin
            .from("marketplace_anuncios")
            .update({
              ultimo_erro_sincronizacao: String(errSync?.message || "Falha de sincronia").slice(0, 250),
            })
            .eq("id", anuncio.id)
            .eq("loja_id", loja_id);
        });
      }

      return new Response(
        JSON.stringify({ sucesso: true, atualizados }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO 4: RECONCILIAR STATUS DOS ANÚNCIOS (Shopee -> Rubi)
    // =========================================================================
    if (action === "sync_listings_status") {
      const auth = await obterAccessTokenShopeeValido(supabaseAdmin, loja_id);

      const { data: vinculos } = await supabaseAdmin
        .from("marketplace_anuncios")
        .select("id, ml_item_id, status_anuncio, preco_anuncio, permalink")
        .eq("loja_id", loja_id)
        .eq("plataforma", "shopee");

      if (!Array.isArray(vinculos) || vinculos.length === 0) {
        return new Response(
          JSON.stringify({
            sucesso: true,
            total_verificados: 0,
            removidos: 0,
            atualizados: 0,
            ids_removidos: [],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const idsUnicos = Array.from(
        new Set(
          vinculos
            .map((v) => Number(v.ml_item_id))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );

      const mapaItensShopee = new Map<number, any>();
      for (let i = 0; i < idsUnicos.length; i += 50) {
        const lote = idsUnicos.slice(i, i + 50);
        const resInfo = await chamarApiShopeeLoja<any>({
          apiPath: "/api/v2/product/get_item_base_info",
          method: "GET",
          token: auth.token,
          shopId: auth.shopId,
          partnerId: auth.partnerId,
          partnerKey: auth.partnerKey,
          queryParams: { item_id_list: lote },
        }).catch(() => ({}));

        const itemList = Array.isArray(resInfo?.response?.item_list)
          ? resInfo.response.item_list
          : [];
        for (const item of itemList) {
          mapaItensShopee.set(Number(item.item_id), item);
        }
      }

      const idsParaRemover: string[] = [];
      let removidos = 0;
      let atualizados = 0;

      for (const vinculo of vinculos) {
        const itemIdNum = Number(vinculo.ml_item_id);
        const item = mapaItensShopee.get(itemIdNum);

        if (!item) {
          idsParaRemover.push(vinculo.ml_item_id);
          continue;
        }

        const novoStatus = normalizarStatusShopeeParaHubi(item.item_status);
        if (novoStatus === "closed") {
          idsParaRemover.push(vinculo.ml_item_id);
          continue;
        }

        const precoAtual = Number(
          item?.price_info?.[0]?.current_price || item?.price_info?.[0]?.original_price || vinculo.preco_anuncio || 0
        );
        const permalinkAtual = `https://shopee.com.br/product/${auth.shopId}/${itemIdNum}`;

        if (
          novoStatus !== vinculo.status_anuncio ||
          Math.abs(precoAtual - Number(vinculo.preco_anuncio || 0)) > 0.01 ||
          permalinkAtual !== vinculo.permalink
        ) {
          await supabaseAdmin
            .from("marketplace_anuncios")
            .update({
              status_anuncio: novoStatus,
              preco_anuncio: precoAtual,
              permalink: permalinkAtual,
              ultima_sincronizacao_estoque_em: new Date().toISOString(),
            })
            .eq("id", vinculo.id)
            .eq("loja_id", loja_id);
          atualizados += 1;
        }
      }

      if (idsParaRemover.length > 0) {
        await supabaseAdmin
          .from("marketplace_anuncios")
          .delete()
          .eq("loja_id", loja_id)
          .eq("plataforma", "shopee")
          .in("ml_item_id", idsParaRemover);
        removidos = idsParaRemover.length;
      }

      return new Response(
        JSON.stringify({
          sucesso: true,
          total_verificados: vinculos.length,
          removidos,
          atualizados,
          ids_removidos: idsParaRemover,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação não reconhecida em shopee-estoque-sync." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[shopee-estoque-sync] Erro:", err?.message);
    return new Response(
      JSON.stringify({
        error: err?.userMessage || err?.message || "Erro interno na integração com a Shopee.",
      }),
      { status: err?.statusCode || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
