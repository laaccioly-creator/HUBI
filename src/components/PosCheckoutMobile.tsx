import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronUp,
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
  AlertCircle,
  Wifi,
  WifiOff,
  FileText,
  Loader2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import { useCart, FORMA_ENTREGA_RETIRADA_PADRAO } from '../contexts/CartContext';
import { Produto, VariacaoProduto, Cliente, FormaPagamento, Categoria, TabelaPreco } from '../types';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useTheme } from '../contexts/ThemeContext';
import { MobileHeader } from './layout/MobileHeader';
import { getCategoriaPeso } from './PosCheckout';
import { audioService } from '../services/audioService';
import {
  formatarMoeda,
  ehProdutoFracionado,
  obterSiglaUnidade,
  formatarLinhaCalculoItem,
  normalizarTelefoneComDDI
} from '../utils/formatters';
import { ModalInputPesoFracionado } from './ui/ModalInputPesoFracionado';
import { decodificarEtiquetaBalancaEan13 } from '../lib/validations/pesagemSchema';
import { formatarDataPtBr } from '../services/agendamentoService';
import type { ItemAgendamentoInfo } from '../types/agendamento';
import { SeletorCategoriasHibrido } from './ui/SeletorCategoriasHibrido';
import {
  produtoPertenceAoFiltroCategoria,
  agruparProdutosPorBlocosDeCategoria,
  obterTextoBadgeCategoriaProduto
} from '../utils/categoriasHierarquia';
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
  onAgendarServico?: (produto: Produto, cartId?: string, agendamentoExistente?: ItemAgendamentoInfo | null) => void;
  onAbrirFormaEntrega?: () => void;
  isOnline?: boolean;
  pendentesCount?: number;
  subTelaControlada?: SubTelaMobile;
  onSubTelaChange?: (subTela: SubTelaMobile) => void;
  carregando?: boolean;
  sincronizando?: boolean;
  onSincronizarAgora?: () => void;
  onResetFreteConfirmado?: () => void;
}

export type SubTelaMobile = 'vender' | 'menu' | 'clientes' | 'camera' | 'avulso' | 'carrinho';

export const PosCheckoutMobile: React.FC<PosCheckoutMobileProps> = ({
  produtos,
  categorias,
  clientes,
  onAbrirFechamento,
  onSalvarPedidoPendente,
  salvandoPendente = false,
  onAbrirNovoCliente,
  onAbrirVariacoesModal,
  onAgendarServico,
  onAbrirFormaEntrega,
  isOnline = true,
  pendentesCount = 0,
  subTelaControlada,
  onSubTelaChange,
  carregando = false,
  sincronizando = false,
  onSincronizarAgora,
  onResetFreteConfirmado
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loja } = useAuth();
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
    valorTaxaDomicilio = 0,
    temProdutoFisico = true,
    isPedidoHibrido = false,
    temServicoDomicilio = false,
    levarProdutoNoAtendimento = true,
    setLevarProdutoNoAtendimento,
    infoTaxaVisita,
    alternarAbatimentoVisita,
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
  const [tipoVendaDropdownAberto, setTipoVendaDropdownAberto] = useState<boolean>(false);
  const [formaEntregaDropdownAberto, setFormaEntregaDropdownAberto] = useState<boolean>(false);
  const tipoVendaDropdownRef = useRef<HTMLDivElement>(null);
  const formaEntregaDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (tipoVendaDropdownRef.current && !tipoVendaDropdownRef.current.contains(target)) {
        setTipoVendaDropdownAberto(false);
      }
      if (formaEntregaDropdownRef.current && !formaEntregaDropdownRef.current.contains(target)) {
        setFormaEntregaDropdownAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Estados da Tela 003: Clientes
  const [buscaCliente, setBuscaCliente] = useState<string>('');

  // Estados da Tela 005: Leitor Câmera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [cameraSomAtivo, setCameraSomAtivo] = useState<boolean>(true);
  const [tochaAtiva, setTochaAtiva] = useState<boolean>(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [ultimoCodigoBipado, setUltimoCodigoBipado] = useState<string | null>(null);
  const [codigoManualCamera, setCodigoManualCamera] = useState<string>('');
  const isScanningLockedRef = useRef<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  // Estados da Tela 006: Item Avulso
  const [valorAvulsoCentavos, setValorAvulsoCentavos] = useState<number>(0);
  const [descricaoAvulso, setDescricaoAvulso] = useState<string>('');
  const [editandoDescricaoAvulso, setEditandoDescricaoAvulso] = useState<boolean>(false);

  // Estados da Tela 008: Carrinho
  const [modalDescontoAberto, setModalDescontoAberto] = useState<boolean>(false);
  const [modalConfirmarLimparCarrinho, setModalConfirmarLimparCarrinho] = useState<boolean>(false);
  const [descontoTempValor, setDescontoTempValor] = useState<string>('');
  const [descontoTempTipo, setDescontoTempTipo] = useState<'valor' | 'percentual'>('valor');

  // Pilha LIFO de Overlays Mobile (sub-telas registradas antes dos modais filhos)
  useRegisterOverlay(buscaAberta, () => { setBuscaAberta(false); setTermoBusca(''); }, 'pdv-mobile-busca', 'submenu');
  useRegisterOverlay(subTela === 'clientes', () => setSubTela(origemClientes), 'pdv-mobile-subtela-clientes', 'drawer');
  useRegisterOverlay(subTela === 'camera', () => setSubTela('vender'), 'pdv-mobile-subtela-camera', 'drawer');
  useRegisterOverlay(subTela === 'avulso', () => setSubTela('vender'), 'pdv-mobile-subtela-avulso', 'drawer');
  useRegisterOverlay(subTela === 'carrinho', () => setSubTela('vender'), 'pdv-mobile-subtela-carrinho', 'drawer');
  useRegisterOverlay(tipoVendaDropdownAberto, () => setTipoVendaDropdownAberto(false), 'pdv-mobile-dropdown-tipo-venda', 'popover');
  useRegisterOverlay(formaEntregaDropdownAberto, () => setFormaEntregaDropdownAberto(false), 'pdv-mobile-dropdown-forma-entrega', 'popover');
  useRegisterOverlay(modalMultiplicador, () => setModalMultiplicador(false), 'pdv-mobile-modal-multiplicador', 'modal');
  useRegisterOverlay(modalDescontoAberto, () => setModalDescontoAberto(false), 'pdv-mobile-modal-desconto', 'modal');
  useRegisterOverlay(modalConfirmarLimparCarrinho, () => setModalConfirmarLimparCarrinho(false), 'pdv-mobile-modal-limpar-carrinho', 'modal');

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

      // Filtro de produtos em estoque (serviços nunca dependem de estoque físico)
      if (apenasEmEstoque && p.tipo_item !== 'servico') {
        const estoqueTotal = p.tem_variacoes && p.variacoes && p.variacoes.length > 0
          ? p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0)
          : Number(p.quantidade_estoque || 0);
        if (estoqueTotal <= 0) return false;
      }

      // Filtro de categoria
      if (categoriaAtiva === 'destaques') {
        return p.destaque === true;
      } else if (categoriaAtiva !== 'tudo') {
        return produtoPertenceAoFiltroCategoria(p, categoriaAtiva, categorias, loja?.id);
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
  }, [produtos, termoBusca, categoriaAtiva, apenasEmEstoque, mapaCategorias, categorias, loja?.id]);

  const blocosProdutosMobile = useMemo(() => {
    if (categoriaAtiva === 'tudo') {
      return agruparProdutosPorBlocosDeCategoria(produtosFiltrados, categoriasOrdenadas, loja?.id);
    }
    return [
      {
        categoriaId: categoriaAtiva,
        categoriaNome: '',
        emoji: '',
        produtos: produtosFiltrados
      }
    ];
  }, [produtosFiltrados, categoriaAtiva, categoriasOrdenadas, loja?.id]);

  // Clientes filtrados na tela 003
  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return clientes;
    const t = buscaCliente.toLowerCase().trim();
    const docBusca = t.replace(/\D/g, '');
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(t) ||
      (c.email && c.email.toLowerCase().includes(t)) ||
      (c.telefone && c.telefone.includes(t)) ||
      (c.whatsapp && c.whatsapp.includes(t)) ||
      (c.numero_documento && (
        c.numero_documento.toLowerCase().includes(t) ||
        (docBusca.length >= 3 && c.numero_documento.replace(/\D/g, '').includes(docBusca))
      ))
    );
  }, [clientes, buscaCliente]);

  // Handler para clique acumulativo em um produto
  const handleClicarProduto = (produto: Produto) => {
    if (isEdicaoTravada) {
      mostrarToast('Este pedido está bloqueado para alterações de itens.', 'aviso');
      return;
    }
    if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
      onAbrirVariacoesModal(produto);
    } else if (ehProdutoFracionado(produto)) {
      setItemPesagemModal({ produto, quantidadeAtual: multiplicadorQtd > 1 ? multiplicadorQtd : 1 });
    } else if (produto.tipo_item === 'servico' && produto.requer_agendamento && onAgendarServico) {
      onAgendarServico(produto);
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
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'itf', 'qr_code', 'upc_a', 'upc_e']
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
    if (isEdicaoTravada) {
      mostrarToast('Este pedido está bloqueado para alterações de itens.', 'aviso');
      return;
    }
    if (cameraSomAtivo) {
      audioService.playBeep();
    }

    const codigoLimpo = codigo.trim();
    const codigoLower = codigoLimpo.toLowerCase();

    // 1. Etiqueta de Balança EAN-13 (ex: 2CCCCPPPPPD)
    const decodificadoPre = decodificarEtiquetaBalancaEan13(codigoLimpo);
    if (decodificadoPre?.valido && decodificadoPre.codigoProduto) {
      const codSemZeros = decodificadoPre.codigoProduto.replace(/^0+/, '');
      const prodBalanca = produtos.find(p =>
        (p.codigo_balanca !== null && p.codigo_balanca !== undefined && String(p.codigo_balanca).replace(/^0+/, '') === codSemZeros) ||
        (p.codigo_interno && p.codigo_interno.trim().replace(/^0+/, '') === codSemZeros) ||
        (p.codigo_barras && p.codigo_barras.trim().replace(/^0+/, '') === codSemZeros)
      );

      if (prodBalanca) {
        const precoKg = Number(prodBalanca.preco_venda_varejo || 0);
        const decodificado = decodificarEtiquetaBalancaEan13(codigoLimpo, precoKg > 0 ? precoKg : undefined);
        const pesoFinal = Number((decodificado?.pesoKg || 0).toFixed(3));
        if (pesoFinal > 0) {
          adicionarItem(prodBalanca, null, pesoFinal);
          mostrarToast(`${prodBalanca.nome} (${pesoFinal.toFixed(3)} ${obterSiglaUnidade(prodBalanca)}) adicionado!`, 'sucesso');
          return;
        }
      }
    }

    // 2. Busca por produto principal ou variação (EAN / SKU)
    let prodEncontrado: Produto | undefined;
    let variacaoEncontrada: VariacaoProduto | null = null;

    prodEncontrado = produtos.find(p =>
      (p.codigo_barras && p.codigo_barras.trim().toLowerCase() === codigoLower) ||
      (p.codigo_interno && p.codigo_interno.trim().toLowerCase() === codigoLower)
    );

    if (!prodEncontrado) {
      for (const p of produtos) {
        if (p.tem_variacoes && p.variacoes?.length) {
          const vMatch = p.variacoes.find(v =>
            (v.codigo_barras && v.codigo_barras.trim().toLowerCase() === codigoLower) ||
            (v.sku && v.sku.trim().toLowerCase() === codigoLower)
          );
          if (vMatch) {
            prodEncontrado = p;
            variacaoEncontrada = vMatch;
            break;
          }
        }
      }
    }

    if (!prodEncontrado) {
      mostrarToast(`Produto com código "${codigoLimpo}" não encontrado no catálogo.`, 'aviso');
      return;
    }

    if (variacaoEncontrada) {
      if (ehProdutoFracionado(prodEncontrado)) {
        setItemPesagemModal({ produto: prodEncontrado, variacao: variacaoEncontrada, quantidadeAtual: multiplicadorQtd > 1 ? multiplicadorQtd : 1 });
      } else {
        adicionarItem(prodEncontrado, variacaoEncontrada, multiplicadorQtd);
        if (multiplicadorQtd > 1) setMultiplicadorQtd(1);
        mostrarToast(`${prodEncontrado.nome} (${[variacaoEncontrada.valor_variacao_1, variacaoEncontrada.valor_variacao_2].filter(Boolean).join(' / ')}) adicionado!`, 'sucesso');
      }
      return;
    }

    handleClicarProduto(prodEncontrado);
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
    if (isEdicaoTravada) {
      mostrarToast('Este pedido está bloqueado para inclusão de novos itens.', 'aviso');
      return;
    }
    const valorReal = valorAvulsoCentavos / 100;
    if (valorReal <= 0) {
      mostrarToast('Informe um valor maior que zero.', 'aviso');
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



  // =========================================================================
  // SUB-TELAS MOBILE DENTRO DE RENDERIZADOR UNIFICADO (garante modais globais)
  // =========================================================================
  const cadernetaAtivaLoja = Boolean(
    loja?.caderneta_ativa ?? loja?.configuracoes_extras?.pagamentos?.caderneta_ativa
  );
  const fiadoAtivoLoja = !cadernetaAtivaLoja && Boolean(loja?.configuracoes_extras?.pagamentos?.permitir_fiado ?? true);

  const renderConteudoSubTela = (): React.ReactNode => {
    // =======================================================================
    // TELA 003: SELEÇÃO E CADASTRO DE CLIENTE
    // =======================================================================
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
                className={`hubi-btn-neutral p-1.5 rounded-xl transition cursor-pointer ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Adicionar cliente</h2>
            </div>

            <div className="flex items-center gap-2">
              {onSincronizarAgora && (
                <button
                  type="button"
                  onClick={() => onSincronizarAgora()}
                  disabled={sincronizando}
                  className={`hubi-btn-neutral p-2 rounded-xl transition cursor-pointer disabled:opacity-50 ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-slate-300 hover:bg-slate-900 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
                  }`}
                  title="Sincronizar clientes"
                >
                  <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onAbrirNovoCliente()}
                className="hubi-btn-cta w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-sm transition cursor-pointer"
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
                placeholder="Procure por nome, CPF/CNPJ, email ou telefone"
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                className={`w-full rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-emerald-500 shadow-sm ${
                  isDark
                    ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500'
                    : 'bg-white border border-slate-300 text-black placeholder:text-slate-500'
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
                  <span className={`text-[10px] block truncate ${isDark ? 'text-slate-300' : 'text-slate-800 font-medium'}`}>
                    {cadernetaAtivaLoja && clienteSelecionado.permite_caderneta
                      ? `Caderneta disp.: R$ ${Math.max(0, Number(clienteSelecionado.limite_caderneta || 0) - Number(clienteSelecionado.saldo_devedor_caderneta || 0)).toFixed(2)}`
                      : fiadoAtivoLoja && clienteSelecionado.permite_fiado
                      ? `Fiado disp.: R$ ${Math.max(0, Number(clienteSelecionado.limite_credito || 0)).toFixed(2)}`
                      : 'Cliente selecionado para esta venda'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClienteSelecionado(null)}
                className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer shrink-0"
              >
                Remover
              </button>
            </div>
          )}

          {/* Lista de Clientes */}
          <div className={`flex-1 overflow-y-auto divide-y ${isDark ? 'divide-slate-800 bg-[#08131A]' : 'divide-slate-200 bg-slate-100'}`}>
            {clientesFiltrados.length === 0 ? (
              <div className={`p-8 text-center text-xs ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                Nenhum cliente encontrado.
              </div>
            ) : (
              clientesFiltrados.map((cliente) => {
                const dispCaderneta = Math.max(0, Number(cliente.limite_caderneta || 0) - Number(cliente.saldo_devedor_caderneta || 0));
                const dispFiado = Math.max(0, Number(cliente.limite_credito || 0));
                const waDigits = cliente.whatsapp ? normalizarTelefoneComDDI(cliente.whatsapp) : '';
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
                        {cadernetaAtivaLoja && cliente.permite_caderneta && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                            isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          }`}>
                            Caderneta: R$ {dispCaderneta.toFixed(2)}
                          </span>
                        )}
                        {fiadoAtivoLoja && cliente.permite_fiado && dispFiado > 0 && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                            isDark ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' : 'bg-purple-50 text-purple-900 border-purple-300'
                          }`}>
                            Fiado: R$ {dispFiado.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                        {cliente.telefone ? `Tel: ${cliente.telefone}` : 'Sem telefone cadastrado'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {waDigits && (
                        <a
                          href={`https://wa.me/${waDigits}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition"
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                      <ChevronRight className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    // =======================================================================
    // TELA 005: LEITOR DE CÓDIGO DE BARRAS PELA CÂMERA
    // =======================================================================
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
                className={`hubi-btn-neutral p-1.5 rounded-xl transition cursor-pointer ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Leitor</h2>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCameraSomAtivo(!cameraSomAtivo)}
                className={`p-1.5 rounded-xl transition cursor-pointer ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-800 hover:text-black'
                }`}
                title={cameraSomAtivo ? 'Desativar bipe' : 'Ativar bipe'}
              >
                {cameraSomAtivo ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
              </button>

              <button
                type="button"
                onClick={() => setModalMultiplicador(true)}
                className={`hubi-btn-neutral px-2.5 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
                }`}
              >
                {multiplicadorQtd}X
              </button>

              <button
                type="button"
                onClick={() => abrirSelecaoCliente('vender')}
                className={`hubi-btn-neutral w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition cursor-pointer ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
                }`}
                title={clienteSelecionado ? `Cliente: ${clienteSelecionado.nome}` : 'Selecionar cliente'}
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
              className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/60 text-white text-[11px] font-bold backdrop-blur cursor-pointer"
            >
              {tochaAtiva ? 'Lanterna On' : 'Lanterna Off'}
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
            {ultimoCodigoBipado && (
              <div className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border ${
                isDark ? 'bg-slate-900 border-slate-700 text-emerald-400' : 'bg-white border-slate-300 text-black'
              }`}>
                Último código lido: <span className="font-mono font-bold">{ultimoCodigoBipado}</span>
              </div>
            )}

            {itens.length === 0 ? (
              <div className={`text-center py-8 text-xs ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                Aponte a câmera para o código de barras do produto ou digite abaixo.
              </div>
            ) : (
              itens.map((it) => (
                <div key={it.id} className={`flex items-center justify-between text-xs p-2.5 rounded-xl shadow-xs ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border border-slate-300 text-black'
                }`}>
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className={`font-bold shrink-0 ${isDark ? 'text-slate-300' : 'text-black font-extrabold'}`}>{it.quantidade} x</span>
                    <span className={`font-bold uppercase truncate ${isDark ? 'text-white' : 'text-black'}`}>{it.produto.nome}</span>
                  </div>
                  <span className={`font-black shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>R$ {Number(it.subtotal || 0).toFixed(2)}</span>
                </div>
              ))
            )}

            {itens.length > 0 && (
              <div className="pt-2 text-right space-y-1">
                {permissions.podeDarDesconto && !isEdicaoTravada && (
                  <button
                    type="button"
                    onClick={() => {
                      setDescontoTempValor(
                        tipoDesconto === 'percentual'
                          ? (descontoPercentual > 0 ? String(descontoPercentual) : '')
                          : (desconto > 0 ? String(desconto) : '')
                      );
                      setDescontoTempTipo(tipoDesconto);
                      setModalDescontoAberto(true);
                    }}
                    className={`text-xs font-bold hover:underline block w-full text-right cursor-pointer ${
                      isDark ? 'text-emerald-400' : 'text-emerald-800'
                    }`}
                  >
                    {desconto > 0 ? 'Alterar desconto' : 'Dar desconto'}
                  </button>
                )}
                <div className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>
                  TOTAL: <span className={isDark ? 'text-emerald-400 font-black' : 'text-emerald-800 font-black'}>{formatarMoeda(total)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Entrada Manual de Código de Barras (fallback USB / dispositivos sem BarcodeDetector) + Ir ao Carrinho */}
          <div className={`p-3 border-t space-y-2 ${
            isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
          }`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!codigoManualCamera.trim()) return;
                handleCodigoBarrasDetectado(codigoManualCamera);
                setCodigoManualCamera('');
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={codigoManualCamera}
                onChange={(e) => setCodigoManualCamera(e.target.value)}
                placeholder="Digitar EAN / código da balança / SKU..."
                className={`flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border border-slate-300 text-black placeholder:text-slate-500'
                }`}
              />
              <button
                type="submit"
                disabled={!codigoManualCamera.trim()}
                className={`hubi-btn-neutral px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-white hover:bg-slate-900' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
                }`}
              >
                Bipar
              </button>
            </form>

            <button
              type="button"
              onClick={() => setSubTela('carrinho')}
              disabled={itens.length === 0}
              className="hubi-btn-cta w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-between px-4 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'} = R$ {total.toFixed(2)}</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      );
    }

    // =======================================================================
    // TELA 006: VENDER ITEM NÃO CADASTRADO (ITEM AVULSO)
    // =======================================================================
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
              className={`hubi-btn-neutral p-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Vender item não cadastrado</h2>
          </div>

          {/* Display de Valor & Descrição */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-3">
            <div className={`text-4xl sm:text-5xl font-black tracking-tight flex items-center ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
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
                    isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border border-slate-300 text-black'
                  }`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setEditandoDescricaoAvulso(false)}
                  className="hubi-btn-cta p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditandoDescricaoAvulso(true)}
                className={`text-xs font-bold hover:underline cursor-pointer ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}
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
                  className={`hubi-btn-neutral h-14 rounded-2xl transition flex items-center justify-center cursor-pointer shadow-sm ${
                    isDark
                      ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                      : 'bg-white hover:bg-slate-100 border border-slate-300 text-black'
                  }`}
                >
                  {n}
                </button>
              ))}

              <div />
              <button
                type="button"
                onClick={() => handleDigitarNumeroAvulso(0)}
                className={`hubi-btn-neutral h-14 rounded-2xl transition flex items-center justify-center cursor-pointer shadow-sm ${
                  isDark
                    ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-white'
                    : 'bg-white hover:bg-slate-100 border border-slate-300 text-black'
                }`}
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspaceAvulso}
                className={`hubi-btn-neutral h-14 rounded-2xl transition flex items-center justify-center cursor-pointer shadow-sm ${
                  isDark
                    ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-300'
                    : 'bg-white hover:bg-slate-100 border border-slate-300 text-black'
                }`}
              >
                ⌫
              </button>
            </div>

            <button
              type="button"
              onClick={handleAdicionarItemAvulso}
              disabled={valorAvulsoCentavos === 0}
              className="hubi-btn-cta w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition shadow-sm cursor-pointer disabled:opacity-40"
            >
              Adicionar ao carrinho
            </button>
          </div>
        </div>
      );
    }

    // =======================================================================
    // TELA 008: CARRINHO DE COMPRAS MOBILE
    // =======================================================================
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
                className={`hubi-btn-neutral p-1.5 rounded-xl transition cursor-pointer ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900' : 'bg-slate-100 hover:bg-slate-200 text-black border border-slate-300'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-black'}`}>Carrinho</h2>

              {!isEdicaoTravada && itens.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModalConfirmarLimparCarrinho(true)}
                  className="px-2.5 py-1 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-bold transition cursor-pointer"
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
                className={`hubi-btn-neutral flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition cursor-pointer active:scale-95 shadow-xs ${
                  isDark
                    ? 'bg-[#000000] border border-slate-700 text-emerald-400 hover:bg-slate-900 font-bold'
                    : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
                }`}
                title="Continuar adicionando produtos ao carrinho"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Continuar Comprando</span>
              </button>
            )}
          </div>

          {/* Identificação de Modo Edição de Pedido */}
          {pedidoEmEdicao && (
            <div className={`px-4 py-2 border-b flex items-center justify-between gap-2 shrink-0 ${
              isDark ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-emerald-50 border-emerald-300'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className={`text-xs font-bold truncate ${isDark ? 'text-emerald-300' : 'text-emerald-950'}`}>
                  Editando Pedido #{pedidoEmEdicao.numero_pedido}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  cancelarEdicaoPedido();
                  navigate('/orders');
                }}
                className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
                title="Fechar edição e voltar para Pedidos"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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
            <div className={`text-center py-16 text-xs ${isDark ? 'text-slate-400' : 'text-slate-800 font-semibold'}`}>
              Seu carrinho está vazio.
            </div>
          ) : (
            itens.map((it) => (
              <div key={it.id} className={`p-3 rounded-2xl flex items-center justify-between gap-2.5 shadow-xs ${
                isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border border-slate-300 text-black'
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
                    <span className={`text-[10px] block truncate ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                      Var: {[it.variacao.valor_variacao_1, it.variacao.valor_variacao_2].filter(Boolean).join(' / ')}
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
                        <span className={`text-[10px] block truncate font-medium ${isDark ? 'text-amber-400' : 'text-amber-900'}`}>
                          {msgVolume}
                        </span>
                      );
                    }
                    if (ehProdutoFracionado(it.produto)) {
                      return (
                        <span className={`text-[10px] block truncate ${isDark ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                          {formatarLinhaCalculoItem(it.quantidade, Number(it.precoUnitario || 0), obterSiglaUnidade(it.produto))}
                        </span>
                      );
                    }
                    return null;
                  })()}

                  {it.produto.tipo_item === 'servico' && it.produto.requer_agendamento && (
                    <div className="pt-1">
                      {it.agendamento ? (
                        <div className={`flex items-center gap-1.5 text-[10px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                          <span className="truncate">📅 {formatarDataPtBr(it.agendamento.data_agendamento)} às {it.agendamento.hora_inicio} • {it.agendamento.profissional_nome} ({it.agendamento.modalidade_local === 'externo' ? 'Externo' : 'Na Loja'})</span>
                          {onAgendarServico && (
                            <button
                              type="button"
                              onClick={() => onAgendarServico(it.produto, it.id, it.agendamento)}
                              className={`underline shrink-0 cursor-pointer ${isDark ? 'text-emerald-400 hover:text-white' : 'text-emerald-800 hover:text-black'}`}
                            >
                              Alterar
                            </button>
                          )}
                        </div>
                      ) : (
                        onAgendarServico && (
                          <button
                            type="button"
                            onClick={() => onAgendarServico(it.produto, it.id, null)}
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer ${
                              isDark ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-amber-900 bg-amber-50 border-amber-300'
                            }`}
                          >
                            <span>📅 Agendar Horário Obrigatório</span>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`font-black text-xs sm:text-sm whitespace-nowrap ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                    R$ {Number(it.subtotal || 0).toFixed(2)}
                  </span>

                  {/* Controles de Quantidade */}
                  {isEdicaoTravada ? (
                    <div
                      className={`px-2 py-1 rounded-xl text-xs font-bold shrink-0 ${
                        isDark ? 'bg-[#08131A] text-slate-400 border border-slate-700' : 'bg-slate-100 text-black border border-slate-300'
                      }`}
                      title="Quantidade bloqueada para pedidos já confirmados"
                    >
                      {it.quantidade}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <div className={`flex items-center gap-1 p-1 rounded-xl shrink-0 ${
                        isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-100 border border-slate-300'
                      }`}>
                        <button
                          type="button"
                          onClick={() => {
                            const passo = ehProdutoFracionado(it.produto) ? 0.1 : 1;
                            const novaQtd = Number((it.quantidade - passo).toFixed(3));
                            if (novaQtd > 0) {
                              atualizarQuantidade(it.id, novaQtd, produtos);
                            } else {
                              removerItem(it.id);
                            }
                          }}
                          className={`hubi-btn-neutral w-6 h-6 rounded-lg flex items-center justify-center font-bold transition cursor-pointer active:scale-95 border ${
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
                          onChangeQtd={(novaQtd) => atualizarQuantidade(it.id, novaQtd, produtos)}
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
                            atualizarQuantidade(it.id, Number((it.quantidade + passo).toFixed(3)), produtos);
                          }}
                          className={`hubi-btn-neutral w-6 h-6 rounded-lg flex items-center justify-center font-bold transition cursor-pointer active:scale-95 border ${
                            isDark ? 'bg-[#000000] border-slate-600 text-white hover:bg-slate-800' : 'bg-white border-slate-300 text-black hover:bg-slate-100'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removerItem(it.id)}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          isDark ? 'text-slate-400 hover:text-red-400 hover:bg-slate-900' : 'text-slate-700 hover:text-red-600 hover:bg-red-50'
                        }`}
                        title="Remover item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
            {/* Seletores Compactos Unificados: Cliente, Tipo da Venda e Forma de Entrega */}
            <div className={`pb-2.5 border-b space-y-2 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              {/* 1. Cliente */}
              {isEdicaoTravada ? (
                <div
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-medium cursor-not-allowed opacity-70 ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-300 text-black'
                  }`}
                  title="Cliente fixo para pedidos já confirmados"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                    <span className="truncate font-bold">
                      {clienteSelecionado ? clienteSelecionado.nome : 'Cliente Balcão'}
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => abrirSelecaoCliente('carrinho')}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition shadow-2xs cursor-pointer ${
                    isDark
                      ? 'bg-[#08131A] border-slate-700 hover:border-slate-500 text-slate-100'
                      : 'bg-white border-slate-300 hover:border-slate-400 text-black'
                  }`}
                  title="Toque para alterar ou vincular cliente"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                    <span className={`shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-800'}`}>Cliente:</span>
                    <span className="font-bold truncate">
                      {clienteSelecionado ? clienteSelecionado.nome : 'Cliente Balcão'}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                </button>
              )}

              {/* 2. Tipo da Venda (Dropdown compacto; oculto se apenas 1 modalidade estiver ativa) */}
              {(() => {
                const tiposAtivos = loja?.tipos_venda || loja?.configuracoes_extras?.tipos_venda_ativos || { varejo: true, atacado: true, distribuidor: true };
                const opcoes: { id: TabelaPreco; nome: string }[] = [];
                if (tiposAtivos.varejo !== false) opcoes.push({ id: 'varejo', nome: 'Varejo' });
                if (tiposAtivos.atacado !== false) opcoes.push({ id: 'atacado', nome: 'Atacado' });
                if (tiposAtivos.distribuidor !== false) opcoes.push({ id: 'autoatacado', nome: 'Distribuidor' });

                if (opcoes.length <= 1) return null;

                const podeAlterarTabela = Boolean(permissions.ehAdmin && !isEdicaoTravada);
                const labelTabelaAtual =
                  tabelaPrecoCalculada === 'autoatacado'
                    ? 'Distribuidor'
                    : tabelaPrecoCalculada === 'atacado'
                    ? 'Atacado'
                    : 'Varejo';

                return (
                  <div className="relative" ref={tipoVendaDropdownRef}>
                    <button
                      type="button"
                      disabled={!podeAlterarTabela}
                      onClick={() => {
                        if (!podeAlterarTabela) return;
                        setFormaEntregaDropdownAberto(false);
                        setTipoVendaDropdownAberto(prev => !prev);
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-medium border flex items-center justify-between gap-2 transition ${
                        isDark
                          ? 'bg-[#08131A] border-slate-700 text-slate-100'
                          : 'bg-white border-slate-300 text-black'
                      } ${
                        podeAlterarTabela
                          ? 'cursor-pointer hover:border-emerald-500/60'
                          : 'opacity-70 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Tag className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                        <span className={`shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-800'}`}>
                          Tipo da Venda:
                        </span>
                        <span className="font-bold truncate">{labelTabelaAtual}</span>
                      </div>
                      {podeAlterarTabela && (
                        <span className={`shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                          {tipoVendaDropdownAberto ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </button>

                    {tipoVendaDropdownAberto && podeAlterarTabela && (
                      <div
                        className={`absolute left-0 right-0 top-full mt-1.5 z-40 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in border ${
                          isDark
                            ? 'bg-[#000000] border-slate-700 text-white'
                            : 'bg-white border-2 border-slate-300 text-slate-900'
                        }`}
                      >
                        {opcoes.map((tab, idx) => {
                          const selecionada = tabelaPrecoCalculada === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setTabelaPrecoGlobal?.(tab.id);
                                setTipoVendaDropdownAberto(false);
                              }}
                              className={`w-full px-3 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                                idx < opcoes.length - 1
                                  ? isDark
                                    ? 'border-b border-slate-800'
                                    : 'border-b border-slate-100'
                                  : ''
                              } ${
                                selecionada
                                  ? isDark
                                    ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                                    : 'bg-emerald-50 text-emerald-700 font-bold'
                                  : isDark
                                  ? 'text-slate-200 hover:bg-slate-900 font-medium'
                                  : 'text-slate-800 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              <span>{tab.nome}</span>
                              {selecionada && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 3. Forma de Entrega (Dropdown compacto consolidado; oculto quando houver apenas serviços) */}
              {temProdutoFisico && (() => {
                const opcoesEntrega = isPedidoHibrido
                  ? temServicoDomicilio
                    ? [
                        {
                          id: 'levar_junto',
                          rotulo: 'Levar junto com o técnico no dia do serviço (Grátis)',
                          selecionada: Boolean(levarProdutoNoAtendimento),
                          ehFrete: false
                        },
                        {
                          id: 'enviar_frete',
                          rotulo: 'Enviar produto antes por frete',
                          selecionada: !levarProdutoNoAtendimento,
                          ehFrete: true
                        }
                      ]
                    : [
                        {
                          id: 'retirar_junto',
                          rotulo: 'Retirar produto na loja junto com o serviço (Grátis)',
                          selecionada: Boolean(levarProdutoNoAtendimento),
                          ehFrete: false
                        },
                        {
                          id: 'entregar_frete',
                          rotulo: 'Entregar produto por frete',
                          selecionada: !levarProdutoNoAtendimento,
                          ehFrete: true
                        }
                      ]
                  : [
                      {
                        id: 'retirada',
                        rotulo: 'Retirada na Loja',
                        selecionada: pedidoEntrega?.tipo_atendimento !== 'entrega',
                        ehFrete: false
                      },
                      {
                        id: 'entrega',
                        rotulo: 'Envio / Entrega',
                        selecionada: pedidoEntrega?.tipo_atendimento === 'entrega',
                        ehFrete: true
                      }
                    ];

                const opcaoAtiva = opcoesEntrega.find(o => o.selecionada) || opcoesEntrega[0];
                const ehEnvioAtivo = pedidoEntrega?.tipo_atendimento === 'entrega' && (!isPedidoHibrido || !levarProdutoNoAtendimento);

                const selecionarOpcaoEntrega = (opcaoEhFrete: boolean) => {
                  if (!opcaoEhFrete) {
                    if (isPedidoHibrido) {
                      setLevarProdutoNoAtendimento?.(true);
                    } else {
                      setTaxaEntrega?.(0);
                      setPedidoEntrega?.(FORMA_ENTREGA_RETIRADA_PADRAO);
                    }
                    onResetFreteConfirmado?.();
                    setFormaEntregaDropdownAberto(false);
                    return;
                  }

                  if (!clienteSelecionado?.id) {
                    setFormaEntregaDropdownAberto(false);
                    if (isPedidoHibrido) {
                      setLevarProdutoNoAtendimento?.(true);
                    } else {
                      setTaxaEntrega?.(0);
                      setPedidoEntrega?.(FORMA_ENTREGA_RETIRADA_PADRAO);
                    }
                    onResetFreteConfirmado?.();
                    mostrarToast('Para entregas (Envio), selecione primeiro o cliente para carregar o endereço de entrega.', 'aviso');
                    return;
                  }

                  if (isPedidoHibrido) {
                    setLevarProdutoNoAtendimento?.(false);
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
                  setFormaEntregaDropdownAberto(false);
                  onAbrirFormaEntrega?.();
                };

                return (
                  <div className="space-y-1.5">
                    <div className="relative" ref={formaEntregaDropdownRef}>
                      <button
                        type="button"
                        disabled={isEdicaoTravada}
                        onClick={() => {
                          if (isEdicaoTravada) return;
                          setTipoVendaDropdownAberto(false);
                          setFormaEntregaDropdownAberto(prev => !prev);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-medium border flex items-center justify-between gap-2 transition ${
                          isDark
                            ? 'bg-[#08131A] border-slate-700 text-slate-100'
                            : 'bg-white border-slate-300 text-black'
                        } ${
                          isEdicaoTravada
                            ? 'opacity-70 cursor-not-allowed'
                            : 'cursor-pointer hover:border-emerald-500/60'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {opcaoAtiva.ehFrete ? (
                            <Truck className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <Store className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
                          )}
                          <span className={`shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-800'}`}>
                            Forma de Entrega:
                          </span>
                          <span className="font-bold truncate">{opcaoAtiva.rotulo}</span>
                        </div>
                        {!isEdicaoTravada && (
                          <span className={`shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                            {formaEntregaDropdownAberto ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </span>
                        )}
                      </button>

                      {formaEntregaDropdownAberto && !isEdicaoTravada && (
                        <div
                          className={`absolute left-0 right-0 top-full mt-1.5 z-40 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in border ${
                            isDark
                              ? 'bg-[#000000] border-slate-700 text-white'
                              : 'bg-white border-2 border-slate-300 text-slate-900'
                          }`}
                        >
                          {opcoesEntrega.map((opt, idx) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => selecionarOpcaoEntrega(opt.ehFrete)}
                              className={`w-full px-3 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                                idx < opcoesEntrega.length - 1
                                  ? isDark
                                    ? 'border-b border-slate-800'
                                    : 'border-b border-slate-100'
                                  : ''
                              } ${
                                opt.selecionada
                                  ? isDark
                                    ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                                    : 'bg-emerald-50 text-emerald-700 font-bold'
                                  : isDark
                                  ? 'text-slate-200 hover:bg-slate-900 font-medium'
                                  : 'text-slate-800 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              <span className="leading-snug">{opt.rotulo}</span>
                              {opt.selecionada && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Informação e status do frete quando Envio por frete estiver selecionado */}
                    {ehEnvioAtivo && (
                      <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs ${
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
                );
              })()}
            </div>

            <div className={`flex justify-between text-xs ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
              <span className="font-semibold">Subtotal:</span>
              <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>R$ {Number(subtotal || 0).toFixed(2)}</span>
            </div>

            {Number(desconto || 0) > 0 && (
              <div className="flex justify-between text-xs text-red-600 dark:text-red-400 font-bold">
                <span>
                  Desconto aplicado{tipoDesconto === 'percentual' && descontoPercentual > 0 ? ` (${descontoPercentual}%)` : ''}:
                </span>
                <span>- R$ {Number(desconto || 0).toFixed(2)}</span>
              </div>
            )}

            {permissions.podeDarDesconto && !isEdicaoTravada && (
              <button
                type="button"
                onClick={() => {
                  setDescontoTempValor(
                    tipoDesconto === 'percentual'
                      ? (descontoPercentual > 0 ? String(descontoPercentual) : '')
                      : (desconto > 0 ? String(desconto) : '')
                  );
                  setDescontoTempTipo(tipoDesconto);
                  setModalDescontoAberto(true);
                }}
                className={`text-xs font-bold hover:underline block text-right w-full cursor-pointer ${
                  isDark ? 'text-emerald-400' : 'text-emerald-800'
                }`}
              >
                {desconto > 0 ? 'Alterar desconto' : 'Dar desconto'}
              </button>
            )}

            {infoTaxaVisita?.temServicoExterno && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className={isDark ? 'text-slate-300' : 'text-slate-900 font-semibold'}>Taxa de Visita (Domicílio):</span>
                  <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                    {infoTaxaVisita.taxaVisitaIsenta ? 'Isenta (serviço aprovado)' : `+ ${formatarMoeda(valorTaxaDomicilio)}`}
                  </span>
                </div>
                {infoTaxaVisita.podeAbater && !isEdicaoTravada && alternarAbatimentoVisita && (
                  <button
                    type="button"
                    onClick={alternarAbatimentoVisita}
                    className={`hubi-btn-neutral w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border flex items-center justify-between transition cursor-pointer ${
                      infoTaxaVisita.taxaVisitaIsenta
                        ? isDark
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-200 border-slate-500 text-black font-bold'
                        : isDark
                        ? 'bg-[#08131A] border-slate-700 text-slate-300 hover:bg-slate-900'
                        : 'bg-slate-100 border-slate-300 text-black hover:bg-slate-200'
                    }`}
                  >
                    <span>{infoTaxaVisita.taxaVisitaIsenta ? '✓ Visita Abatida' : 'Abater visita (Serviço aprovado)'}</span>
                    <span className="underline">{infoTaxaVisita.taxaVisitaIsenta ? 'Restaurar taxa' : 'Isentar taxa'}</span>
                  </button>
                )}
              </div>
            )}

            {isPedidoHibrido && levarProdutoNoAtendimento ? (
              <div className="flex justify-between items-center text-xs">
                <span className={isDark ? 'text-slate-300' : 'text-slate-900 font-semibold'}>Frete de Entrega:</span>
                <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                  {temServicoDomicilio ? 'Grátis — Levar na visita técnica' : 'Grátis — Retirar no atendimento'}
                </span>
              </div>
            ) : taxaEntrega > 0 ? (
              <div className="flex justify-between items-center text-xs">
                <span className={isDark ? 'text-slate-300' : 'text-slate-900 font-semibold'}>Frete de Entrega:</span>
                <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>+ {formatarMoeda(taxaEntrega)}</span>
              </div>
            ) : null}

            <div className={`flex justify-between text-base font-black pt-1 border-t ${
              isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-black'
            }`}>
              <span>TOTAL:</span>
              <span className={isDark ? 'text-emerald-400 font-black' : 'text-black font-black'}>{formatarMoeda(total)}</span>
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
              className={`hubi-btn-neutral flex-1 h-12 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 active:scale-95 shadow-xs ${
                isDark
                  ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-100 font-bold'
                  : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
              }`}
              title="Salva o pedido como Pendente sem concluir pagamento"
            >
              {salvandoPendente ? (
                <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-white' : 'text-black'}`} />
              ) : (
                <FileText className={`w-4 h-4 ${isDark ? 'text-white' : 'text-black'}`} />
              )}
              <span className="truncate">{pedidoEmEdicao ? 'Atualizar' : 'Salvar Pedido'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onAbrirFechamento()}
            disabled={itens.length === 0 || salvandoPendente}
            className="hubi-btn-cta flex-[1.2] h-12 rounded-xl text-xs flex items-center justify-between px-3 shadow-sm transition cursor-pointer disabled:opacity-50 active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            title="Avançar para pagamento e concluir venda"
          >
            <span className="truncate">{totalItens} {totalItens === 1 ? 'item' : 'itens'} • R$ {Number(total || 0).toFixed(2)}</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
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
          <div className="flex items-center gap-1.5">
            {onSincronizarAgora && (
              <button
                type="button"
                onClick={() => onSincronizarAgora()}
                disabled={sincronizando}
                className={`hubi-btn-neutral p-1.5 rounded-lg border text-[10px] transition cursor-pointer disabled:opacity-50 ${
                  isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black'
                }`}
                title="Sincronizar catálogo e vendas"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
              </button>
            )}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${
                isOnline
                  ? isDark
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : isDark
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                  : 'bg-amber-50 text-amber-900 border-amber-300 animate-pulse'
              }`}
              title={isOnline ? 'Online - Supabase conectado' : 'Modo Offline Ativo'}
            >
              {isOnline ? <Wifi className="w-3 h-3 text-emerald-700 dark:text-emerald-400" /> : <WifiOff className="w-3 h-3 text-amber-700 dark:text-amber-400" />}
              {pendentesCount > 0 ? (
                <span className="font-extrabold text-[9px] bg-amber-200 text-amber-950 px-1 rounded-full">
                  {pendentesCount}
                </span>
              ) : null}
            </div>
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
                  : 'bg-white border border-slate-300 text-black placeholder:text-slate-500'
              }`}
            />
            {termoBusca && (
              <button
                type="button"
                onClick={() => setTermoBusca('')}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-700 hover:text-black'}`}
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
            className={`hubi-btn-neutral px-2.5 py-1.5 rounded-xl text-[11px] transition flex items-center gap-1.5 cursor-pointer shrink-0 border ${
              apenasEmEstoque
                ? isDark
                  ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-xs'
                  : 'bg-slate-200 border-slate-500 text-black font-bold'
                : isDark
                ? 'bg-[#000000] border-slate-700 text-slate-300 hover:text-white font-semibold'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-semibold'
            }`}
            title="Filtrar apenas produtos em estoque"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${apenasEmEstoque ? (isDark ? 'bg-white animate-pulse' : 'bg-emerald-600 animate-pulse') : 'bg-slate-400'}`} />
            <span>Em estoque</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setBuscaAberta(false);
              setTermoBusca('');
            }}
            className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
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
          <div className={`flex items-center gap-4 ${isDark ? 'text-slate-300' : 'text-black'}`}>
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
              <div className={`w-5 h-5 border-2 border-dashed rounded flex items-center justify-center ${isDark ? 'border-slate-300' : 'border-black'}`}>
                <span className={`w-2.5 h-0.5 ${isDark ? 'bg-slate-300' : 'bg-black'}`} />
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
              className={`hubi-btn-neutral px-2.5 py-1 rounded-xl text-[11px] transition flex items-center gap-1.5 cursor-pointer border ${
                apenasEmEstoque
                  ? isDark
                    ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-xs'
                    : 'bg-slate-200 border-slate-500 text-black font-bold'
                  : isDark
                  ? 'border border-slate-700 text-slate-300 bg-[#000000] hover:text-white font-semibold'
                  : 'border border-slate-300 text-black bg-slate-100 hover:bg-slate-200 font-semibold'
              }`}
              title="Filtrar apenas produtos em estoque"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${apenasEmEstoque ? (isDark ? 'bg-white animate-pulse' : 'bg-emerald-600 animate-pulse') : 'bg-slate-400'}`} />
              <span>Em estoque</span>
            </button>

            {/* Multiplicador 1X */}
            <button
              type="button"
              onClick={() => setModalMultiplicador(true)}
              className={`hubi-btn-neutral px-2.5 py-1 rounded-xl text-xs font-black shadow-xs transition cursor-pointer ${
                isDark
                  ? 'border border-slate-700 text-white bg-[#000000] hover:bg-slate-900'
                  : 'border border-slate-300 text-black bg-slate-100 hover:bg-slate-200'
              }`}
            >
              {multiplicadorQtd}X
            </button>
          </div>
        </div>
      )}

      {/* 3. Seletor de Categorias com Gaveta Lateral Deslizante */}
      <div className={`px-3 py-2 border-b-2 flex items-center gap-2 shrink-0 ${
        isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
      }`}>
        <div className="relative flex-1">
          <SeletorCategoriasHibrido
            categorias={categoriasOrdenadas}
            produtos={produtos}
            valorSelecionado={categoriaAtiva}
            aoSelecionar={setCategoriaAtiva}
            valorTodas="tudo"
            rotuloTodas="Todas as Categorias"
            opcoesExtrasTopo={[{ id: 'destaques', rotulo: '⭐ Destaques' }]}
            lojaId={loja?.id}
            isDark={isDark}
            apenasGavetaMobile={true}
            idOverlay="pdv-mobile-categorias-drawer"
            classNameBotao={`w-full flex items-center justify-between gap-2 rounded-xl pl-9 pr-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer shadow-xs transition relative text-left ${
              isDark
                ? 'bg-[#000000] border border-slate-700 text-white'
                : 'bg-white border-2 border-slate-300 text-black'
            }`}
          />
        </div>
      </div>

      {/* 4. Catálogo de Produtos (Agrupado em Blocos quando Todas as Categorias) */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3">
        {carregando && produtos.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-64 space-y-2 text-xs ${
            isDark ? 'text-slate-400' : 'text-black font-semibold'
          }`}>
            <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
            <p>Carregando catálogo...</p>
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-64 space-y-2 text-xs ${
            isDark ? 'text-slate-400' : 'text-black font-semibold'
          }`}>
            <Package className="w-8 h-8 stroke-1" />
            <p>Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {blocosProdutosMobile.map((bloco) => (
              <section key={bloco.categoriaId} className="space-y-2">
                {categoriaAtiva === 'tudo' && bloco.categoriaNome && (
                  <div className={`flex items-center gap-2 pt-1 pb-1 border-b ${
                    isDark ? 'border-slate-800' : 'border-slate-300'
                  }`}>
                    <span className="text-sm leading-none" aria-hidden="true">
                      {bloco.emoji}
                    </span>
                    <h2 className={`text-xs font-black uppercase tracking-wider ${
                      isDark ? 'text-slate-200' : 'text-black'
                    }`}>
                      {bloco.categoriaNome}
                    </h2>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-black'
                    }`}>
                      {bloco.produtos.length}
                    </span>
                  </div>
                )}

                {modoVisualizacao === 'grade' ? (
                  // MODO GRADE: 3 COLUNAS COMPACTAS (TELA 001)
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    {bloco.produtos.map((produto) => {
                      const qtdNoCarrinho = mapaQuantidadesCarrinho.get(produto.id) || 0;
                      const qtdBadgeTexto = Number.isInteger(qtdNoCarrinho) ? String(qtdNoCarrinho) : qtdNoCarrinho.toFixed(2);
                      const isFracionado = ehProdutoFracionado(produto);
                      let precoFinal = produto.preco_venda_varejo;
                      if (tabelaPrecoCalculada === 'atacado' && produto.preco_venda_atacado) {
                        precoFinal = produto.preco_venda_atacado;
                      } else if (tabelaPrecoCalculada === 'autoatacado' && produto.preco_venda_autoatacado) {
                        precoFinal = produto.preco_venda_autoatacado;
                      } else if (produto.promocao_ativa && produto.preco_promocional) {
                        precoFinal = produto.preco_promocional;
                      }
                      const precoOriginal = (produto.promocao_ativa && produto.preco_promocional && precoFinal !== produto.preco_venda_varejo) ? produto.preco_venda_varejo : null;
                      const ehServico = produto.tipo_item === 'servico';
                      const estoqueQtd = ehServico
                        ? 9999
                        : produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0
                        ? produto.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0)
                        : Number(produto.quantidade_estoque ?? 0);
                      const isEsgotado = !ehServico && estoqueQtd <= 0;
                      const temEstoqueBaixo = !ehServico && estoqueQtd > 0 && estoqueQtd <= Number(produto.estoque_minimo_alerta || 0);
                      const badgeCatTexto = obterTextoBadgeCategoriaProduto(produto, categorias, loja?.id);

                      return (
                        <div
                          key={produto.id}
                          onClick={() => handleClicarProduto(produto)}
                          className={`rounded-xl overflow-hidden shadow-xs active:scale-95 transition-all duration-100 flex flex-col h-full cursor-pointer group ${
                            isDark
                              ? 'bg-[#000000] border border-slate-700 hover:border-slate-600'
                              : 'bg-white border border-slate-300 hover:border-slate-400'
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
                              <div className={`w-full h-full flex items-center justify-center p-1 border select-none ${
                                isDark ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-700'
                              }`}>
                                <span className="text-[10px] sm:text-xs font-medium text-center leading-tight select-none">Sem foto</span>
                              </div>
                            )}

                            {/* Badge PROMO */}
                            {precoOriginal && (
                              <span className="absolute top-1 left-1 z-10 bg-red-600 text-white font-black text-[8px] px-1.5 py-0.5 rounded shadow uppercase">
                                PROMO
                              </span>
                            )}

                            {/* Indicador de Esgotado ou Estoque Baixo */}
                            {isEsgotado ? (
                              <div className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex items-center justify-center p-1">
                                <span className="bg-red-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow uppercase tracking-wider">
                                  Esgotado
                                </span>
                              </div>
                            ) : temEstoqueBaixo ? (
                              <span className="absolute bottom-1 left-1 bg-amber-500/90 text-slate-950 font-black text-[8px] px-1 py-0.2 rounded shadow">
                                Est: {estoqueQtd}
                              </span>
                            ) : null}

                            {/* Badge Verde de Quantidade Acumulada */}
                            {qtdNoCarrinho > 0 && (
                              <span className="absolute top-1 right-1 z-10 bg-emerald-600 text-white font-black text-[10px] min-w-5 h-5 px-1 rounded-md flex items-center justify-center shadow-md animate-in zoom-in-75">
                                {qtdBadgeTexto}
                              </span>
                            )}
                          </div>

                          {/* Informações do produto niveladas */}
                          <div className={`p-2 flex flex-col flex-1 justify-between border-t ${
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
                            {badgeCatTexto && (
                              <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate block mt-0.5">
                                {badgeCatTexto}
                              </span>
                            )}

                            <div className="flex items-baseline justify-between pt-1 gap-1">
                              <span className={`font-black text-xs truncate ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                                R$ {Number(precoFinal).toFixed(2)}{isFracionado ? `/${obterSiglaUnidade(produto)}` : ''}
                              </span>
                              {precoOriginal && (
                                <span className={`text-[9px] line-through shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
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
                    isDark ? 'divide-y divide-slate-800 bg-[#000000] border border-slate-700' : 'divide-y divide-slate-200 bg-white border border-slate-300'
                  }`}>
                    {bloco.produtos.map((produto) => {
                      const qtdNoCarrinho = mapaQuantidadesCarrinho.get(produto.id) || 0;
                      const qtdBadgeTexto = Number.isInteger(qtdNoCarrinho) ? String(qtdNoCarrinho) : qtdNoCarrinho.toFixed(2);
                      const isFracionado = ehProdutoFracionado(produto);
                      let precoFinal = produto.preco_venda_varejo;
                      if (tabelaPrecoCalculada === 'atacado' && produto.preco_venda_atacado) {
                        precoFinal = produto.preco_venda_atacado;
                      } else if (tabelaPrecoCalculada === 'autoatacado' && produto.preco_venda_autoatacado) {
                        precoFinal = produto.preco_venda_autoatacado;
                      } else if (produto.promocao_ativa && produto.preco_promocional) {
                        precoFinal = produto.preco_promocional;
                      }
                      const precoOriginal = (produto.promocao_ativa && produto.preco_promocional && precoFinal !== produto.preco_venda_varejo) ? produto.preco_venda_varejo : null;
                      const ehServico = produto.tipo_item === 'servico';
                      const estoqueQtd = ehServico
                        ? 9999
                        : produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0
                        ? produto.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0)
                        : Number(produto.quantidade_estoque ?? 0);
                      const isEsgotado = !ehServico && estoqueQtd <= 0;
                      const temEstoqueBaixo = !ehServico && estoqueQtd > 0 && estoqueQtd <= Number(produto.estoque_minimo_alerta || 0);
                      const badgeCatTexto = obterTextoBadgeCategoriaProduto(produto, categorias, loja?.id);

                      return (
                        <div
                          key={produto.id}
                          onClick={() => handleClicarProduto(produto)}
                          className={`p-3 flex items-center justify-between transition cursor-pointer ${
                            isDark ? 'hover:bg-slate-900 active:bg-slate-800' : 'hover:bg-slate-50 active:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border flex items-center justify-center ${
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
                                <div className={`w-full h-full flex items-center justify-center p-1 select-none ${
                                  isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  <span className="text-[10px] font-medium text-center leading-tight select-none">Sem foto</span>
                                </div>
                              )}
                              {isEsgotado ? (
                                <span className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex items-center justify-center text-[7px] font-black text-red-200">
                                  ESGOTADO
                                </span>
                              ) : temEstoqueBaixo ? (
                                <span className="absolute top-0.5 left-0.5 bg-amber-500/90 text-slate-950 font-black text-[7px] px-0.5 rounded shadow leading-none">
                                  {estoqueQtd}
                                </span>
                              ) : null}
                              {qtdNoCarrinho > 0 && (
                                <span className="absolute top-0.5 right-0.5 bg-emerald-600 text-white font-black text-[9px] min-w-4 h-4 px-0.5 rounded flex items-center justify-center">
                                  {qtdBadgeTexto}
                                </span>
                              )}
                            </div>

                            <div className="space-y-0.5 max-w-[190px] min-w-0">
                              <div className="flex items-center gap-1">
                                {produto.destaque && <span className="text-amber-500 text-xs">★</span>}
                                <h3 className={`font-bold text-xs uppercase truncate ${isDark ? 'text-white' : 'text-black'}`}>{produto.nome}</h3>
                              </div>
                              {badgeCatTexto && (
                                <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate block">
                                  {badgeCatTexto}
                                </span>
                              )}
                              {precoOriginal && (
                                <span className="inline-block bg-red-600 text-white font-black text-[8px] px-1 py-0.2 rounded uppercase">
                                  PROMO
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0 ml-2">
                            {precoOriginal && (
                              <span className={`text-[10px] line-through block ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                                R$ {Number(precoOriginal).toFixed(2)}
                              </span>
                            )}
                            <span className={`font-black text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                              R$ {Number(precoFinal).toFixed(2)}{isFracionado ? `/${obterSiglaUnidade(produto)}` : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* 5. Barra Flutuante Inferior (Acumulador de Itens) */}
      <div className={`p-3 border-t-2 shadow-lg shrink-0 ${
        isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'
      }`}>
        {itens.length === 0 ? (
          <div className={`w-full py-3.5 rounded-2xl border text-center font-bold text-xs ${
            isDark ? 'bg-[#000000] border-slate-700 text-slate-400' : 'bg-white border-slate-300 text-black'
          }`}>
            Nenhum item
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSubTela('carrinho')}
            className="hubi-btn-cta w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-sm flex items-center justify-between shadow-sm transition cursor-pointer"
          >
            <span>
              {totalItens} {totalItens === 1 ? 'item' : 'itens'} = R$ {total.toFixed(2)}
            </span>
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
  };

  return (
    <>
      {renderConteudoSubTela()}

      {/* Modal Compartilhado de Desconto (vender/camera/carrinho) */}
      {modalDescontoAberto && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className={`${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
          } rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95`}>
            <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
              <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Aplicar Desconto</h3>
              <button
                type="button"
                onClick={() => setModalDescontoAberto(false)}
                className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDescontoTempTipo('valor')}
                className={`hubi-btn-neutral flex-1 py-2 rounded-xl text-xs transition border cursor-pointer ${
                  descontoTempTipo === 'valor'
                    ? isDark
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                      : 'bg-slate-200 border-slate-500 text-black font-bold'
                    : isDark
                    ? 'bg-[#000000] border-slate-700 text-slate-300 font-semibold'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-semibold'
                }`}
              >
                R$ Valor
              </button>
              <button
                type="button"
                onClick={() => setDescontoTempTipo('percentual')}
                className={`hubi-btn-neutral flex-1 py-2 rounded-xl text-xs transition border cursor-pointer ${
                  descontoTempTipo === 'percentual'
                    ? isDark
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                      : 'bg-slate-200 border-slate-500 text-black font-bold'
                    : isDark
                    ? 'bg-[#000000] border-slate-700 text-slate-300 font-semibold'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-semibold'
                }`}
              >
                % Porcentagem
              </button>
            </div>

            <input
              type="text"
              inputMode="decimal"
              placeholder={descontoTempTipo === 'valor' ? 'Ex: 5,00' : 'Ex: 10'}
              value={descontoTempValor}
              onChange={(e) => setDescontoTempValor(e.target.value)}
              className={`w-full rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 ${
                isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border border-slate-300 text-black placeholder:text-slate-500'
              }`}
              autoFocus
            />

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDescontoValor(0);
                  setTipoDesconto('valor');
                  setModalDescontoAberto(false);
                }}
                className={`hubi-btn-neutral flex-1 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                  isDark ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900 font-bold' : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
                }`}
              >
                Zerar
              </button>
              <button
                type="button"
                onClick={() => {
                  const num = Math.max(0, parseFloat(descontoTempValor.replace(',', '.')) || 0);
                  setTipoDesconto(descontoTempTipo);
                  if (descontoTempTipo === 'percentual') {
                    setDescontoPercentual(Math.min(100, num));
                  } else {
                    setDescontoValor(num);
                  }
                  setModalDescontoAberto(false);
                }}
                className="hubi-btn-cta flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Compartilhado de Confirmação: Limpar Carrinho */}
      {modalConfirmarLimparCarrinho && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className={`${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
          } rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95 text-center`}>
            <div className="w-12 h-12 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto border border-red-500/30">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Limpar Carrinho</h3>
              <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-800 font-medium'}`}>
                Deseja realmente limpar todos os itens do carrinho?
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalConfirmarLimparCarrinho(false)}
                className={`hubi-btn-neutral flex-1 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                  isDark
                    ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-200 font-bold'
                    : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold'
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
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Compartilhado de Multiplicador (1x, 2x, 3x, 5x, 10x) */}
      {modalMultiplicador && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className={`${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
          } rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95`}>
            <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
              <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>Multiplicador de Quantidade</h3>
              <button
                type="button"
                onClick={() => setModalMultiplicador(false)}
                className={`hubi-btn-close-x p-1.5 rounded-xl transition cursor-pointer ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
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
                  className={`hubi-btn-neutral py-3 rounded-2xl transition cursor-pointer border ${
                    multiplicadorQtd === fator
                      ? isDark
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-200 text-black border-slate-500 font-bold'
                      : isDark
                      ? 'bg-[#000000] text-white border-slate-700 hover:bg-slate-900'
                      : 'bg-slate-100 text-black border-slate-300 hover:bg-slate-200 font-semibold'
                  }`}
                >
                  {fator}X
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Compartilhado de Peso Fracionado */}
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
              atualizarQuantidade(itemPesagemModal.cartId, pesoKg, produtos);
            } else {
              adicionarItem(itemPesagemModal.produto, itemPesagemModal.variacao, pesoKg);
            }
            setItemPesagemModal(null);
          }}
        />
      )}
    </>
  );
};