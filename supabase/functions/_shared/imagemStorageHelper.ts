// Utilitário compartilhado entre Edge Functions para normalização, validação,
// download server-side (com fallback anti-hotlink) e espelhamento de imagens no Supabase Storage.

export const BUCKET_PRODUTOS = "produtos";
export const PREFIXO_PUBLICO_STORAGE_PADRAO =
  "https://eylpiwynsbnmcacmwiqg.supabase.co/storage/v1/object/public/";
export const USER_AGENT_NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const TAMANHO_MINIMO_BYTES = 1025; // > 1024 bytes
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15 MB

export type MimeImagemPermitido = "image/jpeg" | "image/png" | "image/webp";
export type ExtensaoImagemPermitida = "jpg" | "png" | "webp";

export interface ResultadoDownloadImagem {
  sucesso: true;
  bytes: Uint8Array;
  mime: MimeImagemPermitido;
  ext: ExtensaoImagemPermitida;
  urlNormalizada: string;
}

export interface FalhaDownloadImagem {
  sucesso: false;
  urlNormalizada: string;
  erro: string;
}

export interface ResultadoEspelhamentoStorage {
  sucesso: true;
  urlPublica: string;
  espelhadaAgora: boolean;
  bytes?: Uint8Array;
  mime?: MimeImagemPermitido;
  ext?: ExtensaoImagemPermitida;
}

export interface FalhaEspelhamentoStorage {
  sucesso: false;
  urlOriginal: string;
  erro: string;
}

export function normalizarUrlImagemExterna(url: string): string {
  return String(url || "")
    .trim()
    .replace(/(%7Bw%7Dx%7Bh%7D|\{w\}x\{h\})/gi, "1000x1000");
}

export function ehUrlSupabaseStorageProjeto(
  url: string,
  supabaseUrl?: string
): boolean {
  const limpa = String(url || "").trim();
  if (!limpa) return false;
  if (limpa.startsWith(PREFIXO_PUBLICO_STORAGE_PADRAO)) {
    return true;
  }
  const baseDinamica = String(supabaseUrl || "").trim().replace(/\/$/, "");
  if (baseDinamica) {
    return limpa.startsWith(`${baseDinamica}/storage/v1/object/public/`);
  }
  return false;
}

function ehHostPrivadoOuLocal(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  // Faixas IPv4 privadas / loopback / link-local
  const matchIpv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (matchIpv4) {
    const a = Number(matchIpv4[1]);
    const b = Number(matchIpv4[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  // Link-local / ULA IPv6
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  return false;
}

export function validarUrlExternaSegura(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (ehHostPrivadoOuLocal(parsed.hostname)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function detectarMimePorMagicBytes(
  bytes: Uint8Array
): { mime: MimeImagemPermitido; ext: ExtensaoImagemPermitida } | null {
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
  return null;
}

export function inferirMimeEExtensaoImagemPermitida(
  contentTypeHeader: string | null,
  _url: string,
  bytes: Uint8Array
): { mime: MimeImagemPermitido; ext: ExtensaoImagemPermitida } | null {
  const ct = (contentTypeHeader || "").split(";")[0].trim().toLowerCase();

  // Rejeita explicitamente páginas HTML, JSON, texto, XML e SVG
  if (
    ct === "text/html" ||
    ct === "application/json" ||
    ct === "text/plain" ||
    ct === "application/xml" ||
    ct === "text/xml" ||
    ct === "image/svg+xml"
  ) {
    return null;
  }

  // Confirma por assinatura binária (magic bytes) sempre que disponível
  const magic = detectarMimePorMagicBytes(bytes);
  if (magic) {
    if (
      !ct ||
      ct === "application/octet-stream" ||
      ct === "binary/octet-stream" ||
      ct === "image/jpeg" ||
      ct === "image/jpg" ||
      ct === "image/png" ||
      ct === "image/webp" ||
      ct.startsWith("image/")
    ) {
      return magic;
    }
  }

  if (ct === "image/jpeg" || ct === "image/jpg") {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (ct === "image/png") {
    return { mime: "image/png", ext: "png" };
  }
  if (ct === "image/webp") {
    return { mime: "image/webp", ext: "webp" };
  }

  return null;
}

async function lerEValidarRespostaImagem(
  resp: Response,
  urlNormalizada: string
): Promise<ResultadoDownloadImagem | null> {
  if (!resp.ok) return null;

  const contentTypeHeader = resp.headers.get("content-type");
  const contentTypeBase = (contentTypeHeader || "").split(";")[0].trim().toLowerCase();

  if (
    contentTypeBase &&
    contentTypeBase !== "image/jpeg" &&
    contentTypeBase !== "image/jpg" &&
    contentTypeBase !== "image/png" &&
    contentTypeBase !== "image/webp" &&
    contentTypeBase !== "application/octet-stream" &&
    contentTypeBase !== "binary/octet-stream" &&
    !contentTypeBase.startsWith("image/")
  ) {
    return null;
  }

  const buffer = await resp.arrayBuffer();
  if (!buffer || buffer.byteLength < TAMANHO_MINIMO_BYTES || buffer.byteLength > TAMANHO_MAXIMO_BYTES) {
    return null;
  }

  const bytes = new Uint8Array(buffer);
  const info = inferirMimeEExtensaoImagemPermitida(contentTypeHeader, urlNormalizada, bytes);
  if (!info) return null;

  return {
    sucesso: true,
    bytes,
    mime: info.mime,
    ext: info.ext,
    urlNormalizada,
  };
}

export async function baixarImagemExterna(
  urlOriginal: string,
  timeoutMs = 15000
): Promise<ResultadoDownloadImagem | FalhaDownloadImagem> {
  const urlNormalizada = normalizarUrlImagemExterna(urlOriginal);
  const parsedUrl = validarUrlExternaSegura(urlNormalizada);

  if (!parsedUrl) {
    return {
      sucesso: false,
      urlNormalizada,
      erro: "URL de imagem inválida ou não permitida.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const refererOrigem = `${parsedUrl.origin}/`;

    // Tentativa 1: Headers completos de navegador com Referer da origem
    const respComReferer = await fetch(urlNormalizada, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT_NAVEGADOR,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": refererOrigem,
      },
      signal: controller.signal,
    });

    const validadoComReferer = await lerEValidarRespostaImagem(respComReferer, urlNormalizada);
    if (validadoComReferer) {
      return validadoComReferer;
    }

    // Tentativa 2: Fallback direto sem Referer (contorna CDNs como KaBuM/Magalu que bloqueiam Referer)
    const respSemReferer = await fetch(urlNormalizada, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT_NAVEGADOR,
        "Accept": "image/*",
      },
      signal: controller.signal,
    });

    const validadoSemReferer = await lerEValidarRespostaImagem(respSemReferer, urlNormalizada);
    if (validadoSemReferer) {
      return validadoSemReferer;
    }

    return {
      sucesso: false,
      urlNormalizada,
      erro: `Não foi possível validar o arquivo de imagem (HTTP ${respSemReferer.status || respComReferer.status}).`,
    };
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError"
      ? "Tempo limite excedido ao baixar imagem externa."
      : "Não foi possível baixar a imagem externa.";
    return {
      sucesso: false,
      urlNormalizada,
      erro: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function espelharImagemExternaNoStorage(
  supabaseAdmin: any,
  params: {
    url: string;
    lojaId: string;
    supabaseUrl?: string;
  }
): Promise<ResultadoEspelhamentoStorage | FalhaEspelhamentoStorage> {
  const { url, lojaId, supabaseUrl } = params;
  const urlLimpa = String(url || "").trim();

  if (ehUrlSupabaseStorageProjeto(urlLimpa, supabaseUrl)) {
    return {
      sucesso: true,
      urlPublica: urlLimpa,
      espelhadaAgora: false,
    };
  }

  const download = await baixarImagemExterna(urlLimpa);
  if (!download.sucesso) {
    return {
      sucesso: false,
      urlOriginal: urlLimpa,
      erro: download.erro,
    };
  }

  const caminhoArquivo = `${lojaId}/produtos/${crypto.randomUUID()}.${download.ext}`;

  const { error: erroUpload } = await supabaseAdmin.storage
    .from(BUCKET_PRODUTOS)
    .upload(caminhoArquivo, download.bytes, {
      contentType: download.mime,
      cacheControl: "31536000",
      upsert: true,
    });

  if (erroUpload) {
    return {
      sucesso: false,
      urlOriginal: urlLimpa,
      erro: "Não foi possível armazenar a imagem no servidor do sistema.",
    };
  }

  const { data: publicData } = supabaseAdmin.storage
    .from(BUCKET_PRODUTOS)
    .getPublicUrl(caminhoArquivo);

  const urlPublica = String(publicData?.publicUrl || "").trim();
  if (!urlPublica) {
    return {
      sucesso: false,
      urlOriginal: urlLimpa,
      erro: "Não foi possível gerar o link público da imagem salva.",
    };
  }

  return {
    sucesso: true,
    urlPublica,
    espelhadaAgora: true,
    bytes: download.bytes,
    mime: download.mime,
    ext: download.ext,
  };
}
