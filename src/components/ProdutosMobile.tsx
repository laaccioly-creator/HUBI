import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Filter,
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
  Package,
  PackagePlus,
  Wrench,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  QrCode,
  Tag,
  Mic,
  MicOff,
  Image as ImageIcon,
  ImageOff,
  FileText,
  Barcode,
  RefreshCw,
  Key,
  Zap,
  TrendingUp,
  Truck,
  Layers,
  Calendar,
  Clock,
  MapPin,
  UserCheck,
  ExternalLink,
  Home
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { Produto, Categoria, VariacaoProduto, TipoUnidade, UsuarioLoja, LocalPrestacaoServico, Fornecedor } from '../types';
import { agendamentoService } from '../services/agendamentoService';
import {
  obterArvoreCategorias,
  obterSubcategoriasDe,
  obterSubcategoriaIdProduto,
  salvarVinculoSubcategoriaProdutoLocal,
  obterCategoriasPrincipaisFiltro,
  produtoCorrespondeAoFiltroCategorias,
  CategoriaFiltroConsolidada
} from '../utils/categoriasHierarquia';
import { audioService } from '../services/audioService';
import { MobileHeader } from './layout/MobileHeader';
import { ModalEntradaEstoque } from './ModalEntradaEstoque';
import { ModalGerenciarCategorias } from './ModalGerenciarCategorias';
import { ModalVincularAnuncioMl } from './mercadolivre/ModalVincularAnuncioMl';
import { ModalConectarMercadoLivre } from './mercadolivre/ModalConectarMercadoLivre';
import { mercadoLivreService } from '../services/mercadoLivreService';
import { obterPermalinkAnuncioMl } from '../utils/gdmMercadoLivreMapper';
import type { AnuncioMlResumo } from './ProdutosEstoque';
import { pesquisarPrecosMercadoIA, DadosMercadoIA } from './ProdutoCadastro';
import { UNIDADES_PADRAO } from './CadastrosAuxiliares';
import { formatarDataLocal, formatarHoraLocal, formatarDataHoraLocal } from '../utils/dateTime';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import {
  identificarProdutoPorFoto,
  identificarProdutoPorTextoOuEan,
  gerarDescricaoExclusivaIA,
  atualizarProdutoExistenteComIA,
  estimarDimensoesEPesoProduto,
  ProdutoSugeridoIA,
  obterNomeSegmentoLoja
} from '../services/geminiService';
import { ModalPesquisaFotosInternet } from './ModalPesquisaFotosInternet';
import { catalogJevService } from '../services/catalogJevService';
import { ModalOnboardingSerpApi } from './ModalOnboardingSerpApi';
import { SpinnerPesquisandoIA } from './SpinnerPesquisandoIA';
import { ModalDuvidaProdutoIA } from './ModalDuvidaProdutoIA';
import { obterSerpApiKey, obterOuBuscarSerpApiKey } from '../services/serpApiService';
import {
  comprimirFotoProduto,
  gerarPayloadBase64IA,
  type CompressResult,
  type PayloadBase64IA
} from '../utils/imageCompressor';
import { formatarMoeda } from '../utils/formatters';
import { ProdutoService } from '../services/produtoService';
import { ModalCameraCapturaMobile } from './ui/ModalCameraCapturaMobile';
import { ModalProdutoDuplicado } from './ModalProdutoDuplicado';
import {
  buscarProdutoDuplicado,
  normalizarTextoProduto,
  type MotivoDuplicidade
} from '../utils/produtoDuplicado';

interface ProdutosMobileProps {
  produtos: Produto[];
  categorias: Categoria[];
  carregando: boolean;
  onRecarregar: () => Promise<void>;
  mapaAnunciosMl?: Record<string, AnuncioMlResumo[]>;
  onRecarregarAnunciosMl?: () => void;
  onAbrirPublicarMassaMl?: (categoriaInicialId?: string | null) => void;
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

export const ProdutosMobile: React.FC<ProdutosMobileProps> = ({
  produtos,
  categorias,
  carregando,
  onRecarregar,
  mapaAnunciosMl = {},
  onRecarregarAnunciosMl,
  onAbrirPublicarMassaMl
}) => {
  const navigate = useNavigate();
  const { loja, usuario, setLoja } = useAuth();
  const { isDark: themeIsDark } = useTheme();
  const isDark = themeIsDark ?? (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

  // Cores dinâmicas com suporte estrito a Tema Claro e Tema Escuro
  const temaCores = {
    bgExterno: isDark ? '#08131A' : '#F1F5F9',
    bgCard: isDark ? '#000000' : '#FFFFFF',
    bordaCard: isDark ? '#334155' : '#CBD5E1',
    bgInput: isDark ? '#000000' : '#FFFFFF',
    bordaInput: isDark ? '#334155' : '#CBD5E1',
    textoInput: isDark ? '#FFFFFF' : '#000000',
    textoPrincipal: isDark ? '#FFFFFF' : '#000000',
    textoSecundario: isDark ? '#94A3B8' : '#000000',
    bgPilulaDesmarcada: isDark ? '#000000' : '#FFFFFF',
    bordaPilulaDesmarcada: isDark ? '#334155' : '#CBD5E1',
    textoPilulaDesmarcada: isDark ? '#FFFFFF' : '#000000',
    bgRodape: isDark ? '#08131A' : '#F1F5F9',
    bordaRodape: isDark ? '#64748B' : '#CBD5E1',
    textoRodape: isDark ? '#FFFFFF' : '#000000',
    bgHeaderForm: isDark ? '#08131A' : '#F1F5F9',
    bordaHeaderForm: isDark ? '#64748B' : '#CBD5E1',
  };

  const permissions = usePermissions();
  const segmentoLoja = useMemo(() => obterNomeSegmentoLoja(loja), [loja]);

  // =========================================================================
  // ESTADOS DE TELA E NAVEGAÇÃO
  // =========================================================================
  const [telaAtiva, setTelaAtiva] = useState<'lista' | 'novo' | 'detalhes' | 'filtros' | 'movimentacoes' | 'variacoes'>('lista');
  const [abaLista, setAbaLista] = useState<'itens' | 'estoque'>('itens'); // TELA001 vs TELA002
  const [abaFormulario, setAbaFormulario] = useState<'cadastro' | 'estoque'>('cadastro'); // TELA008 vs TELA007

  // Modais & Subtelas
  const [modalCatalogoAberto, setModalCatalogoAberto] = useState<boolean>(false); // TELA005
  const [modalGerenciarCategoriasMobileAberto, setModalGerenciarCategoriasMobileAberto] = useState<boolean>(false);
  const [produtoMlModal, setProdutoMlModal] = useState<Produto | null>(null);
  const [modalConectarMlAberto, setModalConectarMlAberto] = useState<boolean>(false);
  const [verificandoConexaoMl, setVerificandoConexaoMl] = useState<boolean>(false);

  const handleAbrirModalMercadoLivre = async (produtoAlvo: Produto) => {
    if (!loja?.id || verificandoConexaoMl) return;
    try {
      setVerificandoConexaoMl(true);
      const contaConectada = await mercadoLivreService.buscarContaConectada(loja.id);
      if (!contaConectada) {
        setModalConectarMlAberto(true);
        return;
      }
      setProdutoMlModal(produtoAlvo);
    } catch {
      setModalConectarMlAberto(true);
    } finally {
      setVerificandoConexaoMl(false);
    }
  };
  const [fornecedoresLista, setFornecedoresLista] = useState<Fornecedor[]>([]);
  const [movimentacoesLista, setMovimentacoesLista] = useState<any[]>([]);
  const [carregandoMovimentacoes, setCarregandoMovimentacoes] = useState<boolean>(false);
  const [filtroMovTipo, setFiltroMovTipo] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [modalClonarAberto, setModalClonarAberto] = useState<boolean>(false); // TELA010
  const [modalCorEtiquetaAberto, setModalCorEtiquetaAberto] = useState<boolean>(false); // TELA013
  const [corSelecionadaModal, setCorSelecionadaModal] = useState<string>('#1F2937');
  const [aplicarCorEmMassa, setAplicarCorEmMassa] = useState<boolean>(false);
  const [modalFotoFullscreen, setModalFotoFullscreen] = useState<string | null>(null); // TELA014
  const [modalOpcoesFotoAberto, setModalOpcoesFotoAberto] = useState<boolean>(false); // Opções de Foto (Câmera / Galeria / Gerenciar)
  const [modalGaleriaFotosAberto, setModalGaleriaFotosAberto] = useState<boolean>(false); // TELA015
  const [modalCategoriasAberto, setModalCategoriasAberto] = useState<boolean>(false); // TELA016
  const [modalSubcategoriasAberto, setModalSubcategoriasAberto] = useState<boolean>(false); // Seletor Subcategorias
  const [buscaSubcategoria, setBuscaSubcategoria] = useState<string>('');
  const [modalDescricaoAberto, setModalDescricaoAberto] = useState<boolean>(false); // TELA017
  const [modalScannerAberto, setModalScannerAberto] = useState<boolean>(false); // TELA018
  const [modalUnidadeMedidaAberto, setModalUnidadeMedidaAberto] = useState<boolean>(false); // Seletor Unidade de Medida
  const [unidadesLista, setUnidadesLista] = useState<Array<{ sigla: string; nome: string }>>(() =>
    UNIDADES_PADRAO.map(u => ({ sigla: u.sigla, nome: u.nome }))
  );
  const [detectandoDimensoes, setDetectandoDimensoes] = useState<boolean>(false);
  const [rotuloVariacao1, setRotuloVariacao1] = useState<string>('Tamanho');
  const [rotuloVariacao2, setRotuloVariacao2] = useState<string>('');
  const [modalEstoqueMinimoAberto, setModalEstoqueMinimoAberto] = useState<boolean>(false); // TELA012
  const [modalPublicCardAberto, setModalPublicCardAberto] = useState<boolean>(false); // TELA009
  const [modalCriarComIAAberto, setModalCriarComIAAberto] = useState<boolean>(false); // Criar / Preencher com IA completo
  const [modalFotosInternetAberto, setModalFotosInternetAberto] = useState<boolean>(false); // Pesquisar Fotos na Internet
  const [modalOnboardingSerpApiAberto, setModalOnboardingSerpApiAberto] = useState<boolean>(false); // Onboarding SerpApi

  const handleAbrirPesquisaFotos = async () => {
    let chave = obterSerpApiKey(loja);
    if (!chave && loja?.id) {
      chave = await obterOuBuscarSerpApiKey(loja);
      if (chave && setLoja && loja) {
        setLoja({ ...loja, serper_api_key: chave });
      }
    }

    if (!chave) {
      mostrarAviso(
        'Cadastre a sua chave gratuita do Serper.dev (2.500 consultas gratuitas em https://serper.dev/api-key) nas Configurações da Loja (ou no assistente a seguir) para buscar fotos de produtos.',
        'Chave Serper.dev Necessária'
      );
      setModalOnboardingSerpApiAberto(true);
    } else {
      setModalFotosInternetAberto(true);
    }
  };
  const [modalDuvidaAberto, setModalDuvidaAberto] = useState<boolean>(false); // Dúvida da IA entre múltiplos produtos
  const [opcoesDuvidaIA, setOpcoesDuvidaIA] = useState<ProdutoSugeridoIA[]>([]);
  const [fotoTemporariaDuvida, setFotoTemporariaDuvida] = useState<string | null>(null);
  const [modalEntradaAberto, setModalEntradaAberto] = useState<boolean>(false); // Entrada / Ajuste de Estoque
  const [produtoEntradaAlvo, setProdutoEntradaAlvo] = useState<Produto | null>(null);

  // =========================================================================
  // ESTADOS DE BUSCA E VOZ (PESQUISA POR VOZ)
  // =========================================================================
  const [busca, setBusca] = useState<string>('');
  const [buscaAtiva, setBuscaAtiva] = useState<boolean>(false); // TELA003
  const [ouvindoVoz, setOuvindoVoz] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const inputBuscaRef = useRef<HTMLInputElement>(null);

  // Filtros de Estoque (TELA006) com Persistência em Sessão por Usuário Ativo
  const [filtroSemEstoque, setFiltroSemEstoque] = useState<boolean>(() => {
    try {
      if (!usuario?.id) return false;
      const salvo = sessionStorage.getItem(`hubi_mob_filtro_sessao_${usuario.id}`);
      return salvo ? Boolean(JSON.parse(salvo).semEstoque) : false;
    } catch {
      return false;
    }
  });
  const [filtroMinimo, setFiltroMinimo] = useState<boolean>(() => {
    try {
      if (!usuario?.id) return false;
      const salvo = sessionStorage.getItem(`hubi_mob_filtro_sessao_${usuario.id}`);
      return salvo ? Boolean(JSON.parse(salvo).minimo) : false;
    } catch {
      return false;
    }
  });
  const [filtroAcimaMinimo, setFiltroAcimaMinimo] = useState<boolean>(() => {
    try {
      if (!usuario?.id) return false;
      const salvo = sessionStorage.getItem(`hubi_mob_filtro_sessao_${usuario.id}`);
      return salvo ? Boolean(JSON.parse(salvo).acimaMinimo) : false;
    } catch {
      return false;
    }
  });
  const [filtroSemControle, setFiltroSemControle] = useState<boolean>(() => {
    try {
      if (!usuario?.id) return false;
      const salvo = sessionStorage.getItem(`hubi_mob_filtro_sessao_${usuario.id}`);
      return salvo ? Boolean(JSON.parse(salvo).semControle) : false;
    } catch {
      return false;
    }
  });
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>(() => {
    try {
      if (!usuario?.id) return [];
      const salvo = sessionStorage.getItem(`hubi_mob_filtro_sessao_${usuario.id}`);
      return salvo && Array.isArray(JSON.parse(salvo).categorias) ? JSON.parse(salvo).categorias : [];
    } catch {
      return [];
    }
  });
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>(() => {
    try {
      if (!usuario?.id) return 'todos';
      const salvo = sessionStorage.getItem(`hubi_mob_filtro_sessao_${usuario.id}`);
      return salvo && JSON.parse(salvo).ativo ? JSON.parse(salvo).ativo : 'todos';
    } catch {
      return 'todos';
    }
  });
  const [filtroMl, setFiltroMl] = useState<'todos' | 'publicados' | 'nao_publicados'>('todos');
  const [filtroTipoItem, setFiltroTipoItem] = useState<'todos' | 'produto' | 'servico'>('todos');
  const [ordenacaoEstoque, setOrdenacaoEstoque] = useState<'menor_estoque' | 'maior_estoque' | 'a_z' | 'z_a'>('menor_estoque');

  // Categorias principais consolidadas para o filtro mobile
  const categoriasPrincipaisFiltro = useMemo<CategoriaFiltroConsolidada[]>(() => {
    return obterCategoriasPrincipaisFiltro(categorias, produtos, loja?.id);
  }, [categorias, produtos, loja?.id]);

  const qtdCategoriasFiltroAtivas = categoriasPrincipaisFiltro.filter(c =>
    c.todosIds.some(id => categoriasFiltro.includes(id))
  ).length;

  const qtdFiltrosAtivos = (filtroSemEstoque ? 1 : 0) +
    (filtroMinimo ? 1 : 0) +
    (filtroAcimaMinimo ? 1 : 0) +
    (filtroSemControle ? 1 : 0) +
    (filtroAtivo !== 'todos' ? 1 : 0) +
    (filtroMl !== 'todos' ? 1 : 0) +
    (filtroTipoItem !== 'todos' ? 1 : 0) +
    qtdCategoriasFiltroAtivas;

  // Ao trocar de usuário ou deslogar, redefinir filtros imediatamente
  useEffect(() => {
    if (!usuario?.id) {
      setFiltroSemEstoque(false);
      setFiltroMinimo(false);
      setFiltroAcimaMinimo(false);
      setFiltroSemControle(false);
      setCategoriasFiltro([]);
      setFiltroAtivo('todos');
      return;
    }
    try {
      const salvo = sessionStorage.getItem(`hubi_mob_filtro_sessao_${usuario.id}`);
      if (salvo) {
        const d = JSON.parse(salvo);
        setFiltroSemEstoque(Boolean(d.semEstoque));
        setFiltroMinimo(Boolean(d.minimo));
        setFiltroAcimaMinimo(Boolean(d.acimaMinimo));
        setFiltroSemControle(Boolean(d.semControle));
        setCategoriasFiltro(Array.isArray(d.categorias) ? d.categorias : []);
        setFiltroAtivo(d.ativo === 'ativos' || d.ativo === 'inativos' ? d.ativo : 'todos');
      } else {
        setFiltroSemEstoque(false);
        setFiltroMinimo(false);
        setFiltroAcimaMinimo(false);
        setFiltroSemControle(false);
        setCategoriasFiltro([]);
        setFiltroAtivo('todos');
      }
    } catch {
      setFiltroSemEstoque(false);
      setFiltroMinimo(false);
      setFiltroAcimaMinimo(false);
      setFiltroSemControle(false);
      setCategoriasFiltro([]);
      setFiltroAtivo('todos');
    }
  }, [usuario?.id]);

  // Persistir filtros apenas na sessão do usuário ativo
  useEffect(() => {
    if (!usuario?.id) return;
    try {
      const dados = {
        semEstoque: filtroSemEstoque,
        minimo: filtroMinimo,
        acimaMinimo: filtroAcimaMinimo,
        semControle: filtroSemControle,
        categorias: categoriasFiltro,
        ativo: filtroAtivo
      };
      sessionStorage.setItem(`hubi_mob_filtro_sessao_${usuario.id}`, JSON.stringify(dados));
    } catch (e) {
      console.error('Erro ao salvar filtros mobile na sessão:', e);
    }
  }, [filtroSemEstoque, filtroMinimo, filtroAcimaMinimo, filtroSemControle, categoriasFiltro, filtroAtivo, usuario?.id]);

  // =========================================================================
  // ESTADO DO PRODUTO EM EDIÇÃO / CADASTRO
  // =========================================================================
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);

  // Regras de Precificação ativas da Loja (sincronização Atacado & Distribuidor)
  const regrasPrecificacaoLoja = useMemo(() => {
    let tipoMinAtacado: 'valor' | 'quantidade' | 'minimo_sku' = 'quantidade';
    let valMinAtacado = 0;
    let qtdMinAtacado = 6;
    let descontoAtacado = 20;

    let tipoMinDistribuidor: 'valor' | 'quantidade' | 'minimo_sku' = 'quantidade';
    let valMinDistribuidor = 0;
    let qtdMinDistribuidor = 24;
    let descontoAutoatacado = 25;

    if (loja?.id) {
      try {
        const raw = localStorage.getItem(`hubi_regras_precificacao_${loja.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.tipoMinimoAtacado === 'valor' || parsed.tipoMinimoAtacado === 'quantidade' || parsed.tipoMinimoAtacado === 'minimo_sku') {
            tipoMinAtacado = parsed.tipoMinimoAtacado;
          } else if (Number(parsed.qtdMinimaSkuAtacado || 0) > 0 && Number(parsed.valorMinimoAtacado || 0) === 0 && Number(parsed.qtdTotalMinimaAtacado || 0) === 0) {
            tipoMinAtacado = 'minimo_sku';
          } else if ((loja as any)?.tipo_minimo_padrao_atacado === 'valor' || (loja as any)?.tipo_minimo_padrao_atacado === 'quantidade' || (loja as any)?.tipo_minimo_padrao_atacado === 'minimo_sku') {
            tipoMinAtacado = (loja as any).tipo_minimo_padrao_atacado;
          }

          valMinAtacado = Number(parsed.valorMinimoAtacado) || Number((loja as any)?.valor_minimo_padrao_atacado) || 0;
          qtdMinAtacado = Number(parsed.qtdTotalMinimaAtacado ?? parsed.qtdMinimaAtacado) || Number((loja as any)?.qtd_minima_padrao_atacado) || 0;
          descontoAtacado = Number(parsed.descontoAtacado) || Number((loja as any)?.desconto_padrao_atacado_percentual) || 20;

          if (parsed.tipoMinimoDistribuidor === 'valor' || parsed.tipoMinimoDistribuidor === 'quantidade' || parsed.tipoMinimoDistribuidor === 'minimo_sku') {
            tipoMinDistribuidor = parsed.tipoMinimoDistribuidor;
          } else if (parsed.tipoMinimoAutoatacado === 'valor' || parsed.tipoMinimoAutoatacado === 'quantidade' || parsed.tipoMinimoAutoatacado === 'minimo_sku') {
            tipoMinDistribuidor = parsed.tipoMinimoAutoatacado;
          } else if (Number(parsed.qtdMinimaSkuAutoatacado || 0) > 0 && Number(parsed.valorMinimoAutoatacado || 0) === 0 && Number(parsed.qtdTotalMinimaAutoatacado || 0) === 0) {
            tipoMinDistribuidor = 'minimo_sku';
          } else if ((loja as any)?.tipo_minimo_padrao_autoatacado === 'valor' || (loja as any)?.tipo_minimo_padrao_autoatacado === 'quantidade' || (loja as any)?.tipo_minimo_padrao_autoatacado === 'minimo_sku') {
            tipoMinDistribuidor = (loja as any).tipo_minimo_padrao_autoatacado;
          }

          valMinDistribuidor = Number(parsed.valorMinimoAutoatacado) || Number((loja as any)?.valor_minimo_padrao_autoatacado) || 0;
          qtdMinDistribuidor = Number(parsed.qtdTotalMinimaAutoatacado ?? parsed.qtdMinimaAutoatacado) || Number((loja as any)?.qtd_minima_padrao_autoatacado) || 0;
          descontoAutoatacado = Number(parsed.descontoAutoatacado) || Number((loja as any)?.desconto_padrao_autoatacado_percentual) || 25;
        } else {
          if ((loja as any)?.tipo_minimo_padrao_atacado === 'valor' || (loja as any)?.tipo_minimo_padrao_atacado === 'quantidade' || (loja as any)?.tipo_minimo_padrao_atacado === 'minimo_sku') {
            tipoMinAtacado = (loja as any).tipo_minimo_padrao_atacado;
          }
          valMinAtacado = Number((loja as any)?.valor_minimo_padrao_atacado) || 0;
          qtdMinAtacado = Number((loja as any)?.qtd_minima_padrao_atacado) || 0;
          descontoAtacado = Number((loja as any)?.desconto_padrao_atacado_percentual) || 20;

          if ((loja as any)?.tipo_minimo_padrao_autoatacado === 'valor' || (loja as any)?.tipo_minimo_padrao_autoatacado === 'quantidade' || (loja as any)?.tipo_minimo_padrao_autoatacado === 'minimo_sku') {
            tipoMinDistribuidor = (loja as any).tipo_minimo_padrao_autoatacado;
          }
          valMinDistribuidor = Number((loja as any)?.valor_minimo_padrao_autoatacado) || 0;
          qtdMinDistribuidor = Number((loja as any)?.qtd_minima_padrao_autoatacado) || 0;
          descontoAutoatacado = Number((loja as any)?.desconto_padrao_autoatacado_percentual) || 25;
        }
      } catch (e) {
        console.error('Erro ao ler regras de precificação:', e);
      }
    }

    return {
      descontoAtacado,
      tipoMinAtacado,
      valMinAtacado,
      qtdMinAtacado,
      descontoAutoatacado,
      tipoMinDistribuidor,
      valMinDistribuidor,
      qtdMinDistribuidor
    };
  }, [loja]);

  // Sugestão automática de Preço Atacado e Preço Distribuidor baseada no Preço de Venda
  const handlePrecoVendaChange = (novoPrecoVendaStr: string) => {
    const raw = novoPrecoVendaStr.replace(',', '.');
    const num = parseFloat(raw);

    if (!isNaN(num) && num > 0) {
      const descAtacado = Number(regrasPrecificacaoLoja.descontoAtacado) || 20;
      const descAuto = Number(regrasPrecificacaoLoja.descontoAutoatacado) || 25;

      const atacadoCalc = (num * (1 - descAtacado / 100)).toFixed(2).replace('.', ',');
      const autoCalc = (num * (1 - descAuto / 100)).toFixed(2).replace('.', ',');

      setFormData(prev => ({
        ...prev,
        precoVenda: novoPrecoVendaStr,
        precoAtacado: atacadoCalc,
        precoAutoatacado: autoCalc
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        precoVenda: novoPrecoVendaStr
      }));
    }
  };

  const [formData, setFormData] = useState<{
    nome: string;
    codigoInterno: string;
    fornecedorId: string;
    precoVenda: string;
    precoPromocional: string;
    precoCusto: string;
    precoAtacado: string;
    qtdMinimaAtacado: number;
    precoAutoatacado: string;
    qtdMinimaAutoatacado: number;
    categoriaId: string;
    subcategoriaId?: string;
    descricao: string;
    codigoBarras: string;
    tipoUnidade: TipoUnidade;
    unidadeMedida?: string;
    vendaPorPeso: boolean;
    codigoBalanca: string;
    tipoItem?: 'produto' | 'servico';
    destaque: boolean;
    exibirCatalogo: boolean;
    ativo: boolean;
    corEtiqueta: string; // Cor da tarja de descrição/valor
    fotos: string[];
    estoqueMinimo: number;
    gerenciarEstoque: boolean;
    quantidadeEstoque: number;
    dataValidade: string;
    temVariacoes?: boolean;
    variacoes: Partial<VariacaoProduto>[];
    pesoKg?: string;
    alturaCm?: string;
    larguraCm?: string;
    comprimentoCm?: string;
    requerAgendamento?: boolean;
    duracaoEstimadaMinutos?: number;
    localPrestacaoServico?: LocalPrestacaoServico;
    modoTaxaDomicilio: 'padrao' | 'especifico' | 'gratis';
    taxaDeslocamentoDomicilio: string;
    abaterTaxaDomicilioAoFechar: boolean;
    profissionaisHabilitadosIds?: string[];
  }>({
    nome: '',
    codigoInterno: '',
    fornecedorId: '',
    precoVenda: '',
    precoPromocional: '',
    precoCusto: '',
    precoAtacado: '',
    qtdMinimaAtacado: 0,
    precoAutoatacado: '',
    qtdMinimaAutoatacado: 0,
    categoriaId: '',
    subcategoriaId: '',
    descricao: '',
    codigoBarras: '',
    tipoUnidade: 'un',
    unidadeMedida: 'un',
    vendaPorPeso: false,
    codigoBalanca: '',
    tipoItem: 'produto',
    destaque: false,
    exibirCatalogo: true,
    ativo: true,
    corEtiqueta: '#1F2937',
    fotos: [],
    estoqueMinimo: 0,
    gerenciarEstoque: true,
    quantidadeEstoque: 0,
    dataValidade: '',
    temVariacoes: false,
    variacoes: [],
    pesoKg: '',
    alturaCm: '',
    larguraCm: '',
    comprimentoCm: '',
    requerAgendamento: false,
    duracaoEstimadaMinutos: 30,
    localPrestacaoServico: 'loja',
    modoTaxaDomicilio: 'padrao',
    taxaDeslocamentoDomicilio: '',
    abaterTaxaDomicilioAoFechar: false,
    profissionaisHabilitadosIds: []
  });

  const [colaboradoresPrestadoresLoja, setColaboradoresPrestadoresLoja] = useState<UsuarioLoja[]>([]);

  useEffect(() => {
    if (!loja?.id) return;
    supabase
      .from('usuarios_loja')
      .select('*')
      .eq('loja_id', loja.id)
      .eq('ativo', true)
      .eq('presta_servicos', true)
      .order('nome_completo', { ascending: true })
      .then(({ data: users }) => {
        if (users) setColaboradoresPrestadoresLoja(users as UsuarioLoja[]);
      });

    supabase
      .from('fornecedores')
      .select('*')
      .eq('loja_id', loja.id)
      .eq('ativo', true)
      .order('nome', { ascending: true })
      .then(({ data: forn }) => {
        if (forn) setFornecedoresLista(forn as Fornecedor[]);
      });
  }, [loja?.id]);

  // Carregar histórico real de movimentações ao abrir TELA 011
  useEffect(() => {
    if (telaAtiva !== 'movimentacoes' || !loja?.id || !produtoEditando?.id) {
      return;
    }
    let ativo = true;
    const carregarMovs = async () => {
      try {
        setCarregandoMovimentacoes(true);
        const { data, error } = await supabase
          .from('movimentacoes_estoque')
          .select('id, tipo_movimentacao, quantidade, saldo_anterior, saldo_posterior, motivo, criado_em, usuario_id')
          .eq('loja_id', loja.id)
          .eq('produto_id', produtoEditando.id)
          .order('criado_em', { ascending: false })
          .limit(50);
        if (!ativo) return;
        if (!error && Array.isArray(data)) {
          setMovimentacoesLista(data);
        } else {
          setMovimentacoesLista([]);
        }
      } catch {
        if (ativo) setMovimentacoesLista([]);
      } finally {
        if (ativo) setCarregandoMovimentacoes(false);
      }
    };
    carregarMovs();
    return () => {
      ativo = false;
    };
  }, [telaAtiva, loja?.id, produtoEditando?.id]);

  const { confirmar, mostrarAviso } = useFeedbackModal();
  const [snapshotInicialForm, setSnapshotInicialForm] = useState<string>('');

  const snapshotAtualForm = useMemo(() => {
    return JSON.stringify(formData);
  }, [formData]);

  const temAlteracoesFormulario = Boolean(
    (telaAtiva === 'novo' || telaAtiva === 'detalhes') &&
    snapshotInicialForm &&
    snapshotAtualForm !== snapshotInicialForm
  );

  const previewUrlsRef = useRef<Set<string>>(new Set());

  const registrarPreviewUrl = (url?: string) => {
    if (url && url.startsWith('blob:')) {
      previewUrlsRef.current.add(url);
    }
  };

  const revogarPreviewUrl = (url?: string) => {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignora caso já tenha sido revogada
      }
      previewUrlsRef.current.delete(url);
    }
  };

  const revogarPreviewUrls = () => {
    previewUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignora caso já tenha sido revogada
      }
    });
    previewUrlsRef.current.clear();
  };

  useEffect(() => {
    return () => {
      revogarPreviewUrls();
    };
  }, []);

  const fecharFormularioComConfirmacao = () => {
    if (temAlteracoesFormulario) {
      confirmar({
        titulo: 'Descartar Alterações?',
        mensagem: 'Você tem dados alterados no produto que não foram salvos. Deseja sair e descartar as alterações?',
        textoConfirmar: 'Descartar e Sair',
        textoCancelar: 'Continuar Editando',
        onConfirmar: () => {
          revogarPreviewUrls();
          limparCacheVisaoIA();
          setSnapshotInicialForm('');
          setTelaAtiva('lista');
        }
      });
    } else {
      revogarPreviewUrls();
      limparCacheVisaoIA();
      setSnapshotInicialForm('');
      setTelaAtiva('lista');
    }
  };

  const [opcionaisExpandido, setOpcionaisExpandido] = useState<boolean>(true);
  const [salvandoProduto, setSalvandoProduto] = useState<boolean>(false);
  const [processandoIA, setProcessandoIA] = useState<boolean>(false);
  const [mensagemStatusIA, setMensagemStatusIA] = useState<string>('');
  const [mensagemFeedback, setMensagemFeedback] = useState<{ texto: string; tipo: 'sucesso' | 'erro' } | null>(null);

  // Estados do Radar de Preços de Mercado (IA Gemini)
  const [modalRadarAberto, setModalRadarAberto] = useState<boolean>(false);
  const [dadosMercado, setDadosMercado] = useState<DadosMercadoIA | null>(null);
  const [buscandoMercado, setBuscandoMercado] = useState<boolean>(false);
  const [erroMercado, setErroMercado] = useState<string | null>(null);

  // Estados de IA no Modal de Criação / Preenchimento
  const [abaModalIA, setAbaModalIA] = useState<'foto' | 'texto' | 'codigo'>('foto');
  const [promptTextoIA, setPromptTextoIA] = useState<string>('');
  const [promptCodigoIA, setPromptCodigoIA] = useState<string>('');

  // Carregar unidades de medida da loja (ou padrao) com isolamento RLS
  useEffect(() => {
    if (!loja?.id) return;
    const carregarUnidades = async () => {
      try {
        const { data: u } = await supabase
          .from('unidades_medida')
          .select('sigla, nome')
          .eq('loja_id', loja.id)
          .order('sigla');

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
      } catch (err) {
        console.warn('Falha ao carregar unidades de medida:', err);
      }
    };
    carregarUnidades();
  }, [loja?.id]);

  // Estados para Teclado Numérico (TELA012)
  const [tecladoValorEstoqueMin, setTecladoValorEstoqueMin] = useState<string>('0');

  // Estados para Scanner de Câmera / Barcode (TELA018)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputGaleriaRef = useRef<HTMLInputElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [torchLigado, setTorchLigado] = useState<boolean>(false);
  const [somScannerMudo, setSomScannerMudo] = useState<boolean>(false);
  const [scannerErro, setScannerErro] = useState<string | null>(null);
  const animFrameScannerRef = useRef<number | null>(null);

  // Estado para Câmera In-App Unificada (ModalCameraCapturaMobile - anti-OOM)
  const [modoCameraCaptura, setModoCameraCaptura] = useState<'produto' | 'ia' | null>(null);
  const modoCameraCapturaRef = useRef<'produto' | 'ia' | null>(null);
  const [origemScannerParaIA, setOrigemScannerParaIA] = useState<boolean>(false);
  const cacheVisaoIARef = useRef<Map<string, PayloadBase64IA>>(new Map());
  const [fotoPrincipalBase64IA, setFotoPrincipalBase64IA] = useState<{
    url: string;
    payload: PayloadBase64IA;
  } | null>(null);
  const [duplicadoModal, setDuplicadoModal] = useState<{
    produto: Produto;
    motivo: MotivoDuplicidade;
    origem: 'ia' | 'salvar';
    fotoCapturada?: string;
  } | null>(null);
  const duplicidadeConfirmadaChaveRef = useRef<string | null>(null);

  const registrarPayloadVisaoIA = (
    urlPrincipal: string,
    payload: PayloadBase64IA,
    urlSecundaria?: string
  ) => {
    if (urlPrincipal) {
      cacheVisaoIARef.current.set(urlPrincipal, payload);
    }
    if (urlSecundaria) {
      cacheVisaoIARef.current.set(urlSecundaria, payload);
    }
    setFotoPrincipalBase64IA({ url: urlPrincipal, payload });
  };

  const obterPayloadVisaoIAParaUrl = (url?: string | null): PayloadBase64IA | null => {
    if (!url) return null;
    const cached = cacheVisaoIARef.current.get(url);
    if (cached) return cached;
    if (fotoPrincipalBase64IA && fotoPrincipalBase64IA.url === url) {
      return fotoPrincipalBase64IA.payload;
    }
    return null;
  };

  const limparCacheVisaoIA = () => {
    cacheVisaoIARef.current.clear();
    setFotoPrincipalBase64IA(null);
    setDuplicadoModal(null);
    duplicidadeConfirmadaChaveRef.current = null;
  };

  const abrirCameraCaptura = (modo: 'produto' | 'ia') => {
    modoCameraCapturaRef.current = modo;
    setModoCameraCaptura(modo);
  };

  const fecharCameraCaptura = () => {
    modoCameraCapturaRef.current = null;
    setModoCameraCaptura(null);
  };

  // Estados de IA para Descrição (TELA017)
  const [gerandoDescricaoIA, setGerandoDescricaoIA] = useState<boolean>(false);
  const [redigindoDescricaoIA, setRedigindoDescricaoIA] = useState<boolean>(false);
  const descricaoEditadaManualRef = useRef<boolean>(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState<string>('');
  const [criandoNovaCategoria, setCriandoNovaCategoria] = useState<boolean>(false);
  const [buscaCategoria, setBuscaCategoria] = useState<string>('');

  // =========================================================================
  // RECONHECIMENTO DE VOZ (PESQUISA POR VOZ GLOBAL MOBILE)
  // =========================================================================
  const alternarPesquisaPorVoz = (setTargetValue: (val: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      mostrarAviso('Seu navegador não suporta pesquisa por voz. Use o teclado para digitar.', 'Pesquisa por Voz');
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
    if (p.tipo_item === 'servico') return 0;
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0);
    }
    return Number(p.quantidade_estoque || 0);
  };

  const getValorVendaEstoque = (p: Produto): number => {
    if (p.tipo_item === 'servico') return 0;
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => {
        const preco = Number(v.preco_venda_varejo) || Number(p.preco_venda_varejo) || 0;
        return acc + Number(v.quantidade_estoque || 0) * preco;
      }, 0);
    }
    return Number(p.quantidade_estoque || 0) * Number(p.preco_venda_varejo || 0);
  };

  const getValorCustoEstoque = (p: Produto): number => {
    if (p.tipo_item === 'servico') return 0;
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
        const varMatch = Array.isArray(p.variacoes) && p.variacoes.some(v =>
          v.codigo_barras?.toLowerCase().includes(q) || v.sku?.toLowerCase().includes(q)
        );
        return nomeMatch || codBarrasMatch || codInternoMatch || catMatch || varMatch;
      });
    }

    // Na aba ESTOQUE, serviços/taxas não entram na movimentação de estoque físico
    if (abaLista === 'estoque') {
      list = list.filter(p => p.tipo_item !== 'servico');
    }

    // Filtro Tipo de Item (Produtos vs Serviços)
    if (filtroTipoItem === 'produto') {
      list = list.filter(p => p.tipo_item !== 'servico');
    } else if (filtroTipoItem === 'servico') {
      list = list.filter(p => p.tipo_item === 'servico');
    }

    // Filtros de Estoque
    if (filtroSemEstoque || filtroMinimo || filtroAcimaMinimo || filtroSemControle) {
      list = list.filter(p => {
        if (p.tipo_item === 'servico') return false;
        const est = getEstoqueReal(p);
        const min = Number(p.estoque_minimo_alerta || 0);

        if (filtroSemEstoque && est <= 0) return true;
        if (filtroMinimo && est > 0 && est <= min) return true;
        if (filtroAcimaMinimo && est > min) return true;
        if (filtroSemControle && est === 0 && min === 0) return true;
        return false;
      });
    }

    // Filtros de Categorias com contagem e filtragem consolidada (categoria + subcategorias)
    if (categoriasFiltro.length > 0) {
      list = list.filter(p =>
        produtoCorrespondeAoFiltroCategorias(
          p,
          categoriasFiltro,
          categoriasPrincipaisFiltro,
          loja?.id
        )
      );
    }

    // Filtro de Status Ativo / Inativo
    if (filtroAtivo === 'ativos') {
      list = list.filter(p => p.ativo !== false);
    } else if (filtroAtivo === 'inativos') {
      list = list.filter(p => p.ativo === false);
    }

    // Filtro Mercado Livre
    if (filtroMl === 'publicados') {
      list = list.filter(p => Boolean(mapaAnunciosMl[p.id] && mapaAnunciosMl[p.id].length > 0));
    } else if (filtroMl === 'nao_publicados') {
      list = list.filter(p => !mapaAnunciosMl[p.id] || mapaAnunciosMl[p.id].length === 0);
    }

    // Ordenação (específica da aba Estoque)
    if (abaLista === 'estoque') {
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
    filtroTipoItem,
    filtroSemEstoque,
    filtroMinimo,
    filtroAcimaMinimo,
    filtroSemControle,
    categoriasFiltro,
    filtroAtivo,
    filtroMl,
    mapaAnunciosMl,
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
    if (!permissions.podeCadastrarAlterarProdutos) {
      setMensagemFeedback({ texto: 'Você não tem permissão para cadastrar produtos.', tipo: 'erro' });
      return;
    }
    setProdutoEditando(null);
    limparCacheVisaoIA();
    const initialData = {
      nome: '',
      codigoInterno: '',
      fornecedorId: '',
      precoVenda: '',
      precoPromocional: '',
      precoCusto: '',
      precoAtacado: '',
      qtdMinimaAtacado: 0,
      precoAutoatacado: '',
      qtdMinimaAutoatacado: 0,
      categoriaId: '',
      subcategoriaId: '',
      descricao: '',
      codigoBarras: '',
      tipoUnidade: 'un' as TipoUnidade,
      unidadeMedida: 'un',
      vendaPorPeso: false,
      codigoBalanca: '',
      tipoItem: 'produto' as 'produto' | 'servico',
      destaque: false,
      exibirCatalogo: true,
      ativo: true,
      corEtiqueta: '#1F2937',
      fotos: [],
      estoqueMinimo: 0,
      gerenciarEstoque: true,
      quantidadeEstoque: 0,
      dataValidade: '',
      temVariacoes: false,
      variacoes: [],
      pesoKg: '',
      alturaCm: '',
      larguraCm: '',
      comprimentoCm: '',
      requerAgendamento: false,
      duracaoEstimadaMinutos: 30,
      localPrestacaoServico: 'loja' as LocalPrestacaoServico,
      modoTaxaDomicilio: 'padrao' as 'padrao' | 'especifico' | 'gratis',
      taxaDeslocamentoDomicilio: '',
      abaterTaxaDomicilioAoFechar: false,
      profissionaisHabilitadosIds: []
    };
    setRotuloVariacao1('Tamanho');
    setRotuloVariacao2('');
    setFormData(initialData);
    setSnapshotInicialForm(JSON.stringify(initialData));
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
        await supabase.from('produtos').update({ cor_etiqueta: cor }).eq('id', produtoId).eq('loja_id', loja.id);
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
    } catch (err: any) {
      console.error('Erro ao aplicar cor em massa:', err);
      setMensagemFeedback({ texto: 'Erro ao aplicar cor a todos os produtos.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  // Funções do Radar de Preços de Mercado (IA)
  const handleAbrirRadarPrecos = async () => {
    setModalRadarAberto(true);
    setErroMercado(null);

    if (!formData.nome.trim()) {
      setErroMercado('Por favor, informe o nome do produto no formulário primeiro para pesquisar os concorrentes.');
      return;
    }

    let serperKey = obterSerpApiKey(loja);
    if (!serperKey && loja?.id) {
      serperKey = await obterOuBuscarSerpApiKey(loja);
      if (serperKey && setLoja && loja) {
        setLoja({ ...loja, serper_api_key: serperKey });
      }
    }
    if (!serperKey) {
      setErroMercado(
        'Chave do Serper.dev não configurada para esta loja. Cadastre sua chave gratuita (2.500 consultas gratuitas em https://serper.dev/api-key) nas Configurações da Loja para usar o Radar de Preços.'
      );
      return;
    }

    // Se já temos dados do radar em memória, não chama a IA novamente! Apresenta imediatamente os dados salvos em memória.
    if (dadosMercado) {
      return;
    }

    // Executa a pesquisa completa e aprofundada de mercado se ainda não houver dados em memória
    await buscarConcorrentesMercado();
  };

  const buscarConcorrentesMercado = async () => {
    if (!formData.nome.trim()) {
      setErroMercado('Informe o nome do produto para realizar a pesquisa de mercado.');
      return;
    }
    try {
      setBuscandoMercado(true);
      setErroMercado(null);
      const catNome = mapaCategorias.get(formData.categoriaId) || 'Geral';
      const resultado = await pesquisarPrecosMercadoIA(formData.nome, catNome, formData.codigoBarras, loja, segmentoLoja);
      setDadosMercado(resultado);
    } catch (err: any) {
      setErroMercado(err.message || 'Erro ao pesquisar preços de mercado.');
    } finally {
      setBuscandoMercado(false);
    }
  };

  const handleAplicarPrecoMercado = (novoPreco: number) => {
    // Aplica sempre sem centavos (ex: 37,40 vira 37,00)
    const semCentavos = Math.floor(novoPreco);
    const descAtacado = Number(regrasPrecificacaoLoja.descontoAtacado) || 20;
    const descAuto = Number(regrasPrecificacaoLoja.descontoAutoatacado) || 25;

    const atacadoCalc = (semCentavos * (1 - descAtacado / 100)).toFixed(2).replace('.', ',');
    const autoCalc = (semCentavos * (1 - descAuto / 100)).toFixed(2).replace('.', ',');

    setFormData(prev => ({
      ...prev,
      precoVenda: semCentavos.toFixed(2).replace('.', ','),
      precoAtacado: atacadoCalc,
      precoAutoatacado: autoCalc
    }));
    setModalRadarAberto(false);
    setMensagemFeedback({ texto: `Preço sugerido R$ ${semCentavos.toFixed(2)} aplicado com sucesso!`, tipo: 'sucesso' });
  };

  // Atualizar Produto Existente com IA
  const handleAtualizarProdutoExistenteIA = async () => {
    if (!formData.nome.trim() && !formData.descricao.trim() && formData.fotos.length === 0) {
      setMensagemFeedback({ texto: 'Informe ao menos o nome, descrição ou foto do produto.', tipo: 'erro' });
      return;
    }

    setProcessandoIA(true);
    setRedigindoDescricaoIA(false);
    descricaoEditadaManualRef.current = false;
    setMensagemStatusIA('Atualizando produto com IA...');

    const aplicarCamposEstagio1 = (parcial: {
      nome?: string;
      preco_venda_estimado?: number;
      preco_custo_estimado?: number;
      categoria_sugerida?: string;
      codigo_barras?: string;
      tipo_unidade?: string;
    }) => {
      let atacadoSugerido: string | undefined = undefined;
      let autoSugerido: string | undefined = undefined;
      let precoVendaFmt = formData.precoVenda;
      let precoCustoFmt = formData.precoCusto;

      if (parcial.preco_venda_estimado && parcial.preco_venda_estimado > 0) {
        const semCentavos = Math.floor(parcial.preco_venda_estimado);
        const descAtacado = Number(regrasPrecificacaoLoja.descontoAtacado) || 20;
        const descAuto = Number(regrasPrecificacaoLoja.descontoAutoatacado) || 25;
        precoVendaFmt = semCentavos.toFixed(2).replace('.', ',');
        atacadoSugerido = (semCentavos * (1 - descAtacado / 100)).toFixed(2).replace('.', ',');
        autoSugerido = (semCentavos * (1 - descAuto / 100)).toFixed(2).replace('.', ',');

        const custoEst = Number(parcial.preco_custo_estimado) || 0;
        if (custoEst > 0 && custoEst < semCentavos) {
          precoCustoFmt = custoEst.toFixed(2).replace('.', ',');
        }
      }

      let categoriaMatchId = formData.categoriaId;
      if (parcial.categoria_sugerida) {
        const achouCat = categorias.find(c =>
          c.nome.toLowerCase().includes(parcial.categoria_sugerida!.toLowerCase())
        );
        if (achouCat) categoriaMatchId = achouCat.id;
      }

      setFormData(prev => ({
        ...prev,
        nome: !prev.nome.trim() && parcial.nome ? parcial.nome.toUpperCase() : prev.nome,
        categoriaId: categoriaMatchId || prev.categoriaId,
        precoVenda: precoVendaFmt,
        precoCusto: precoCustoFmt,
        precoAtacado: atacadoSugerido !== undefined ? atacadoSugerido : prev.precoAtacado,
        precoAutoatacado: autoSugerido !== undefined ? autoSugerido : prev.precoAutoatacado,
        codigoBarras: parcial.codigo_barras || prev.codigoBarras,
        tipoUnidade: (parcial.tipo_unidade as TipoUnidade) || prev.tipoUnidade
      }));
    };

    try {
      const catNome = mapaCategorias.get(formData.categoriaId) || 'Geral';
      const dadosAtualizados = await atualizarProdutoExistenteComIA({
        nome: formData.nome || 'Produto',
        descricao: formData.descricao,
        fotoUrl: !formData.nome?.trim() ? formData.fotos[0] : undefined,
        fotos: formData.fotos,
        possuiImagens: formData.fotos.length > 0,
        categoriaNome: catNome,
        codigoBarras: formData.codigoBarras,
        precoVendaAtual: Number(formData.precoVenda?.replace(',', '.')) || undefined,
        segmentoLoja,
        loja,
        onEstagio1Pronto: (parcialEstagio1) => {
          aplicarCamposEstagio1(parcialEstagio1);
          setProcessandoIA(false);
          setMensagemStatusIA('');
          setRedigindoDescricaoIA(true);
        }
      });

      if (dadosAtualizados) {
        aplicarCamposEstagio1(dadosAtualizados);
        if (dadosAtualizados.descricao && !descricaoEditadaManualRef.current) {
          setFormData(prev => ({
            ...prev,
            descricao: dadosAtualizados.descricao || prev.descricao
          }));
        }

        setMensagemFeedback({ texto: '✨ Produto atualizado e enriquecido com sucesso pela IA!', tipo: 'sucesso' });
      }
    } catch (err: any) {
      console.error('Erro na atualização do produto com IA:', err);
      setMensagemFeedback({ texto: `Erro ao atualizar com IA: ${err.message || 'Tente novamente'}`, tipo: 'erro' });
    } finally {
      setProcessandoIA(false);
      setMensagemStatusIA('');
      setRedigindoDescricaoIA(false);
    }
  };

  const abrirEditarProduto = (p: Produto, aba: 'cadastro' | 'estoque' = 'cadastro') => {
    setProdutoEditando(p);
    limparCacheVisaoIA();
    setDadosMercado(null);
    setErroMercado(null);
    const corSalva = obterCorProduto(p);
    const taxaServico = (p as any).taxa_deslocamento_domicilio;
    const modoTaxa: 'padrao' | 'especifico' | 'gratis' =
      taxaServico === 0 || taxaServico === '0'
        ? 'gratis'
        : taxaServico !== null && taxaServico !== undefined && Number(taxaServico) > 0
          ? 'especifico'
          : 'padrao';
    const initialEditData = {
      nome: p.nome || '',
      codigoInterno: p.codigo_interno || '',
      fornecedorId: p.fornecedor_id || '',
      precoVenda: p.preco_venda_varejo !== undefined && p.preco_venda_varejo !== null ? String(p.preco_venda_varejo) : '',
      precoPromocional: p.preco_promocional ? String(p.preco_promocional) : '',
      precoCusto: p.preco_custo !== undefined && p.preco_custo !== null ? String(p.preco_custo) : '',
      precoAtacado: p.preco_venda_atacado ? String(p.preco_venda_atacado) : '',
      qtdMinimaAtacado: p.tipo_minimo_atacado === 'minimo_sku' && Number(p.qtd_minima_atacado) > 0 && Number(p.qtd_minima_atacado) !== 6 ? Number(p.qtd_minima_atacado) : 0,
      precoAutoatacado: p.preco_venda_autoatacado ? String(p.preco_venda_autoatacado) : '',
      qtdMinimaAutoatacado: p.tipo_minimo_autoatacado === 'minimo_sku' && Number(p.qtd_minima_autoatacado) > 0 && Number(p.qtd_minima_autoatacado) !== 24 ? Number(p.qtd_minima_autoatacado) : 0,
      categoriaId: p.categoria_id || '',
      subcategoriaId: obterSubcategoriaIdProduto(p, loja?.id) || '',
      descricao: p.descricao || '',
      codigoBarras: p.codigo_barras || '',
      tipoUnidade: p.tipo_unidade || 'un',
      unidadeMedida: (p as any).unidade_medida || p.tipo_unidade || 'un',
      vendaPorPeso: Boolean(p.venda_por_peso || p.permite_fracionado || ['kg', 'g', 'l', 'ml', 'm'].includes((p.tipo_unidade || '').toLowerCase())),
      codigoBalanca: p.codigo_balanca != null ? String(p.codigo_balanca) : '',
      tipoItem: (p.tipo_item as any) || 'produto',
      destaque: Boolean(p.destaque),
      exibirCatalogo: p.exibir_catalogo !== false,
      ativo: p.ativo !== false,
      corEtiqueta: corSalva,
      fotos: p.fotos_urls || [],
      estoqueMinimo: Number(p.estoque_minimo_alerta || 0),
      gerenciarEstoque: true,
      quantidadeEstoque: getEstoqueReal(p),
      dataValidade: p.data_validade ? p.data_validade.split('T')[0] : '',
      temVariacoes: Boolean(p.tem_variacoes || (p.variacoes && p.variacoes.length > 0)),
      variacoes: p.variacoes ? [...p.variacoes] : [],
      pesoKg: (p as any).peso_kg != null ? String((p as any).peso_kg) : '',
      alturaCm: (p as any).altura_cm != null ? String((p as any).altura_cm) : '',
      larguraCm: (p as any).largura_cm != null ? String((p as any).largura_cm) : '',
      comprimentoCm: (p as any).comprimento_cm != null ? String((p as any).comprimento_cm) : '',
      requerAgendamento: Boolean(p.requer_agendamento),
      duracaoEstimadaMinutos: p.duracao_estimada_minutos || 30,
      localPrestacaoServico: p.local_prestacao_servico || 'loja',
      modoTaxaDomicilio: modoTaxa,
      taxaDeslocamentoDomicilio: taxaServico != null && Number(taxaServico) > 0 ? String(taxaServico) : '',
      abaterTaxaDomicilioAoFechar: Boolean((p as any).abater_taxa_domicilio_ao_fechar),
      profissionaisHabilitadosIds: []
    };
    if (p.tipo_item === 'servico' && p.id && loja?.id) {
      supabase
        .from('servico_profissionais')
        .select('usuario_id')
        .eq('loja_id', loja.id)
        .eq('produto_id', p.id)
        .eq('ativo', true)
        .then(({ data: vincs }) => {
          if (vincs) setFormData(prev => ({ ...prev, profissionaisHabilitadosIds: vincs.map(v => v.usuario_id) }));
        });
    }
    setRotuloVariacao1(p.rotulo_variacao_1 || 'Tamanho');
    setRotuloVariacao2(p.rotulo_variacao_2 || '');
    setFormData(initialEditData);
    setSnapshotInicialForm(JSON.stringify(initialEditData));
    setAbaFormulario(aba);
    setTelaAtiva('detalhes');
  };

  // =========================================================================
  // SALVAMENTO / PERSISTÊNCIA NO SUPABASE
  // =========================================================================
  const salvarProduto = async (ignorarDuplicidade = false) => {
    if (!loja?.id) return;
    if (!permissions.podeCadastrarAlterarProdutos) {
      setMensagemFeedback({ texto: 'Você não tem permissão para salvar alterações em produtos.', tipo: 'erro' });
      return;
    }
    if (!formData.nome.trim()) {
      setMensagemFeedback({ texto: 'Informe o nome do produto.', tipo: 'erro' });
      return;
    }

    if (!produtoEditando?.id && !ignorarDuplicidade) {
      const chaveAtual = `${normalizarTextoProduto(formData.nome)}::${(formData.codigoBarras || '').trim()}`;
      if (duplicidadeConfirmadaChaveRef.current !== chaveAtual) {
        const resDup = buscarProdutoDuplicado(produtos, {
          nome: formData.nome,
          codigoBarras: formData.codigoBarras
        });
        if (resDup.encontrado && resDup.produto && resDup.motivo) {
          setDuplicadoModal({
            produto: resDup.produto,
            motivo: resDup.motivo,
            origem: 'salvar',
            fotoCapturada: formData.fotos[0]
          });
          return;
        }
      }
    }

    try {
      setSalvandoProduto(true);

      const fotosFinalUrls = await Promise.all(
        (formData.fotos || []).slice(0, 7).map((foto) => ProdutoService.uploadFotoDataUrl(foto, loja.id))
      );

      const isServico = formData.tipoItem === 'servico';
      const precoVendaNum = parseFloat(formData.precoVenda.replace(',', '.')) || 0;
      const precoPromoNum = formData.precoPromocional ? parseFloat(formData.precoPromocional.replace(',', '.')) : null;
      const precoCustoNum = formData.precoCusto ? parseFloat(formData.precoCusto.replace(',', '.')) : 0;
      const precoAtacadoNum = (!isServico && formData.precoAtacado) ? parseFloat(formData.precoAtacado.replace(',', '.')) : null;
      const precoAutoatacadoNum = (!isServico && formData.precoAutoatacado) ? parseFloat(formData.precoAutoatacado.replace(',', '.')) : null;
      const qtdMinAtacadoNum = isServico ? 0 : (regrasPrecificacaoLoja.tipoMinAtacado === 'minimo_sku'
        ? (Number(formData.qtdMinimaAtacado) || 0)
        : (regrasPrecificacaoLoja.tipoMinAtacado === 'quantidade' ? (regrasPrecificacaoLoja.qtdMinAtacado || 0) : 0));
      const valMinAtacadoNum = isServico ? null : (regrasPrecificacaoLoja.tipoMinAtacado === 'valor'
        ? (regrasPrecificacaoLoja.valMinAtacado || null)
        : null);

      const qtdMinAutoatacadoNum = isServico ? 0 : (regrasPrecificacaoLoja.tipoMinDistribuidor === 'minimo_sku'
        ? (Number(formData.qtdMinimaAutoatacado) || 0)
        : (regrasPrecificacaoLoja.tipoMinDistribuidor === 'quantidade' ? (regrasPrecificacaoLoja.qtdMinDistribuidor || 0) : 0));
      const valMinAutoatacadoNum = isServico ? null : (regrasPrecificacaoLoja.tipoMinDistribuidor === 'valor'
        ? (regrasPrecificacaoLoja.valMinDistribuidor || null)
        : null);

      const taxaDomicilioFinal = (isServico && (formData.localPrestacaoServico === 'externo' || formData.localPrestacaoServico === 'ambos'))
        ? (formData.modoTaxaDomicilio === 'especifico'
            ? (parseFloat(formData.taxaDeslocamentoDomicilio.replace(',', '.')) || 0)
            : (formData.modoTaxaDomicilio === 'gratis' ? 0 : null))
        : null;
      const abaterTaxaDomicilioFinal = (isServico && (formData.localPrestacaoServico === 'externo' || formData.localPrestacaoServico === 'ambos'))
        ? (formData.modoTaxaDomicilio === 'especifico'
            ? Boolean(formData.abaterTaxaDomicilioAoFechar)
            : (formData.modoTaxaDomicilio === 'gratis' ? false : null))
        : null;

      const payload: Partial<Produto> = {
        loja_id: loja.id,
        nome: formData.nome.trim().toUpperCase(),
        codigo_interno: formData.codigoInterno.trim() || null,
        fornecedor_id: isServico ? null : (formData.fornecedorId || null),
        categoria_id: formData.categoriaId || null,
        subcategoria_id: formData.subcategoriaId || null,
        preco_venda_varejo: precoVendaNum,
        preco_promocional: precoPromoNum,
        promocao_ativa: Boolean(precoPromoNum && precoPromoNum > 0 && precoPromoNum < precoVendaNum),
        preco_custo: precoCustoNum,
        preco_venda_atacado: precoAtacadoNum,
        tipo_minimo_atacado: isServico ? null : regrasPrecificacaoLoja.tipoMinAtacado,
        qtd_minima_atacado: qtdMinAtacadoNum,
        valor_minimo_atacado: valMinAtacadoNum,
        preco_venda_autoatacado: precoAutoatacadoNum,
        tipo_minimo_autoatacado: isServico ? null : regrasPrecificacaoLoja.tipoMinDistribuidor,
        qtd_minima_autoatacado: qtdMinAutoatacadoNum,
        valor_minimo_autoatacado: valMinAutoatacadoNum,
        descricao: formData.descricao.trim() || null,
        codigo_barras: isServico ? null : (formData.codigoBarras.trim() || null),
        tipo_unidade: isServico ? 'un' : formData.tipoUnidade,
        unidade_medida: isServico ? 'UN' : (formData.unidadeMedida || formData.tipoUnidade || 'UN').toUpperCase(),
        venda_por_peso: isServico ? false : Boolean(formData.vendaPorPeso),
        permite_fracionado: isServico ? false : Boolean(formData.vendaPorPeso),
        codigo_balanca: isServico ? null : (formData.codigoBalanca.trim() ? parseInt(formData.codigoBalanca.trim(), 10) : null),
        tipo_item: formData.tipoItem || 'produto',
        destaque: formData.destaque,
        exibir_catalogo: formData.exibirCatalogo,
        fotos_urls: fotosFinalUrls,
        estoque_minimo_alerta: isServico ? 0 : formData.estoqueMinimo,
        quantidade_estoque: isServico
          ? 0
          : (formData.temVariacoes && formData.variacoes.length > 0
              ? formData.variacoes.reduce((acc, v) => acc + (Number(v.quantidade_estoque) || 0), 0)
              : formData.quantidadeEstoque),
        tem_variacoes: isServico ? false : Boolean(formData.temVariacoes && formData.variacoes.length > 0),
        rotulo_variacao_1: (!isServico && formData.temVariacoes) ? rotuloVariacao1 || 'Tamanho' : null,
        rotulo_variacao_2: (!isServico && formData.temVariacoes && rotuloVariacao2.trim()) ? rotuloVariacao2.trim() : null,
        data_validade: isServico ? null : (formData.dataValidade || null),
        cor_etiqueta: formData.corEtiqueta,
        ativo: formData.ativo !== false,
        peso_kg: (!isServico && formData.pesoKg) ? Number(formData.pesoKg.replace(',', '.')) : null,
        altura_cm: (!isServico && formData.alturaCm) ? Number(formData.alturaCm.replace(',', '.')) : null,
        largura_cm: (!isServico && formData.larguraCm) ? Number(formData.larguraCm.replace(',', '.')) : null,
        comprimento_cm: (!isServico && formData.comprimentoCm) ? Number(formData.comprimentoCm.replace(',', '.')) : null,
        requer_agendamento: isServico ? Boolean(formData.requerAgendamento) : false,
        duracao_estimada_minutos: isServico ? (formData.duracaoEstimadaMinutos || 30) : 30,
        local_prestacao_servico: isServico ? (formData.localPrestacaoServico || 'loja') : 'loja',
        taxa_deslocamento_domicilio: taxaDomicilioFinal,
        abater_taxa_domicilio_ao_fechar: abaterTaxaDomicilioFinal
      };

      let produtoSalvoId = produtoEditando?.id;

      if (produtoEditando?.id) {
        // Atualizar produto existente
        let { error } = await supabase
          .from('produtos')
          .update({
            ...payload,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', produtoEditando.id)
          .eq('loja_id', loja.id);

        if (error && (
          error.message?.includes('subcategoria_id') ||
          error.message?.includes('tipo_item') || 
          error.message?.includes('peso_kg') || 
          error.message?.includes('altura_cm') ||
          error.message?.includes('unidade_medida') ||
          error.message?.includes('taxa_deslocamento_domicilio') ||
          (error as any).details?.includes('peso_kg')
        )) {
          console.warn('Colunas novas ausentes no schema de produtos. Tentando atualizar sem elas...');
          const { subcategoria_id, tipo_item, peso_kg, altura_cm, largura_cm, comprimento_cm, unidade_medida, taxa_deslocamento_domicilio, abater_taxa_domicilio_ao_fechar, ...payloadBase } = payload;
          const retry = await supabase
            .from('produtos')
            .update({
              ...payloadBase,
              atualizado_em: new Date().toISOString()
            })
            .eq('id', produtoEditando.id)
            .eq('loja_id', loja.id);
          error = retry.error;
        }

        if (error) throw error;
        salvarVinculoSubcategoriaProdutoLocal(loja.id, produtoEditando.id, formData.subcategoriaId || null);
        await persistirCorProdutoSupabase(produtoEditando.id, formData.corEtiqueta);
        setMensagemFeedback({ texto: 'Produto atualizado com sucesso!', tipo: 'sucesso' });
      } else {
        // Criar novo produto
        let { data: prodCriado, error } = await supabase
          .from('produtos')
          .insert([{
            ...payload,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
          }])
          .select()
          .single();

        if (error && (
          error.message?.includes('subcategoria_id') ||
          error.message?.includes('tipo_item') || 
          error.message?.includes('peso_kg') || 
          error.message?.includes('altura_cm') ||
          error.message?.includes('unidade_medida') ||
          error.message?.includes('taxa_deslocamento_domicilio') ||
          (error as any).details?.includes('peso_kg')
        )) {
          console.warn('Colunas novas ausentes no schema de produtos. Tentando cadastrar sem elas...');
          const { subcategoria_id, tipo_item, peso_kg, altura_cm, largura_cm, comprimento_cm, unidade_medida, taxa_deslocamento_domicilio, abater_taxa_domicilio_ao_fechar, ...payloadBase } = payload;
          const retry = await supabase
            .from('produtos')
            .insert([{
              ...payloadBase,
              criado_em: new Date().toISOString(),
              atualizado_em: new Date().toISOString()
            }])
            .select()
            .single();
          prodCriado = retry.data;
          error = retry.error;
        }

        if (error && (error.message?.includes('tipo_item') || (error as any).details?.includes('tipo_item'))) {
          console.warn('Coluna tipo_item ausente no schema de produtos. Tentando cadastrar sem ela...');
          const { subcategoria_id, tipo_item, ...payloadSemTipoItem } = payload;
          const retry = await supabase
            .from('produtos')
            .insert([{
              ...payloadSemTipoItem,
              criado_em: new Date().toISOString(),
              atualizado_em: new Date().toISOString()
            }])
            .select()
            .single();
          prodCriado = retry.data;
          error = retry.error;
        }

        if (error) throw error;
        if (prodCriado?.id) {
          produtoSalvoId = prodCriado.id;
          salvarVinculoSubcategoriaProdutoLocal(loja.id, prodCriado.id, formData.subcategoriaId || null);
          await persistirCorProdutoSupabase(prodCriado.id, formData.corEtiqueta);
        }
        setMensagemFeedback({ texto: 'Produto cadastrado com sucesso!', tipo: 'sucesso' });
      }

      // Persistência relacional em variacoes_produto (SEM JSONB) via sincronização Delta inteligente (preservando PKs)
      if (produtoSalvoId) {
        if (formData.tipoItem === 'servico' && formData.requerAgendamento) {
          await agendamentoService.salvarProfissionaisDoServico(
            loja.id,
            produtoSalvoId,
            formData.profissionaisHabilitadosIds || []
          );
        }

        const variacoesDelta = (formData.variacoes || []).map(v => {
          const rot1 = (v.valor_variacao_1 || '').trim();
          const rot2 = (v.valor_variacao_2 || '').trim();
          const combNome = rot2 ? `${rot1} / ${rot2}` : rot1;
          return {
            id: v.id || null,
            valor_variacao_1: rot1 || 'Padrão',
            valor_variacao_2: rot2 || null,
            combinacao_nome: combNome || null,
            codigo_barras: v.codigo_barras || null,
            sku: v.sku || null,
            preco_custo: v.preco_custo != null && Number(v.preco_custo) > 0 ? Number(v.preco_custo) : null,
            preco_venda_varejo: Number(v.preco_venda_varejo) || precoVendaNum,
            preco_venda_atacado: v.preco_venda_atacado != null && Number(v.preco_venda_atacado) > 0 ? Number(v.preco_venda_atacado) : null,
            preco_venda_autoatacado: v.preco_venda_autoatacado != null && Number(v.preco_venda_autoatacado) > 0 ? Number(v.preco_venda_autoatacado) : null,
            preco_promocional: v.preco_promocional != null && Number(v.preco_promocional) > 0 ? Number(v.preco_promocional) : null,
            quantidade_estoque: Number(v.quantidade_estoque) || 0,
            estoque_minimo_alerta: Number(v.estoque_minimo_alerta || formData.estoqueMinimo) || 0,
            ativo: v.ativo !== false
          };
        });
        await ProdutoService.sincronizarVariacoesDelta(
          loja.id,
          produtoSalvoId,
          variacoesDelta,
          Boolean(!isServico && formData.temVariacoes && formData.variacoes.length > 0)
        );
      }

      await onRecarregar();
      revogarPreviewUrls();
      setSnapshotInicialForm('');
      setTelaAtiva('lista');
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err);
      setMensagemFeedback({ texto: 'Não foi possível salvar o produto. Verifique os campos e tente novamente.', tipo: 'erro' });
    } finally {
      setSalvandoProduto(false);
    }
  };

  // Excluir produto
  const handleExcluirProduto = () => {
    if (!produtoEditando?.id || !loja?.id) return;
    if (!permissions.podeCadastrarAlterarProdutos) {
      setMensagemFeedback({ texto: 'Você não tem permissão para excluir produtos.', tipo: 'erro' });
      return;
    }

    confirmar({
      titulo: 'Excluir Item?',
      mensagem: `Deseja realmente excluir "${produtoEditando.nome}"? Esta ação não poderá ser desfeita.`,
      textoConfirmar: 'Excluir',
      textoCancelar: 'Cancelar',
      onConfirmar: async () => {
        try {
          setSalvandoProduto(true);
          const { error } = await supabase
            .from('produtos')
            .delete()
            .eq('id', produtoEditando.id)
            .eq('loja_id', loja.id);
          if (error) throw error;

          setMensagemFeedback({ texto: 'Produto excluído com sucesso!', tipo: 'sucesso' });
          await onRecarregar();
          setSnapshotInicialForm('');
          setTelaAtiva('lista');
        } catch (err: any) {
          console.error('Erro ao excluir produto:', err);
          setMensagemFeedback({ texto: 'Não foi possível excluir o produto. Verifique se há pedidos vinculados.', tipo: 'erro' });
        } finally {
          setSalvandoProduto(false);
        }
      }
    });
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
        video: {
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          facingMode: 'environment'
        },
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
    if (!formData.nome.trim() && !formData.descricao.trim()) {
      setMensagemFeedback({
        texto: 'Informe o nome ou um rascunho da descrição antes de melhorar com IA.',
        tipo: 'erro'
      });
      return;
    }

    setGerandoDescricaoIA(true);
    try {
      const catNome = mapaCategorias.get(formData.categoriaId);
      const tipoItemAtual: 'produto' | 'servico' = formData.tipoItem === 'servico' ? 'servico' : 'produto';
      const novaDescricao = await gerarDescricaoExclusivaIA({
        nome: formData.nome.trim(),
        tipoItem: tipoItemAtual,
        descricaoAtual: formData.descricao,
        categoriaNome: catNome || undefined,
        duracaoMinutos: tipoItemAtual === 'servico' ? formData.duracaoEstimadaMinutos : undefined,
        localPrestacao: tipoItemAtual === 'servico' ? formData.localPrestacaoServico : undefined,
        segmentoLoja,
        loja
      });
      setFormData(prev => ({ ...prev, descricao: novaDescricao }));
      setMensagemFeedback({ texto: 'Descrição exclusiva gerada com sucesso!', tipo: 'sucesso' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível gerar a descrição com IA no momento.';
      console.warn('Erro ao gerar descrição com IA:', err);
      setMensagemFeedback({ texto: msg, tipo: 'erro' });
    } finally {
      setGerandoDescricaoIA(false);
    }
  };

  // =========================================================================
  const aplicarSugestaoMobile = async (sugestao: ProdutoSugeridoIA, fotoUrl?: string) => {
    // Localizar ou classificar categoria compatível da loja com Jev (System One)
    let categoriaMatchId = formData.categoriaId;
    if (categorias.length > 0) {
      const tEtapa3 = performance.now();
      try {
        const catClassificada = await catalogJevService.classificarCategoriaLoja(
          { nome: sugestao.nome, descricao: sugestao.descricao },
          categorias
        );
        if (catClassificada) {
          categoriaMatchId = catClassificada.id;
        } else if (sugestao.categoria_sugerida) {
          const achouCat = categorias.find(c =>
            c.nome.toLowerCase().includes(sugestao.categoria_sugerida!.toLowerCase())
          );
          if (achouCat) categoriaMatchId = achouCat.id;
        }
      } catch {
        if (sugestao.categoria_sugerida) {
          const achouCat = categorias.find(c =>
            c.nome.toLowerCase().includes(sugestao.categoria_sugerida!.toLowerCase())
          );
          if (achouCat) categoriaMatchId = achouCat.id;
        }
      }
      console.log(`[IA-Produto] Etapa 3: Jev TypeSafe em ${Math.round(performance.now() - tEtapa3)}ms`);
    }

    let atacadoSugerido: string | undefined = undefined;
    let autoSugerido: string | undefined = undefined;
    let precoVendaFmt: string | undefined = undefined;
    if (sugestao.preco_venda_estimado) {
      const num = Number(sugestao.preco_venda_estimado);
      if (!isNaN(num) && num > 0) {
        precoVendaFmt = num.toFixed(2).replace('.', ',');
        // Auto-calcular atacado e auto-atacado sugeridos com margens inteligentes se não preenchidos
        atacadoSugerido = (num * 0.90).toFixed(2).replace('.', ',');
        autoSugerido = (num * 0.82).toFixed(2).replace('.', ',');
      }
    }

    setFormData(prev => ({
      ...prev,
      nome: (sugestao as any).nome_identificado || sugestao.nome || prev.nome,
      categoriaId: categoriaMatchId,
      precoVenda: precoVendaFmt || prev.precoVenda,
      precoAtacado: prev.precoAtacado || atacadoSugerido || '',
      precoAutoatacado: prev.precoAutoatacado || autoSugerido || '',
      descricao: (sugestao as any).descricao_completa || sugestao.descricao || prev.descricao,
      codigoBarras: sugestao.codigo_barras || prev.codigoBarras,
      tipoUnidade: (sugestao.tipo_unidade as TipoUnidade) || prev.tipoUnidade,
      fotos: (fotoUrl || sugestao.foto_url) ? [(fotoUrl || sugestao.foto_url)!, ...prev.fotos.filter((f: string) => f !== (fotoUrl || sugestao.foto_url))].slice(0, 7) : prev.fotos,
      pesoKg: sugestao.peso_kg ? String(sugestao.peso_kg) : prev.pesoKg,
      alturaCm: sugestao.altura_cm ? String(sugestao.altura_cm) : prev.alturaCm,
      larguraCm: sugestao.largura_cm ? String(sugestao.largura_cm) : prev.larguraCm,
      comprimentoCm: sugestao.comprimento_cm ? String(sugestao.comprimento_cm) : prev.comprimentoCm
    }));
  };

  // PREENCHIMENTO AUTOMÁTICO VIA IA (FOTO, TEXTO, CÓDIGO DE BARRAS)
  // =========================================================================
  const processarPreenchimentoIA = async (
    tipo: 'foto' | 'texto' | 'codigo',
    valor?: string,
    fotoGaleriaUrl?: string,
    payloadBase64IA?: PayloadBase64IA | null
  ) => {
    try {
      setProcessandoIA(true);
      let sugestao: any = null;

      if (tipo === 'foto' && valor) {
        const payloadPronto =
          payloadBase64IA ||
          obterPayloadVisaoIAParaUrl(valor) ||
          obterPayloadVisaoIAParaUrl(fotoGaleriaUrl);
        sugestao = await identificarProdutoPorFoto(valor, segmentoLoja, loja, payloadPronto);
      } else if (tipo === 'texto') {
        const textoAlvo = (valor || promptTextoIA).trim();
        if (textoAlvo) {
          sugestao = await identificarProdutoPorTextoOuEan('texto', textoAlvo, segmentoLoja, loja);
        }
      } else if (tipo === 'codigo' && (valor || promptCodigoIA.trim())) {
        const cod = valor || promptCodigoIA.trim();
        sugestao = await identificarProdutoPorTextoOuEan('barcode', cod, segmentoLoja, loja);
      }

      if (sugestao) {
        const fotoReferenciaFinal = fotoGaleriaUrl || valor;
        if (tipo === 'foto' && sugestao.duvida && sugestao.opcoes_sugeridas && sugestao.opcoes_sugeridas.length > 1) {
          setOpcoesDuvidaIA(sugestao.opcoes_sugeridas);
          setFotoTemporariaDuvida(fotoReferenciaFinal || null);
          setModalDuvidaAberto(true);
          setModalCriarComIAAberto(false);
          return;
        }

        await aplicarSugestaoMobile(sugestao, tipo === 'foto' && fotoReferenciaFinal ? fotoReferenciaFinal : undefined);
        setModalCriarComIAAberto(false);
        setMensagemFeedback({ texto: 'Dados e descrição preenchidos com sucesso pela IA!', tipo: 'sucesso' });

        if (tipo === 'foto' && !produtoEditando?.id) {
          const nomeIdentificado = (sugestao as any).nome_identificado || sugestao.nome || '';
          const resDup = buscarProdutoDuplicado(produtos, {
            nome: nomeIdentificado,
            codigoBarras: sugestao.codigo_barras
          });
          if (resDup.encontrado && resDup.produto && resDup.motivo) {
            setDuplicadoModal({
              produto: resDup.produto,
              motivo: resDup.motivo,
              origem: 'ia',
              fotoCapturada: fotoReferenciaFinal
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('Erro ao processar IA:', err);
      setMensagemFeedback({ texto: err?.message || 'Não foi possível identificar todos os dados. Preencha manualmente.', tipo: 'erro' });
    } finally {
      setProcessandoIA(false);
    }
  };

  // Reaproveita foto ou nome já presentes no formulário antes de abrir modal de captura
  const handleBotaoPreencherComIA = async () => {
    const fotoExistente = formData.fotos[0];
    if (fotoExistente) {
      const payloadPronto = obterPayloadVisaoIAParaUrl(fotoExistente);
      await processarPreenchimentoIA('foto', fotoExistente, fotoExistente, payloadPronto);
      return;
    }

    if (formData.nome.trim()) {
      await processarPreenchimentoIA('texto', formData.nome.trim());
      return;
    }

    setModalCriarComIAAberto(true);
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
  // PROCESSAMENTO DE FOTO CAPTURADA / GALERIA (ANTI-OOM)
  // =========================================================================
  const handleFotoCapturadaMobile = async (resultado: CompressResult) => {
    const modoAtual = modoCameraCapturaRef.current;
    registrarPreviewUrl(resultado.previewUrl);

    try {
      audioService.playBeep();
      const payloadVisaoIA = await gerarPayloadBase64IA(resultado.blob);
      const urlFinal = await ProdutoService.uploadFotoDataUrl(resultado.dataUrl, loja?.id);
      registrarPayloadVisaoIA(urlFinal, payloadVisaoIA, resultado.dataUrl);

      setFormData(prev => ({
        ...prev,
        fotos: [urlFinal, ...prev.fotos.filter(f => f !== urlFinal)].slice(0, 7)
      }));

      if (modoAtual === 'ia') {
        await processarPreenchimentoIA('foto', urlFinal, urlFinal, payloadVisaoIA);
      } else {
        setMensagemFeedback({ texto: 'Foto capturada e salva com sucesso!', tipo: 'sucesso' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao processar foto capturada.';
      console.error('Erro ao capturar foto:', e);
      setMensagemFeedback({ texto: msg, tipo: 'erro' });
    } finally {
      revogarPreviewUrl(resultado.previewUrl);
    }
  };

  // Upload / Seleção de Foto da Galeria com Compressão Nativa + Supabase Storage (bucket produtos)
  const handleProcessarArquivoFoto = async (file?: File) => {
    if (!file) return;
    let previewGerada: string | undefined;
    try {
      const resultado = await comprimirFotoProduto(file, { maxDimension: 1024, quality: 0.78 });
      previewGerada = resultado.previewUrl;
      registrarPreviewUrl(previewGerada);
      const payloadVisaoIA = await gerarPayloadBase64IA(resultado.blob);

      if (resultado.dataUrl) {
        const urlFinal = await ProdutoService.uploadFotoDataUrl(resultado.dataUrl, loja?.id);
        registrarPayloadVisaoIA(urlFinal, payloadVisaoIA, resultado.dataUrl);
        setFormData(prev => ({
          ...prev,
          fotos: [urlFinal, ...prev.fotos.filter(f => f !== urlFinal)].slice(0, 7)
        }));
        setModalOpcoesFotoAberto(false);
        setMensagemFeedback({ texto: 'Foto adicionada e salva com sucesso!', tipo: 'sucesso' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível carregar e comprimir a foto.';
      console.error('Erro ao processar arquivo de foto:', e);
      setMensagemFeedback({ texto: msg, tipo: 'erro' });
    } finally {
      revogarPreviewUrl(previewGerada);
    }
  };

  // Pilha unificada de Overlays Mobile (LIFO: pais registrados antes de filhos)
  useRegisterOverlay(telaAtiva === 'filtros', () => setTelaAtiva('lista'), 'produtos-filtros-mobile');
  useRegisterOverlay(telaAtiva === 'novo' || telaAtiva === 'detalhes', fecharFormularioComConfirmacao, 'produtos-form-mobile');
  useRegisterOverlay(telaAtiva === 'movimentacoes', () => setTelaAtiva('detalhes'), 'produtos-movimentacoes-mobile');
  useRegisterOverlay(telaAtiva === 'variacoes', () => setTelaAtiva(produtoEditando ? 'detalhes' : 'novo'), 'produtos-variacoes-mobile');
  useRegisterOverlay(modalCategoriasAberto, () => setModalCategoriasAberto(false), 'modal-categorias-mobile');
  useRegisterOverlay(modalSubcategoriasAberto, () => setModalSubcategoriasAberto(false), 'modal-subcategorias-mobile');
  useRegisterOverlay(modalDescricaoAberto, () => setModalDescricaoAberto(false), 'modal-descricao-mobile');
  useRegisterOverlay(modalGaleriaFotosAberto, () => setModalGaleriaFotosAberto(false), 'modal-galeria-mobile');
  useRegisterOverlay(modalEstoqueMinimoAberto, () => setModalEstoqueMinimoAberto(false), 'modal-estoque-minimo-mobile');
  useRegisterOverlay(modalPublicCardAberto, () => setModalPublicCardAberto(false), 'modal-public-card-mobile');
  useRegisterOverlay(modalCorEtiquetaAberto, () => setModalCorEtiquetaAberto(false), 'modal-cor-etiqueta-mobile');
  useRegisterOverlay(modalClonarAberto, () => setModalClonarAberto(false), 'modal-clonar-mobile');
  useRegisterOverlay(modalUnidadeMedidaAberto, () => setModalUnidadeMedidaAberto(false), 'modal-unidade-medida-mobile');
  useRegisterOverlay(modalRadarAberto, () => setModalRadarAberto(false), 'modal-radar-mobile');
  useRegisterOverlay(modalOpcoesFotoAberto, () => setModalOpcoesFotoAberto(false), 'modal-opcoes-foto-mobile');
  useRegisterOverlay(modalCriarComIAAberto, () => setModalCriarComIAAberto(false), 'modal-criar-ia-mobile');
  useRegisterOverlay(modalFotosInternetAberto, () => setModalFotosInternetAberto(false), 'modal-fotos-internet-mobile', 'modal');
  useRegisterOverlay(modalOnboardingSerpApiAberto, () => setModalOnboardingSerpApiAberto(false), 'modal-onboarding-serpapi-mobile', 'modal');
  useRegisterOverlay(modalDuvidaAberto, () => setModalDuvidaAberto(false), 'modal-duvida-ia-mobile', 'modal');
  useRegisterOverlay(modalScannerAberto, encerrarScannerCamera, 'modal-scanner-mobile');
  useRegisterOverlay(Boolean(modalFotoFullscreen), () => setModalFotoFullscreen(null), 'modal-foto-fullscreen-mobile');
  useRegisterOverlay(modalCatalogoAberto, () => setModalCatalogoAberto(false), 'modal-catalogo-mobile');

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
              className="hubi-btn-cta px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md cursor-pointer"
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
      <div
        className="fixed inset-0 z-40 flex flex-col select-none"
        style={{ backgroundColor: temaCores.bgExterno, color: temaCores.textoPrincipal }}
      >
        {/* Header TELA006 */}
        <div
          className="h-16 border-b px-4 flex items-center justify-between shrink-0"
          style={{ backgroundColor: temaCores.bgHeaderForm, borderColor: temaCores.bordaHeaderForm }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTelaAtiva('lista')}
              className={`hubi-btn-close-x p-1.5 rounded-xl border transition cursor-pointer ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg" style={{ color: temaCores.textoPrincipal }}>
              Filtros
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setFiltroSemEstoque(false);
              setFiltroMinimo(false);
              setFiltroAcimaMinimo(false);
              setFiltroSemControle(false);
              setCategoriasFiltro([]);
              setFiltroAtivo('todos');
              setFiltroMl('todos');
              setFiltroTipoItem('todos');
              setOrdenacaoEstoque('menor_estoque');
            }}
            className="text-xs sm:text-sm font-extrabold px-2 py-1 cursor-pointer"
            style={{ color: isDark ? '#34D399' : '#059669' }}
          >
            Limpar
          </button>
        </div>

        {/* Conteúdo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Seção Estoque */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Estoque</h2>
            <div className="space-y-2.5">
              {[
                {
                  id: 'sem_estoque',
                  label: 'Sem estoque',
                  badge: '🔴',
                  checked: filtroSemEstoque,
                  toggle: () => setFiltroSemEstoque(!filtroSemEstoque)
                },
                {
                  id: 'minimo',
                  label: 'Mínimo',
                  badge: '🟡',
                  checked: filtroMinimo,
                  toggle: () => setFiltroMinimo(!filtroMinimo)
                },
                {
                  id: 'acima_minimo',
                  label: 'Acima do mínimo',
                  checked: filtroAcimaMinimo,
                  toggle: () => setFiltroAcimaMinimo(!filtroAcimaMinimo)
                },
                {
                  id: 'sem_controle',
                  label: 'Sem controle de estoque',
                  checked: filtroSemControle,
                  toggle: () => setFiltroSemControle(!filtroSemControle)
                }
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={item.toggle}
                  className="flex items-center justify-between p-3 transition cursor-pointer select-none rounded-xl border"
                  style={
                    item.checked
                      ? {
                          backgroundColor: isDark ? '#000000' : '#ECFDF5',
                          borderColor: isDark ? '#10B981' : '#059669',
                          color: isDark ? '#34D399' : '#047857',
                          fontWeight: 700
                        }
                      : {
                          backgroundColor: temaCores.bgPilulaDesmarcada,
                          borderColor: temaCores.bordaPilulaDesmarcada,
                          color: temaCores.textoPilulaDesmarcada
                        }
                  }
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        item.checked
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                          : ''
                      }`}
                      style={item.checked ? undefined : { borderColor: temaCores.bordaPilulaDesmarcada, backgroundColor: temaCores.bgPilulaDesmarcada }}
                    >
                      {item.checked && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </div>
                    <span className="text-xs sm:text-sm">{item.label}</span>
                  </div>
                  {item.badge && <span className="text-xs">{item.badge}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Seção Status do Produto */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider" style={{ color: temaCores.textoSecundario }}>
              Status do Produto
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'ativos', label: 'Ativos' },
                { id: 'inativos', label: 'Inativos' }
              ].map((opt) => {
                const ativo = filtroAtivo === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFiltroAtivo(opt.id as any)}
                    className="py-3 px-2 transition flex flex-col items-center justify-center gap-2 cursor-pointer rounded-xl border"
                    style={
                      ativo
                        ? {
                            backgroundColor: isDark ? '#000000' : '#ECFDF5',
                            borderColor: isDark ? '#10B981' : '#059669',
                            color: isDark ? '#34D399' : '#047857',
                            fontWeight: 700
                          }
                        : {
                            backgroundColor: temaCores.bgPilulaDesmarcada,
                            borderColor: temaCores.bordaPilulaDesmarcada,
                            color: temaCores.textoPilulaDesmarcada
                          }
                    }
                  >
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition shrink-0 ${
                        ativo ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs' : ''
                      }`}
                      style={ativo ? undefined : { borderColor: temaCores.bordaPilulaDesmarcada, backgroundColor: temaCores.bgPilulaDesmarcada }}
                    >
                      {ativo && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </div>
                    <span className="text-xs font-bold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seção Categorias */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider" style={{ color: temaCores.textoSecundario }}>
              Categorias
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {categoriasPrincipaisFiltro.map((cat) => {
                const checked = cat.todosIds.some(id => categoriasFiltro.includes(id));
                return (
                  <div
                    key={cat.id}
                    onClick={() => {
                      if (checked) {
                        setCategoriasFiltro(prev => prev.filter(id => !cat.todosIds.includes(id)));
                      } else {
                        setCategoriasFiltro(prev => [...prev.filter(id => !cat.todosIds.includes(id)), cat.id]);
                      }
                    }}
                    className="flex items-center gap-2.5 p-2.5 transition cursor-pointer select-none rounded-xl border"
                    style={
                      checked
                        ? {
                            backgroundColor: isDark ? '#000000' : '#ECFDF5',
                            borderColor: isDark ? '#10B981' : '#059669',
                            color: isDark ? '#34D399' : '#047857',
                            fontWeight: 700
                          }
                        : {
                            backgroundColor: temaCores.bgPilulaDesmarcada,
                            borderColor: temaCores.bordaPilulaDesmarcada,
                            color: temaCores.textoPilulaDesmarcada
                          }
                    }
                  >
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        checked ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs' : ''
                      }`}
                      style={checked ? undefined : { borderColor: temaCores.bordaPilulaDesmarcada, backgroundColor: temaCores.bgPilulaDesmarcada }}
                    >
                      {checked && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </div>
                    <span className="text-xs font-semibold uppercase truncate">
                      {cat.icone ? `${cat.icone} ` : ''}{cat.nome} ({cat.qtdProdutos})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seção Tipo de Item (Produtos / Serviços) */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider" style={{ color: temaCores.textoSecundario }}>
              Tipo de Item
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'produto', label: 'Produtos' },
                { id: 'servico', label: 'Serviços' }
              ].map((opt) => {
                const ativo = filtroTipoItem === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFiltroTipoItem(opt.id as any)}
                    className="py-2.5 px-2 transition flex items-center justify-center gap-1.5 cursor-pointer rounded-xl border text-xs font-bold"
                    style={
                      ativo
                        ? {
                            backgroundColor: isDark ? '#000000' : '#ECFDF5',
                            borderColor: isDark ? '#10B981' : '#059669',
                            color: isDark ? '#34D399' : '#047857'
                          }
                        : {
                            backgroundColor: temaCores.bgPilulaDesmarcada,
                            borderColor: temaCores.bordaPilulaDesmarcada,
                            color: temaCores.textoPilulaDesmarcada
                          }
                    }
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seção Mercado Livre */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider" style={{ color: temaCores.textoSecundario }}>
              Mercado Livre
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'publicados', label: 'Publicados' },
                { id: 'nao_publicados', label: 'Sem vínculo' }
              ].map((opt) => {
                const ativo = filtroMl === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFiltroMl(opt.id as any)}
                    className="py-2.5 px-2 transition flex items-center justify-center gap-1.5 cursor-pointer rounded-xl border text-xs font-bold"
                    style={
                      ativo
                        ? {
                            backgroundColor: isDark ? '#000000' : '#ECFDF5',
                            borderColor: isDark ? '#10B981' : '#059669',
                            color: isDark ? '#34D399' : '#047857'
                          }
                        : {
                            backgroundColor: temaCores.bgPilulaDesmarcada,
                            borderColor: temaCores.bordaPilulaDesmarcada,
                            color: temaCores.textoPilulaDesmarcada
                          }
                    }
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seção Ordenar Por */}
          <div className="space-y-3">
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider" style={{ color: temaCores.textoSecundario }}>
              Ordenar por
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'menor_estoque', label: 'Menor estoque' },
                { id: 'a_z', label: 'A-Z' },
                { id: 'maior_estoque', label: 'Maior estoque' },
                { id: 'z_a', label: 'Z-A' }
              ].map((ord) => {
                const ativa = ordenacaoEstoque === ord.id;
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => setOrdenacaoEstoque(ord.id as any)}
                    className="p-3 transition flex items-center gap-2.5 cursor-pointer text-left rounded-xl border"
                    style={
                      ativa
                        ? {
                            backgroundColor: isDark ? '#000000' : '#ECFDF5',
                            borderColor: isDark ? '#10B981' : '#059669',
                            color: isDark ? '#34D399' : '#047857',
                            fontWeight: 700
                          }
                        : {
                            backgroundColor: temaCores.bgPilulaDesmarcada,
                            borderColor: temaCores.bordaPilulaDesmarcada,
                            color: temaCores.textoPilulaDesmarcada
                          }
                    }
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                        ativa ? 'border-emerald-500' : ''
                      }`}
                      style={ativa ? undefined : { borderColor: temaCores.bordaPilulaDesmarcada, backgroundColor: temaCores.bgPilulaDesmarcada }}
                    >
                      {ativa && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                    </div>
                    <span className="text-xs font-bold truncate">{ord.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Botão Filtrar TELA006 */}
        <div
          className="p-4 border-t shrink-0 bg-white dark:bg-[#0B0F17] border-slate-200 dark:border-[#1E293B]"
        >
          <button
            type="button"
            onClick={() => setTelaAtiva('lista')}
            className="hubi-btn-cta w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm sm:text-base cursor-pointer"
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
    const movsFiltradas = movimentacoesLista.filter((mov) => {
      if (filtroMovTipo === 'todos') return true;
      const tipoStr = String(mov.tipo_movimentacao || '').toLowerCase();
      const ehEntrada = tipoStr.includes('entrada') || tipoStr.includes('estorno') || tipoStr.includes('credito');
      return filtroMovTipo === 'entrada' ? ehEntrada : !ehEntrada;
    });

    return (
      <div className="fixed inset-0 z-40 bg-slate-100 dark:bg-[#0B0F17] flex flex-col text-slate-900 dark:text-white select-none">
        {/* Header TELA011 */}
        <div className="h-16 border-b border-slate-200 dark:border-[#1E293B] px-4 flex items-center justify-between bg-white dark:bg-[#0B0F17] shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('detalhes')}
            className="p-2 text-black dark:text-slate-300 hover:opacity-75 cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-sm sm:text-base text-black dark:text-slate-100">Movimentações</h1>
          <button
            type="button"
            onClick={() =>
              setFiltroMovTipo((prev) =>
                prev === 'todos' ? 'entrada' : prev === 'entrada' ? 'saida' : 'todos'
              )
            }
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition ${
              filtroMovTipo !== 'todos'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-100 dark:bg-slate-900 text-black dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
            title="Alternar filtro (Todos / Entradas / Saídas)"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{filtroMovTipo === 'todos' ? 'Todas' : filtroMovTipo === 'entrada' ? 'Entradas' : 'Saídas'}</span>
          </button>
        </div>

        {/* Banner do Produto TELA011 */}
        <div className="p-4 border-b border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#000000] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] overflow-hidden flex items-center justify-center">
              {formData.fotos[0] ? (
                <img src={formData.fotos[0]} alt="Thumb" className="w-full h-full object-cover" />
              ) : (
                <Tag className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <span className="font-extrabold text-xs sm:text-sm text-black dark:text-slate-100 uppercase max-w-[200px] line-clamp-2">
              {formData.nome || 'PRODUTO'}
            </span>
          </div>
          <span className={`font-black text-base sm:text-lg ${formData.quantidadeEstoque < 0 ? 'text-red-600 dark:text-rose-400' : 'text-black dark:text-slate-100'}`}>
            {formData.quantidadeEstoque}
          </span>
        </div>

        {/* Lista de Movimentações Reais (movimentacoes_estoque) */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-[#1E293B]">
          {carregandoMovimentacoes ? (
            <div className="p-8 text-center text-xs text-slate-700 dark:text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="font-bold">Carregando histórico real de estoque...</span>
            </div>
          ) : movsFiltradas.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-800 dark:text-slate-400 space-y-2">
              <Package className="w-9 h-9 mx-auto text-slate-500" />
              <p className="font-bold text-sm text-black dark:text-white">Nenhuma movimentação registrada</p>
              <p>As vendas, entradas de compra e estornos deste item aparecerão aqui em tempo real.</p>
            </div>
          ) : (
            movsFiltradas.map((mov) => {
              const tipoStr = String(mov.tipo_movimentacao || '').toLowerCase();
              const ehEntrada = tipoStr.includes('entrada') || tipoStr.includes('estorno') || tipoStr.includes('credito');
              const dataFmt = mov.criado_em ? formatarDataHoraLocal(mov.criado_em, { dateStyle: 'short', timeStyle: 'short' }) : '';
              const rotuloTipo = tipoStr.replace(/_/g, ' ');
              return (
                <div key={mov.id} className="p-4 flex items-center justify-between bg-white dark:bg-[#000000]">
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className={`p-2 rounded-full shrink-0 ${ehEntrada ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'text-red-700 dark:text-rose-400 bg-red-50 dark:bg-rose-950/40'}`}>
                      {ehEntrada ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-xs sm:text-sm text-black dark:text-slate-100 capitalize truncate">
                        {rotuloTipo}: {Number(mov.quantidade || 0)}
                      </h3>
                      <p className="text-xs text-slate-700 dark:text-slate-400 mt-0.5 truncate">
                        {dataFmt}{mov.motivo ? ` • ${mov.motivo}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-slate-700 dark:text-slate-400 uppercase font-bold">Saldo</p>
                    <p className={`font-black text-sm sm:text-base ${Number(mov.saldo_posterior || 0) < 0 ? 'text-red-600 dark:text-rose-400' : 'text-black dark:text-slate-100'}`}>
                      {Number(mov.saldo_posterior ?? 0)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 020: PRODUTOS COM VARIAÇÕES
  // -------------------------------------------------------------------------
  if (telaAtiva === 'variacoes') {
    return (
      <div className="fixed inset-0 z-40 bg-slate-100 dark:bg-[#0B0F17] flex flex-col text-slate-900 dark:text-white select-none">
        {/* Header TELA020 */}
        <div className="h-16 border-b border-slate-200 dark:border-[#1E293B] px-4 flex items-center justify-between bg-white dark:bg-[#0B0F17] shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva(produtoEditando ? 'detalhes' : 'novo')}
            className="p-2 text-black dark:text-slate-300 hover:opacity-75 cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-sm sm:text-base text-black dark:text-slate-100">Variações do Produto</h1>
          <button
            type="button"
            onClick={() => setMensagemFeedback({ texto: 'Cadastre atributos combinados (ex: Cor e Tamanho) com estoque, SKU, EAN e preços individuais.', tipo: 'sucesso' })}
            className="p-2 text-slate-700 dark:text-slate-400 hover:text-black dark:hover:text-slate-200 cursor-pointer"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Ilustração e Conteúdo TELA020 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center space-y-1">
            <h2 className="font-extrabold text-sm sm:text-base text-black dark:text-slate-100">Grade de Variações</h2>
            <p className="text-xs text-slate-700 dark:text-slate-400">
              Configure tamanhos, cores ou sabores com preços e estoques específicos
            </p>
          </div>

          <div className="space-y-3">
            {formData.variacoes.map((v, idx) => (
              <div
                key={v.id || idx}
                className="p-3.5 rounded-2xl border bg-white dark:bg-[#000000] border-slate-200 dark:border-[#1E293B] space-y-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={v.valor_variacao_1 || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], valor_variacao_1: val };
                          return { ...prev, variacoes: list };
                        });
                      }}
                      placeholder={`1º Atributo (${rotuloVariacao1 || 'Opção'})`}
                      className="px-2.5 py-1.5 rounded-lg border text-xs font-bold bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                    <input
                      type="text"
                      value={v.valor_variacao_2 || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], valor_variacao_2: val };
                          return { ...prev, variacoes: list };
                        });
                      }}
                      placeholder={`2º Atributo (Opcional)`}
                      className="px-2.5 py-1.5 rounded-lg border text-xs font-bold bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        variacoes: prev.variacoes.filter((_, i) => i !== idx)
                      }));
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-800 dark:text-slate-400 uppercase block mb-0.5">Estoque</label>
                    <input
                      type="number"
                      min="0"
                      value={v.quantidade_estoque ?? 0}
                      onChange={(e) => {
                        const q = parseFloat(e.target.value) || 0;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], quantidade_estoque: q };
                          const somaEstoque = list.reduce((acc, item) => acc + (Number(item.quantidade_estoque) || 0), 0);
                          return { ...prev, variacoes: list, quantidadeEstoque: somaEstoque };
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-center text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-800 dark:text-slate-400 uppercase block mb-0.5">Preço Varejo (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={v.preco_venda_varejo ?? ''}
                      onChange={(e) => {
                        const p = parseFloat(e.target.value) || 0;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], preco_venda_varejo: p };
                          return { ...prev, variacoes: list };
                        });
                      }}
                      placeholder={formData.precoVenda || '0,00'}
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-black dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-800 dark:text-slate-400 uppercase block mb-0.5">SKU</label>
                    <input
                      type="text"
                      value={v.sku || ''}
                      onChange={(e) => {
                        const skuVal = e.target.value;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], sku: skuVal };
                          return { ...prev, variacoes: list };
                        });
                      }}
                      placeholder="SKU da variação"
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-black dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-800 dark:text-slate-400 uppercase block mb-0.5">EAN / Barras</label>
                    <input
                      type="text"
                      value={v.codigo_barras || ''}
                      onChange={(e) => {
                        const eanVal = e.target.value;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], codigo_barras: eanVal };
                          return { ...prev, variacoes: list };
                        });
                      }}
                      placeholder="Código de barras"
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-black dark:text-white"
                    />
                  </div>
                  {permissions.podeVerPrecoCusto && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-800 dark:text-slate-400 uppercase block mb-0.5">Custo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={v.preco_custo ?? ''}
                        onChange={(e) => {
                          const c = e.target.value ? parseFloat(e.target.value) : null;
                          setFormData(prev => {
                            const list = [...prev.variacoes];
                            list[idx] = { ...list[idx], preco_custo: c };
                            return { ...prev, variacoes: list };
                          });
                        }}
                        placeholder="0,00"
                        className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-black dark:text-white"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-800 dark:text-slate-400 uppercase block mb-0.5">Atacado (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={v.preco_venda_atacado ?? ''}
                      onChange={(e) => {
                        const pa = e.target.value ? parseFloat(e.target.value) : null;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], preco_venda_atacado: pa };
                          return { ...prev, variacoes: list };
                        });
                      }}
                      placeholder="Opcional"
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-black dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-800 dark:text-slate-400 uppercase block mb-0.5">Distribuidor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={v.preco_venda_autoatacado ?? ''}
                      onChange={(e) => {
                        const pd = e.target.value ? parseFloat(e.target.value) : null;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], preco_venda_autoatacado: pd };
                          return { ...prev, variacoes: list };
                        });
                      }}
                      placeholder="Opcional"
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-black dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-800 dark:text-slate-400 uppercase block mb-0.5">Promoção (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={v.preco_promocional ?? ''}
                      onChange={(e) => {
                        const pp = e.target.value ? parseFloat(e.target.value) : null;
                        setFormData(prev => {
                          const list = [...prev.variacoes];
                          list[idx] = { ...list[idx], preco_promocional: pp };
                          return { ...prev, variacoes: list };
                        });
                      }}
                      placeholder="Opcional"
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-black dark:text-white"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                const nova: Partial<VariacaoProduto> = {
                  id: Date.now().toString(),
                  valor_variacao_1: '',
                  valor_variacao_2: '',
                  combinacao_nome: '',
                  quantidade_estoque: 0,
                  preco_venda_varejo: parseFloat(formData.precoVenda.replace(',', '.')) || 0,
                  codigo_barras: '',
                  sku: ''
                };
                setFormData(prev => ({
                  ...prev,
                  temVariacoes: true,
                  variacoes: [...prev.variacoes, nova]
                }));
              }}
              className="w-full p-3.5 rounded-2xl border-2 border-dashed border-emerald-500/60 text-emerald-600 dark:text-emerald-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-emerald-500/10 transition cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>Adicionar Variação</span>
            </button>
          </div>
        </div>

        {/* Botão Concluir / Voltar TELA020 */}
        <div className="p-4 border-t border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#0B0F17] shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva(produtoEditando ? 'detalhes' : 'novo')}
            className="hubi-btn-cta w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base transition cursor-pointer shadow-md"
          >
            Concluir Variações
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 016: SELETOR DE CATEGORIAS
  // -------------------------------------------------------------------------
  if (modalCategoriasAberto) {
    const categoriasPrincipais = obterArvoreCategorias(categorias, loja?.id);
    const categoriasFiltradasModal = categoriasPrincipais.filter(c =>
      c.nome.toLowerCase().includes(buscaCategoria.toLowerCase().trim())
    );

    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-[#0B0F17] flex flex-col text-slate-900 dark:text-white select-none">
        {/* Header TELA016 */}
        <div className="h-16 border-b border-slate-200 dark:border-[#1E293B] px-4 flex items-center justify-between bg-white dark:bg-[#0B0F17] shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalCategoriasAberto(false)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100">
              Categorias ({categorias.length})
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setModalGerenciarCategoriasMobileAberto(true)}
            className="p-2 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-extrabold cursor-pointer"
            title="Gerenciar Categorias e Subcategorias"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* Campo de Busca TELA016 com Pesquisa por Voz */}
        <div className="p-3 border-b border-slate-100 dark:border-[#1E293B] bg-white dark:bg-[#0B0F17] shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input
              type="text"
              value={buscaCategoria}
              onChange={(e) => setBuscaCategoria(e.target.value)}
              placeholder="Buscar categoria ou falar..."
              className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-[#000000] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-medium"
            />
            <button
              type="button"
              onClick={() => alternarPesquisaPorVoz(setBuscaCategoria)}
              className={`absolute right-2.5 p-1.5 rounded-lg transition ${
                ouvindoVoz ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
              title="Pesquisar por voz"
            >
              {ouvindoVoz ? <Mic className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Lista de Categorias TELA016 */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1E293B] p-2 space-y-1">
          <button
            type="button"
            onClick={() => {
              setFormData(prev => ({ ...prev, categoriaId: '', subcategoriaId: '' }));
              setModalCategoriasAberto(false);
            }}
            className="w-full px-4 py-3.5 text-left text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-xl hover:bg-slate-50 dark:hover:bg-[#0D111A] transition flex items-center justify-between cursor-pointer"
          >
            <span>Sem Categoria</span>
            {!formData.categoriaId && <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          </button>

          {categoriasFiltradasModal.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                const subcategoriasDaNova = obterSubcategoriasDe(categorias, cat.id, loja?.id);
                setFormData(prev => ({
                  ...prev,
                  categoriaId: cat.id,
                  subcategoriaId: subcategoriasDaNova.some(s => s.id === prev.subcategoriaId) ? prev.subcategoriaId : ''
                }));
                setModalCategoriasAberto(false);
              }}
              className="w-full px-4 py-3.5 text-left text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-xl hover:bg-slate-50 dark:hover:bg-[#0D111A] transition flex items-center justify-between cursor-pointer"
            >
              <span>{cat.nome}</span>
              {formData.categoriaId === cat.id && <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
            </button>
          ))}
        </div>

        <ModalGerenciarCategorias
          isOpen={modalGerenciarCategoriasMobileAberto}
          onClose={() => setModalGerenciarCategoriasMobileAberto(false)}
          categorias={categorias}
          produtos={produtos}
          onCategoriasAtualizadas={onRecarregar}
          onCategoriaCriada={(novaCat) => {
            setFormData(prev => ({ ...prev, categoriaId: novaCat.id, subcategoriaId: '' }));
            setModalGerenciarCategoriasMobileAberto(false);
            setModalCategoriasAberto(false);
          }}
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // SELETOR DE SUBCATEGORIAS (PADRONIZADO COM CATEGORIAS)
  // -------------------------------------------------------------------------
  if (modalSubcategoriasAberto) {
    const subcategoriasDisponiveis = obterSubcategoriasDe(categorias, formData.categoriaId, loja?.id);
    const subcategoriasFiltradas = subcategoriasDisponiveis.filter(s =>
      s.nome.toLowerCase().includes(buscaSubcategoria.toLowerCase().trim())
    );

    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-[#0B0F17] flex flex-col text-slate-900 dark:text-white select-none">
        {/* Header */}
        <div className="h-16 border-b border-slate-200 dark:border-[#1E293B] px-4 flex items-center justify-between bg-white dark:bg-[#0B0F17] shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setBuscaSubcategoria('');
                setModalSubcategoriasAberto(false);
              }}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100">
              Subcategorias ({subcategoriasDisponiveis.length})
            </h1>
          </div>
        </div>

        {/* Campo de Busca */}
        <div className="p-3 border-b border-slate-100 dark:border-[#1E293B] bg-white dark:bg-[#0B0F17] shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input
              type="text"
              value={buscaSubcategoria}
              onChange={(e) => setBuscaSubcategoria(e.target.value)}
              placeholder="Buscar subcategoria ou falar..."
              className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-[#000000] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-medium"
            />
            <button
              type="button"
              onClick={() => alternarPesquisaPorVoz(setBuscaSubcategoria)}
              className={`absolute right-2.5 p-1.5 rounded-lg transition ${
                ouvindoVoz ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
              title="Pesquisar por voz"
            >
              {ouvindoVoz ? <Mic className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Lista de Subcategorias */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1E293B] p-2 space-y-1">
          <button
            type="button"
            onClick={() => {
              setFormData(prev => ({ ...prev, subcategoriaId: '' }));
              setBuscaSubcategoria('');
              setModalSubcategoriasAberto(false);
            }}
            className="w-full px-4 py-3.5 text-left text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition flex items-center justify-between cursor-pointer"
          >
            <span>Sem Subcategoria</span>
            {!formData.subcategoriaId && <Check className="w-5 h-5 text-emerald-500" />}
          </button>

          {subcategoriasFiltradas.map((sub) => {
            const selecionada = formData.subcategoriaId === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  setFormData(prev => ({ ...prev, subcategoriaId: sub.id }));
                  setBuscaSubcategoria('');
                  setModalSubcategoriasAberto(false);
                }}
                className="w-full px-4 py-3.5 text-left text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition flex items-center justify-between cursor-pointer"
              >
                <span>{sub.nome}</span>
                {selecionada && <Check className="w-5 h-5 text-emerald-500" />}
              </button>
            );
          })}

          {subcategoriasFiltradas.length === 0 && buscaSubcategoria && (
            <div className="p-6 text-center text-xs text-slate-400 font-medium">
              Nenhuma subcategoria encontrada para "{buscaSubcategoria}".
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // TELA 017: EDITOR DE DESCRIÇÃO COM IA EXCLUSIVA
  // -------------------------------------------------------------------------
  if (modalDescricaoAberto) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-[#0B0F17] flex flex-col text-slate-900 dark:text-white select-none">
        {/* Header TELA017 */}
        <div className="h-16 border-b border-slate-200 dark:border-[#1E293B] px-4 flex items-center justify-between bg-white dark:bg-[#0B0F17] shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalDescricaoAberto(false)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100">Descrição Comercial</h1>
          </div>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, descricao: '' }))}
            className="text-xs sm:text-sm font-extrabold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 px-2 py-1 cursor-pointer"
          >
            Limpar
          </button>
        </div>

        {/* Conteúdo TELA017 */}
        <div className="flex-1 p-4 flex flex-col justify-between overflow-y-auto space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Texto da Descrição
              </label>
              {redigindoDescricaoIA && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Redigindo descrição com IA...</span>
                </span>
              )}
            </div>
            <textarea
              rows={9}
              value={formData.descricao}
              onChange={(e) => {
                descricaoEditadaManualRef.current = true;
                setFormData(prev => ({ ...prev, descricao: e.target.value }));
              }}
              placeholder={
                formData.tipoItem === 'servico'
                  ? 'Descreva o que está incluso no serviço, prazos, diferenciais ou deixe a IA aprimorar seu texto...'
                  : 'Digite os detalhes do produto, benefícios, modo de uso ou deixe a IA criar uma descrição exclusiva para você...'
              }
              className="w-full p-4 border-2 border-emerald-500/80 text-xs sm:text-sm font-medium leading-relaxed text-slate-800 dark:text-white focus:outline-none bg-slate-50/60 dark:bg-[#000000] dark:border-[#1E293B] rounded-2xl resize-none shadow-sm"
            />
          </div>

          {/* Card IA Inferior */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-[#000000] dark:to-[#0B0F17] border border-emerald-200/60 dark:border-[#1E293B] shadow-sm">
              <div className="text-left">
                <p className="text-sm font-black text-black dark:text-slate-100">Melhorar com Inteligência Artificial</p>
                <p className="text-sm leading-relaxed text-black dark:text-slate-300 font-medium mt-0.5">Gera um texto exclusivo, detalhado e persuasivo</p>
              </div>
              <button
                type="button"
                disabled={gerandoDescricaoIA}
                onClick={melhorarDescricaoComIA}
                className="hubi-btn-cta px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 transition shadow-md cursor-pointer disabled:opacity-50 shrink-0 ml-2"
              >
                {gerandoDescricaoIA ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                )}
                <span>{gerandoDescricaoIA ? 'Gerando...' : 'Melhorar IA'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Botão Salvar TELA017 */}
        <div className="p-4 border-t border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#0B0F17] shrink-0">
          <button
            type="button"
            onClick={() => setModalDescricaoAberto(false)}
            className="hubi-btn-cta w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-sm sm:text-base shadow-md transition cursor-pointer"
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
      <div className="fixed inset-0 z-50 bg-white dark:bg-[#0B0F17] flex flex-col text-slate-900 dark:text-white select-none">
        {/* Header TELA015 */}
        <div className="h-16 border-b border-slate-200 dark:border-[#1E293B] px-4 flex items-center gap-3 bg-white dark:bg-[#0B0F17] shrink-0">
          <button
            type="button"
            onClick={() => setModalGaleriaFotosAberto(false)}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100">Galeria de Fotos</h1>
        </div>

        {/* Conteúdo com Foto Principal e Grade de Slots */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col items-center">
          {/* Foto Principal */}
          {formData.fotos[0] ? (
            <div className="relative w-64 h-64 border border-slate-200 dark:border-[#1E293B] rounded-3xl overflow-hidden shadow-md flex items-center justify-center bg-slate-50 dark:bg-[#000000]">
              <img src={formData.fotos[0]} alt="Principal" className="w-full h-full object-contain" />
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, fotos: prev.fotos.slice(1) }))}
                className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/80 text-white hover:bg-rose-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="w-64 h-64 border-2 border-dashed border-slate-200 dark:border-[#1E293B] rounded-3xl flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-[#000000]">
              <Camera className="w-12 h-12 mb-2 text-slate-300 dark:text-slate-600" />
              <span className="text-xs sm:text-sm font-bold">Nenhuma foto adicionada</span>
            </div>
          )}

          {/* Grade 2x3 de Slots */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {/* Slot 1: Botão Adicionar */}
            <label className="h-24 rounded-2xl border-2 border-dashed border-emerald-500/80 dark:border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 transition cursor-pointer">
              <Plus className="w-6 h-6 mb-0.5" />
              <span className="text-[10px] font-bold uppercase">Adicionar</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  handleProcessarArquivoFoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>

            {/* Slots 2 a 7 */}
            {[1, 2, 3, 4, 5, 6].map((idx) => {
              const foto = formData.fotos[idx];
              if (foto) {
                return (
                  <div key={idx} className="relative h-24 rounded-2xl border border-slate-200 dark:border-[#1E293B] overflow-hidden bg-slate-50 dark:bg-[#000000] shadow-sm">
                    <img src={foto} alt={`Foto ${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }))}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-900/80 text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }
              return (
                <div key={idx} className="h-24 rounded-2xl border border-slate-100 dark:border-[#1E293B] bg-slate-50/60 dark:bg-[#000000]" />
              );
            })}
          </div>
        </div>

        {/* Botão Salvar TELA015 */}
        <div className="p-4 border-t border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#0B0F17] shrink-0">
          <button
            type="button"
            onClick={() => setModalGaleriaFotosAberto(false)}
            className="hubi-btn-cta w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base shadow-md transition cursor-pointer"
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
      <div className="fixed inset-0 z-50 bg-white dark:bg-[#0B0F17] flex flex-col text-slate-900 dark:text-white select-none">
        {/* Header TELA012 */}
        <div className="h-16 border-b border-slate-200 dark:border-[#1E293B] px-4 flex items-center gap-3 bg-white dark:bg-[#0B0F17] shrink-0">
          <button
            type="button"
            onClick={() => setModalEstoqueMinimoAberto(false)}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100">Estoque mínimo</h1>
        </div>

        {/* Visor Grande TELA012 */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="border-b-4 border-slate-900 dark:border-emerald-500 px-10 py-3 mb-8">
            <span className="font-light text-7xl sm:text-8xl text-slate-900 dark:text-white tracking-tight">{tecladoValorEstoqueMin}</span>
          </div>
        </div>

        {/* Teclado Numérico Virtual TELA012 */}
        <div className="border-t border-slate-100 dark:border-[#1E293B] bg-white dark:bg-[#000000] grid grid-cols-3 divide-x divide-y divide-slate-100 dark:divide-[#1E293B] text-center">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigitoTeclado(num)}
              className="py-6 text-2xl font-bold text-slate-800 dark:text-slate-100 active:bg-slate-100 dark:active:bg-[#0D111A] cursor-pointer"
            >
              {num}
            </button>
          ))}
          <div className="py-6" />
          <button
            type="button"
            onClick={() => handleDigitoTeclado('0')}
            className="py-6 text-2xl font-bold text-slate-800 dark:text-slate-100 active:bg-slate-100 dark:active:bg-[#0D111A] cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleDigitoTeclado('backspace')}
            className="py-6 flex items-center justify-center text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-[#0D111A] cursor-pointer"
          >
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* Botão OK TELA012 */}
        <div className="p-4 border-t border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#0B0F17] shrink-0">
          <button
            type="button"
            onClick={() => {
              const val = parseInt(tecladoValorEstoqueMin, 10) || 0;
              setFormData(prev => ({ ...prev, estoqueMinimo: val }));
              setModalEstoqueMinimoAberto(false);
            }}
            className="hubi-btn-cta w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base shadow-md transition cursor-pointer"
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
      <div className="fixed inset-0 z-50 bg-white dark:bg-[#0B0F17] flex flex-col text-slate-900 dark:text-white select-none">
        {/* Botão Fechar TELA009 */}
        <div className="p-4 flex justify-start">
          <button
            type="button"
            onClick={() => setModalPublicCardAberto(false)}
            className="p-2 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Conteúdo Visual TELA009 */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          <div className="w-full h-72 rounded-3xl border border-slate-100 dark:border-[#1E293B] bg-slate-50 dark:bg-[#000000] overflow-hidden flex items-center justify-center shadow-inner">
            {formData.fotos[0] ? (
              <img src={formData.fotos[0]} alt="Produto" className="max-w-full max-h-full object-contain" />
            ) : (
              <Tag className="w-16 h-16 text-slate-300 dark:text-slate-600" />
            )}
          </div>

          <div className="space-y-1">
            <h1 className="font-black text-lg sm:text-xl text-slate-900 dark:text-white uppercase">
              {formData.nome || 'NOME DO PRODUTO'}
            </h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {mapaCategorias.get(formData.categoriaId) || 'SEM CATEGORIA'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                R$ {precoPromoFmt || precoVendaFmt}
              </span>
              {precoPromoFmt && (
                <span className="text-xs text-slate-400 dark:text-slate-500 line-through">
                  R$ {precoVendaFmt}
                </span>
              )}
            </div>
            {formData.codigoBarras && (
              <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold">
                COD. {formData.codigoBarras}
              </span>
            )}
          </div>

          {formData.descricao && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-2">
              {formData.descricao}
            </p>
          )}
        </div>

        {/* Botão Compartilhar TELA009 */}
        <div className="p-4 border-t border-slate-200 dark:border-[#1E293B] bg-slate-900 dark:bg-[#000000] text-white shrink-0">
          <button
            type="button"
            onClick={() => {
              compartilharLink(
                `${catalogUrl}?p=${produtoEditando?.id || ''}`,
                formData.nome,
                `Confira ${formData.nome} por apenas R$ ${precoPromoFmt || precoVendaFmt} no nosso catálogo!`
              );
            }}
            className="w-full py-3.5 flex items-center justify-center gap-2 text-sm sm:text-base font-extrabold text-slate-200 dark:text-white hover:text-white cursor-pointer"
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
      <div
        className="flex flex-col h-full overflow-hidden select-none"
        style={{ backgroundColor: temaCores.bgExterno, color: temaCores.textoPrincipal }}
      >
        {renderToast()}

        {/* Input de arquivo oculto para seleção de fotos da Galeria (sem capture para evitar OOM no Android) */}
        <input
          ref={fileInputGaleriaRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            handleProcessarArquivoFoto(e.target.files?.[0]);
            e.target.value = '';
          }}
          className="hidden"
        />

        {/* Header Superior Mobile Unificado (TELA004 / TELA007 / TELA008) */}
        <MobileHeader
          titulo={isNovo ? 'Novo produto' : formData.nome || 'Editar Produto'}
          onVoltar={fecharFormularioComConfirmacao}
          acoesDireita={
            <div className="flex items-center gap-1.5 sm:gap-2">
              {!isNovo && produtoEditando && formData.tipoItem !== 'servico' && (
                <>
                  {(() => {
                    const anunciosEditando = mapaAnunciosMl[produtoEditando.id] || [];
                    const anuncioEditPrincipal =
                      anunciosEditando.find((a) => a.status_anuncio === 'active') ||
                      anunciosEditando[0] ||
                      null;
                    if (!anuncioEditPrincipal) return null;
                    const linkMl = obterPermalinkAnuncioMl(
                      anuncioEditPrincipal.permalink,
                      anuncioEditPrincipal.ml_item_id || ''
                    );
                    if (!linkMl) return null;
                    return (
                      <a
                        href={linkMl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1.5 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-black text-[11px] font-bold flex items-center gap-1 shadow-xs transition shrink-0"
                        title="Ver no Mercado Livre"
                      >
                        <span>Ver no Mercado Livre</span>
                        <ExternalLink className="w-3 h-3 text-black" />
                      </a>
                    );
                  })()}
                  <button
                    type="button"
                    disabled={verificandoConexaoMl}
                    onClick={() => handleAbrirModalMercadoLivre(produtoEditando)}
                    className="hubi-btn-neutral px-2.5 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 shadow-xs cursor-pointer transition select-none bg-[#FFE600] hover:bg-[#F5DC00] border-amber-500 text-slate-950"
                    title="Vincular ou publicar no Mercado Livre"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-[#2D3277]" />
                    <span>ML{mapaAnunciosMl[produtoEditando.id]?.length ? ` (${mapaAnunciosMl[produtoEditando.id].length})` : ''}</span>
                  </button>
                </>
              )}

              {!isNovo && (
                <>
                  <button
                    type="button"
                    onClick={() => setModalPublicCardAberto(true)}
                    className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white transition cursor-pointer"
                    title="Compartilhar Card Público"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  {permissions.podeCadastrarAlterarProdutos && (
                    <button
                      type="button"
                      onClick={() => setModalClonarAberto(true)}
                      className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white transition cursor-pointer"
                      title="Clonar Produto"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                  {permissions.podeCadastrarAlterarProdutos && (
                    <button
                      type="button"
                      onClick={handleExcluirProduto}
                      className="p-1.5 text-slate-700 dark:text-slate-400 hover:text-red-600 dark:hover:text-rose-400 transition cursor-pointer"
                      title="Excluir Produto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          }
        />

        {/* Abas: CADASTRO | ESTOQUE (TELA007 / TELA008) */}
        <div
          className="flex shrink-0 border-b"
          style={{ backgroundColor: temaCores.bgHeaderForm, borderColor: temaCores.bordaHeaderForm }}
        >
          <button
            type="button"
            onClick={() => setAbaFormulario('cadastro')}
            className={`flex-1 py-3.5 text-xs sm:text-sm uppercase tracking-wider transition relative cursor-pointer font-bold ${
              abaFormulario === 'cadastro'
                ? isDark
                  ? 'text-emerald-400 border-b-2 border-emerald-500'
                  : 'text-emerald-600 border-b-2 border-emerald-600'
                : 'hover:opacity-80 font-medium'
            }`}
            style={abaFormulario === 'cadastro' ? undefined : { color: temaCores.textoSecundario }}
          >
            Cadastro
          </button>
          <button
            type="button"
            onClick={() => setAbaFormulario('estoque')}
            className={`flex-1 py-3.5 text-xs sm:text-sm uppercase tracking-wider transition relative flex items-center justify-center gap-1.5 cursor-pointer font-bold ${
              abaFormulario === 'estoque'
                ? isDark
                  ? 'text-emerald-400 border-b-2 border-emerald-500'
                  : 'text-emerald-600 border-b-2 border-emerald-600'
                : 'hover:opacity-80 font-medium'
            }`}
            style={abaFormulario === 'estoque' ? undefined : { color: temaCores.textoSecundario }}
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
            {/* Card Superior: Mídia à Esquerda e Pílulas de Ações à Direita */}
            <div
              className="flex items-center gap-3 p-3.5 rounded-2xl border shadow-sm"
              style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
            >
              {/* Lado Esquerdo: Box da Foto Alinhado à Margem Esquerda */}
              <div
                onClick={() => formData.fotos[0] ? setModalFotoFullscreen(formData.fotos[0]) : setModalOpcoesFotoAberto(true)}
                className="aspect-square w-28 h-28 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer shadow-sm relative group"
                title={formData.fotos[0] ? 'Clique para ampliar ou gerenciar foto' : 'Clique para adicionar foto'}
              >
                {formData.fotos[0] ? (
                  <img
                    src={formData.fotos[0]}
                    alt="Foto do Produto"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-400 dark:text-slate-500 text-center select-none bg-slate-50 dark:bg-slate-900/80">
                    <ImageOff className="w-6 h-6 opacity-40 mb-1" />
                    <span className="text-[10px] font-medium leading-none tracking-tight">Sem foto</span>
                  </div>
                )}
                {formData.fotos.length > 1 && (
                  <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold backdrop-blur-xs">
                    +{formData.fotos.length - 1}
                  </span>
                )}
              </div>

              {/* Lado Direito: Pílulas de Ação no Padrão do Desktop */}
              <div className="flex flex-col justify-between flex-1 gap-1.5 min-w-0">


                {/* 2. Botão de IA (Atualizar ou Preencher) */}
                {!isNovo ? (
                  <button
                    type="button"
                    disabled={processandoIA}
                    onClick={handleAtualizarProdutoExistenteIA}
                    className="h-9 px-3 rounded-xl text-xs font-medium border flex items-center justify-between transition-all w-full shadow-sm bg-white hover:bg-emerald-500/15 dark:bg-slate-900/90 dark:hover:bg-emerald-500/20 border-slate-200 hover:border-emerald-500/70 dark:border-slate-800 dark:hover:border-emerald-500/70 text-slate-700 hover:text-emerald-950 dark:text-slate-200 dark:hover:text-white cursor-pointer disabled:opacity-50"
                    title="Atualizar o produto com nossa Inteligência Artificial"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {processandoIA ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                      )}
                      <span className="font-semibold truncate text-emerald-600 dark:text-emerald-400">Atualizar com nossa IA</span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={processandoIA}
                    onClick={handleBotaoPreencherComIA}
                    className="h-9 px-3 rounded-xl text-xs font-medium border flex items-center justify-between transition-all w-full shadow-sm bg-white hover:bg-emerald-500/15 dark:bg-slate-900/90 dark:hover:bg-emerald-500/20 border-slate-200 hover:border-emerald-500/70 dark:border-slate-800 dark:hover:border-emerald-500/70 text-slate-700 hover:text-emerald-950 dark:text-slate-200 dark:hover:text-white cursor-pointer disabled:opacity-50"
                    title="Preencher com nossa Inteligência Artificial"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                      <span className="font-semibold truncate text-emerald-600 dark:text-emerald-400">Preencher com nossa IA</span>
                    </div>
                  </button>
                )}

                {/* 3. Galeria (Até 7 fotos) */}
                <button
                  type="button"
                  onClick={() => setModalGaleriaFotosAberto(true)}
                  className="h-9 px-3 rounded-xl text-xs font-medium border flex items-center justify-between transition-all w-full shadow-sm bg-white hover:bg-emerald-500/15 dark:bg-slate-900/90 dark:hover:bg-emerald-500/20 border-slate-200 hover:border-emerald-500/70 dark:border-slate-800 dark:hover:border-emerald-500/70 text-slate-700 hover:text-emerald-950 dark:text-slate-200 dark:hover:text-white cursor-pointer"
                  title="Gerenciar galeria de fotos (até 7 fotos)"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Upload className="w-3.5 h-3.5 text-slate-400 dark:text-slate-300 shrink-0" />
                    <span className="font-semibold truncate">Galeria</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                    ({formData.fotos.length}/7)
                  </span>
                </button>

                {/* 4. Pesquisar Fotos na Internet */}
                <button
                  type="button"
                  onClick={handleAbrirPesquisaFotos}
                  className="h-9 px-3 rounded-xl text-xs font-medium border flex items-center justify-between transition-all w-full shadow-sm bg-white hover:bg-emerald-500/15 dark:bg-slate-900/90 dark:hover:bg-emerald-500/20 border-slate-200 hover:border-emerald-500/70 dark:border-slate-800 dark:hover:border-emerald-500/70 text-slate-700 hover:text-emerald-950 dark:text-slate-200 dark:hover:text-white cursor-pointer"
                  title="Pesquisar fotos na internet de boa qualidade"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Globe className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
                    <span className="font-semibold truncate">Fotos na Internet</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Status de Ativação do Produto */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Produto:</span>
                {formData.ativo ? (
                  <span className="text-emerald-500 font-semibold text-xs">Ativo</span>
                ) : (
                  <span className="text-slate-400 font-semibold text-xs">Inativo</span>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formData.ativo}
                onClick={() => setFormData(prev => ({ ...prev, ativo: !prev.ativo }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                  formData.ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.ativo ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Campos Obrigatórios */}
            <div className="space-y-4">
              {/* Tipo do Item (Produto Físico vs Serviço / Taxa) */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: temaCores.textoSecundario }}>
                  Tipo do Item
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, tipoItem: 'produto' }))}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formData.tipoItem !== 'servico'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : ''
                    }`}
                    style={formData.tipoItem !== 'servico' ? undefined : { backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard, color: temaCores.textoPrincipal }}
                  >
                    <Package className="w-4 h-4" />
                    <span>Produto Físico</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, tipoItem: 'servico', quantidadeEstoque: 0, estoqueMinimo: 0 }))}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formData.tipoItem === 'servico'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : ''
                    }`}
                    style={formData.tipoItem === 'servico' ? undefined : { backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard, color: temaCores.textoPrincipal }}
                  >
                    <Wrench className="w-4 h-4" />
                    <span>Serviço / Taxa</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: temaCores.textoSecundario }}>
                  Nome do Produto
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Informe o nome completo do item"
                  className="w-full px-3.5 py-2.5 rounded-xl border placeholder-slate-400 dark:placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm font-semibold uppercase transition"
                  style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                />
              </div>

              {/* Unidade de Medida (Tabela unidades_medida com padrão UN) */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: temaCores.textoSecundario }}>
                  Unidade de Medida
                </label>
                <div
                  onClick={() => setModalUnidadeMedidaAberto(true)}
                  className="p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition shadow-2xs"
                  style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-black text-xs uppercase font-mono">
                      {(formData.unidadeMedida || formData.tipoUnidade || 'un').toUpperCase()}
                    </span>
                    <span className="text-xs sm:text-sm font-bold" style={{ color: temaCores.textoPrincipal }}>
                      {unidadesLista.find(u => u.sigla.toLowerCase() === (formData.unidadeMedida || formData.tipoUnidade || 'un').toLowerCase())?.nome || 'Unidade'}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    Preço de Venda (Varejo)
                  </label>
                  <button
                    type="button"
                    onClick={handleAbrirRadarPrecos}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-emerald-600 dark:text-emerald-400 border text-xs font-semibold transition cursor-pointer shadow-2xs"
                    style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                    title="Pesquisar concorrentes de mercado com IA"
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Radar de Preços IA</span>
                  </button>
                </div>
                <div
                  className="flex items-center px-3.5 py-2.5 rounded-xl border focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition"
                  style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                >
                  <span className="text-sm font-bold text-slate-400 mr-2">R$</span>
                  <input
                    type="text"
                    value={formData.precoVenda}
                    onChange={(e) => handlePrecoVendaChange(e.target.value)}
                    placeholder="0,00"
                    className="w-full text-sm font-bold bg-transparent focus:outline-none"
                    style={{ color: temaCores.textoInput }}
                  />
                </div>
                {(() => {
                  const pv = parseFloat(formData.precoVenda.replace(',', '.')) || 0;
                  const pc = parseFloat(formData.precoCusto.replace(',', '.')) || 0;
                  const lucro = pv - pc;
                  const margem = pv > 0 ? (lucro / pv) * 100 : 0;
                  if (pv <= 0 || pc <= 0) return null;
                  return (
                    <div
                      className="mt-2 p-2.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in"
                      style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                    >
                      <span className="font-semibold text-emerald-600 dark:text-emerald-300">Lucro: R$ {lucro.toFixed(2)}</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg text-xs">
                        Margem: {margem.toFixed(1)}%
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Accordion: Opcionais (TELA008 & TELA008A) */}
            <div className="border-t pt-3 space-y-4" style={{ borderColor: temaCores.bordaCard }}>
              <button
                type="button"
                onClick={() => setOpcionaisExpandido(!opcionaisExpandido)}
                className="w-full flex items-center justify-between text-left cursor-pointer"
              >
                <div>
                  <h3 className="font-extrabold text-sm" style={{ color: temaCores.textoPrincipal }}>Opcionais</h3>
                  <p className="text-sm leading-relaxed font-medium" style={{ color: temaCores.textoSecundario }}>Experimente a descrição gerada com IA</p>
                </div>
                {opcionaisExpandido ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {opcionaisExpandido && (
                <div className="space-y-4 pt-1">
                  {/* Preço promocional */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: temaCores.textoSecundario }}>Preço promocional</label>
                    <div
                      className="relative flex items-center px-3.5 py-2.5 rounded-xl border focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition"
                      style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                    >
                      <span className="text-sm font-bold text-slate-400 mr-2">R$</span>
                      <input
                        type="text"
                        value={formData.precoPromocional}
                        onChange={(e) => setFormData(prev => ({ ...prev, precoPromocional: e.target.value }))}
                        placeholder="0,00"
                        className="w-full text-sm font-bold bg-transparent focus:outline-none pr-6"
                        style={{ color: temaCores.textoInput }}
                      />
                      {formData.precoPromocional && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, precoPromocional: '' }))}
                          className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed mt-1 font-medium" style={{ color: temaCores.textoSecundario }}>
                       O preço de venda será riscado (ex: de R$ 10,00 por R$ 5,00)
                    </p>
                  </div>

                  {/* Seletor de Categoria (TELA016) + Subcategoria Condicional */}
                  <div className="space-y-2.5">
                    <div
                      onClick={() => setModalCategoriasAberto(true)}
                      className="p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition"
                      style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                    >
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: temaCores.textoSecundario }}>Categoria</span>
                        <span className="text-xs sm:text-sm font-bold uppercase" style={{ color: temaCores.textoPrincipal }}>
                          {mapaCategorias.get(formData.categoriaId) || 'Selecione uma categoria'}
                        </span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>

                    {(() => {
                      const subcategoriasFilhas = obterSubcategoriasDe(categorias, formData.categoriaId, loja?.id);
                      if (subcategoriasFilhas.length === 0) return null;
                      const subAtual = subcategoriasFilhas.find(s => s.id === formData.subcategoriaId);
                      return (
                        <div
                          onClick={() => {
                            setBuscaSubcategoria('');
                            setModalSubcategoriasAberto(true);
                          }}
                          className="p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition animate-in fade-in"
                          style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                        >
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: temaCores.textoSecundario }}>
                              Subcategoria (Opcional)
                            </span>
                            <span className="text-xs sm:text-sm font-bold uppercase" style={{ color: temaCores.textoPrincipal }}>
                              {subAtual ? subAtual.nome : 'Selecione uma subcategoria'}
                            </span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        </div>
                      );
                    })()}
                  </div>

                  {/* Seletor de Descrição (TELA017) */}
                  <div
                    onClick={() => setModalDescricaoAberto(true)}
                    className="p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition"
                    style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                  >
                    <div className="flex-1 pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: temaCores.textoSecundario }}>Descrição Comercial</span>
                        {redigindoDescricaoIA && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Redigindo descrição com IA...</span>
                          </span>
                        )}
                      </div>
                      <span className="text-xs sm:text-sm font-semibold line-clamp-2" style={{ color: temaCores.textoPrincipal }}>
                        {formData.descricao || 'Toque para adicionar uma descrição exclusiva...'}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                  </div>

                  {/* Código com Leitor de Código de Barras (TELA018) */}
                  {formData.tipoItem !== 'servico' && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: temaCores.textoSecundario }}>Código de Barras / EAN</label>
                      <div
                        className="relative flex items-center px-3.5 py-2.5 rounded-xl border focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition"
                        style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                      >
                        <input
                          type="text"
                          value={formData.codigoBarras}
                          onChange={(e) => setFormData(prev => ({ ...prev, codigoBarras: e.target.value }))}
                          placeholder="Código de barras ou EAN"
                          className="w-full text-sm font-semibold bg-transparent focus:outline-none pr-8"
                          style={{ color: temaCores.textoInput }}
                        />
                        <button
                          type="button"
                          onClick={iniciarScannerCamera}
                          className="absolute right-2 p-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 cursor-pointer"
                          title="Ler Código de Barras com a Câmera"
                        >
                          <QrCode className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Código Interno / SKU */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: temaCores.textoSecundario }}>Código Interno / SKU (Opcional)</label>
                    <div
                      className="flex items-center px-3.5 py-2.5 rounded-xl border focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition"
                      style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                    >
                      <input
                        type="text"
                        value={formData.codigoInterno}
                        onChange={(e) => setFormData(prev => ({ ...prev, codigoInterno: e.target.value }))}
                        placeholder="Ex: PRD-001 ou SKU interno"
                        className="w-full text-sm font-semibold bg-transparent focus:outline-none"
                        style={{ color: temaCores.textoInput }}
                      />
                    </div>
                  </div>

                  {/* Fornecedor (apenas para produtos físicos) */}
                  {formData.tipoItem !== 'servico' && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: temaCores.textoSecundario }}>Fornecedor (Opcional)</label>
                      <select
                        value={formData.fornecedorId}
                        onChange={(e) => setFormData(prev => ({ ...prev, fornecedorId: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold focus:outline-none focus:border-emerald-500 transition"
                        style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                      >
                        <option value="">Sem fornecedor vinculado</option>
                        {fornecedoresLista.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Venda por Peso / Fracionado & Código na Balança */}
                  {formData.tipoItem !== 'servico' && (
                    <div
                      className="p-3.5 rounded-2xl border space-y-3"
                      style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-bold block" style={{ color: temaCores.textoPrincipal }}>
                            Venda por Peso / Fracionada (Balança)
                          </span>
                          <span className="text-sm leading-relaxed block" style={{ color: temaCores.textoSecundario }}>
                            Permite quantidades decimais (ex: 0,350 kg) e leitura de etiquetas EAN-13
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={formData.vendaPorPeso}
                          onClick={() => setFormData(prev => ({ ...prev, vendaPorPeso: !prev.vendaPorPeso }))}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                            formData.vendaPorPeso ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              formData.vendaPorPeso ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {formData.vendaPorPeso && (
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: temaCores.textoSecundario }}>
                            Código na Balança / PLU (4 a 6 dígitos - Opcional)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formData.codigoBalanca}
                            onChange={(e) => setFormData(prev => ({ ...prev, codigoBalanca: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                            placeholder="Ex: 1024"
                            className="w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
                            style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preço de Custo */}
                  {permissions.podeVerPrecoCusto && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: temaCores.textoSecundario }}>Custo do Produto</label>
                      <div
                        className="flex items-center px-3.5 py-2.5 rounded-xl border focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition"
                        style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                      >
                        <span className="text-sm font-bold text-slate-400 mr-2">R$</span>
                        <input
                          type="text"
                          value={formData.precoCusto}
                          onChange={(e) => setFormData(prev => ({ ...prev, precoCusto: e.target.value }))}
                          placeholder="0,00"
                          className="w-full text-sm font-bold bg-transparent focus:outline-none"
                          style={{ color: temaCores.textoInput }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Tabelas de Atacado & Distribuidor */}
                  {formData.tipoItem !== 'servico' && (() => {
                    const tiposVendaLoja = loja?.tipos_venda || (loja as any)?.configuracoes_extras?.tipos_venda_ativos || {};
                    const atacadoAtivo = tiposVendaLoja.atacado !== false || (loja as any)?.permite_atacado === true;
                    const distribuidorAtivo = tiposVendaLoja.distribuidor !== false || (loja as any)?.permite_distribuidor === true;
                    if (!atacadoAtivo && !distribuidorAtivo) return null;
                    return (
                  <div
                    className="p-4 border rounded-2xl space-y-3.5 shadow-sm"
                    style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                  >
                    <div>
                      <span className="text-sm font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: temaCores.textoPrincipal }}>
                        <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Tabelas de Atacado & Distribuidor</span>
                      </span>
                      <p className="text-sm leading-relaxed mt-0.5" style={{ color: temaCores.textoSecundario }}>Preços diferenciados ativados por regra da loja no PDV</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {atacadoAtivo && (
                        <>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-semibold uppercase" style={{ color: temaCores.textoSecundario }}>Preço Atacado</label>
                              {formData.precoVenda && (
                                <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                                  -{regrasPrecificacaoLoja.descontoAtacado}%
                                </span>
                              )}
                            </div>
                            <div
                              className="flex items-center px-3 py-2 rounded-xl border focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                            >
                              <span className="text-xs font-bold text-slate-500 mr-1.5">R$</span>
                              <input
                                type="text"
                                value={formData.precoAtacado}
                                onChange={(e) => setFormData(prev => ({ ...prev, precoAtacado: e.target.value }))}
                                placeholder="0,00"
                                className="w-full text-xs sm:text-sm font-bold bg-transparent focus:outline-none"
                                style={{ color: temaCores.textoInput }}
                              />
                            </div>
                          </div>

                          {regrasPrecificacaoLoja.tipoMinAtacado === 'valor' ? (
                            <div>
                              <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>Valor Mínimo (R$)</label>
                              <div
                                className="flex items-center px-3 py-2 rounded-xl border border-dashed"
                                style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                              >
                                <span className="text-xs font-bold text-slate-500 mr-1.5">R$</span>
                                <input
                                  type="text"
                                  readOnly
                                  disabled
                                  value={regrasPrecificacaoLoja.valMinAtacado > 0 ? regrasPrecificacaoLoja.valMinAtacado.toFixed(2).replace('.', ',') : '0,00'}
                                  className="w-full text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-400 bg-transparent cursor-not-allowed focus:outline-none"
                                />
                              </div>
                            </div>
                          ) : regrasPrecificacaoLoja.tipoMinAtacado === 'minimo_sku' ? (
                            <div>
                              <label className="text-[10px] font-bold uppercase block mb-1 text-emerald-600 dark:text-emerald-400">Qtd Mínima Atacado (Un)</label>
                              <div
                                className="flex items-center px-3 py-2 rounded-xl border border-emerald-500/60 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition"
                                style={{ backgroundColor: temaCores.bgInput }}
                              >
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={formData.qtdMinimaAtacado || ''}
                                  onChange={(e) => setFormData(prev => ({ ...prev, qtdMinimaAtacado: parseInt(e.target.value, 10) || 0 }))}
                                  placeholder="Ex: 6"
                                  className="w-full text-xs sm:text-sm font-bold bg-transparent focus:outline-none"
                                  style={{ color: temaCores.textoInput }}
                                />
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 ml-1">un</span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>Qtd Mínima (Unidades)</label>
                              <div
                                className="flex items-center px-3 py-2 rounded-xl border border-dashed"
                                style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                              >
                                <input
                                  type="text"
                                  readOnly
                                  disabled
                                  value={`${regrasPrecificacaoLoja.qtdMinAtacado || 0} un`}
                                  className="w-full text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-400 bg-transparent cursor-not-allowed focus:outline-none"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {distribuidorAtivo && (
                        <>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-semibold uppercase" style={{ color: temaCores.textoSecundario }}>Preço Distribuidor</label>
                              {formData.precoVenda && (
                                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800/40 px-1.5 py-0.2 rounded font-bold">
                                  -{regrasPrecificacaoLoja.descontoAutoatacado}%
                                </span>
                              )}
                            </div>
                            <div
                              className="flex items-center px-3 py-2 rounded-xl border focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                            >
                              <span className="text-xs font-bold text-slate-500 mr-1.5">R$</span>
                              <input
                                type="text"
                                value={formData.precoAutoatacado}
                                onChange={(e) => setFormData(prev => ({ ...prev, precoAutoatacado: e.target.value }))}
                                placeholder="0,00"
                                className="w-full text-xs sm:text-sm font-bold bg-transparent focus:outline-none"
                                style={{ color: temaCores.textoInput }}
                              />
                            </div>
                          </div>

                          {regrasPrecificacaoLoja.tipoMinDistribuidor === 'valor' ? (
                            <div>
                              <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>Valor Mínimo (R$)</label>
                              <div
                                className="flex items-center px-3 py-2 rounded-xl border border-dashed"
                                style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                              >
                                <span className="text-xs font-bold text-slate-500 mr-1.5">R$</span>
                                <input
                                  type="text"
                                  readOnly
                                  disabled
                                  value={regrasPrecificacaoLoja.valMinDistribuidor > 0 ? regrasPrecificacaoLoja.valMinDistribuidor.toFixed(2).replace('.', ',') : '0,00'}
                                  className="w-full text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-400 bg-transparent cursor-not-allowed focus:outline-none"
                                />
                              </div>
                            </div>
                          ) : regrasPrecificacaoLoja.tipoMinDistribuidor === 'minimo_sku' ? (
                            <div>
                              <label className="text-[10px] font-bold uppercase block mb-1 text-indigo-600 dark:text-indigo-400">Qtd Mínima Distribuidor (Un)</label>
                              <div
                                className="flex items-center px-3 py-2 rounded-xl border border-indigo-500/60 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition"
                                style={{ backgroundColor: temaCores.bgInput }}
                              >
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={formData.qtdMinimaAutoatacado || ''}
                                  onChange={(e) => setFormData(prev => ({ ...prev, qtdMinimaAutoatacado: parseInt(e.target.value, 10) || 0 }))}
                                  placeholder="Ex: 24"
                                  className="w-full text-xs sm:text-sm font-bold bg-transparent focus:outline-none"
                                  style={{ color: temaCores.textoInput }}
                                />
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 ml-1">un</span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>Qtd Mínima (Unidades)</label>
                              <div
                                className="flex items-center px-3 py-2 rounded-xl border border-dashed"
                                style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                              >
                                <input
                                  type="text"
                                  readOnly
                                  disabled
                                  value={`${regrasPrecificacaoLoja.qtdMinDistribuidor || 0} un`}
                                  className="w-full text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-400 bg-transparent cursor-not-allowed focus:outline-none"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed italic" style={{ color: temaCores.textoSecundario }}>
                      * Condições de ativação mínima seguem as Regras de Precificação da loja.
                    </p>
                  </div>
                    );
                  })()}

                  {/* Seção 4: Controle de Estoque & Agendamento */}
                  {formData.tipoItem === 'servico' ? (
                    <div className="space-y-3.5">
                      <div
                        className="p-4 border rounded-2xl space-y-1"
                        style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                      >
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                          <Wrench className="w-4 h-4" />
                          <span>Controle de Estoque (Dispensado para Serviços / Taxas)</span>
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: temaCores.textoSecundario }}>
                          Itens de serviço não movimentam estoque físico. Vendas são ilimitadas e não bloqueiam por falta de saldo.
                        </p>
                      </div>

                      {/* Card Dedicado de Agendamento */}
                      <div
                        className="p-4 border rounded-2xl space-y-4 shadow-sm"
                        style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                      >
                        <div>
                          <h4 className="text-sm font-bold flex items-center gap-1.5" style={{ color: temaCores.textoPrincipal }}>
                            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>Agendamento e Execução do Serviço</span>
                          </h4>
                          <p className="text-sm leading-relaxed mt-0.5" style={{ color: temaCores.textoSecundario }}>
                            Configure a grade de horários e os atendentes habilitados para este serviço.
                          </p>
                        </div>

                        {/* Switch Hora Marcada */}
                        <div
                          className="flex items-center justify-between p-3 rounded-xl border"
                          style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                        >
                          <div className="space-y-0.5 pr-2">
                            <span className="text-sm font-bold block" style={{ color: temaCores.textoPrincipal }}>
                              Serviço com Hora Marcada
                            </span>
                            <span className="text-sm leading-relaxed block" style={{ color: temaCores.textoSecundario }}>
                              Exige agendamento prévio de data/hora no catálogo ou PDV
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={Boolean(formData.requerAgendamento)}
                              onChange={(e) => setFormData(prev => ({ ...prev, requerAgendamento: e.target.checked }))}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 bg-slate-300 dark:bg-slate-700"></div>
                          </label>
                        </div>

                        {formData.requerAgendamento && (
                          <div className="space-y-4 animate-in fade-in duration-200">
                            {/* Duração Estimada */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold flex items-center gap-1" style={{ color: temaCores.textoPrincipal }}>
                                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Duração Estimada:</span>
                                </label>
                                <span className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">
                                  {formData.duracaoEstimadaMinutos || 30} min
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                {[15, 30, 45, 60, 90, 120].map((min) => (
                                  <button
                                    key={min}
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, duracaoEstimadaMinutos: min }))}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                                      formData.duracaoEstimadaMinutos === min
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                        : 'bg-transparent border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    {min}m
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Local de Prestação */}
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold flex items-center gap-1" style={{ color: temaCores.textoPrincipal }}>
                                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Local de Prestação:</span>
                              </label>
                              <div className="grid grid-cols-1 gap-1.5">
                                {[
                                  { id: 'loja', rotulo: 'Na Própria Loja' },
                                  { id: 'externo', rotulo: 'No Endereço do Cliente (Domicílio)' },
                                  { id: 'ambos', rotulo: 'Ambos (Cliente Escolhe)' }
                                ].map((loc) => (
                                  <button
                                    key={loc.id}
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, localPrestacaoServico: loc.id as LocalPrestacaoServico }))}
                                    className={`p-2 rounded-xl border text-left text-xs font-bold transition cursor-pointer flex items-center justify-between ${
                                      formData.localPrestacaoServico === loc.id
                                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-950 dark:text-white ring-1 ring-emerald-500/30'
                                        : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <span>{loc.rotulo}</span>
                                    {formData.localPrestacaoServico === loc.id && (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Taxa de Deslocamento / Atendimento a Domicílio */}
                            {(formData.localPrestacaoServico === 'externo' || formData.localPrestacaoServico === 'ambos') && (
                              <div
                                className="p-3 rounded-xl border space-y-2.5"
                                style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                              >
                                <div className="flex items-center gap-1.5">
                                  <Home className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span className="text-xs font-bold" style={{ color: temaCores.textoPrincipal }}>
                                    Taxa de Deslocamento a Domicílio
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-1.5">
                                  {[
                                    {
                                      id: 'padrao',
                                      label: 'Padrão Loja',
                                      sub: `R$ ${Number(loja?.taxa_padrao_domicilio ?? 0).toFixed(2).replace('.', ',')}`
                                    },
                                    {
                                      id: 'especifico',
                                      label: 'Específico',
                                      sub: 'Definir valor'
                                    },
                                    {
                                      id: 'gratis',
                                      label: 'Grátis',
                                      sub: 'R$ 0,00'
                                    }
                                  ].map((opt) => {
                                    const ativo = formData.modoTaxaDomicilio === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, modoTaxaDomicilio: opt.id as any }))}
                                        className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                                          ativo
                                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-950 dark:text-white'
                                            : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-300'
                                        }`}
                                      >
                                        <span className="text-[11px] font-bold block truncate">{opt.label}</span>
                                        <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 block truncate">{opt.sub}</span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {formData.modoTaxaDomicilio === 'especifico' && (
                                  <div className="space-y-2.5 pt-1">
                                    <div>
                                      <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                                        Valor da Taxa (R$)
                                      </label>
                                      <div
                                        className="flex items-center px-3 py-2 rounded-xl border"
                                        style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                                      >
                                        <span className="text-xs font-bold text-slate-500 mr-1.5">R$</span>
                                        <input
                                          type="text"
                                          value={formData.taxaDeslocamentoDomicilio}
                                          onChange={(e) => setFormData(prev => ({ ...prev, taxaDeslocamentoDomicilio: e.target.value }))}
                                          placeholder="0,00"
                                          className="w-full text-xs font-bold bg-transparent focus:outline-none"
                                          style={{ color: temaCores.textoInput }}
                                        />
                                      </div>
                                    </div>

                                    <label className="flex items-start gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={formData.abaterTaxaDomicilioAoFechar}
                                        onChange={(e) => setFormData(prev => ({ ...prev, abaterTaxaDomicilioAoFechar: e.target.checked }))}
                                        className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                      />
                                      <div>
                                        <span className="text-sm font-bold block" style={{ color: temaCores.textoPrincipal }}>
                                          Isentar / abater esta taxa se o cliente fechar o serviço
                                        </span>
                                        <span className="text-sm leading-relaxed block" style={{ color: temaCores.textoSecundario }}>
                                          Ideal para orçamentos técnicos: cobra apenas se o cliente não aprovar o serviço.
                                        </span>
                                      </div>
                                    </label>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Profissionais Habilitados */}
                            <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                              <label className="text-[11px] font-bold flex items-center gap-1" style={{ color: temaCores.textoPrincipal }}>
                                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Profissionais Habilitados:</span>
                              </label>

                              {colaboradoresPrestadoresLoja.length === 0 ? (
                                <p className="text-[11px] text-amber-500 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10">
                                  Nenhum colaborador com serviços agendáveis ativo na loja.
                                </p>
                              ) : (
                                <div className="space-y-1.5">
                                  {colaboradoresPrestadoresLoja.map((colab) => {
                                    const checked = (formData.profissionaisHabilitadosIds || []).includes(colab.id);
                                    return (
                                      <label
                                        key={colab.id}
                                        className={`flex items-center gap-2.5 p-2 rounded-xl border transition cursor-pointer select-none ${
                                          checked
                                            ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-900 dark:text-white'
                                            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setFormData(prev => ({
                                                ...prev,
                                                profissionaisHabilitadosIds: [...(prev.profissionaisHabilitadosIds || []), colab.id]
                                              }));
                                            } else {
                                              setFormData(prev => ({
                                                ...prev,
                                                profissionaisHabilitadosIds: (prev.profissionaisHabilitadosIds || []).filter(id => id !== colab.id)
                                              }));
                                            }
                                          }}
                                          className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <div className="min-w-0">
                                          <span className="text-sm font-bold block truncate">
                                            {colab.nome_completo || colab.nome}
                                          </span>
                                          {colab.especialidade_cargo && (
                                            <span className="text-sm leading-relaxed text-black dark:text-slate-300 block truncate">
                                              {colab.especialidade_cargo}
                                            </span>
                                          )}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="p-4 border rounded-2xl space-y-3.5 shadow-sm"
                      style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                    >
                      <div>
                        <span className="text-sm font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: temaCores.textoPrincipal }}>
                          <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>4. Controle de Estoque & Entrada Inicial</span>
                        </span>
                        <p className="text-sm leading-relaxed mt-0.5" style={{ color: temaCores.textoSecundario }}>
                          Informe a quantidade inicial em loja e parâmetros de estoque
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase block mb-1">
                            Estoque Inicial em Loja
                          </label>
                          <input
                            type="number"
                            value={formData.quantidadeEstoque}
                            onChange={(e) => setFormData(prev => ({ ...prev, quantidadeEstoque: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-3.5 py-2.5 rounded-xl border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-bold transition"
                            style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                          />
                          <span className="text-sm leading-relaxed block mt-1" style={{ color: temaCores.textoSecundario }}>Saldo inicial para venda</span>
                        </div>

                        <div>
                          <label className="text-xs font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                            Alerta Estoque Mínimo
                          </label>
                          <input
                            type="number"
                            value={formData.estoqueMinimo}
                            onChange={(e) => setFormData(prev => ({ ...prev, estoqueMinimo: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-3.5 py-2.5 rounded-xl border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-bold transition"
                            style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                          />
                          <span className="text-sm leading-relaxed block mt-1" style={{ color: temaCores.textoSecundario }}>Avisa quando estiver acabando</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                          Data de Validade (Opcional)
                        </label>
                        <input
                          type="date"
                          value={formData.dataValidade || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, dataValidade: e.target.value }))}
                          className="w-full px-3.5 py-2.5 rounded-xl border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs sm:text-sm font-semibold transition"
                          style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                        />
                        <span className="text-sm leading-relaxed block mt-1" style={{ color: temaCores.textoSecundario }}>Para perecíveis / cosméticos</span>
                      </div>
                    </div>
                  )}

                  {/* Destacar este produto */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-[#1E293B]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">Destacar este produto</span>
                      <HelpCircle className="w-4 h-4 text-slate-400" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, destaque: !prev.destaque }))}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                        formData.destaque ? 'bg-emerald-500 dark:bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                        formData.destaque ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  {/* Exibir produto no catálogo */}
                  <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-[#1E293B]">
                    <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">Exibir produto no catálogo</span>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, exibirCatalogo: !prev.exibirCatalogo }))}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                        formData.exibirCatalogo ? 'bg-emerald-500 dark:bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
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

            {/* SEÇÃO 5: VARIAÇÕES DO PRODUTO (MULTINÍVEL RELACIONAL SEM JSONB) */}
            {formData.tipoItem !== 'servico' && (
            <div
              className="p-4 border rounded-2xl space-y-4 shadow-sm"
              style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: temaCores.textoPrincipal }}>
                    <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>5. Variações do Produto</span>
                  </span>
                  <p className="text-sm leading-relaxed mt-0.5" style={{ color: temaCores.textoSecundario }}>
                    Cor, tamanho, sabor, voltagem com estoque individual
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.temVariacoes}
                  onClick={() => {
                    const novoVal = !formData.temVariacoes;
                    setFormData(prev => {
                      if (!novoVal) {
                        return { ...prev, temVariacoes: false };
                      }
                      const vars = prev.variacoes.length > 0 ? prev.variacoes : [
                        {
                          id: Date.now().toString(),
                          valor_variacao_1: 'Padrão',
                          valor_variacao_2: '',
                          combinacao_nome: 'Padrão',
                          quantidade_estoque: prev.quantidadeEstoque || 0,
                          preco_venda_varejo: parseFloat(prev.precoVenda.replace(',', '.')) || 0,
                          codigo_barras: prev.codigoBarras || '',
                          sku: ''
                        }
                      ];
                      return { ...prev, temVariacoes: true, variacoes: vars };
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                    formData.temVariacoes ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.temVariacoes ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {formData.temVariacoes && (
                <div className="space-y-3.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {/* Atributos / Rótulos das Variações */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                        1º Atributo (ex: Cor)
                      </label>
                      <input
                        type="text"
                        value={rotuloVariacao1}
                        onChange={(e) => setRotuloVariacao1(e.target.value)}
                        placeholder="Ex: Cor ou Tamanho"
                        className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                        style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                        2º Atributo (Opcional)
                      </label>
                      <input
                        type="text"
                        value={rotuloVariacao2}
                        onChange={(e) => setRotuloVariacao2(e.target.value)}
                        placeholder="Ex: Tamanho ou Voltagem"
                        className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                        style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                      />
                    </div>
                  </div>

                  {/* Lista de Variações Cadastradas */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm font-semibold" style={{ color: temaCores.textoSecundario }}>
                      <span>Opções ({formData.variacoes.length}):</span>
                      <span>Estoque individual</span>
                    </div>

                    {formData.variacoes.map((v, idx) => (
                      <div
                        key={v.id || idx}
                        className="p-3 rounded-xl border space-y-2.5 transition"
                        style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={v.valor_variacao_1 || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormData(prev => {
                                  const list = [...prev.variacoes];
                                  list[idx] = { ...list[idx], valor_variacao_1: val };
                                  return { ...prev, variacoes: list };
                                });
                              }}
                              placeholder={`Valor ${rotuloVariacao1 || '1'}`}
                              className="px-2.5 py-1.5 rounded-lg border text-xs font-bold"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                            />
                            {rotuloVariacao2.trim() ? (
                              <input
                                type="text"
                                value={v.valor_variacao_2 || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormData(prev => {
                                    const list = [...prev.variacoes];
                                    list[idx] = { ...list[idx], valor_variacao_2: val };
                                    return { ...prev, variacoes: list };
                                  });
                                }}
                                placeholder={`Valor ${rotuloVariacao2}`}
                                className="px-2.5 py-1.5 rounded-lg border text-xs font-bold"
                                style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                              />
                            ) : (
                              <div className="flex items-center text-sm leading-relaxed text-black dark:text-slate-300 italic px-1">
                                Atributo único
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                variacoes: prev.variacoes.filter((_, i) => i !== idx)
                              }));
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Remover variação"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: temaCores.textoSecundario }}>
                              Estoque
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={v.quantidade_estoque ?? 0}
                              onChange={(e) => {
                                const q = parseFloat(e.target.value) || 0;
                                setFormData(prev => {
                                  const list = [...prev.variacoes];
                                  list[idx] = { ...list[idx], quantidade_estoque: q };
                                  const somaEstoque = list.reduce((acc, item) => acc + (Number(item.quantidade_estoque) || 0), 0);
                                  return { ...prev, variacoes: list, quantidadeEstoque: somaEstoque };
                                });
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-center text-emerald-600 dark:text-emerald-400"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: temaCores.textoSecundario }}>
                              Preço Varejo (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={v.preco_venda_varejo ?? ''}
                              onChange={(e) => {
                                const p = parseFloat(e.target.value) || 0;
                                setFormData(prev => {
                                  const list = [...prev.variacoes];
                                  list[idx] = { ...list[idx], preco_venda_varejo: p };
                                  return { ...prev, variacoes: list };
                                });
                              }}
                              placeholder={formData.precoVenda || '0,00'}
                              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: temaCores.textoSecundario }}>
                              SKU
                            </label>
                            <input
                              type="text"
                              value={v.sku || ''}
                              onChange={(e) => {
                                const skuVal = e.target.value;
                                setFormData(prev => {
                                  const list = [...prev.variacoes];
                                  list[idx] = { ...list[idx], sku: skuVal };
                                  return { ...prev, variacoes: list };
                                });
                              }}
                              placeholder="SKU"
                              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: temaCores.textoSecundario }}>
                              EAN / Barras
                            </label>
                            <input
                              type="text"
                              value={v.codigo_barras || ''}
                              onChange={(e) => {
                                const eanVal = e.target.value;
                                setFormData(prev => {
                                  const list = [...prev.variacoes];
                                  list[idx] = { ...list[idx], codigo_barras: eanVal };
                                  return { ...prev, variacoes: list };
                                });
                              }}
                              placeholder="EAN"
                              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                            />
                          </div>
                          {permissions.podeVerPrecoCusto && (
                            <div>
                              <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: temaCores.textoSecundario }}>
                                Custo (R$)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={v.preco_custo ?? ''}
                                onChange={(e) => {
                                  const c = e.target.value ? parseFloat(e.target.value) : null;
                                  setFormData(prev => {
                                    const list = [...prev.variacoes];
                                    list[idx] = { ...list[idx], preco_custo: c };
                                    return { ...prev, variacoes: list };
                                  });
                                }}
                                placeholder="0,00"
                                className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right"
                                style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                              />
                            </div>
                          )}
                          <div>
                            <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: temaCores.textoSecundario }}>
                              Atacado (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={v.preco_venda_atacado ?? ''}
                              onChange={(e) => {
                                const pa = e.target.value ? parseFloat(e.target.value) : null;
                                setFormData(prev => {
                                  const list = [...prev.variacoes];
                                  list[idx] = { ...list[idx], preco_venda_atacado: pa };
                                  return { ...prev, variacoes: list };
                                });
                              }}
                              placeholder="Opcional"
                              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: temaCores.textoSecundario }}>
                              Distribuidor (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={v.preco_venda_autoatacado ?? ''}
                              onChange={(e) => {
                                const pd = e.target.value ? parseFloat(e.target.value) : null;
                                setFormData(prev => {
                                  const list = [...prev.variacoes];
                                  list[idx] = { ...list[idx], preco_venda_autoatacado: pd };
                                  return { ...prev, variacoes: list };
                                });
                              }}
                              placeholder="Opcional"
                              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: temaCores.textoSecundario }}>
                              Promoção (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={v.preco_promocional ?? ''}
                              onChange={(e) => {
                                const pp = e.target.value ? parseFloat(e.target.value) : null;
                                setFormData(prev => {
                                  const list = [...prev.variacoes];
                                  list[idx] = { ...list[idx], preco_promocional: pp };
                                  return { ...prev, variacoes: list };
                                });
                              }}
                              placeholder="Opcional"
                              className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-right"
                              style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Botão + Adicionar Variação */}
                  <button
                    type="button"
                    onClick={() => {
                      const nova: Partial<VariacaoProduto> = {
                        id: Date.now().toString(),
                        valor_variacao_1: '',
                        valor_variacao_2: '',
                        combinacao_nome: '',
                        quantidade_estoque: 0,
                        preco_venda_varejo: parseFloat(formData.precoVenda.replace(',', '.')) || 0,
                        codigo_barras: '',
                        sku: ''
                      };
                      setFormData(prev => ({
                        ...prev,
                        variacoes: [...prev.variacoes, nova]
                      }));
                    }}
                    className="w-full py-2.5 px-3 rounded-xl border border-dashed border-emerald-500/60 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-500/10 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar Variação</span>
                  </button>

                  {/* Resumo da soma de estoque das variações */}
                  {formData.variacoes.length > 0 && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                      <span className="font-semibold">Estoque Total Sincronizado:</span>
                      <span className="font-black text-xs">
                        {formData.variacoes.reduce((acc, item) => acc + (Number(item.quantidade_estoque) || 0), 0)} {(formData.unidadeMedida || formData.tipoUnidade || 'un').toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* SEÇÃO 6: DIMENSÕES E PESO PARA ENVIO (MELHOR ENVIO / CORREIOS / JADLOG) */}
            {formData.tipoItem !== 'servico' && (
              <div
                className="p-4 border rounded-2xl space-y-3.5 shadow-sm"
                style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: temaCores.textoPrincipal }}>
                      <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>6. Dimensões e Peso para Envio</span>
                    </span>
                    <p className="text-sm leading-relaxed mt-0.5" style={{ color: temaCores.textoSecundario }}>
                      Melhor Envio / Correios / Jadlog / Uber Direct
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={detectandoDimensoes}
                    onClick={async () => {
                      if (!formData.nome.trim() && !formData.descricao.trim()) {
                        setMensagemFeedback({ texto: 'Informe o Nome ou Descrição do produto primeiro.', tipo: 'erro' });
                        return;
                      }

                      setDetectandoDimensoes(true);
                      try {
                        const catNome = mapaCategorias.get(formData.categoriaId);
                        const res = await estimarDimensoesEPesoProduto(formData.nome, formData.descricao, catNome, loja);

                        setFormData(prev => ({
                          ...prev,
                          pesoKg: res.peso_kg != null ? String(res.peso_kg) : prev.pesoKg,
                          alturaCm: res.altura_cm != null ? String(res.altura_cm) : prev.alturaCm,
                          larguraCm: res.largura_cm != null ? String(res.largura_cm) : prev.larguraCm,
                          comprimentoCm: res.comprimento_cm != null ? String(res.comprimento_cm) : prev.comprimentoCm
                        }));
                        setMensagemFeedback({ texto: '✨ Medidas e peso de envio preenchidos com IA!', tipo: 'sucesso' });
                      } catch (err: any) {
                        console.error('Erro ao estimar medidas com IA:', err);
                        setFormData(prev => ({
                          ...prev,
                          pesoKg: prev.pesoKg || '0.35',
                          alturaCm: prev.alturaCm || '4',
                          larguraCm: prev.larguraCm || '12',
                          comprimentoCm: prev.comprimentoCm || '17'
                        }));
                        setMensagemFeedback({ texto: 'Medidas padrão de envio aplicadas com sucesso!', tipo: 'sucesso' });
                      } finally {
                        setDetectandoDimensoes(false);
                      }
                    }}
                    className="hubi-btn-neutral inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-500/30 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
                    title="Detectar medidas e peso com inteligência artificial"
                  >
                    {detectandoDimensoes ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-spin shrink-0" />
                        <span>Estimando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Auto-detectar IA</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                      Peso (kg)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 0.350"
                      value={formData.pesoKg || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, pesoKg: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                      style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                      Altura (cm)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 4"
                      value={formData.alturaCm || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, alturaCm: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                      style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                      Largura (cm)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 12"
                      value={formData.larguraCm || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, larguraCm: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                      style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase block mb-1" style={{ color: temaCores.textoSecundario }}>
                      Comprimento (cm)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 17"
                      value={formData.comprimentoCm || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, comprimentoCm: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                      style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CORPO DA ABA ESTOQUE (TELA007) */}
        {abaFormulario === 'estoque' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Gerenciar Estoque Switch */}
              <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-[#1E293B]">
                <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">Gerenciar estoque</span>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, gerenciarEstoque: !prev.gerenciarEstoque }))}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 cursor-pointer ${
                    formData.gerenciarEstoque ? 'bg-emerald-500 dark:bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                    formData.gerenciarEstoque ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Display Central Grande de Estoque */}
              <div
                className="flex flex-col items-center justify-center py-8 text-center rounded-2xl border p-6 shadow-sm"
                style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard }}
              >
                <span className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: temaCores.textoSecundario }}>
                  Estoque atual
                </span>
                <span className={`text-6xl sm:text-7xl font-black tracking-tight ${
                  formData.quantidadeEstoque < 0 ? 'text-rose-500' : ''
                }`} style={formData.quantidadeEstoque < 0 ? undefined : { color: temaCores.textoPrincipal }}>
                  {formData.quantidadeEstoque}
                </span>
                <span className="text-xs mt-3 font-semibold" style={{ color: temaCores.textoSecundario }}>
                  Atualizado em {formatarDataLocal(new Date())} às {formatarHoraLocal(new Date(), { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Botões de Ação de Estoque */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setTelaAtiva('movimentacoes')}
                  className="w-full p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer"
                  style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard, color: temaCores.textoPrincipal }}
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
                  className="w-full p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer"
                  style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard, color: temaCores.textoPrincipal }}
                >
                  <span>Estoque mínimo: {formData.estoqueMinimo}</span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>

                <div
                  className="w-full p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-bold shadow-sm"
                  style={{ backgroundColor: temaCores.bgCard, borderColor: temaCores.bordaCard, color: temaCores.textoPrincipal }}
                >
                  <div>
                    <span className="block">Data de Validade (Opcional)</span>
                    <span className="text-sm leading-relaxed font-normal" style={{ color: temaCores.textoSecundario }}>Para perecíveis / cosméticos</span>
                  </div>
                  <input
                    type="date"
                    value={formData.dataValidade || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, dataValidade: e.target.value }))}
                    className="p-2 border rounded-xl text-xs font-semibold focus:outline-none focus:border-emerald-500"
                    style={{ backgroundColor: temaCores.bgInput, borderColor: temaCores.bordaInput, color: temaCores.textoInput }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Botão Inferior Salvar / Adicionar */}
        {permissions.podeCadastrarAlterarProdutos && (
          <div
            className="p-4 border-t shrink-0"
            style={{ backgroundColor: temaCores.bgRodape, borderColor: temaCores.bordaRodape }}
          >
            <button
              type="button"
              disabled={salvandoProduto}
              onClick={() => {
                void salvarProduto(false);
              }}
              className="hubi-btn-cta w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-sm sm:text-base"
            >
              {salvandoProduto ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>{isNovo ? 'Adicionar produto' : 'Salvar Alterações'}</span>
              )}
            </button>
          </div>
        )}

        {/* MODAL DE OPÇÕES DE FOTO (CÂMERA / GALERIA / GERENCIADOR) */}
        {modalOpcoesFotoAberto && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center">
            <div className="bg-white dark:bg-black border-t border-slate-200 dark:border-slate-800 rounded-t-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-black text-sm sm:text-base text-slate-800 dark:text-slate-100">Foto do Produto</h3>
                <button
                  type="button"
                  onClick={() => setModalOpcoesFotoAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpcoesFotoAberto(false);
                    abrirCameraCaptura('produto');
                  }}
                  className="w-full p-4 rounded-2xl bg-emerald-50 dark:bg-black text-emerald-800 dark:text-emerald-300 font-extrabold text-xs sm:text-sm flex items-center gap-3 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-slate-900 transition shadow-sm cursor-pointer active:scale-98"
                >
                  <Camera className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Tirar Foto com a Câmera</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fileInputGaleriaRef.current?.click();
                  }}
                  className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-black text-slate-800 dark:text-slate-200 font-extrabold text-xs sm:text-sm flex items-center gap-3 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 transition shadow-sm cursor-pointer active:scale-98"
                >
                  <ImageIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  <span>Escolher da Galeria do Celular</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalOpcoesFotoAberto(false);
                    handleAbrirPesquisaFotos();
                  }}
                  className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-black text-slate-800 dark:text-slate-200 font-extrabold text-xs sm:text-sm flex items-center gap-3 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 transition shadow-sm cursor-pointer active:scale-98"
                >
                  <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Pesquisar Fotos na Internet (Google)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalOpcoesFotoAberto(false);
                    setModalGaleriaFotosAberto(true);
                  }}
                  className="w-full p-4 rounded-2xl bg-white dark:bg-black border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-extrabold text-xs sm:text-sm flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition cursor-pointer"
                >
                  <Tag className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  <span>Gerenciar Fotos do Produto ({formData.fotos.length}/7)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CÂMERA AO VIVO IN-APP UNIFICADO (ANTI-OOM) */}
        <ModalCameraCapturaMobile
          isOpen={modoCameraCaptura !== null}
          onClose={fecharCameraCaptura}
          onCapturar={handleFotoCapturadaMobile}
          titulo={modoCameraCaptura === 'ia' ? 'Cadastrar Produto com Foto (IA)' : 'Fotografar Produto'}
          subtitulo={
            modoCameraCaptura === 'ia'
              ? 'Tire uma foto nítida para a IA identificar o produto'
              : 'Enquadre o produto na guia'
          }
          overlayId="modal-camera-captura-produtos-mobile"
        />

        {/* Modal Cor da Etiqueta / Tarja (TELA013) com Opção Individual vs Todos os Produtos da Loja */}
        {modalCorEtiquetaAberto && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-200 text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1E293B] pb-3">
                <div>
                  <h3 className="font-black text-sm sm:text-base text-black dark:text-white">Cor da Tarja Inferior</h3>
                  <p className="text-sm leading-relaxed text-black dark:text-slate-300 font-semibold">Selecione o tom desejado</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalCorEtiquetaAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
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
                    className={`h-14 rounded-2xl shadow-sm border transition active:scale-95 flex items-center justify-center cursor-pointer ${
                      corSelecionadaModal === cor ? 'border-4 border-slate-900 dark:border-white scale-105 shadow-md' : 'border-black/10'
                    }`}
                    style={{ backgroundColor: cor }}
                  >
                    {corSelecionadaModal === cor && <Check className="w-6 h-6 text-white drop-shadow-md stroke-[3]" />}
                  </button>
                ))}
              </div>

              {/* Opção de Escopo: Apenas este produto VS Todos os produtos da Loja */}
              <div className="bg-slate-50 dark:bg-[#0B0F17] p-3.5 rounded-2xl border border-slate-200 dark:border-[#1E293B] space-y-2.5">
                <label className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Onde aplicar a cor?
                </label>

                <div className="space-y-2">
                  <label
                    onClick={() => setAplicarCorEmMassa(false)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      !aplicarCorEmMassa ? 'bg-white dark:bg-[#000000] border-emerald-500 shadow-sm text-slate-800 dark:text-slate-200' : 'border-transparent text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="escopo_cor"
                        checked={!aplicarCorEmMassa}
                        onChange={() => setAplicarCorEmMassa(false)}
                        className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-bold">Apenas neste produto</span>
                    </div>
                  </label>

                  <label
                    onClick={() => setAplicarCorEmMassa(true)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      aplicarCorEmMassa ? 'bg-white dark:bg-[#000000] border-emerald-500 shadow-sm text-slate-800 dark:text-slate-200' : 'border-transparent text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="escopo_cor"
                        checked={aplicarCorEmMassa}
                        onChange={() => setAplicarCorEmMassa(true)}
                        className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="text-sm font-black text-black dark:text-slate-200 block">Todos os produtos da loja</span>
                        <span className="text-sm leading-relaxed text-black dark:text-slate-300 font-medium block">Define como padrão para todo o catálogo</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-extrabold uppercase">
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
                  className="flex-1 py-3.5 rounded-2xl border border-slate-200 dark:border-[#1E293B] text-xs font-extrabold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#0D111A] cursor-pointer"
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
                  className="hubi-btn-cta flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-black shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-3xl w-full max-w-xs p-6 shadow-2xl space-y-4 text-left">
              <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white">Atenção</h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">Deseja clonar este produto?</p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalClonarAberto(false)}
                  className="px-3 py-2 text-xs font-extrabold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 uppercase cursor-pointer"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={executarClonagem}
                  className="px-4 py-2 text-xs font-black text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 uppercase cursor-pointer"
                >
                  Sim
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Seletor de Unidade de Medida (Tabela unidades_medida + UNIDADES_PADRAO) */}
        {modalUnidadeMedidaAberto && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200 text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1E293B] pb-3 shrink-0">
                <div>
                  <h3 className="font-black text-sm sm:text-base text-slate-800 dark:text-white">Unidade de Medida</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Selecione como este item é vendido</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalUnidadeMedidaAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                {unidadesLista.map((u) => {
                  const selecionada = (formData.unidadeMedida || formData.tipoUnidade || 'un').toLowerCase() === u.sigla.toLowerCase();
                  return (
                    <button
                      key={u.sigla}
                      type="button"
                      onClick={() => {
                        const siglaLower = u.sigla.toLowerCase();
                        const tipoCoerced: TipoUnidade =
                          siglaLower === 'kg' || siglaLower === 'g'
                            ? 'kg'
                            : siglaLower === 'l' || siglaLower === 'ml'
                              ? 'l'
                              : siglaLower === 'm'
                                ? 'm'
                                : 'un';
                        setFormData(prev => ({
                          ...prev,
                          unidadeMedida: siglaLower,
                          tipoUnidade: tipoCoerced,
                          vendaPorPeso: ['kg', 'g', 'l', 'ml', 'm'].includes(siglaLower) ? true : prev.vendaPorPeso
                        }));
                        setModalUnidadeMedidaAberto(false);
                      }}
                      className={`w-full p-3.5 rounded-2xl text-left text-xs sm:text-sm font-extrabold flex items-center justify-between transition border cursor-pointer ${
                        selecionada
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-500'
                          : 'bg-white dark:bg-[#000000] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#1E293B] hover:bg-slate-50 dark:hover:bg-[#0D111A]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 text-center font-mono font-black text-xs uppercase px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {u.sigla.toUpperCase()}
                        </span>
                        <span>{u.nome}</span>
                      </div>
                      {selecionada && <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MODAL RADAR DE PREÇOS DE MERCADO (IA GEMINI) */}
        {modalRadarAberto && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
            <div className="bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200 text-slate-900 dark:text-slate-100">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1E293B] pb-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-500 to-indigo-500 flex items-center justify-center text-white shadow-sm">
                    <Zap className="w-5 h-5 fill-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">Radar de Preços</h3>
                      <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 px-1.5 py-0.5 rounded-full font-bold">
                        IA Gemini
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
                      {formData.nome ? `Pesquisa para: "${formData.nome}"` : 'Pesquisa de mercado'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalRadarAberto(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-[#0D111A] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Corpo */}
              <div className="overflow-y-auto flex-1 space-y-3 pr-0.5">
                {buscandoMercado ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                    <SpinnerPesquisandoIA
                      texto="Pesquisando"
                      subtexto={`Consultando valores praticados no mercado para "${formData.nome}"...`}
                    />
                  </div>
                ) : erroMercado ? (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl space-y-2 text-center">
                    <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
                    <p className="text-xs text-rose-800 dark:text-rose-300 font-bold">{erroMercado}</p>
                    <button
                      type="button"
                      onClick={buscarConcorrentesMercado}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
                    >
                      Tentar Novamente
                    </button>
                  </div>
                ) : dadosMercado ? (
                  <div className="space-y-3">
                    {/* Preço Médio Card */}
                    <div className="p-4 bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-[#0B0F17] dark:to-[#000000] border border-emerald-200 dark:border-[#1E293B] rounded-2xl space-y-2.5">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 block">Preço Médio</span>
                          <span className="text-2xl font-black text-slate-900 dark:text-white">R$ {dadosMercado.precoMedio.toFixed(2)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAplicarPrecoMercado(dadosMercado.precoMedio)}
                          className="hubi-btn-cta px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-sm flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Aplicar Sugerido (R$ {Math.floor(dadosMercado.precoMedio).toFixed(2)})</span>
                        </button>
                      </div>

                      {/* Menor e Maior Preço */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60 dark:border-[#1E293B] text-xs">
                        <div className="bg-white/80 dark:bg-[#000000] p-2 rounded-xl border border-emerald-100 dark:border-[#1E293B]">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Menor Preço</span>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-400">R$ {dadosMercado.menorPreco.toFixed(2)}</span>
                        </div>
                        <div className="bg-white/80 dark:bg-[#000000] p-2 rounded-xl border border-indigo-100 dark:border-[#1E293B]">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Maior Preço</span>
                          <span className="font-extrabold text-indigo-900 dark:text-indigo-300">R$ {dadosMercado.maiorPreco.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Lista de Concorrentes */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block px-1">Lojas e Marketplaces Encontrados</span>
                      {dadosMercado.concorrentes.map((conc, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-slate-50 dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-xl flex items-center justify-between hover:bg-slate-100 dark:hover:bg-[#0D111A] transition"
                        >
                          <div className="min-w-0 flex-1 mr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{conc.loja}</span>
                              {conc.url && (
                                <a
                                  href={conc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Ver oferta na fonte"
                                  className="text-slate-400 hover:text-emerald-500 transition-colors shrink-0"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            {conc.tipo && <span className="text-[10px] text-slate-400 block truncate">{conc.tipo}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs text-slate-900 dark:text-white">R$ {conc.preco.toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => handleAplicarPrecoMercado(conc.preco)}
                              className="px-2 py-1 bg-white dark:bg-[#0B0F17] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/60 font-bold text-[10px] rounded-lg transition cursor-pointer"
                            >
                              Aplicar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={buscarConcorrentesMercado}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#0B0F17] dark:hover:bg-[#0D111A] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#1E293B] font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Atualizar Pesquisa</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* MODAL COMPLETO DE PREENCHIMENTO AUTOMÁTICO VIA IA (EQUIPARADO AO DESKTOP) */}
        {modalCriarComIAAberto && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white dark:bg-[#000000] border border-slate-200 dark:border-[#1E293B] rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1E293B] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">Preenchimento com IA</h3>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">Google Gemini Multimodal</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">

                  <button
                    type="button"
                    onClick={() => setModalCriarComIAAberto(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Botão de Destaque: Atualizar Produto com IA (quando em modo de edição) */}
              {produtoEditando && (
                <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-[#0B0F17] dark:to-[#000000] border border-emerald-200/80 dark:border-[#1E293B] rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">Atualizar Produto com IA</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    Pesquisa e enriquece os dados utilizando o nome, descrição atual e fotos cadastradas.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      setModalCriarComIAAberto(false);
                      await handleAtualizarProdutoExistenteIA();
                    }}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-black text-xs shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Atualizar o Produto</span>
                  </button>
                </div>
              )}

              {/* Abas do Modal IA: Foto | Texto/Nome | Código de Barras */}
              <div className="flex bg-slate-100 dark:bg-[#0B0F17] rounded-2xl p-1 gap-1 border border-slate-200 dark:border-[#1E293B]">
                <button
                  type="button"
                  onClick={() => setAbaModalIA('foto')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    abaModalIA === 'foto' ? 'bg-white dark:bg-[#000000] text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Por Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAbaModalIA('texto')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    abaModalIA === 'texto' ? 'bg-white dark:bg-[#000000] text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Por Nome</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAbaModalIA('codigo')}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    abaModalIA === 'codigo' ? 'bg-white dark:bg-[#000000] text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Barcode className="w-3.5 h-3.5" />
                  <span>Por Código</span>
                </button>
              </div>

              {/* Conteúdo Aba Foto */}
              {abaModalIA === 'foto' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    Envie ou tire uma foto do produto para preencher nome, categoria, preço sugerido e descrição comercial completa automaticamente.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setModalCriarComIAAberto(false);
                        abrirCameraCaptura('ia');
                      }}
                      className="p-4 rounded-2xl border-2 border-dashed border-emerald-500/80 dark:border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col items-center justify-center text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 transition cursor-pointer text-center active:scale-95"
                    >
                      <Camera className="w-8 h-8 mb-1.5" />
                      <span className="text-xs font-extrabold">Tirar Foto</span>
                    </button>

                    <label className="p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#1E293B] bg-slate-50 dark:bg-[#000000] flex flex-col items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#0D111A] transition cursor-pointer text-center active:scale-95">
                      <Upload className="w-8 h-8 mb-1.5 text-slate-500 dark:text-slate-400" />
                      <span className="text-xs font-extrabold">Carregar da Galeria</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;

                          setModalCriarComIAAberto(false);
                          let previewGerada: string | undefined;
                          try {
                            const resultado = await comprimirFotoProduto(file, {
                              maxDimension: 1024,
                              quality: 0.78
                            });
                            previewGerada = resultado.previewUrl;
                            registrarPreviewUrl(previewGerada);
                            const payloadVisaoIA = await gerarPayloadBase64IA(resultado.blob);
                            if (resultado.dataUrl) {
                              const urlFinal = await ProdutoService.uploadFotoDataUrl(
                                resultado.dataUrl,
                                loja?.id
                              );
                              registrarPayloadVisaoIA(urlFinal, payloadVisaoIA, resultado.dataUrl);
                              setFormData(prev => ({
                                ...prev,
                                fotos: [urlFinal, ...prev.fotos.filter(f => f !== urlFinal)].slice(0, 7)
                              }));
                              await processarPreenchimentoIA('foto', urlFinal, urlFinal, payloadVisaoIA);
                            }
                          } catch (err: unknown) {
                            const msg =
                              err instanceof Error
                                ? err.message
                                : 'Não foi possível processar a imagem selecionada.';
                            console.error('Erro ao comprimir imagem para IA:', err);
                            setMensagemFeedback({ texto: msg, tipo: 'erro' });
                          } finally {
                            revogarPreviewUrl(previewGerada);
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    Digite o nome ou uma breve descrição do item (ex: <em>"Cerveja Heineken Long Neck 330ml"</em>).
                  </p>

                  <div className="relative">
                    <input
                      type="text"
                      value={promptTextoIA}
                      onChange={(e) => setPromptTextoIA(e.target.value)}
                      placeholder="Ex: Camiseta Algodão Básica Preta"
                      className="w-full pl-3 pr-10 py-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#000000] text-xs sm:text-sm font-semibold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => alternarPesquisaPorVoz(setPromptTextoIA)}
                      className="absolute right-2 top-2.5 p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={processandoIA || !promptTextoIA.trim()}
                    onClick={() => processarPreenchimentoIA('texto')}
                    className="hubi-btn-cta w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {processandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Preencher Dados via IA</span>
                  </button>
                </div>
              )}

              {/* Conteúdo Aba Código de Barras */}
              {abaModalIA === 'codigo' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
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
                    className="hubi-btn-neutral w-full py-3.5 rounded-2xl bg-emerald-50 dark:bg-[#0B0F17] border border-emerald-300 dark:border-[#1E293B] text-emerald-800 dark:text-emerald-300 font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-emerald-100 dark:hover:bg-[#0D111A] transition cursor-pointer shadow-sm active:scale-98"
                  >
                    <Camera className="w-5 h-5 text-black dark:text-emerald-400" />
                    <span>Ler Código com a Câmera</span>
                  </button>

                  <div className="relative flex items-center justify-center my-2">
                    <div className="border-t border-slate-200 dark:border-[#1E293B] w-full" />
                    <span className="bg-white dark:bg-[#000000] px-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider absolute">OU</span>
                  </div>

                  <input
                    type="text"
                    value={promptCodigoIA}
                    onChange={(e) => setPromptCodigoIA(e.target.value)}
                    placeholder="Digite o código (ex: 7891000100103)"
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#000000] text-xs sm:text-sm font-semibold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />

                  <button
                    type="button"
                    disabled={processandoIA || !promptCodigoIA.trim()}
                    onClick={() => processarPreenchimentoIA('codigo')}
                    className="hubi-btn-cta w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {processandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Consultar Código via IA</span>
                  </button>
                </div>
              )}

              {processandoIA && (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-[#0B0F17] border border-emerald-200 dark:border-[#1E293B] text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold leading-snug">Consultando inteligência artificial e gerando descrição comercial...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL DE PESQUISA DE FOTOS NA INTERNET */}
        <ModalPesquisaFotosInternet
          isOpen={modalFotosInternetAberto}
          onClose={() => setModalFotosInternetAberto(false)}
          nomeInicial={formData.nome}
          codigoBarrasInicial={formData.codigoBarras}
          fotosAtuaisCount={formData.fotos.length}
          maxFotos={7}
          fotoReferencia={formData.fotos[0] || undefined}
          fotoReferenciaBase64={obterPayloadVisaoIAParaUrl(formData.fotos[0])}
          segmentoLoja={segmentoLoja}
          loja={loja}
          onAbrirConfiguracaoChave={() => setModalOnboardingSerpApiAberto(true)}
          onAdicionarFotos={(novasFotos) => {
            setFormData(prev => {
              const fotosAtualizadas = [...prev.fotos];
              for (const foto of novasFotos) {
                if (!fotosAtualizadas.includes(foto) && fotosAtualizadas.length < 7) {
                  fotosAtualizadas.push(foto);
                }
              }
              return {
                ...prev,
                fotos: fotosAtualizadas
              };
            });
            setMensagemFeedback({
              texto: `${novasFotos.length} foto(s) adicionada(s) à galeria!`,
              tipo: 'sucesso'
            });
          }}
        />

        {/* MODAL MERCADO LIVRE (VINCULAR / PUBLICAR ANÚNCIO) */}
        <ModalVincularAnuncioMl
          aberto={Boolean(produtoMlModal)}
          onFechar={() => setProdutoMlModal(null)}
          produto={produtoMlModal}
          lojaId={loja?.id || ''}
          isDark={isDark}
          onSucesso={(info) => {
            if (info?.gtinSincronizado) {
              const gtinSync = info.gtinSincronizado;
              setFormData((prev) => ({ ...prev, codigoBarras: gtinSync }));
              setProdutoEditando((prev) =>
                prev ? { ...prev, codigo_barras: gtinSync } : prev
              );
            }
            onRecarregarAnunciosMl?.();
            void onRecarregar();
          }}
        />

        <ModalConectarMercadoLivre
          aberto={modalConectarMlAberto}
          onFechar={() => setModalConectarMlAberto(false)}
          lojaId={loja?.id || ''}
          nomeLoja={loja?.nome_fantasia}
        />

        {/* MODAL ONBOARDING SERPAPI (BYOK) */}
        <ModalOnboardingSerpApi
          isOpen={modalOnboardingSerpApiAberto}
          onClose={() => setModalOnboardingSerpApiAberto(false)}
          loja={loja}
          onChaveSalvaComSucesso={(novaChave) => {
            if (loja) {
              setLoja({
                ...loja,
                serper_api_key: novaChave
              });
            }
            setModalFotosInternetAberto(true);
          }}
        />

        {/* MODAL DE DÚVIDA DA IA ENTRE MÚLTIPLOS PRODUTOS */}
        <ModalDuvidaProdutoIA
          isOpen={modalDuvidaAberto}
          onClose={() => setModalDuvidaAberto(false)}
          opcoes={opcoesDuvidaIA}
          fotoUrl={fotoTemporariaDuvida || formData.fotos[0]}
          loja={loja}
          onSelecionarOpcao={(opcaoEscolhida) => {
            void (async () => {
              await aplicarSugestaoMobile(opcaoEscolhida, fotoTemporariaDuvida || undefined);
              setMensagemFeedback({
                texto: `Produto "${opcaoEscolhida.nome}" preenchido com sucesso!`,
                tipo: 'sucesso'
              });
              if (!produtoEditando?.id) {
                const nomeIdentificado = (opcaoEscolhida as { nome_identificado?: string }).nome_identificado || opcaoEscolhida.nome || '';
                const resDup = buscarProdutoDuplicado(produtos, {
                  nome: nomeIdentificado,
                  codigoBarras: opcaoEscolhida.codigo_barras
                });
                if (resDup.encontrado && resDup.produto && resDup.motivo) {
                  setDuplicadoModal({
                    produto: resDup.produto,
                    motivo: resDup.motivo,
                    origem: 'ia',
                    fotoCapturada: fotoTemporariaDuvida || formData.fotos[0]
                  });
                }
              }
            })();
          }}
        />

        {/* MODAL ANTI-DUPLICIDADE DE PRODUTO */}
        <ModalProdutoDuplicado
          isOpen={Boolean(duplicadoModal)}
          produtoExistente={duplicadoModal?.produto || null}
          motivo={duplicadoModal?.motivo || 'nome_similar'}
          categoriaNome={
            duplicadoModal?.produto?.categoria_id
              ? mapaCategorias.get(duplicadoModal.produto.categoria_id)
              : undefined
          }
          onAtualizarExistente={(prodExistente) => {
            const fotoNova = formData.fotos[0] || duplicadoModal?.fotoCapturada;
            setDuplicadoModal(null);
            abrirEditarProduto(prodExistente, 'cadastro');
            if ((!prodExistente.fotos_urls || prodExistente.fotos_urls.length === 0) && fotoNova) {
              setFormData(prev => ({
                ...prev,
                fotos: prev.fotos.length > 0 ? prev.fotos : [fotoNova]
              }));
            }
          }}
          onCadastrarNovo={() => {
            const nomeAlvo = (formData.nome || '').trim();
            const eanAlvo = (formData.codigoBarras || '').trim();
            duplicidadeConfirmadaChaveRef.current = `${normalizarTextoProduto(nomeAlvo)}::${eanAlvo}`;
            const origem = duplicadoModal?.origem;
            setDuplicadoModal(null);
            if (origem === 'salvar') {
              void salvarProduto(true);
            }
          }}
          onCancelar={() => setDuplicadoModal(null)}
        />

        {/* SPINNER PESQUISANDO CENTRALIZADO DURANTE AÇÕES DE IA */}
        {processandoIA && (
          <SpinnerPesquisandoIA
            fullScreen
            texto="Pesquisando"
            subtexto={mensagemStatusIA || 'Processando informações com Inteligência Artificial...'}
          />
        )}
      </div>
    );
  }

  const voltarMobile = () => {
    if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/pos');
    }
  };

  // =========================================================================
  // TELA 001 & TELA 002: LISTA PRINCIPAL DE PRODUTOS E ESTOQUE MOBILE
  // =========================================================================
  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-[#08131A] text-black dark:text-white overflow-hidden select-none relative">
      {renderToast()}

      {/* Header Superior Mobile Unificado (TELA001 / TELA002) */}
      <MobileHeader
        titulo={`Produtos (${produtos.length})`}
        onVoltar={voltarMobile}
      />

      {/* Abas Superiores: ITENS (TELA001) | ESTOQUE (TELA002) */}
      <div className="flex bg-transparent border-b border-slate-300 dark:border-slate-700 shrink-0">
        <button
          type="button"
          onClick={() => {
            setAbaLista('itens');
            setBuscaAtiva(false);
          }}
          className={`flex-1 py-3.5 text-xs sm:text-sm uppercase tracking-wider transition relative cursor-pointer ${
            abaLista === 'itens'
              ? 'text-emerald-700 dark:text-emerald-400 font-extrabold border-b-2 border-emerald-500'
              : 'text-black dark:text-slate-300 hover:text-black dark:hover:text-white font-bold'
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
          className={`flex-1 py-3.5 text-xs sm:text-sm uppercase tracking-wider transition relative cursor-pointer ${
            abaLista === 'estoque'
              ? 'text-emerald-700 dark:text-emerald-400 font-extrabold border-b-2 border-emerald-500'
              : 'text-black dark:text-slate-300 hover:text-black dark:hover:text-white font-bold'
          }`}
        >
          Estoque
        </button>
      </div>

      {/* Barra de Busca com Pesquisa por Voz (TELA001 / TELA002 / TELA003) */}
      <div className="px-4 py-3 border-b border-slate-300 dark:border-slate-700 bg-white dark:bg-[#000000] flex items-center gap-3 shrink-0">
        {buscaAtiva ? (
          // Busca Ativa (TELA003)
          <div className="flex-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBusca('');
                setBuscaAtiva(false);
              }}
              className="p-1 text-slate-500 hover:text-black dark:text-slate-400 dark:hover:text-white cursor-pointer"
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
              className="flex-1 py-1.5 text-xs sm:text-sm font-bold text-black dark:text-white placeholder-slate-400 border-none bg-transparent focus:outline-none"
            />
            {/* Ícone de Microfone / Pesquisa por Voz */}
            <button
              type="button"
              onClick={() => alternarPesquisaPorVoz(setBusca)}
              className={`p-2 rounded-xl transition cursor-pointer ${
                ouvindoVoz ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white'
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
            className="flex-1 flex items-center justify-between text-slate-500 dark:text-slate-400 py-1.5 px-3 bg-slate-100 dark:bg-[#000000] rounded-xl border-2 border-slate-300 dark:border-slate-700 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span className="text-xs sm:text-sm font-bold text-black dark:text-white">Item ou código</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBuscaAtiva(true);
                alternarPesquisaPorVoz(setBusca);
              }}
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white cursor-pointer"
              title="Pesquisar por voz"
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Botões de Ação da Direita: Filtros e '+' */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setTelaAtiva('filtros')}
            className={`p-2 rounded-xl transition relative cursor-pointer ${
              qtdFiltrosAtivos > 0
                ? 'text-white bg-emerald-600 border border-emerald-500 shadow-md font-bold'
                : 'text-black dark:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent'
            }`}
            title="Filtros"
          >
            <Filter className="w-5 h-5" />
            {qtdFiltrosAtivos > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-emerald-800 font-black text-[9px] flex items-center justify-center shadow-xs">
                {qtdFiltrosAtivos}
              </span>
            )}
          </button>

          {abaLista === 'itens' && permissions.podeCadastrarAlterarProdutos && (
            <button
              type="button"
              onClick={abrirNovoProduto}
              className="p-2 text-emerald-700 dark:text-emerald-400 hover:opacity-80 font-black transition cursor-pointer"
              title="Novo Produto"
            >
              <Plus className="w-6 h-6" />
            </button>
          )}

          {abaLista === 'estoque' && permissions.podeGerenciarEstoque && (
            <button
              type="button"
              onClick={() => {
                setProdutoEntradaAlvo(null);
                setModalEntradaAberto(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#000000] hover:bg-slate-50 dark:hover:bg-slate-900 text-emerald-700 dark:text-emerald-400 border-2 border-emerald-400 dark:border-emerald-500 font-bold text-xs transition cursor-pointer shadow-xs"
              title="Entrada / Ajuste de Estoque"
            >
              <PackagePlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Entrada</span>
            </button>
          )}
        </div>
      </div>

      {/* Ação rápida: Publicação em Massa no Mercado Livre (Mobile) */}
      {abaLista === 'itens' && permissions.podeCadastrarAlterarProdutos && onAbrirPublicarMassaMl && (
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#08131A] flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={() => {
              const catInicial =
                categoriasPrincipaisFiltro.find((c) =>
                  c.todosIds.some((id) => categoriasFiltro.includes(id))
                )?.id || null;
              onAbrirPublicarMassaMl(catInicial);
            }}
            className="hubi-btn-neutral inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold transition cursor-pointer shadow-2xs"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-black" />
            <span>Publicar em Massa no ML</span>
          </button>
        </div>
      )}

      {/* Chips dos Filtros Ativos com 'X' para Desmarcar Imediatamente */}
      {qtdFiltrosAtivos > 0 && (
        <div className="bg-slate-100 dark:bg-[#08131A] border-b border-slate-300 dark:border-slate-700 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
          <span className="text-[10px] font-black text-black dark:text-slate-300 uppercase tracking-wider shrink-0 mr-0.5">
            Filtros:
          </span>

          {categoriasPrincipaisFiltro
            .filter(cat => cat.todosIds.some(id => categoriasFiltro.includes(id)))
            .map((catPrincipal) => {
              return (
                <div
                  key={catPrincipal.id}
                  className={`text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shrink-0 font-bold ${
                    isDark
                      ? 'bg-[#000000] text-emerald-400 border border-emerald-500/50'
                      : 'bg-white text-emerald-800 border-2 border-emerald-300'
                  }`}
                >
                  <span className="truncate max-w-[120px]">
                    {catPrincipal.icone ? `${catPrincipal.icone} ` : ''}{catPrincipal.nome}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCategoriasFiltro(prev => prev.filter(id => !catPrincipal.todosIds.includes(id)))}
                    className="p-0.5 rounded-full hover:opacity-80 transition cursor-pointer"
                    title={`Remover filtro ${catPrincipal.nome}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

          {filtroSemEstoque && (
            <div className={`text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shrink-0 font-bold ${
              isDark
                ? 'bg-[#000000] text-rose-400 border border-rose-500/50'
                : 'bg-white text-rose-800 border-2 border-rose-300'
            }`}>
              <span>Sem estoque 🔴</span>
              <button
                type="button"
                onClick={() => setFiltroSemEstoque(false)}
                className="p-0.5 rounded-full hover:opacity-80 transition cursor-pointer"
                title="Remover filtro sem estoque"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {filtroMinimo && (
            <div className={`text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shrink-0 font-bold ${
              isDark
                ? 'bg-[#000000] text-amber-400 border border-amber-500/50'
                : 'bg-white text-amber-800 border-2 border-amber-300'
            }`}>
              <span>Mínimo 🟡</span>
              <button
                type="button"
                onClick={() => setFiltroMinimo(false)}
                className="p-0.5 rounded-full hover:opacity-80 transition cursor-pointer"
                title="Remover filtro estoque mínimo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {filtroAcimaMinimo && (
            <div className={`text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shrink-0 font-bold ${
              isDark
                ? 'bg-[#000000] text-emerald-400 border border-emerald-500/50'
                : 'bg-white text-emerald-800 border-2 border-emerald-300'
            }`}>
              <span>Acima do mínimo</span>
              <button
                type="button"
                onClick={() => setFiltroAcimaMinimo(false)}
                className="p-0.5 rounded-full hover:opacity-80 transition cursor-pointer"
                title="Remover filtro acima do mínimo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {filtroSemControle && (
            <div className={`text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shrink-0 font-bold ${
              isDark
                ? 'bg-[#000000] text-white border border-slate-700'
                : 'bg-white text-black border-2 border-slate-300'
            }`}>
              <span>Sem controle</span>
              <button
                type="button"
                onClick={() => setFiltroSemControle(false)}
                className="p-0.5 rounded-full hover:opacity-80 transition cursor-pointer"
                title="Remover filtro sem controle"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {filtroAtivo !== 'todos' && (
            <div className={`text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shrink-0 font-bold ${
              isDark
                ? 'bg-[#000000] text-teal-400 border border-teal-500/50'
                : 'bg-white text-teal-900 border-2 border-teal-300'
            }`}>
              <span>{filtroAtivo === 'ativos' ? 'Ativos' : 'Inativos'}</span>
              <button
                type="button"
                onClick={() => setFiltroAtivo('todos')}
                className="p-0.5 rounded-full hover:opacity-80 transition cursor-pointer"
                title="Remover filtro status"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {filtroTipoItem !== 'todos' && (
            <div className={`text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shrink-0 font-bold ${
              isDark
                ? 'bg-[#000000] text-indigo-400 border border-indigo-500/50'
                : 'bg-white text-indigo-900 border-2 border-indigo-300'
            }`}>
              <span>{filtroTipoItem === 'servico' ? 'Serviços' : 'Produtos'}</span>
              <button
                type="button"
                onClick={() => setFiltroTipoItem('todos')}
                className="p-0.5 rounded-full hover:opacity-80 transition cursor-pointer"
                title="Remover filtro tipo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {filtroMl !== 'todos' && (
            <div className={`text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shrink-0 font-bold ${
              isDark
                ? 'bg-[#000000] text-amber-300 border border-amber-500/50'
                : 'bg-[#FFE600] text-slate-950 border-2 border-amber-500'
            }`}>
              <span>{filtroMl === 'publicados' ? 'Publicados ML' : 'Sem Vínculo ML'}</span>
              <button
                type="button"
                onClick={() => setFiltroMl('todos')}
                className="p-0.5 rounded-full hover:opacity-80 transition cursor-pointer"
                title="Remover filtro ML"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setCategoriasFiltro([]);
              setFiltroSemEstoque(false);
              setFiltroMinimo(false);
              setFiltroAcimaMinimo(false);
              setFiltroSemControle(false);
              setFiltroAtivo('todos');
              setFiltroMl('todos');
              setFiltroTipoItem('todos');
            }}
            className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline ml-1 shrink-0 cursor-pointer transition"
            title="Limpar todos os filtros"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Lista de Produtos (TELA001 ou TELA002) */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 pb-40">
        {carregando ? (
          <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 dark:text-emerald-400" />
            <span className="font-bold">Carregando produtos...</span>
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-xs space-y-3">
            <Tag className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-600" />
            <p className="font-bold text-sm text-black dark:text-white">Nenhum produto encontrado.</p>
          </div>
        ) : (
          produtosFiltrados.map((p) => {
            const estoque = getEstoqueReal(p);
            const catNome = (p.categoria_id && mapaCategorias.get(p.categoria_id)) || 'SEM CATEGORIA';
            const temPromocao = Boolean(p.promocao_ativa && p.preco_promocional && Number(p.preco_promocional) > 0);
            const precoExibicao = temPromocao ? Number(p.preco_promocional) : Number(p.preco_venda_varejo || 0);

            // Visualização da Aba ITENS (TELA001)
            if (abaLista === 'itens') {
              return (
                <div
                  key={p.id}
                  onClick={() => abrirEditarProduto(p, 'cadastro')}
                  className="p-4 flex items-center justify-between bg-white dark:bg-[#000000] hover:bg-slate-50 dark:hover:bg-slate-900/60 transition cursor-pointer"
                >
                  {/* Container Esquerda: Informações com flex-1 min-w-0 pr-2 */}
                  <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-2">
                    {/* Thumbnail / Foto */}
                    <div className="w-12 h-12 rounded-xl border-2 border-slate-300 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0 shadow-xs bg-slate-100 dark:bg-[#000000]">
                      {p.fotos_urls && p.fotos_urls[0] ? (
                        <img src={p.fotos_urls[0]} alt={p.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-center select-none">
                          <span className="text-[10px] sm:text-xs font-medium text-center leading-tight select-none">Sem foto</span>
                        </div>
                      )}
                    </div>

                    {/* Nome e Descrição com até 2 linhas */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.destaque && <span className="text-amber-400 font-bold text-xs">⭐</span>}
                        <h2 className="text-sm font-bold text-black dark:text-white uppercase line-clamp-2 leading-snug">
                          {p.nome}
                        </h2>
                        {p.tipo_item === 'servico' && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-indigo-100 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40 shrink-0">
                            Serviço
                          </span>
                        )}
                        {Boolean(mapaAnunciosMl[p.id] && mapaAnunciosMl[p.id].length > 0) && (() => {
                          const anunciosCardMl = mapaAnunciosMl[p.id] || [];
                          const anuncioPrincipalCardMl =
                            anunciosCardMl.find((a) => a.status_anuncio === 'active') ||
                            anunciosCardMl[0];
                          const linkCardMl = anuncioPrincipalCardMl
                            ? obterPermalinkAnuncioMl(
                                anuncioPrincipalCardMl.permalink,
                                anuncioPrincipalCardMl.ml_item_id
                              )
                            : '';
                          return (
                            <>
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-[#FFE600] text-slate-950 border border-amber-500 shrink-0">
                                ML
                              </span>
                              {linkCardMl && (
                                <a
                                  href={linkCardMl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Ver no Mercado Livre"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black shrink-0 transition"
                                >
                                  <span>Ver no Mercado Livre</span>
                                  <ExternalLink className="w-2.5 h-2.5 text-black" />
                                </a>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-400 uppercase tracking-wider mt-0.5 truncate">
                        {catNome}
                      </p>
                    </div>
                  </div>

                  {/* Coluna de Preço Fixada à Direita */}
                  <div className="flex-shrink-0 ml-3 text-right">
                    {temPromocao ? (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-500 line-through font-semibold mb-0.5">
                          {formatarMoeda(Number(p.preco_venda_varejo || 0))}
                        </span>
                        <span className="inline-block px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border-2 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 font-bold text-xs tracking-tight shadow-xs">
                          {formatarMoeda(precoExibicao)}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-block px-2.5 py-1 rounded-xl bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 text-black dark:text-white font-bold text-xs tracking-tight shadow-xs">
                        {formatarMoeda(precoExibicao)}
                      </span>
                    )}
                  </div>
                </div>
              );
            }

            // Visualização da Aba ESTOQUE (TELA002)
            const isSemEstoque = estoque <= 0;
            const isMinimo = estoque > 0 && estoque <= Number(p.estoque_minimo_alerta || 0);

            return (
              <div
                key={p.id}
                onClick={() => abrirEditarProduto(p, 'estoque')}
                className="p-4 flex items-center justify-between bg-white dark:bg-[#000000] hover:bg-slate-50 dark:hover:bg-slate-900/60 transition cursor-pointer gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Ponto Indicador de Status */}
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isSemEstoque ? 'bg-rose-500' : isMinimo ? 'bg-amber-500' : 'bg-transparent'
                  }`} />

                  {/* Foto */}
                  <div className="w-12 h-12 rounded-xl border-2 border-slate-300 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0 shadow-xs bg-slate-100 dark:bg-[#000000]">
                    {p.fotos_urls && p.fotos_urls[0] ? (
                      <img src={p.fotos_urls[0]} alt={p.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-center select-none">
                        <span className="text-[10px] sm:text-xs font-medium text-center leading-tight select-none">Sem foto</span>
                      </div>
                    )}
                  </div>

                  {/* Nome com até 2 linhas */}
                  <h2 className="text-sm font-bold text-black dark:text-white uppercase line-clamp-2 leading-snug">
                    {p.nome}
                  </h2>
                </div>

                {/* Quantidade em Estoque e Botão Entrada */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`font-black text-sm sm:text-base px-3 py-1.5 rounded-xl shadow-xs inline-block min-w-[3.2rem] text-center ${
                    isSemEstoque
                      ? 'bg-rose-50 dark:bg-[#000000] text-rose-800 dark:text-rose-400 border-2 border-rose-300 dark:border-rose-500/40'
                      : isMinimo
                      ? 'bg-amber-50 dark:bg-[#000000] text-amber-800 dark:text-amber-400 border-2 border-amber-300 dark:border-amber-500/40'
                      : 'bg-white dark:bg-[#000000] text-black dark:text-white border-2 border-slate-300 dark:border-slate-700'
                  }`}>
                    {estoque}
                  </span>
                  {permissions.podeGerenciarEstoque && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProdutoEntradaAlvo(p);
                        setModalEntradaAberto(true);
                      }}
                      className="border-2 border-emerald-400 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-400 bg-white dark:bg-[#000000] hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl text-xs font-bold px-3 py-1.5 transition flex items-center gap-1 cursor-pointer shadow-xs"
                      title="Dar entrada / ajustar estoque"
                    >
                      <PackagePlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Entrada</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* RODAPÉ FIXO: PEDIDOS E CATÁLOGO ONLINE (TELA001 / TELA005) */}
      {abaLista === 'itens' && (
        <div
          onClick={() => setModalCatalogoAberto(true)}
          className={`fixed bottom-0 left-0 right-0 z-40 border-t px-4 pt-3 pb-6 pb-safe flex items-center justify-between cursor-pointer ${
            isDark ? 'shadow-[0_-8px_30px_rgba(0,0,0,0.9)]' : 'shadow-lg'
          }`}
          style={{ backgroundColor: temaCores.bgRodape, borderColor: temaCores.bordaRodape }}
        >
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5" style={{ color: temaCores.textoSecundario }} />
            <div>
              <h3 className="font-extrabold text-xs sm:text-sm" style={{ color: temaCores.textoPrincipal }}>Pedidos e Catálogo Online</h3>
              <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 tracking-wider uppercase">
                {loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false
                  ? 'PUBLICADO • ACEITANDO PEDIDOS'
                  : 'CATÁLOGO PAUSADO'}
              </p>
            </div>
          </div>
          <ChevronDown className="w-5 h-5 text-slate-400" />
        </div>
      )}

      {/* RODAPÉ FIXO: RESUMO DE ESTOQUE (TELA002) */}
      {abaLista === 'estoque' && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 border-t px-4 pt-3 pb-6 pb-safe flex items-center justify-between ${
            isDark ? 'shadow-[0_-8px_30px_rgba(0,0,0,0.9)]' : 'shadow-lg'
          }`}
          style={{ backgroundColor: temaCores.bgRodape, borderColor: temaCores.bordaRodape }}
        >
          <div>
            <h3 className="font-extrabold text-xs sm:text-sm" style={{ color: temaCores.textoPrincipal }}>
              Total: R$ {valorTotalEstoque.toFixed(2).replace('.', ',')}
            </h3>
            {permissions.podeVerPrecoCusto && (
              <p className="text-sm leading-relaxed font-medium" style={{ color: temaCores.textoSecundario }}>
                Custo do estoque: R$ {valorCustoTotalEstoque.toFixed(2).replace('.', ',')}
              </p>
            )}
          </div>

          <div className="text-right">
            <span className="font-black text-lg sm:text-xl block" style={{ color: temaCores.textoPrincipal }}>
              {totalItensEstoque}
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: temaCores.textoSecundario }}>
              Em estoque
            </span>
          </div>
        </div>
      )}

      {/* MODAL / BOTTOM SHEET: PEDIDOS E CATÁLOGO ONLINE (TELA005) */}
      {modalCatalogoAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-slate-100 dark:bg-[#08131A] border-t-2 border-x-2 border-slate-300 dark:border-slate-400 rounded-t-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200 text-black dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-300 dark:border-slate-700 pb-3">
              <h3 className="font-extrabold text-sm sm:text-base text-black dark:text-white">Pedidos e Catálogo Online</h3>
              <button
                type="button"
                onClick={() => setModalCatalogoAberto(false)}
                className={`hubi-btn-close-x p-1.5 rounded-xl border transition cursor-pointer ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Publicado para todos verem */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs sm:text-sm font-bold text-black dark:text-white">Publicado para todos verem</span>
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
                    loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                    loja?.configuracoes_extras?.catalogo?.publicar_catalogo !== false ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Ações TELA005 */}
              <div className="pt-2 border-t border-slate-300 dark:border-slate-700 space-y-1.5">
                <a
                  href={catalogUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full p-3 rounded-2xl bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-3 text-xs sm:text-sm font-bold text-black dark:text-white transition"
                >
                  <Store className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Abrir catálogo</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    compartilharLink(catalogUrl, loja?.nome_fantasia || 'Catálogo Online', 'Confira nosso catálogo online e faça seu pedido direto pelo WhatsApp!');
                    setModalCatalogoAberto(false);
                  }}
                  className="w-full p-3 rounded-2xl bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-3 text-xs sm:text-sm font-bold text-black dark:text-white text-left transition cursor-pointer"
                >
                  <Share2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Compartilhar</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalCatalogoAberto(false);
                    navigate('/catalog-config');
                  }}
                  className="w-full p-3 rounded-2xl bg-white dark:bg-[#000000] border-2 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-3 text-xs sm:text-sm font-bold text-black dark:text-white text-left transition cursor-pointer"
                >
                  <Settings className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Configurações</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ENTRADA / AJUSTE DE ESTOQUE */}
      <ModalEntradaEstoque
        isOpen={modalEntradaAberto}
        onClose={() => {
          setModalEntradaAberto(false);
          setProdutoEntradaAlvo(null);
        }}
        produto={produtoEntradaAlvo}
        produtos={produtos}
        onEstoqueAtualizado={onRecarregar}
      />
    </div>
  );
};
export default ProdutosMobile;
