<<<<<<< HEAD
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Sliders,
  Share2,
  Copy,
  Trash2,
  X,
  Check,
  CheckCircle2,
  Sparkles,
  Camera,
  Upload,
  Globe,
  Store,
  Volume2,
  VolumeX,
  Flashlight,
  FlashlightOff,
  HelpCircle,
  Loader2,
  AlertCircle,
  ShoppingCart,
  ShoppingBag,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  ArrowDown,
  ArrowUp,
  QrCode,
  Tag,
  Mic,
  MicOff,
  Image as ImageIcon,
  FileText,
  Barcode,
  RefreshCw,
  Key
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Produto, Categoria, VariacaoProduto, TipoUnidade } from '../types';
import { audioService } from '../services/audioService';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import {
  identificarProdutoPorFoto,
  identificarProdutoPorTextoOuEan,
  gerarDescricaoExclusivaIA,
  getGeminiApiKey,
  setGeminiApiKey
} from '../services/geminiService';

interface ProdutosMobileProps {
  produtos: Produto[];
  categorias: Categoria[];
  carregando: boolean;
  onRecarregar: () => Promise<void>;
}

// 9 Cores da Etiqueta / Tarja (TELA013)
const CORES_ETIQUETA = [
  '#FBBF24', // Amarelo Dourado
  '#F97316', // Laranja
  '#EF4444', // Vermelho Coral
  '#EC4899', // Rosa Pink
  '#60A5FA', // Azul Claro
  '#1E3A8A', // Azul Marinho
  '#475569', // Cinza Chumbo
  '#1F2937', // Preto / Grafite
  '#84CC16'  // Verde Limão
];

// Utilitário de compressão segura via HTML5 Canvas (evita OOM no Android)
const comprimirArquivoImagem = (file: File, maxDim = 1024, quality = 0.82): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve('');
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        resolve('');
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        let { width, height } = img;
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
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
};

export const ProdutosMobile: React.FC<ProdutosMobileProps> = ({
  produtos,
  categorias,
  carregando,
  onRecarregar
}) => {
  const navigate = useNavigate();
  const { loja, usuario, desconectarPdv } = useAuth();
  const permissions = usePermissions();

  // =========================================================================
  // ESTADOS DE TELA E NAVEGAÇÃO
  // =========================================================================
  const [telaAtiva, setTelaAtiva] = useState<'lista' | 'novo' | 'detalhes' | 'filtros' | 'movimentacoes' | 'variacoes'>('lista');
  const [abaLista, setAbaLista] = useState<'itens' | 'estoque'>('itens'); // TELA001 vs TELA002
  const [abaFormulario, setAbaFormulario] = useState<'cadastro' | 'estoque'>('cadastro'); // TELA008 vs TELA007

  // Modais & Subtelas
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);
  const [modalCatalogoAberto, setModalCatalogoAberto] = useState<boolean>(false); // TELA005
  const [modalClonarAberto, setModalClonarAberto] = useState<boolean>(false); // TELA010
  const [modalCorEtiquetaAberto, setModalCorEtiquetaAberto] = useState<boolean>(false); // TELA013
  const [corSelecionadaModal, setCorSelecionadaModal] = useState<string>('#1F2937');
  const [aplicarCorEmMassa, setAplicarCorEmMassa] = useState<boolean>(false);
  const [modalFotoFullscreen, setModalFotoFullscreen] = useState<string | null>(null); // TELA014
  const [modalOpcoesFotoAberto, setModalOpcoesFotoAberto] = useState<boolean>(false); // Opções de Foto (Câmera / Galeria / Gerenciar)
  const [modalGaleriaFotosAberto, setModalGaleriaFotosAberto] = useState<boolean>(false); // TELA015
  const [modalCategoriasAberto, setModalCategoriasAberto] = useState<boolean>(false); // TELA016
  const [modalDescricaoAberto, setModalDescricaoAberto] = useState<boolean>(false); // TELA017
  const [modalScannerAberto, setModalScannerAberto] = useState<boolean>(false); // TELA018
  const [modalVenderPorAberto, setModalVenderPorAberto] = useState<boolean>(false); // TELA019
  const [modalEstoqueMinimoAberto, setModalEstoqueMinimoAberto] = useState<boolean>(false); // TELA012
  const [modalPublicCardAberto, setModalPublicCardAberto] = useState<boolean>(false); // TELA009
  const [modalCriarComIAAberto, setModalCriarComIAAberto] = useState<boolean>(false); // Criar / Preencher com IA completo

  // =========================================================================
  // ESTADOS DE BUSCA E VOZ (PESQUISA POR VOZ)
  // =========================================================================
  const [busca, setBusca] = useState<string>('');
  const [buscaAtiva, setBuscaAtiva] = useState<boolean>(false); // TELA003
  const [ouvindoVoz, setOuvindoVoz] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const inputBuscaRef = useRef<HTMLInputElement>(null);

  // Filtros de Estoque (TELA006)
  const [filtroSemEstoque, setFiltroSemEstoque] = useState<boolean>(false);
  const [filtroMinimo, setFiltroMinimo] = useState<boolean>(false);
  const [filtroAcimaMinimo, setFiltroAcimaMinimo] = useState<boolean>(false);
  const [filtroSemControle, setFiltroSemControle] = useState<boolean>(false);
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([]);
  const [ordenacaoEstoque, setOrdenacaoEstoque] = useState<'menor_estoque' | 'maior_estoque' | 'a_z' | 'z_a'>('menor_estoque');

  // =========================================================================
  // ESTADO DO PRODUTO EM EDIÇÃO / CADASTRO
  // =========================================================================
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [formData, setFormData] = useState<{
    nome: string;
    precoVenda: string;
    precoPromocional: string;
    precoCusto: string;
    categoriaId: string;
    descricao: string;
    codigoBarras: string;
    tipoUnidade: TipoUnidade;
    destaque: boolean;
    exibirCatalogo: boolean;
    corEtiqueta: string; // Cor da tarja de descrição/valor
    fotos: string[];
    estoqueMinimo: number;
    gerenciarEstoque: boolean;
    quantidadeEstoque: number;
    variacoes: Partial<VariacaoProduto>[];
  }>({
    nome: '',
    precoVenda: '',
    precoPromocional: '',
    precoCusto: '',
    categoriaId: '',
    descricao: '',
    codigoBarras: '',
    tipoUnidade: 'un',
    destaque: false,
    exibirCatalogo: true,
    corEtiqueta: '#1F2937',
    fotos: [],
    estoqueMinimo: 0,
    gerenciarEstoque: true,
    quantidadeEstoque: 0,
    variacoes: []
  });

  const [opcionaisExpandido, setOpcionaisExpandido] = useState<boolean>(true);
  const [salvandoProduto, setSalvandoProduto] = useState<boolean>(false);
  const [processandoIA, setProcessandoIA] = useState<boolean>(false);
  const [mensagemFeedback, setMensagemFeedback] = useState<{ texto: string; tipo: 'sucesso' | 'erro' } | null>(null);

  // Estados de IA no Modal de Criação / Preenchimento
  const [abaModalIA, setAbaModalIA] = useState<'foto' | 'texto' | 'codigo'>('foto');
  const [promptTextoIA, setPromptTextoIA] = useState<string>('');
  const [promptCodigoIA, setPromptCodigoIA] = useState<string>('');
  const [modalKeyGemini, setModalKeyGemini] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>(getGeminiApiKey());

  // Estados para Teclado Numérico (TELA012)
  const [tecladoValorEstoqueMin, setTecladoValorEstoqueMin] = useState<string>('0');

  // Estados para Scanner de Câmera / Barcode (TELA018)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputGaleriaRef = useRef<HTMLInputElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [torchLigado, setTorchLigado] = useState<boolean>(false);
  const [somScannerMudo, setSomScannerMudo] = useState<boolean>(false);
  const [scannerErro, setScannerErro] = useState<string | null>(null);
  const animFrameScannerRef = useRef<number | null>(null);

  // Estados para Câmera In-App de Foto (Ultra-leve, sem abrir app externo que estoura RAM no Android)
  const [modalCameraFotoAberto, setModalCameraFotoAberto] = useState<boolean>(false);
  const [streamCameraFoto, setStreamCameraFoto] = useState<MediaStream | null>(null);
  const [cameraFotoFacingMode, setCameraFotoFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraFotoFlash, setCameraFotoFlash] = useState<boolean>(false);
  const [cameraFotoCarregando, setCameraFotoCarregando] = useState<boolean>(false);
  const [cameraFotoErro, setCameraFotoErro] = useState<string | null>(null);
  const [origemCameraParaIA, setOrigemCameraParaIA] = useState<boolean>(false);
  const [origemScannerParaIA, setOrigemScannerParaIA] = useState<boolean>(false);
  const videoFotoRef = useRef<HTMLVideoElement | null>(null);

  // Estados de IA para Descrição (TELA017)
  const [gerandoDescricaoIA, setGerandoDescricaoIA] = useState<boolean>(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState<string>('');
  const [criandoNovaCategoria, setCriandoNovaCategoria] = useState<boolean>(false);
  const [buscaCategoria, setBuscaCategoria] = useState<string>('');

  // =========================================================================
  // RECONHECIMENTO DE VOZ (PESQUISA POR VOZ GLOBAL MOBILE)
  // =========================================================================
  const alternarPesquisaPorVoz = (setTargetValue: (val: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Seu navegador não suporta pesquisa por voz. Use o teclado para digitar.');
      return;
    }

    if (ouvindoVoz) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setOuvindoVoz(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setOuvindoVoz(true);
        audioService.playBeep();
      };

      recognition.onresult = (event: any) => {
        const textoFalado = event.results?.[0]?.[0]?.transcript;
        if (textoFalado) {
          setTargetValue(textoFalado);
          audioService.playBeep();
          setMensagemFeedback({ texto: `Buscando por: "${textoFalado}"`, tipo: 'sucesso' });
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Erro no reconhecimento de voz:', event.error);
        setOuvindoVoz(false);
      };

      recognition.onend = () => {
        setOuvindoVoz(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Falha ao iniciar SpeechRecognition:', e);
      setOuvindoVoz(false);
    }
  };

  // =========================================================================
  // FUNÇÕES AUXILIARES DE CÁLCULO DE ESTOQUE
  // =========================================================================
  const getEstoqueReal = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0);
    }
    return Number(p.quantidade_estoque || 0);
  };

  const getValorVendaEstoque = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => {
        const preco = Number(v.preco_venda_varejo) || Number(p.preco_venda_varejo) || 0;
        return acc + Number(v.quantidade_estoque || 0) * preco;
      }, 0);
    }
    return Number(p.quantidade_estoque || 0) * Number(p.preco_venda_varejo || 0);
  };

  const getValorCustoEstoque = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => {
        const custo = Number(v.preco_custo) || Number(p.preco_custo) || 0;
        return acc + Number(v.quantidade_estoque || 0) * custo;
      }, 0);
    }
    return Number(p.quantidade_estoque || 0) * Number(p.preco_custo || 0);
  };

  // Totais do Estoque (para o card TELA002)
  const totalItensEstoque = useMemo(() => {
    return produtos.reduce((acc, p) => acc + getEstoqueReal(p), 0);
  }, [produtos]);

  const valorTotalEstoque = useMemo(() => {
    return produtos.reduce((acc, p) => acc + getValorVendaEstoque(p), 0);
  }, [produtos]);

  const valorCustoTotalEstoque = useMemo(() => {
    return produtos.reduce((acc, p) => acc + getValorCustoEstoque(p), 0);
  }, [produtos]);

  // Mapa de categorias
  const mapaCategorias = useMemo(() => {
    const m = new Map<string, string>();
    categorias.forEach(c => m.set(c.id, c.nome));
    return m;
  }, [categorias]);

  // =========================================================================
  // FILTRAGEM E ORDENAÇÃO DE PRODUTOS
  // =========================================================================
  const produtosFiltrados = useMemo(() => {
    let list = [...produtos];

    // Busca textual
    if (busca.trim()) {
      const q = busca.toLowerCase().trim();
      list = list.filter(p => {
        const nomeMatch = p.nome.toLowerCase().includes(q);
        const codBarrasMatch = p.codigo_barras?.toLowerCase().includes(q);
        const codInternoMatch = p.codigo_interno?.toLowerCase().includes(q);
        const catMatch = (p.categoria_id && mapaCategorias.get(p.categoria_id)?.toLowerCase().includes(q)) || false;
        return nomeMatch || codBarrasMatch || codInternoMatch || catMatch;
      });
    }

    // Filtros avançados na aba Estoque (TELA006)
    if (abaLista === 'estoque') {
      if (filtroSemEstoque || filtroMinimo || filtroAcimaMinimo || filtroSemControle) {
        list = list.filter(p => {
          const est = getEstoqueReal(p);
          const min = Number(p.estoque_minimo_alerta || 0);

          if (filtroSemEstoque && est <= 0) return true;
          if (filtroMinimo && est > 0 && est <= min) return true;
          if (filtroAcimaMinimo && est > min) return true;
          if (filtroSemControle && est === 0 && min === 0) return true;
          return false;
        });
      }

      if (categoriasFiltro.length > 0) {
        list = list.filter(p => p.categoria_id && categoriasFiltro.includes(p.categoria_id));
      }

      // Ordenação
      if (ordenacaoEstoque === 'menor_estoque') {
        list.sort((a, b) => getEstoqueReal(a) - getEstoqueReal(b));
      } else if (ordenacaoEstoque === 'maior_estoque') {
        list.sort((a, b) => getEstoqueReal(b) - getEstoqueReal(a));
      } else if (ordenacaoEstoque === 'a_z') {
        list.sort((a, b) => a.nome.localeCompare(b.nome));
      } else if (ordenacaoEstoque === 'z_a') {
        list.sort((a, b) => b.nome.localeCompare(a.nome));
      }
    }

    return list;
  }, [
    produtos,
    busca,
    abaLista,
    filtroSemEstoque,
    filtroMinimo,
    filtroAcimaMinimo,
    filtroSemControle,
    categoriasFiltro,
    ordenacaoEstoque,
    mapaCategorias
  ]);

  // Limpar feedback
  useEffect(() => {
    if (mensagemFeedback) {
      const timer = setTimeout(() => setMensagemFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [mensagemFeedback]);

  // =========================================================================
  // NAVEGAÇÃO E ABERTURA DE TELAS
  // =========================================================================
  const abrirNovoProduto = () => {
    setProdutoEditando(null);
    setFormData({
      nome: '',
      precoVenda: '',
      precoPromocional: '',
      precoCusto: '',
      categoriaId: '',
      descricao: '',
      codigoBarras: '',
      tipoUnidade: 'un',
      destaque: false,
      exibirCatalogo: true,
      corEtiqueta: '#1F2937',
      fotos: [],
      estoqueMinimo: 0,
      gerenciarEstoque: true,
      quantidadeEstoque: 0,
      variacoes: []
    });
    setAbaFormulario('cadastro');
    setTelaAtiva('novo');
  };

  // Helper para obter cor do produto salva na nuvem (Supabase) ou localmente
  const obterCorProduto = (p: Produto): string => {
    if (p.cor_etiqueta) return p.cor_etiqueta;
    if (loja?.configuracoes_extras?.cores_produtos?.[p.id]) {
      return loja.configuracoes_extras.cores_produtos[p.id];
    }
    if (loja?.configuracoes_extras?.cor_padrao_etiqueta_produtos) {
      return loja.configuracoes_extras.cor_padrao_etiqueta_produtos;
    }
    return localStorage.getItem(`hubi_cor_prod_${p.id}`) || localStorage.getItem('hubi_cor_padrao_loja') || '#1F2937';
  };

  // Helper para persistir a cor do produto no Supabase (em lojas.configuracoes_extras.cores_produtos e produtos.cor_etiqueta)
  const persistirCorProdutoSupabase = async (produtoId: string, cor: string) => {
    localStorage.setItem(`hubi_cor_prod_${produtoId}`, cor);

    if (!loja?.id) return;
    try {
      // 1. Salva no JSONB de configuracoes_extras da Loja no Supabase
      const coresAtuais = loja.configuracoes_extras?.cores_produtos || {};
      const novasCores = { ...coresAtuais, [produtoId]: cor };

      await supabase.from('lojas').update({
        configuracoes_extras: {
          ...loja.configuracoes_extras,
          cores_produtos: novasCores
        }
      }).eq('id', loja.id);

      // 2. Tenta também salvar na coluna direta caso o usuário já tenha criado no Supabase
      try {
        await supabase.from('produtos').update({ cor_etiqueta: cor }).eq('id', produtoId);
      } catch {
        // Coluna ainda não criada no SQL, ignorar silenciosamente pois já está salva no JSONB acima
      }
    } catch (e) {
      console.warn('Erro ao sincronizar cor no Supabase:', e);
    }
  };

  // Helper para aplicar a mesma cor para TODOS os produtos da loja no Supabase
  const aplicarCorEmMassaTodosProdutos = async (cor: string) => {
    if (!loja?.id) return;
    try {
      setSalvandoProduto(true);

      // 1. Atualiza a cor padrão da loja e o mapa de todos os produtos no Supabase (configuracoes_extras)
      const novosMapeamentos: { [id: string]: string } = {};
      produtos.forEach(p => {
        novosMapeamentos[p.id] = cor;
        localStorage.setItem(`hubi_cor_prod_${p.id}`, cor);
      });
      localStorage.setItem('hubi_cor_padrao_loja', cor);

      await supabase.from('lojas').update({
        configuracoes_extras: {
          ...loja.configuracoes_extras,
          cor_padrao_etiqueta_produtos: cor,
          cores_produtos: novosMapeamentos
        }
      }).eq('id', loja.id);

      // 2. Tenta também atualizar em lote a coluna cor_etiqueta na tabela produtos caso ela exista
      try {
        await supabase.from('produtos').update({ cor_etiqueta: cor }).eq('loja_id', loja.id);
      } catch {
        // Coluna SQL não existe, ignorar silenciosamente
      }

      setFormData(prev => ({ ...prev, corEtiqueta: cor }));
      setModalCorEtiquetaAberto(false);
      setMensagemFeedback({ texto: 'Cor da tarja aplicada a TODOS os produtos com sucesso!', tipo: 'sucesso' });
      await onRecarregar();
    } catch (err: any) {
      console.error('Erro ao aplicar cor em massa:', err);
      setMensagemFeedback({ texto: 'Erro ao aplicar cor a todos os produtos.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  const abrirEditarProduto = (p: Produto, aba: 'cadastro' | 'estoque' = 'cadastro') => {
    setProdutoEditando(p);
    const corSalva = obterCorProduto(p);
    setFormData({
      nome: p.nome || '',
      precoVenda: p.preco_venda_varejo !== undefined && p.preco_venda_varejo !== null ? String(p.preco_venda_varejo) : '',
      precoPromocional: p.preco_promocional ? String(p.preco_promocional) : '',
      precoCusto: p.preco_custo !== undefined && p.preco_custo !== null ? String(p.preco_custo) : '',
      categoriaId: p.categoria_id || '',
      descricao: p.descricao || '',
      codigoBarras: p.codigo_barras || '',
      tipoUnidade: p.tipo_unidade || 'un',
      destaque: Boolean(p.destaque),
      exibirCatalogo: p.exibir_catalogo !== false,
      corEtiqueta: corSalva,
      fotos: p.fotos_urls || [],
      estoqueMinimo: Number(p.estoque_minimo_alerta || 0),
      gerenciarEstoque: true,
      quantidadeEstoque: getEstoqueReal(p),
      variacoes: p.variacoes ? [...p.variacoes] : []
    });
    setAbaFormulario(aba);
    setTelaAtiva('detalhes');
  };

  // =========================================================================
  // SALVAMENTO / PERSISTÊNCIA NO SUPABASE
  // =========================================================================
  const salvarProduto = async () => {
    if (!loja?.id) return;
    if (!formData.nome.trim()) {
      setMensagemFeedback({ texto: 'Informe o nome do produto.', tipo: 'erro' });
      return;
    }

    try {
      setSalvandoProduto(true);

      const precoVendaNum = parseFloat(formData.precoVenda.replace(',', '.')) || 0;
      const precoPromoNum = formData.precoPromocional ? parseFloat(formData.precoPromocional.replace(',', '.')) : null;
      const precoCustoNum = formData.precoCusto ? parseFloat(formData.precoCusto.replace(',', '.')) : 0;

      const payload: Partial<Produto> = {
        loja_id: loja.id,
        nome: formData.nome.trim().toUpperCase(),
        categoria_id: formData.categoriaId || null,
        preco_venda_varejo: precoVendaNum,
        preco_promocional: precoPromoNum,
        promocao_ativa: Boolean(precoPromoNum && precoPromoNum > 0 && precoPromoNum < precoVendaNum),
        preco_custo: precoCustoNum,
        descricao: formData.descricao.trim() || null,
        codigo_barras: formData.codigoBarras.trim() || null,
        tipo_unidade: formData.tipoUnidade,
        destaque: formData.destaque,
        exibir_catalogo: formData.exibirCatalogo,
        fotos_urls: formData.fotos,
        estoque_minimo_alerta: formData.estoqueMinimo,
        quantidade_estoque: formData.quantidadeEstoque,
        cor_etiqueta: formData.corEtiqueta,
        ativo: true
      };

      if (produtoEditando?.id) {
        // Atualizar produto existente
        const { error } = await supabase
          .from('produtos')
          .update({
            ...payload,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', produtoEditando.id);

        if (error) throw error;
        await persistirCorProdutoSupabase(produtoEditando.id, formData.corEtiqueta);
        setMensagemFeedback({ texto: 'Produto atualizado com sucesso!', tipo: 'sucesso' });
      } else {
        // Criar novo produto
        const { data: prodCriado, error } = await supabase
          .from('produtos')
          .insert([{
            ...payload,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) throw error;
        if (prodCriado?.id) {
          await persistirCorProdutoSupabase(prodCriado.id, formData.corEtiqueta);
        }
        setMensagemFeedback({ texto: 'Produto cadastrado com sucesso!', tipo: 'sucesso' });
      }

      await onRecarregar();
      setTelaAtiva('lista');
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err);
      setMensagemFeedback({ texto: err.message || 'Erro ao salvar produto.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  // Excluir produto
  const handleExcluirProduto = async () => {
    if (!produtoEditando?.id) return;
    if (!confirm(`Deseja realmente excluir "${produtoEditando.nome}"?`)) return;

    try {
      setSalvandoProduto(true);
      const { error } = await supabase.from('produtos').delete().eq('id', produtoEditando.id);
      if (error) throw error;

      setMensagemFeedback({ texto: 'Produto excluído!', tipo: 'sucesso' });
      await onRecarregar();
      setTelaAtiva('lista');
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      setMensagemFeedback({ texto: 'Erro ao excluir produto.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  // Clonar produto (TELA010)
  const executarClonagem = async () => {
    if (!produtoEditando || !loja?.id) return;
    try {
      setSalvandoProduto(true);
      setModalClonarAberto(false);

      const novoProdutoPayload = {
        loja_id: loja.id,
        nome: `${produtoEditando.nome} - CÓPIA`,
        categoria_id: produtoEditando.categoria_id || null,
        preco_venda_varejo: produtoEditando.preco_venda_varejo,
        preco_promocional: produtoEditando.preco_promocional,
        promocao_ativa: produtoEditando.promocao_ativa,
        preco_custo: produtoEditando.preco_custo,
        descricao: produtoEditando.descricao,
        codigo_barras: null,
        tipo_unidade: produtoEditando.tipo_unidade,
        destaque: false,
        exibir_catalogo: produtoEditando.exibir_catalogo,
        fotos_urls: produtoEditando.fotos_urls || [],
        estoque_minimo_alerta: produtoEditando.estoque_minimo_alerta || 0,
        quantidade_estoque: 0,
        cor_etiqueta: formData.corEtiqueta || produtoEditando.cor_etiqueta || '#1F2937',
        ativo: true,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('produtos')
        .insert([novoProdutoPayload])
        .select()
        .single();

      if (error) throw error;
      if (data?.id) {
        await persistirCorProdutoSupabase(data.id, formData.corEtiqueta);
      }
      setMensagemFeedback({ texto: 'Produto clonado com sucesso!', tipo: 'sucesso' });
      await onRecarregar();
      if (data) {
        abrirEditarProduto(data as unknown as Produto);
      }
    } catch (err: any) {
      console.error('Erro ao clonar:', err);
      setMensagemFeedback({ texto: 'Erro ao clonar produto.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  // =========================================================================
  // LEITOR DE CÓDIGO DE BARRAS (TELA018)
  // =========================================================================
  const iniciarScannerCamera = async () => {
    try {
      setScannerErro(null);
      setModalScannerAberto(true);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      setStreamCamera(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        rodarDetectorFrame();
      }
    } catch (err: any) {
      console.warn('Erro ao acessar câmera:', err);
      setScannerErro('Não foi possível iniciar a câmera. Digite o código manualmente.');
    }
  };

  const encerrarScannerCamera = () => {
    if (animFrameScannerRef.current) {
      cancelAnimationFrame(animFrameScannerRef.current);
      animFrameScannerRef.current = null;
    }
    if (streamCamera) {
      streamCamera.getTracks().forEach(t => t.stop());
      setStreamCamera(null);
    }
    setTorchLigado(false);
    setModalScannerAberto(false);
  };

  const rodarDetectorFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    let detector: any = null;
    if ('BarcodeDetector' in window) {
      try {
        detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
        });
      } catch (e) {
        detector = null;
      }
    }

    const loop = async () => {
      if (!video || video.readyState < 2) {
        animFrameScannerRef.current = requestAnimationFrame(loop);
        return;
      }

      if (detector) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            if (raw) {
              if (!somScannerMudo) audioService.playBeep();
              if (origemScannerParaIA) {
                setOrigemScannerParaIA(false);
                setPromptCodigoIA(raw);
                encerrarScannerCamera();
                processarPreenchimentoIA('codigo', raw);
              } else {
                setFormData(prev => ({ ...prev, codigoBarras: raw }));
                encerrarScannerCamera();
              }
              return;
            }
          }
        } catch (err) {
          // Frame skip
        }
      }

      animFrameScannerRef.current = requestAnimationFrame(loop);
    };

    animFrameScannerRef.current = requestAnimationFrame(loop);
  };

  const alternarTorch = async () => {
    if (!streamCamera) return;
    try {
      const track = streamCamera.getVideoTracks()[0];
      const capabilities: any = track.getCapabilities?.() || {};
      if (capabilities.torch) {
        const novo = !torchLigado;
        await (track as any).applyConstraints({ advanced: [{ torch: novo }] });
        setTorchLigado(novo);
      }
    } catch (e) {
      console.warn('Torch não suportado:', e);
    }
  };

  // =========================================================================
  // MELHORAR DESCRIÇÃO COM IA (TELA017)
  // =========================================================================
  const melhorarDescricaoComIA = async () => {
    if (!getGeminiApiKey()) {
      setTempApiKey('');
      setModalKeyGemini(true);
      setMensagemFeedback({ texto: 'Configure sua Chave do Google Gemini para usar a IA.', tipo: 'erro' });
      return;
    }
    setGerandoDescricaoIA(true);
    try {
      const catNome = mapaCategorias.get(formData.categoriaId) || 'Geral';
      const novaDescricao = await gerarDescricaoExclusivaIA(
        formData.nome || 'PRODUTO',
        catNome,
        formData.descricao
      );
      setFormData(prev => ({ ...prev, descricao: novaDescricao }));
      setMensagemFeedback({ texto: 'Descrição exclusiva gerada com sucesso!', tipo: 'sucesso' });
    } catch (err) {
      console.warn('Erro ao gerar descrição com IA:', err);
    } finally {
      setGerandoDescricaoIA(false);
    }
  };

  // =========================================================================
  // PREENCHIMENTO AUTOMÁTICO VIA IA (FOTO, TEXTO, CÓDIGO DE BARRAS)
  // =========================================================================
  const processarPreenchimentoIA = async (tipo: 'foto' | 'texto' | 'codigo', valor?: string) => {
    if (!getGeminiApiKey()) {
      setTempApiKey('');
      setModalKeyGemini(true);
      setMensagemFeedback({ texto: 'Configure sua Chave do Google Gemini para usar a IA.', tipo: 'erro' });
      return;
    }
    try {
      setProcessandoIA(true);
      let sugestao: any = null;

      if (tipo === 'foto' && valor) {
        sugestao = await identificarProdutoPorFoto(valor);
      } else if (tipo === 'texto' && promptTextoIA.trim()) {
        sugestao = await identificarProdutoPorTextoOuEan('texto', promptTextoIA.trim());
      } else if (tipo === 'codigo' && (valor || promptCodigoIA.trim())) {
        const cod = valor || promptCodigoIA.trim();
        sugestao = await identificarProdutoPorTextoOuEan('barcode', cod);
      }

      if (sugestao) {
        // Localizar ou criar categoria compatível
        let categoriaMatchId = formData.categoriaId;
        if (sugestao.categoria_sugerida) {
          const achouCat = categorias.find(c =>
            c.nome.toLowerCase().includes(sugestao.categoria_sugerida.toLowerCase())
          );
          if (achouCat) categoriaMatchId = achouCat.id;
        }

        setFormData(prev => ({
          ...prev,
          nome: sugestao.nome ? sugestao.nome.toUpperCase() : prev.nome,
          categoriaId: categoriaMatchId || prev.categoriaId,
          precoVenda: sugestao.preco_venda_estimado ? String(sugestao.preco_venda_estimado).replace('.', ',') : prev.precoVenda,
          precoCusto: sugestao.preco_custo_estimado ? String(sugestao.preco_custo_estimado).replace('.', ',') : prev.precoCusto,
          descricao: sugestao.descricao || prev.descricao,
          codigoBarras: sugestao.codigo_barras || prev.codigoBarras,
          tipoUnidade: (sugestao.tipo_unidade as TipoUnidade) || prev.tipoUnidade,
          fotos: tipo === 'foto' && valor ? [valor, ...prev.fotos.filter((f: string) => f !== valor)].slice(0, 6) : prev.fotos
        }));

        setModalCriarComIAAberto(false);
        setMensagemFeedback({ texto: 'Dados e descrição preenchidos com sucesso pela IA!', tipo: 'sucesso' });
      }
    } catch (err: any) {
      console.warn('Erro ao processar IA:', err);
      setMensagemFeedback({ texto: err?.message || 'Não foi possível identificar todos os dados. Preencha manualmente.', tipo: 'erro' });
    } finally {
      setProcessandoIA(false);
    }
  };

  // Criar Categoria rápida (TELA016)
  const salvarNovaCategoria = async () => {
    if (!novaCategoriaNome.trim() || !loja?.id) return;
    try {
      setCriandoNovaCategoria(true);
      const { data, error } = await supabase
        .from('categorias')
        .insert([{
          loja_id: loja.id,
          nome: novaCategoriaNome.trim().toUpperCase(),
          ordem_exibicao: categorias.length + 1,
          ativo: true,
          criado_em: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      setNovaCategoriaNome('');
      await onRecarregar();
      if (data) {
        setFormData(prev => ({ ...prev, categoriaId: data.id }));
      }
      setModalCategoriasAberto(false);
    } catch (err: any) {
      console.error('Erro ao criar categoria:', err);
    } finally {
      setCriandoNovaCategoria(false);
    }
  };

  // =========================================================================
  // CÂMERA AO VIVO IN-APP DE FOTOS (SEM ESTOURAR MEMÓRIA NO ANDROID)
  // =========================================================================
  const iniciarCameraFoto = async (facingModeParam?: 'environment' | 'user') => {
    try {
      setCameraFotoCarregando(true);
      setCameraFotoErro(null);
      setModalOpcoesFotoAberto(false);
      setModalCameraFotoAberto(true);

      if (streamCameraFoto) {
        streamCameraFoto.getTracks().forEach(t => t.stop());
        setStreamCameraFoto(null);
      }

      const targetFacing = facingModeParam || cameraFotoFacingMode;
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      });

      setStreamCameraFoto(mediaStream);
      if (videoFotoRef.current) {
        videoFotoRef.current.srcObject = mediaStream;
        await videoFotoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Erro ao abrir câmera interna:', err);
      setCameraFotoErro('Não foi possível acessar a câmera diretamente. Tente selecionar da galeria.');
      // Fallback para input simples
      setTimeout(() => {
        fileInputGaleriaRef.current?.click();
      }, 500);
    } finally {
      setCameraFotoCarregando(false);
    }
  };

  const alternarCameraFoto = async () => {
    const novoFacing = cameraFotoFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFotoFacingMode(novoFacing);
    await iniciarCameraFoto(novoFacing);
  };

  const alternarFlashCameraFoto = async () => {
    if (!streamCameraFoto) return;
    const track = streamCameraFoto.getVideoTracks()[0];
    if (!track) return;
    try {
      const novoEstado = !cameraFotoFlash;
      await (track as any).applyConstraints({
        advanced: [{ torch: novoEstado }]
      });
      setCameraFotoFlash(novoEstado);
    } catch (err) {
      console.warn('Lanterna não suportada neste dispositivo', err);
    }
  };

  const capturarFotoCanvas = () => {
    const video = videoFotoRef.current;
    if (!video || video.readyState < 2) return;

    try {
      const maxDim = 1024;
      let width = video.videoWidth || 800;
      let height = video.videoHeight || 800;

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
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

      audioService.playBeep();
      encerrarCameraFoto();

      if (origemCameraParaIA) {
        setOrigemCameraParaIA(false);
        processarPreenchimentoIA('foto', dataUrl);
      } else {
        setFormData(prev => ({
          ...prev,
          fotos: [dataUrl, ...prev.fotos.filter(f => f !== dataUrl)].slice(0, 6)
        }));
        setMensagemFeedback({ texto: 'Foto capturada e otimizada com sucesso!', tipo: 'sucesso' });
      }
    } catch (e: any) {
      console.error('Erro ao capturar foto:', e);
      setMensagemFeedback({ texto: 'Erro ao capturar foto.', tipo: 'erro' });
    }
  };

  const encerrarCameraFoto = () => {
    if (streamCameraFoto) {
      streamCameraFoto.getTracks().forEach(t => t.stop());
      setStreamCameraFoto(null);
    }
    setCameraFotoFlash(false);
    setModalCameraFotoAberto(false);
  };

  // Upload / Captura de Foto com Compressão Automática no Cliente
  const handleProcessarArquivoFoto = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await comprimirArquivoImagem(file, 1024, 0.82);
      if (dataUrl) {
        setFormData(prev => ({
          ...prev,
          fotos: [dataUrl, ...prev.fotos.filter(f => f !== dataUrl)].slice(0, 6)
        }));
        setModalOpcoesFotoAberto(false);
        setMensagemFeedback({ texto: 'Foto adicionada e otimizada!', tipo: 'sucesso' });
      }
    } catch (e) {
      console.error('Erro ao processar arquivo de foto:', e);
      setMensagemFeedback({ texto: 'Erro ao carregar a foto.', tipo: 'erro' });
    }
  };

  // Compartilhar Catálogo / Produto (TELA005 / TELA009)
  const compartilharLink = (url: string, titulo: string, texto: string) => {
    if (navigator.share) {
      navigator.share({ title: titulo, text: texto, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setMensagemFeedback({ texto: 'Link copiado para a área de transferência!', tipo: 'sucesso' });
    }
  };

  const catalogUrl = `${window.location.origin}/catalog/${loja?.slug_catalogo || ''}`;

  // =========================================================================
  // RENDERIZAÇÃO DE TOAST
  // =========================================================================
  const renderToast = () => {
    if (!mensagemFeedback) return null;
    return (
      <div className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-extrabold animate-in fade-in slide-in-from-top-3 ${
        mensagemFeedback.tipo === 'sucesso' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
      }`}>
        {mensagemFeedback.tipo === 'sucesso' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
        <span className="flex-1 leading-snug">{mensagemFeedback.texto}</span>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // TELA 014: VISUALIZADOR DE FOTO EM TELA CHEIA
  // -------------------------------------------------------------------------
  if (modalFotoFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between items-center p-4 select-none">
        <div className="w-full flex justify-end">
          <button
            type="button"
            onClick={() => setModalFotoFullscreen(null)}
            className="p-3 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center w-full max-h-[85vh]">
          <img
            src={modalFotoFullscreen}
            alt="Foto do Produto"
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
          />
        </div>
        <div className="h-10" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 018: LEITOR DE CÓDIGO DE BARRAS (CÂMERA)
  // -------------------------------------------------------------------------
  if (modalScannerAberto) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col text-white select-none">
        {/* Header TELA018 */}
        <div className="h-16 border-b border-slate-800 px-4 flex items-center justify-between bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={encerrarScannerCamera}
            className="p-2 text-slate-300 hover:text-white"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-extrabold text-sm sm:text-base text-slate-100">Cadastrar código de barras</h2>
          <button
            type="button"
            onClick={() => setSomScannerMudo(!somScannerMudo)}
            className="p-2 text-slate-300 hover:text-white"
          >
            {somScannerMudo ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Viewfinder Câmera */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Linha Guia Vermelha */}
          <div className="absolute inset-x-8 h-0.5 bg-rose-500 shadow-lg shadow-rose-500/50 pointer-events-none" />

          {/* Botão Lanterna (Torch) */}
          <button
            type="button"
            onClick={alternarTorch}
            className="absolute top-4 right-4 px-3.5 py-2 rounded-full bg-slate-900/80 text-slate-200 text-xs font-bold flex items-center gap-2 backdrop-blur border border-slate-700/50 shadow-lg"
          >
            {torchLigado ? <Flashlight className="w-4 h-4 text-amber-400" /> : <FlashlightOff className="w-4 h-4" />}
            <span>{torchLigado ? 'Torch On' : 'Torch Off'}</span>
          </button>
        </div>

        {/* Rodapé TELA018 */}
        <div className="p-6 bg-slate-900 flex flex-col items-center justify-center space-y-4 shrink-0 text-center">
          <p className="text-xs sm:text-sm text-slate-300 font-semibold max-w-xs leading-relaxed">
            Posicione o código de barras do produto na linha vermelha para cadastrá-lo
          </p>

          {scannerErro && (
            <p className="text-xs text-rose-400 font-bold">{scannerErro}</p>
          )}

          <div className="w-full max-w-xs flex gap-2">
            <input
              type="text"
              value={formData.codigoBarras}
              onChange={(e) => setFormData(prev => ({ ...prev, codigoBarras: e.target.value }))}
              placeholder="Ou digite o código aqui..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 font-medium"
            />
            <button
              type="button"
              onClick={encerrarScannerCamera}
              className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-sm font-extrabold shadow-md"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 006: FILTROS DE ESTOQUE
  // -------------------------------------------------------------------------
  if (telaAtiva === 'filtros') {
    return (
      <div className="fixed inset-0 z-40 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA006 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTelaAtiva('lista')}
              className="p-2 text-slate-600 hover:text-slate-900"
            >
              <X className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800">Filtros</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setFiltroSemEstoque(false);
              setFiltroMinimo(false);
              setFiltroAcimaMinimo(false);
              setFiltroSemControle(false);
              setCategoriasFiltro([]);
              setOrdenacaoEstoque('menor_estoque');
            }}
            className="text-xs sm:text-sm font-extrabold text-teal-600 hover:text-teal-700 px-2 py-1"
          >
            Limpar
          </button>
        </div>

        {/* Conteúdo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Seção Estoque */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wider">Estoque</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroSemEstoque}
                  onChange={(e) => setFiltroSemEstoque(e.target.checked)}
                  className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold flex items-center gap-1.5">
                  Sem estoque <span className="text-rose-500 font-bold">🔴</span>
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroMinimo}
                  onChange={(e) => setFiltroMinimo(e.target.checked)}
                  className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold flex items-center gap-1.5">
                  Mínimo <span className="text-amber-500 font-bold">🟡</span>
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroAcimaMinimo}
                  onChange={(e) => setFiltroAcimaMinimo(e.target.checked)}
                  className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold">Acima do mínimo</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroSemControle}
                  onChange={(e) => setFiltroSemControle(e.target.checked)}
                  className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold">Sem controle de estoque</span>
              </label>
            </div>
          </div>

          {/* Seção Categorias */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wider">Categorias</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {categorias.map((cat) => {
                const checked = categoriasFiltro.includes(cat.id);
                return (
                  <label key={cat.id} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCategoriasFiltro(prev => [...prev, cat.id]);
                        } else {
                          setCategoriasFiltro(prev => prev.filter(id => id !== cat.id));
                        }
                      }}
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-semibold uppercase truncate">{cat.nome}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Seção Ordenar Por */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wider">Ordenar por</h2>
            <div className="grid grid-cols-2 gap-2 border border-slate-200 rounded-2xl p-1 bg-slate-50">
              <button
                type="button"
                onClick={() => setOrdenacaoEstoque('menor_estoque')}
                className={`py-3.5 px-2 text-xs sm:text-sm font-bold rounded-xl text-center transition ${
                  ordenacaoEstoque === 'menor_estoque' ? 'text-teal-600 bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Menor estoque
              </button>

              <button
                type="button"
                onClick={() => setOrdenacaoEstoque('a_z')}
                className={`py-3.5 px-2 text-xs sm:text-sm font-bold rounded-xl text-center transition ${
                  ordenacaoEstoque === 'a_z' ? 'text-teal-600 bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                A-Z
              </button>

              <button
                type="button"
                onClick={() => setOrdenacaoEstoque('maior_estoque')}
                className={`py-3.5 px-2 text-xs sm:text-sm font-bold rounded-xl text-center transition ${
                  ordenacaoEstoque === 'maior_estoque' ? 'text-teal-600 bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Maior estoque
              </button>

              <button
                type="button"
                onClick={() => setOrdenacaoEstoque('z_a')}
                className={`py-3.5 px-2 text-xs sm:text-sm font-bold rounded-xl text-center transition ${
                  ordenacaoEstoque === 'z_a' ? 'text-teal-600 bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Z-A
              </button>
            </div>
          </div>
        </div>

        {/* Botão Filtrar TELA006 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('lista')}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
          >
            Filtrar
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 011: HISTÓRICO DE MOVIMENTAÇÕES DE ESTOQUE
  // -------------------------------------------------------------------------
  if (telaAtiva === 'movimentacoes') {
    return (
      <div className="fixed inset-0 z-40 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA011 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('detalhes')}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-sm sm:text-base text-slate-800">Movimentações</h1>
          <button
            type="button"
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>

        {/* Banner do Produto TELA011 */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
              {formData.fotos[0] ? (
                <img src={formData.fotos[0]} alt="Thumb" className="w-full h-full object-cover" />
              ) : (
                <Tag className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <span className="font-extrabold text-xs sm:text-sm text-slate-800 uppercase max-w-[200px] line-clamp-2">
              {formData.nome || 'PRODUTO'}
            </span>
          </div>
          <span className={`font-black text-base sm:text-lg ${formData.quantidadeEstoque < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
            {formData.quantidadeEstoque}
          </span>
        </div>

        {/* Lista de Movimentações */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {[
            { id: 1, tipo: 'venda', qtd: 4, seq: '#6', data: '20/8/2026 15:55', canal: 'catalog', saldo: formData.quantidadeEstoque },
            { id: 2, tipo: 'venda', qtd: 2, seq: '#5', data: '20/8/2026 15:53', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: formData.quantidadeEstoque + 4 },
            { id: 3, tipo: 'venda', qtd: 1, seq: '#4', data: '20/8/2026 15:49', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: formData.quantidadeEstoque + 6 },
            { id: 4, tipo: 'venda', qtd: 30, seq: '#3', data: '20/8/2026 15:39', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: formData.quantidadeEstoque + 7 },
            { id: 5, tipo: 'saida', qtd: 0, seq: '#2', data: '18/8/2026 19:26', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: 0 },
            { id: 6, tipo: 'entrada', qtd: 0, seq: '#1', data: '18/8/2026 19:26', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: 0 }
          ].map((mov) => (
            <div key={mov.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${mov.tipo === 'entrada' ? 'text-teal-600 bg-teal-50' : 'text-rose-600 bg-rose-50'}`}>
                  {mov.tipo === 'entrada' ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 capitalize">
                    {mov.tipo}: {mov.qtd}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {mov.seq} - {mov.data} - {mov.canal}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[11px] text-slate-400 uppercase font-bold">Saldo</p>
                <p className={`font-black text-sm sm:text-base ${mov.saldo < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {mov.saldo}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 020: PRODUTOS COM VARIAÇÕES
  // -------------------------------------------------------------------------
  if (telaAtiva === 'variacoes') {
    return (
      <div className="fixed inset-0 z-40 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA020 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('detalhes')}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-sm sm:text-base text-slate-800">Variações</h1>
          <button
            type="button"
            onClick={() => alert('Use variações para cadastrar produtos com múltiplos atributos como cor, tamanho, voltagem ou sabor.')}
            className="p-2 text-slate-400 hover:text-slate-700"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Ilustração e Descrição TELA020 */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center space-y-6">
          <div className="w-52 h-40 border border-slate-200 rounded-3xl bg-slate-50 flex flex-col items-center justify-center p-4 relative shadow-sm">
            <div className="flex gap-2.5 items-center">
              <div className="w-11 h-11 rounded-xl bg-teal-500 flex items-center justify-center text-white font-black text-sm">P</div>
              <div className="w-11 h-11 rounded-xl bg-slate-200 flex items-center justify-center text-slate-700 font-black text-sm">M</div>
              <div className="w-11 h-11 rounded-xl bg-slate-700 flex items-center justify-center text-white font-black text-sm">G</div>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase mt-3">Camiseta / Variações</span>
          </div>

          <div className="space-y-2 max-w-xs">
            <h2 className="font-extrabold text-base sm:text-lg text-slate-800">Produtos com variações</h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Adicione variações como <strong className="text-slate-700">cor, tamanho, voltagem ou sabor</strong> aos seus produtos, mantenha seu estoque organizado e facilite as vendas
            </p>
          </div>

          <div className="w-full space-y-3 pt-2">
            <button
              type="button"
              onClick={() => {
                const nova = { valor_variacao_1: 'Tamanho P', quantidade_estoque: 0, preco_venda_varejo: parseFloat(formData.precoVenda) || 0 };
                setFormData(prev => ({ ...prev, variacoes: [...prev.variacoes, nova] }));
                setMensagemFeedback({ texto: 'Variação adicionada!', tipo: 'sucesso' });
              }}
              className="w-full p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <span>Adicionar variação</span>
              <div className="w-8 h-8 rounded-xl bg-teal-500 text-white flex items-center justify-center font-bold">
                <Plus className="w-5 h-5" />
              </div>
            </button>
          </div>
        </div>

        {/* Botão Voltar TELA020 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('detalhes')}
            className="w-full py-4 rounded-2xl border border-teal-500 text-teal-600 font-extrabold text-sm sm:text-base hover:bg-teal-50 transition cursor-pointer"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 016: SELETOR DE CATEGORIAS
  // -------------------------------------------------------------------------
  if (modalCategoriasAberto) {
    const categoriasFiltradasModal = categorias.filter(c =>
      c.nome.toLowerCase().includes(buscaCategoria.toLowerCase().trim())
    );

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA016 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalCategoriasAberto(false)}
              className="p-2 text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800">
              Categorias ({categorias.length})
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              const nome = prompt('Nome da nova categoria:');
              if (nome && nome.trim()) {
                setNovaCategoriaNome(nome);
                salvarNovaCategoria();
              }
            }}
            className="p-2 text-teal-600 hover:text-teal-700 font-extrabold"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* Campo de Busca TELA016 com Pesquisa por Voz */}
        <div className="p-3 border-b border-slate-100 bg-white shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input
              type="text"
              value={buscaCategoria}
              onChange={(e) => setBuscaCategoria(e.target.value)}
              placeholder="Buscar categoria ou falar..."
              className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 font-medium"
            />
            <button
              type="button"
              onClick={() => alternarPesquisaPorVoz(setBuscaCategoria)}
              className={`absolute right-2.5 p-1.5 rounded-lg transition ${
                ouvindoVoz ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Pesquisar por voz"
            >
              {ouvindoVoz ? <Mic className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Lista de Categorias TELA016 */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => {
              setFormData(prev => ({ ...prev, categoriaId: '' }));
              setModalCategoriasAberto(false);
            }}
            className="w-full px-4 py-4 text-left text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50 transition flex items-center justify-between"
          >
            <span>Sem Categoria</span>
            {!formData.categoriaId && <Check className="w-5 h-5 text-teal-600" />}
          </button>

          {categoriasFiltradasModal.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setFormData(prev => ({ ...prev, categoriaId: cat.id }));
                setModalCategoriasAberto(false);
              }}
              className="w-full px-4 py-4 text-left text-xs sm:text-sm font-bold text-slate-800 uppercase hover:bg-slate-50 transition flex items-center justify-between"
            >
              <span>{cat.nome}</span>
              {formData.categoriaId === cat.id && <Check className="w-5 h-5 text-teal-600" />}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 017: EDITOR DE DESCRIÇÃO COM IA EXCLUSIVA
  // -------------------------------------------------------------------------
  if (modalDescricaoAberto) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA017 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalDescricaoAberto(false)}
              className="p-2 text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800">Descrição Comercial</h1>
          </div>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, descricao: '' }))}
            className="text-xs sm:text-sm font-extrabold text-teal-600 hover:text-teal-700 px-2 py-1"
          >
            Limpar
          </button>
        </div>

        {/* Conteúdo TELA017 */}
        <div className="flex-1 p-4 flex flex-col justify-between overflow-y-auto space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Texto da Descrição
            </label>
            <textarea
              rows={9}
              value={formData.descricao}
              onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
              placeholder="Digite os detalhes do produto, benefícios, modo de uso ou deixe a IA criar uma descrição exclusiva para você..."
              className="w-full p-4 border-2 border-teal-500/80 text-xs sm:text-sm font-medium uppercase leading-relaxed text-slate-800 focus:outline-none bg-slate-50/60 rounded-2xl resize-none shadow-sm"
            />
          </div>

          {/* Card IA Inferior */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-indigo-50 border border-teal-200/60 shadow-sm">
              <div className="text-left">
                <p className="text-xs sm:text-sm font-black text-slate-800">Melhorar com Inteligência Artificial</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Gera um texto exclusivo, detalhado e persuasivo</p>
              </div>
              <button
                type="button"
                disabled={gerandoDescricaoIA}
                onClick={melhorarDescricaoComIA}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 hover:bg-slate-800 transition shadow-md cursor-pointer disabled:opacity-50 shrink-0 ml-2"
              >
                {gerandoDescricaoIA ? (
                  <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-teal-400" />
                )}
                <span>{gerandoDescricaoIA ? 'Gerando...' : 'Melhorar IA'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Botão Salvar TELA017 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setModalDescricaoAberto(false)}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
          >
            Salvar Descrição
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 015: GESTÃO DE FOTOS (GRADE DE SLOTS)
  // -------------------------------------------------------------------------
  if (modalGaleriaFotosAberto) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA015 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center gap-3 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setModalGaleriaFotosAberto(false)}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-base sm:text-lg text-slate-800">Galeria de Fotos</h1>
        </div>

        {/* Conteúdo com Foto Principal e Grade de Slots */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col items-center">
          {/* Foto Principal */}
          {formData.fotos[0] ? (
            <div className="relative w-64 h-64 border border-slate-200 rounded-3xl overflow-hidden shadow-md flex items-center justify-center bg-slate-50">
              <img src={formData.fotos[0]} alt="Principal" className="w-full h-full object-contain" />
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, fotos: prev.fotos.slice(1) }))}
                className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/80 text-white hover:bg-rose-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="w-64 h-64 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 bg-slate-50">
              <Camera className="w-12 h-12 mb-2 text-slate-300" />
              <span className="text-xs sm:text-sm font-bold">Nenhuma foto adicionada</span>
            </div>
          )}

          {/* Grade 2x3 de Slots */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {/* Slot 1: Botão Adicionar */}
            <label className="h-24 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/50 flex flex-col items-center justify-center text-teal-600 hover:bg-teal-50 transition cursor-pointer">
              <Plus className="w-6 h-6 mb-0.5" />
              <span className="text-[10px] font-bold uppercase">Adicionar</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleProcessarArquivoFoto(e.target.files?.[0])}
                className="hidden"
              />
            </label>

            {/* Slots 2 a 6 */}
            {[1, 2, 3, 4, 5].map((idx) => {
              const foto = formData.fotos[idx];
              if (foto) {
                return (
                  <div key={idx} className="relative h-24 rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 shadow-sm">
                    <img src={foto} alt={`Foto ${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }))}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/80 text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }
              return (
                <div key={idx} className="h-24 rounded-2xl border border-slate-100 bg-slate-50/60" />
              );
            })}
          </div>
        </div>

        {/* Botão Salvar TELA015 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setModalGaleriaFotosAberto(false)}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
          >
            Concluir Fotos
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 012: TECLADO NUMÉRICO - ESTOQUE MÍNIMO
  // -------------------------------------------------------------------------
  if (modalEstoqueMinimoAberto) {
    const handleDigitoTeclado = (val: string) => {
      if (val === 'backspace') {
        setTecladoValorEstoqueMin(prev => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      } else {
        setTecladoValorEstoqueMin(prev => (prev === '0' ? val : prev + val));
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA012 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center gap-3 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setModalEstoqueMinimoAberto(false)}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-base sm:text-lg text-slate-800">Estoque mínimo</h1>
        </div>

        {/* Visor Grande TELA012 */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="border-b-4 border-slate-900 px-10 py-3 mb-8">
            <span className="font-light text-7xl sm:text-8xl text-slate-900 tracking-tight">{tecladoValorEstoqueMin}</span>
          </div>
        </div>

        {/* Teclado Numérico Virtual TELA012 */}
        <div className="border-t border-slate-100 bg-white grid grid-cols-3 divide-x divide-y divide-slate-100 text-center">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigitoTeclado(num)}
              className="py-6 text-2xl font-bold text-slate-800 active:bg-slate-100"
            >
              {num}
            </button>
          ))}
          <div className="py-6" />
          <button
            type="button"
            onClick={() => handleDigitoTeclado('0')}
            className="py-6 text-2xl font-bold text-slate-800 active:bg-slate-100"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleDigitoTeclado('backspace')}
            className="py-6 flex items-center justify-center text-slate-700 active:bg-slate-100"
          >
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* Botão OK TELA012 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => {
              const val = parseInt(tecladoValorEstoqueMin, 10) || 0;
              setFormData(prev => ({ ...prev, estoqueMinimo: val }));
              setModalEstoqueMinimoAberto(false);
            }}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 009: CARD PÚBLICO DO PRODUTO (COMPARTILHAR)
  // -------------------------------------------------------------------------
  if (modalPublicCardAberto) {
    const precoVendaFmt = parseFloat(formData.precoVenda || '0').toFixed(2).replace('.', ',');
    const precoPromoFmt = formData.precoPromocional ? parseFloat(formData.precoPromocional).toFixed(2).replace('.', ',') : null;

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Botão Fechar TELA009 */}
        <div className="p-4 flex justify-start">
          <button
            type="button"
            onClick={() => setModalPublicCardAberto(false)}
            className="p-2 text-slate-700 hover:text-slate-900"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Conteúdo Visual TELA009 */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          <div className="w-full h-72 rounded-3xl border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center shadow-inner">
            {formData.fotos[0] ? (
              <img src={formData.fotos[0]} alt="Produto" className="max-w-full max-h-full object-contain" />
            ) : (
              <Tag className="w-16 h-16 text-slate-300" />
            )}
          </div>

          <div className="space-y-1">
            <h1 className="font-black text-lg sm:text-xl text-slate-900 uppercase">
              {formData.nome || 'NOME DO PRODUTO'}
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {mapaCategorias.get(formData.categoriaId) || 'SEM CATEGORIA'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-teal-600">
                R$ {precoPromoFmt || precoVendaFmt}
              </span>
              {precoPromoFmt && (
                <span className="text-xs text-slate-400 line-through">
                  R$ {precoVendaFmt}
                </span>
              )}
            </div>
            {formData.codigoBarras && (
              <span className="text-xs text-slate-400 font-semibold">
                COD. {formData.codigoBarras}
              </span>
            )}
          </div>

          {formData.descricao && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed uppercase pt-2">
              {formData.descricao}
            </p>
          )}
        </div>

        {/* Botão Compartilhar TELA009 */}
        <div className="p-4 border-t border-slate-200 bg-slate-900 text-white shrink-0">
          <button
            type="button"
            onClick={() => {
              compartilharLink(
                `${catalogUrl}?p=${produtoEditando?.id || ''}`,
                formData.nome,
                `Confira ${formData.nome} por apenas R$ ${precoPromoFmt || precoVendaFmt} no nosso catálogo!`
              );
            }}
            className="w-full py-3.5 flex items-center justify-center gap-2 text-sm sm:text-base font-extrabold text-slate-200 hover:text-white"
          >
            <Share2 className="w-5 h-5" />
            <span>Compartilhar Produto</span>
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 004 / 007 / 008 / 008A: NOVO / EDIÇÃO / DETALHES DO PRODUTO
  // -------------------------------------------------------------------------
  if (telaAtiva === 'novo' || telaAtiva === 'detalhes') {
    const isNovo = telaAtiva === 'novo';
    const precoVendaFmt = parseFloat(formData.precoVenda || '0').toFixed(2).replace('.', ',');
    const precoPromoFmt = formData.precoPromocional ? parseFloat(formData.precoPromocional).toFixed(2).replace('.', ',') : null;

    // Resumo da descrição para a tarja inferior (estimativa de aproximadamente 20 caracteres)
    const textoTarjaResumo = (formData.nome || 'PRODUTO').slice(0, 22).toUpperCase();

    return (
      <div className="flex flex-col h-full bg-white text-slate-900 overflow-hidden select-none">
        {renderToast()}

        {/* Inputs de arquivo ocultos para Captura de Câmera e Galeria */}
        <input
          ref={fileInputCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleProcessarArquivoFoto(e.target.files?.[0])}
          className="hidden"
        />
        <input
          ref={fileInputGaleriaRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleProcessarArquivoFoto(e.target.files?.[0])}
          className="hidden"
        />

        {/* Header Superior (TELA004 / TELA007 / TELA008) */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTelaAtiva('lista')}
              className="p-1 text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-sm sm:text-base text-slate-800 truncate max-w-[170px]">
              {isNovo ? 'Novo produto' : formData.nome || 'Editar Produto'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Preenchimento Automático com IA */}
            <button
              type="button"
              onClick={() => setModalCriarComIAAberto(true)}
              className="px-3.5 py-2 rounded-xl border-2 border-teal-500 text-teal-700 bg-teal-50/50 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 hover:bg-teal-100 shadow-sm"
              title="Preencher com Inteligência Artificial"
            >
              <Sparkles className="w-4 h-4 text-teal-600" />
              <span>IA</span>
            </button>

            {!isNovo && (
              <>
                <button
                  type="button"
                  onClick={() => setModalPublicCardAberto(true)}
                  className="p-2 text-slate-600 hover:text-slate-900"
                  title="Compartilhar Card Público"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setModalClonarAberto(true)}
                  className="p-2 text-slate-600 hover:text-slate-900"
                  title="Clonar Produto"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleExcluirProduto}
                  className="p-2 text-slate-600 hover:text-rose-600"
                  title="Excluir Produto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Abas: CADASTRO | ESTOQUE (TELA007 / TELA008) */}
        <div className="flex border-b border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setAbaFormulario('cadastro')}
            className={`flex-1 py-3.5 text-xs sm:text-sm font-extrabold uppercase transition relative ${
              abaFormulario === 'cadastro' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-slate-400'
            }`}
          >
            Cadastro
          </button>
          <button
            type="button"
            onClick={() => setAbaFormulario('estoque')}
            className={`flex-1 py-3.5 text-xs sm:text-sm font-extrabold uppercase transition relative flex items-center justify-center gap-1.5 ${
              abaFormulario === 'estoque' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-slate-400'
            }`}
          >
            <span>Estoque</span>
            {formData.quantidadeEstoque <= 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            )}
          </button>
        </div>

        {/* CORPO DA ABA CADASTRO (TELA008 & TELA008A) */}
        {abaFormulario === 'cadastro' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Card Preview Superior com Seletor de Cor e Acesso a Mídia */}
            <div className="flex items-center justify-center gap-4 py-3 bg-slate-50/80 rounded-3xl p-3.5 border border-slate-100 shadow-inner">
              {/* Botão Cor da Etiqueta / Tarja (TELA013) */}
              <button
                type="button"
                onClick={() => {
                  setCorSelecionadaModal(formData.corEtiqueta);
                  setAplicarCorEmMassa(false);
                  setModalCorEtiquetaAberto(true);
                }}
                className="w-8 h-8 rounded-xl border-2 border-white shadow-md transition active:scale-95 shrink-0"
                style={{ backgroundColor: formData.corEtiqueta }}
                title="Alterar Cor da Tarja Inferior"
              />

              {/* Preview do Card: Fundo neutro/foto mantido, e Tarja Inferior colorida estritamente embaixo */}
              <div
                onClick={() => formData.fotos[0] && setModalFotoFullscreen(formData.fotos[0])}
                className="w-36 h-40 rounded-2xl bg-white border border-slate-200 p-0 flex flex-col justify-between shadow-md relative overflow-hidden cursor-pointer"
              >
                {/* Imagem do Produto (Ocupa a área visual superior/central sem alteração de fundo) */}
                <div className="flex-1 w-full bg-slate-50 flex items-center justify-center overflow-hidden">
                  {formData.fotos[0] ? (
                    <img
                      src={formData.fotos[0]}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Tag className="w-8 h-8 text-slate-300" />
                  )}
                </div>

                {/* Tarja Inferior do Card (Modificada exclusivamente pela cor de etiqueta, contendo ~20 caracteres resumidos) */}
                <div
                  className="w-full px-2.5 py-1.5 text-white flex flex-col justify-center shrink-0"
                  style={{ backgroundColor: formData.corEtiqueta }}
                >
                  <p className="text-[10px] font-extrabold uppercase truncate leading-tight">
                    {textoTarjaResumo}
                  </p>
                  <div className="flex items-baseline justify-between gap-1 mt-0.5">
                    <p className="text-xs font-black text-white">
                      R$ {precoPromoFmt || precoVendaFmt}
                    </p>
                    {precoPromoFmt && (
                      <p className="text-[9px] text-white/70 line-through">
                        R$ {precoVendaFmt}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Botão de Opções de Foto (Câmera ao vivo / Galeria / Gerenciador) */}
              <button
                type="button"
                onClick={() => setModalOpcoesFotoAberto(true)}
                className="relative p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 shadow-sm transition active:scale-95 cursor-pointer shrink-0"
                title="Tirar Foto ou Escolher da Galeria"
              >
                <Camera className="w-6 h-6 text-teal-600" />
                {formData.fotos.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-teal-500 text-white rounded-full text-[10px] flex items-center justify-center font-black shadow">
                    {formData.fotos.length}
                  </span>
                )}
              </button>
            </div>

            {/* Campos Obrigatórios */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do Produto</label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Informe o nome completo do item"
                  className="w-full py-2 text-sm sm:text-base font-extrabold text-slate-800 uppercase border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preço de Venda</label>
                <div className="flex items-center">
                  <span className="text-sm sm:text-base font-extrabold text-slate-500 mr-1.5">R$</span>
                  <input
                    type="text"
                    value={formData.precoVenda}
                    onChange={(e) => setFormData(prev => ({ ...prev, precoVenda: e.target.value }))}
                    placeholder="0,00"
                    className="w-full py-2 text-sm sm:text-base font-extrabold text-slate-800 border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Accordion: Opcionais (TELA008 & TELA008A) */}
            <div className="border-t border-slate-200 pt-3 space-y-4">
              <button
                type="button"
                onClick={() => setOpcionaisExpandido(!opcionaisExpandido)}
                className="w-full flex items-center justify-between text-left"
              >
                <div>
                  <h3 className="font-extrabold text-xs sm:text-sm text-slate-800">Opcionais</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Experimente a descrição gerada com IA</p>
                </div>
                {opcionaisExpandido ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {opcionaisExpandido && (
                <div className="space-y-4 pt-1">
                  {/* Preço promocional */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preço promocional</label>
                    <div className="relative flex items-center">
                      <span className="text-sm sm:text-base font-extrabold text-slate-500 mr-1.5">R$</span>
                      <input
                        type="text"
                        value={formData.precoPromocional}
                        onChange={(e) => setFormData(prev => ({ ...prev, precoPromocional: e.target.value }))}
                        placeholder="0,00"
                        className="w-full py-2 pr-8 text-sm sm:text-base font-extrabold text-slate-800 border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                      />
                      {formData.precoPromocional && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, precoPromocional: '' }))}
                          className="absolute right-0 p-1.5 text-slate-400 hover:text-slate-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      O preço de venda será riscado (ex: de R$ 10,00 por R$ 5,00)
                    </p>
                  </div>

                  {/* Seletor de Categoria (TELA016) */}
                  <div
                    onClick={() => setModalCategoriasAberto(true)}
                    className="border-b-2 border-slate-300 py-2.5 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Categoria</span>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase">
                        {mapaCategorias.get(formData.categoriaId) || 'Selecione uma categoria'}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>

                  {/* Seletor de Descrição (TELA017) */}
                  <div
                    onClick={() => setModalDescricaoAberto(true)}
                    className="border-b-2 border-slate-300 py-2.5 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex-1 pr-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Descrição Comercial</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 uppercase line-clamp-2">
                        {formData.descricao || 'Toque para adicionar uma descrição exclusiva...'}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                  </div>

                  {/* Código com Leitor de Código de Barras (TELA018) */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Código de Barras / EAN</label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={formData.codigoBarras}
                        onChange={(e) => setFormData(prev => ({ ...prev, codigoBarras: e.target.value }))}
                        placeholder="Código de barras ou interno"
                        className="w-full py-2 pr-10 text-sm sm:text-base font-extrabold text-slate-800 border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={iniciarScannerCamera}
                        className="absolute right-0 p-2 text-slate-600 hover:text-teal-600 cursor-pointer"
                        title="Ler Código de Barras com a Câmera"
                      >
                        <QrCode className="w-5 h-5 text-teal-600" />
                      </button>
                    </div>
                  </div>

                  {/* Preço de Custo */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Custo do Produto</label>
                    <div className="flex items-center">
                      <span className="text-sm sm:text-base font-extrabold text-slate-500 mr-1.5">R$</span>
                      <input
                        type="text"
                        value={formData.precoCusto}
                        onChange={(e) => setFormData(prev => ({ ...prev, precoCusto: e.target.value }))}
                        placeholder="0,00"
                        className="w-full py-2 text-sm sm:text-base font-extrabold text-slate-800 border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Vender por (TELA019) */}
                  <div
                    onClick={() => setModalVenderPorAberto(true)}
                    className="border-b-2 border-slate-300 py-2.5 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Vender por</span>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-800">
                        {formData.tipoUnidade === 'un' ? 'Unidade' : 'Fração (Kilo, Litro, Metro, etc.)'}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>

                  {/* Destacar este produto */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-700">Destacar este produto</span>
                      <HelpCircle className="w-4 h-4 text-slate-400" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, destaque: !prev.destaque }))}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                        formData.destaque ? 'bg-teal-500' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                        formData.destaque ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  {/* Exibir produto no catálogo */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-xs sm:text-sm font-bold text-slate-700">Exibir produto no catálogo</span>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, exibirCatalogo: !prev.exibirCatalogo }))}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                        formData.exibirCatalogo ? 'bg-teal-500' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                        formData.exibirCatalogo ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Variantes (TELA020) */}
            <div className="border-t border-slate-200 pt-3 pb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-black text-xs sm:text-sm text-slate-800">Variantes</span>
                <span className="px-2.5 py-0.5 rounded-full bg-teal-500 text-white text-[10px] font-black uppercase">
                  Novo
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTelaAtiva('variacoes')}
                className="text-xs sm:text-sm font-extrabold text-teal-600 hover:text-teal-700 uppercase"
              >
                Adicionar
              </button>
            </div>
          </div>
        )}

        {/* CORPO DA ABA ESTOQUE (TELA007) */}
        {abaFormulario === 'estoque' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Gerenciar Estoque Switch */}
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs sm:text-sm font-bold text-slate-700">Gerenciar estoque</span>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, gerenciarEstoque: !prev.gerenciarEstoque }))}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                    formData.gerenciarEstoque ? 'bg-teal-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                    formData.gerenciarEstoque ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Display Central Grande de Estoque */}
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/80 rounded-3xl border border-slate-100 p-6">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                  Estoque atual
                </span>
                <span className={`text-6xl sm:text-7xl font-black tracking-tight ${
                  formData.quantidadeEstoque < 0 ? 'text-rose-600' : 'text-slate-800'
                }`}>
                  {formData.quantidadeEstoque}
                </span>
                <span className="text-xs text-slate-400 mt-3 font-semibold">
                  Atualizado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Botões de Ação de Estoque */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setTelaAtiva('movimentacoes')}
                  className="w-full p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                >
                  <span>Histórico de movimentações</span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTecladoValorEstoqueMin(String(formData.estoqueMinimo));
                    setModalEstoqueMinimoAberto(true);
                  }}
                  className="w-full p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                >
                  <span>Estoque mínimo: {formData.estoqueMinimo}</span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Botão Inferior Salvar / Adicionar */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            disabled={salvandoProduto}
            onClick={salvarProduto}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {salvandoProduto ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span>{isNovo ? 'Adicionar produto' : 'Salvar'}</span>
            )}
          </button>
        </div>

        {/* MODAL DE OPÇÕES DE FOTO (CÂMERA / GALERIA / GERENCIADOR) */}
        {modalOpcoesFotoAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
            <div className="bg-white rounded-t-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-sm sm:text-base text-slate-800">Foto do Produto</h3>
                <button
                  type="button"
                  onClick={() => setModalOpcoesFotoAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => iniciarCameraFoto('environment')}
                  className="w-full p-4 rounded-2xl bg-teal-50 text-teal-800 font-extrabold text-xs sm:text-sm flex items-center gap-3 hover:bg-teal-100 transition shadow-sm cursor-pointer active:scale-98"
                >
                  <Camera className="w-5 h-5 text-teal-600" />
                  <span>Tirar Foto com a Câmera</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fileInputGaleriaRef.current?.click();
                  }}
                  className="w-full p-4 rounded-2xl bg-slate-50 text-slate-800 font-extrabold text-xs sm:text-sm flex items-center gap-3 hover:bg-slate-100 transition shadow-sm cursor-pointer active:scale-98"
                >
                  <ImageIcon className="w-5 h-5 text-slate-600" />
                  <span>Escolher da Galeria do Celular</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalOpcoesFotoAberto(false);
                    setModalGaleriaFotosAberto(true);
                  }}
                  className="w-full p-4 rounded-2xl border border-slate-200 text-slate-700 font-extrabold text-xs sm:text-sm flex items-center gap-3 hover:bg-slate-50 transition cursor-pointer"
                >
                  <Tag className="w-5 h-5 text-slate-500" />
                  <span>Gerenciar Fotos do Produto ({formData.fotos.length}/6)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CÂMERA AO VIVO IN-APP (TIRAR FOTO SEM ESTOURAR MEMÓRIA DO ANDROID) */}
        {modalCameraFotoAberto && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none">
            {/* Header com controles da Câmera */}
            <div className="p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
              <button
                type="button"
                onClick={encerrarCameraFoto}
                className="p-2.5 rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/30 transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={alternarFlashCameraFoto}
                  className={`p-2.5 rounded-full backdrop-blur-md transition cursor-pointer ${
                    cameraFotoFlash ? 'bg-amber-400 text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                  title="Lanterna"
                >
                  {cameraFotoFlash ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
                </button>

                <button
                  type="button"
                  onClick={alternarCameraFoto}
                  className="p-2.5 rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/30 transition cursor-pointer"
                  title="Alternar Câmera"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewfinder da Câmera */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
              <video
                ref={videoFotoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {cameraFotoCarregando && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
                  <p className="text-xs font-bold uppercase tracking-wider">Iniciando câmera...</p>
                </div>
              )}

              {/* Guia visual de enquadramento do produto */}
              <div className="absolute w-64 h-64 border-2 border-white/40 rounded-3xl pointer-events-none shadow-2xl flex items-center justify-center">
                <div className="w-4 h-4 border-t-2 border-l-2 border-teal-400 absolute top-2 left-2 rounded-tl" />
                <div className="w-4 h-4 border-t-2 border-r-2 border-teal-400 absolute top-2 right-2 rounded-tr" />
                <div className="w-4 h-4 border-b-2 border-l-2 border-teal-400 absolute bottom-2 left-2 rounded-bl" />
                <div className="w-4 h-4 border-b-2 border-r-2 border-teal-400 absolute bottom-2 right-2 rounded-br" />
              </div>
            </div>

            {/* Footer com Botão de Disparo / Shutter */}
            <div className="p-6 pb-10 flex flex-col items-center justify-center z-10 bg-gradient-to-t from-black/90 to-transparent gap-2">
              <button
                type="button"
                onClick={capturarFotoCanvas}
                disabled={cameraFotoCarregando}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:scale-95 transition shadow-2xl disabled:opacity-50 cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-inner hover:bg-slate-100">
                  <Camera className="w-7 h-7 text-slate-800" />
                </div>
              </button>
              <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Toque para fotografar</span>
            </div>
          </div>
        )}

        {/* Modal Cor da Etiqueta / Tarja (TELA013) com Opção Individual vs Todos os Produtos da Loja */}
        {modalCorEtiquetaAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-sm sm:text-base text-slate-800">Cor da Tarja Inferior</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Selecione o tom desejado</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalCorEtiquetaAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grade 3x3 TELA013 */}
              <div className="grid grid-cols-3 gap-3">
                {CORES_ETIQUETA.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setCorSelecionadaModal(cor)}
                    className={`h-14 rounded-2xl shadow-sm border transition active:scale-95 flex items-center justify-center ${
                      corSelecionadaModal === cor ? 'border-4 border-slate-900 scale-105 shadow-md' : 'border-black/10'
                    }`}
                    style={{ backgroundColor: cor }}
                  >
                    {corSelecionadaModal === cor && <Check className="w-6 h-6 text-white drop-shadow-md stroke-[3]" />}
                  </button>
                ))}
              </div>

              {/* Opção de Escopo: Apenas este produto VS Todos os produtos da Loja */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Onde aplicar a cor?
                </label>

                <div className="space-y-2">
                  <label
                    onClick={() => setAplicarCorEmMassa(false)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      !aplicarCorEmMassa ? 'bg-white border-teal-500 shadow-sm text-slate-800' : 'border-transparent text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="escopo_cor"
                        checked={!aplicarCorEmMassa}
                        onChange={() => setAplicarCorEmMassa(false)}
                        className="text-teal-600 focus:ring-teal-500 w-4 h-4"
                      />
                      <span className="text-xs font-bold">Apenas neste produto</span>
                    </div>
                  </label>

                  <label
                    onClick={() => setAplicarCorEmMassa(true)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      aplicarCorEmMassa ? 'bg-white border-teal-500 shadow-sm text-slate-800' : 'border-transparent text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="escopo_cor"
                        checked={aplicarCorEmMassa}
                        onChange={() => setAplicarCorEmMassa(true)}
                        className="text-teal-600 focus:ring-teal-500 w-4 h-4"
                      />
                      <div>
                        <span className="text-xs font-black text-slate-800 block">Todos os produtos da loja</span>
                        <span className="text-[10px] text-slate-400 font-medium">Define como padrão para todo o catálogo</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 text-[10px] font-extrabold uppercase">
                      Em massa
                    </span>
                  </label>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalCorEtiquetaAberto(false)}
                  className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={salvandoProduto}
                  onClick={() => {
                    if (aplicarCorEmMassa) {
                      aplicarCorEmMassaTodosProdutos(corSelecionadaModal);
                    } else {
                      setFormData(prev => ({ ...prev, corEtiqueta: corSelecionadaModal }));
                      setModalCorEtiquetaAberto(false);
                      setMensagemFeedback({ texto: 'Cor da tarja atualizada para este produto!', tipo: 'sucesso' });
                    }
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white text-xs sm:text-sm font-black shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {salvandoProduto ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{aplicarCorEmMassa ? 'Aplicar em Todos' : 'Salvar Cor'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diálogo de Clonar (TELA010) */}
        {modalClonarAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-xs p-6 shadow-2xl space-y-4 text-left">
              <h3 className="font-black text-base sm:text-lg text-slate-900">Atenção</h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">Deseja clonar este produto?</p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalClonarAberto(false)}
                  className="px-3 py-2 text-xs font-extrabold text-slate-600 hover:text-slate-800 uppercase"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={executarClonagem}
                  className="px-4 py-2 text-xs font-black text-teal-600 hover:text-teal-700 uppercase"
                >
                  Sim
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Vender por (TELA019) */}
        {modalVenderPorAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
            <div className="bg-white rounded-t-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-sm sm:text-base text-slate-800">Vender por</h3>
                <button
                  type="button"
                  onClick={() => setModalVenderPorAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, tipoUnidade: 'un' }));
                    setModalVenderPorAberto(false);
                  }}
                  className={`w-full p-4 rounded-2xl text-left text-xs sm:text-sm font-extrabold flex items-center justify-between transition ${
                    formData.tipoUnidade === 'un' ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>Unidade</span>
                  {formData.tipoUnidade === 'un' && <Check className="w-5 h-5 text-teal-600" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, tipoUnidade: 'kg' }));
                    setModalVenderPorAberto(false);
                  }}
                  className={`w-full p-4 rounded-2xl text-left text-xs sm:text-sm font-extrabold flex items-center justify-between transition ${
                    formData.tipoUnidade !== 'un' ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>Fração (Kilo, Litro, Metro, etc.)</span>
                  {formData.tipoUnidade !== 'un' && <Check className="w-5 h-5 text-teal-600" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL COMPLETO DE PREENCHIMENTO AUTOMÁTICO VIA IA (EQUIPARADO AO DESKTOP) */}
        {modalCriarComIAAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-500 flex items-center justify-center text-white font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm sm:text-base text-slate-900">Preenchimento com IA</h3>
                    <p className="text-[11px] text-teal-600 font-bold uppercase">Google Gemini Multimodal</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTempApiKey(getGeminiApiKey());
                      setModalKeyGemini(true);
                    }}
                    className="px-2 py-1 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 flex items-center gap-1 text-[11px] font-bold transition border border-teal-200"
                    title="Configurar Chave Gemini"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Chave IA</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalCriarComIAAberto(false)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Abas do Modal IA: Foto | Texto/Nome | Código de Barras */}
              <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setAbaModalIA('foto')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                    abaModalIA === 'foto' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Por Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAbaModalIA('texto')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                    abaModalIA === 'texto' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Por Nome</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAbaModalIA('codigo')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                    abaModalIA === 'codigo' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Barcode className="w-3.5 h-3.5" />
                  <span>Por Código</span>
                </button>
              </div>

              {/* Conteúdo Aba Foto */}
              {abaModalIA === 'foto' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Envie ou tire uma foto do produto para preencher nome, categoria, preço sugerido e descrição comercial completa automaticamente.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOrigemCameraParaIA(true);
                        setModalCriarComIAAberto(false);
                        iniciarCameraFoto('environment');
                      }}
                      className="p-4 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/50 flex flex-col items-center justify-center text-teal-700 hover:bg-teal-100 transition cursor-pointer text-center active:scale-95"
                    >
                      <Camera className="w-8 h-8 mb-1.5" />
                      <span className="text-xs font-extrabold">Tirar Foto</span>
                    </button>

                    <label className="p-4 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-700 hover:bg-slate-100 transition cursor-pointer text-center active:scale-95">
                      <Upload className="w-8 h-8 mb-1.5 text-slate-500" />
                      <span className="text-xs font-extrabold">Enviar Imagem</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const compressed = await comprimirArquivoImagem(file, 640, 0.85);
                            if (compressed) {
                              processarPreenchimentoIA('foto', compressed);
                            }
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Conteúdo Aba Texto / Nome */}
              {abaModalIA === 'texto' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Digite o nome ou uma breve descrição do item (ex: <em>"Cerveja Heineken Long Neck 330ml"</em>).
                  </p>

                  <div className="relative">
                    <input
                      type="text"
                      value={promptTextoIA}
                      onChange={(e) => setPromptTextoIA(e.target.value)}
                      placeholder="Ex: Camiseta Algodão Básica Preta"
                      className="w-full pl-3 pr-10 py-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => alternarPesquisaPorVoz(setPromptTextoIA)}
                      className="absolute right-2 top-2.5 p-1 text-slate-400 hover:text-teal-600"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={processandoIA || !promptTextoIA.trim()}
                    onClick={() => processarPreenchimentoIA('texto')}
                    className="w-full py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {processandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Preencher Dados via IA</span>
                  </button>
                </div>
              )}

              {/* Conteúdo Aba Código de Barras */}
              {abaModalIA === 'codigo' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Aponte a câmera para ler o código ou digite o código de barras (EAN/GTIN) para buscar as informações oficiais do produto.
                  </p>

                  {/* Botão para Ler com a Câmera Ao Vivo */}
                  <button
                    type="button"
                    onClick={() => {
                      setOrigemScannerParaIA(true);
                      setModalCriarComIAAberto(false);
                      iniciarScannerCamera();
                    }}
                    className="w-full py-3.5 rounded-2xl bg-teal-50 border border-teal-300 text-teal-800 font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-teal-100 transition cursor-pointer shadow-sm active:scale-98"
                  >
                    <Camera className="w-5 h-5 text-teal-600" />
                    <span>Ler Código com a Câmera</span>
                  </button>

                  <div className="relative flex items-center justify-center my-2">
                    <div className="border-t border-slate-200 w-full" />
                    <span className="bg-white px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider absolute">OU</span>
                  </div>

                  <input
                    type="text"
                    value={promptCodigoIA}
                    onChange={(e) => setPromptCodigoIA(e.target.value)}
                    placeholder="Digite o código (ex: 7891000100103)"
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-800"
                  />

                  <button
                    type="button"
                    disabled={processandoIA || !promptCodigoIA.trim()}
                    onClick={() => processarPreenchimentoIA('codigo')}
                    className="w-full py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {processandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Consultar Código via IA</span>
                  </button>
                </div>
              )}

              {processandoIA && (
                <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-teal-600 shrink-0" />
                  <span className="text-xs font-bold leading-snug">Consultando inteligência artificial e gerando descrição comercial...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL CONFIGURAR CHAVE GEMINI */}
        {modalKeyGemini && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-indigo-500 flex items-center justify-center text-white">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-100">Chave Google Gemini IA</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalKeyGemini(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <p>
                  Para habilitar o preenchimento por foto e geração de descrições, insira sua chave gratuita do <strong className="text-white">Google Gemini</strong>.
                </p>
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1.5">
                  <p className="text-[11px] text-amber-400 font-bold">Como obter sua chave gratuita (1 min):</p>
                  <p className="text-[11px] text-slate-300">
                    1. Acesse o <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 underline font-bold"
                    >
                      Google AI Studio (clique aqui)
                    </a>
                  </p>
                  <p className="text-[11px] text-slate-300">2. Faça login com sua conta Google</p>
                  <p className="text-[11px] text-slate-300">3. Clique em <strong>"Create API key"</strong> e copie o código</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Chave da API (Gemini API Key):</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-teal-400"
                />
              </div>

              <div className="flex gap-2 pt-1">
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
                    setMensagemFeedback({
                      texto: tempApiKey.trim() ? 'Chave do Gemini salva com sucesso!' : 'Chave removida.',
                      tipo: 'sucesso'
                    });
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Salvar Chave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // TELA 001 & TELA 002: LISTA PRINCIPAL DE PRODUTOS E ESTOQUE MOBILE
  // =========================================================================
  return (
    <div className="flex flex-col h-full bg-white text-slate-900 overflow-hidden select-none relative">
      {renderToast()}

      {/* Header Superior Mobile (TELA001 / TELA002) */}
      <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerMenuAberto(true)}
            className="p-2 rounded-2xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            title="Menu Principal"
          >
            <div className="space-y-1">
              <span className="block w-6 h-0.5 bg-slate-800 rounded-full" />
              <span className="block w-6 h-0.5 bg-slate-800 rounded-full" />
              <span className="block w-6 h-0.5 bg-slate-800 rounded-full" />
            </div>
          </button>
          <h1 className="font-black text-base sm:text-lg text-slate-800 tracking-tight">
            Produtos ({produtos.length})
          </h1>
        </div>
      </div>

      {/* Abas Superiores: ITENS (TELA001) | ESTOQUE (TELA002) - Tipografia Aumentada */}
      <div className="flex border-b border-slate-200 bg-white shrink-0">
        <button
          type="button"
          onClick={() => {
            setAbaLista('itens');
            setBuscaAtiva(false);
          }}
          className={`flex-1 py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider transition relative ${
            abaLista === 'itens' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-slate-400'
          }`}
        >
          Itens
        </button>
        <button
          type="button"
          onClick={() => {
            setAbaLista('estoque');
            setBuscaAtiva(false);
          }}
          className={`flex-1 py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider transition relative ${
            abaLista === 'estoque' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-slate-400'
          }`}
        >
          Estoque
        </button>
      </div>

      {/* Barra de Busca com Pesquisa por Voz (TELA001 / TELA002 / TELA003) */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center gap-3 shrink-0">
        {buscaAtiva ? (
          // Busca Ativa (TELA003)
          <div className="flex-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBusca('');
                setBuscaAtiva(false);
              }}
              className="p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <input
              ref={inputBuscaRef}
              autoFocus
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite o nome ou código..."
              className="flex-1 py-1.5 text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 border-none focus:outline-none"
            />
            {/* Ícone de Microfone / Pesquisa por Voz */}
            <button
              type="button"
              onClick={() => alternarPesquisaPorVoz(setBusca)}
              className={`p-2 rounded-xl transition ${
                ouvindoVoz ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Pesquisar por voz"
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>
        ) : (
          // Campo Normal de Busca
          <div
            onClick={() => {
              setBuscaAtiva(true);
              setTimeout(() => inputBuscaRef.current?.focus(), 100);
            }}
            className="flex-1 flex items-center justify-between text-slate-400 py-1.5 px-1 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <span className="text-xs sm:text-sm font-medium text-slate-400">Item ou código</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBuscaAtiva(true);
                alternarPesquisaPorVoz(setBusca);
              }}
              className="p-1 text-slate-400 hover:text-slate-700"
              title="Pesquisar por voz"
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Botão da Direita: '+' na aba Itens ou 'Filtros' na aba Estoque */}
        {abaLista === 'itens' ? (
          <button
            type="button"
            onClick={abrirNovoProduto}
            className="p-2 text-teal-600 hover:text-teal-700 font-extrabold transition cursor-pointer"
            title="Novo Produto"
          >
            <Plus className="w-6 h-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setTelaAtiva('filtros')}
            className="p-2 text-slate-600 hover:text-slate-900 transition cursor-pointer"
            title="Filtros de Estoque"
          >
            <Sliders className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Lista de Produtos (TELA001 ou TELA002) */}
      <div className={`flex-1 overflow-y-auto divide-y divide-slate-100 ${
        abaLista === 'itens' ? 'pb-24' : 'pb-28'
      }`}>
        {carregando ? (
          <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            <span className="font-bold">Carregando produtos...</span>
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs space-y-3">
            <Tag className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-sm text-slate-500">Nenhum produto encontrado.</p>
          </div>
        ) : (
          produtosFiltrados.map((p) => {
            const estoque = getEstoqueReal(p);
            const precoVendaFmt = Number(p.preco_venda_varejo || 0).toFixed(2).replace('.', ',');
            const precoPromoFmt = p.preco_promocional ? Number(p.preco_promocional).toFixed(2).replace('.', ',') : null;
            const catNome = (p.categoria_id && mapaCategorias.get(p.categoria_id)) || 'SEM CATEGORIA';

            // Visualização da Aba ITENS (TELA001 com Estrutura de Descrição em até 2 linhas e Maior Destaque de Preço)
            if (abaLista === 'itens') {
              return (
                <div
                  key={p.id}
                  onClick={() => abrirEditarProduto(p, 'cadastro')}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Thumbnail / Foto */}
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                      {p.fotos_urls && p.fotos_urls[0] ? (
                        <img src={p.fotos_urls[0]} alt={p.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-white font-black text-xs"
                          style={{ backgroundColor: obterCorProduto(p) }}
                        >
                          {p.nome.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Nome e Descrição com até 2 linhas */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {p.destaque && <span className="text-amber-500 font-bold text-xs">⭐</span>}
                        <h2 className="font-black text-xs sm:text-sm text-slate-800 uppercase line-clamp-2 leading-snug">
                          {p.nome}
                        </h2>
                      </div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">
                        {catNome}
                      </p>
                    </div>
                  </div>

                  {/* Destaque Visual Acentuado ao Preço */}
                  <div className="text-right shrink-0">
                    {precoPromoFmt ? (
                      <div className="flex flex-col items-end">
                        <span className="text-[11px] text-slate-400 line-through font-semibold">R$ {precoVendaFmt}</span>
                        <span className="font-black text-sm sm:text-base text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-xl shadow-sm">
                          R$ {precoPromoFmt}
                        </span>
                      </div>
                    ) : (
                      <span className="font-black text-sm sm:text-base text-slate-900 bg-slate-100 px-2.5 py-1 rounded-xl shadow-sm">
                        R$ {precoVendaFmt}
                      </span>
                    )}
                  </div>
                </div>
              );
            }

            // Visualização da Aba ESTOQUE (TELA002 com Descrição em 2 linhas e Saldo em Estoque com Maior Destaque)
            const isSemEstoque = estoque <= 0;
            const isMinimo = estoque > 0 && estoque <= Number(p.estoque_minimo_alerta || 0);

            return (
              <div
                key={p.id}
                onClick={() => abrirEditarProduto(p, 'estoque')}
                className="p-4 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Ponto Indicador de Status */}
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isSemEstoque ? 'bg-rose-500' : isMinimo ? 'bg-amber-500' : 'bg-transparent'
                  }`} />

                  {/* Foto */}
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                    {p.fotos_urls && p.fotos_urls[0] ? (
                      <img src={p.fotos_urls[0]} alt={p.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-black text-xs"
                        style={{ backgroundColor: obterCorProduto(p) }}
                      >
                        {p.nome.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Nome com até 2 linhas */}
                  <h2 className="font-black text-xs sm:text-sm text-slate-800 uppercase line-clamp-2 leading-snug">
                    {p.nome}
                  </h2>
                </div>

                {/* Quantidade em Estoque com Alto Destaque Visual */}
                <div className="text-right shrink-0">
                  <span className={`font-black text-sm sm:text-base px-3 py-1.5 rounded-xl shadow-sm inline-block min-w-[3.2rem] text-center ${
                    isSemEstoque
                      ? 'bg-rose-50 text-rose-600 border border-rose-200'
                      : isMinimo
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-slate-100 text-slate-800'
                  }`}>
                    {estoque}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* RODAPÉ FLUTUANTE: PEDIDOS E CATÁLOGO ONLINE (TELA001 / TELA005) */}
      {abaLista === 'itens' && (
        <div
          onClick={() => setModalCatalogoAberto(true)}
          className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-4 py-3.5 shadow-2xl flex items-center justify-between cursor-pointer z-30"
        >
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5 text-slate-700" />
            <div>
              <h3 className="font-extrabold text-xs sm:text-sm text-slate-800">Pedidos e Catálogo Online</h3>
              <p className="text-[10px] font-black text-teal-600 tracking-wider uppercase">
                {loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false
                  ? 'PUBLICADO • ACEITANDO PEDIDOS'
                  : 'CATÁLOGO PAUSADO'}
              </p>
            </div>
          </div>
          <ChevronDown className="w-5 h-5 text-slate-400" />
        </div>
      )}

      {/* RODAPÉ FLUTUANTE: RESUMO DE ESTOQUE (TELA002) */}
      {abaLista === 'estoque' && (
        <div className="fixed bottom-0 inset-x-0 p-3 z-30 pointer-events-none">
          <div className="bg-slate-900 text-white rounded-3xl p-4 shadow-2xl flex items-center justify-between pointer-events-auto border border-slate-800">
            <div>
              <div className="w-8 h-1 bg-slate-700 rounded-full mx-auto mb-2 opacity-50" />
              <h3 className="font-extrabold text-xs sm:text-sm text-white">
                Total: R$ {valorTotalEstoque.toFixed(2).replace('.', ',')}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Custo do estoque: R$ {valorCustoTotalEstoque.toFixed(2).replace('.', ',')}
              </p>
            </div>

            <div className="text-right">
              <span className="font-black text-lg sm:text-xl text-white block">
                {totalItensEstoque}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Em estoque
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / BOTTOM SHEET: PEDIDOS E CATÁLOGO ONLINE (TELA005) */}
      {modalCatalogoAberto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm sm:text-base text-slate-800">Pedidos e Catálogo Online</h3>
              <button
                type="button"
                onClick={() => setModalCatalogoAberto(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Publicado para todos verem */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs sm:text-sm font-bold text-slate-700">Publicado para todos verem</span>
                <button
                  type="button"
                  onClick={async () => {
                    const novoStatus = !(loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false);
                    if (loja?.id) {
                      await supabase.from('lojas').update({
                        configuracoes_extras: {
                          ...loja.configuracoes_extras,
                          catalogo: {
                            ...loja.configuracoes_extras?.catalogo,
                            publicar_catalogo: novoStatus
                          }
                        }
                      }).eq('id', loja.id);
                      await onRecarregar();
                    }
                  }}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                    loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false ? 'bg-teal-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                    loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Ações TELA005 */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <a
                  href={catalogUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full p-3 rounded-2xl hover:bg-slate-50 flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-700"
                >
                  <Store className="w-5 h-5 text-slate-500" />
                  <span>Abrir catálogo</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    compartilharLink(catalogUrl, loja?.nome_fantasia || 'Catálogo Online', 'Confira nosso catálogo online e faça seu pedido direto pelo WhatsApp!');
                    setModalCatalogoAberto(false);
                  }}
                  className="w-full p-3 rounded-2xl hover:bg-slate-50 flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-700 text-left"
                >
                  <Share2 className="w-5 h-5 text-slate-500" />
                  <span>Compartilhar</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalCatalogoAberto(false);
                    navigate('/catalog-config');
                  }}
                  className="w-full p-3 rounded-2xl hover:bg-slate-50 flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-700 text-left"
                >
                  <Settings className="w-5 h-5 text-slate-500" />
                  <span>Configurações</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER MENU UNIFICADO MOBILE */}
      <MobileMenuDrawer
        aberto={drawerMenuAberto}
        onFechar={() => setDrawerMenuAberto(false)}
      />
    </div>
  );
};
export default ProdutosMobile;
=======
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Sliders,
  Share2,
  Copy,
  Trash2,
  X,
  Check,
  CheckCircle2,
  Sparkles,
  Camera,
  Upload,
  Globe,
  Store,
  Volume2,
  VolumeX,
  Flashlight,
  FlashlightOff,
  HelpCircle,
  Loader2,
  AlertCircle,
  ShoppingCart,
  ShoppingBag,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  ArrowDown,
  ArrowUp,
  QrCode,
  Tag,
  Mic,
  MicOff,
  Image as ImageIcon,
  FileText,
  Barcode,
  RefreshCw,
  Key
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Produto, Categoria, VariacaoProduto, TipoUnidade } from '../types';
import { audioService } from '../services/audioService';
import {
  identificarProdutoPorFoto,
  identificarProdutoPorTextoOuEan,
  gerarDescricaoExclusivaIA,
  getGeminiApiKey,
  setGeminiApiKey
} from '../services/geminiService';

interface ProdutosMobileProps {
  produtos: Produto[];
  categorias: Categoria[];
  carregando: boolean;
  onRecarregar: () => Promise<void>;
}

// 9 Cores da Etiqueta / Tarja (TELA013)
const CORES_ETIQUETA = [
  '#FBBF24', // Amarelo Dourado
  '#F97316', // Laranja
  '#EF4444', // Vermelho Coral
  '#EC4899', // Rosa Pink
  '#60A5FA', // Azul Claro
  '#1E3A8A', // Azul Marinho
  '#475569', // Cinza Chumbo
  '#1F2937', // Preto / Grafite
  '#84CC16'  // Verde Limão
];

// Utilitário de compressão segura via HTML5 Canvas (evita OOM no Android)
const comprimirArquivoImagem = (file: File, maxDim = 1024, quality = 0.82): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve('');
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        resolve('');
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        let { width, height } = img;
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
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
};

export const ProdutosMobile: React.FC<ProdutosMobileProps> = ({
  produtos,
  categorias,
  carregando,
  onRecarregar
}) => {
  const navigate = useNavigate();
  const { loja, usuario, desconectarPdv } = useAuth();
  const permissions = usePermissions();

  // =========================================================================
  // ESTADOS DE TELA E NAVEGAÇÃO
  // =========================================================================
  const [telaAtiva, setTelaAtiva] = useState<'lista' | 'novo' | 'detalhes' | 'filtros' | 'movimentacoes' | 'variacoes'>('lista');
  const [abaLista, setAbaLista] = useState<'itens' | 'estoque'>('itens'); // TELA001 vs TELA002
  const [abaFormulario, setAbaFormulario] = useState<'cadastro' | 'estoque'>('cadastro'); // TELA008 vs TELA007

  // Modais & Subtelas
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);
  const [modalCatalogoAberto, setModalCatalogoAberto] = useState<boolean>(false); // TELA005
  const [modalClonarAberto, setModalClonarAberto] = useState<boolean>(false); // TELA010
  const [modalCorEtiquetaAberto, setModalCorEtiquetaAberto] = useState<boolean>(false); // TELA013
  const [corSelecionadaModal, setCorSelecionadaModal] = useState<string>('#1F2937');
  const [aplicarCorEmMassa, setAplicarCorEmMassa] = useState<boolean>(false);
  const [modalFotoFullscreen, setModalFotoFullscreen] = useState<string | null>(null); // TELA014
  const [modalOpcoesFotoAberto, setModalOpcoesFotoAberto] = useState<boolean>(false); // Opções de Foto (Câmera / Galeria / Gerenciar)
  const [modalGaleriaFotosAberto, setModalGaleriaFotosAberto] = useState<boolean>(false); // TELA015
  const [modalCategoriasAberto, setModalCategoriasAberto] = useState<boolean>(false); // TELA016
  const [modalDescricaoAberto, setModalDescricaoAberto] = useState<boolean>(false); // TELA017
  const [modalScannerAberto, setModalScannerAberto] = useState<boolean>(false); // TELA018
  const [modalVenderPorAberto, setModalVenderPorAberto] = useState<boolean>(false); // TELA019
  const [modalEstoqueMinimoAberto, setModalEstoqueMinimoAberto] = useState<boolean>(false); // TELA012
  const [modalPublicCardAberto, setModalPublicCardAberto] = useState<boolean>(false); // TELA009
  const [modalCriarComIAAberto, setModalCriarComIAAberto] = useState<boolean>(false); // Criar / Preencher com IA completo

  // =========================================================================
  // ESTADOS DE BUSCA E VOZ (PESQUISA POR VOZ)
  // =========================================================================
  const [busca, setBusca] = useState<string>('');
  const [buscaAtiva, setBuscaAtiva] = useState<boolean>(false); // TELA003
  const [ouvindoVoz, setOuvindoVoz] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const inputBuscaRef = useRef<HTMLInputElement>(null);

  // Filtros de Estoque (TELA006)
  const [filtroSemEstoque, setFiltroSemEstoque] = useState<boolean>(false);
  const [filtroMinimo, setFiltroMinimo] = useState<boolean>(false);
  const [filtroAcimaMinimo, setFiltroAcimaMinimo] = useState<boolean>(false);
  const [filtroSemControle, setFiltroSemControle] = useState<boolean>(false);
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([]);
  const [ordenacaoEstoque, setOrdenacaoEstoque] = useState<'menor_estoque' | 'maior_estoque' | 'a_z' | 'z_a'>('menor_estoque');

  // =========================================================================
  // ESTADO DO PRODUTO EM EDIÇÃO / CADASTRO
  // =========================================================================
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [formData, setFormData] = useState<{
    nome: string;
    precoVenda: string;
    precoPromocional: string;
    precoCusto: string;
    categoriaId: string;
    descricao: string;
    codigoBarras: string;
    tipoUnidade: TipoUnidade;
    destaque: boolean;
    exibirCatalogo: boolean;
    corEtiqueta: string; // Cor da tarja de descrição/valor
    fotos: string[];
    estoqueMinimo: number;
    gerenciarEstoque: boolean;
    quantidadeEstoque: number;
    variacoes: Partial<VariacaoProduto>[];
  }>({
    nome: '',
    precoVenda: '',
    precoPromocional: '',
    precoCusto: '',
    categoriaId: '',
    descricao: '',
    codigoBarras: '',
    tipoUnidade: 'un',
    destaque: false,
    exibirCatalogo: true,
    corEtiqueta: '#1F2937',
    fotos: [],
    estoqueMinimo: 0,
    gerenciarEstoque: true,
    quantidadeEstoque: 0,
    variacoes: []
  });

  const [opcionaisExpandido, setOpcionaisExpandido] = useState<boolean>(true);
  const [salvandoProduto, setSalvandoProduto] = useState<boolean>(false);
  const [processandoIA, setProcessandoIA] = useState<boolean>(false);
  const [mensagemFeedback, setMensagemFeedback] = useState<{ texto: string; tipo: 'sucesso' | 'erro' } | null>(null);

  // Estados de IA no Modal de Criação / Preenchimento
  const [abaModalIA, setAbaModalIA] = useState<'foto' | 'texto' | 'codigo'>('foto');
  const [promptTextoIA, setPromptTextoIA] = useState<string>('');
  const [promptCodigoIA, setPromptCodigoIA] = useState<string>('');
  const [modalKeyGemini, setModalKeyGemini] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>(getGeminiApiKey());

  // Estados para Teclado Numérico (TELA012)
  const [tecladoValorEstoqueMin, setTecladoValorEstoqueMin] = useState<string>('0');

  // Estados para Scanner de Câmera / Barcode (TELA018)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputGaleriaRef = useRef<HTMLInputElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [torchLigado, setTorchLigado] = useState<boolean>(false);
  const [somScannerMudo, setSomScannerMudo] = useState<boolean>(false);
  const [scannerErro, setScannerErro] = useState<string | null>(null);
  const animFrameScannerRef = useRef<number | null>(null);

  // Estados para Câmera In-App de Foto (Ultra-leve, sem abrir app externo que estoura RAM no Android)
  const [modalCameraFotoAberto, setModalCameraFotoAberto] = useState<boolean>(false);
  const [streamCameraFoto, setStreamCameraFoto] = useState<MediaStream | null>(null);
  const [cameraFotoFacingMode, setCameraFotoFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraFotoFlash, setCameraFotoFlash] = useState<boolean>(false);
  const [cameraFotoCarregando, setCameraFotoCarregando] = useState<boolean>(false);
  const [cameraFotoErro, setCameraFotoErro] = useState<string | null>(null);
  const [origemCameraParaIA, setOrigemCameraParaIA] = useState<boolean>(false);
  const [origemScannerParaIA, setOrigemScannerParaIA] = useState<boolean>(false);
  const videoFotoRef = useRef<HTMLVideoElement | null>(null);

  // Estados de IA para Descrição (TELA017)
  const [gerandoDescricaoIA, setGerandoDescricaoIA] = useState<boolean>(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState<string>('');
  const [criandoNovaCategoria, setCriandoNovaCategoria] = useState<boolean>(false);
  const [buscaCategoria, setBuscaCategoria] = useState<string>('');

  // =========================================================================
  // RECONHECIMENTO DE VOZ (PESQUISA POR VOZ GLOBAL MOBILE)
  // =========================================================================
  const alternarPesquisaPorVoz = (setTargetValue: (val: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Seu navegador não suporta pesquisa por voz. Use o teclado para digitar.');
      return;
    }

    if (ouvindoVoz) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setOuvindoVoz(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setOuvindoVoz(true);
        audioService.playBeep();
      };

      recognition.onresult = (event: any) => {
        const textoFalado = event.results?.[0]?.[0]?.transcript;
        if (textoFalado) {
          setTargetValue(textoFalado);
          audioService.playBeep();
          setMensagemFeedback({ texto: `Buscando por: "${textoFalado}"`, tipo: 'sucesso' });
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Erro no reconhecimento de voz:', event.error);
        setOuvindoVoz(false);
      };

      recognition.onend = () => {
        setOuvindoVoz(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Falha ao iniciar SpeechRecognition:', e);
      setOuvindoVoz(false);
    }
  };

  // =========================================================================
  // FUNÇÕES AUXILIARES DE CÁLCULO DE ESTOQUE
  // =========================================================================
  const getEstoqueReal = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0);
    }
    return Number(p.quantidade_estoque || 0);
  };

  const getValorVendaEstoque = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => {
        const preco = Number(v.preco_venda_varejo) || Number(p.preco_venda_varejo) || 0;
        return acc + Number(v.quantidade_estoque || 0) * preco;
      }, 0);
    }
    return Number(p.quantidade_estoque || 0) * Number(p.preco_venda_varejo || 0);
  };

  const getValorCustoEstoque = (p: Produto): number => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => {
        const custo = Number(v.preco_custo) || Number(p.preco_custo) || 0;
        return acc + Number(v.quantidade_estoque || 0) * custo;
      }, 0);
    }
    return Number(p.quantidade_estoque || 0) * Number(p.preco_custo || 0);
  };

  // Totais do Estoque (para o card TELA002)
  const totalItensEstoque = useMemo(() => {
    return produtos.reduce((acc, p) => acc + getEstoqueReal(p), 0);
  }, [produtos]);

  const valorTotalEstoque = useMemo(() => {
    return produtos.reduce((acc, p) => acc + getValorVendaEstoque(p), 0);
  }, [produtos]);

  const valorCustoTotalEstoque = useMemo(() => {
    return produtos.reduce((acc, p) => acc + getValorCustoEstoque(p), 0);
  }, [produtos]);

  // Mapa de categorias
  const mapaCategorias = useMemo(() => {
    const m = new Map<string, string>();
    categorias.forEach(c => m.set(c.id, c.nome));
    return m;
  }, [categorias]);

  // =========================================================================
  // FILTRAGEM E ORDENAÇÃO DE PRODUTOS
  // =========================================================================
  const produtosFiltrados = useMemo(() => {
    let list = [...produtos];

    // Busca textual
    if (busca.trim()) {
      const q = busca.toLowerCase().trim();
      list = list.filter(p => {
        const nomeMatch = p.nome.toLowerCase().includes(q);
        const codBarrasMatch = p.codigo_barras?.toLowerCase().includes(q);
        const codInternoMatch = p.codigo_interno?.toLowerCase().includes(q);
        const catMatch = (p.categoria_id && mapaCategorias.get(p.categoria_id)?.toLowerCase().includes(q)) || false;
        return nomeMatch || codBarrasMatch || codInternoMatch || catMatch;
      });
    }

    // Filtros avançados na aba Estoque (TELA006)
    if (abaLista === 'estoque') {
      if (filtroSemEstoque || filtroMinimo || filtroAcimaMinimo || filtroSemControle) {
        list = list.filter(p => {
          const est = getEstoqueReal(p);
          const min = Number(p.estoque_minimo_alerta || 0);

          if (filtroSemEstoque && est <= 0) return true;
          if (filtroMinimo && est > 0 && est <= min) return true;
          if (filtroAcimaMinimo && est > min) return true;
          if (filtroSemControle && est === 0 && min === 0) return true;
          return false;
        });
      }

      if (categoriasFiltro.length > 0) {
        list = list.filter(p => p.categoria_id && categoriasFiltro.includes(p.categoria_id));
      }

      // Ordenação
      if (ordenacaoEstoque === 'menor_estoque') {
        list.sort((a, b) => getEstoqueReal(a) - getEstoqueReal(b));
      } else if (ordenacaoEstoque === 'maior_estoque') {
        list.sort((a, b) => getEstoqueReal(b) - getEstoqueReal(a));
      } else if (ordenacaoEstoque === 'a_z') {
        list.sort((a, b) => a.nome.localeCompare(b.nome));
      } else if (ordenacaoEstoque === 'z_a') {
        list.sort((a, b) => b.nome.localeCompare(a.nome));
      }
    }

    return list;
  }, [
    produtos,
    busca,
    abaLista,
    filtroSemEstoque,
    filtroMinimo,
    filtroAcimaMinimo,
    filtroSemControle,
    categoriasFiltro,
    ordenacaoEstoque,
    mapaCategorias
  ]);

  // Limpar feedback
  useEffect(() => {
    if (mensagemFeedback) {
      const timer = setTimeout(() => setMensagemFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [mensagemFeedback]);

  // =========================================================================
  // NAVEGAÇÃO E ABERTURA DE TELAS
  // =========================================================================
  const abrirNovoProduto = () => {
    setProdutoEditando(null);
    setFormData({
      nome: '',
      precoVenda: '',
      precoPromocional: '',
      precoCusto: '',
      categoriaId: '',
      descricao: '',
      codigoBarras: '',
      tipoUnidade: 'un',
      destaque: false,
      exibirCatalogo: true,
      corEtiqueta: '#1F2937',
      fotos: [],
      estoqueMinimo: 0,
      gerenciarEstoque: true,
      quantidadeEstoque: 0,
      variacoes: []
    });
    setAbaFormulario('cadastro');
    setTelaAtiva('novo');
  };

  // Helper para obter cor do produto salva na nuvem (Supabase) ou localmente
  const obterCorProduto = (p: Produto): string => {
    if (p.cor_etiqueta) return p.cor_etiqueta;
    if (loja?.configuracoes_extras?.cores_produtos?.[p.id]) {
      return loja.configuracoes_extras.cores_produtos[p.id];
    }
    if (loja?.configuracoes_extras?.cor_padrao_etiqueta_produtos) {
      return loja.configuracoes_extras.cor_padrao_etiqueta_produtos;
    }
    return localStorage.getItem(`hubi_cor_prod_${p.id}`) || localStorage.getItem('hubi_cor_padrao_loja') || '#1F2937';
  };

  // Helper para persistir a cor do produto no Supabase (em lojas.configuracoes_extras.cores_produtos e produtos.cor_etiqueta)
  const persistirCorProdutoSupabase = async (produtoId: string, cor: string) => {
    localStorage.setItem(`hubi_cor_prod_${produtoId}`, cor);

    if (!loja?.id) return;
    try {
      // 1. Salva no JSONB de configuracoes_extras da Loja no Supabase
      const coresAtuais = loja.configuracoes_extras?.cores_produtos || {};
      const novasCores = { ...coresAtuais, [produtoId]: cor };

      await supabase.from('lojas').update({
        configuracoes_extras: {
          ...loja.configuracoes_extras,
          cores_produtos: novasCores
        }
      }).eq('id', loja.id);

      // 2. Tenta também salvar na coluna direta caso o usuário já tenha criado no Supabase
      try {
        await supabase.from('produtos').update({ cor_etiqueta: cor }).eq('id', produtoId);
      } catch {
        // Coluna ainda não criada no SQL, ignorar silenciosamente pois já está salva no JSONB acima
      }
    } catch (e) {
      console.warn('Erro ao sincronizar cor no Supabase:', e);
    }
  };

  // Helper para aplicar a mesma cor para TODOS os produtos da loja no Supabase
  const aplicarCorEmMassaTodosProdutos = async (cor: string) => {
    if (!loja?.id) return;
    try {
      setSalvandoProduto(true);

      // 1. Atualiza a cor padrão da loja e o mapa de todos os produtos no Supabase (configuracoes_extras)
      const novosMapeamentos: { [id: string]: string } = {};
      produtos.forEach(p => {
        novosMapeamentos[p.id] = cor;
        localStorage.setItem(`hubi_cor_prod_${p.id}`, cor);
      });
      localStorage.setItem('hubi_cor_padrao_loja', cor);

      await supabase.from('lojas').update({
        configuracoes_extras: {
          ...loja.configuracoes_extras,
          cor_padrao_etiqueta_produtos: cor,
          cores_produtos: novosMapeamentos
        }
      }).eq('id', loja.id);

      // 2. Tenta também atualizar em lote a coluna cor_etiqueta na tabela produtos caso ela exista
      try {
        await supabase.from('produtos').update({ cor_etiqueta: cor }).eq('loja_id', loja.id);
      } catch {
        // Coluna SQL não existe, ignorar silenciosamente
      }

      setFormData(prev => ({ ...prev, corEtiqueta: cor }));
      setModalCorEtiquetaAberto(false);
      setMensagemFeedback({ texto: 'Cor da tarja aplicada a TODOS os produtos com sucesso!', tipo: 'sucesso' });
      await onRecarregar();
    } catch (err: any) {
      console.error('Erro ao aplicar cor em massa:', err);
      setMensagemFeedback({ texto: 'Erro ao aplicar cor a todos os produtos.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  const abrirEditarProduto = (p: Produto, aba: 'cadastro' | 'estoque' = 'cadastro') => {
    setProdutoEditando(p);
    const corSalva = obterCorProduto(p);
    setFormData({
      nome: p.nome || '',
      precoVenda: p.preco_venda_varejo !== undefined && p.preco_venda_varejo !== null ? String(p.preco_venda_varejo) : '',
      precoPromocional: p.preco_promocional ? String(p.preco_promocional) : '',
      precoCusto: p.preco_custo !== undefined && p.preco_custo !== null ? String(p.preco_custo) : '',
      categoriaId: p.categoria_id || '',
      descricao: p.descricao || '',
      codigoBarras: p.codigo_barras || '',
      tipoUnidade: p.tipo_unidade || 'un',
      destaque: Boolean(p.destaque),
      exibirCatalogo: p.exibir_catalogo !== false,
      corEtiqueta: corSalva,
      fotos: p.fotos_urls || [],
      estoqueMinimo: Number(p.estoque_minimo_alerta || 0),
      gerenciarEstoque: true,
      quantidadeEstoque: getEstoqueReal(p),
      variacoes: p.variacoes ? [...p.variacoes] : []
    });
    setAbaFormulario(aba);
    setTelaAtiva('detalhes');
  };

  // =========================================================================
  // SALVAMENTO / PERSISTÊNCIA NO SUPABASE
  // =========================================================================
  const salvarProduto = async () => {
    if (!loja?.id) return;
    if (!formData.nome.trim()) {
      setMensagemFeedback({ texto: 'Informe o nome do produto.', tipo: 'erro' });
      return;
    }

    try {
      setSalvandoProduto(true);

      const precoVendaNum = parseFloat(formData.precoVenda.replace(',', '.')) || 0;
      const precoPromoNum = formData.precoPromocional ? parseFloat(formData.precoPromocional.replace(',', '.')) : null;
      const precoCustoNum = formData.precoCusto ? parseFloat(formData.precoCusto.replace(',', '.')) : 0;

      const payload: Partial<Produto> = {
        loja_id: loja.id,
        nome: formData.nome.trim().toUpperCase(),
        categoria_id: formData.categoriaId || null,
        preco_venda_varejo: precoVendaNum,
        preco_promocional: precoPromoNum,
        promocao_ativa: Boolean(precoPromoNum && precoPromoNum > 0 && precoPromoNum < precoVendaNum),
        preco_custo: precoCustoNum,
        descricao: formData.descricao.trim() || null,
        codigo_barras: formData.codigoBarras.trim() || null,
        tipo_unidade: formData.tipoUnidade,
        destaque: formData.destaque,
        exibir_catalogo: formData.exibirCatalogo,
        fotos_urls: formData.fotos,
        estoque_minimo_alerta: formData.estoqueMinimo,
        quantidade_estoque: formData.quantidadeEstoque,
        cor_etiqueta: formData.corEtiqueta,
        ativo: true
      };

      if (produtoEditando?.id) {
        // Atualizar produto existente
        const { error } = await supabase
          .from('produtos')
          .update({
            ...payload,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', produtoEditando.id);

        if (error) throw error;
        await persistirCorProdutoSupabase(produtoEditando.id, formData.corEtiqueta);
        setMensagemFeedback({ texto: 'Produto atualizado com sucesso!', tipo: 'sucesso' });
      } else {
        // Criar novo produto
        const { data: prodCriado, error } = await supabase
          .from('produtos')
          .insert([{
            ...payload,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) throw error;
        if (prodCriado?.id) {
          await persistirCorProdutoSupabase(prodCriado.id, formData.corEtiqueta);
        }
        setMensagemFeedback({ texto: 'Produto cadastrado com sucesso!', tipo: 'sucesso' });
      }

      await onRecarregar();
      setTelaAtiva('lista');
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err);
      setMensagemFeedback({ texto: err.message || 'Erro ao salvar produto.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  // Excluir produto
  const handleExcluirProduto = async () => {
    if (!produtoEditando?.id) return;
    if (!confirm(`Deseja realmente excluir "${produtoEditando.nome}"?`)) return;

    try {
      setSalvandoProduto(true);
      const { error } = await supabase.from('produtos').delete().eq('id', produtoEditando.id);
      if (error) throw error;

      setMensagemFeedback({ texto: 'Produto excluído!', tipo: 'sucesso' });
      await onRecarregar();
      setTelaAtiva('lista');
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      setMensagemFeedback({ texto: 'Erro ao excluir produto.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  // Clonar produto (TELA010)
  const executarClonagem = async () => {
    if (!produtoEditando || !loja?.id) return;
    try {
      setSalvandoProduto(true);
      setModalClonarAberto(false);

      const novoProdutoPayload = {
        loja_id: loja.id,
        nome: `${produtoEditando.nome} - CÓPIA`,
        categoria_id: produtoEditando.categoria_id || null,
        preco_venda_varejo: produtoEditando.preco_venda_varejo,
        preco_promocional: produtoEditando.preco_promocional,
        promocao_ativa: produtoEditando.promocao_ativa,
        preco_custo: produtoEditando.preco_custo,
        descricao: produtoEditando.descricao,
        codigo_barras: null,
        tipo_unidade: produtoEditando.tipo_unidade,
        destaque: false,
        exibir_catalogo: produtoEditando.exibir_catalogo,
        fotos_urls: produtoEditando.fotos_urls || [],
        estoque_minimo_alerta: produtoEditando.estoque_minimo_alerta || 0,
        quantidade_estoque: 0,
        cor_etiqueta: formData.corEtiqueta || produtoEditando.cor_etiqueta || '#1F2937',
        ativo: true,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('produtos')
        .insert([novoProdutoPayload])
        .select()
        .single();

      if (error) throw error;
      if (data?.id) {
        await persistirCorProdutoSupabase(data.id, formData.corEtiqueta);
      }
      setMensagemFeedback({ texto: 'Produto clonado com sucesso!', tipo: 'sucesso' });
      await onRecarregar();
      if (data) {
        abrirEditarProduto(data as unknown as Produto);
      }
    } catch (err: any) {
      console.error('Erro ao clonar:', err);
      setMensagemFeedback({ texto: 'Erro ao clonar produto.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  // =========================================================================
  // LEITOR DE CÓDIGO DE BARRAS (TELA018)
  // =========================================================================
  const iniciarScannerCamera = async () => {
    try {
      setScannerErro(null);
      setModalScannerAberto(true);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      setStreamCamera(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        rodarDetectorFrame();
      }
    } catch (err: any) {
      console.warn('Erro ao acessar câmera:', err);
      setScannerErro('Não foi possível iniciar a câmera. Digite o código manualmente.');
    }
  };

  const encerrarScannerCamera = () => {
    if (animFrameScannerRef.current) {
      cancelAnimationFrame(animFrameScannerRef.current);
      animFrameScannerRef.current = null;
    }
    if (streamCamera) {
      streamCamera.getTracks().forEach(t => t.stop());
      setStreamCamera(null);
    }
    setTorchLigado(false);
    setModalScannerAberto(false);
  };

  const rodarDetectorFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    let detector: any = null;
    if ('BarcodeDetector' in window) {
      try {
        detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
        });
      } catch (e) {
        detector = null;
      }
    }

    const loop = async () => {
      if (!video || video.readyState < 2) {
        animFrameScannerRef.current = requestAnimationFrame(loop);
        return;
      }

      if (detector) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            if (raw) {
              if (!somScannerMudo) audioService.playBeep();
              if (origemScannerParaIA) {
                setOrigemScannerParaIA(false);
                setPromptCodigoIA(raw);
                encerrarScannerCamera();
                processarPreenchimentoIA('codigo', raw);
              } else {
                setFormData(prev => ({ ...prev, codigoBarras: raw }));
                encerrarScannerCamera();
              }
              return;
            }
          }
        } catch (err) {
          // Frame skip
        }
      }

      animFrameScannerRef.current = requestAnimationFrame(loop);
    };

    animFrameScannerRef.current = requestAnimationFrame(loop);
  };

  const alternarTorch = async () => {
    if (!streamCamera) return;
    try {
      const track = streamCamera.getVideoTracks()[0];
      const capabilities: any = track.getCapabilities?.() || {};
      if (capabilities.torch) {
        const novo = !torchLigado;
        await (track as any).applyConstraints({ advanced: [{ torch: novo }] });
        setTorchLigado(novo);
      }
    } catch (e) {
      console.warn('Torch não suportado:', e);
    }
  };

  // =========================================================================
  // MELHORAR DESCRIÇÃO COM IA (TELA017)
  // =========================================================================
  const melhorarDescricaoComIA = async () => {
    if (!getGeminiApiKey()) {
      setTempApiKey('');
      setModalKeyGemini(true);
      setMensagemFeedback({ texto: 'Configure sua Chave do Google Gemini para usar a IA.', tipo: 'erro' });
      return;
    }
    setGerandoDescricaoIA(true);
    try {
      const catNome = mapaCategorias.get(formData.categoriaId) || 'Geral';
      const novaDescricao = await gerarDescricaoExclusivaIA(
        formData.nome || 'PRODUTO',
        catNome,
        formData.descricao
      );
      setFormData(prev => ({ ...prev, descricao: novaDescricao }));
      setMensagemFeedback({ texto: 'Descrição exclusiva gerada com sucesso!', tipo: 'sucesso' });
    } catch (err) {
      console.warn('Erro ao gerar descrição com IA:', err);
    } finally {
      setGerandoDescricaoIA(false);
    }
  };

  // =========================================================================
  // PREENCHIMENTO AUTOMÁTICO VIA IA (FOTO, TEXTO, CÓDIGO DE BARRAS)
  // =========================================================================
  const processarPreenchimentoIA = async (tipo: 'foto' | 'texto' | 'codigo', valor?: string) => {
    if (!getGeminiApiKey()) {
      setTempApiKey('');
      setModalKeyGemini(true);
      setMensagemFeedback({ texto: 'Configure sua Chave do Google Gemini para usar a IA.', tipo: 'erro' });
      return;
    }
    try {
      setProcessandoIA(true);
      let sugestao: any = null;

      if (tipo === 'foto' && valor) {
        sugestao = await identificarProdutoPorFoto(valor);
      } else if (tipo === 'texto' && promptTextoIA.trim()) {
        sugestao = await identificarProdutoPorTextoOuEan('texto', promptTextoIA.trim());
      } else if (tipo === 'codigo' && (valor || promptCodigoIA.trim())) {
        const cod = valor || promptCodigoIA.trim();
        sugestao = await identificarProdutoPorTextoOuEan('barcode', cod);
      }

      if (sugestao) {
        // Localizar ou criar categoria compatível
        let categoriaMatchId = formData.categoriaId;
        if (sugestao.categoria_sugerida) {
          const achouCat = categorias.find(c =>
            c.nome.toLowerCase().includes(sugestao.categoria_sugerida.toLowerCase())
          );
          if (achouCat) categoriaMatchId = achouCat.id;
        }

        setFormData(prev => ({
          ...prev,
          nome: sugestao.nome ? sugestao.nome.toUpperCase() : prev.nome,
          categoriaId: categoriaMatchId || prev.categoriaId,
          precoVenda: sugestao.preco_venda_estimado ? String(sugestao.preco_venda_estimado).replace('.', ',') : prev.precoVenda,
          precoCusto: sugestao.preco_custo_estimado ? String(sugestao.preco_custo_estimado).replace('.', ',') : prev.precoCusto,
          descricao: sugestao.descricao || prev.descricao,
          codigoBarras: sugestao.codigo_barras || prev.codigoBarras,
          tipoUnidade: (sugestao.tipo_unidade as TipoUnidade) || prev.tipoUnidade,
          fotos: tipo === 'foto' && valor ? [valor, ...prev.fotos.filter((f: string) => f !== valor)].slice(0, 6) : prev.fotos
        }));

        setModalCriarComIAAberto(false);
        setMensagemFeedback({ texto: 'Dados e descrição preenchidos com sucesso pela IA!', tipo: 'sucesso' });
      }
    } catch (err: any) {
      console.warn('Erro ao processar IA:', err);
      setMensagemFeedback({ texto: err?.message || 'Não foi possível identificar todos os dados. Preencha manualmente.', tipo: 'erro' });
    } finally {
      setProcessandoIA(false);
    }
  };

  // Criar Categoria rápida (TELA016)
  const salvarNovaCategoria = async () => {
    if (!novaCategoriaNome.trim() || !loja?.id) return;
    try {
      setCriandoNovaCategoria(true);
      const { data, error } = await supabase
        .from('categorias')
        .insert([{
          loja_id: loja.id,
          nome: novaCategoriaNome.trim().toUpperCase(),
          ordem_exibicao: categorias.length + 1,
          ativo: true,
          criado_em: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      setNovaCategoriaNome('');
      await onRecarregar();
      if (data) {
        setFormData(prev => ({ ...prev, categoriaId: data.id }));
      }
      setModalCategoriasAberto(false);
    } catch (err: any) {
      console.error('Erro ao criar categoria:', err);
    } finally {
      setCriandoNovaCategoria(false);
    }
  };

  // =========================================================================
  // CÂMERA AO VIVO IN-APP DE FOTOS (SEM ESTOURAR MEMÓRIA NO ANDROID)
  // =========================================================================
  const iniciarCameraFoto = async (facingModeParam?: 'environment' | 'user') => {
    try {
      setCameraFotoCarregando(true);
      setCameraFotoErro(null);
      setModalOpcoesFotoAberto(false);
      setModalCameraFotoAberto(true);

      if (streamCameraFoto) {
        streamCameraFoto.getTracks().forEach(t => t.stop());
        setStreamCameraFoto(null);
      }

      const targetFacing = facingModeParam || cameraFotoFacingMode;
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      });

      setStreamCameraFoto(mediaStream);
      if (videoFotoRef.current) {
        videoFotoRef.current.srcObject = mediaStream;
        await videoFotoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Erro ao abrir câmera interna:', err);
      setCameraFotoErro('Não foi possível acessar a câmera diretamente. Tente selecionar da galeria.');
      // Fallback para input simples
      setTimeout(() => {
        fileInputGaleriaRef.current?.click();
      }, 500);
    } finally {
      setCameraFotoCarregando(false);
    }
  };

  const alternarCameraFoto = async () => {
    const novoFacing = cameraFotoFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFotoFacingMode(novoFacing);
    await iniciarCameraFoto(novoFacing);
  };

  const alternarFlashCameraFoto = async () => {
    if (!streamCameraFoto) return;
    const track = streamCameraFoto.getVideoTracks()[0];
    if (!track) return;
    try {
      const novoEstado = !cameraFotoFlash;
      await (track as any).applyConstraints({
        advanced: [{ torch: novoEstado }]
      });
      setCameraFotoFlash(novoEstado);
    } catch (err) {
      console.warn('Lanterna não suportada neste dispositivo', err);
    }
  };

  const capturarFotoCanvas = () => {
    const video = videoFotoRef.current;
    if (!video || video.readyState < 2) return;

    try {
      const maxDim = 1024;
      let width = video.videoWidth || 800;
      let height = video.videoHeight || 800;

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
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

      audioService.playBeep();
      encerrarCameraFoto();

      if (origemCameraParaIA) {
        setOrigemCameraParaIA(false);
        processarPreenchimentoIA('foto', dataUrl);
      } else {
        setFormData(prev => ({
          ...prev,
          fotos: [dataUrl, ...prev.fotos.filter(f => f !== dataUrl)].slice(0, 6)
        }));
        setMensagemFeedback({ texto: 'Foto capturada e otimizada com sucesso!', tipo: 'sucesso' });
      }
    } catch (e: any) {
      console.error('Erro ao capturar foto:', e);
      setMensagemFeedback({ texto: 'Erro ao capturar foto.', tipo: 'erro' });
    }
  };

  const encerrarCameraFoto = () => {
    if (streamCameraFoto) {
      streamCameraFoto.getTracks().forEach(t => t.stop());
      setStreamCameraFoto(null);
    }
    setCameraFotoFlash(false);
    setModalCameraFotoAberto(false);
  };

  // Upload / Captura de Foto com Compressão Automática no Cliente
  const handleProcessarArquivoFoto = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await comprimirArquivoImagem(file, 1024, 0.82);
      if (dataUrl) {
        setFormData(prev => ({
          ...prev,
          fotos: [dataUrl, ...prev.fotos.filter(f => f !== dataUrl)].slice(0, 6)
        }));
        setModalOpcoesFotoAberto(false);
        setMensagemFeedback({ texto: 'Foto adicionada e otimizada!', tipo: 'sucesso' });
      }
    } catch (e) {
      console.error('Erro ao processar arquivo de foto:', e);
      setMensagemFeedback({ texto: 'Erro ao carregar a foto.', tipo: 'erro' });
    }
  };

  // Compartilhar Catálogo / Produto (TELA005 / TELA009)
  const compartilharLink = (url: string, titulo: string, texto: string) => {
    if (navigator.share) {
      navigator.share({ title: titulo, text: texto, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setMensagemFeedback({ texto: 'Link copiado para a área de transferência!', tipo: 'sucesso' });
    }
  };

  const catalogUrl = `${window.location.origin}/catalog/${loja?.slug_catalogo || ''}`;

  // =========================================================================
  // RENDERIZAÇÃO DE TOAST
  // =========================================================================
  const renderToast = () => {
    if (!mensagemFeedback) return null;
    return (
      <div className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-extrabold animate-in fade-in slide-in-from-top-3 ${
        mensagemFeedback.tipo === 'sucesso' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
      }`}>
        {mensagemFeedback.tipo === 'sucesso' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
        <span className="flex-1 leading-snug">{mensagemFeedback.texto}</span>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // TELA 014: VISUALIZADOR DE FOTO EM TELA CHEIA
  // -------------------------------------------------------------------------
  if (modalFotoFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between items-center p-4 select-none">
        <div className="w-full flex justify-end">
          <button
            type="button"
            onClick={() => setModalFotoFullscreen(null)}
            className="p-3 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center w-full max-h-[85vh]">
          <img
            src={modalFotoFullscreen}
            alt="Foto do Produto"
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
          />
        </div>
        <div className="h-10" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 018: LEITOR DE CÓDIGO DE BARRAS (CÂMERA)
  // -------------------------------------------------------------------------
  if (modalScannerAberto) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col text-white select-none">
        {/* Header TELA018 */}
        <div className="h-16 border-b border-slate-800 px-4 flex items-center justify-between bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={encerrarScannerCamera}
            className="p-2 text-slate-300 hover:text-white"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-extrabold text-sm sm:text-base text-slate-100">Cadastrar código de barras</h2>
          <button
            type="button"
            onClick={() => setSomScannerMudo(!somScannerMudo)}
            className="p-2 text-slate-300 hover:text-white"
          >
            {somScannerMudo ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Viewfinder Câmera */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Linha Guia Vermelha */}
          <div className="absolute inset-x-8 h-0.5 bg-rose-500 shadow-lg shadow-rose-500/50 pointer-events-none" />

          {/* Botão Lanterna (Torch) */}
          <button
            type="button"
            onClick={alternarTorch}
            className="absolute top-4 right-4 px-3.5 py-2 rounded-full bg-slate-900/80 text-slate-200 text-xs font-bold flex items-center gap-2 backdrop-blur border border-slate-700/50 shadow-lg"
          >
            {torchLigado ? <Flashlight className="w-4 h-4 text-amber-400" /> : <FlashlightOff className="w-4 h-4" />}
            <span>{torchLigado ? 'Torch On' : 'Torch Off'}</span>
          </button>
        </div>

        {/* Rodapé TELA018 */}
        <div className="p-6 bg-slate-900 flex flex-col items-center justify-center space-y-4 shrink-0 text-center">
          <p className="text-xs sm:text-sm text-slate-300 font-semibold max-w-xs leading-relaxed">
            Posicione o código de barras do produto na linha vermelha para cadastrá-lo
          </p>

          {scannerErro && (
            <p className="text-xs text-rose-400 font-bold">{scannerErro}</p>
          )}

          <div className="w-full max-w-xs flex gap-2">
            <input
              type="text"
              value={formData.codigoBarras}
              onChange={(e) => setFormData(prev => ({ ...prev, codigoBarras: e.target.value }))}
              placeholder="Ou digite o código aqui..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 font-medium"
            />
            <button
              type="button"
              onClick={encerrarScannerCamera}
              className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-sm font-extrabold shadow-md"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 006: FILTROS DE ESTOQUE
  // -------------------------------------------------------------------------
  if (telaAtiva === 'filtros') {
    return (
      <div className="fixed inset-0 z-40 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA006 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTelaAtiva('lista')}
              className="p-2 text-slate-600 hover:text-slate-900"
            >
              <X className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800">Filtros</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setFiltroSemEstoque(false);
              setFiltroMinimo(false);
              setFiltroAcimaMinimo(false);
              setFiltroSemControle(false);
              setCategoriasFiltro([]);
              setOrdenacaoEstoque('menor_estoque');
            }}
            className="text-xs sm:text-sm font-extrabold text-teal-600 hover:text-teal-700 px-2 py-1"
          >
            Limpar
          </button>
        </div>

        {/* Conteúdo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Seção Estoque */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wider">Estoque</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroSemEstoque}
                  onChange={(e) => setFiltroSemEstoque(e.target.checked)}
                  className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold flex items-center gap-1.5">
                  Sem estoque <span className="text-rose-500 font-bold">🔴</span>
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroMinimo}
                  onChange={(e) => setFiltroMinimo(e.target.checked)}
                  className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold flex items-center gap-1.5">
                  Mínimo <span className="text-amber-500 font-bold">🟡</span>
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroAcimaMinimo}
                  onChange={(e) => setFiltroAcimaMinimo(e.target.checked)}
                  className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold">Acima do mínimo</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtroSemControle}
                  onChange={(e) => setFiltroSemControle(e.target.checked)}
                  className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold">Sem controle de estoque</span>
              </label>
            </div>
          </div>

          {/* Seção Categorias */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wider">Categorias</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {categorias.map((cat) => {
                const checked = categoriasFiltro.includes(cat.id);
                return (
                  <label key={cat.id} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCategoriasFiltro(prev => [...prev, cat.id]);
                        } else {
                          setCategoriasFiltro(prev => prev.filter(id => id !== cat.id));
                        }
                      }}
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-semibold uppercase truncate">{cat.nome}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Seção Ordenar Por */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wider">Ordenar por</h2>
            <div className="grid grid-cols-2 gap-2 border border-slate-200 rounded-2xl p-1 bg-slate-50">
              <button
                type="button"
                onClick={() => setOrdenacaoEstoque('menor_estoque')}
                className={`py-3.5 px-2 text-xs sm:text-sm font-bold rounded-xl text-center transition ${
                  ordenacaoEstoque === 'menor_estoque' ? 'text-teal-600 bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Menor estoque
              </button>

              <button
                type="button"
                onClick={() => setOrdenacaoEstoque('a_z')}
                className={`py-3.5 px-2 text-xs sm:text-sm font-bold rounded-xl text-center transition ${
                  ordenacaoEstoque === 'a_z' ? 'text-teal-600 bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                A-Z
              </button>

              <button
                type="button"
                onClick={() => setOrdenacaoEstoque('maior_estoque')}
                className={`py-3.5 px-2 text-xs sm:text-sm font-bold rounded-xl text-center transition ${
                  ordenacaoEstoque === 'maior_estoque' ? 'text-teal-600 bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Maior estoque
              </button>

              <button
                type="button"
                onClick={() => setOrdenacaoEstoque('z_a')}
                className={`py-3.5 px-2 text-xs sm:text-sm font-bold rounded-xl text-center transition ${
                  ordenacaoEstoque === 'z_a' ? 'text-teal-600 bg-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Z-A
              </button>
            </div>
          </div>
        </div>

        {/* Botão Filtrar TELA006 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('lista')}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
          >
            Filtrar
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 011: HISTÓRICO DE MOVIMENTAÇÕES DE ESTOQUE
  // -------------------------------------------------------------------------
  if (telaAtiva === 'movimentacoes') {
    return (
      <div className="fixed inset-0 z-40 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA011 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('detalhes')}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-sm sm:text-base text-slate-800">Movimentações</h1>
          <button
            type="button"
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>

        {/* Banner do Produto TELA011 */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
              {formData.fotos[0] ? (
                <img src={formData.fotos[0]} alt="Thumb" className="w-full h-full object-cover" />
              ) : (
                <Tag className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <span className="font-extrabold text-xs sm:text-sm text-slate-800 uppercase max-w-[200px] line-clamp-2">
              {formData.nome || 'PRODUTO'}
            </span>
          </div>
          <span className={`font-black text-base sm:text-lg ${formData.quantidadeEstoque < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
            {formData.quantidadeEstoque}
          </span>
        </div>

        {/* Lista de Movimentações */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {[
            { id: 1, tipo: 'venda', qtd: 4, seq: '#6', data: '20/8/2026 15:55', canal: 'catalog', saldo: formData.quantidadeEstoque },
            { id: 2, tipo: 'venda', qtd: 2, seq: '#5', data: '20/8/2026 15:53', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: formData.quantidadeEstoque + 4 },
            { id: 3, tipo: 'venda', qtd: 1, seq: '#4', data: '20/8/2026 15:49', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: formData.quantidadeEstoque + 6 },
            { id: 4, tipo: 'venda', qtd: 30, seq: '#3', data: '20/8/2026 15:39', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: formData.quantidadeEstoque + 7 },
            { id: 5, tipo: 'saida', qtd: 0, seq: '#2', data: '18/8/2026 19:26', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: 0 },
            { id: 6, tipo: 'entrada', qtd: 0, seq: '#1', data: '18/8/2026 19:26', canal: usuario?.nome_completo || 'Janaina Rocha', saldo: 0 }
          ].map((mov) => (
            <div key={mov.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${mov.tipo === 'entrada' ? 'text-teal-600 bg-teal-50' : 'text-rose-600 bg-rose-50'}`}>
                  {mov.tipo === 'entrada' ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 capitalize">
                    {mov.tipo}: {mov.qtd}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {mov.seq} - {mov.data} - {mov.canal}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[11px] text-slate-400 uppercase font-bold">Saldo</p>
                <p className={`font-black text-sm sm:text-base ${mov.saldo < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {mov.saldo}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 020: PRODUTOS COM VARIAÇÕES
  // -------------------------------------------------------------------------
  if (telaAtiva === 'variacoes') {
    return (
      <div className="fixed inset-0 z-40 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA020 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('detalhes')}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-sm sm:text-base text-slate-800">Variações</h1>
          <button
            type="button"
            onClick={() => alert('Use variações para cadastrar produtos com múltiplos atributos como cor, tamanho, voltagem ou sabor.')}
            className="p-2 text-slate-400 hover:text-slate-700"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Ilustração e Descrição TELA020 */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center space-y-6">
          <div className="w-52 h-40 border border-slate-200 rounded-3xl bg-slate-50 flex flex-col items-center justify-center p-4 relative shadow-sm">
            <div className="flex gap-2.5 items-center">
              <div className="w-11 h-11 rounded-xl bg-teal-500 flex items-center justify-center text-white font-black text-sm">P</div>
              <div className="w-11 h-11 rounded-xl bg-slate-200 flex items-center justify-center text-slate-700 font-black text-sm">M</div>
              <div className="w-11 h-11 rounded-xl bg-slate-700 flex items-center justify-center text-white font-black text-sm">G</div>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase mt-3">Camiseta / Variações</span>
          </div>

          <div className="space-y-2 max-w-xs">
            <h2 className="font-extrabold text-base sm:text-lg text-slate-800">Produtos com variações</h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Adicione variações como <strong className="text-slate-700">cor, tamanho, voltagem ou sabor</strong> aos seus produtos, mantenha seu estoque organizado e facilite as vendas
            </p>
          </div>

          <div className="w-full space-y-3 pt-2">
            <button
              type="button"
              onClick={() => {
                const nova = { valor_variacao_1: 'Tamanho P', quantidade_estoque: 0, preco_venda_varejo: parseFloat(formData.precoVenda) || 0 };
                setFormData(prev => ({ ...prev, variacoes: [...prev.variacoes, nova] }));
                setMensagemFeedback({ texto: 'Variação adicionada!', tipo: 'sucesso' });
              }}
              className="w-full p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <span>Adicionar variação</span>
              <div className="w-8 h-8 rounded-xl bg-teal-500 text-white flex items-center justify-center font-bold">
                <Plus className="w-5 h-5" />
              </div>
            </button>
          </div>
        </div>

        {/* Botão Voltar TELA020 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('detalhes')}
            className="w-full py-4 rounded-2xl border border-teal-500 text-teal-600 font-extrabold text-sm sm:text-base hover:bg-teal-50 transition cursor-pointer"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 016: SELETOR DE CATEGORIAS
  // -------------------------------------------------------------------------
  if (modalCategoriasAberto) {
    const categoriasFiltradasModal = categorias.filter(c =>
      c.nome.toLowerCase().includes(buscaCategoria.toLowerCase().trim())
    );

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA016 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalCategoriasAberto(false)}
              className="p-2 text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800">
              Categorias ({categorias.length})
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              const nome = prompt('Nome da nova categoria:');
              if (nome && nome.trim()) {
                setNovaCategoriaNome(nome);
                salvarNovaCategoria();
              }
            }}
            className="p-2 text-teal-600 hover:text-teal-700 font-extrabold"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* Campo de Busca TELA016 com Pesquisa por Voz */}
        <div className="p-3 border-b border-slate-100 bg-white shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input
              type="text"
              value={buscaCategoria}
              onChange={(e) => setBuscaCategoria(e.target.value)}
              placeholder="Buscar categoria ou falar..."
              className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 font-medium"
            />
            <button
              type="button"
              onClick={() => alternarPesquisaPorVoz(setBuscaCategoria)}
              className={`absolute right-2.5 p-1.5 rounded-lg transition ${
                ouvindoVoz ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Pesquisar por voz"
            >
              {ouvindoVoz ? <Mic className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Lista de Categorias TELA016 */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => {
              setFormData(prev => ({ ...prev, categoriaId: '' }));
              setModalCategoriasAberto(false);
            }}
            className="w-full px-4 py-4 text-left text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50 transition flex items-center justify-between"
          >
            <span>Sem Categoria</span>
            {!formData.categoriaId && <Check className="w-5 h-5 text-teal-600" />}
          </button>

          {categoriasFiltradasModal.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setFormData(prev => ({ ...prev, categoriaId: cat.id }));
                setModalCategoriasAberto(false);
              }}
              className="w-full px-4 py-4 text-left text-xs sm:text-sm font-bold text-slate-800 uppercase hover:bg-slate-50 transition flex items-center justify-between"
            >
              <span>{cat.nome}</span>
              {formData.categoriaId === cat.id && <Check className="w-5 h-5 text-teal-600" />}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 017: EDITOR DE DESCRIÇÃO COM IA EXCLUSIVA
  // -------------------------------------------------------------------------
  if (modalDescricaoAberto) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA017 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalDescricaoAberto(false)}
              className="p-2 text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800">Descrição Comercial</h1>
          </div>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, descricao: '' }))}
            className="text-xs sm:text-sm font-extrabold text-teal-600 hover:text-teal-700 px-2 py-1"
          >
            Limpar
          </button>
        </div>

        {/* Conteúdo TELA017 */}
        <div className="flex-1 p-4 flex flex-col justify-between overflow-y-auto space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Texto da Descrição
            </label>
            <textarea
              rows={9}
              value={formData.descricao}
              onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
              placeholder="Digite os detalhes do produto, benefícios, modo de uso ou deixe a IA criar uma descrição exclusiva para você..."
              className="w-full p-4 border-2 border-teal-500/80 text-xs sm:text-sm font-medium uppercase leading-relaxed text-slate-800 focus:outline-none bg-slate-50/60 rounded-2xl resize-none shadow-sm"
            />
          </div>

          {/* Card IA Inferior */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-teal-50 to-indigo-50 border border-teal-200/60 shadow-sm">
              <div className="text-left">
                <p className="text-xs sm:text-sm font-black text-slate-800">Melhorar com Inteligência Artificial</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Gera um texto exclusivo, detalhado e persuasivo</p>
              </div>
              <button
                type="button"
                disabled={gerandoDescricaoIA}
                onClick={melhorarDescricaoComIA}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 hover:bg-slate-800 transition shadow-md cursor-pointer disabled:opacity-50 shrink-0 ml-2"
              >
                {gerandoDescricaoIA ? (
                  <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-teal-400" />
                )}
                <span>{gerandoDescricaoIA ? 'Gerando...' : 'Melhorar IA'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Botão Salvar TELA017 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setModalDescricaoAberto(false)}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
          >
            Salvar Descrição
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 015: GESTÃO DE FOTOS (GRADE DE SLOTS)
  // -------------------------------------------------------------------------
  if (modalGaleriaFotosAberto) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA015 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center gap-3 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setModalGaleriaFotosAberto(false)}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-base sm:text-lg text-slate-800">Galeria de Fotos</h1>
        </div>

        {/* Conteúdo com Foto Principal e Grade de Slots */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col items-center">
          {/* Foto Principal */}
          {formData.fotos[0] ? (
            <div className="relative w-64 h-64 border border-slate-200 rounded-3xl overflow-hidden shadow-md flex items-center justify-center bg-slate-50">
              <img src={formData.fotos[0]} alt="Principal" className="w-full h-full object-contain" />
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, fotos: prev.fotos.slice(1) }))}
                className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/80 text-white hover:bg-rose-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="w-64 h-64 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 bg-slate-50">
              <Camera className="w-12 h-12 mb-2 text-slate-300" />
              <span className="text-xs sm:text-sm font-bold">Nenhuma foto adicionada</span>
            </div>
          )}

          {/* Grade 2x3 de Slots */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {/* Slot 1: Botão Adicionar */}
            <label className="h-24 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/50 flex flex-col items-center justify-center text-teal-600 hover:bg-teal-50 transition cursor-pointer">
              <Plus className="w-6 h-6 mb-0.5" />
              <span className="text-[10px] font-bold uppercase">Adicionar</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleProcessarArquivoFoto(e.target.files?.[0])}
                className="hidden"
              />
            </label>

            {/* Slots 2 a 6 */}
            {[1, 2, 3, 4, 5].map((idx) => {
              const foto = formData.fotos[idx];
              if (foto) {
                return (
                  <div key={idx} className="relative h-24 rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 shadow-sm">
                    <img src={foto} alt={`Foto ${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }))}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/80 text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }
              return (
                <div key={idx} className="h-24 rounded-2xl border border-slate-100 bg-slate-50/60" />
              );
            })}
          </div>
        </div>

        {/* Botão Salvar TELA015 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setModalGaleriaFotosAberto(false)}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
          >
            Concluir Fotos
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 012: TECLADO NUMÉRICO - ESTOQUE MÍNIMO
  // -------------------------------------------------------------------------
  if (modalEstoqueMinimoAberto) {
    const handleDigitoTeclado = (val: string) => {
      if (val === 'backspace') {
        setTecladoValorEstoqueMin(prev => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      } else {
        setTecladoValorEstoqueMin(prev => (prev === '0' ? val : prev + val));
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Header TELA012 */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center gap-3 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setModalEstoqueMinimoAberto(false)}
            className="p-2 text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-base sm:text-lg text-slate-800">Estoque mínimo</h1>
        </div>

        {/* Visor Grande TELA012 */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="border-b-4 border-slate-900 px-10 py-3 mb-8">
            <span className="font-light text-7xl sm:text-8xl text-slate-900 tracking-tight">{tecladoValorEstoqueMin}</span>
          </div>
        </div>

        {/* Teclado Numérico Virtual TELA012 */}
        <div className="border-t border-slate-100 bg-white grid grid-cols-3 divide-x divide-y divide-slate-100 text-center">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigitoTeclado(num)}
              className="py-6 text-2xl font-bold text-slate-800 active:bg-slate-100"
            >
              {num}
            </button>
          ))}
          <div className="py-6" />
          <button
            type="button"
            onClick={() => handleDigitoTeclado('0')}
            className="py-6 text-2xl font-bold text-slate-800 active:bg-slate-100"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleDigitoTeclado('backspace')}
            className="py-6 flex items-center justify-center text-slate-700 active:bg-slate-100"
          >
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* Botão OK TELA012 */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => {
              const val = parseInt(tecladoValorEstoqueMin, 10) || 0;
              setFormData(prev => ({ ...prev, estoqueMinimo: val }));
              setModalEstoqueMinimoAberto(false);
            }}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 009: CARD PÚBLICO DO PRODUTO (COMPARTILHAR)
  // -------------------------------------------------------------------------
  if (modalPublicCardAberto) {
    const precoVendaFmt = parseFloat(formData.precoVenda || '0').toFixed(2).replace('.', ',');
    const precoPromoFmt = formData.precoPromocional ? parseFloat(formData.precoPromocional).toFixed(2).replace('.', ',') : null;

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col text-slate-900 select-none">
        {/* Botão Fechar TELA009 */}
        <div className="p-4 flex justify-start">
          <button
            type="button"
            onClick={() => setModalPublicCardAberto(false)}
            className="p-2 text-slate-700 hover:text-slate-900"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Conteúdo Visual TELA009 */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          <div className="w-full h-72 rounded-3xl border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center shadow-inner">
            {formData.fotos[0] ? (
              <img src={formData.fotos[0]} alt="Produto" className="max-w-full max-h-full object-contain" />
            ) : (
              <Tag className="w-16 h-16 text-slate-300" />
            )}
          </div>

          <div className="space-y-1">
            <h1 className="font-black text-lg sm:text-xl text-slate-900 uppercase">
              {formData.nome || 'NOME DO PRODUTO'}
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {mapaCategorias.get(formData.categoriaId) || 'SEM CATEGORIA'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-teal-600">
                R$ {precoPromoFmt || precoVendaFmt}
              </span>
              {precoPromoFmt && (
                <span className="text-xs text-slate-400 line-through">
                  R$ {precoVendaFmt}
                </span>
              )}
            </div>
            {formData.codigoBarras && (
              <span className="text-xs text-slate-400 font-semibold">
                COD. {formData.codigoBarras}
              </span>
            )}
          </div>

          {formData.descricao && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed uppercase pt-2">
              {formData.descricao}
            </p>
          )}
        </div>

        {/* Botão Compartilhar TELA009 */}
        <div className="p-4 border-t border-slate-200 bg-slate-900 text-white shrink-0">
          <button
            type="button"
            onClick={() => {
              compartilharLink(
                `${catalogUrl}?p=${produtoEditando?.id || ''}`,
                formData.nome,
                `Confira ${formData.nome} por apenas R$ ${precoPromoFmt || precoVendaFmt} no nosso catálogo!`
              );
            }}
            className="w-full py-3.5 flex items-center justify-center gap-2 text-sm sm:text-base font-extrabold text-slate-200 hover:text-white"
          >
            <Share2 className="w-5 h-5" />
            <span>Compartilhar Produto</span>
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 004 / 007 / 008 / 008A: NOVO / EDIÇÃO / DETALHES DO PRODUTO
  // -------------------------------------------------------------------------
  if (telaAtiva === 'novo' || telaAtiva === 'detalhes') {
    const isNovo = telaAtiva === 'novo';
    const precoVendaFmt = parseFloat(formData.precoVenda || '0').toFixed(2).replace('.', ',');
    const precoPromoFmt = formData.precoPromocional ? parseFloat(formData.precoPromocional).toFixed(2).replace('.', ',') : null;

    // Resumo da descrição para a tarja inferior (estimativa de aproximadamente 20 caracteres)
    const textoTarjaResumo = (formData.nome || 'PRODUTO').slice(0, 22).toUpperCase();

    return (
      <div className="flex flex-col h-full bg-white text-slate-900 overflow-hidden select-none">
        {renderToast()}

        {/* Inputs de arquivo ocultos para Captura de Câmera e Galeria */}
        <input
          ref={fileInputCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleProcessarArquivoFoto(e.target.files?.[0])}
          className="hidden"
        />
        <input
          ref={fileInputGaleriaRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleProcessarArquivoFoto(e.target.files?.[0])}
          className="hidden"
        />

        {/* Header Superior (TELA004 / TELA007 / TELA008) */}
        <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTelaAtiva('lista')}
              className="p-1 text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-sm sm:text-base text-slate-800 truncate max-w-[170px]">
              {isNovo ? 'Novo produto' : formData.nome || 'Editar Produto'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Preenchimento Automático com IA */}
            <button
              type="button"
              onClick={() => setModalCriarComIAAberto(true)}
              className="px-3.5 py-2 rounded-xl border-2 border-teal-500 text-teal-700 bg-teal-50/50 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 hover:bg-teal-100 shadow-sm"
              title="Preencher com Inteligência Artificial"
            >
              <Sparkles className="w-4 h-4 text-teal-600" />
              <span>IA</span>
            </button>

            {!isNovo && (
              <>
                <button
                  type="button"
                  onClick={() => setModalPublicCardAberto(true)}
                  className="p-2 text-slate-600 hover:text-slate-900"
                  title="Compartilhar Card Público"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setModalClonarAberto(true)}
                  className="p-2 text-slate-600 hover:text-slate-900"
                  title="Clonar Produto"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleExcluirProduto}
                  className="p-2 text-slate-600 hover:text-rose-600"
                  title="Excluir Produto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Abas: CADASTRO | ESTOQUE (TELA007 / TELA008) */}
        <div className="flex border-b border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setAbaFormulario('cadastro')}
            className={`flex-1 py-3.5 text-xs sm:text-sm font-extrabold uppercase transition relative ${
              abaFormulario === 'cadastro' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-slate-400'
            }`}
          >
            Cadastro
          </button>
          <button
            type="button"
            onClick={() => setAbaFormulario('estoque')}
            className={`flex-1 py-3.5 text-xs sm:text-sm font-extrabold uppercase transition relative flex items-center justify-center gap-1.5 ${
              abaFormulario === 'estoque' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-slate-400'
            }`}
          >
            <span>Estoque</span>
            {formData.quantidadeEstoque <= 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            )}
          </button>
        </div>

        {/* CORPO DA ABA CADASTRO (TELA008 & TELA008A) */}
        {abaFormulario === 'cadastro' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Card Preview Superior com Seletor de Cor e Acesso a Mídia */}
            <div className="flex items-center justify-center gap-4 py-3 bg-slate-50/80 rounded-3xl p-3.5 border border-slate-100 shadow-inner">
              {/* Botão Cor da Etiqueta / Tarja (TELA013) */}
              <button
                type="button"
                onClick={() => {
                  setCorSelecionadaModal(formData.corEtiqueta);
                  setAplicarCorEmMassa(false);
                  setModalCorEtiquetaAberto(true);
                }}
                className="w-8 h-8 rounded-xl border-2 border-white shadow-md transition active:scale-95 shrink-0"
                style={{ backgroundColor: formData.corEtiqueta }}
                title="Alterar Cor da Tarja Inferior"
              />

              {/* Preview do Card: Fundo neutro/foto mantido, e Tarja Inferior colorida estritamente embaixo */}
              <div
                onClick={() => formData.fotos[0] && setModalFotoFullscreen(formData.fotos[0])}
                className="w-36 h-40 rounded-2xl bg-white border border-slate-200 p-0 flex flex-col justify-between shadow-md relative overflow-hidden cursor-pointer"
              >
                {/* Imagem do Produto (Ocupa a área visual superior/central sem alteração de fundo) */}
                <div className="flex-1 w-full bg-slate-50 flex items-center justify-center overflow-hidden">
                  {formData.fotos[0] ? (
                    <img
                      src={formData.fotos[0]}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Tag className="w-8 h-8 text-slate-300" />
                  )}
                </div>

                {/* Tarja Inferior do Card (Modificada exclusivamente pela cor de etiqueta, contendo ~20 caracteres resumidos) */}
                <div
                  className="w-full px-2.5 py-1.5 text-white flex flex-col justify-center shrink-0"
                  style={{ backgroundColor: formData.corEtiqueta }}
                >
                  <p className="text-[10px] font-extrabold uppercase truncate leading-tight">
                    {textoTarjaResumo}
                  </p>
                  <div className="flex items-baseline justify-between gap-1 mt-0.5">
                    <p className="text-xs font-black text-white">
                      R$ {precoPromoFmt || precoVendaFmt}
                    </p>
                    {precoPromoFmt && (
                      <p className="text-[9px] text-white/70 line-through">
                        R$ {precoVendaFmt}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Botão de Opções de Foto (Câmera ao vivo / Galeria / Gerenciador) */}
              <button
                type="button"
                onClick={() => setModalOpcoesFotoAberto(true)}
                className="relative p-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 shadow-sm transition active:scale-95 cursor-pointer shrink-0"
                title="Tirar Foto ou Escolher da Galeria"
              >
                <Camera className="w-6 h-6 text-teal-600" />
                {formData.fotos.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-teal-500 text-white rounded-full text-[10px] flex items-center justify-center font-black shadow">
                    {formData.fotos.length}
                  </span>
                )}
              </button>
            </div>

            {/* Campos Obrigatórios */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do Produto</label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Informe o nome completo do item"
                  className="w-full py-2 text-sm sm:text-base font-extrabold text-slate-800 uppercase border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preço de Venda</label>
                <div className="flex items-center">
                  <span className="text-sm sm:text-base font-extrabold text-slate-500 mr-1.5">R$</span>
                  <input
                    type="text"
                    value={formData.precoVenda}
                    onChange={(e) => setFormData(prev => ({ ...prev, precoVenda: e.target.value }))}
                    placeholder="0,00"
                    className="w-full py-2 text-sm sm:text-base font-extrabold text-slate-800 border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Accordion: Opcionais (TELA008 & TELA008A) */}
            <div className="border-t border-slate-200 pt-3 space-y-4">
              <button
                type="button"
                onClick={() => setOpcionaisExpandido(!opcionaisExpandido)}
                className="w-full flex items-center justify-between text-left"
              >
                <div>
                  <h3 className="font-extrabold text-xs sm:text-sm text-slate-800">Opcionais</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Experimente a descrição gerada com IA</p>
                </div>
                {opcionaisExpandido ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {opcionaisExpandido && (
                <div className="space-y-4 pt-1">
                  {/* Preço promocional */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preço promocional</label>
                    <div className="relative flex items-center">
                      <span className="text-sm sm:text-base font-extrabold text-slate-500 mr-1.5">R$</span>
                      <input
                        type="text"
                        value={formData.precoPromocional}
                        onChange={(e) => setFormData(prev => ({ ...prev, precoPromocional: e.target.value }))}
                        placeholder="0,00"
                        className="w-full py-2 pr-8 text-sm sm:text-base font-extrabold text-slate-800 border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                      />
                      {formData.precoPromocional && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, precoPromocional: '' }))}
                          className="absolute right-0 p-1.5 text-slate-400 hover:text-slate-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      O preço de venda será riscado (ex: de R$ 10,00 por R$ 5,00)
                    </p>
                  </div>

                  {/* Seletor de Categoria (TELA016) */}
                  <div
                    onClick={() => setModalCategoriasAberto(true)}
                    className="border-b-2 border-slate-300 py-2.5 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Categoria</span>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase">
                        {mapaCategorias.get(formData.categoriaId) || 'Selecione uma categoria'}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>

                  {/* Seletor de Descrição (TELA017) */}
                  <div
                    onClick={() => setModalDescricaoAberto(true)}
                    className="border-b-2 border-slate-300 py-2.5 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex-1 pr-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Descrição Comercial</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 uppercase line-clamp-2">
                        {formData.descricao || 'Toque para adicionar uma descrição exclusiva...'}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                  </div>

                  {/* Código com Leitor de Código de Barras (TELA018) */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Código de Barras / EAN</label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={formData.codigoBarras}
                        onChange={(e) => setFormData(prev => ({ ...prev, codigoBarras: e.target.value }))}
                        placeholder="Código de barras ou interno"
                        className="w-full py-2 pr-10 text-sm sm:text-base font-extrabold text-slate-800 border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={iniciarScannerCamera}
                        className="absolute right-0 p-2 text-slate-600 hover:text-teal-600 cursor-pointer"
                        title="Ler Código de Barras com a Câmera"
                      >
                        <QrCode className="w-5 h-5 text-teal-600" />
                      </button>
                    </div>
                  </div>

                  {/* Preço de Custo */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Custo do Produto</label>
                    <div className="flex items-center">
                      <span className="text-sm sm:text-base font-extrabold text-slate-500 mr-1.5">R$</span>
                      <input
                        type="text"
                        value={formData.precoCusto}
                        onChange={(e) => setFormData(prev => ({ ...prev, precoCusto: e.target.value }))}
                        placeholder="0,00"
                        className="w-full py-2 text-sm sm:text-base font-extrabold text-slate-800 border-b-2 border-slate-300 focus:border-teal-500 focus:outline-none bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Vender por (TELA019) */}
                  <div
                    onClick={() => setModalVenderPorAberto(true)}
                    className="border-b-2 border-slate-300 py-2.5 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Vender por</span>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-800">
                        {formData.tipoUnidade === 'un' ? 'Unidade' : 'Fração (Kilo, Litro, Metro, etc.)'}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>

                  {/* Destacar este produto */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-700">Destacar este produto</span>
                      <HelpCircle className="w-4 h-4 text-slate-400" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, destaque: !prev.destaque }))}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                        formData.destaque ? 'bg-teal-500' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                        formData.destaque ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  {/* Exibir produto no catálogo */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-xs sm:text-sm font-bold text-slate-700">Exibir produto no catálogo</span>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, exibirCatalogo: !prev.exibirCatalogo }))}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                        formData.exibirCatalogo ? 'bg-teal-500' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                        formData.exibirCatalogo ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Variantes (TELA020) */}
            <div className="border-t border-slate-200 pt-3 pb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-black text-xs sm:text-sm text-slate-800">Variantes</span>
                <span className="px-2.5 py-0.5 rounded-full bg-teal-500 text-white text-[10px] font-black uppercase">
                  Novo
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTelaAtiva('variacoes')}
                className="text-xs sm:text-sm font-extrabold text-teal-600 hover:text-teal-700 uppercase"
              >
                Adicionar
              </button>
            </div>
          </div>
        )}

        {/* CORPO DA ABA ESTOQUE (TELA007) */}
        {abaFormulario === 'estoque' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Gerenciar Estoque Switch */}
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs sm:text-sm font-bold text-slate-700">Gerenciar estoque</span>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, gerenciarEstoque: !prev.gerenciarEstoque }))}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                    formData.gerenciarEstoque ? 'bg-teal-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                    formData.gerenciarEstoque ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Display Central Grande de Estoque */}
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/80 rounded-3xl border border-slate-100 p-6">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                  Estoque atual
                </span>
                <span className={`text-6xl sm:text-7xl font-black tracking-tight ${
                  formData.quantidadeEstoque < 0 ? 'text-rose-600' : 'text-slate-800'
                }`}>
                  {formData.quantidadeEstoque}
                </span>
                <span className="text-xs text-slate-400 mt-3 font-semibold">
                  Atualizado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Botões de Ação de Estoque */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setTelaAtiva('movimentacoes')}
                  className="w-full p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                >
                  <span>Histórico de movimentações</span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTecladoValorEstoqueMin(String(formData.estoqueMinimo));
                    setModalEstoqueMinimoAberto(true);
                  }}
                  className="w-full p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                >
                  <span>Estoque mínimo: {formData.estoqueMinimo}</span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Botão Inferior Salvar / Adicionar */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <button
            type="button"
            disabled={salvandoProduto}
            onClick={salvarProduto}
            className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-sm sm:text-base shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {salvandoProduto ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span>{isNovo ? 'Adicionar produto' : 'Salvar'}</span>
            )}
          </button>
        </div>

        {/* MODAL DE OPÇÕES DE FOTO (CÂMERA / GALERIA / GERENCIADOR) */}
        {modalOpcoesFotoAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
            <div className="bg-white rounded-t-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-sm sm:text-base text-slate-800">Foto do Produto</h3>
                <button
                  type="button"
                  onClick={() => setModalOpcoesFotoAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => iniciarCameraFoto('environment')}
                  className="w-full p-4 rounded-2xl bg-teal-50 text-teal-800 font-extrabold text-xs sm:text-sm flex items-center gap-3 hover:bg-teal-100 transition shadow-sm cursor-pointer active:scale-98"
                >
                  <Camera className="w-5 h-5 text-teal-600" />
                  <span>Tirar Foto com a Câmera</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fileInputGaleriaRef.current?.click();
                  }}
                  className="w-full p-4 rounded-2xl bg-slate-50 text-slate-800 font-extrabold text-xs sm:text-sm flex items-center gap-3 hover:bg-slate-100 transition shadow-sm cursor-pointer active:scale-98"
                >
                  <ImageIcon className="w-5 h-5 text-slate-600" />
                  <span>Escolher da Galeria do Celular</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalOpcoesFotoAberto(false);
                    setModalGaleriaFotosAberto(true);
                  }}
                  className="w-full p-4 rounded-2xl border border-slate-200 text-slate-700 font-extrabold text-xs sm:text-sm flex items-center gap-3 hover:bg-slate-50 transition cursor-pointer"
                >
                  <Tag className="w-5 h-5 text-slate-500" />
                  <span>Gerenciar Fotos do Produto ({formData.fotos.length}/6)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CÂMERA AO VIVO IN-APP (TIRAR FOTO SEM ESTOURAR MEMÓRIA DO ANDROID) */}
        {modalCameraFotoAberto && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none">
            {/* Header com controles da Câmera */}
            <div className="p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
              <button
                type="button"
                onClick={encerrarCameraFoto}
                className="p-2.5 rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/30 transition cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={alternarFlashCameraFoto}
                  className={`p-2.5 rounded-full backdrop-blur-md transition cursor-pointer ${
                    cameraFotoFlash ? 'bg-amber-400 text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                  title="Lanterna"
                >
                  {cameraFotoFlash ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
                </button>

                <button
                  type="button"
                  onClick={alternarCameraFoto}
                  className="p-2.5 rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/30 transition cursor-pointer"
                  title="Alternar Câmera"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewfinder da Câmera */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
              <video
                ref={videoFotoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {cameraFotoCarregando && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
                  <p className="text-xs font-bold uppercase tracking-wider">Iniciando câmera...</p>
                </div>
              )}

              {/* Guia visual de enquadramento do produto */}
              <div className="absolute w-64 h-64 border-2 border-white/40 rounded-3xl pointer-events-none shadow-2xl flex items-center justify-center">
                <div className="w-4 h-4 border-t-2 border-l-2 border-teal-400 absolute top-2 left-2 rounded-tl" />
                <div className="w-4 h-4 border-t-2 border-r-2 border-teal-400 absolute top-2 right-2 rounded-tr" />
                <div className="w-4 h-4 border-b-2 border-l-2 border-teal-400 absolute bottom-2 left-2 rounded-bl" />
                <div className="w-4 h-4 border-b-2 border-r-2 border-teal-400 absolute bottom-2 right-2 rounded-br" />
              </div>
            </div>

            {/* Footer com Botão de Disparo / Shutter */}
            <div className="p-6 pb-10 flex flex-col items-center justify-center z-10 bg-gradient-to-t from-black/90 to-transparent gap-2">
              <button
                type="button"
                onClick={capturarFotoCanvas}
                disabled={cameraFotoCarregando}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:scale-95 transition shadow-2xl disabled:opacity-50 cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-inner hover:bg-slate-100">
                  <Camera className="w-7 h-7 text-slate-800" />
                </div>
              </button>
              <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Toque para fotografar</span>
            </div>
          </div>
        )}

        {/* Modal Cor da Etiqueta / Tarja (TELA013) com Opção Individual vs Todos os Produtos da Loja */}
        {modalCorEtiquetaAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-sm sm:text-base text-slate-800">Cor da Tarja Inferior</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Selecione o tom desejado</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalCorEtiquetaAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grade 3x3 TELA013 */}
              <div className="grid grid-cols-3 gap-3">
                {CORES_ETIQUETA.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setCorSelecionadaModal(cor)}
                    className={`h-14 rounded-2xl shadow-sm border transition active:scale-95 flex items-center justify-center ${
                      corSelecionadaModal === cor ? 'border-4 border-slate-900 scale-105 shadow-md' : 'border-black/10'
                    }`}
                    style={{ backgroundColor: cor }}
                  >
                    {corSelecionadaModal === cor && <Check className="w-6 h-6 text-white drop-shadow-md stroke-[3]" />}
                  </button>
                ))}
              </div>

              {/* Opção de Escopo: Apenas este produto VS Todos os produtos da Loja */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Onde aplicar a cor?
                </label>

                <div className="space-y-2">
                  <label
                    onClick={() => setAplicarCorEmMassa(false)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      !aplicarCorEmMassa ? 'bg-white border-teal-500 shadow-sm text-slate-800' : 'border-transparent text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="escopo_cor"
                        checked={!aplicarCorEmMassa}
                        onChange={() => setAplicarCorEmMassa(false)}
                        className="text-teal-600 focus:ring-teal-500 w-4 h-4"
                      />
                      <span className="text-xs font-bold">Apenas neste produto</span>
                    </div>
                  </label>

                  <label
                    onClick={() => setAplicarCorEmMassa(true)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      aplicarCorEmMassa ? 'bg-white border-teal-500 shadow-sm text-slate-800' : 'border-transparent text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="escopo_cor"
                        checked={aplicarCorEmMassa}
                        onChange={() => setAplicarCorEmMassa(true)}
                        className="text-teal-600 focus:ring-teal-500 w-4 h-4"
                      />
                      <div>
                        <span className="text-xs font-black text-slate-800 block">Todos os produtos da loja</span>
                        <span className="text-[10px] text-slate-400 font-medium">Define como padrão para todo o catálogo</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 text-[10px] font-extrabold uppercase">
                      Em massa
                    </span>
                  </label>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalCorEtiquetaAberto(false)}
                  className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-xs font-extrabold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={salvandoProduto}
                  onClick={() => {
                    if (aplicarCorEmMassa) {
                      aplicarCorEmMassaTodosProdutos(corSelecionadaModal);
                    } else {
                      setFormData(prev => ({ ...prev, corEtiqueta: corSelecionadaModal }));
                      setModalCorEtiquetaAberto(false);
                      setMensagemFeedback({ texto: 'Cor da tarja atualizada para este produto!', tipo: 'sucesso' });
                    }
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white text-xs sm:text-sm font-black shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {salvandoProduto ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{aplicarCorEmMassa ? 'Aplicar em Todos' : 'Salvar Cor'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diálogo de Clonar (TELA010) */}
        {modalClonarAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-xs p-6 shadow-2xl space-y-4 text-left">
              <h3 className="font-black text-base sm:text-lg text-slate-900">Atenção</h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">Deseja clonar este produto?</p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalClonarAberto(false)}
                  className="px-3 py-2 text-xs font-extrabold text-slate-600 hover:text-slate-800 uppercase"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={executarClonagem}
                  className="px-4 py-2 text-xs font-black text-teal-600 hover:text-teal-700 uppercase"
                >
                  Sim
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Vender por (TELA019) */}
        {modalVenderPorAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
            <div className="bg-white rounded-t-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-sm sm:text-base text-slate-800">Vender por</h3>
                <button
                  type="button"
                  onClick={() => setModalVenderPorAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, tipoUnidade: 'un' }));
                    setModalVenderPorAberto(false);
                  }}
                  className={`w-full p-4 rounded-2xl text-left text-xs sm:text-sm font-extrabold flex items-center justify-between transition ${
                    formData.tipoUnidade === 'un' ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>Unidade</span>
                  {formData.tipoUnidade === 'un' && <Check className="w-5 h-5 text-teal-600" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, tipoUnidade: 'kg' }));
                    setModalVenderPorAberto(false);
                  }}
                  className={`w-full p-4 rounded-2xl text-left text-xs sm:text-sm font-extrabold flex items-center justify-between transition ${
                    formData.tipoUnidade !== 'un' ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>Fração (Kilo, Litro, Metro, etc.)</span>
                  {formData.tipoUnidade !== 'un' && <Check className="w-5 h-5 text-teal-600" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL COMPLETO DE PREENCHIMENTO AUTOMÁTICO VIA IA (EQUIPARADO AO DESKTOP) */}
        {modalCriarComIAAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-500 flex items-center justify-center text-white font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm sm:text-base text-slate-900">Preenchimento com IA</h3>
                    <p className="text-[11px] text-teal-600 font-bold uppercase">Google Gemini Multimodal</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTempApiKey(getGeminiApiKey());
                      setModalKeyGemini(true);
                    }}
                    className="px-2 py-1 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 flex items-center gap-1 text-[11px] font-bold transition border border-teal-200"
                    title="Configurar Chave Gemini"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Chave IA</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalCriarComIAAberto(false)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Abas do Modal IA: Foto | Texto/Nome | Código de Barras */}
              <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setAbaModalIA('foto')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                    abaModalIA === 'foto' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Por Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAbaModalIA('texto')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                    abaModalIA === 'texto' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Por Nome</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAbaModalIA('codigo')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition ${
                    abaModalIA === 'codigo' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Barcode className="w-3.5 h-3.5" />
                  <span>Por Código</span>
                </button>
              </div>

              {/* Conteúdo Aba Foto */}
              {abaModalIA === 'foto' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Envie ou tire uma foto do produto para preencher nome, categoria, preço sugerido e descrição comercial completa automaticamente.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOrigemCameraParaIA(true);
                        setModalCriarComIAAberto(false);
                        iniciarCameraFoto('environment');
                      }}
                      className="p-4 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/50 flex flex-col items-center justify-center text-teal-700 hover:bg-teal-100 transition cursor-pointer text-center active:scale-95"
                    >
                      <Camera className="w-8 h-8 mb-1.5" />
                      <span className="text-xs font-extrabold">Tirar Foto</span>
                    </button>

                    <label className="p-4 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-700 hover:bg-slate-100 transition cursor-pointer text-center active:scale-95">
                      <Upload className="w-8 h-8 mb-1.5 text-slate-500" />
                      <span className="text-xs font-extrabold">Enviar Imagem</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const compressed = await comprimirArquivoImagem(file, 640, 0.85);
                            if (compressed) {
                              processarPreenchimentoIA('foto', compressed);
                            }
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Conteúdo Aba Texto / Nome */}
              {abaModalIA === 'texto' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Digite o nome ou uma breve descrição do item (ex: <em>"Cerveja Heineken Long Neck 330ml"</em>).
                  </p>

                  <div className="relative">
                    <input
                      type="text"
                      value={promptTextoIA}
                      onChange={(e) => setPromptTextoIA(e.target.value)}
                      placeholder="Ex: Camiseta Algodão Básica Preta"
                      className="w-full pl-3 pr-10 py-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => alternarPesquisaPorVoz(setPromptTextoIA)}
                      className="absolute right-2 top-2.5 p-1 text-slate-400 hover:text-teal-600"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={processandoIA || !promptTextoIA.trim()}
                    onClick={() => processarPreenchimentoIA('texto')}
                    className="w-full py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {processandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Preencher Dados via IA</span>
                  </button>
                </div>
              )}

              {/* Conteúdo Aba Código de Barras */}
              {abaModalIA === 'codigo' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Aponte a câmera para ler o código ou digite o código de barras (EAN/GTIN) para buscar as informações oficiais do produto.
                  </p>

                  {/* Botão para Ler com a Câmera Ao Vivo */}
                  <button
                    type="button"
                    onClick={() => {
                      setOrigemScannerParaIA(true);
                      setModalCriarComIAAberto(false);
                      iniciarScannerCamera();
                    }}
                    className="w-full py-3.5 rounded-2xl bg-teal-50 border border-teal-300 text-teal-800 font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-teal-100 transition cursor-pointer shadow-sm active:scale-98"
                  >
                    <Camera className="w-5 h-5 text-teal-600" />
                    <span>Ler Código com a Câmera</span>
                  </button>

                  <div className="relative flex items-center justify-center my-2">
                    <div className="border-t border-slate-200 w-full" />
                    <span className="bg-white px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider absolute">OU</span>
                  </div>

                  <input
                    type="text"
                    value={promptCodigoIA}
                    onChange={(e) => setPromptCodigoIA(e.target.value)}
                    placeholder="Digite o código (ex: 7891000100103)"
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-800"
                  />

                  <button
                    type="button"
                    disabled={processandoIA || !promptCodigoIA.trim()}
                    onClick={() => processarPreenchimentoIA('codigo')}
                    className="w-full py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-extrabold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {processandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Consultar Código via IA</span>
                  </button>
                </div>
              )}

              {processandoIA && (
                <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-teal-600 shrink-0" />
                  <span className="text-xs font-bold leading-snug">Consultando inteligência artificial e gerando descrição comercial...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL CONFIGURAR CHAVE GEMINI */}
        {modalKeyGemini && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-indigo-500 flex items-center justify-center text-white">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-100">Chave Google Gemini IA</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalKeyGemini(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-300">
                <p>
                  Para habilitar o preenchimento por foto e geração de descrições, insira sua chave gratuita do <strong className="text-white">Google Gemini</strong>.
                </p>
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1.5">
                  <p className="text-[11px] text-amber-400 font-bold">Como obter sua chave gratuita (1 min):</p>
                  <p className="text-[11px] text-slate-300">
                    1. Acesse o <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 underline font-bold"
                    >
                      Google AI Studio (clique aqui)
                    </a>
                  </p>
                  <p className="text-[11px] text-slate-300">2. Faça login com sua conta Google</p>
                  <p className="text-[11px] text-slate-300">3. Clique em <strong>"Create API key"</strong> e copie o código</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Chave da API (Gemini API Key):</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-teal-400"
                />
              </div>

              <div className="flex gap-2 pt-1">
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
                    setMensagemFeedback({
                      texto: tempApiKey.trim() ? 'Chave do Gemini salva com sucesso!' : 'Chave removida.',
                      tipo: 'sucesso'
                    });
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Salvar Chave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // TELA 001 & TELA 002: LISTA PRINCIPAL DE PRODUTOS E ESTOQUE MOBILE
  // =========================================================================
  return (
    <div className="flex flex-col h-full bg-white text-slate-900 overflow-hidden select-none relative">
      {renderToast()}

      {/* Header Superior Mobile (TELA001 / TELA002) */}
      <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerMenuAberto(true)}
            className="p-2 rounded-2xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            title="Menu Principal"
          >
            <div className="space-y-1">
              <span className="block w-6 h-0.5 bg-slate-800 rounded-full" />
              <span className="block w-6 h-0.5 bg-slate-800 rounded-full" />
              <span className="block w-6 h-0.5 bg-slate-800 rounded-full" />
            </div>
          </button>
          <h1 className="font-black text-base sm:text-lg text-slate-800 tracking-tight">
            Produtos ({produtos.length})
          </h1>
        </div>
      </div>

      {/* Abas Superiores: ITENS (TELA001) | ESTOQUE (TELA002) - Tipografia Aumentada */}
      <div className="flex border-b border-slate-200 bg-white shrink-0">
        <button
          type="button"
          onClick={() => {
            setAbaLista('itens');
            setBuscaAtiva(false);
          }}
          className={`flex-1 py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider transition relative ${
            abaLista === 'itens' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-slate-400'
          }`}
        >
          Itens
        </button>
        <button
          type="button"
          onClick={() => {
            setAbaLista('estoque');
            setBuscaAtiva(false);
          }}
          className={`flex-1 py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider transition relative ${
            abaLista === 'estoque' ? 'text-teal-600 border-b-2 border-teal-500' : 'text-slate-400'
          }`}
        >
          Estoque
        </button>
      </div>

      {/* Barra de Busca com Pesquisa por Voz (TELA001 / TELA002 / TELA003) */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center gap-3 shrink-0">
        {buscaAtiva ? (
          // Busca Ativa (TELA003)
          <div className="flex-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBusca('');
                setBuscaAtiva(false);
              }}
              className="p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <input
              ref={inputBuscaRef}
              autoFocus
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite o nome ou código..."
              className="flex-1 py-1.5 text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 border-none focus:outline-none"
            />
            {/* Ícone de Microfone / Pesquisa por Voz */}
            <button
              type="button"
              onClick={() => alternarPesquisaPorVoz(setBusca)}
              className={`p-2 rounded-xl transition ${
                ouvindoVoz ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Pesquisar por voz"
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>
        ) : (
          // Campo Normal de Busca
          <div
            onClick={() => {
              setBuscaAtiva(true);
              setTimeout(() => inputBuscaRef.current?.focus(), 100);
            }}
            className="flex-1 flex items-center justify-between text-slate-400 py-1.5 px-1 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <span className="text-xs sm:text-sm font-medium text-slate-400">Item ou código</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBuscaAtiva(true);
                alternarPesquisaPorVoz(setBusca);
              }}
              className="p-1 text-slate-400 hover:text-slate-700"
              title="Pesquisar por voz"
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Botão da Direita: '+' na aba Itens ou 'Filtros' na aba Estoque */}
        {abaLista === 'itens' ? (
          <button
            type="button"
            onClick={abrirNovoProduto}
            className="p-2 text-teal-600 hover:text-teal-700 font-extrabold transition cursor-pointer"
            title="Novo Produto"
          >
            <Plus className="w-6 h-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setTelaAtiva('filtros')}
            className="p-2 text-slate-600 hover:text-slate-900 transition cursor-pointer"
            title="Filtros de Estoque"
          >
            <Sliders className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Lista de Produtos (TELA001 ou TELA002) */}
      <div className={`flex-1 overflow-y-auto divide-y divide-slate-100 ${
        abaLista === 'itens' ? 'pb-24' : 'pb-28'
      }`}>
        {carregando ? (
          <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            <span className="font-bold">Carregando produtos...</span>
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs space-y-3">
            <Tag className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-sm text-slate-500">Nenhum produto encontrado.</p>
          </div>
        ) : (
          produtosFiltrados.map((p) => {
            const estoque = getEstoqueReal(p);
            const precoVendaFmt = Number(p.preco_venda_varejo || 0).toFixed(2).replace('.', ',');
            const precoPromoFmt = p.preco_promocional ? Number(p.preco_promocional).toFixed(2).replace('.', ',') : null;
            const catNome = (p.categoria_id && mapaCategorias.get(p.categoria_id)) || 'SEM CATEGORIA';

            // Visualização da Aba ITENS (TELA001 com Estrutura de Descrição em até 2 linhas e Maior Destaque de Preço)
            if (abaLista === 'itens') {
              return (
                <div
                  key={p.id}
                  onClick={() => abrirEditarProduto(p, 'cadastro')}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Thumbnail / Foto */}
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                      {p.fotos_urls && p.fotos_urls[0] ? (
                        <img src={p.fotos_urls[0]} alt={p.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-white font-black text-xs"
                          style={{ backgroundColor: obterCorProduto(p) }}
                        >
                          {p.nome.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Nome e Descrição com até 2 linhas */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {p.destaque && <span className="text-amber-500 font-bold text-xs">⭐</span>}
                        <h2 className="font-black text-xs sm:text-sm text-slate-800 uppercase line-clamp-2 leading-snug">
                          {p.nome}
                        </h2>
                      </div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">
                        {catNome}
                      </p>
                    </div>
                  </div>

                  {/* Destaque Visual Acentuado ao Preço */}
                  <div className="text-right shrink-0">
                    {precoPromoFmt ? (
                      <div className="flex flex-col items-end">
                        <span className="text-[11px] text-slate-400 line-through font-semibold">R$ {precoVendaFmt}</span>
                        <span className="font-black text-sm sm:text-base text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-xl shadow-sm">
                          R$ {precoPromoFmt}
                        </span>
                      </div>
                    ) : (
                      <span className="font-black text-sm sm:text-base text-slate-900 bg-slate-100 px-2.5 py-1 rounded-xl shadow-sm">
                        R$ {precoVendaFmt}
                      </span>
                    )}
                  </div>
                </div>
              );
            }

            // Visualização da Aba ESTOQUE (TELA002 com Descrição em 2 linhas e Saldo em Estoque com Maior Destaque)
            const isSemEstoque = estoque <= 0;
            const isMinimo = estoque > 0 && estoque <= Number(p.estoque_minimo_alerta || 0);

            return (
              <div
                key={p.id}
                onClick={() => abrirEditarProduto(p, 'estoque')}
                className="p-4 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Ponto Indicador de Status */}
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isSemEstoque ? 'bg-rose-500' : isMinimo ? 'bg-amber-500' : 'bg-transparent'
                  }`} />

                  {/* Foto */}
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                    {p.fotos_urls && p.fotos_urls[0] ? (
                      <img src={p.fotos_urls[0]} alt={p.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-black text-xs"
                        style={{ backgroundColor: obterCorProduto(p) }}
                      >
                        {p.nome.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Nome com até 2 linhas */}
                  <h2 className="font-black text-xs sm:text-sm text-slate-800 uppercase line-clamp-2 leading-snug">
                    {p.nome}
                  </h2>
                </div>

                {/* Quantidade em Estoque com Alto Destaque Visual */}
                <div className="text-right shrink-0">
                  <span className={`font-black text-sm sm:text-base px-3 py-1.5 rounded-xl shadow-sm inline-block min-w-[3.2rem] text-center ${
                    isSemEstoque
                      ? 'bg-rose-50 text-rose-600 border border-rose-200'
                      : isMinimo
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-slate-100 text-slate-800'
                  }`}>
                    {estoque}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* RODAPÉ FLUTUANTE: PEDIDOS E CATÁLOGO ONLINE (TELA001 / TELA005) */}
      {abaLista === 'itens' && (
        <div
          onClick={() => setModalCatalogoAberto(true)}
          className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-4 py-3.5 shadow-2xl flex items-center justify-between cursor-pointer z-30"
        >
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5 text-slate-700" />
            <div>
              <h3 className="font-extrabold text-xs sm:text-sm text-slate-800">Pedidos e Catálogo Online</h3>
              <p className="text-[10px] font-black text-teal-600 tracking-wider uppercase">
                {loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false
                  ? 'PUBLICADO • ACEITANDO PEDIDOS'
                  : 'CATÁLOGO PAUSADO'}
              </p>
            </div>
          </div>
          <ChevronDown className="w-5 h-5 text-slate-400" />
        </div>
      )}

      {/* RODAPÉ FLUTUANTE: RESUMO DE ESTOQUE (TELA002) */}
      {abaLista === 'estoque' && (
        <div className="fixed bottom-0 inset-x-0 p-3 z-30 pointer-events-none">
          <div className="bg-slate-900 text-white rounded-3xl p-4 shadow-2xl flex items-center justify-between pointer-events-auto border border-slate-800">
            <div>
              <div className="w-8 h-1 bg-slate-700 rounded-full mx-auto mb-2 opacity-50" />
              <h3 className="font-extrabold text-xs sm:text-sm text-white">
                Total: R$ {valorTotalEstoque.toFixed(2).replace('.', ',')}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Custo do estoque: R$ {valorCustoTotalEstoque.toFixed(2).replace('.', ',')}
              </p>
            </div>

            <div className="text-right">
              <span className="font-black text-lg sm:text-xl text-white block">
                {totalItensEstoque}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Em estoque
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / BOTTOM SHEET: PEDIDOS E CATÁLOGO ONLINE (TELA005) */}
      {modalCatalogoAberto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm sm:text-base text-slate-800">Pedidos e Catálogo Online</h3>
              <button
                type="button"
                onClick={() => setModalCatalogoAberto(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Publicado para todos verem */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs sm:text-sm font-bold text-slate-700">Publicado para todos verem</span>
                <button
                  type="button"
                  onClick={async () => {
                    const novoStatus = !(loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false);
                    if (loja?.id) {
                      await supabase.from('lojas').update({
                        configuracoes_extras: {
                          ...loja.configuracoes_extras,
                          catalogo: {
                            ...loja.configuracoes_extras?.catalogo,
                            publicar_catalogo: novoStatus
                          }
                        }
                      }).eq('id', loja.id);
                      await onRecarregar();
                    }
                  }}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                    loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false ? 'bg-teal-500' : 'bg-slate-300'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                    loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Ações TELA005 */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <a
                  href={catalogUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full p-3 rounded-2xl hover:bg-slate-50 flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-700"
                >
                  <Store className="w-5 h-5 text-slate-500" />
                  <span>Abrir catálogo</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    compartilharLink(catalogUrl, loja?.nome_fantasia || 'Catálogo Online', 'Confira nosso catálogo online e faça seu pedido direto pelo WhatsApp!');
                    setModalCatalogoAberto(false);
                  }}
                  className="w-full p-3 rounded-2xl hover:bg-slate-50 flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-700 text-left"
                >
                  <Share2 className="w-5 h-5 text-slate-500" />
                  <span>Compartilhar</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalCatalogoAberto(false);
                    navigate('/catalog-config');
                  }}
                  className="w-full p-3 rounded-2xl hover:bg-slate-50 flex items-center gap-3 text-xs sm:text-sm font-bold text-slate-700 text-left"
                >
                  <Settings className="w-5 h-5 text-slate-500" />
                  <span>Configurações</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER MENU MOBILE (HAMBURGUER `☰`) */}
      {drawerMenuAberto && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex">
          <div className="w-72 bg-slate-900 h-full p-5 flex flex-col justify-between text-white animate-in slide-in-from-left duration-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-teal-500 flex items-center justify-center font-black text-white text-xs shadow-md">
                    {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
                  </div>
                  <div>
                    <h2 className="font-extrabold text-xs sm:text-sm text-white truncate max-w-[150px]">{loja?.nome_fantasia || 'HUBI'}</h2>
                    <p className="text-[10px] text-teal-400 font-bold uppercase">{usuario?.nome_completo || 'Operador'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerMenuAberto(false)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Links de Navegação */}
              <nav className="space-y-1 text-xs sm:text-sm">
                {permissions.podeAcessarPdv && (
                  <button
                    type="button"
                    onClick={() => navigate('/pos')}
                    className="w-full p-3 rounded-2xl flex items-center gap-3 text-slate-300 hover:bg-slate-800 hover:text-white font-medium"
                  >
                    <ShoppingCart className="w-5 h-5 text-teal-400" />
                    <span>Vender (Frente de Caixa)</span>
                  </button>
                )}

                {permissions.podeAcessarPedidos && (
                  <button
                    type="button"
                    onClick={() => navigate('/orders')}
                    className="w-full p-3 rounded-2xl flex items-center gap-3 text-slate-300 hover:bg-slate-800 hover:text-white font-medium"
                  >
                    <ShoppingBag className="w-5 h-5 text-slate-400" />
                    <span>Pedidos</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDrawerMenuAberto(false)}
                  className="w-full p-3 rounded-2xl flex items-center gap-3 bg-teal-500/15 text-teal-400 font-extrabold border border-teal-500/30"
                >
                  <Tag className="w-5 h-5 text-teal-400" />
                  <span>Produtos & Estoque</span>
                </button>

                {permissions.podeAcessarClientes && (
                  <button
                    type="button"
                    onClick={() => navigate('/customers')}
                    className="w-full p-3 rounded-2xl flex items-center gap-3 text-slate-300 hover:bg-slate-800 hover:text-white font-medium"
                  >
                    <Users className="w-5 h-5 text-slate-400" />
                    <span>Clientes</span>
                  </button>
                )}

                {permissions.podeAcessarFinancas && (
                  <button
                    type="button"
                    onClick={() => navigate('/finances')}
                    className="w-full p-3 rounded-2xl flex items-center gap-3 text-slate-300 hover:bg-slate-800 hover:text-white font-medium"
                  >
                    <DollarSign className="w-5 h-5 text-slate-400" />
                    <span>Finanças & Caixa</span>
                  </button>
                )}

                {permissions.podeAcessarAnalytics && (
                  <button
                    type="button"
                    onClick={() => navigate('/analytics')}
                    className="w-full p-3 rounded-2xl flex items-center gap-3 text-slate-300 hover:bg-slate-800 hover:text-white font-medium"
                  >
                    <BarChart3 className="w-5 h-5 text-slate-400" />
                    <span>Estatísticas & Relatórios</span>
                  </button>
                )}

                {permissions.podeAcessarRubiIA && (
                  <button
                    type="button"
                    onClick={() => navigate('/smart-assistant')}
                    className="w-full p-3 rounded-2xl flex items-center gap-3 text-indigo-300 hover:bg-indigo-500/10 font-bold"
                  >
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <span>Assistente Rubi (IA)</span>
                  </button>
                )}

                {permissions.podeAcessarCatalogo && (
                  <button
                    type="button"
                    onClick={() => navigate('/catalog-config')}
                    className="w-full p-3 rounded-2xl flex items-center gap-3 text-slate-300 hover:bg-slate-800 font-medium"
                  >
                    <Globe className="w-5 h-5 text-slate-400" />
                    <span>Catálogo Online</span>
                  </button>
                )}

                {permissions.podeAcessarConfig && (
                  <button
                    type="button"
                    onClick={() => navigate('/config')}
                    className="w-full p-3 rounded-2xl flex items-center gap-3 text-slate-300 hover:bg-slate-800 font-medium"
                  >
                    <Settings className="w-5 h-5 text-slate-400" />
                    <span>Configurações</span>
                  </button>
                )}
              </nav>
            </div>

            {/* Sair */}
            <div className="pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDrawerMenuAberto(false);
                  desconectarPdv();
                }}
                className="w-full p-3 rounded-2xl flex items-center gap-3 text-rose-400 hover:bg-rose-500/10 text-xs sm:text-sm font-bold"
              >
                <LogOut className="w-5 h-5" />
                <span>Trocar de Estabelecimento / Sair</span>
              </button>
            </div>
          </div>

          <div
            className="flex-1"
            onClick={() => setDrawerMenuAberto(false)}
          />
        </div>
      )}
    </div>
  );
};
>>>>>>> 46bced2670795eea4e733433e28d2b5e18e0cf9a
