import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Truck,
  Wrench,
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
  Lock,
  Globe
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { Categoria, Fornecedor, UnidadeMedida } from '../types';
import { UNIDADES_PADRAO } from './CadastrosAuxiliares';
import { ModalGerenciarCategorias } from './ModalGerenciarCategorias';
import { ModalPesquisaFotosInternet } from './ModalPesquisaFotosInternet';
import { ModalOnboardingSerpApi } from './ModalOnboardingSerpApi';
import { SpinnerPesquisandoIA } from './SpinnerPesquisandoIA';
import { ModalDuvidaProdutoIA } from './ModalDuvidaProdutoIA';
import {
  atualizarProdutoExistenteComIA,
  obterNomeSegmentoLoja,
  getGeminiApiKey,
  salvarGeminiApiKey,
  obterOuBuscarGeminiApiKey,
  extrairDimensoesEPesoTexto,
  estimarDimensoesEPesoProduto,
  extrairJsonDoTexto,
  identificarProdutoPorFoto,
  identificarProdutoPorTextoOuEan,
  comprimirImagemParaIA,
  executarRequisicaoGemini
} from '../services/geminiService';
import { obterSerpApiKey, obterOuBuscarSerpApiKey } from '../services/serpApiService';
import { catalogJevService } from '../services/catalogJevService';

export interface PrecoConcorrente {
  loja: string;
  preco: number;
  tipo: string;
  url?: string;
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
  duvida?: boolean;
  diferencial?: string;
  opcoes_sugeridas?: ProdutoSugeridoIA[];
  peso_kg?: number;
  altura_cm?: number;
  largura_cm?: number;
  comprimento_cm?: number;
  foto_url?: string;
}

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



export const pesquisarPrecosMercadoIA = async (
  nomeProduto: string,
  categoriaNome?: string,
  barcode?: string,
  loja?: any,
  segmentoLoja?: string
): Promise<DadosMercadoIA> => {
  const apiKey = getGeminiApiKey(loja);
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Configure a chave no topo da página.');
  }

  const segmento = segmentoLoja || (loja ? obterNomeSegmentoLoja(loja) : '') || '';

  const promptTexto = `
Você é um especialista em inteligência de mercado, precificação competitiva e monitoramento de preços no varejo e e-commerce brasileiro${segmento ? ` (segmento da loja: "${segmento}")` : ''}.
Pesquise e levante com rigor técnico os preços reais de varejo praticados atualmente no mercado brasileiro para o seguinte item:

PRODUTO: "${nomeProduto}"
${categoriaNome ? `CATEGORIA: "${categoriaNome}"` : ''}
${barcode ? `CÓDIGO DE BARRAS / EAN: "${barcode}"` : ''}
${segmento ? `SEGMENTO DE MERCADO: "${segmento}"` : ''}

DIRETRIZES DE CALIBRAÇÃO REALISTA DE PREÇOS NO BRASIL:
1. IDENTIFICAÇÃO DE FAIXA DE VALOR:
   - Se for um item de entrada/popular (ex: mini vibrador bullet básico a pilha, cabos, bijuterias, acessórios simples importados), os marketplaces populares (Shopee, AliExpress Brasil) praticam preços extremamente agressivos, comumente entre R$ 11,00 e R$ 19,90.
   - Nos marketplaces líderes (Mercado Livre e Amazon Brasil), itens de entrada giram entre R$ 18,90 e R$ 29,90.
   - Em lojas online especializadas de nicho e marcas próprias, o valor fica entre R$ 24,90 e R$ 38,00.
   - Itens intermediários ou de marcas consagradas/recarregáveis têm tickets proporcionalmente mais altos.
2. CONCORRÊNCIA COERENTE COM O NICHO:
   - Identifique entre 10 e 14 concorrentes REAIS no Brasil adequados ao segmento "${segmento || 'Varejo'}".
   - Sempre inclua Shopee com preços agressivos reais de marketplace popular.
   - Inclua Mercado Livre e Amazon Brasil.
   - Inclua lojas e e-commerces especializados que de fato comercializam esta categoria${segmento ? ` (ex: para ${segmento}, inclua marcas e e-commerces reais do setor como Miess, Sex Shop Virtual, Hot Flowers, Sapeka, Sexy Fantasy, Intt, etc.)` : ''}.
   - NUNCA invente lojas não correlatas (ex: não cite Casas Bahia, Americanas, Kalunga ou Pão de Açúcar para produtos de sex shop ou itens fora do sortimento deles).

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional):
{
  "preco_medio": 0.00,
  "concorrentes": [
    { "loja": "Shopee", "preco": 12.90, "tipo": "Marketplace" },
    { "loja": "Mercado Livre", "preco": 19.90, "tipo": "Marketplace" },
    { "loja": "Amazon Brasil", "preco": 22.90, "tipo": "Marketplace" },
    { "loja": "Loja Especializada", "preco": 28.00, "tipo": "E-commerce Especializado" }
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
      temperature: 0.15,
      response_mime_type: 'application/json'
    }
  };

  const resData = await executarRequisicaoGemini(apiKey, requestBody);

  const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Resposta vazia da IA.');

  const parsed = extrairJsonDoTexto(rawText);
  if (!parsed) throw new Error('Não foi possível interpretar a resposta da IA.');

  const lista = parsed.concorrentes || [];
  return processarListaConcorrentes(lista, Number(parsed.preco_medio) || 0);
};


export const ProdutoCadastro: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const ehEdicao = Boolean(id);
  const { loja, setLoja } = useAuth();
  const permissions = usePermissions();
  const { mostrarSucesso, mostrarAviso, mostrarErro } = useFeedbackModal();
  const segmentoLoja = useMemo(() => obterNomeSegmentoLoja(loja), [loja]);

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
  const [tempApiKey, setTempApiKey] = useState<string>(() => getGeminiApiKey(loja));
  const [salvandoKeyGemini, setSalvandoKeyGemini] = useState<boolean>(false);

  useEffect(() => {
    const carregarChave = async () => {
      const k = getGeminiApiKey(loja);
      if (k) {
        setTempApiKey(k);
      } else if (loja?.id) {
        const buscada = await obterOuBuscarGeminiApiKey(loja);
        if (buscada) setTempApiKey(buscada);
      }
    };
    carregarChave();
  }, [loja]);

  // Modal / Aba de Modo de Preenchimento Inteligente
  const [modoPreenchimentoIA, setModoPreenchimentoIA] = useState<'foto' | 'descricao' | 'barcode'>('foto');
  const [textoDescricaoIA, setTextoDescricaoIA] = useState<string>('');
  const [codigoBarrasIA, setCodigoBarrasIA] = useState<string>('');

  // Modal de Pesquisa de Fotos na Internet & Onboarding SerpApi (BYOK)
  const [modalFotosInternetAberto, setModalFotosInternetAberto] = useState<boolean>(false);
  const [modalOnboardingSerpApiAberto, setModalOnboardingSerpApiAberto] = useState<boolean>(false);

  const handleAbrirPesquisaFotos = async () => {
    let chave = obterSerpApiKey(loja);
    if (!chave && loja?.id) {
      chave = await obterOuBuscarSerpApiKey(loja);
      if (chave && setLoja && loja) {
        setLoja({ ...loja, serpapi_key: chave });
      }
    }

    if (!chave && !loja?.id) {
      setModalOnboardingSerpApiAberto(true);
    } else if (!chave) {
      setModalOnboardingSerpApiAberto(true);
    } else {
      setModalFotosInternetAberto(true);
    }
  };

  // Modal de Dúvida / Seleção de Produto pela IA
  const [modalDuvidaAberto, setModalDuvidaAberto] = useState<boolean>(false);
  const [opcoesDuvidaIA, setOpcoesDuvidaIA] = useState<ProdutoSugeridoIA[]>([]);

  // Refs de Câmera e Arquivo
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const CHAVE_RASCUNHO = `hubi_rascunho_novo_produto_${loja?.id || 'padrao'}`;

  // Recupera rascunho salvo do formulário ao retornar para a página
  const rascunhoSalvo = useMemo(() => {
    if (ehEdicao) return null;
    try {
      const salvo = sessionStorage.getItem(`hubi_rascunho_novo_produto_${loja?.id || 'padrao'}`);
      if (salvo) return JSON.parse(salvo);
    } catch {}
    return null;
  }, [ehEdicao, loja?.id]);

  // Estados do Produto (Fotos - até 7)
  const [fotosUrls, setFotosUrls] = useState<string[]>(() => rascunhoSalvo?.fotosUrls || []);
  const [fotoPrincipal, setFotoPrincipal] = useState<string>(() => rascunhoSalvo?.fotoPrincipal || '');
  const [novaFotoUrl, setNovaFotoUrl] = useState<string>('');
  const [mostrarUrlInput, setMostrarUrlInput] = useState<boolean>(false);
  const [fazendoUploadFoto, setFazendoUploadFoto] = useState<boolean>(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string>('');

  const [ativo, setAtivo] = useState<boolean>(() => rascunhoSalvo?.ativo ?? true);
  const [tipoItem, setTipoItem] = useState<'produto' | 'servico'>(() => (rascunhoSalvo?.tipoItem as any) || 'produto');
  const [nome, setNome] = useState<string>(() => rascunhoSalvo?.nome || '');
  const [codigoInterno, setCodigoInterno] = useState<string>(() => rascunhoSalvo?.codigoInterno || '');
  const [codigoBarras, setCodigoBarras] = useState<string>(() => rascunhoSalvo?.codigoBarras || '');
  const [categoriaId, setCategoriaId] = useState<string>(() => rascunhoSalvo?.categoriaId || '');
  const [fornecedorId, setFornecedorId] = useState<string>(() => rascunhoSalvo?.fornecedorId || '');
  const [descricao, setDescricao] = useState<string>(() => rascunhoSalvo?.descricao || '');
  const [tipoUnidade, setTipoUnidade] = useState<string>(() => rascunhoSalvo?.tipoUnidade || 'un');

  // Dimensões e Peso para Frete (Preenchido Automaticamente por IA / Regex)
  const [pesoKg, setPesoKg] = useState<string>(() => rascunhoSalvo?.pesoKg || '');
  const [alturaCm, setAlturaCm] = useState<string>(() => rascunhoSalvo?.alturaCm || '');
  const [larguraCm, setLarguraCm] = useState<string>(() => rascunhoSalvo?.larguraCm || '');
  const [comprimentoCm, setComprimentoCm] = useState<string>(() => rascunhoSalvo?.comprimentoCm || '');
  const [detectandoDimensoes, setDetectandoDimensoes] = useState<boolean>(false);

  // Preços
  const [precoCusto, setPrecoCusto] = useState<string>(() => rascunhoSalvo?.precoCusto || '0.00');
  const [precoVendaVarejo, setPrecoVendaVarejo] = useState<string>(() => rascunhoSalvo?.precoVendaVarejo || '');

  const [precoVendaAtacado, setPrecoVendaAtacado] = useState<string>(() => rascunhoSalvo?.precoVendaAtacado || '');
  const [tipoMinimoAtacado, setTipoMinimoAtacado] = useState<'quantidade' | 'valor'>(() => rascunhoSalvo?.tipoMinimoAtacado || 'quantidade');
  const [qtdMinimaAtacado, setQtdMinimaAtacado] = useState<string>(() => rascunhoSalvo?.qtdMinimaAtacado || '6');
  const [valorMinimoAtacado, setValorMinimoAtacado] = useState<string>(() => rascunhoSalvo?.valorMinimoAtacado || '300.00');

  const [precoVendaAutoatacado, setPrecoVendaAutoatacado] = useState<string>(() => rascunhoSalvo?.precoVendaAutoatacado || '');
  const [tipoMinimoAutoatacado, setTipoMinimoAutoatacado] = useState<'quantidade' | 'valor'>(() => rascunhoSalvo?.tipoMinimoAutoatacado || 'quantidade');
  const [qtdMinimaAutoatacado, setQtdMinimaAutoatacado] = useState<string>(() => rascunhoSalvo?.qtdMinimaAutoatacado || '24');
  const [valorMinimoAutoatacado, setValorMinimoAutoatacado] = useState<string>(() => rascunhoSalvo?.valorMinimoAutoatacado || '1000.00');

  const [precoPromocional, setPrecoPromocional] = useState<string>(() => rascunhoSalvo?.precoPromocional || '');
  const [promocaoAtiva, setPromocaoAtiva] = useState<boolean>(() => rascunhoSalvo?.promocaoAtiva ?? false);

  // Estoque & Visibilidade
  const [quantidadeEstoque, setQuantidadeEstoque] = useState<string>(() => rascunhoSalvo?.quantidadeEstoque || '0');
  const [estoqueMinimoAlerta, setEstoqueMinimoAlerta] = useState<string>(() => rascunhoSalvo?.estoqueMinimoAlerta || '5');
  const [dataValidade, setDataValidade] = useState<string>(() => rascunhoSalvo?.dataValidade || '');
  const [exibirCatalogo, setExibirCatalogo] = useState<boolean>(() => rascunhoSalvo?.exibirCatalogo ?? true);
  const [destaque, setDestaque] = useState<boolean>(() => rascunhoSalvo?.destaque ?? false);

  // Variações Simplificadas
  const [temVariacoes, setTemVariacoes] = useState<boolean>(() => rascunhoSalvo?.temVariacoes ?? false);
  const [nomeTipoVariacao, setNomeTipoVariacao] = useState<string>(() => rascunhoSalvo?.nomeTipoVariacao || ''); // Ex: "Cor", "Tamanho", "Sabor"
  const [etapaVariacao, setEtapaVariacao] = useState<number>(() => rascunhoSalvo?.etapaVariacao || 1); // 1: Nome do Tipo, 2: Opções e Estoques
  const [opcoesVariacao, setOpcoesVariacao] = useState<Array<{
    id: string;
    nome: string;
    estoque: string;
    precoVarejo: string;
    precoAtacado: string;
    barcode: string;
  }>>(() => rascunhoSalvo?.opcoesVariacao || []);
  const [novaOpcaoNome, setNovaOpcaoNome] = useState<string>('');
  const [novaOpcaoEstoque, setNovaOpcaoEstoque] = useState<string>('');

  const [unidadesLista, setUnidadesLista] = useState<Array<{ sigla: string; nome: string }>>(
    UNIDADES_PADRAO.map(u => ({ sigla: u.sigla, nome: u.nome }))
  );

  // Radar de Preços de Mercado (IA)
  const [modalRadarAberto, setModalRadarAberto] = useState<boolean>(false);
  const [dadosMercado, setDadosMercado] = useState<DadosMercadoIA | null>(() => rascunhoSalvo?.dadosMercado || null);
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

  const { setTemAlteracoesNaoSalvas, verificarSaidaComConfirmacao } = useFeedbackModal();
  const [snapshotInicial, setSnapshotInicial] = useState<string>('');

  const gerarSnapshotProduto = useCallback((dados: any) => {
    return JSON.stringify({
      nome: (dados.nome || '').trim(),
      codigoInterno: (dados.codigoInterno || '').trim(),
      codigoBarras: (dados.codigoBarras || '').trim(),
      categoriaId: dados.categoriaId || '',
      fornecedorId: dados.fornecedorId || '',
      descricao: (dados.descricao || '').trim(),
      tipoUnidade: dados.tipoUnidade || 'un',
      precoCusto: dados.precoCusto ? Number(dados.precoCusto).toFixed(2) : '0.00',
      precoVendaVarejo: dados.precoVendaVarejo ? Number(dados.precoVendaVarejo).toFixed(2) : '',
      precoVendaAtacado: dados.precoVendaAtacado ? Number(dados.precoVendaAtacado).toFixed(2) : '',
      tipoMinimoAtacado: dados.tipoMinimoAtacado || 'quantidade',
      qtdMinimaAtacado: dados.qtdMinimaAtacado ? String(dados.qtdMinimaAtacado) : '6',
      valorMinimoAtacado: dados.valorMinimoAtacado ? String(dados.valorMinimoAtacado) : '300.00',
      precoVendaAutoatacado: dados.precoVendaAutoatacado ? Number(dados.precoVendaAutoatacado).toFixed(2) : '',
      tipoMinimoAutoatacado: dados.tipoMinimoAutoatacado || 'quantidade',
      qtdMinimaAutoatacado: dados.qtdMinimaAutoatacado ? String(dados.qtdMinimaAutoatacado) : '24',
      valorMinimoAutoatacado: dados.valorMinimoAutoatacado ? String(dados.valorMinimoAutoatacado) : '1000.00',
      precoPromocional: dados.precoPromocional ? Number(dados.precoPromocional).toFixed(2) : '',
      promocaoAtiva: Boolean(dados.promocaoAtiva),
      quantidadeEstoque: String(dados.quantidadeEstoque || 0),
      estoqueMinimoAlerta: String(dados.estoqueMinimoAlerta || 5),
      dataValidade: dados.dataValidade || '',
      exibirCatalogo: Boolean(dados.exibirCatalogo),
      destaque: Boolean(dados.destaque),
      ativo: dados.ativo !== false,
      tipoItem: dados.tipoItem || 'produto',
      fotosUrls: Array.isArray(dados.fotosUrls) ? dados.fotosUrls : [],
      fotoPrincipal: dados.fotoPrincipal || '',
      temVariacoes: Boolean(dados.temVariacoes),
      nomeTipoVariacao: dados.nomeTipoVariacao || 'Opção',
      opcoesVariacao: (dados.opcoesVariacao || []).map((v: any) => ({
        id: v.id || '',
        nome: (v.nome || '').trim(),
        estoque: String(v.estoque || 0),
        precoVarejo: v.precoVarejo ? Number(v.precoVarejo).toFixed(2) : '',
        precoAtacado: v.precoAtacado ? Number(v.precoAtacado).toFixed(2) : '',
        barcode: v.barcode || ''
      }))
    });
  }, []);

  const snapshotAtual = useMemo(() => {
    return gerarSnapshotProduto({
      nome,
      codigoInterno,
      codigoBarras,
      categoriaId,
      fornecedorId,
      descricao,
      tipoUnidade,
      precoCusto,
      precoVendaVarejo,
      precoVendaAtacado,
      tipoMinimoAtacado,
      qtdMinimaAtacado,
      valorMinimoAtacado,
      precoVendaAutoatacado,
      tipoMinimoAutoatacado,
      qtdMinimaAutoatacado,
      valorMinimoAutoatacado,
      precoPromocional,
      promocaoAtiva,
      quantidadeEstoque,
      estoqueMinimoAlerta,
      dataValidade,
      exibirCatalogo,
      destaque,
      ativo,
      tipoItem,
      fotosUrls,
      fotoPrincipal,
      temVariacoes,
      nomeTipoVariacao,
      opcoesVariacao
    });
  }, [
    gerarSnapshotProduto,
    nome,
    codigoInterno,
    codigoBarras,
    categoriaId,
    fornecedorId,
    descricao,
    tipoUnidade,
    precoCusto,
    precoVendaVarejo,
    precoVendaAtacado,
    tipoMinimoAtacado,
    qtdMinimaAtacado,
    valorMinimoAtacado,
    precoVendaAutoatacado,
    tipoMinimoAutoatacado,
    qtdMinimaAutoatacado,
    valorMinimoAutoatacado,
    precoPromocional,
    promocaoAtiva,
    quantidadeEstoque,
    estoqueMinimoAlerta,
    dataValidade,
    exibirCatalogo,
    destaque,
    ativo,
    tipoItem,
    fotosUrls,
    fotoPrincipal,
    temVariacoes,
    nomeTipoVariacao,
    opcoesVariacao
  ]);

  useEffect(() => {
    if (!ehEdicao && !snapshotInicial && snapshotAtual) {
      setSnapshotInicial(snapshotAtual);
    }
  }, [ehEdicao, snapshotInicial, snapshotAtual]);

  const isDirty = Boolean(!carregandoProduto && snapshotInicial && snapshotAtual !== snapshotInicial);

  useEffect(() => {
    setTemAlteracoesNaoSalvas(isDirty);
    return () => {
      setTemAlteracoesNaoSalvas(false);
    };
  }, [isDirty, setTemAlteracoesNaoSalvas]);

  // Salva o rascunho em sessionStorage para que, se o usuário for para Cadastros & Tabelas, volte com tudo preenchido
  const salvarRascunhoFormulario = () => {
    if (ehEdicao) return;
    try {
      const payload = {
        nome,
        codigoInterno,
        codigoBarras,
        categoriaId,
        fornecedorId,
        descricao,
        tipoUnidade,
        tipoItem,
        precoCusto,
        precoVendaVarejo,
        precoVendaAtacado,
        tipoMinimoAtacado,
        qtdMinimaAtacado,
        valorMinimoAtacado,
        precoVendaAutoatacado,
        tipoMinimoAutoatacado,
        qtdMinimaAutoatacado,
        valorMinimoAutoatacado,
        precoPromocional,
        promocaoAtiva,
        quantidadeEstoque,
        estoqueMinimoAlerta,
        dataValidade,
        exibirCatalogo,
        destaque,
        temVariacoes,
        nomeTipoVariacao,
        etapaVariacao,
        opcoesVariacao,
        fotosUrls,
        fotoPrincipal,
        dadosMercado,
        timestamp: Date.now()
      };
      sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(payload));
    } catch (e) {
      console.warn('Erro ao salvar rascunho de produto:', e);
    }
  };

  // Navegar para Cadastros & Tabelas (Unidades, Fornecedores, etc.) garantindo preservação de todos os dados
  const handleNavegarParaAuxiliares = (tab: 'unidades' | 'fornecedores' | 'categorias') => {
    salvarRascunhoFormulario();
    sessionStorage.setItem('hubi_origem_cadastro_produto', ehEdicao && id ? `/products/edit/${id}` : '/products/create');
    navigate(`/auxiliares?tab=${tab}&origem=produto`);
  };

  // Auto-salvar rascunho sempre que o usuário preenche qualquer dado
  useEffect(() => {
    if (ehEdicao) return;
    const temAlgumDado = Boolean(
      nome.trim() ||
      codigoInterno.trim() ||
      codigoBarras.trim() ||
      categoriaId ||
      fornecedorId ||
      descricao.trim() ||
      (precoVendaVarejo && precoVendaVarejo !== '0.00') ||
      fotosUrls.length > 0 ||
      temVariacoes
    );
    if (temAlgumDado) {
      salvarRascunhoFormulario();
    }
  }, [
    ehEdicao,
    nome,
    codigoInterno,
    codigoBarras,
    categoriaId,
    fornecedorId,
    descricao,
    tipoUnidade,
    precoCusto,
    precoVendaVarejo,
    precoVendaAtacado,
    tipoMinimoAtacado,
    qtdMinimaAtacado,
    valorMinimoAtacado,
    precoVendaAutoatacado,
    tipoMinimoAutoatacado,
    qtdMinimaAutoatacado,
    valorMinimoAutoatacado,
    precoPromocional,
    promocaoAtiva,
    quantidadeEstoque,
    estoqueMinimoAlerta,
    dataValidade,
    exibirCatalogo,
    destaque,
    temVariacoes,
    nomeTipoVariacao,
    etapaVariacao,
    opcoesVariacao,
    fotosUrls,
    fotoPrincipal,
    dadosMercado
  ]);

  const carregarAux = async () => {
    if (!loja?.id) return;
    try {
      const { data: c } = await supabase.from('categorias').select('*').eq('loja_id', loja.id).order('ordem_exibicao');
      if (c) {
        setCategorias(c);
        const recemCriadaCat = sessionStorage.getItem('hubi_recem_criado_categoria');
        if (recemCriadaCat) {
          setCategoriaId(recemCriadaCat);
          sessionStorage.removeItem('hubi_recem_criado_categoria');
        }
      }
      const { data: f } = await supabase.from('fornecedores').select('*').eq('loja_id', loja.id);
      if (f) {
        setFornecedores(f);
        const recemCriadoForn = sessionStorage.getItem('hubi_recem_criado_fornecedor');
        if (recemCriadoForn) {
          setFornecedorId(recemCriadoForn);
          sessionStorage.removeItem('hubi_recem_criado_fornecedor');
        }
      }

      // Carregar unidades de medida do banco ou padrão
      try {
        const { data: u } = await supabase.from('unidades_medida').select('sigla, nome').eq('loja_id', loja.id).order('sigla');
        const combinadas: Array<{ sigla: string; nome: string }> = [];
        if (u && u.length > 0) {
          combinadas.push(...u);
        }
        UNIDADES_PADRAO.forEach(up => {
          if (!combinadas.some(item => item.sigla.toLowerCase() === up.sigla.toLowerCase())) {
            combinadas.push({ sigla: up.sigla, nome: up.nome });
          }
        });
        setUnidadesLista(combinadas);

        // Se uma unidade acabou de ser criada em Cadastros & Tabelas, auto-seleciona
        const recemCriadaUnidade = sessionStorage.getItem('hubi_recem_criado_unidade');
        if (recemCriadaUnidade) {
          setTipoUnidade(recemCriadaUnidade);
          sessionStorage.removeItem('hubi_recem_criado_unidade');
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
          setTipoItem((prod.tipo_item as any) || 'produto');

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

          setPesoKg((prod as any).peso_kg !== null && (prod as any).peso_kg !== undefined ? String((prod as any).peso_kg) : '');
          setAlturaCm((prod as any).altura_cm !== null && (prod as any).altura_cm !== undefined ? String((prod as any).altura_cm) : '');
          setLarguraCm((prod as any).largura_cm !== null && (prod as any).largura_cm !== undefined ? String((prod as any).largura_cm) : '');
          setComprimentoCm((prod as any).comprimento_cm !== null && (prod as any).comprimento_cm !== undefined ? String((prod as any).comprimento_cm) : '');

          const fotos = Array.isArray(prod.fotos_urls) ? prod.fotos_urls : [];
          setFotosUrls(fotos);
          setFotoPrincipal(fotos[0] || '');

          if (prod.tem_variacoes && Array.isArray(prod.variacoes) && prod.variacoes.length > 0) {
            setTemVariacoes(true);
            setNomeTipoVariacao(prod.rotulo_variacao_1 || 'Opção');
            setEtapaVariacao(2);
            const variacoesFormatadas = (prod.variacoes || []).map((v: any) => ({
              id: v.id || '',
              nome: v.valor_variacao_1 || '',
              estoque: String(v.quantidade_estoque || 0),
              precoVarejo: v.preco_venda_varejo ? Number(v.preco_venda_varejo).toFixed(2) : '',
              precoAtacado: v.preco_venda_atacado ? Number(v.preco_venda_atacado).toFixed(2) : '',
              barcode: v.codigo_barras || ''
            }));
            setOpcoesVariacao(variacoesFormatadas);
          }

          const snapStr = gerarSnapshotProduto({
            nome: prod.nome || '',
            codigoInterno: prod.codigo_interno || '',
            codigoBarras: prod.codigo_barras || '',
            categoriaId: prod.categoria_id || '',
            fornecedorId: prod.fornecedor_id || '',
            descricao: prod.descricao || '',
            tipoUnidade: prod.tipo_unidade || 'un',
            precoCusto: prod.preco_custo ? Number(prod.preco_custo).toFixed(2) : '0.00',
            precoVendaVarejo: prod.preco_venda_varejo ? Number(prod.preco_venda_varejo).toFixed(2) : '',
            precoVendaAtacado: prod.preco_venda_atacado ? Number(prod.preco_venda_atacado).toFixed(2) : '',
            tipoMinimoAtacado: prod.tipo_minimo_atacado || 'quantidade',
            qtdMinimaAtacado: prod.qtd_minima_atacado ? String(prod.qtd_minima_atacado) : '6',
            valorMinimoAtacado: prod.valor_minimo_atacado ? String(prod.valor_minimo_atacado) : '300.00',
            precoVendaAutoatacado: prod.preco_venda_autoatacado ? Number(prod.preco_venda_autoatacado).toFixed(2) : '',
            tipoMinimoAutoatacado: prod.tipo_minimo_autoatacado || 'quantidade',
            qtdMinimaAutoatacado: prod.qtd_minima_autoatacado ? String(prod.qtd_minima_autoatacado) : '24',
            valorMinimoAutoatacado: prod.valor_minimo_autoatacado ? String(prod.valor_minimo_autoatacado) : '1000.00',
            precoPromocional: prod.preco_promocional ? Number(prod.preco_promocional).toFixed(2) : '',
            promocaoAtiva: Boolean(prod.promocao_ativa),
            quantidadeEstoque: String(prod.quantidade_estoque || 0),
            estoqueMinimoAlerta: String(prod.estoque_minimo_alerta || 5),
            dataValidade: prod.data_validade || '',
            exibirCatalogo: Boolean(prod.exibir_catalogo),
            destaque: Boolean(prod.destaque),
            ativo: prod.ativo !== false,
            tipoItem: prod.tipo_item || 'produto',
            fotosUrls: fotos,
            fotoPrincipal: fotos[0] || '',
            temVariacoes: Boolean(prod.tem_variacoes && Array.isArray(prod.variacoes) && prod.variacoes.length > 0),
            nomeTipoVariacao: prod.rotulo_variacao_1 || 'Opção',
            opcoesVariacao: (prod.variacoes || []).map((v: any) => ({
              id: v.id || '',
              nome: v.valor_variacao_1 || '',
              estoque: String(v.quantidade_estoque || 0),
              precoVarejo: v.preco_venda_varejo ? Number(v.preco_venda_varejo).toFixed(2) : '',
              precoAtacado: v.preco_venda_atacado ? Number(v.preco_venda_atacado).toFixed(2) : '',
              barcode: v.codigo_barras || ''
            }))
          });
          setSnapshotInicial(snapStr);
          setTemAlteracoesNaoSalvas(false);
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
  const aplicarDadosSugeridosIA = async (dadosSugeridos: ProdutoSugeridoIA) => {
    if (dadosSugeridos.nome) setNome(dadosSugeridos.nome);
    if (dadosSugeridos.descricao) setDescricao(dadosSugeridos.descricao);
    
    // Regra padrão: Preço médio sugerido sem os centavos (ex: R$ 37,40 vira R$ 37,00)
    let precoSugerido = dadosSugeridos.dados_mercado?.precoMedio || dadosSugeridos.preco_venda_estimado;
    if (precoSugerido && precoSugerido > 0) {
      const semCentavos = Math.floor(precoSugerido);
      handlePrecoVarejoChange(semCentavos.toFixed(2));
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
    if (dadosSugeridos.foto_url && !fotoPrincipal) {
      setFotoPrincipal(dadosSugeridos.foto_url);
      setFotosUrls(prev => [dadosSugeridos.foto_url!, ...prev.filter(f => f !== dadosSugeridos.foto_url!)]);
    }

    // Preenchimento Automático das Dimensões e Peso de Frete via IA ou Regex
    if (dadosSugeridos.peso_kg !== undefined && dadosSugeridos.peso_kg !== null && Number(dadosSugeridos.peso_kg) > 0) {
      setPesoKg(String(dadosSugeridos.peso_kg));
    }
    if (dadosSugeridos.altura_cm !== undefined && dadosSugeridos.altura_cm !== null && Number(dadosSugeridos.altura_cm) > 0) {
      setAlturaCm(String(dadosSugeridos.altura_cm));
    }
    if (dadosSugeridos.largura_cm !== undefined && dadosSugeridos.largura_cm !== null && Number(dadosSugeridos.largura_cm) > 0) {
      setLarguraCm(String(dadosSugeridos.largura_cm));
    }
    if (dadosSugeridos.comprimento_cm !== undefined && dadosSugeridos.comprimento_cm !== null && Number(dadosSugeridos.comprimento_cm) > 0) {
      setComprimentoCm(String(dadosSugeridos.comprimento_cm));
    }

    // Salvar dados de concorrentes e mercado identificados pela IA em memória
    if (dadosSugeridos.dados_mercado) {
      setDadosMercado(dadosSugeridos.dados_mercado);
    }

    // Vincular categoria real da loja via Jev (System One) ou fallback local
    if (categorias.length > 0) {
      try {
        const catClassificada = await catalogJevService.classificarCategoriaLoja(
          { nome: dadosSugeridos.nome, descricao: dadosSugeridos.descricao },
          categorias
        );
        if (catClassificada) {
          setCategoriaId(catClassificada.id);
          gerarCodigoInternoSugerido(catClassificada.id);
        } else if (dadosSugeridos.categoria_sugerida) {
          const catMatch = categorias.find(c =>
            c.nome.toLowerCase().includes(dadosSugeridos.categoria_sugerida!.toLowerCase()) ||
            dadosSugeridos.categoria_sugerida!.toLowerCase().includes(c.nome.toLowerCase())
          );
          if (catMatch) {
            setCategoriaId(catMatch.id);
            gerarCodigoInternoSugerido(catMatch.id);
          }
        }
      } catch {
        if (dadosSugeridos.categoria_sugerida) {
          const catMatch = categorias.find(c =>
            c.nome.toLowerCase().includes(dadosSugeridos.categoria_sugerida!.toLowerCase()) ||
            dadosSugeridos.categoria_sugerida!.toLowerCase().includes(c.nome.toLowerCase())
          );
          if (catMatch) {
            setCategoriaId(catMatch.id);
            gerarCodigoInternoSugerido(catMatch.id);
          }
        }
      }
    }
  };

  // Rotina Unificada de Preenchimento / Atualização com Inteligência Artificial
  const handleExecutarPreenchimentoIA = async (modoAcao: 'atualizar' | 'preencher' = 'preencher') => {
    const nomeInformado = nome.trim();
    const fotoAlvo = fotoPrincipal || fotosUrls[0];

    // 1. Validação Obrigatória de Entrada:
    // Se o campo Nome do Produto estiver vazio E não houver nenhuma foto cadastrada, bloquear a chamada e disparar Toast
    if (!nomeInformado && !fotoAlvo) {
      mostrarAviso('Para usar a Inteligência Artificial, informe pelo menos o nome do produto ou adicione uma foto.');
      return;
    }

    try {
      setAnalisandoIA(true);
      setSucessoIAMsg(null);

      // 2. Fluxo Unificado de Consulta:
      // Priorizam primeiro o Nome e a Descrição existentes; caso ausentes ou insuficientes, utilizam a Foto Principal
      if (nomeInformado || descricao.trim()) {
        const catNome = categorias.find(c => c.id === categoriaId)?.nome;
        const dadosAtualizados = await atualizarProdutoExistenteComIA({
          nome: nomeInformado || 'Produto',
          descricao: descricao.trim(),
          categoriaNome: catNome,
          codigoBarras: codigoBarras.trim(),
          precoVendaAtual: Number(precoVendaVarejo) || undefined,
          segmentoLoja,
          loja
        });

        if (dadosAtualizados) {
          await aplicarDadosSugeridosIA(dadosAtualizados);
          setSucessoIAMsg(
            modoAcao === 'atualizar'
              ? '✨ Informações e ficha técnica do produto atualizadas com sucesso pela IA!'
              : '✨ Informações comerciais preenchidas com sucesso a partir do nome/descrição!'
          );
        }
      } else if (fotoAlvo) {
        const fotoParaIA = fotoBase64Cache.get(fotoAlvo) || fotoAlvo;
        const dadosSugeridos = await identificarProdutoPorFoto(fotoParaIA, segmentoLoja, loja);

        if (dadosSugeridos) {
          if (dadosSugeridos.duvida && dadosSugeridos.opcoes_sugeridas && dadosSugeridos.opcoes_sugeridas.length > 1) {
            setOpcoesDuvidaIA(dadosSugeridos.opcoes_sugeridas);
            setModalDuvidaAberto(true);
          } else {
            await aplicarDadosSugeridosIA(dadosSugeridos);
            setSucessoIAMsg('✨ Informações e preços de mercado do produto identificados com sucesso a partir da foto!');
          }
        }
      }
    } catch (err: any) {
      console.error('Erro na rotina de IA:', err);
      mostrarErro(`Não foi possível processar com a IA: ${err.message || 'Tente novamente'}`);
    } finally {
      setAnalisandoIA(false);
    }
  };

  const handlePreencherComIA = () => handleExecutarPreenchimentoIA('preencher');
  const handleAtualizarComIA = () => handleExecutarPreenchimentoIA('atualizar');

  // Funções do Radar de Preços de Mercado
  const handleAbrirRadarPrecos = async () => {
    setModalRadarAberto(true);
    setErroMercado(null);

    if (!nome.trim()) {
      setErroMercado('Por favor, informe o nome do produto no formulário primeiro para pesquisar os concorrentes.');
      return;
    }
    // Se já temos dados do radar em memória, não chama a IA novamente! Apresenta imediatamente os dados guardados em memória.
    if (dadosMercado) {
      return;
    }
    // Executa a pesquisa completa e aprofundada de mercado se ainda não houver dados em memória
    await buscarConcorrentesMercado();
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
      const resultado = await pesquisarPrecosMercadoIA(nome, catNome, codigoBarras, loja, segmentoLoja);
      setDadosMercado(resultado);
    } catch (err: any) {
      setErroMercado(err.message || 'Erro ao pesquisar preços de mercado.');
    } finally {
      setBuscandoMercado(false);
    }
  };

  const handleAplicarPrecoMercado = (novoPreco: number) => {
    // Aplica sempre sem centavos (ex: 37,40 vira 37,00)
    const precoSemCentavos = Math.floor(novoPreco);
    handlePrecoVarejoChange(precoSemCentavos.toFixed(2));
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
        tipo_item: tipoItem,
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
        quantidade_estoque: tipoItem === 'servico' ? 0 : estoqueFinal,
        estoque_minimo_alerta: tipoItem === 'servico' ? 0 : (Number(estoqueMinimoAlerta) || 0),
        tem_variacoes: temVariacoes && opcoesVariacao.length > 0,
        rotulo_variacao_1: temVariacoes ? nomeTipoVariacao || 'Opção' : null,
        rotulo_variacao_2: null,
        data_validade: dataValidade || null,
        exibir_catalogo: exibirCatalogo,
        destaque: destaque,
        ativo: ativo,
        peso_kg: pesoKg.trim() ? Number(pesoKg.replace(',', '.')) : null,
        altura_cm: alturaCm.trim() ? Number(alturaCm.replace(',', '.')) : null,
        largura_cm: larguraCm.trim() ? Number(larguraCm.replace(',', '.')) : null,
        comprimento_cm: comprimentoCm.trim() ? Number(comprimentoCm.replace(',', '.')) : null
      };

      if (ehEdicao) {
        let { error: erroUpdate } = await supabase
          .from('produtos')
          .update(novoProduto)
          .eq('id', id);

        // Fallback caso colunas de dimensões ou tipo_item ainda não existam no schema do banco
        if (erroUpdate && (
          erroUpdate.message?.includes('tipo_item') || 
          erroUpdate.message?.includes('peso_kg') || 
          erroUpdate.message?.includes('altura_cm') ||
          (erroUpdate as any).details?.includes('peso_kg')
        )) {
          console.warn('Colunas novas ausentes no schema de produtos. Tentando atualizar com payload base...');
          const { tipo_item, peso_kg, altura_cm, largura_cm, comprimento_cm, ...dadosSemNovasColunas } = novoProduto;
          const retry = await supabase
            .from('produtos')
            .update(dadosSemNovasColunas)
            .eq('id', id);
          erroUpdate = retry.error;
        }

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
        let { data: prodCriado, error: erroProd } = await supabase
          .from('produtos')
          .insert([novoProduto])
          .select()
          .single();

        // Fallback caso colunas de dimensões ou tipo_item ainda não existam no schema do banco
        if (erroProd && (
          erroProd.message?.includes('tipo_item') || 
          erroProd.message?.includes('peso_kg') || 
          erroProd.message?.includes('altura_cm') ||
          (erroProd as any).details?.includes('peso_kg')
        )) {
          console.warn('Colunas novas ausentes no schema de produtos. Tentando cadastrar com payload base...');
          const { tipo_item, peso_kg, altura_cm, largura_cm, comprimento_cm, ...dadosSemNovasColunas } = novoProduto;
          const retry = await supabase
            .from('produtos')
            .insert([dadosSemNovasColunas])
            .select()
            .single();
          prodCriado = retry.data;
          erroProd = retry.error;
        }

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

      sessionStorage.removeItem(CHAVE_RASCUNHO);
      sessionStorage.removeItem('hubi_origem_cadastro_produto');
      setTemAlteracoesNaoSalvas(false);
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
    <div className="flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header Superior */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => verificarSaidaComConfirmacao(() => navigate('/products'))}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                {ehEdicao ? 'Alterar Produto' : 'Cadastrar Novo Produto'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ehEdicao ? 'Atualize as fotos, valores, dados fiscais e estoques do item' : 'Tire uma foto para preenchimento automático por IA ou preencha manualmente'}
              </p>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* SEÇÃO 1: FOTOS DO PRODUTO & AÇÕES INTELIGENTES                           */}
        {/* ========================================================================= */}
        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs relative overflow-hidden">
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

          {/* Grid: Coluna Foto (Capa) + Coluna de Ações Verticais e Miniaturas */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* Foto Principal / Preview */}
            <div className="md:col-span-5 flex flex-col items-center justify-center">
              {fazendoUploadFoto ? (
                <div className="w-full aspect-square max-w-[280px] rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 flex flex-col items-center justify-center p-6 text-center space-y-3 animate-pulse">
                  <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
                  <div>
                    <span className="font-bold text-xs text-emerald-800 dark:text-emerald-200 block">
                      {uploadStatusMsg || 'Comprimindo & Enviando...'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Salvando foto otimizada na nuvem
                    </span>
                  </div>
                </div>
              ) : fotoPrincipal ? (
                <div className="relative w-full aspect-square max-w-[280px] rounded-2xl overflow-hidden border-2 border-slate-300 dark:border-slate-700 bg-slate-950 shadow-xl group">
                  <img
                    src={fotoPrincipal}
                    alt="Foto do Produto"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition backdrop-blur-xs">
                    {fotosUrls.length < 7 && (
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="p-2.5 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 transition cursor-pointer"
                        title="Adicionar outra foto da galeria"
                      >
                        <Upload className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const restantes = fotosUrls.filter(f => f !== fotoPrincipal);
                        setFotosUrls(restantes);
                        setFotoPrincipal(restantes[0] || '');
                      }}
                      className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 transition cursor-pointer"
                      title="Remover foto"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full aspect-square max-w-[280px] rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-400 bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800/80 flex flex-col items-center justify-center p-6 text-center space-y-3 cursor-pointer transition group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition shadow-sm border border-emerald-300 dark:border-emerald-500/30">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-200 block">
                      Toque para Selecionar Foto
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      JPG, PNG ou WebP até 7 fotos
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Coluna de Ações Verticais e Miniaturas */}
            <div className="md:col-span-7 flex flex-col gap-2.5">
              {/* Botão Câmera (Mobile Only) */}
              <button
                type="button"
                disabled={fotosUrls.length >= 7}
                onClick={() => cameraInputRef.current?.click()}
                className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex md:hidden items-center justify-between gap-2 cursor-pointer shadow-xs bg-slate-800/80 text-slate-100 border-2 border-slate-400 hover:border-emerald-400 hover:text-white transition-all duration-150 disabled:opacity-40"
              >
                <div className="flex items-center gap-2 truncate">
                  <Camera className="w-4 h-4 text-slate-300 shrink-0" />
                  <span className="font-bold truncate">Tirar Foto</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  ({fotosUrls.length}/7)
                </span>
              </button>

              {/* 1. Chave Gemini IA */}
              <button
                type="button"
                onClick={async () => {
                  const k = getGeminiApiKey(loja) || (loja?.id ? await obterOuBuscarGeminiApiKey(loja) : '');
                  setTempApiKey(k);
                  setModalKeyGemini(true);
                }}
                className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer shadow-xs bg-slate-800/80 text-slate-100 border-2 border-slate-400 hover:border-emerald-400 hover:text-white transition-all duration-150 select-none group"
                title="Configurar Chave Google Gemini AI"
              >
                <div className="flex items-center gap-2 truncate">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-bold truncate">Chave Gemini IA</span>
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-emerald-300 font-normal shrink-0">
                  Configurar
                </span>
              </button>

              {/* 2. Atualizar o Produto com nossa IA */}
              <button
                type="button"
                disabled={analisandoIA}
                onClick={() => handleExecutarPreenchimentoIA('atualizar')}
                className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer shadow-xs bg-slate-800/80 text-slate-100 border-2 border-slate-400 hover:border-emerald-400 hover:text-white transition-all duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed group"
                title="Atualizar o produto com nossa inteligência artificial"
              >
                <div className="flex items-center gap-2 truncate">
                  {analisandoIA ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span className="font-bold truncate">Atualizar o Produto com nossa IA</span>
                </div>
              </button>

              {/* 3. Preencher com nossa IA (a partir da foto ou nome do produto) */}
              <button
                type="button"
                disabled={analisandoIA}
                onClick={() => handleExecutarPreenchimentoIA('preencher')}
                className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer shadow-xs bg-slate-800/80 text-slate-100 border-2 border-slate-400 hover:border-emerald-400 hover:text-white transition-all duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed group"
                title="Preencher com nossa IA (a partir da foto ou nome do produto)"
              >
                <div className="flex items-center gap-2 truncate">
                  {analisandoIA ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="font-bold truncate">Preencher com nossa IA</span>
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-emerald-300 font-normal shrink-0 hidden sm:inline">
                  (a partir da foto ou nome do produto)
                </span>
              </button>

              {/* 4. Galeria (Até 7 fotos) */}
              <button
                type="button"
                disabled={fotosUrls.length >= 7}
                onClick={() => galleryInputRef.current?.click()}
                className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer shadow-xs bg-slate-800/80 text-slate-100 border-2 border-slate-400 hover:border-emerald-400 hover:text-white transition-all duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed group"
                title="Escolher fotos do dispositivo"
              >
                <div className="flex items-center gap-2 truncate">
                  <Upload className="w-4 h-4 text-slate-300 shrink-0" />
                  <span className="font-bold truncate">Galeria (Até 7 fotos)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  ({fotosUrls.length}/7)
                </span>
              </button>

              {/* 5. Pesquisar Fotos na Internet */}
              <button
                type="button"
                disabled={fotosUrls.length >= 7}
                onClick={handleAbrirPesquisaFotos}
                className="w-full h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer shadow-xs bg-slate-800/80 text-slate-100 border-2 border-slate-400 hover:border-emerald-400 hover:text-white transition-all duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed group"
                title="Pesquisar fotos na internet com boa qualidade"
              >
                <div className="flex items-center gap-2 truncate">
                  <Globe className="w-4 h-4 text-slate-300 shrink-0" />
                  <span className="font-bold truncate">Pesquisar Fotos na Internet</span>
                </div>
              </button>

              {/* Miniaturas das Fotos Cadastradas e Botão + Foto */}
              {fotosUrls.length > 0 && (
                <div className="pt-2.5 mt-1 border-t border-slate-800 space-y-2">
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
                        onClick={() => galleryInputRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-500 dark:border-slate-600 dark:hover:border-emerald-400 bg-white hover:bg-slate-50 dark:bg-slate-800/40 dark:hover:bg-slate-800/60 flex flex-col items-center justify-center text-slate-500 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-300 font-medium transition cursor-pointer shadow-xs"
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
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            {/* Header da Seção com Toggle de Produto Ativo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span>2. Identificação do Produto</span>
              </h2>

              {/* Interruptor (Toggle Switch) Produto Ativo */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Produto:</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ativo}
                  onClick={() => setAtivo(!ativo)}
                  className="flex items-center gap-2.5 cursor-pointer select-none group"
                  title={ativo ? 'Clique para inativar o produto' : 'Clique para ativar o produto'}
                >
                  <span className={`text-xs font-bold transition ${ativo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    {ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  <div
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        ativo ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>
              </div>
            </div>

            {/* Compactação do Tipo do Item (Posicionado logo abaixo do toggle de ativo em linha única) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Tipo do Item *</label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Mercadoria física ou serviço / cobrança de taxa</span>
              </div>
              <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-950/70 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTipoItem('produto')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    tipoItem === 'produto'
                      ? 'bg-emerald-600 dark:bg-emerald-500 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Produto Físico</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTipoItem('servico');
                    setQuantidadeEstoque('0');
                    setEstoqueMinimoAlerta('0');
                    setTemVariacoes(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    tipoItem === 'servico'
                      ? 'bg-emerald-600 dark:bg-emerald-500 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Serviço / Taxa</span>
                </button>
              </div>
            </div>

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
                    onClick={() => handleNavegarParaAuxiliares('unidades')}
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
                    onClick={() => handleNavegarParaAuxiliares('fornecedores')}
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
                <Tag className="w-4 h-4 text-emerald-400" />
                <span>3. Tabelas de Preço & Custos</span>
              </h2>

              {/* BOTÃO RADAR DE PREÇOS NO LUGAR DO PERCENTUAL DE DESCONTO */}
              <button
                type="button"
                onClick={handleAbrirRadarPrecos}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-950 font-bold dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 dark:border-emerald-500/30 dark:text-emerald-300 text-xs transition shadow-xs cursor-pointer group"
                title="Comparar preços praticados por concorrentes e marketplaces na internet"
              >
                <Search className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 group-hover:scale-110 transition" />
                <span>Radar de Preços</span>
                <span className="text-[9px] bg-emerald-200 dark:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 px-1.5 py-0.2 rounded-full font-black">
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
          {tipoItem === 'servico' ? (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-3xl p-5 md:p-6 space-y-2 shadow-xl">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Wrench className="w-4 h-4" />
                <span>4. Controle de Estoque (Dispensado para Serviços / Taxas)</span>
              </div>
              <p className="text-xs text-slate-300">
                Itens do tipo Serviço / Taxa não movimentam saldo de estoque físico. Vendas são ilimitadas e não bloqueiam no PDV ou carrinho por falta de quantidade.
              </p>
            </div>
          ) : (
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
          )}

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

          {/* SEÇÃO 6: DIMENSÕES E PESO PARA FRETE (IA / CORREIOS / JADLOG) */}
          {tipoItem !== 'servico' && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    <span>6. Dimensões e Peso para Envio (Melhor Envio / Correios / Jadlog)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Preenchido automaticamente pela IA do HUBI. Usado para cotação exata de frete e emissão de etiquetas.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={detectandoDimensoes}
                  onClick={async () => {
                    if (!nome.trim() && !descricao.trim()) {
                      mostrarAviso('Por favor, informe o Nome ou Descrição do produto para que a IA possa estimar as medidas e o peso.', 'Identificação do Produto');
                      return;
                    }

                    setDetectandoDimensoes(true);
                    try {
                      const catNome = categorias.find(c => c.id === categoriaId)?.nome;
                      const res = await estimarDimensoesEPesoProduto(nome, descricao, catNome, loja);

                      if (res.peso_kg != null) setPesoKg(String(res.peso_kg));
                      if (res.altura_cm != null) setAlturaCm(String(res.altura_cm));
                      if (res.largura_cm != null) setLarguraCm(String(res.largura_cm));
                      if (res.comprimento_cm != null) setComprimentoCm(String(res.comprimento_cm));

                      mostrarSucesso('Medidas e peso de envio preenchidos com sucesso pela IA!');
                    } catch (err: any) {
                      console.error('Erro ao estimar medidas:', err);
                      setPesoKg(prev => prev || '0.35');
                      setAlturaCm(prev => prev || '4');
                      setLarguraCm(prev => prev || '12');
                      setComprimentoCm(prev => prev || '17');
                      mostrarSucesso('Medidas padrão de envio aplicadas com sucesso!');
                    } finally {
                      setDetectandoDimensoes(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-950 font-bold dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:border-emerald-700/60 dark:text-emerald-300 text-xs transition shadow-xs cursor-pointer self-start sm:self-auto group disabled:opacity-50"
                  title="Detectar ou estimar medidas e peso com inteligência artificial"
                >
                  {detectandoDimensoes ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 animate-spin shrink-0" />
                      <span>Estimando com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 group-hover:scale-110 transition shrink-0" />
                      <span>Auto-detectar com IA</span>
                      <span className="text-[9px] bg-emerald-200 dark:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 px-1.5 py-0.2 rounded-full font-black">
                        IA
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">Peso (kg)</label>
                    <span className="text-[10px] text-emerald-400 font-medium">Balança</span>
                  </div>
                  <input
                    type="number"
                    step="0.001"
                    min="0.01"
                    placeholder="Ex: 0.350"
                    value={pesoKg}
                    onChange={(e) => setPesoKg(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block">Ex: 0.500 para 500g</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Altura (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    placeholder="Ex: 10"
                    value={alturaCm}
                    onChange={(e) => setAlturaCm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block">Mínimo: 4 cm</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Largura (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    placeholder="Ex: 15"
                    value={larguraCm}
                    onChange={(e) => setLarguraCm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block">Mínimo: 10 cm</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Comprimento (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    placeholder="Ex: 20"
                    value={comprimentoCm}
                    onChange={(e) => setComprimentoCm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block">Mínimo: 15 cm</span>
                </div>
              </div>
            </div>
          )}

          {/* SEÇÃO 6: CATÁLOGO ONLINE E DESTAQUE */}
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>6. Visibilidade no Catálogo Online</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={exibirCatalogo}
                  onChange={(e) => setExibirCatalogo(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0"
                />
                <div>
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">Exibir no Catálogo Online</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Ficará visível para os clientes comprarem pelo link</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={destaque}
                  onChange={(e) => setDestaque(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-0"
                />
                <div>
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                    <span>Destacar Produto na Vitrine</span>
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Aparecerá no topo da página de vendas</span>
                </div>
              </label>
            </div>
          </div>

          {/* Botão Salvar Produto */}
          <button
            type="submit"
            disabled={salvando}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white border border-emerald-500 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm transition disabled:opacity-50 cursor-pointer"
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
              <div className="flex items-center gap-2.5 text-emerald-400">
                <Sparkles className="w-5 h-5 text-amber-400" />
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
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
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
                disabled={salvandoKeyGemini}
                onClick={async () => {
                  try {
                    setSalvandoKeyGemini(true);
                    await salvarGeminiApiKey(tempApiKey, loja?.id, loja);
                    if (loja && setLoja) {
                      const metaAtual = (loja as any).configuracoes_extras || {};
                      setLoja({
                        ...loja,
                        configuracoes_extras: {
                          ...metaAtual,
                          ia: {
                            ...(metaAtual.ia || {}),
                            gemini_api_key: tempApiKey.trim()
                          }
                        }
                      });
                    }
                    setModalKeyGemini(false);
                    setSucessoIAMsg(tempApiKey.trim() ? '✨ Chave do Google Gemini sincronizada e salva no banco de dados com sucesso!' : 'Chave removida.');
                  } catch (e: any) {
                    console.warn('Erro ao salvar chave do Gemini:', e);
                    alert('Erro ao salvar no banco. A chave foi mantida neste navegador.');
                  } finally {
                    setSalvandoKeyGemini(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white dark:font-semibold disabled:opacity-50 text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {salvandoKeyGemini ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  'Salvar Chave'
                )}
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
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white shadow-md">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-slate-100">
                      Radar de Preços de Mercado
                    </h3>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
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
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <SpinnerPesquisandoIA
                    texto="Pesquisando"
                    subtexto={`Pesquisando cotações de concorrentes para "${nome}"...`}
                  />
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
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 shadow-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                          Preço Médio de Mercado
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-2xl sm:text-3xl font-black text-white">
                            R$ {dadosMercado.precoMedio.toFixed(2)}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            (Baseado em {dadosMercado.totalPesquisados} lojas)
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAplicarPrecoMercado(dadosMercado.precoMedio)}
                        className="px-4 py-2.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white dark:font-semibold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                      >
                        <Zap className="w-4 h-4 fill-current" />
                        <span>Aplicar Preço Sugerido (R$ {Math.floor(dadosMercado.precoMedio).toFixed(2)})</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <TrendingDown className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          Menor: <b>R$ {dadosMercado.menorPreco.toFixed(2)}</b> ({dadosMercado.menoresPrecos[0]?.loja || 'Concorrente'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-300 font-semibold">
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
                      <div className="flex items-center justify-between text-xs font-bold text-slate-200 px-1">
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
                                <span className="font-black text-xs sm:text-sm text-slate-200 block">
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
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Search className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs">Nenhuma pesquisa realizada ainda.</p>
                  <button
                    type="button"
                    onClick={buscarConcorrentesMercado}
                    className="px-4 py-2 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white text-xs cursor-pointer"
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
                  className="px-4 py-1.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white text-xs transition cursor-pointer"
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

      {/* Modal Pesquisa de Fotos na Internet */}
      <ModalPesquisaFotosInternet
        isOpen={modalFotosInternetAberto}
        onClose={() => setModalFotosInternetAberto(false)}
        nomeInicial={nome}
        codigoBarrasInicial={codigoBarras}
        fotosAtuaisCount={fotosUrls.length}
        maxFotos={7}
        fotoReferencia={!nome.trim() ? (fotoPrincipal || fotosUrls[0]) : undefined}
        segmentoLoja={segmentoLoja}
        loja={loja}
        onAbrirConfiguracaoChave={() => setModalOnboardingSerpApiAberto(true)}
        onAdicionarFotos={(novas) => {
          setFotosUrls(prev => {
            const combinadas = [...prev];
            for (const n of novas) {
              if (!combinadas.includes(n) && combinadas.length < 7) {
                combinadas.push(n);
              }
            }
            return combinadas;
          });
          const primeira = !fotoPrincipal ? novas[0] : fotoPrincipal;
          if (!fotoPrincipal && novas[0]) {
            setFotoPrincipal(novas[0]);
          }
          // Pré-carrega no cache para que 'Preencher Ficha a partir da Foto' seja instantâneo (< 2s)
          if (primeira && !fotoBase64Cache.has(primeira)) {
            comprimirImagemParaIA(primeira)
              .then(res => {
                if (res.base64) {
                  fotoBase64Cache.set(primeira, `data:${res.mimeType};base64,${res.base64}`);
                }
              })
              .catch(() => {});
          }
        }}
      />

      {/* Modal Onboarding SerpApi (BYOK) */}
      <ModalOnboardingSerpApi
        isOpen={modalOnboardingSerpApiAberto}
        onClose={() => setModalOnboardingSerpApiAberto(false)}
        loja={loja}
        onChaveSalvaComSucesso={(novaChave) => {
          if (loja) {
            setLoja({
              ...loja,
              serpapi_key: novaChave
            });
          }
          setModalFotosInternetAberto(true);
        }}
      />

      {/* Modal de Dúvida / Seleção de Produto pela IA */}
      <ModalDuvidaProdutoIA
        isOpen={modalDuvidaAberto}
        onClose={() => setModalDuvidaAberto(false)}
        opcoes={opcoesDuvidaIA}
        fotoUrl={fotoPrincipal || fotosUrls[0]}
        loja={loja}
        onSelecionarOpcao={(opcaoEscolhida) => {
          aplicarDadosSugeridosIA(opcaoEscolhida);
          setSucessoIAMsg(`✨ Produto preenchido com base na opção selecionada: "${opcaoEscolhida.nome}"!`);
        }}
      />

      {/* Overlay com Spinner circular e "Pesquisando" centralizado durante operações de IA */}
      {analisandoIA && (
        <SpinnerPesquisandoIA
          fullScreen
          texto="Pesquisando"
          subtexto="Processando com Inteligência Artificial..."
        />
      )}
    </div>
  );
};
