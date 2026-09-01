import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Tag,
  Layers,
  Image as ImageIcon,
  Camera,
  Upload,
  Link as LinkIcon,
  Loader2,
  Key,
  Check,
  X,
  AlertCircle,
  Package,
  Boxes,
  Eye,
  Star,
  FolderPlus,
  ArrowRight,
  Calculator,
  Percent,
  Search,
  Building2,
  TrendingUp,
  TrendingDown,
  Store,
  ShoppingBag,
  Zap,
  RefreshCw,
  Lock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Categoria, Fornecedor, UnidadeMedida } from '../types';
import { UNIDADES_PADRAO } from './CadastrosAuxiliares';
import { ModalGerenciarCategorias } from './ModalGerenciarCategorias';

export interface PrecoConcorrente {
  loja: string;
  preco: number;
  tipo?: string;
  observacao?: string;
}

export interface DadosMercadoIA {
  precoMedio: number;
  menorPreco: number;
  maiorPreco: number;
  totalPesquisados: number;
  concorrentes: PrecoConcorrente[];
  menoresPrecos: PrecoConcorrente[];
  maioresPrecos: PrecoConcorrente[];
  dataConsulta: string;
}

export interface ProdutoSugeridoIA {
  nome: string;
  categoria_sugerida?: string;
  preco_venda_estimado?: number;
  preco_custo_estimado?: number;
  descricao?: string;
  tipo_unidade?: string;
  codigo_barras?: string;
  dados_mercado?: DadosMercadoIA;
}

const STORAGE_KEY_GEMINI_KEY = 'hubi_gemini_api_key';

const getGeminiApiKey = (): string => {
  return (
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    localStorage.getItem(STORAGE_KEY_GEMINI_KEY) ||
    ''
  );
};

const setGeminiApiKey = (key: string) => {
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY_GEMINI_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_GEMINI_KEY);
  }
};

const comprimirArquivoImagem = async (file: File): Promise<{ blob: Blob; dataUrl: string }> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fetch(dataUrl).then(res => res.blob()).then(blob => resolve({ blob, dataUrl }));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl: canvas.toDataURL('image/jpeg', 0.82) });
            } else {
              fetch(dataUrl).then(res => res.blob()).then(b => resolve({ blob: b, dataUrl }));
            }
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = () => {
        fetch(dataUrl).then(res => res.blob()).then(blob => resolve({ blob, dataUrl }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
};

// Cache em memória do Base64 das fotos para análise instantânea pela IA sem precisar baixar da nuvem
const fotoBase64Cache = new Map<string, string>();

const uploadFotoParaSupabase = async (
  file: File,
  lojaId: string
): Promise<{ publicUrl: string; dataUrl: string }> => {
  const { blob, dataUrl } = await comprimirArquivoImagem(file);
  const ext = 'jpg';
  const nomeArquivo = `${lojaId || 'geral'}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

  // Salvar no cache local imediatamente
  fotoBase64Cache.set(dataUrl, dataUrl);

  try {
    const { error } = await supabase.storage
      .from('produtos')
      .upload(nomeArquivo, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) {
      console.warn('Aviso: Bucket "produtos" no Supabase Storage não disponível ou sem permissão pública. Usando imagem local temporária.', error);
      fotoBase64Cache.set(dataUrl, dataUrl);
      return { publicUrl: dataUrl, dataUrl };
    }

    const { data: publicData } = supabase.storage
      .from('produtos')
      .getPublicUrl(nomeArquivo);

    const finalUrl = publicData?.publicUrl || dataUrl;
    fotoBase64Cache.set(finalUrl, dataUrl);

    return {
      publicUrl: finalUrl,
      dataUrl
    };
  } catch (err) {
    console.warn('Erro ao salvar no Storage:', err);
    return { publicUrl: dataUrl, dataUrl };
  }
};

const comprimirImagemParaIA = async (base64OrUrl: string): Promise<{ base64: string; mimeType: string }> => {
  return new Promise(async (resolve) => {
    // 1. Verificar se temos o Base64 no cache em memória
    let target = fotoBase64Cache.get(base64OrUrl) || base64OrUrl;

    // 2. Se for uma URL externa ou storage, baixar e converter para base64
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('blob:')) {
      try {
        const response = await fetch(target);
        const blob = await response.blob();
        target = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onloadend = () => res(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn('Erro ao converter URL para base64:', err);
      }
    }

    if (!target.startsWith('data:image')) {
      const clean = target.includes(',') ? target.split(',')[1] : target;
      resolve({ base64: clean, mimeType: 'image/jpeg' });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 640px é o ponto ideal: resolução excelente para OCR e reconhecimento de produto, com payload ultraleve (<40KB)
      const maxDim = 640;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        const raw = target.includes(',') ? target.split(',')[1] : target;
        resolve({ base64: raw, mimeType: 'image/jpeg' });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      const cleanBase64 = compressedDataUrl.includes(',') ? compressedDataUrl.split(',')[1] : compressedDataUrl;
      resolve({
        base64: cleanBase64,
        mimeType: 'image/jpeg'
      });
    };
    img.onerror = () => {
      const raw = target.includes(',') ? target.split(',')[1] : target;
      resolve({
        base64: raw,
        mimeType: 'image/jpeg'
      });
    };
    img.src = target;
  });
};

const processarListaConcorrentes = (rawList: any[], precoMedioFallback: number): DadosMercadoIA => {
  const listaBruta: PrecoConcorrente[] = (Array.isArray(rawList) ? rawList : [])
    .map((c: any) => ({
      loja: String(c.loja || c.estabelecimento || 'Loja de Varejo'),
      preco: Number(c.preco || c.valor) || 0,
      tipo: String(c.tipo || 'Varejo Online'),
      observacao: c.observacao ? String(c.observacao) : undefined
    }))
    .filter((c: PrecoConcorrente) => c.preco > 0);

  const ordenados = [...listaBruta].sort((a, b) => a.preco - b.preco);
  const menoresPrecos = ordenados.slice(0, 5);
  const maioresPrecos = [...ordenados].reverse().slice(0, 5);

  const soma = listaBruta.reduce((acc, c) => acc + c.preco, 0);
  const mediaCalculada = listaBruta.length > 0
    ? Number((soma / listaBruta.length).toFixed(2))
    : Number(precoMedioFallback) || 0;

  return {
    precoMedio: mediaCalculada,
    menorPreco: ordenados.length > 0 ? ordenados[0].preco : mediaCalculada,
    maiorPreco: ordenados.length > 0 ? ordenados[ordenados.length - 1].preco : mediaCalculada,
    totalPesquisados: listaBruta.length,
    concorrentes: listaBruta,
    menoresPrecos,
    maioresPrecos,
    dataConsulta: new Date().toLocaleDateString('pt-BR')
  };
};

let modelosGeminiValidosCache: string[] | null = null;

const obterModelosValidosGemini = async (apiKey: string): Promise<string[]> => {
  if (modelosGeminiValidosCache && modelosGeminiValidosCache.length > 0) {
    return modelosGeminiValidosCache;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const models = data?.models || [];
      const lista = models
        .filter((m: any) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          !m.name.includes('embedding') &&
          !m.name.includes('aqa') &&
          !m.name.includes('bison')
        )
        .map((m: any) => m.name.replace('models/', ''));

      if (lista.length > 0) {
        lista.sort((a: string, b: string) => {
          const aP = a.includes('flash') ? 10 : a.includes('pro') ? 5 : 1;
          const bP = b.includes('flash') ? 10 : b.includes('pro') ? 5 : 1;
          return bP - aP;
        });
        modelosGeminiValidosCache = lista;
        return lista;
      }
    }
  } catch (e) {
    console.warn('Erro ao consultar lista de modelos do Gemini, usando fallback:', e);
  }

  return [
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-002',
    'gemini-2.0-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro',
    'gemini-pro'
  ];
};

const executarRequisicaoGemini = async (apiKey: string, requestBody: any): Promise<any> => {
  const modelos = await obterModelosValidosGemini(apiKey);
  let primeiroErro: string | null = null;

  for (const modelo of modelos) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return await response.json();
      } else {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson?.error?.message || response.statusText;
        if (!primeiroErro) primeiroErro = msg;
        console.warn(`Tentativa com modelo ${modelo} retornou erro:`, msg);
      }
    } catch (e: any) {
      if (!primeiroErro) primeiroErro = e?.message || String(e);
      console.warn(`Exceção ao chamar modelo ${modelo}:`, e);
    }
  }

  throw new Error(primeiroErro || 'Não foi possível se comunicar com o Google Gemini.');
};

const identificarProdutoPorFoto = async (
  imageBase64OrUrl: string
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();

  if (apiKey) {
    try {
      const { base64: rawBase64, mimeType: detectedMime } = await comprimirImagemParaIA(imageBase64OrUrl);
      const cleanBase64 = rawBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').replace(/\s/g, '');

      const promptInstrucao = `
Você é um especialista em catálogo de produtos e inteligência de precificação de varejo e e-commerce no Brasil.
Analise detalhadamente a foto do produto enviada.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional) com a seguinte estrutura:
{
  "nome": "Nome comercial preciso, atraente e completo do produto em português (ex: Refrigerante Coca-Cola Lata 350ml, Camiseta Básica Algodão Preta M, etc.)",
  "categoria_sugerida": "Nome da categoria mais adequada (ex: Bebidas, Alimentos, Vestuário, Eletrônicos, Cosméticos, Limpeza, etc.)",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial de alta conversão para catálogo online e WhatsApp destacando os benefícios, volume/tamanho e especificações do item.",
  "tipo_unidade": "un",
  "codigo_barras": "Código de barras numérico se visível na foto, senão vazio",
  "concorrentes_mercado": [
    { "loja": "Mercado Livre", "preco": 0.00, "tipo": "Marketplace" },
    { "loja": "Amazon Brasil", "preco": 0.00, "tipo": "E-commerce" },
    { "loja": "Shopee", "preco": 0.00, "tipo": "Marketplace" },
    { "loja": "Magalu", "preco": 0.00, "tipo": "Varejista" },
    { "loja": "Supermercados / Farmácias", "preco": 0.00, "tipo": "Varejo Físico" }
  ]
}
`;

      const requestBody: any = {
        contents: [
          {
            parts: [
              { text: promptInstrucao },
              {
                inline_data: {
                  mime_type: detectedMime || 'image/jpeg',
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: 'application/json'
        }
      };

      const resData = await executarRequisicaoGemini(apiKey, requestBody);

      if (resData) {
        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(jsonLimpo);
          const precoEstimado = Number(parsed.preco_venda_estimado) || 0;

          let dadosMercadoFormatados: DadosMercadoIA | undefined = undefined;
          if (Array.isArray(parsed.concorrentes_mercado) && parsed.concorrentes_mercado.length > 0) {
            dadosMercadoFormatados = processarListaConcorrentes(parsed.concorrentes_mercado, precoEstimado);
          }

          return {
            nome: parsed.nome || 'Produto Identificado',
            categoria_sugerida: parsed.categoria_sugerida || 'Geral',
            preco_venda_estimado: precoEstimado,
            preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
            descricao: parsed.descricao || '',
            tipo_unidade: parsed.tipo_unidade || 'un',
            codigo_barras: parsed.codigo_barras || '',
            dados_mercado: dadosMercadoFormatados
          };
        }
      }
    } catch (err: any) {
      console.warn('Erro ao chamar Gemini Vision API:', err);
      throw err;
    }
  } else {
    throw new Error('Chave da API do Google Gemini não configurada. Clique no botão "Chave Gemini IA" no topo da página para inserir sua chave.');
  }

  return {
    nome: 'Novo Produto Capturado',
    categoria_sugerida: 'Geral',
    preco_venda_estimado: 29.90,
    preco_custo_estimado: 15.00,
    descricao: 'Produto cadastrado via captura de imagem.',
    tipo_unidade: 'un',
    codigo_barras: ''
  };
};

export const pesquisarPrecosMercadoIA = async (
  nomeProduto: string,
  categoriaNome?: string,
  barcode?: string
): Promise<DadosMercadoIA> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure a chave no topo da página.');
  }

  const promptTexto = `
Você é um especialista em inteligência de mercado e monitoramento de preços de produtos no varejo e e-commerce brasileiro.
Pesquise e levante os preços reais de varejo praticados no Brasil para o seguinte item:

Produto: "${nomeProduto}"
${categoriaNome ? `Categoria: "${categoriaNome}"` : ''}
${barcode ? `Código de Barras/EAN: "${barcode}"` : ''}

Identifique entre 10 a 14 estabelecimentos, lojas online, marketplaces e grandes redes que comercializam este produto ou itens similares da mesma categoria no Brasil (ex: Mercado Livre, Amazon Brasil, Magalu, Shopee, Droga Raia, Drogasil, Carrefour, Pão de Açúcar, Americanas, Farmácias Pague Menos, Petz, Cobasi, Kalunga, Casas Bahia, lojas especializadas de atacado/distribuição, etc.).

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional) no seguinte formato:
{
  "preco_medio": 0.00,
  "concorrentes": [
    { "loja": "Shopee", "preco": 32.90, "tipo": "Marketplace" },
    { "loja": "Mercado Livre", "preco": 35.90, "tipo": "Marketplace" },
    { "loja": "Amazon Brasil", "preco": 38.90, "tipo": "E-commerce" },
    { "loja": "Magalu", "preco": 39.90, "tipo": "Varejista" },
    { "loja": "Supermercado / Farmácia", "preco": 44.90, "tipo": "Varejo Físico" }
  ]
}
`;

  const requestBody: any = {
    contents: [
      {
        parts: [{ text: promptTexto }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      response_mime_type: 'application/json'
    }
  };

  const resData = await executarRequisicaoGemini(apiKey, requestBody);

  const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Resposta vazia da IA.');

  const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonLimpo);

  const lista = parsed.concorrentes || [];
  return processarListaConcorrentes(lista, Number(parsed.preco_medio) || 0);
};

const identificarProdutoPorTextoOuEan = async (
  tipo: 'descricao' | 'barcode',
  valor: string
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure a chave no topo da página.');
  }

  const prompt = tipo === 'barcode' ? `
Você é um especialista em catálogo de produtos, banco de dados EAN/GS1 e precificação no Brasil.
Identifique o produto com o seguinte Código de Barras / EAN: "${valor}".
Se não encontrar o código exato, deduza a categoria e o item mais provável com base no padrão e mercado brasileiro.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional):
{
  "nome": "Nome comercial completo do produto em português (ex: Desodorante Aerosol Rexona Men Invisible 150ml)",
  "categoria_sugerida": "Nome da categoria mais adequada (ex: Higiene, Bebidas, Alimentos, etc.)",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial de alta conversão destacando benefícios e especificações",
  "tipo_unidade": "un",
  "codigo_barras": "${valor}",
  "concorrentes_mercado": [
    { "loja": "Mercado Livre", "preco": 0.00, "tipo": "Marketplace" },
    { "loja": "Amazon Brasil", "preco": 0.00, "tipo": "E-commerce" },
    { "loja": "Magalu", "preco": 0.00, "tipo": "Varejista" },
    { "loja": "Shopee", "preco": 0.00, "tipo": "Marketplace" }
  ]
}
` : `
Você é um especialista em catálogo de produtos e precificação de varejo e e-commerce no Brasil.
Com base no nome ou descrição informada: "${valor}", estruture a ficha completa do produto com inteligência de mercado.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional):
{
  "nome": "Nome comercial completo e padronizado do produto em português",
  "categoria_sugerida": "Nome da categoria mais adequada",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial completa de alta conversão para catálogo online e WhatsApp",
  "tipo_unidade": "un",
  "codigo_barras": "",
  "concorrentes_mercado": [
    { "loja": "Mercado Livre", "preco": 0.00, "tipo": "Marketplace" },
    { "loja": "Amazon Brasil", "preco": 0.00, "tipo": "E-commerce" },
    { "loja": "Shopee", "preco": 0.00, "tipo": "Marketplace" }
  ]
}
`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, response_mime_type: 'application/json' }
  };

  const resData = await executarRequisicaoGemini(apiKey, requestBody);
  const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Resposta vazia da IA.');
  const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonLimpo);
  const precoEstimado = Number(parsed.preco_venda_estimado) || 0;

  let dadosMercadoFormatados: DadosMercadoIA | undefined = undefined;
  if (Array.isArray(parsed.concorrentes_mercado) && parsed.concorrentes_mercado.length > 0) {
    dadosMercadoFormatados = processarListaConcorrentes(parsed.concorrentes_mercado, precoEstimado);
  }

  return {
    nome: parsed.nome || 'Produto Identificado',
    categoria_sugerida: parsed.categoria_sugerida || 'Geral',
    preco_venda_estimado: precoEstimado,
    preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
    descricao: parsed.descricao || '',
    tipo_unidade: parsed.tipo_unidade || 'un',
    codigo_barras: parsed.codigo_barras || (tipo === 'barcode' ? valor : ''),
    dados_mercado: dadosMercadoFormatados
  };
};

export const ProdutoCadastro: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const ehEdicao = Boolean(id);
  const { loja } = useAuth();
  const permissions = usePermissions();

  useEffect(() => {
    if (!permissions.podeCadastrarAlterarProdutos) {
      navigate('/products');
    }
  }, [permissions.podeCadastrarAlterarProdutos, navigate]);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [carregandoProduto, setCarregandoProduto] = useState<boolean>(false);
  const [analisandoIA, setAnalisandoIA] = useState<boolean>(false);
  const [sucessoIAMsg, setSucessoIAMsg] = useState<string | null>(null);

  // Modal de Categorias
  const [modalCategorias, setModalCategorias] = useState<boolean>(false);

  // Modal de Configuração de Chave Gemini
  const [modalKeyGemini, setModalKeyGemini] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>(getGeminiApiKey());

  // Modal / Aba de Modo de Preenchimento Inteligente
  const [modoPreenchimentoIA, setModoPreenchimentoIA] = useState<'foto' | 'descricao' | 'barcode'>('foto');
  const [textoDescricaoIA, setTextoDescricaoIA] = useState<string>('');
  const [codigoBarrasIA, setCodigoBarrasIA] = useState<string>('');

  // Refs de Câmera e Arquivo
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Estados do Produto (Fotos - até 7)
  const [fotosUrls, setFotosUrls] = useState<string[]>([]);
  const [fotoPrincipal, setFotoPrincipal] = useState<string>('');
  const [novaFotoUrl, setNovaFotoUrl] = useState<string>('');
  const [mostrarUrlInput, setMostrarUrlInput] = useState<boolean>(false);
  const [fazendoUploadFoto, setFazendoUploadFoto] = useState<boolean>(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string>('');

  const [ativo, setAtivo] = useState<boolean>(true);
  const [nome, setNome] = useState<string>('');
  const [codigoInterno, setCodigoInterno] = useState<string>('');
  const [codigoBarras, setCodigoBarras] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [fornecedorId, setFornecedorId] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');
  const [tipoUnidade, setTipoUnidade] = useState<string>('un');

  // Preços
  const [precoCusto, setPrecoCusto] = useState<string>('0.00');
  const [precoVendaVarejo, setPrecoVendaVarejo] = useState<string>('');

  const [precoVendaAtacado, setPrecoVendaAtacado] = useState<string>('');
  const [tipoMinimoAtacado, setTipoMinimoAtacado] = useState<'quantidade' | 'valor'>('quantidade');
  const [qtdMinimaAtacado, setQtdMinimaAtacado] = useState<string>('6');
  const [valorMinimoAtacado, setValorMinimoAtacado] = useState<string>('300.00');

  const [precoVendaAutoatacado, setPrecoVendaAutoatacado] = useState<string>('');
  const [tipoMinimoAutoatacado, setTipoMinimoAutoatacado] = useState<'quantidade' | 'valor'>('quantidade');
  const [qtdMinimaAutoatacado, setQtdMinimaAutoatacado] = useState<string>('24');
  const [valorMinimoAutoatacado, setValorMinimoAutoatacado] = useState<string>('1000.00');

  const [precoPromocional, setPrecoPromocional] = useState<string>('');
  const [promocaoAtiva, setPromocaoAtiva] = useState<boolean>(false);

  // Estoque & Visibilidade
  const [quantidadeEstoque, setQuantidadeEstoque] = useState<string>('0');
  const [estoqueMinimoAlerta, setEstoqueMinimoAlerta] = useState<string>('5');
  const [dataValidade, setDataValidade] = useState<string>('');
  const [exibirCatalogo, setExibirCatalogo] = useState<boolean>(true);
  const [destaque, setDestaque] = useState<boolean>(false);

  // Variações Simplificadas
  const [temVariacoes, setTemVariacoes] = useState<boolean>(false);
  const [nomeTipoVariacao, setNomeTipoVariacao] = useState<string>(''); // Ex: "Cor", "Tamanho", "Sabor"
  const [etapaVariacao, setEtapaVariacao] = useState<number>(1); // 1: Nome do Tipo, 2: Opções e Estoques
  const [opcoesVariacao, setOpcoesVariacao] = useState<Array<{
    id: string;
    nome: string;
    estoque: string;
    precoVarejo: string;
    precoAtacado: string;
    barcode: string;
  }>>([]);
  const [novaOpcaoNome, setNovaOpcaoNome] = useState<string>('');
  const [novaOpcaoEstoque, setNovaOpcaoEstoque] = useState<string>('');

  const [unidadesLista, setUnidadesLista] = useState<Array<{ sigla: string; nome: string }>>(
    UNIDADES_PADRAO.map(u => ({ sigla: u.sigla, nome: u.nome }))
  );

  // Radar de Preços de Mercado (IA)
  const [modalRadarAberto, setModalRadarAberto] = useState<boolean>(false);
  const [dadosMercado, setDadosMercado] = useState<DadosMercadoIA | null>(null);
  const [buscandoMercado, setBuscandoMercado] = useState<boolean>(false);
  const [erroMercado, setErroMercado] = useState<string | null>(null);

  // Regras de Precificação (Descontos padrão da loja)
  const [regrasPrecificacao, setRegrasPrecificacao] = useState<{
    descontoAtacado: number;
    tipoMinimoAtacado: 'quantidade' | 'valor' | 'hibrido';
    qtdMinimaAtacado: number;
    valorMinimoAtacado: number;
    descontoAutoatacado: number;
    tipoMinimoAutoatacado: 'quantidade' | 'valor' | 'hibrido';
    qtdMinimaAutoatacado: number;
    valorMinimoAutoatacado: number;
  }>({
    descontoAtacado: 20,
    tipoMinimoAtacado: 'quantidade',
    qtdMinimaAtacado: 6,
    valorMinimoAtacado: 300,
    descontoAutoatacado: 25,
    tipoMinimoAutoatacado: 'quantidade',
    qtdMinimaAutoatacado: 24,
    valorMinimoAutoatacado: 1000
  });

  const carregarAux = async () => {
    if (!loja?.id) return;
    try {
      const { data: c } = await supabase.from('categorias').select('*').eq('loja_id', loja.id).order('ordem_exibicao');
      if (c) setCategorias(c);
      const { data: f } = await supabase.from('fornecedores').select('*').eq('loja_id', loja.id);
      if (f) setFornecedores(f);

      // Carregar unidades de medida do banco ou padrão
      try {
        const { data: u } = await supabase.from('unidades_medida').select('sigla, nome').eq('loja_id', loja.id).order('sigla');
        if (u && u.length > 0) {
          setUnidadesLista(u);
        }
      } catch (e) {
        // Fallback já inicializado com UNIDADES_PADRAO
      }

      // Carregar regras de precificação
      const keyStorage = `hubi_regras_precificacao_${loja.id}`;
      const regrasSalvas = localStorage.getItem(keyStorage);
      if (regrasSalvas) {
        try {
          const parsed = JSON.parse(regrasSalvas);
          setRegrasPrecificacao({
            descontoAtacado: Number(parsed.descontoAtacado) || 20,
            tipoMinimoAtacado: parsed.tipoMinimoAtacado || 'hibrido',
            qtdMinimaAtacado: Number(parsed.qtdTotalMinimaAtacado ?? parsed.qtdMinimaAtacado) || 6,
            valorMinimoAtacado: Number(parsed.valorMinimoAtacado) || 300,

            descontoAutoatacado: Number(parsed.descontoAutoatacado) || 25,
            tipoMinimoAutoatacado: parsed.tipoMinimoAutoatacado || 'hibrido',
            qtdMinimaAutoatacado: Number(parsed.qtdTotalMinimaAutoatacado ?? parsed.qtdMinimaAutoatacado) || 24,
            valorMinimoAutoatacado: Number(parsed.valorMinimoAutoatacado) || 1000
          });
        } catch (err) {}
      } else if (loja.desconto_padrao_atacado_percentual) {
        setRegrasPrecificacao({
          descontoAtacado: Number(loja.desconto_padrao_atacado_percentual) || 20,
          tipoMinimoAtacado: loja.tipo_minimo_padrao_atacado || 'hibrido',
          qtdMinimaAtacado: Number(loja.qtd_minima_padrao_atacado) || 6,
          valorMinimoAtacado: Number(loja.valor_minimo_padrao_atacado) || 300,

          descontoAutoatacado: Number(loja.desconto_padrao_autoatacado_percentual) || 25,
          tipoMinimoAutoatacado: loja.tipo_minimo_padrao_autoatacado || 'hibrido',
          qtdMinimaAutoatacado: Number(loja.qtd_minima_padrao_autoatacado) || 24,
          valorMinimoAutoatacado: Number(loja.valor_minimo_padrao_autoatacado) || 1000
        });
      }
    } catch (err) {
      console.error('Erro ao carregar dados auxiliares:', err);
    }
  };

  useEffect(() => {
    carregarAux();
  }, [loja?.id]);

  // Sugestão Automática de Preços de Atacado e Autoatacado ao alterar o Preço de Varejo
  const handlePrecoVarejoChange = (valor: string) => {
    setPrecoVendaVarejo(valor);
    const num = parseFloat(valor);
    if (!isNaN(num) && num > 0) {
      const descAtacado = regrasPrecificacao.descontoAtacado || 20;
      const descAuto = regrasPrecificacao.descontoAutoatacado || 25;

      const atacadoCalc = (num * (1 - descAtacado / 100)).toFixed(2);
      const autoCalc = (num * (1 - descAuto / 100)).toFixed(2);

      setPrecoVendaAtacado(atacadoCalc);
      setTipoMinimoAtacado(regrasPrecificacao.tipoMinimoAtacado === 'valor' ? 'valor' : 'quantidade');
      setQtdMinimaAtacado(String(regrasPrecificacao.qtdMinimaAtacado || 6));
      setValorMinimoAtacado(String(regrasPrecificacao.valorMinimoAtacado || 300));

      setPrecoVendaAutoatacado(autoCalc);
      setTipoMinimoAutoatacado(regrasPrecificacao.tipoMinimoAutoatacado === 'valor' ? 'valor' : 'quantidade');
      setQtdMinimaAutoatacado(String(regrasPrecificacao.qtdMinimaAutoatacado || 24));
      setValorMinimoAutoatacado(String(regrasPrecificacao.valorMinimoAutoatacado || 1000));
    }
  };

  // Carregar dados do produto para edição se houver ID na rota
  useEffect(() => {
    const carregarProdutoEdicao = async () => {
      if (!id || !loja?.id) return;
      try {
        setCarregandoProduto(true);
        const { data: prod, error } = await supabase
          .from('produtos')
          .select('*, variacoes:variacoes_produto(*)')
          .eq('id', id)
          .single();

        if (error) throw error;
        if (prod) {
          setNome(prod.nome || '');
          setCodigoInterno(prod.codigo_interno || '');
          setCodigoBarras(prod.codigo_barras || '');
          setCategoriaId(prod.categoria_id || '');
          setFornecedorId(prod.fornecedor_id || '');
          setDescricao(prod.descricao || '');
          setTipoUnidade(prod.tipo_unidade || 'un');

          setPrecoCusto(prod.preco_custo ? Number(prod.preco_custo).toFixed(2) : '0.00');
          setPrecoVendaVarejo(prod.preco_venda_varejo ? Number(prod.preco_venda_varejo).toFixed(2) : '');
          
          setPrecoVendaAtacado(prod.preco_venda_atacado ? Number(prod.preco_venda_atacado).toFixed(2) : '');
          setTipoMinimoAtacado(prod.tipo_minimo_atacado || 'quantidade');
          setQtdMinimaAtacado(prod.qtd_minima_atacado ? String(prod.qtd_minima_atacado) : '6');
          setValorMinimoAtacado(prod.valor_minimo_atacado ? String(prod.valor_minimo_atacado) : '300.00');

          setPrecoVendaAutoatacado(prod.preco_venda_autoatacado ? Number(prod.preco_venda_autoatacado).toFixed(2) : '');
          setTipoMinimoAutoatacado(prod.tipo_minimo_autoatacado || 'quantidade');
          setQtdMinimaAutoatacado(prod.qtd_minima_autoatacado ? String(prod.qtd_minima_autoatacado) : '24');
          setValorMinimoAutoatacado(prod.valor_minimo_autoatacado ? String(prod.valor_minimo_autoatacado) : '1000.00');

          setPrecoPromocional(prod.preco_promocional ? Number(prod.preco_promocional).toFixed(2) : '');
          setPromocaoAtiva(Boolean(prod.promocao_ativa));

          setQuantidadeEstoque(String(prod.quantidade_estoque || 0));
          setEstoqueMinimoAlerta(String(prod.estoque_minimo_alerta || 5));
          setDataValidade(prod.data_validade || '');
          setExibirCatalogo(Boolean(prod.exibir_catalogo));
          setDestaque(Boolean(prod.destaque));
          setAtivo(prod.ativo !== false);

          const fotos = Array.isArray(prod.fotos_urls) ? prod.fotos_urls : [];
          setFotosUrls(fotos);
          setFotoPrincipal(fotos[0] || '');

          if (prod.tem_variacoes && Array.isArray(prod.variacoes) && prod.variacoes.length > 0) {
            setTemVariacoes(true);
            setNomeTipoVariacao(prod.rotulo_variacao_1 || 'Opção');
            setEtapaVariacao(2);
            setOpcoesVariacao(
              prod.variacoes.map((v: any) => ({
                id: v.id || Date.now().toString() + Math.random(),
                nome: v.valor_variacao_1 || '',
                estoque: String(v.quantidade_estoque || 0),
                precoVarejo: v.preco_venda_varejo ? Number(v.preco_venda_varejo).toFixed(2) : '',
                precoAtacado: v.preco_venda_atacado ? Number(v.preco_venda_atacado).toFixed(2) : '',
                barcode: v.codigo_barras || ''
              }))
            );
          }
        }
      } catch (err) {
        console.error('Erro ao carregar produto para alteração:', err);
        alert('Não foi possível carregar os dados deste produto para edição.');
      } finally {
        setCarregandoProduto(false);
      }
    };

    carregarProdutoEdicao();
  }, [id, loja?.id]);

  // Sugerir Código Interno baseado nas iniciais da Categoria (Ex: Brinquedo Erótico -> BE0001)
  const gerarCodigoInternoSugerido = async (catId: string, listaCategorias: Categoria[] = categorias) => {
    if (!catId || !loja?.id) return;
    const cat = listaCategorias.find(c => c.id === catId);
    if (!cat || !cat.nome) return;

    try {
      const palavras = cat.nome.trim().split(/\s+/).filter(Boolean);
      let prefixo = '';
      if (palavras.length === 1) {
        prefixo = palavras[0].slice(0, 2).toUpperCase();
      } else {
        prefixo = (palavras[0][0] + palavras[1][0]).toUpperCase();
      }
      if (!prefixo || prefixo.length < 2) prefixo = 'PR';

      const { data: produtosCat } = await supabase
        .from('produtos')
        .select('codigo_interno')
        .eq('loja_id', loja.id)
        .eq('categoria_id', catId);

      let maxNumero = 0;
      if (produtosCat && produtosCat.length > 0) {
        produtosCat.forEach(p => {
          if (p.codigo_interno && p.codigo_interno.startsWith(prefixo)) {
            const numeroStr = p.codigo_interno.replace(prefixo, '');
            const num = parseInt(numeroStr, 10);
            if (!isNaN(num) && num > maxNumero) {
              maxNumero = num;
            }
          }
        });
      }

      const proximoNumero = maxNumero + 1;
      const numeroFormatado = String(proximoNumero).padStart(4, '0');
      const codigoSugerido = `${prefixo}${numeroFormatado}`;

      if (!codigoInterno || codigoInterno.length < 3) {
        setCodigoInterno(codigoSugerido);
      }
    } catch (err) {
      console.warn('Não foi possível sugerir o código interno automaticamente:', err);
    }
  };

  const handleSelecionarCategoria = (catId: string) => {
    setCategoriaId(catId);
    if (catId) {
      gerarCodigoInternoSugerido(catId);
    }
  };

  // Manipular upload de imagens (Câmera ou Galeria) permitindo até 7 fotos
  const handleProcessarArquivosImagens = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const arrayFiles = Array.from(files);

    const espacoDisponivel = 7 - fotosUrls.length;
    if (espacoDisponivel <= 0) {
      alert('Você já atingiu o limite máximo de 7 fotos para este produto.');
      return;
    }

    const filesParaProcessar = arrayFiles.slice(0, espacoDisponivel);

    try {
      setFazendoUploadFoto(true);
      const novasUrls: string[] = [];

      for (let i = 0; i < filesParaProcessar.length; i++) {
        setUploadStatusMsg(`Enviando foto ${i + 1} de ${filesParaProcessar.length}...`);
        const file = filesParaProcessar[i];
        const { publicUrl, dataUrl } = await uploadFotoParaSupabase(file, loja?.id || 'geral');
        const urlFinal = publicUrl || dataUrl;
        if (urlFinal && !fotosUrls.includes(urlFinal) && !novasUrls.includes(urlFinal)) {
          novasUrls.push(urlFinal);
        }
      }

      if (novasUrls.length > 0) {
        setFotosUrls(prev => {
          const combinadas = [...novasUrls, ...prev];
          return combinadas.slice(0, 7);
        });
        if (!fotoPrincipal) {
          setFotoPrincipal(novasUrls[0]);
        }
      }
    } catch (err) {
      console.error('Erro ao processar imagens:', err);
    } finally {
      setFazendoUploadFoto(false);
      setUploadStatusMsg('');
    }
  };

  // Aplicar dados retornados pela IA nos estados do produto
  const aplicarDadosSugeridosIA = (dadosSugeridos: ProdutoSugeridoIA) => {
    if (dadosSugeridos.nome) setNome(dadosSugeridos.nome);
    if (dadosSugeridos.descricao) setDescricao(dadosSugeridos.descricao);
    if (dadosSugeridos.preco_venda_estimado) {
      handlePrecoVarejoChange(dadosSugeridos.preco_venda_estimado.toFixed(2));
    }
    if (dadosSugeridos.preco_custo_estimado) {
      setPrecoCusto(dadosSugeridos.preco_custo_estimado.toFixed(2));
    }
    if (dadosSugeridos.tipo_unidade) {
      setTipoUnidade(dadosSugeridos.tipo_unidade.toLowerCase());
    }
    if (dadosSugeridos.codigo_barras) {
      setCodigoBarras(dadosSugeridos.codigo_barras);
    }

    // Salvar dados de concorrentes e mercado identificados pela IA
    if (dadosSugeridos.dados_mercado) {
      setDadosMercado(dadosSugeridos.dados_mercado);
    }

    // Vincular e sugerir categoria e código interno
    if (dadosSugeridos.categoria_sugerida && categorias.length > 0) {
      const catMatch = categorias.find(c =>
        c.nome.toLowerCase().includes(dadosSugeridos.categoria_sugerida!.toLowerCase()) ||
        dadosSugeridos.categoria_sugerida!.toLowerCase().includes(c.nome.toLowerCase())
      );
      if (catMatch) {
        setCategoriaId(catMatch.id);
        gerarCodigoInternoSugerido(catMatch.id);
      }
    }
  };

  // Preenchimento com Inteligência Artificial a partir da Foto
  const handlePreencherComIA = async () => {
    const fotoAlvo = fotoPrincipal || fotosUrls[0];
    if (!fotoAlvo) {
      alert('Por favor, tire uma foto ou selecione uma imagem do produto primeiro.');
      return;
    }

    try {
      setAnalisandoIA(true);
      setSucessoIAMsg(null);

      const fotoParaIA = fotoBase64Cache.get(fotoAlvo) || fotoAlvo;
      const dadosSugeridos = await identificarProdutoPorFoto(fotoParaIA);

      if (dadosSugeridos) {
        aplicarDadosSugeridosIA(dadosSugeridos);
        setSucessoIAMsg('✨ Informações e preços de mercado do produto identificados com sucesso a partir da foto!');
      }
    } catch (err: any) {
      console.error('Erro na identificação por IA:', err);
      alert(`Não foi possível identificar o produto pela foto: ${err.message || 'Tente novamente'}`);
    } finally {
      setAnalisandoIA(false);
    }
  };

  // Preenchimento com Inteligência Artificial a partir da Descrição / Nome
  const handlePreencherPorDescricaoIA = async () => {
    const texto = textoDescricaoIA.trim() || nome.trim() || descricao.trim();
    if (!texto) {
      alert('Por favor, digite o nome ou uma descrição do produto para preenchimento inteligente.');
      return;
    }

    try {
      setAnalisandoIA(true);
      setSucessoIAMsg(null);
      const dadosSugeridos = await identificarProdutoPorTextoOuEan('descricao', texto);
      if (dadosSugeridos) {
        aplicarDadosSugeridosIA(dadosSugeridos);
        setSucessoIAMsg('✨ Informações e ficha técnica preenchidas com sucesso a partir da descrição!');
      }
    } catch (err: any) {
      console.error('Erro na identificação por IA:', err);
      alert(`Não foi possível identificar o produto: ${err.message || 'Tente novamente'}`);
    } finally {
      setAnalisandoIA(false);
    }
  };

  // Preenchimento com Inteligência Artificial a partir do Código de Barras / EAN
  const handlePreencherPorCodigoBarrasIA = async () => {
    const ean = codigoBarrasIA.trim() || codigoBarras.trim();
    if (!ean) {
      alert('Por favor, informe o Código de Barras / EAN do produto.');
      return;
    }

    try {
      setAnalisandoIA(true);
      setSucessoIAMsg(null);
      const dadosSugeridos = await identificarProdutoPorTextoOuEan('barcode', ean);
      if (dadosSugeridos) {
        aplicarDadosSugeridosIA(dadosSugeridos);
        setSucessoIAMsg('✨ Informações do produto identificadas com sucesso pelo código de barras!');
      }
    } catch (err: any) {
      console.error('Erro na identificação por IA:', err);
      alert(`Não foi possível identificar o produto pelo código de barras: ${err.message || 'Tente novamente'}`);
    } finally {
      setAnalisandoIA(false);
    }
  };

  // Funções do Radar de Preços de Mercado
  const handleAbrirRadarPrecos = async () => {
    setModalRadarAberto(true);
    setErroMercado(null);

    // Se ainda não temos dados ou se o usuário deseja consultar
    if (!dadosMercado) {
      if (!nome.trim()) {
        setErroMercado('Por favor, informe o nome do produto no formulário primeiro para pesquisar os concorrentes.');
        return;
      }
      await buscarConcorrentesMercado();
    }
  };

  const buscarConcorrentesMercado = async () => {
    if (!nome.trim()) {
      setErroMercado('Informe o nome do produto para realizar a pesquisa de mercado.');
      return;
    }
    try {
      setBuscandoMercado(true);
      setErroMercado(null);
      const catNome = categorias.find(c => c.id === categoriaId)?.nome;
      const resultado = await pesquisarPrecosMercadoIA(nome, catNome, codigoBarras);
      setDadosMercado(resultado);
    } catch (err: any) {
      setErroMercado(err.message || 'Erro ao pesquisar preços de mercado.');
    } finally {
      setBuscandoMercado(false);
    }
  };

  const handleAplicarPrecoMercado = (novoPreco: number) => {
    handlePrecoVarejoChange(novoPreco.toFixed(2));
    setModalRadarAberto(false);
  };

  // Gerenciamento de Opções da Variação
  const handleAdicionarOpcao = () => {
    if (!novaOpcaoNome.trim()) {
      alert(`Por favor, digite o nome da opção para ${nomeTipoVariacao || 'a variação'}.`);
      return;
    }
    const estoqueNum = Number(novaOpcaoEstoque) || 0;
    if (estoqueNum < 0) {
      alert('O estoque não pode ser negativo.');
      return;
    }

    const novaOpcao = {
      id: Date.now().toString(),
      nome: novaOpcaoNome.trim(),
      estoque: novaOpcaoEstoque || '0',
      precoVarejo: precoVendaVarejo || '0.00',
      precoAtacado: precoVendaAtacado || '0.00',
      barcode: ''
    };

    const novasOpcoes = [...opcoesVariacao, novaOpcao];
    setOpcoesVariacao(novasOpcoes);
    setNovaOpcaoNome('');
    setNovaOpcaoEstoque('');

    // Sincroniza automaticamente a soma com o estoque total do produto
    const somaTotal = novasOpcoes.reduce((acc, o) => acc + (Number(o.estoque) || 0), 0);
    setQuantidadeEstoque(somaTotal.toString());
  };

  const handleRemoverOpcao = (id: string) => {
    const novasOpcoes = opcoesVariacao.filter(o => o.id !== id);
    setOpcoesVariacao(novasOpcoes);
    const somaTotal = novasOpcoes.reduce((acc, o) => acc + (Number(o.estoque) || 0), 0);
    setQuantidadeEstoque(somaTotal.toString());
  };

  const handleAtualizarEstoqueOpcao = (id: string, novoEstoque: string) => {
    const novasOpcoes = opcoesVariacao.map(o => o.id === id ? { ...o, estoque: novoEstoque } : o);
    setOpcoesVariacao(novasOpcoes);
    const somaTotal = novasOpcoes.reduce((acc, o) => acc + (Number(o.estoque) || 0), 0);
    setQuantidadeEstoque(somaTotal.toString());
  };

  const salvarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !nome.trim() || !precoVendaVarejo) {
      alert('Preencha o nome do produto e o preço de venda de varejo.');
      return;
    }

    // Validação de estoque com variações
    if (temVariacoes && opcoesVariacao.length > 0) {
      const somaEstoqueVariacoes = opcoesVariacao.reduce((acc, o) => acc + (Number(o.estoque) || 0), 0);
      const estoqueInformado = Number(quantidadeEstoque) || 0;

      if (somaEstoqueVariacoes !== estoqueInformado) {
        const confirmar = confirm(
          `A soma dos estoques das variações (${somaEstoqueVariacoes} un) está diferente do estoque total informado (${estoqueInformado} un).\n\nDeseja ajustar o estoque total para ${somaEstoqueVariacoes} un e salvar o produto?`
        );
        if (!confirmar) return;
      }
    }

    try {
      setSalvando(true);

      const todasFotos = [...fotosUrls];
      if (fotoPrincipal && !todasFotos.includes(fotoPrincipal)) {
        todasFotos.unshift(fotoPrincipal);
      }

      const estoqueFinal = temVariacoes && opcoesVariacao.length > 0
        ? opcoesVariacao.reduce((acc, v) => acc + (Number(v.estoque) || 0), 0)
        : Number(quantidadeEstoque) || 0;

      const novoProduto = {
        loja_id: loja.id,
        nome,
        codigo_interno: codigoInterno || null,
        codigo_barras: codigoBarras || null,
        categoria_id: categoriaId || null,
        fornecedor_id: fornecedorId || null,
        descricao,
        tipo_unidade: tipoUnidade,
        fotos_urls: todasFotos.slice(0, 7),
        preco_custo: Number(precoCusto) || 0,
        preco_venda_varejo: Number(precoVendaVarejo),
        preco_venda_atacado: precoVendaAtacado ? Number(precoVendaAtacado) : null,
        tipo_minimo_atacado: tipoMinimoAtacado,
        qtd_minima_atacado: tipoMinimoAtacado === 'quantidade' ? (Number(qtdMinimaAtacado) || 6) : 0,
        valor_minimo_atacado: tipoMinimoAtacado === 'valor' ? (Number(valorMinimoAtacado) || 0) : null,
        preco_venda_autoatacado: precoVendaAutoatacado ? Number(precoVendaAutoatacado) : null,
        tipo_minimo_autoatacado: tipoMinimoAutoatacado,
        qtd_minima_autoatacado: tipoMinimoAutoatacado === 'quantidade' ? (Number(qtdMinimaAutoatacado) || 24) : 0,
        valor_minimo_autoatacado: tipoMinimoAutoatacado === 'valor' ? (Number(valorMinimoAutoatacado) || 0) : null,
        preco_promocional: precoPromocional ? Number(precoPromocional) : null,
        promocao_ativa: promocaoAtiva,
        quantidade_estoque: estoqueFinal,
        estoque_minimo_alerta: Number(estoqueMinimoAlerta) || 0,
        tem_variacoes: temVariacoes && opcoesVariacao.length > 0,
        rotulo_variacao_1: temVariacoes ? nomeTipoVariacao || 'Opção' : null,
        rotulo_variacao_2: null,
        data_validade: dataValidade || null,
        exibir_catalogo: exibirCatalogo,
        destaque: destaque,
        ativo: ativo
      };

      if (ehEdicao) {
        const { error: erroUpdate } = await supabase
          .from('produtos')
          .update(novoProduto)
          .eq('id', id);

        if (erroUpdate) throw erroUpdate;

        if (temVariacoes && opcoesVariacao.length > 0) {
          await supabase.from('variacoes_produto').delete().eq('produto_id', id);
          const variacoesFormatadas = opcoesVariacao.map(v => ({
            loja_id: loja.id,
            produto_id: id,
            valor_variacao_1: v.nome,
            valor_variacao_2: null,
            codigo_barras: v.barcode || null,
            preco_venda_varejo: Number(v.precoVarejo) || Number(precoVendaVarejo),
            preco_venda_atacado: v.precoAtacado ? Number(v.precoAtacado) : null,
            quantidade_estoque: Number(v.estoque) || 0,
            estoque_minimo_alerta: Number(estoqueMinimoAlerta) || 0,
            ativo: true
          }));
          await supabase.from('variacoes_produto').insert(variacoesFormatadas);
        } else {
          await supabase.from('variacoes_produto').delete().eq('produto_id', id);
        }
      } else {
        const { data: prodCriado, error: erroProd } = await supabase
          .from('produtos')
          .insert([novoProduto])
          .select()
          .single();

        if (erroProd || !prodCriado) throw erroProd;

        if (temVariacoes && opcoesVariacao.length > 0) {
          const variacoesFormatadas = opcoesVariacao.map(v => ({
            loja_id: loja.id,
            produto_id: prodCriado.id,
            valor_variacao_1: v.nome,
            valor_variacao_2: null,
            codigo_barras: v.barcode || null,
            preco_venda_varejo: Number(v.precoVarejo) || Number(precoVendaVarejo),
            preco_venda_atacado: v.precoAtacado ? Number(v.precoAtacado) : null,
            quantidade_estoque: Number(v.estoque) || 0,
            estoque_minimo_alerta: Number(estoqueMinimoAlerta) || 0,
            ativo: true
          }));

          await supabase.from('variacoes_produto').insert(variacoesFormatadas);
        }
      }

      navigate('/products');
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err);
      alert(`Erro ao salvar produto: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSalvando(false);
    }
  };

  if (carregandoProduto) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        <p className="text-sm">Carregando dados do produto...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-950 p-3 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header Superior */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/products')}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100">
                {ehEdicao ? 'Alterar Produto' : 'Cadastrar Novo Produto'}
              </h1>
              <p className="text-xs text-slate-400">
                {ehEdicao ? 'Atualize as fotos, valores, dados fiscais e estoques do item' : 'Tire uma foto para preenchimento automático por IA ou preencha manualmente'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setTempApiKey(getGeminiApiKey());
              setModalKeyGemini(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 text-xs font-semibold transition cursor-pointer"
            title="Configurar Chave Google Gemini AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Chave Gemini IA</span>
          </button>
        </div>

        {/* CARD DE STATUS DO PRODUTO (ATIVO / INATIVO) - APENAS OWNER/ADMIN */}
        {ehEdicao && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                ativo ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}>
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base text-slate-100">Status do Produto</h3>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    ativo ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}>
                    {ativo ? 'Ativo no Sistema' : 'Inativo / Oculto'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ativo ? 'O produto está disponível para venda no PDV e visualização no catálogo.' : 'O produto está inativado e não poderá ser vendido no PDV nem exibido no catálogo.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {permissions.ehAdmin ? (
                <button
                  type="button"
                  onClick={() => setAtivo(!ativo)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md ${
                    ativo
                      ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{ativo ? 'Inativar Produto' : 'Ativar Produto'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-500 text-xs">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Apenas Owner ou Admin podem ativar/inativar</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SEÇÃO 1: FOTOS DO PRODUTO & PREENCHIMENTO INTELIGENTE (FOTO / DESCRIÇÃO / EAN) */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border-2 border-indigo-500/30 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-500/20 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>1. Preenchimento Inteligente com IA & Fotos</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                    {fotosUrls.length}/7 Fotos
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Preencha automaticamente os dados e preços pela Foto, pela Descrição/Nome ou pelo Código de Barras.
                </p>
              </div>
            </div>

            {/* SELETOR DE MODALIDADE DE IA */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setModoPreenchimentoIA('foto')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  modoPreenchimentoIA === 'foto'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Pela Foto</span>
              </button>

              <button
                type="button"
                onClick={() => setModoPreenchimentoIA('descricao')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  modoPreenchimentoIA === 'descricao'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Pela Descrição</span>
              </button>

              <button
                type="button"
                onClick={() => setModoPreenchimentoIA('barcode')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  modoPreenchimentoIA === 'barcode'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Pelo Código de Barras</span>
              </button>
            </div>
          </div>

          {/* PAINEL DE PREENCHIMENTO POR DESCRIÇÃO */}
          {modoPreenchimentoIA === 'descricao' && (
            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-3 animate-in fade-in">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Digite o nome ou cole a descrição do produto (ex: Garrafa Térmica Inox 500ml Kouda)"
                  value={textoDescricaoIA}
                  onChange={(e) => setTextoDescricaoIA(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handlePreencherPorDescricaoIA();
                    }
                  }}
                  className="flex-1 bg-slate-900 border border-indigo-500/40 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="button"
                  disabled={analisandoIA}
                  onClick={handlePreencherPorDescricaoIA}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {analisandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                  <span>Preencher com IA</span>
                </button>
              </div>
              <p className="text-[11px] text-indigo-300/80">
                A IA estruturará o nome comercial, categoria, ficha técnica, unidade e sugestão de preços de venda e custo.
              </p>
            </div>
          )}

          {/* PAINEL DE PREENCHIMENTO POR CÓDIGO DE BARRAS / EAN */}
          {modoPreenchimentoIA === 'barcode' && (
            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-3 animate-in fade-in">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Digite ou bipe o Código de Barras / EAN (ex: 7891234567890)"
                  value={codigoBarrasIA}
                  onChange={(e) => setCodigoBarrasIA(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handlePreencherPorCodigoBarrasIA();
                    }
                  }}
                  className="flex-1 bg-slate-900 border border-indigo-500/40 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 font-mono"
                />
                <button
                  type="button"
                  disabled={analisandoIA}
                  onClick={handlePreencherPorCodigoBarrasIA}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {analisandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                  <span>Identificar por Código</span>
                </button>
              </div>
              <p className="text-[11px] text-indigo-300/80">
                A IA consultará o código no catálogo de produtos e preencherá a ficha e o radar de preços de mercado.
              </p>
            </div>
          )}

          {/* PAINEL POR FOTO (BOTÃO PREENCHER PELA FOTO QUANDO FOTO ESTÁ SELECIONADA) */}
          {modoPreenchimentoIA === 'foto' && (fotoPrincipal || fotosUrls.length > 0) && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                disabled={analisandoIA}
                onClick={handlePreencherComIA}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-xs shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {analisandoIA ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analisando Foto com IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    <span>Preencher Ficha a partir da Foto</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Mensagem de Sucesso da IA */}
          {sucessoIAMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{sucessoIAMsg}</span>
            </div>
          )}

          {/* Inputs invisíveis para Câmera Direta e Galeria (Múltiplas Fotos) */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleProcessarArquivosImagens(e.target.files);
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleProcessarArquivosImagens(e.target.files);
            }}
          />

          {/* Área de Visualização e Captura */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* Foto Principal / Preview */}
            <div className="md:col-span-5 flex flex-col items-center justify-center">
              {fazendoUploadFoto ? (
                <div className="w-full aspect-square max-w-[260px] rounded-2xl border-2 border-indigo-500/50 bg-indigo-500/10 flex flex-col items-center justify-center p-6 text-center space-y-3 animate-pulse">
                  <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                  <div>
                    <span className="font-bold text-xs text-indigo-200 block">
                      {uploadStatusMsg || 'Comprimindo & Enviando...'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Salvando foto otimizada na nuvem
                    </span>
                  </div>
                </div>
              ) : fotoPrincipal ? (
                <div className="relative w-full aspect-square max-w-[260px] rounded-2xl overflow-hidden border-2 border-indigo-500/40 bg-slate-950 shadow-xl group">
                  <img
                    src={fotoPrincipal}
                    alt="Foto Principal do Produto"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 bg-emerald-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-md">
                    Foto Principal (Capa)
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition backdrop-blur-xs">
                    {fotosUrls.length < 7 && (
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="p-2 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 transition cursor-pointer"
                        title="Tirar outra foto"
                      >
                        <Camera className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const restantes = fotosUrls.filter(f => f !== fotoPrincipal);
                        setFotosUrls(restantes);
                        setFotoPrincipal(restantes[0] || '');
                      }}
                      className="p-2 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 transition cursor-pointer"
                      title="Remover foto principal"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full aspect-square max-w-[260px] rounded-2xl border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 flex flex-col items-center justify-center p-6 text-center space-y-3 cursor-pointer transition group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition shadow-lg shadow-indigo-500/20">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-200 block">
                      Toque para Abrir a Câmera
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Bata a foto do produto agora mesmo
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Botões de Ação de Captura & Galeria */}
            <div className="md:col-span-7 space-y-3 flex flex-col justify-center h-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Botão Câmera do Celular */}
                <button
                  type="button"
                  disabled={fotosUrls.length >= 7}
                  onClick={() => cameraInputRef.current?.click()}
                  className="py-3 px-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm disabled:opacity-40"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>Tirar Foto ({fotosUrls.length}/7)</span>
                </button>

                {/* Botão Escolher da Galeria */}
                <button
                  type="button"
                  disabled={fotosUrls.length >= 7}
                  onClick={() => galleryInputRef.current?.click()}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-40"
                >
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>Galeria (Até 7 fotos)</span>
                </button>
              </div>

              {/* Opção de Link URL */}
              <div>
                {!mostrarUrlInput ? (
                  fotosUrls.length < 7 && (
                    <button
                      type="button"
                      onClick={() => setMostrarUrlInput(true)}
                      className="text-[11px] text-slate-400 hover:text-indigo-400 font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Ou colar o link de uma imagem da internet</span>
                    </button>
                  )
                ) : (
                  <div className="flex gap-2 animate-in fade-in">
                    <input
                      type="url"
                      placeholder="Cole a URL da imagem (https://...)"
                      value={novaFotoUrl}
                      onChange={(e) => setNovaFotoUrl(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (novaFotoUrl.trim() && fotosUrls.length < 7) {
                          const url = novaFotoUrl.trim();
                          setFotosUrls(prev => [url, ...prev]);
                          if (!fotoPrincipal) setFotoPrincipal(url);
                          setNovaFotoUrl('');
                          setMostrarUrlInput(false);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer"
                    >
                      Adicionar
                    </button>
                    <button
                      type="button"
                      onClick={() => setMostrarUrlInput(false)}
                      className="px-2.5 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Galeria de Miniaturas (Até 7 Fotos) */}
              {fotosUrls.length > 0 && (
                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
                    <span>Fotos Cadastradas ({fotosUrls.length}/7):</span>
                    <span className="text-[10px] text-slate-500">Clique para definir a foto principal</span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {fotosUrls.map((url, i) => {
                      const ehPrincipal = (fotoPrincipal === url) || (!fotoPrincipal && i === 0);
                      return (
                        <div
                          key={i}
                          className={`relative aspect-square rounded-xl overflow-hidden bg-slate-950 border transition group ${
                            ehPrincipal ? 'border-emerald-400 ring-2 ring-emerald-500/40' : 'border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <img
                            src={url}
                            alt={`Foto ${i + 1}`}
                            onClick={() => setFotoPrincipal(url)}
                            className="w-full h-full object-cover cursor-pointer"
                          />
                          {ehPrincipal && (
                            <span className="absolute bottom-0 inset-x-0 bg-emerald-500/90 text-white text-[9px] font-bold text-center py-0.5">
                              Capa
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const novas = fotosUrls.filter(f => f !== url);
                              setFotosUrls(novas);
                              if (fotoPrincipal === url) {
                                setFotoPrincipal(novas[0] || '');
                              }
                            }}
                            className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-slate-300 hover:text-white rounded-md opacity-0 group-hover:opacity-100 transition cursor-pointer"
                            title="Remover foto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}

                    {/* Slot para adicionar mais foto se < 7 */}
                    {fotosUrls.length < 7 && (
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="aspect-square rounded-xl border border-dashed border-slate-700 hover:border-indigo-400 bg-slate-900/50 hover:bg-indigo-500/10 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-300 transition cursor-pointer"
                        title="Adicionar mais foto"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="text-[9px] font-bold mt-0.5">+ Foto</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* FORMULÁRIO DE CADASTRO COMPLETO                                           */}
        {/* ========================================================================= */}
        <form onSubmit={salvarProduto} className="space-y-6">
          {/* SEÇÃO 2: IDENTIFICAÇÃO DO PRODUTO (ORDEM AJUSTADA) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-400" />
              <span>2. Identificação do Produto</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome do Produto */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Coca-Cola Lata 350ml ou Camiseta Algodão Básica"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* LINHA 1: Categoria e Unidade de Medida (ANTES do Código) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Categoria *</label>
                  <button
                    type="button"
                    onClick={() => setModalCategorias(true)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>+ Criar / Gerenciar</span>
                  </button>
                </div>
                <select
                  value={categoriaId}
                  onChange={(e) => handleSelecionarCategoria(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione uma Categoria...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Unidade de Medida</label>
                  <button
                    type="button"
                    onClick={() => navigate('/auxiliares')}
                    className="text-[10px] text-slate-400 hover:text-emerald-400 font-semibold cursor-pointer"
                    title="Gerenciar Unidades de Medida"
                  >
                    + Gerenciar
                  </button>
                </div>
                <select
                  value={tipoUnidade}
                  onChange={(e) => setTipoUnidade(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
                >
                  {unidadesLista.map(u => (
                    <option key={u.sigla} value={u.sigla}>
                      {u.sigla.toUpperCase()} - {u.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* LINHA 2: Código Interno (Sugerido após Categoria) e Código de Barras */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Código Interno (SKU)</label>
                  {codigoInterno && (
                    <span className="text-[10px] text-emerald-400 font-medium">Sugerido p/ Categoria</span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Ex: BE0001"
                  value={codigoInterno}
                  onChange={(e) => setCodigoInterno(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 uppercase font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Código de Barras (EAN / Leitor)</label>
                <input
                  type="text"
                  placeholder="Ex: 789123456789"
                  value={codigoBarras}
                  onChange={(e) => setCodigoBarras(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none font-mono"
                />
              </div>

              {/* Fornecedor (Opcional) */}
              <div className="space-y-1 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Fornecedor (Opcional)</label>
                  <button
                    type="button"
                    onClick={() => navigate('/auxiliares')}
                    className="text-[10px] text-slate-400 hover:text-emerald-400 font-semibold cursor-pointer"
                    title="Gerenciar Fornecedores"
                  >
                    + Gerenciar
                  </button>
                </div>
                <select
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
                >
                  <option value="">Nenhum Fornecedor Vinculado</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>

              {/* Descrição Comercial */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Descrição Comercial (Catálogo & WhatsApp)</label>
                <textarea
                  rows={3}
                  placeholder="Informações adicionais do produto, material, diferenciais e modo de uso..."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none resize-none"
                ></textarea>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: PREÇOS E CUSTOS */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-400" />
                <span>3. Tabelas de Preço & Custos</span>
              </h2>

              {/* BOTÃO RADAR DE PREÇOS NO LUGAR DO PERCENTUAL DE DESCONTO */}
              <button
                type="button"
                onClick={handleAbrirRadarPrecos}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 hover:from-indigo-500 hover:to-purple-600 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-500 text-xs font-bold transition shadow-sm cursor-pointer group"
                title="Comparar preços praticados por concorrentes e marketplaces na internet"
              >
                <Search className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white transition" />
                <span>Radar de Preços</span>
                <span className="text-[9px] bg-indigo-500/30 group-hover:bg-white/20 text-indigo-200 group-hover:text-white px-1.5 py-0.2 rounded-full font-black">
                  IA
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Preço de Custo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precoCusto}
                  onChange={(e) => setPrecoCusto(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 block">Custo de compra/produção</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-400">Preço Varejo (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 49.90"
                  value={precoVendaVarejo}
                  onChange={(e) => handlePrecoVarejoChange(e.target.value)}
                  className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl px-3.5 py-2 text-xs font-bold text-emerald-400 focus:outline-none focus:border-emerald-400"
                />
                <span className="text-[10px] text-slate-500 block">Preço base de balcão</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Preço Atacado (R$)</label>
                  {precoVendaVarejo && (
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                      -{regrasPrecificacao.descontoAtacado}%
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 39.90"
                  value={precoVendaAtacado}
                  onChange={(e) => setPrecoVendaAtacado(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 block">Conforme regra da loja</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Preço Autoatacado (R$)</label>
                  {precoVendaVarejo && (
                    <span className="text-[10px] bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded font-bold">
                      -{regrasPrecificacao.descontoAutoatacado}%
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 32.90"
                  value={precoVendaAutoatacado}
                  onChange={(e) => setPrecoVendaAutoatacado(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 block">Conforme regra da loja</span>
              </div>
            </div>
          </div>

          {/* SEÇÃO 4: ESTOQUE & VALIDADE */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <div>
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-emerald-400" />
                <span>4. Controle de Estoque & Entrada Inicial</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Informe a quantidade inicial que você tem agora em loja. Você poderá dar entrada em novas compras a qualquer momento.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-400">Estoque Inicial em Loja</label>
                <input
                  type="number"
                  value={quantidadeEstoque}
                  onChange={(e) => setQuantidadeEstoque(e.target.value)}
                  className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl px-3.5 py-2 text-xs font-bold text-emerald-400"
                />
                <span className="text-[10px] text-slate-500">Saldo inicial para venda</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Alerta de Estoque Mínimo</label>
                <input
                  type="number"
                  value={estoqueMinimoAlerta}
                  onChange={(e) => setEstoqueMinimoAlerta(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
                <span className="text-[10px] text-slate-500">Avisa quando estiver acabando</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Data de Validade (Opcional)</label>
                <input
                  type="date"
                  value={dataValidade}
                  onChange={(e) => setDataValidade(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
                <span className="text-[10px] text-slate-500">Para perecíveis / cosméticos</span>
              </div>
            </div>
          </div>

          {/* SEÇÃO 5: GRADE DE VARIAÇÕES (SIMPLIFICADA E INTUITIVA) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>5. Variações do Produto (Cor, Tamanho, Sabor...)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ative se o produto tiver opções diferentes com controle de estoque individual.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={temVariacoes}
                  onChange={(e) => {
                    setTemVariacoes(e.target.checked);
                    if (e.target.checked && !nomeTipoVariacao) {
                      setEtapaVariacao(1);
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {temVariacoes && (
              <div className="space-y-4 pt-4 border-t border-slate-800 animate-in fade-in">
                {/* ETAPA 1: Definir o Nome do Tipo da Variação */}
                {etapaVariacao === 1 ? (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                    <label className="text-xs font-bold text-slate-200 block">
                      Qual é o tipo de variação deste produto?
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        type="text"
                        placeholder="Exemplo: Cor, Tamanho ou Sabor"
                        value={nomeTipoVariacao}
                        onChange={(e) => setNomeTipoVariacao(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (nomeTipoVariacao.trim()) setEtapaVariacao(2);
                          }
                        }}
                        className="flex-1 bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!nomeTipoVariacao.trim()) {
                            alert('Por favor, informe o nome da variação (ex: Cor, Tamanho ou Sabor).');
                            return;
                          }
                          setEtapaVariacao(2);
                        }}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 font-bold text-white text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-md shadow-emerald-500/20"
                      >
                        <span>Continuar</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ETAPA 2: Adicionar Opções e Gerenciar Estoques */
                  <div className="space-y-4">
                    {/* Header do Tipo Ativo */}
                    <div className="flex items-center justify-between bg-slate-950/80 px-4 py-3 rounded-2xl border border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Tipo de variação:</span>
                        <span className="text-xs font-black text-emerald-400 uppercase tracking-wide bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg">
                          {nomeTipoVariacao}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEtapaVariacao(1)}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        Alterar tipo
                      </button>
                    </div>

                    {/* Formulário para Inserir Nova Opção */}
                    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                      <span className="text-xs font-bold text-slate-300 block">Adicionar nova opção:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-7 space-y-1">
                          <label className="text-[11px] text-slate-400 block">
                            Digite uma opção para {nomeTipoVariacao || 'a variação'}
                          </label>
                          <input
                            type="text"
                            placeholder={`Ex: ${nomeTipoVariacao.toLowerCase().includes('cor') ? 'Azul, Preto, Branco' : nomeTipoVariacao.toLowerCase().includes('tamanho') ? 'P, M, G, GG' : 'Morango, Baunilha, Chocolate'}`}
                            value={novaOpcaoNome}
                            onChange={(e) => setNovaOpcaoNome(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAdicionarOpcao();
                              }
                            }}
                            className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
                          />
                        </div>

                        <div className="sm:col-span-3 space-y-1">
                          <label className="text-[11px] text-slate-400 block">Estoque da opção</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Qtd (ex: 5)"
                            value={novaOpcaoEstoque}
                            onChange={(e) => setNovaOpcaoEstoque(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAdicionarOpcao();
                              }
                            }}
                            className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-bold text-emerald-400 focus:outline-none"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            onClick={handleAdicionarOpcao}
                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-emerald-500/20"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Lista de Opções Cadastradas */}
                    {opcoesVariacao.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                          <span className="font-semibold">Opções cadastradas ({opcoesVariacao.length}):</span>
                          <span>Estoque individual</span>
                        </div>

                        <div className="space-y-2">
                          {opcoesVariacao.map((opc) => (
                            <div
                              key={opc.id}
                              className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 gap-3"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <span className="text-xs font-bold text-slate-100">{opc.nome}</span>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-slate-400">Estoque:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={opc.estoque}
                                    onChange={(e) => handleAtualizarEstoqueOpcao(opc.id, e.target.value)}
                                    className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                                  />
                                  <span className="text-[11px] text-slate-500">un</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoverOpcao(opc.id)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                  title="Remover opção"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-xs text-slate-400">
                        Nenhuma opção adicionada ainda. Digite uma opção acima (ex: Azul, P, Sabor Morango) e clique em Adicionar.
                      </div>
                    )}

                    {/* Resumo de Conferência de Estoque */}
                    {opcoesVariacao.length > 0 && (
                      <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-emerald-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            Soma do estoque das variações: <strong>{opcoesVariacao.reduce((acc, o) => acc + (Number(o.estoque) || 0), 0)} un</strong>
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-400 font-medium">
                          O estoque total do produto será sincronizado com {opcoesVariacao.reduce((acc, o) => acc + (Number(o.estoque) || 0), 0)} un
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SEÇÃO 6: CATÁLOGO ONLINE E DESTAQUE */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>6. Visibilidade no Catálogo Online</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={exibirCatalogo}
                  onChange={(e) => setExibirCatalogo(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0"
                />
                <div>
                  <span className="font-bold text-xs text-slate-200 block">Exibir no Catálogo Online</span>
                  <span className="text-[11px] text-slate-400 block">Ficará visível para os clientes comprarem pelo link</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={destaque}
                  onChange={(e) => setDestaque(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-0"
                />
                <div>
                  <span className="font-bold text-xs text-slate-200 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Destacar Produto na Vitrine</span>
                  </span>
                  <span className="text-[11px] text-slate-400 block">Aparecerá no topo da página de vendas</span>
                </div>
              </label>
            </div>
          </div>

          {/* Botão Salvar Produto */}
          <button
            type="submit"
            disabled={salvando}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 font-bold text-white shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 text-sm transition disabled:opacity-50 cursor-pointer"
          >
            {salvando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{ehEdicao ? 'Salvando Alterações no HUBI...' : 'Cadastrando Produto no HUBI...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>{ehEdicao ? 'Salvar Alterações' : 'Salvar Produto'}</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* MODAL DE CONFIGURAÇÃO DE CHAVE GOOGLE GEMINI AI                           */}
      {/* ========================================================================= */}
      {modalKeyGemini && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-indigo-400">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-100">Chave Google Gemini IA</h3>
              </div>
              <button onClick={() => setModalKeyGemini(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>
                Para habilitar o reconhecimento multimodal em alta precisão de fotos de produtos, você pode inserir sua chave gratuita do <strong>Google Gemini</strong>.
              </p>
              <p className="text-[11px] text-slate-400">
                Você pode obter sua chave gratuitamente no{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 underline font-bold"
                >
                  Google AI Studio
                </a>.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Chave da API (Gemini API Key):</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalKeyGemini(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeminiApiKey(tempApiKey);
                  setModalKeyGemini(false);
                  alert('Chave do Google Gemini salva com sucesso!');
                }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
              >
                Salvar Chave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Radar de Preços de Mercado (IA) */}
      {modalRadarAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header do Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-md">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-slate-100">
                      Radar de Preços de Mercado
                    </h3>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold">
                      IA Gemini
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate max-w-md mt-0.5">
                    {nome ? `Comparativo de concorrentes para: "${nome}"` : 'Pesquisa de preços na internet'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalRadarAberto(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {buscandoMercado ? (
                <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    <Sparkles className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">
                      Consultando Mercado e Concorrentes...
                    </h4>
                    <p className="text-xs text-slate-400 max-w-sm mt-1">
                      Pesquisando valores praticados no Mercado Livre, Shopee, Amazon, Magalu, farmácias e supermercados para "{nome}".
                    </p>
                  </div>
                </div>
              ) : erroMercado ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-3 text-center">
                  <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
                  <div>
                    <h4 className="font-bold text-xs text-rose-300">Não foi possível consultar os preços</h4>
                    <p className="text-[11px] text-slate-400 mt-1">{erroMercado}</p>
                  </div>
                  <button
                    type="button"
                    onClick={buscarConcorrentesMercado}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Tentar Novamente
                  </button>
                </div>
              ) : dadosMercado ? (
                <>
                  {/* CARD DE RESUMO GERAL (MÉDIA & DESTAQUES) */}
                  <div className="bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/70 p-4 rounded-2xl border border-indigo-500/30 space-y-3 shadow-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                          Preço Médio de Mercado
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-2xl sm:text-3xl font-black text-white">
                            R$ {dadosMercado.precoMedio.toFixed(2)}
                          </span>
                          <span className="text-[11px] text-indigo-300 font-medium">
                            (Baseado em {dadosMercado.totalPesquisados} lojas)
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAplicarPrecoMercado(dadosMercado.precoMedio)}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                      >
                        <Zap className="w-4 h-4 fill-white" />
                        <span>Aplicar Preço Médio (R$ {dadosMercado.precoMedio.toFixed(2)})</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-500/20 text-xs">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <TrendingDown className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          Menor: <b>R$ {dadosMercado.menorPreco.toFixed(2)}</b> ({dadosMercado.menoresPrecos[0]?.loja || 'Concorrente'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-purple-300 font-semibold">
                        <TrendingUp className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          Maior: <b>R$ {dadosMercado.maiorPreco.toFixed(2)}</b> ({dadosMercado.maioresPrecos[0]?.loja || 'Concorrente'})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* DUAS COLUNAS: 5 MENORES VS 5 MAIORES PREÇOS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 5 MENORES PREÇOS */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-400 px-1">
                        <span className="flex items-center gap-1.5">
                          <TrendingDown className="w-3.5 h-3.5" />
                          5 Menores Preços Localizados
                        </span>
                        <span className="text-[10px] text-slate-500 font-normal">Mais competitivos</span>
                      </div>

                      <div className="space-y-2">
                        {dadosMercado.menoresPrecos.length === 0 ? (
                          <div className="text-center py-6 text-slate-500 text-xs">Nenhum registro listado.</div>
                        ) : (
                          dadosMercado.menoresPrecos.map((item, idx) => (
                            <div
                              key={idx}
                              className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-2.5 flex items-center justify-between gap-2 transition group"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <h5 className="font-bold text-xs text-slate-200 truncate">{item.loja}</h5>
                                </div>
                                <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                                  {item.tipo || 'Varejo'}
                                </span>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-black text-xs sm:text-sm text-emerald-400 block">
                                  R$ {item.preco.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAplicarPrecoMercado(item.preco)}
                                  className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 underline mt-0.5 cursor-pointer block"
                                >
                                  Usar este
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 5 MAIORES PREÇOS */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-300 px-1">
                        <span className="flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />
                          5 Maiores Preços Localizados
                        </span>
                        <span className="text-[10px] text-slate-500 font-normal">Teto de mercado</span>
                      </div>

                      <div className="space-y-2">
                        {dadosMercado.maioresPrecos.length === 0 ? (
                          <div className="text-center py-6 text-slate-500 text-xs">Nenhum registro listado.</div>
                        ) : (
                          dadosMercado.maioresPrecos.map((item, idx) => (
                            <div
                              key={idx}
                              className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-2.5 flex items-center justify-between gap-2 transition group"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <h5 className="font-bold text-xs text-slate-200 truncate">{item.loja}</h5>
                                </div>
                                <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                                  {item.tipo || 'Varejo'}
                                </span>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-black text-xs sm:text-sm text-indigo-300 block">
                                  R$ {item.preco.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAplicarPrecoMercado(item.preco)}
                                  className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200 underline mt-0.5 cursor-pointer block"
                                >
                                  Usar este
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Search className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs">Nenhuma pesquisa realizada ainda.</p>
                  <button
                    type="button"
                    onClick={buscarConcorrentesMercado}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs"
                  >
                    Iniciar Pesquisa
                  </button>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {dadosMercado ? `Pesquisa atualizada em ${dadosMercado.dataConsulta}` : 'Inteligência de mercado integrada'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={buscarConcorrentesMercado}
                  disabled={buscandoMercado || !nome.trim()}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Atualizar cotações de concorrentes"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${buscandoMercado ? 'animate-spin' : ''}`} />
                  <span>Atualizar Pesquisa</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalRadarAberto(false)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Categorias */}
      <ModalGerenciarCategorias
        isOpen={modalCategorias}
        onClose={() => setModalCategorias(false)}
        categorias={categorias}
        onCategoriasAtualizadas={carregarAux}
        onCategoriaCriada={(novaCat) => {
          setCategoriaId(novaCat.id);
        }}
      />
    </div>
  );
};
