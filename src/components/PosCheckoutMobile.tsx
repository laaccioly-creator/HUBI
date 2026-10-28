import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Camera,
  X,
  Plus,
  Minus,
  Trash2,
  User,
  UserPlus,
  Zap,
  Tag,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ArrowLeft,
  Store,
  Truck,
  ShoppingCart,
  ShoppingBag,
  Package,
  Sparkles,
  Globe,
  DollarSign,
  Ticket,
  Users,
  History,
  BarChart3,
  UserCheck,
  Settings,
  HelpCircle,
  LogOut,
  MoreVertical,
  Volume2,
  VolumeX,
  Flame,
  LayoutGrid,
  List,
  Check,
  Percent,
  Edit2,
  RefreshCw,
  Phone,
  MessageCircle,
  Download,
  AlertCircle,
  Wifi,
  WifiOff,
  FileText,
  Loader2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCart, FORMA_ENTREGA_RETIRADA_PADRAO } from '../contexts/CartContext';
import { Produto, VariacaoProduto, Cliente, FormaPagamento, Categoria, TabelaPreco } from '../types';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useTheme } from '../contexts/ThemeContext';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import { MobileHeader } from './layout/MobileHeader';
import { getCategoriaPeso } from './PosCheckout';
import { audioService } from '../services/audioService';
import { formatarMoeda, ehProdutoFracionado, obterSiglaUnidade, formatarLinhaCalculoItem } from '../utils/formatters';
import { ModalInputPesoFracionado } from './ui/ModalInputPesoFracionado';
import { InputQuantidadeCarrinho } from './ui/InputQuantidadeCarrinho';
import { podeEditarPedido } from '../utils/statusPedidoUtils';
import { obterRegrasPrecificacao } from '../services/pricingEngine';

interface PosCheckoutMobileProps {
  produtos: Produto[];
  categorias: Categoria[];
  clientes: Cliente[];
  formasPagamento: FormaPagamento[];
  pedidosConfirmadosCount: number;
  onAbrirFechamento: () => void;
  onSalvarPedidoPendente?: () => void;
  salvandoPendente?: boolean;
  onAbrirNovoCliente: () => void;
  onAbrirVariacoesModal: (produto: Produto) => void;
  onAbrirFormaEntrega?: () => void;
  isOnline?: boolean;
  pendentesCount?: number;
  subTelaControlada?: SubTelaMobile;
  onSubTelaChange?: (subTela: SubTelaMobile) => void;
}

export type SubTelaMobile = 'vender' | 'menu' | 'clientes' | 'camera' | 'avulso' | 'carrinho';

export const PosCheckoutMobile: React.FC<PosCheckoutMobileProps> = ({
  produtos,
  categorias,
  clientes,
  pedidosConfirmadosCount,
  onAbrirFechamento,
  onSalvarPedidoPendente,
  salvandoPendente = false,
  onAbrirNovoCliente,
  onAbrirVariacoesModal,
  onAbrirFormaEntrega,
  isOnline = true,
  pendentesCount = 0,
  subTelaControlada,
  onSubTelaChange
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loja, usuario, desconectarPdv } = useAuth();
  const permissions = usePermissions();
  const { verificarSaidaComConfirmacao, mostrarToast } = useFeedbackModal();
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  const cart = useCart();
  const {
    itens: rawItens,
    clienteSelecionado,
    desconto,
    descontoPercentual,
    tipoDesconto,
    taxaEntrega,
    pedidoEntrega,
    subtotal,
    total,
    totalItens,
    tabelaPrecoGlobal,
    tabelaPrecoCalculada,
    avaliacaoCarrinho,
    freteGratisAtivo,
    freteGratisValorMinimo,
    pedidoEmEdicao,
    setTabelaPrecoGlobal,
    adicionarItem,
    removerItem,
    atualizarQuantidade,
    setClienteSelecionado,
    setDescontoValor,
    setDescontoPercentual,
    setTipoDesconto,
    limparCarrinho,
    cancelarEdicaoPedido,
    setPedidoEntrega,
    setTaxaEntrega
  } = cart || {};

  const itens = useMemo(() => (Array.isArray(rawItens) ? rawItens : []), [rawItens]);

  // Status de bloqueio de edição para pedidos confirmados ou em processamento
  const isEdicaoTravada = Boolean(pedidoEmEdicao && !podeEditarPedido(pedidoEmEdicao));

  // Estados de Navegação e Visualização
  const [subTelaInterna, setSubTelaInterna] = useState<SubTelaMobile>('vender');
  const subTela = subTelaControlada !== undefined ? subTelaControlada : subTelaInterna;
  const setSubTela = (nova: SubTelaMobile) => {
    setSubTelaInterna(nova);
    onSubTelaChange?.(nova);
  };

  useEffect(() => {
    if (subTelaControlada !== undefined) {
      setSubTelaInterna(subTelaControlada);
    }
  }, [subTelaControlada]);

  // Se o carrinho for limpo pós-venda/recibo, garantir retorno à tela de catálogo/vender
  useEffect(() => {
    if (subTela === 'carrinho' && (itens?.length || 0) === 0 && !pedidoEmEdicao) {
      setSubTela('vender');
    }
  }, [subTela, itens?.length, pedidoEmEdicao]);
  const [origemClientes, setOrigemClientes] = useState<'vender' | 'carrinho'>('vender');

  const abrirSelecaoCliente = (origem: 'vender' | 'carrinho' = 'vender') => {
    setOrigemClientes(origem);
    setSubTela('clientes');
  };

  const [menuDrawerAberto, setMenuDrawerAberto] = useState<boolean>(false);
  const [modoVisualizacao, setModoVisualizacao] = useState<'grade' | 'lista'>('grade'); // Grade (tela001) vs Lista (tela007)
  const [buscaAberta, setBuscaAberta] = useState<boolean>(false); // Tela 004
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [itemPesagemModal, setItemPesagemModal] = useState<{ produto: Produto; variacao?: VariacaoProduto | null; quantidadeAtual?: number; cartId?: string } | null>(null);
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('tudo');
  const [apenasEmEstoque, setApenasEmEstoque] = useState<boolean>(() => {
    try {
      const salvo = localStorage.getItem('hubi_pdv_apenas_em_estoque');
      return salvo !== null ? salvo === 'true' : false;
    } catch {
      return false;
    }
  });
  const [multiplicadorQtd, setMultiplicadorQtd] = useState<number>(1);
  const [modalMultiplicador, setModalMultiplicador] = useState<boolean>(false);
  const [modalTabelaPrecoAberto, setModalTabelaPrecoAberto] = useState<boolean>(false);

  // Estados da Tela 003: Clientes
  const [buscaCliente, setBuscaCliente] = useState<string>('');

  // Estados da Tela 005: Leitor Câmera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [cameraSomAtivo, setCameraSomAtivo] = useState<boolean>(true);
  const [tochaAtiva, setTochaAtiva] = useState<boolean>(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [ultimoCodigoBipado, setUltimoCodigoBipado] = useState<string | null>(null);
  const isScanningLockedRef = useRef<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  // Estados da Tela 006: Item Avulso
  const [valorAvulsoCentavos, setValorAvulsoCentavos] = useState<number>(0);
  const [descricaoAvulso, setDescricaoAvulso] = useState<string>('');
  const [editandoDescricaoAvulso, setEditandoDescricaoAvulso] = useState<boolean>(false);

  // Estados da Tela 008: Carrinho
  const [modalDescontoAberto, setModalDescontoAberto] = useState<boolean>(false);
  const [modalOpcoesCarrinho, setModalOpcoesCarrinho] = useState<boolean>(false);
  const [modalConfirmarLimparCarrinho, setModalConfirmarLimparCarrinho] = useState<boolean>(false);
  const [descontoTempValor, setDescontoTempValor] = useState<string>('');
  const [descontoTempTipo, setDescontoTempTipo] = useState<'valor' | 'percentual'>('valor');

  const inputBuscaRef = useRef<HTMLInputElement>(null);

  // Ao entrar para editar pedido ou com rota para carrinho, direcionar diretamente para o carrinho
  useEffect(() => {
    if ((location.state as any)?.subTela === 'carrinho' || pedidoEmEdicao) {
      setSubTela('carrinho');
    }
  }, [location.state, pedidoEmEdicao]);

  // Focar no campo de busca ao abrir tela004
  useEffect(() => {
    if (buscaAberta && inputBuscaRef.current) {
      inputBuscaRef.current.focus();
    }
  }, [buscaAberta]);

  // Contagem de cada produto no carrinho para exibir o badge [ 1 ]
  const mapaQuantidadesCarrinho = useMemo(() => {
    const map = new Map<string, number>();
    itens.forEach(it => {
      const prodId = it.produto.id;
      map.set(prodId, (map.get(prodId) || 0) + it.quantidade);
    });
    return map;
  }, [itens]);

  const categoriasOrdenadas = useMemo(() => {
    return [...categorias].sort((a, b) => {
      const pesoA = getCategoriaPeso(a.nome);
      const pesoB = getCategoriaPeso(b.nome);
      if (pesoA !== pesoB) return pesoA - pesoB;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [categorias]);

  const mapaCategorias = useMemo(() => {
    const mapa = new Map<string, { nome: string; peso: number }>();
    categorias.forEach(c => {
      mapa.set(c.id, { nome: c.nome, peso: getCategoriaPeso(c.nome) });
    });
    return mapa;
  }, [categorias]);

  // Produtos filtrados por busca e categoria
  const produtosFiltrados = useMemo(() => {
    const filtrados = produtos.filter(p => {
      // Filtro de busca
      if (termoBusca.trim()) {
        const t = termoBusca.toLowerCase().trim();
        const matchNome = p.nome.toLowerCase().includes(t);
        const matchSku = p.codigo_interno && p.codigo_interno.toLowerCase().includes(t);
        const matchEan = p.codigo_barras && p.codigo_barras.includes(t);
        if (!matchNome && !matchSku && !matchEan) return false;
      }

      // Filtro de produtos em estoque
      if (apenasEmEstoque) {
        const estoqueTotal = p.tem_variacoes && p.variacoes && p.variacoes.length > 0
          ? p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0)
          : Number(p.quantidade_estoque || 0);
        if (estoqueTotal <= 0) return false;
      }

      // Filtro de categoria
      if (categoriaAtiva === 'destaques') {
        return p.destaque === true;
      } else if (categoriaAtiva !== 'tudo') {
        return p.categoria_id === categoriaAtiva;
      }

      return true;
    });

    // Ordenação com prioridade: 1º Cosméticos, 2º Brinquedos Eróticos, 3º Próteses, 4º Fantasias, 5º Couro/Sado
    return filtrados.sort((a, b) => {
      const pesoA = a.categoria_id ? (mapaCategorias.get(a.categoria_id)?.peso ?? 999) : 999;
      const pesoB = b.categoria_id ? (mapaCategorias.get(b.categoria_id)?.peso ?? 999) : 999;
      if (pesoA !== pesoB) return pesoA - pesoB;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [produtos, termoBusca, categoriaAtiva, apenasEmEstoque, mapaCategorias]);

  // Clientes filtrados na tela 003
  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return clientes;
    const t = buscaCliente.toLowerCase().trim();
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(t) ||
      (c.email && c.email.toLowerCase().includes(t)) ||
      (c.telefone && c.telefone.includes(t)) ||
      (c.whatsapp && c.whatsapp.includes(t))
    );
  }, [clientes, buscaCliente]);

  // Handler para clique acumulativo em um produto
  const handleClicarProduto = (produto: Produto) => {
    if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
      onAbrirVariacoesModal(produto);
    } else if (ehProdutoFracionado(produto)) {
      setItemPesagemModal({ produto, quantidadeAtual: multiplicadorQtd > 1 ? multiplicadorQtd : 1 });
    } else {
      adicionarItem(produto, null, multiplicadorQtd);
      if (multiplicadorQtd > 1) {
        setMultiplicadorQtd(1); // Reseta para 1 após aplicar
      }
    }
  };

  // =========================================================================
  // GESTÃO DA CÂMERA (TELA 005)
  // =========================================================================
  useEffect(() => {
    if (subTela === 'camera') {
      iniciarCameraScanner();
    } else {
      encerrarCameraScanner();
    }
    return () => {
      encerrarCameraScanner();
    };
  }, [subTela]);

  const encerrarCameraScanner = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamCamera) {
      streamCamera.getTracks().forEach(track => track.stop());
      setStreamCamera(null);
    }
    setTochaAtiva(false);
    setUltimoCodigoBipado(null);
    isScanningLockedRef.current = false;
  };

  const iniciarCameraScanner = async () => {
    try {
      setErroCamera(null);
      isScanningLockedRef.current = false;
      if ('BarcodeDetector' in window) {
        try {
          detectorRef.current = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
          });
        } catch (e) {
          detectorRef.current = null;
        }
      }

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
        executarScanFrame();
      }
    } catch (err: any) {
      setErroCamera('Câmera indisponível ou permissão não concedida.');
    }
  };

  const executarScanFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    const scan = async () => {
      if (!video || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(scan);
        return;
      }

      if (detectorRef.current && !isScanningLockedRef.current) {
        try {
          const barcodes = await detectorRef.current.detect(video);
          if (barcodes && barcodes.length > 0 && !isScanningLockedRef.current) {
            const rawValue = barcodes[0].rawValue;
            if (rawValue && rawValue.trim()) {
              const codigoTrim = rawValue.trim();
              isScanningLockedRef.current = true;
              setUltimoCodigoBipado(codigoTrim);
              handleCodigoBarrasDetectado(codigoTrim);
              setTimeout(() => {
                isScanningLockedRef.current = false;
                setUltimoCodigoBipado(null);
              }, 1500);
            }
          }
        } catch (e) {
          // Frame skip
        }
      }
      animFrameRef.current = requestAnimationFrame(scan);
    };

    animFrameRef.current = requestAnimationFrame(scan);
  };

  const handleCodigoBarrasDetectado = (codigo: string) => {
    if (cameraSomAtivo) {
      audioService.playBeep();
    }
    const limpo = codigo.trim().toLowerCase();
    const prodEncontrado = produtos.find(p =>
      (p.codigo_barras && p.codigo_barras.toLowerCase() === limpo) ||
      (p.codigo_interno && p.codigo_interno.toLowerCase() === limpo)
    );

    if (prodEncontrado) {
      handleClicarProduto(prodEncontrado);
    } else {
      alert(`Produto com código ${codigo} não encontrado no catálogo.`);
    }
  };

  const alternarTocha = async () => {
    if (!streamCamera) return;
    const track = streamCamera.getVideoTracks()[0];
    if (track && (track as any).applyConstraints) {
      try {
        await (track as any).applyConstraints({
          advanced: [{ torch: !tochaAtiva }]
        });
        setTochaAtiva(!tochaAtiva);
      } catch (e) {
        console.warn('Tocha não suportada neste dispositivo.');
      }
    }
  };

  // =========================================================================
  // TECLADO VIRTUAL ITEM AVULSO (TELA 006)
  // =========================================================================
  const handleDigitarNumeroAvulso = (num: number) => {
    if (valorAvulsoCentavos.toString().length >= 8) return;
    setValorAvulsoCentavos(prev => prev * 10 + num);
  };

  const handleBackspaceAvulso = () => {
    setValorAvulsoCentavos(prev => Math.floor(prev / 10));
  };

  const handleAdicionarItemAvulso = () => {
    const valorReal = valorAvulsoCentavos / 100;
    if (valorReal <= 0) {
      alert('Informe um valor maior que zero.');
      return;
    }

    const produtoAvulso: Produto = {
      id: `avulso_${Date.now()}`,
      loja_id: loja?.id || '',
      nome: descricaoAvulso.trim() || 'Item não cadastrado',
      tipo_unidade: 'un',
      preco_custo: 0,
      preco_venda_varejo: valorReal,
      qtd_minima_atacado: 0,
      qtd_minima_autoatacado: 0,
      promocao_ativa: false,
      quantidade_estoque: 9999,
      estoque_minimo_alerta: 0,
      tem_variacoes: false,
      eh_combo: false,
      exibir_catalogo: false,
      destaque: false,
      ativo: true,
      fotos_urls: []
    };

    adicionarItem(produtoAvulso, null, 1);
    setValorAvulsoCentavos(0);
    setDescricaoAvulso('');
    setEditandoDescricaoAvulso(false);
    setSubTela('vender');
  };



  // Modal de Seleção de Tabela de Preço montado em Portal no document.body
  const renderModalTabelaPreco = () => {
    if (!modalTabelaPrecoAberto) return null;
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
        <div className={`${
          isDark ? 'bg-[#08131A] border border-slate-700 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
        } rounded-t-3xl sm:rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-150`}>
          <div className={`flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-300'} pb-2`}>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Tabela de Preço</h3>
            </div>
            <button
              type="button"
              onClick={() => setModalTabelaPrecoAberto(false)}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isDark
                  ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
            Selecione a tabela de preços a ser aplicada aos produtos desta venda:
          </p>

          <div className="space-y-2">
            {(() => {
              const tiposAtivos = loja?.tipos_venda || loja?.configuracoes_extras?.tipos_venda_ativos || { varejo: true, atacado: true, distribuidor: true };
              const opcoes = [
                { id: 'varejo', rotulo: '🛒 Varejo (Padrão)', desc: 'Preço unitário normal', ativo: tiposAtivos.varejo !== false },
                { id: 'atacado', rotulo: '🏷️ Atacado', desc: 'Preço reduzido para compras em volume', ativo: tiposAtivos.atacado !== false },
                { id: 'autoatacado', rotulo: '⚡ Distribuidor', desc: 'Preço especial para grandes quantidades', ativo: tiposAtivos.distribuidor !== false }
              ].filter(t => t.ativo);

              return opcoes.map(tab => {
                const isSelected = (tabelaPrecoGlobal || 'varejo') === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setTabelaPrecoGlobal?.(tab.id as TabelaPreco);
                      setModalTabelaPrecoAberto(false);
                    }}
                    className={`w-full p-3 rounded-2xl border-2 text-left transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-xs'
                          : 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-xs'
                        : isDark
                        ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-900'
                        : 'bg-white border-slate-300 text-black hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <span className={`font-bold text-xs block ${isSelected ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>{tab.rotulo}</span>
                      <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>{tab.desc}</span>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // =========================================================================
  // TELA 003: SELEÇÃO E CADASTRO DE CLIENTE
  // =========================================================================
  if (subTela === 'clientes') {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col animate-in slide-in-from-right duration-150 ${
        isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-slate-900'
      }`}>
        {/* Header Superior */}
        <div className={`h-14 border-b px-4 flex items-center justify-between sticky top-0 z-10 ${
          isDark ? 'bg-[#08131A] border-slate-800 text-white' : 'bg-slate-100 border-slate-300 text-black'
        }`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubTela(origemClientes)}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Adicionar cliente</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`p-2 rounded-xl transition cursor-pointer ${
                isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-700 hover:bg-slate-200'
              }`}
              title="Sincronizar"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => onAbrirNovoCliente()}
              className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md transition cursor-pointer"
              title="Cadastrar Novo Cliente"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Barra de Busca */}
        <div className={`p-3 border-b ${isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Procure por nome, email ou telefone"
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              className={`w-full rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-emerald-500 shadow-sm ${
                isDark
                  ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500'
                  : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400'
              }`}
            />
          </div>
        </div>

        {/* Cliente Atual Vinculado (Se houver) */}
        {clienteSelecionado && (
          <div className={`p-3 border-b flex items-center justify-between ${
            isDark ? 'bg-[#000000] border-slate-800' : 'bg-white border-slate-300'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <div className="min-w-0">
                <span className={`text-xs font-bold block truncate ${isDark ? 'text-emerald-400' : 'text-black'}`}>{clienteSelecionado.nome}</span>
                <span className={`text-[10px] block truncate ${isDark ? 'text-slate-300' : 'text-slate-700 font-medium'}`}>
                  {clienteSelecionado.permite_caderneta
                    ? `Caderneta disp.: R$ ${Math.max(0, Number(clienteSelecionado.limite_caderneta || 0) - Number(clienteSelecionado.saldo_devedor_caderneta || 0)).toFixed(2)}`
                    : clienteSelecionado.permite_fiado
                    ? `Fiado disp.: R$ ${Math.max(0, Number(clienteSelecionado.limite_credito || 0)).toFixed(2)}`
                    : 'Cliente selecionado para esta venda'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setClienteSelecionado(null)}
              className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
            >
              Remover
            </button>
          </div>
        )}

        {/* Lista de Clientes */}
        <div className={`flex-1 overflow-y-auto divide-y ${isDark ? 'divide-slate-800 bg-[#08131A]' : 'divide-slate-200 bg-slate-100'}`}>
          {clientesFiltrados.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Nenhum cliente encontrado.
            </div>
          ) : (
            clientesFiltrados.map((cliente) => {
              const dispCaderneta = Math.max(0, Number(cliente.limite_caderneta || 0) - Number(cliente.saldo_devedor_caderneta || 0));
              const dispFiado = Math.max(0, Number(cliente.limite_credito || 0));
              return (
                <div
                  key={cliente.id}
                  onClick={() => {
                    setClienteSelecionado(cliente);
                    setSubTela(origemClientes);
                  }}
                  className={`p-3.5 transition flex items-center justify-between cursor-pointer ${
                    isDark ? 'bg-[#000000] hover:bg-slate-900 border-b border-slate-800' : 'bg-white hover:bg-slate-50 border-b border-slate-200'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className={`font-bold text-xs uppercase truncate ${isDark ? 'text-white' : 'text-black'}`}>{cliente.nome}</h4>
                      {cliente.permite_caderneta && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          Caderneta: R$ {dispCaderneta.toFixed(2)}
                        </span>
                      )}
                      {!cliente.permite_caderneta && cliente.permite_fiado && dispFiado > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                          Fiado: R$ {dispFiado.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {cliente.telefone ? `Tel: ${cliente.telefone}` : 'Sem telefone cadastrado'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {cliente.whatsapp && (
                      <a
                        href={`https://wa.me/55${cliente.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition"
                        title="Enviar WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // TELA 005: LEITOR DE CÓDIGO DE BARRAS PELA CÂMERA
  // =========================================================================
  if (subTela === 'camera') {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col animate-in fade-in ${
        isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-slate-900'
      }`}>
        {/* Header Superior da Câmera */}
        <div className={`h-14 border-b px-4 flex items-center justify-between ${
          isDark ? 'bg-[#08131A] border-slate-800 text-white' : 'bg-slate-100 border-slate-300 text-black'
        }`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubTela('vender')}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Vender</h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCameraSomAtivo(!cameraSomAtivo)}
              className={`p-1.5 rounded-xl transition ${
                isDark ? 'text-slate-400 hover:text-white' : 'text-slate-700 hover:text-black'
              }`}
            >
              {cameraSomAtivo ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
            </button>

            <button
              type="button"
              onClick={() => setModalMultiplicador(true)}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black shadow-xs'
              }`}
            >
              {multiplicadorQtd}X
            </button>

            <button
              type="button"
              onClick={() => abrirSelecaoCliente('vender')}
              className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-md transition cursor-pointer"
            >
              <User className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewport da Câmera com linha laser */}
        <div className="relative w-full h-48 bg-black overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Mira e Linha Laser Vermelha */}
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse" />

          {/* Botão de Lanterna (Torch) */}
          <button
            type="button"
            onClick={alternarTocha}
            className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/60 text-white text-[11px] font-bold backdrop-blur"
          >
            {tochaAtiva ? 'Torch On' : 'Torch Off'}
          </button>

          {erroCamera && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 text-center text-white text-xs">
              {erroCamera}
            </div>
          )}
        </div>

        {/* Lista de Itens Bipados no Rodapé do Leitor */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-2.5 ${
          isDark ? 'bg-[#08131A]' : 'bg-slate-100'
        }`}>
          {itens.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Aponte a câmera para o código de barras do produto.
            </div>
          ) : (
            itens.map((it) => (
              <div key={it.id} className={`flex items-center justify-between text-xs p-2.5 rounded-xl shadow-xs ${
                isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-black font-extrabold'}`}>{it.quantidade} x</span>
                  <span className={`font-bold uppercase truncate max-w-[200px] ${isDark ? 'text-white' : 'text-black'}`}>{it.produto.nome}</span>
                </div>
                <span className="font-black text-emerald-600 dark:text-emerald-400">R$ {Number(it.subtotal || 0).toFixed(2)}</span>
              </div>
            ))
          )}

          {itens.length > 0 && (
            <div className="pt-2 text-right space-y-1">
              <button
                type="button"
                onClick={() => setModalDescontoAberto(true)}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block w-full text-right"
              >
                Dar desconto
              </button>
              <div className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>
                TOTAL: <span className="text-emerald-600 dark:text-emerald-400 font-black">{formatarMoeda(total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Flutuante do Leitor */}
        <div className={`p-3 border-t flex items-center gap-2 ${
          isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
        }`}>
          <button
            type="button"
            onClick={() => setSubTela('carrinho')}
            className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition cursor-pointer ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}
          >
            ...
          </button>
          <button
            type="button"
            onClick={() => setSubTela('carrinho')}
            disabled={itens.length === 0}
            className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-between px-4 shadow-md transition disabled:opacity-50 cursor-pointer"
          >
            <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'} = R$ {total.toFixed(2)}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // TELA 006: VENDER ITEM NÃO CADASTRADO (ITEM AVULSO)
  // =========================================================================
  if (subTela === 'avulso') {
    const valorFormatado = formatarMoeda(valorAvulsoCentavos / 100);

    return (
      <div className={`fixed inset-0 z-50 flex flex-col justify-between animate-in slide-in-from-right duration-150 ${
        isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`h-14 border-b px-4 flex items-center gap-3 ${
          isDark ? 'bg-[#08131A] border-slate-800 text-white' : 'bg-slate-100 border-slate-300 text-black'
        }`}>
          <button
            type="button"
            onClick={() => setSubTela('vender')}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Vender item não cadastrado</h2>
        </div>

        {/* Display de Valor & Descrição */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-3">
          <div className="text-4xl sm:text-5xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight flex items-center">
            {valorFormatado}
            <span className="w-0.5 h-10 bg-emerald-500 animate-pulse ml-1" />
          </div>

          {editandoDescricaoAvulso ? (
            <div className="w-full max-w-xs flex items-center gap-2">
              <input
                type="text"
                placeholder="Ex: Serviço de entrega, Produto avulso..."
                value={descricaoAvulso}
                onChange={(e) => setDescricaoAvulso(e.target.value)}
                className={`w-full rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setEditandoDescricaoAvulso(false)}
                className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditandoDescricaoAvulso(true)}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              {descricaoAvulso ? `Descrição: ${descricaoAvulso}` : 'Adicionar descrição'}
            </button>
          )}
        </div>

        {/* Teclado Numérico Virtual */}
        <div className={`p-4 border-t space-y-3 ${
          isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
        }`}>
          <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto text-center font-bold text-2xl">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleDigitarNumeroAvulso(n)}
                className={`h-14 rounded-2xl transition flex items-center justify-center cursor-pointer shadow-sm ${
                  isDark
                    ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                    : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
                }`}
              >
                {n}
              </button>
            ))}

            <div />
            <button
              type="button"
              onClick={() => handleDigitarNumeroAvulso(0)}
              className={`h-14 rounded-2xl transition flex items-center justify-center cursor-pointer shadow-sm ${
                isDark
                  ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                  : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
              }`}
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspaceAvulso}
              className={`h-14 rounded-2xl transition flex items-center justify-center cursor-pointer shadow-sm ${
                isDark
                  ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-300'
                  : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-slate-700'
              }`}
            >
              ⌫
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdicionarItemAvulso}
            disabled={valorAvulsoCentavos === 0}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition shadow-md cursor-pointer disabled:opacity-40"
          >
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // TELA 008: CARRINHO DE COMPRAS MOBILE
  // =========================================================================
  if (subTela === 'carrinho') {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col justify-between animate-in slide-in-from-bottom duration-150 ${
        isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-slate-900'
      }`}>
        {/* Header do Carrinho */}
        <div className={`h-14 border-b px-4 flex items-center justify-between shrink-0 ${
          isDark ? 'bg-[#08131A] border-slate-800 text-white' : 'bg-slate-100 border-slate-300 text-black'
        }`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubTela('vender')}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Carrinho</h2>

            {!isEdicaoTravada && itens.length > 0 && (
              <button
                type="button"
                onClick={() => setModalConfirmarLimparCarrinho(true)}
                className="px-2.5 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-bold transition cursor-pointer"
                title="Limpar todos os produtos do carrinho"
              >
                Limpar
              </button>
            )}
          </div>

          {!isEdicaoTravada && (
            <button
              type="button"
              onClick={() => setSubTela('vender')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer active:scale-95 shadow-xs ${
                isDark
                  ? 'bg-[#000000] border border-slate-700 text-emerald-400 hover:bg-slate-900'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-700 shadow-sm'
              }`}
              title="Continuar adicionando produtos ao carrinho"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Continuar Comprando</span>
            </button>
          )}
        </div>

        {/* 1. Termômetro Dinâmico de Frete Grátis (loja_shipping_configs - Exibido apenas se Envio) */}
        {pedidoEntrega?.tipo_atendimento === 'entrega' && freteGratisAtivo && freteGratisValorMinimo > 0 && (() => {
          const faltaFrete = Math.max(0, freteGratisValorMinimo - subtotal);
          const percentualFrete = Math.min(100, Math.round((subtotal / freteGratisValorMinimo) * 100));
          const ganhouFrete = subtotal >= freteGratisValorMinimo;

          return (
            <div className={`px-4 py-2.5 border-b space-y-1.5 shrink-0 ${
              isDark
                ? 'bg-[#000000] border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-black'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <div className={`flex items-center gap-1.5 font-bold min-w-0 pr-2 ${isDark ? 'text-slate-100' : 'text-black'}`}>
                  <Truck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">
                    {ganhouFrete ? (
                      <span className="font-black text-emerald-600 dark:text-emerald-400">
                        🎉 Parabéns! Você ganhou Frete Grátis!
                      </span>
                    ) : (
                      <span className={isDark ? 'text-slate-200' : 'text-black'}>
                        Faltam <strong className={`font-black ${isDark ? 'text-white' : 'text-emerald-700'}`}>{formatarMoeda(faltaFrete)}</strong> para Frete Grátis
                      </span>
                    )}
                  </span>
                </div>
                <span className="font-black text-[11px] shrink-0 text-emerald-600 dark:text-emerald-400">
                  {percentualFrete}%
                </span>
              </div>
              <div className={`w-full rounded-full h-2 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${percentualFrete}%` }}
                />
              </div>
            </div>
          );
        })()}

        {/* 2. Termômetro Dinâmico de Tabela de Preço por Volume (pricingEngine.ts) */}
        {avaliacaoCarrinho && (() => {
          const tiposAtivos = loja?.tipos_venda || loja?.configuracoes_extras?.tipos_venda_ativos || { varejo: true, atacado: true, distribuidor: true };
          const qtdAtivos = [tiposAtivos.varejo !== false, tiposAtivos.atacado !== false, tiposAtivos.distribuidor !== false].filter(Boolean).length;
          if (qtdAtivos <= 1) return null;
          if (!avaliacaoCarrinho.proximoNivel && avaliacaoCarrinho.tabelaAtiva === 'varejo') return null;

          const regrasPrecificacao = obterRegrasPrecificacao(loja);
          const regraAtacarejoDireto = (regrasPrecificacao.tipoMinimoAtacado === 'minimo_sku' || (!regrasPrecificacao.valorMinimoAtacado && !regrasPrecificacao.qtdTotalMinimaAtacado)) &&
            (regrasPrecificacao.tipoMinimoDistribuidor === 'minimo_sku' || (!regrasPrecificacao.valorMinimoAutoatacado && !regrasPrecificacao.qtdTotalMinimaAutoatacado) || !regrasPrecificacao.tiposVendaAtivos?.distribuidor);
          if (regraAtacarejoDireto) return null;

          const tabelaOrganica = avaliacaoCarrinho.tabelaAtiva;
          const atingiuDistribuidor = tabelaOrganica === 'autoatacado';
          const proximaTabelaNome = avaliacaoCarrinho.proximoNivel === 'autoatacado' ? 'Distribuidor' : 'Atacado';
          const isAuto = avaliacaoCarrinho.proximoNivel === 'autoatacado';
          const valMin = isAuto ? loja?.valor_minimo_padrao_autoatacado : loja?.valor_minimo_padrao_atacado;
          const qtdMin = isAuto ? loja?.qtd_minima_padrao_autoatacado : loja?.qtd_minima_padrao_atacado;
          const tipoMin = isAuto ? loja?.tipo_minimo_padrao_autoatacado : loja?.tipo_minimo_padrao_atacado;

          const progressoPercent = atingiuDistribuidor
            ? 100
            : Math.min(100, Math.max(5, avaliacaoCarrinho.progressoGeralPercent || 0));

          let mensagemMeta: React.ReactNode;
          if (atingiuDistribuidor) {
            mensagemMeta = (
              <span className="text-purple-600 dark:text-purple-400 font-black">
                🎉 Parabéns! Você atingiu a tabela de Distribuidor!
              </span>
            );
          } else if (tipoMin === 'quantidade' || (Number(qtdMin) > 0 && (!valMin || Number(valMin) === 0))) {
            const faltamPecas = avaliacaoCarrinho.faltaPecasParaProximo;
            mensagemMeta = (
              <span>
                Faltam <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{faltamPecas} {faltamPecas === 1 ? 'peça' : 'peças'}</strong> para tabela de {proximaTabelaNome}
              </span>
            );
          } else {
            mensagemMeta = (
              <span>
                Faltam <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{formatarMoeda(avaliacaoCarrinho.faltaValorParaProximo)}</strong> para tabela de {proximaTabelaNome}
              </span>
            );
          }

          return (
            <div className={`px-4 py-2.5 border-b space-y-1.5 shrink-0 ${
              isDark ? 'bg-[#000000] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-black'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold min-w-0 pr-2">
                  <Tag className={`w-4 h-4 shrink-0 ${
                    atingiuDistribuidor ? 'text-purple-500' : tabelaOrganica === 'atacado' ? 'text-blue-500' : 'text-slate-500'
                  }`} />
                  <span className="truncate">{mensagemMeta}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {Number(avaliacaoCarrinho.economiaTotal || 0) > 0 && (
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-black">
                      - R$ {Number(avaliacaoCarrinho.economiaTotal || 0).toFixed(2)}
                    </span>
                  )}
                  <span className={`font-black text-[11px] shrink-0 ${
                    atingiuDistribuidor ? 'text-purple-600 dark:text-purple-400' : tabelaOrganica === 'atacado' ? 'text-blue-600 dark:text-blue-400' : (isDark ? 'text-slate-300' : 'text-black')
                  }`}>
                    {progressoPercent}%
                  </span>
                </div>
              </div>
              <div className={`w-full rounded-full h-2 overflow-hidden ${
                isDark ? 'bg-slate-800' : 'bg-slate-200'
              }`}>
                <div
                  className={`h-2 rounded-full transition-all duration-300 ease-out ${
                    atingiuDistribuidor ? 'bg-purple-600' : tabelaOrganica === 'atacado' ? 'bg-blue-600' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${progressoPercent}%` }}
                />
              </div>
            </div>
          );
        })()}

        {/* Lista de Itens do Carrinho */}
        <div className={`flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 ${
          isDark ? 'bg-[#08131A]' : 'bg-slate-100'
        }`}>
          {itens.length === 0 ? (
            <div className={`text-center py-16 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
              Seu carrinho está vazio.
            </div>
          ) : (
            itens.map((it) => (
              <div key={it.id} className={`p-3 rounded-2xl flex items-center justify-between gap-2.5 shadow-xs ${
                isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
              }`}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`font-black text-xs whitespace-nowrap shrink-0 ${isDark ? 'text-slate-300' : 'text-black'}`}>
                      {it.quantidade} x
                    </span>
                    <span
                      className={`font-bold text-xs uppercase truncate min-w-0 ${isDark ? 'text-white' : 'text-black'}`}
                      title={it.produto.nome}
                    >
                      {it.produto.nome}
                    </span>
                  </div>
                  {it.variacao && (
                    <span className={`text-[10px] block truncate ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                      Var: {it.variacao.valor_variacao_1}
                    </span>
                  )}
                  {(() => {
                    const minAtacado = (it.produto.tipo_minimo_atacado === 'minimo_sku' && Number(it.produto.qtd_minima_atacado) > 0) ? Number(it.produto.qtd_minima_atacado) : 0;
                    const minDistribuidor = (it.produto.tipo_minimo_autoatacado === 'minimo_sku' && Number(it.produto.qtd_minima_autoatacado) > 0) ? Number(it.produto.qtd_minima_autoatacado) : 0;
                    const msgVolume = minDistribuidor > 0 && (it.quantidade >= minAtacado || minAtacado === 0)
                      ? `Mínimo ${minDistribuidor} para distribuidor`
                      : minAtacado > 0
                      ? `Mínimo ${minAtacado} para atacado`
                      : null;

                    if (msgVolume) {
                      return (
                        <span className="text-[10px] block truncate text-amber-500 dark:text-amber-400 font-medium">
                          {msgVolume}
                        </span>
                      );
                    }
                    if (ehProdutoFracionado(it.produto)) {
                      return (
                        <span className={`text-[10px] block truncate ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                          {formatarLinhaCalculoItem(it.quantidade, Number(it.precoUnitario || 0), obterSiglaUnidade(it.produto))}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="font-black text-xs sm:text-sm whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                    R$ {Number(it.subtotal || 0).toFixed(2)}
                  </span>

                  {/* Controles de Quantidade */}
                  {isEdicaoTravada ? (
                    <div
                      className={`px-2 py-1 rounded-xl text-xs font-bold shrink-0 ${
                        isDark ? 'bg-[#08131A] text-slate-400 border border-slate-700' : 'bg-slate-100 text-slate-600 border-2 border-slate-300'
                      }`}
                      title="Quantidade bloqueada para pedidos já confirmados"
                    >
                      {it.quantidade}
                    </div>
                  ) : (
                    <div className={`flex items-center gap-1 p-1 rounded-xl shrink-0 ${
                      isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-50 border-2 border-slate-300'
                    }`}>
                      <button
                        type="button"
                        onClick={() => {
                          const passo = ehProdutoFracionado(it.produto) ? 0.1 : 1;
                          const novaQtd = Number((it.quantidade - passo).toFixed(3));
                          if (novaQtd > 0) {
                            atualizarQuantidade(it.id, novaQtd);
                          } else {
                            removerItem(it.id);
                          }
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold transition cursor-pointer active:scale-95 border ${
                          isDark ? 'bg-[#000000] border-slate-600 text-white hover:bg-slate-800' : 'bg-white border-slate-300 text-black hover:bg-slate-100'
                        }`}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <InputQuantidadeCarrinho
                        quantidade={it.quantidade}
                        ehFracionado={ehProdutoFracionado(it.produto)}
                        isDark={isDark}
                        className="w-10 sm:w-12 text-xs font-black"
                        onChangeQtd={(novaQtd) => atualizarQuantidade(it.id, novaQtd)}
                        onDoubleClick={() => {
                          if (ehProdutoFracionado(it.produto)) {
                            setItemPesagemModal({ produto: it.produto, variacao: it.variacao, quantidadeAtual: it.quantidade, cartId: it.id });
                          }
                        }}
                        title={ehProdutoFracionado(it.produto) ? "Digite o peso (kg) ou dê duplo toque para abrir a balança" : "Digite a quantidade"}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const passo = ehProdutoFracionado(it.produto) ? 0.1 : 1;
                          atualizarQuantidade(it.id, Number((it.quantidade + passo).toFixed(3)));
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold transition cursor-pointer active:scale-95 border ${
                          isDark ? 'bg-[#000000] border-slate-600 text-white hover:bg-slate-800' : 'bg-white border-slate-300 text-black hover:bg-slate-100'
                        }`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Resumo de Valores e Desconto */}
        {itens.length > 0 && (
          <div className={`p-4 rounded-2xl m-3 space-y-2.5 shadow-xs ${
            isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            {/* Identificação de Cliente e Tabela de Preço Ativa */}
            <div className={`pb-2.5 border-b flex items-center justify-between gap-2 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              {/* Cliente Vinculado ou Cliente Balcão */}
              {isEdicaoTravada ? (
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 text-xs font-bold min-w-0 flex-1 truncate cursor-not-allowed opacity-85 ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-600'
                  }`}
                  title="Cliente fixo para pedidos já confirmados"
                >
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {clienteSelecionado ? clienteSelecionado.nome : 'Cliente Balcão'}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => abrirSelecaoCliente('carrinho')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 font-bold text-xs transition shadow-2xs cursor-pointer min-w-0 flex-1 truncate ${
                    isDark
                      ? 'bg-[#08131A] border-slate-700 hover:border-slate-500 text-white'
                      : 'bg-slate-50 border-slate-300 hover:border-slate-400 text-black'
                  }`}
                  title="Toque para alterar ou vincular cliente"
                >
                  <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="truncate">
                    {clienteSelecionado ? clienteSelecionado.nome : 'Cliente Balcão'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-auto" />
                </button>
              )}

              {/* Tabela de Preço Ativa (apenas se mais de 1 tipo estiver ativo) */}
              {(() => {
                const tiposAtivos = loja?.tipos_venda || loja?.configuracoes_extras?.tipos_venda_ativos || { varejo: true, atacado: true, distribuidor: true };
                const qtdAtivos = [tiposAtivos.varejo !== false, tiposAtivos.atacado !== false, tiposAtivos.distribuidor !== false].filter(Boolean).length;
                if (qtdAtivos <= 1) return null;

                if (isEdicaoTravada) {
                  return (
                    <div
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border-2 shrink-0 cursor-not-allowed opacity-85 ${
                        isDark ? 'bg-[#08131A] text-slate-400 border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-300'
                      }`}
                      title="Tabela de preços bloqueada para este status"
                    >
                      <Tag className="w-3 h-3 text-slate-400" />
                      <span>
                        {tabelaPrecoCalculada === 'autoatacado'
                          ? 'Distribuidor'
                          : tabelaPrecoCalculada === 'atacado'
                          ? 'Atacado'
                          : 'Varejo'}
                      </span>
                    </div>
                  );
                }

                return (
                  <button
                    type="button"
                    onClick={() => setModalTabelaPrecoAberto(true)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-black border-2 transition shadow-2xs cursor-pointer active:scale-95 shrink-0 ${
                      tabelaPrecoCalculada === 'autoatacado'
                        ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40 hover:bg-purple-500/25'
                        : tabelaPrecoCalculada === 'atacado'
                        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40 hover:bg-blue-500/25'
                        : isDark
                        ? 'bg-[#08131A] text-white border-slate-700 hover:border-slate-500'
                        : 'bg-slate-50 text-black border-slate-300 hover:border-slate-400'
                    }`}
                    title="Toque para alterar tabela de preços"
                  >
                    <Tag className="w-3 h-3 text-current" />
                    <span>
                      {tabelaPrecoCalculada === 'autoatacado'
                        ? 'Distribuidor'
                        : tabelaPrecoCalculada === 'atacado'
                        ? 'Atacado'
                        : 'Varejo'}
                    </span>
                  </button>
                );
              })()}
            </div>

            <div className={`flex justify-between text-xs ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
              <span className="font-semibold">Subtotal:</span>
              <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>R$ {Number(subtotal || 0).toFixed(2)}</span>
            </div>

            {Number(desconto || 0) > 0 && (
              <div className="flex justify-between text-xs text-rose-600 dark:text-rose-400 font-bold">
                <span>Desconto aplicado:</span>
                <span>- R$ {Number(desconto || 0).toFixed(2)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setDescontoTempValor(desconto > 0 ? String(desconto) : '');
                setDescontoTempTipo(tipoDesconto);
                setModalDescontoAberto(true);
              }}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline block text-right w-full cursor-pointer"
            >
              {desconto > 0 ? 'Alterar desconto' : 'Dar desconto'}
            </button>

            {/* Componente de Forma de Entrega no Mobile (Segmentado Retirada / Envio padrão Desktop) */}
            <div className="space-y-1.5">
              <div className={`flex items-center justify-between p-2 rounded-xl border-2 text-xs shadow-2xs ${
                isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-slate-300'
              }`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  {pedidoEntrega?.tipo_atendimento === 'entrega' ? (
                    <Truck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Store className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  <span className={`font-bold truncate ${isDark ? 'text-white' : 'text-black'}`}>
                    Forma de Entrega:
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setTaxaEntrega?.(0);
                      setPedidoEntrega?.(FORMA_ENTREGA_RETIRADA_PADRAO);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 ${
                      pedidoEntrega?.tipo_atendimento !== 'entrega'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : isDark
                        ? 'bg-[#000000] text-slate-300 hover:bg-slate-900 border border-slate-700'
                        : 'bg-white text-black hover:bg-slate-100 border border-slate-300'
                    }`}
                  >
                    <Store className="w-3 h-3" />
                    <span>Retirada</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!clienteSelecionado?.id) {
                        setTaxaEntrega?.(0);
                        setPedidoEntrega?.(FORMA_ENTREGA_RETIRADA_PADRAO);
                        mostrarToast('Para entregas (Envio), selecione primeiro o cliente para carregar o endereço de entrega.', 'aviso');
                        return;
                      }
                      if (pedidoEntrega?.tipo_atendimento !== 'entrega') {
                        setTaxaEntrega?.(0);
                        setPedidoEntrega?.({
                          ...FORMA_ENTREGA_RETIRADA_PADRAO,
                          tipo_atendimento: 'entrega',
                          transportadora_nome: 'Envio a Definir',
                          servico_codigo: 'pendente'
                        });
                      }
                      onAbrirFormaEntrega?.();
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 ${
                      pedidoEntrega?.tipo_atendimento === 'entrega'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : isDark
                        ? 'bg-[#000000] text-slate-300 hover:bg-slate-900 border border-slate-700'
                        : 'bg-white text-black hover:bg-slate-100 border border-slate-300'
                    }`}
                  >
                    <Truck className="w-3 h-3" />
                    <span>Envio</span>
                  </button>
                </div>
              </div>

              {/* Informação e status do frete quando Envio estiver selecionado */}
              {pedidoEntrega?.tipo_atendimento === 'entrega' && (
                <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border-2 text-xs ${
                  isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}>
                  <span className={`font-semibold truncate ${isDark ? 'text-slate-300' : 'text-black'}`}>
                    {pedidoEntrega.transportadora_nome && pedidoEntrega.transportadora_nome !== 'Envio a Definir' && pedidoEntrega.servico_codigo !== 'pendente' ? (
                      <span>{pedidoEntrega.transportadora_nome}</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-bold">Opção de frete:</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pedidoEntrega.transportadora_nome && pedidoEntrega.transportadora_nome !== 'Envio a Definir' && pedidoEntrega.servico_codigo !== 'pendente' ? (
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {taxaEntrega > 0 ? `+ ${formatarMoeda(taxaEntrega)}` : (pedidoEntrega.is_frete_gratis ? 'Grátis' : formatarMoeda(0))}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAbrirFormaEntrega?.()}
                        className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 font-bold text-[11px] border border-amber-500/30 cursor-pointer flex items-center gap-1"
                      >
                        <span>A definir</span>
                        <span className="text-[10px]">✏️</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAbrirFormaEntrega?.()}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer ml-1"
                    >
                      Alterar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={`flex justify-between text-base font-black pt-1 border-t ${
              isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-black'
            }`}>
              <span>TOTAL:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-black">{formatarMoeda(total)}</span>
            </div>
          </div>
        )}

        {/* Barra Inferior com Botões de Salvar Pedido (Pendente) & Cobrança */}
        <div className={`p-3 border-t flex items-center gap-2 ${
          isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
        }`}>
          {onSalvarPedidoPendente && (
            <button
              type="button"
              disabled={itens.length === 0 || salvandoPendente}
              onClick={onSalvarPedidoPendente}
              className={`flex-1 h-12 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 active:scale-95 shadow-xs ${
                isDark
                  ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white shadow-sm'
              }`}
              title="Salva o pedido como Pendente sem concluir pagamento"
            >
              {salvandoPendente ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <FileText className="w-4 h-4 text-white" />
              )}
              <span className="truncate">{pedidoEmEdicao ? 'Atualizar' : 'Salvar Pedido'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onAbrirFechamento()}
            disabled={itens.length === 0 || salvandoPendente}
            className={`flex-[1.2] h-12 rounded-xl font-black text-xs flex items-center justify-between px-3 shadow-md transition cursor-pointer disabled:opacity-50 active:scale-95 ${
              isDark
                ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white'
            }`}
            title="Avançar para pagamento e concluir venda"
          >
            <span className="truncate">{totalItens} {totalItens === 1 ? 'item' : 'itens'} • R$ {Number(total || 0).toFixed(2)}</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-white" />
          </button>
        </div>

        {/* Modal de Desconto */}
        {modalDescontoAberto && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className={`${
              isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
            } rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95`}>
              <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
                <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Aplicar Desconto</h3>
                <button
                  type="button"
                  onClick={() => setModalDescontoAberto(false)}
                  className={`p-1.5 rounded-xl transition cursor-pointer ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDescontoTempTipo('valor')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition border-2 ${
                    descontoTempTipo === 'valor'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : isDark
                      ? 'bg-[#000000] border-slate-700 text-slate-300'
                      : 'bg-white border-slate-300 text-black'
                  }`}
                >
                  R$ Valor
                </button>
                <button
                  type="button"
                  onClick={() => setDescontoTempTipo('percentual')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition border-2 ${
                    descontoTempTipo === 'percentual'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : isDark
                      ? 'bg-[#000000] border-slate-700 text-slate-300'
                      : 'bg-white border-slate-300 text-black'
                  }`}
                >
                  % Porcentagem
                </button>
              </div>

              <input
                type="number"
                placeholder={descontoTempTipo === 'valor' ? 'Ex: 5.00' : 'Ex: 10%'}
                value={descontoTempValor}
                onChange={(e) => setDescontoTempValor(e.target.value)}
                className={`w-full rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400'
                }`}
                autoFocus
              />

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDescontoValor(0);
                    setModalDescontoAberto(false);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-white border-2 border-slate-300 text-black hover:bg-slate-50'
                  }`}
                >
                  Zerar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const num = parseFloat(descontoTempValor) || 0;
                    if (descontoTempTipo === 'percentual') {
                      setDescontoPercentual(num);
                    } else {
                      setDescontoValor(num);
                    }
                    setModalDescontoAberto(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Contextual de Confirmação: Limpar Carrinho */}
        {modalConfirmarLimparCarrinho && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className={`${
              isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
            } rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95 text-center`}>
              <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Limpar Carrinho</h3>
                <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700 font-medium'}`}>
                  Deseja realmente limpar todos os itens do carrinho?
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalConfirmarLimparCarrinho(false)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                    isDark
                      ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    limparCarrinho();
                    setModalConfirmarLimparCarrinho(false);
                    setSubTela('vender');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Tabela de Preço montado em Portal */}
        {renderModalTabelaPreco()}
      </div>
    );
  }

  // =========================================================================
  // TELA 001 & TELA 007: TELA PRINCIPAL DE VENDER (MOBILE)
  // =========================================================================
  return (
    <div className={`flex flex-col h-full overflow-hidden select-none ${
      isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* 1. Header Superior Mobile Unificado */}
      <MobileHeader
        titulo="Vender"
        onVoltar={() => {
          verificarSaidaComConfirmacao(() => {
            if (pedidoEmEdicao) {
              cancelarEdicaoPedido();
            }
            if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/dashboard');
            }
          });
        }}
        acoesDireita={
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${
              isOnline ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 animate-pulse'
            }`}
            title={isOnline ? 'Online - Supabase conectado' : 'Modo Offline Ativo'}
          >
            {isOnline ? <Wifi className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <WifiOff className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
            {pendentesCount > 0 ? (
              <span className="font-extrabold text-[9px] bg-amber-200 text-amber-900 px-1 rounded-full">
                {pendentesCount}
              </span>
            ) : null}
          </div>
        }
      />

      {/* 2. Barra de Ferramentas / Ações Rápidas (Ou Barra de Busca Tela 004) */}
      {buscaAberta ? (
        // TELA 004: Busca Aberta
        <div className={`px-4 py-2 border-b-2 flex items-center gap-2 shrink-0 animate-in fade-in ${
          isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
        }`}>
          <div className="relative flex-1">
            <input
              ref={inputBuscaRef}
              type="text"
              placeholder="Item ou código"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className={`w-full rounded-xl pl-3 pr-8 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
                isDark
                  ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500'
                  : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400'
              }`}
            />
            {termoBusca && (
              <button
                type="button"
                onClick={() => setTermoBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {/* Toggle Em Estoque na Busca Aberta */}
          <button
            type="button"
            onClick={() => {
              setApenasEmEstoque(prev => {
                const novo = !prev;
                try { localStorage.setItem('hubi_pdv_apenas_em_estoque', String(novo)); } catch {}
                return novo;
              });
            }}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 border ${
              apenasEmEstoque
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                : isDark
                ? 'bg-[#000000] border-slate-700 text-slate-300 hover:text-white'
                : 'bg-white border-2 border-slate-300 text-slate-700 hover:text-black'
            }`}
            title="Filtrar apenas produtos em estoque"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${apenasEmEstoque ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
            <span>Em estoque</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setBuscaAberta(false);
              setTermoBusca('');
            }}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        // Barra de Ícones Padrão (Tela 001)
        <div className={`px-4 py-2 border-b-2 flex items-center justify-between shrink-0 ${
          isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
        }`}>
          <div className={`flex items-center gap-4 ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
            {/* Busca 🔍 */}
            <button
              type="button"
              onClick={() => setBuscaAberta(true)}
              className={`p-1 transition cursor-pointer ${isDark ? 'hover:text-white' : 'hover:text-black'}`}
              title="Buscar Produto"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Leitor Código de Barras 📷 */}
            <button
              type="button"
              onClick={() => setSubTela('camera')}
              className={`p-1 transition cursor-pointer ${isDark ? 'hover:text-white' : 'hover:text-black'}`}
              title="Leitor de Código de Barras"
            >
              <div className={`w-5 h-5 border-2 border-dashed rounded flex items-center justify-center ${isDark ? 'border-slate-300' : 'border-slate-800'}`}>
                <span className={`w-2.5 h-0.5 ${isDark ? 'bg-slate-300' : 'bg-slate-800'}`} />
              </div>
            </button>

            {/* Item Avulso / Raio ⚡ */}
            <button
              type="button"
              onClick={() => setSubTela('avulso')}
              className={`p-1 transition cursor-pointer ${isDark ? 'hover:text-white' : 'hover:text-black'}`}
              title="Vender item não cadastrado"
            >
              <Zap className="w-5 h-5" />
            </button>

            {/* Alternador Grade / Lista ☷ / 㗊 */}
            <button
              type="button"
              onClick={() => setModoVisualizacao(modoVisualizacao === 'grade' ? 'lista' : 'grade')}
              className={`p-1 transition cursor-pointer ${isDark ? 'hover:text-white' : 'hover:text-black'}`}
              title="Alternar Visualização Grade/Lista"
            >
              {modoVisualizacao === 'grade' ? (
                <List className="w-5 h-5" />
              ) : (
                <LayoutGrid className="w-5 h-5" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Filtro Em Estoque */}
            <button
              type="button"
              onClick={() => {
                setApenasEmEstoque(prev => {
                  const novo = !prev;
                  try { localStorage.setItem('hubi_pdv_apenas_em_estoque', String(novo)); } catch {}
                  return novo;
                });
              }}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                apenasEmEstoque
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                  : isDark
                  ? 'border border-slate-700 text-slate-300 bg-[#000000] hover:text-white'
                  : 'border-2 border-slate-300 text-slate-700 bg-white hover:text-black'
              }`}
              title="Filtrar apenas produtos em estoque"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${apenasEmEstoque ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
              <span>Em estoque</span>
            </button>

            {/* Multiplicador 1X */}
            <button
              type="button"
              onClick={() => setModalMultiplicador(true)}
              className={`px-2.5 py-1 rounded-xl text-xs font-black shadow-xs transition cursor-pointer ${
                isDark
                  ? 'border border-slate-700 text-white bg-[#000000] hover:bg-slate-900'
                  : 'border-2 border-slate-300 text-black bg-white hover:bg-slate-50'
              }`}
            >
              {multiplicadorQtd}X
            </button>
          </div>
        </div>
      )}

      {/* 3. Menu Dropdown Seletor de Categorias */}
      <div className={`px-3 py-2 border-b-2 flex items-center gap-2 shrink-0 ${
        isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
      }`}>
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
            <Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <select
            value={categoriaAtiva}
            onChange={(e) => setCategoriaAtiva(e.target.value)}
            className={`w-full rounded-xl pl-9 pr-9 py-2 text-xs font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer shadow-xs transition ${
              isDark
                ? 'bg-[#000000] border border-slate-700 text-white'
                : 'bg-white border-2 border-slate-300 text-black'
            }`}
          >
            <option value="tudo" className={isDark ? 'bg-[#000000] text-white' : 'bg-white text-black'}>Todas as Categorias</option>
            <option value="destaques" className={isDark ? 'bg-[#000000] text-white' : 'bg-white text-black'}>⭐ Destaques</option>
            {categoriasOrdenadas.map(cat => (
              <option key={cat.id} value={cat.id} className={isDark ? 'bg-[#000000] text-white' : 'bg-white text-black'}>
                {cat.nome}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 flex items-center">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 4. Catálogo de Produtos */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3">
        {produtosFiltrados.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-64 space-y-2 text-xs ${
            isDark ? 'text-slate-400' : 'text-slate-600 font-semibold'
          }`}>
            <Package className="w-8 h-8 stroke-1" />
            <p>Nenhum produto encontrado.</p>
          </div>
        ) : modoVisualizacao === 'grade' ? (
          // MODO GRADE: 3 COLUNAS COMPACTAS (TELA 001)
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {produtosFiltrados.map((produto) => {
              const qtdNoCarrinho = mapaQuantidadesCarrinho.get(produto.id) || 0;
              let precoFinal = produto.preco_venda_varejo;
              if (tabelaPrecoCalculada === 'atacado' && produto.preco_venda_atacado) {
                precoFinal = produto.preco_venda_atacado;
              } else if (tabelaPrecoCalculada === 'autoatacado' && produto.preco_venda_autoatacado) {
                precoFinal = produto.preco_venda_autoatacado;
              } else if (produto.promocao_ativa && produto.preco_promocional) {
                precoFinal = produto.preco_promocional;
              }
              const precoOriginal = (produto.promocao_ativa && produto.preco_promocional && precoFinal !== produto.preco_venda_varejo) ? produto.preco_venda_varejo : null;
              const estoqueQtd = Number(produto.quantidade_estoque ?? 0);
              const isEsgotado = estoqueQtd <= 0;
              const temEstoqueBaixo = estoqueQtd > 0 && estoqueQtd <= Number(produto.estoque_minimo_alerta || 0);

              return (
                <div
                  key={produto.id}
                  onClick={() => handleClicarProduto(produto)}
                  className={`rounded-xl overflow-hidden shadow-xs active:scale-95 transition-all duration-100 flex flex-col h-full cursor-pointer group ${
                    isDark
                      ? 'bg-[#000000] border border-slate-700 hover:border-slate-600'
                      : 'bg-white border-2 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {/* Wrapper com proporção 1:1 rigorosamente travada */}
                  <div className={`w-full aspect-square relative flex items-center justify-center overflow-hidden rounded-t-xl shrink-0 ${
                    isDark ? 'bg-[#08131A]' : 'bg-white'
                  }`}>
                    {produto.fotos_urls && produto.fotos_urls[0] ? (
                      <img
                        src={produto.fotos_urls[0]}
                        alt={produto.nome}
                        className="w-full h-full object-cover pointer-events-none select-none"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Package className="w-8 h-8 opacity-40" />
                      </div>
                    )}

                    {/* Indicador de Esgotado ou Estoque Baixo */}
                    {isEsgotado ? (
                      <div className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex items-center justify-center p-1">
                        <span className="bg-rose-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow uppercase tracking-wider">
                          Esgotado
                        </span>
                      </div>
                    ) : temEstoqueBaixo ? (
                      <span className="absolute top-1 left-1 bg-amber-500/90 text-slate-950 font-black text-[8px] px-1 py-0.2 rounded shadow">
                        Est: {estoqueQtd}
                      </span>
                    ) : null}

                    {/* Badge Verde de Quantidade Acumulada */}
                    {qtdNoCarrinho > 0 && (
                      <span className="absolute top-1 right-1 bg-emerald-600 text-white font-black text-[10px] w-5 h-5 rounded-md flex items-center justify-center shadow-md animate-in zoom-in-75">
                        {qtdNoCarrinho}
                      </span>
                    )}
                  </div>

                  {/* Informações do produto niveladas */}
                  <div className={`p-2 flex flex-col flex-1 justify-between border-t-2 ${
                    isDark ? 'border-slate-800 bg-[#000000]' : 'border-slate-200 bg-white'
                  }`}>
                    <div className="flex items-start gap-1">
                      {produto.destaque && (
                        <span className="text-amber-500 text-[10px] shrink-0">★</span>
                      )}
                      <h3
                        className={`text-[11px] font-bold line-clamp-2 h-[2.25rem] leading-[1.125rem] overflow-hidden select-none uppercase ${
                          isDark ? 'text-white' : 'text-black'
                        }`}
                        title={produto.nome}
                      >
                        {produto.nome}
                      </h3>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <span className="font-black text-xs text-emerald-600 dark:text-emerald-400">
                        R$ {Number(precoFinal).toFixed(2)}
                      </span>
                      {precoOriginal && (
                        <span className="text-[9px] text-slate-400 line-through">
                          R$ {Number(precoOriginal).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // MODO LISTA: 1 LINHA POR PRODUTO (TELA 007)
          <div className={`rounded-2xl overflow-hidden ${
            isDark ? 'divide-y divide-slate-800 bg-[#000000] border border-slate-700' : 'divide-y-2 divide-slate-200 bg-white border-2 border-slate-300'
          }`}>
            {produtosFiltrados.map((produto) => {
              const qtdNoCarrinho = mapaQuantidadesCarrinho.get(produto.id) || 0;
              let precoFinal = produto.preco_venda_varejo;
              if (tabelaPrecoCalculada === 'atacado' && produto.preco_venda_atacado) {
                precoFinal = produto.preco_venda_atacado;
              } else if (tabelaPrecoCalculada === 'autoatacado' && produto.preco_venda_autoatacado) {
                precoFinal = produto.preco_venda_autoatacado;
              } else if (produto.promocao_ativa && produto.preco_promocional) {
                precoFinal = produto.preco_promocional;
              }
              const precoOriginal = (produto.promocao_ativa && produto.preco_promocional && precoFinal !== produto.preco_venda_varejo) ? produto.preco_venda_varejo : null;
              const estoqueQtd = Number(produto.quantidade_estoque ?? 0);
              const isEsgotado = estoqueQtd <= 0;
              const temEstoqueBaixo = estoqueQtd > 0 && estoqueQtd <= Number(produto.estoque_minimo_alerta || 0);

              return (
                <div
                  key={produto.id}
                  onClick={() => handleClicarProduto(produto)}
                  className={`p-3 flex items-center justify-between transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-900 active:bg-slate-800' : 'hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border-2 flex items-center justify-center ${
                      isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
                    }`}>
                      {produto.fotos_urls?.[0] ? (
                        <img
                          src={produto.fotos_urls[0]}
                          alt={produto.nome}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <Package className="w-5 h-5 text-slate-400 opacity-60" />
                      )}
                      {isEsgotado ? (
                        <span className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex items-center justify-center text-[7px] font-black text-rose-300">
                          ESGOTADO
                        </span>
                      ) : temEstoqueBaixo ? (
                        <span className="absolute top-0.5 left-0.5 bg-amber-500/90 text-slate-950 font-black text-[7px] px-0.5 rounded shadow leading-none">
                          {estoqueQtd}
                        </span>
                      ) : null}
                      {qtdNoCarrinho > 0 && (
                        <span className="absolute top-0.5 right-0.5 bg-emerald-600 text-white font-black text-[9px] w-4 h-4 rounded flex items-center justify-center">
                          {qtdNoCarrinho}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 max-w-[190px]">
                      <div className="flex items-center gap-1">
                        {produto.destaque && <span className="text-amber-500 text-xs">★</span>}
                        <h3 className={`font-bold text-xs uppercase truncate ${isDark ? 'text-white' : 'text-black'}`}>{produto.nome}</h3>
                      </div>
                      <span className={`text-[10px] block font-mono ${isDark ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
                        Cód. {produto.codigo_interno || produto.codigo_barras?.slice(-4) || '1000'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    {precoOriginal && (
                      <span className="text-[10px] text-slate-400 line-through block">
                        R$ {Number(precoOriginal).toFixed(2)}
                      </span>
                    )}
                    <span className="font-black text-xs text-emerald-600 dark:text-emerald-400">
                      R$ {Number(precoFinal).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Barra Flutuante Inferior (Acumulador de Itens) */}
      <div className={`p-3 border-t-2 shadow-lg shrink-0 ${
        isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
      }`}>
        {itens.length === 0 ? (
          <div className={`w-full py-3.5 rounded-2xl border-2 text-center font-bold text-xs ${
            isDark ? 'bg-[#000000] border-slate-700 text-slate-400' : 'bg-white border-slate-300 text-slate-600'
          }`}>
            Nenhum item
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSubTela('carrinho')}
            className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black text-sm flex items-center justify-between shadow-md transition cursor-pointer"
          >
            <span>
              {totalItens} {totalItens === 1 ? 'item' : 'itens'} = R$ {total.toFixed(2)}
            </span>
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Modal de Escolha do Multiplicador (1x, 2x, 3x, 5x, 10x) */}
      {modalMultiplicador && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className={`${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
          } rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95`}>
            <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
              <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Multiplicador de Quantidade</h3>
              <button
                type="button"
                onClick={() => setModalMultiplicador(false)}
                className={`p-1.5 rounded-xl transition cursor-pointer ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
              Escolha a quantidade a ser adicionada a cada toque no produto:
            </p>

            <div className="grid grid-cols-5 gap-2 font-black text-sm">
              {[1, 2, 3, 5, 10].map((fator) => (
                <button
                  key={fator}
                  type="button"
                  onClick={() => {
                    setMultiplicadorQtd(fator);
                    setModalMultiplicador(false);
                  }}
                  className={`py-3 rounded-2xl transition cursor-pointer ${
                    multiplicadorQtd === fator
                      ? 'bg-emerald-600 text-white border-2 border-emerald-600 shadow-sm'
                      : isDark
                      ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
                      : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {fator}X
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Tabela de Preço montado em Portal */}
      {renderModalTabelaPreco()}

      {/* DRAWER MENU UNIFICADO MOBILE */}
      <MobileMenuDrawer
        aberto={menuDrawerAberto}
        onFechar={() => setMenuDrawerAberto(false)}
        pedidosConfirmadosCount={pedidosConfirmadosCount}
      />
{itemPesagemModal && (
        <ModalInputPesoFracionado
          aberto={Boolean(itemPesagemModal)}
          onFechar={() => setItemPesagemModal(null)}
          produtoNome={itemPesagemModal.produto.nome}
          unidadeMedida={obterSiglaUnidade(itemPesagemModal.produto).toUpperCase()}
          precoPorKg={Number(itemPesagemModal.variacao ? itemPesagemModal.variacao.preco_venda_varejo : itemPesagemModal.produto.preco_venda_varejo) || 0}
          quantidadeAtual={itemPesagemModal.quantidadeAtual || 1}
          temaDark={isDark}
          onConfirmar={(pesoKg: number) => {
            if (itemPesagemModal.cartId) {
              atualizarQuantidade(itemPesagemModal.cartId, pesoKg);
            } else {
              adicionarItem(itemPesagemModal.produto, itemPesagemModal.variacao, pesoKg);
            }
            setItemPesagemModal(null);
          }}
        />
      )}
    </div>
  );
};