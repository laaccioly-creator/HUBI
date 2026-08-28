import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Store,
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
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCart } from '../contexts/CartContext';
import { Produto, VariacaoProduto, Cliente, FormaPagamento, Categoria } from '../types';
import { audioService } from '../services/audioService';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';

interface PosCheckoutMobileProps {
  produtos: Produto[];
  categorias: Categoria[];
  clientes: Cliente[];
  formasPagamento: FormaPagamento[];
  pedidosConfirmadosCount: number;
  onAbrirFechamento: () => void;
  onAbrirNovoCliente: () => void;
  onAbrirVariacoesModal: (produto: Produto) => void;
}

type SubTelaMobile = 'vender' | 'menu' | 'clientes' | 'camera' | 'avulso' | 'carrinho';

export const PosCheckoutMobile: React.FC<PosCheckoutMobileProps> = ({
  produtos,
  categorias,
  clientes,
  pedidosConfirmadosCount,
  onAbrirFechamento,
  onAbrirNovoCliente,
  onAbrirVariacoesModal
}) => {
  const navigate = useNavigate();
  const { loja, usuario, desconectarPdv } = useAuth();
  const permissions = usePermissions();

  const {
    itens,
    clienteSelecionado,
    desconto,
    descontoPercentual,
    tipoDesconto,
    subtotal,
    total,
    totalItens,
    adicionarItem,
    removerItem,
    atualizarQuantidade,
    setClienteSelecionado,
    setDescontoValor,
    setDescontoPercentual,
    setTipoDesconto,
    limparCarrinho
  } = useCart();

  // Estados de Navegação e Visualização
  const [subTela, setSubTela] = useState<SubTelaMobile>('vender');
  const [menuDrawerAberto, setMenuDrawerAberto] = useState<boolean>(false);
  const [modoVisualizacao, setModoVisualizacao] = useState<'grade' | 'lista'>('grade'); // Grade (tela001) vs Lista (tela007)
  const [buscaAberta, setBuscaAberta] = useState<boolean>(false); // Tela 004
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('tudo');
  const [multiplicadorQtd, setMultiplicadorQtd] = useState<number>(1);
  const [modalMultiplicador, setModalMultiplicador] = useState<boolean>(false);

  // Estados da Tela 003: Clientes
  const [buscaCliente, setBuscaCliente] = useState<string>('');

  // Estados da Tela 005: Leitor Câmera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [cameraSomAtivo, setCameraSomAtivo] = useState<boolean>(true);
  const [tochaAtiva, setTochaAtiva] = useState<boolean>(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [ultimoCodigoBipado, setUltimoCodigoBipado] = useState<string | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  // Estados da Tela 006: Item Avulso
  const [valorAvulsoCentavos, setValorAvulsoCentavos] = useState<number>(0);
  const [descricaoAvulso, setDescricaoAvulso] = useState<string>('');
  const [editandoDescricaoAvulso, setEditandoDescricaoAvulso] = useState<boolean>(false);

  // Estados da Tela 008: Carrinho
  const [modalDescontoAberto, setModalDescontoAberto] = useState<boolean>(false);
  const [modalOpcoesCarrinho, setModalOpcoesCarrinho] = useState<boolean>(false);
  const [descontoTempValor, setDescontoTempValor] = useState<string>('');
  const [descontoTempTipo, setDescontoTempTipo] = useState<'valor' | 'percentual'>('valor');

  const inputBuscaRef = useRef<HTMLInputElement>(null);

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

  // Produtos filtrados por busca e categoria
  const produtosFiltrados = useMemo(() => {
    return produtos.filter(p => {
      // Filtro de busca
      if (termoBusca.trim()) {
        const t = termoBusca.toLowerCase().trim();
        const matchNome = p.nome.toLowerCase().includes(t);
        const matchSku = p.codigo_interno && p.codigo_interno.toLowerCase().includes(t);
        const matchEan = p.codigo_barras && p.codigo_barras.includes(t);
        if (!matchNome && !matchSku && !matchEan) return false;
      }

      // Filtro de categoria
      if (categoriaAtiva === 'destaques') {
        return p.destaque === true;
      } else if (categoriaAtiva !== 'tudo') {
        return p.categoria_id === categoriaAtiva;
      }

      return true;
    });
  }, [produtos, termoBusca, categoriaAtiva]);

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
  };

  const iniciarCameraScanner = async () => {
    try {
      setErroCamera(null);
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
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
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

      if (detectorRef.current) {
        try {
          const barcodes = await detectorRef.current.detect(video);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            if (rawValue && rawValue !== ultimoCodigoBipado) {
              setUltimoCodigoBipado(rawValue);
              handleCodigoBarrasDetectado(rawValue);
              setTimeout(() => setUltimoCodigoBipado(null), 1500);
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



  // =========================================================================
  // TELA 003: SELEÇÃO E CADASTRO DE CLIENTE
  // =========================================================================
  if (subTela === 'clientes') {
    return (
      <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col animate-in slide-in-from-right duration-150">
        {/* Header Branco Limpo */}
        <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubTela('vender')}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="font-bold text-base text-slate-800">Adicionar cliente</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
              title="Sincronizar"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => onAbrirNovoCliente()}
              className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center shadow-md transition cursor-pointer"
              title="Cadastrar Novo Cliente"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Barra de Busca */}
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Procure por nome, email ou telefone"
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
            />
          </div>
        </div>

        {/* Cliente Atual Vinculado (Se houver) */}
        {clienteSelecionado && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <div>
                <span className="text-xs font-bold text-emerald-900 block">{clienteSelecionado.nome}</span>
                <span className="text-[10px] text-emerald-700">Cliente selecionado para esta venda</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setClienteSelecionado(null)}
              className="text-[11px] font-bold text-rose-600 hover:underline"
            >
              Remover
            </button>
          </div>
        )}

        {/* Lista de Clientes */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {clientesFiltrados.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Nenhum cliente encontrado.
            </div>
          ) : (
            clientesFiltrados.map((cliente) => (
              <div
                key={cliente.id}
                onClick={() => {
                  setClienteSelecionado(cliente);
                  setSubTela('vender');
                }}
                className="p-3.5 hover:bg-slate-50 transition flex items-center justify-between cursor-pointer"
              >
                <div className="space-y-0.5">
                  <h4 className="font-bold text-xs uppercase text-slate-800">{cliente.nome}</h4>
                  <p className="text-[10px] text-slate-400">
                    {cliente.telefone ? `Tel: ${cliente.telefone}` : 'Sem telefone cadastrado'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {cliente.whatsapp && (
                    <a
                      href={`https://wa.me/55${cliente.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                      title="Enviar WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            ))
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
      <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col animate-in fade-in">
        {/* Header Superior da Câmera */}
        <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubTela('vender')}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="font-bold text-base text-slate-800">Vender</h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCameraSomAtivo(!cameraSomAtivo)}
              className="text-slate-600 hover:text-slate-900 transition"
            >
              {cameraSomAtivo ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
            </button>

            <button
              type="button"
              onClick={() => setModalMultiplicador(true)}
              className="px-2 py-0.5 rounded border border-slate-300 text-xs font-black text-slate-700"
            >
              {multiplicadorQtd}X
            </button>

            <button
              type="button"
              onClick={() => setSubTela('clientes')}
              className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-xs"
            >
              +8
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
          {itens.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Aponte a câmera para o código de barras do produto.
            </div>
          ) : (
            itens.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">{it.quantidade} x</span>
                  <span className="font-bold text-slate-900 uppercase truncate max-w-[200px]">{it.produto.nome}</span>
                </div>
                <span className="font-black text-slate-900">R$ {it.subtotal.toFixed(2)}</span>
              </div>
            ))
          )}

          {itens.length > 0 && (
            <div className="pt-2 text-right space-y-1">
              <button
                type="button"
                onClick={() => setModalDescontoAberto(true)}
                className="text-xs font-bold text-emerald-600 block w-full text-right"
              >
                Dar desconto
              </button>
              <div className="text-sm font-black text-slate-900">
                TOTAL: R$ {total.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Flutuante do Leitor */}
        <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTela('carrinho')}
            className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-lg"
          >
            ...
          </button>
          <button
            type="button"
            onClick={() => setSubTela('carrinho')}
            disabled={itens.length === 0}
            className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm flex items-center justify-between px-4 shadow-md transition disabled:opacity-50"
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
    const valorFormatado = (valorAvulsoCentavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

    return (
      <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col justify-between animate-in slide-in-from-right duration-150">
        {/* Header */}
        <div className="h-14 border-b border-slate-100 px-4 flex items-center gap-3 bg-white">
          <button
            type="button"
            onClick={() => setSubTela('vender')}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-base text-slate-800">Vender item não cadastrado</h2>
        </div>

        {/* Display de Valor & Descrição */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-3">
          <div className="text-4xl sm:text-5xl font-black text-emerald-500 tracking-tight flex items-center">
            {valorFormatado}
            <span className="w-0.5 h-10 bg-emerald-400 animate-pulse ml-1" />
          </div>

          {editandoDescricaoAvulso ? (
            <div className="w-full max-w-xs flex items-center gap-2">
              <input
                type="text"
                placeholder="Ex: Serviço de entrega, Produto avulso..."
                value={descricaoAvulso}
                onChange={(e) => setDescricaoAvulso(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setEditandoDescricaoAvulso(false)}
                className="p-2 rounded-xl bg-emerald-500 text-white text-xs font-bold"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditandoDescricaoAvulso(true)}
              className="text-xs font-bold text-emerald-600 hover:underline"
            >
              {descricaoAvulso ? `Descrição: ${descricaoAvulso}` : 'Adicionar descrição'}
            </button>
          )}
        </div>

        {/* Teclado Numérico Virtual */}
        <div className="p-4 bg-white border-t border-slate-100 space-y-3">
          <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto text-center font-bold text-2xl text-slate-800">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleDigitarNumeroAvulso(n)}
                className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition flex items-center justify-center cursor-pointer shadow-sm"
              >
                {n}
              </button>
            ))}

            <div />
            <button
              type="button"
              onClick={() => handleDigitarNumeroAvulso(0)}
              className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition flex items-center justify-center cursor-pointer shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspaceAvulso}
              className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition flex items-center justify-center text-slate-500 cursor-pointer shadow-sm"
            >
              ⌫
            </button>
          </div>

          <button
            type="button"
            onClick={handleAdicionarItemAvulso}
            disabled={valorAvulsoCentavos === 0}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm transition shadow-md cursor-pointer disabled:opacity-40"
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
      <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col justify-between animate-in slide-in-from-bottom duration-150">
        {/* Header do Carrinho */}
        <div className="h-14 border-b border-slate-100 px-4 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSubTela('vender')}
              className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="font-bold text-base text-slate-800">Carrinho</h2>
          </div>

          <button
            type="button"
            onClick={() => setSubTela('clientes')}
            className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-xs"
          >
            +8
          </button>
        </div>

        {/* Lista de Itens do Carrinho */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white divide-y divide-slate-100">
          {itens.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              Seu carrinho está vazio.
            </div>
          ) : (
            itens.map((it) => (
              <div key={it.id} className="pt-3 first:pt-0 flex items-center justify-between">
                <div className="space-y-0.5 max-w-[220px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-slate-700 text-xs">{it.quantidade} x</span>
                    <span className="font-bold text-xs uppercase text-slate-800 truncate">{it.produto.nome}</span>
                  </div>
                  {it.variacao && (
                    <span className="text-[10px] text-slate-500 block">Var: {it.variacao.valor_variacao_1}</span>
                  )}
                  <span className="text-[10px] text-slate-400 block">Unit: R$ {it.precoUnitario.toFixed(2)}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-black text-sm text-slate-900">R$ {it.subtotal.toFixed(2)}</span>

                  {/* Controles de Quantidade */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        if (it.quantidade > 1) {
                          atualizarQuantidade(it.id, it.quantidade - 1);
                        } else {
                          removerItem(it.id);
                        }
                      }}
                      className="w-6 h-6 rounded-lg bg-white text-slate-700 flex items-center justify-center font-bold hover:bg-slate-200"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center text-xs font-black">{it.quantidade}</span>
                    <button
                      type="button"
                      onClick={() => atualizarQuantidade(it.id, it.quantidade + 1)}
                      className="w-6 h-6 rounded-lg bg-white text-slate-700 flex items-center justify-center font-bold hover:bg-slate-200"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Resumo de Valores e Desconto */}
        {itens.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Subtotal:</span>
              <span>R$ {subtotal.toFixed(2)}</span>
            </div>

            {desconto > 0 && (
              <div className="flex justify-between text-xs text-rose-500 font-bold">
                <span>Desconto aplicado:</span>
                <span>- R$ {desconto.toFixed(2)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setDescontoTempValor(desconto > 0 ? String(desconto) : '');
                setDescontoTempTipo(tipoDesconto);
                setModalDescontoAberto(true);
              }}
              className="text-xs font-bold text-emerald-600 hover:underline block text-right w-full"
            >
              {desconto > 0 ? 'Alterar desconto' : 'Dar desconto'}
            </button>

            <div className="flex justify-between text-base font-black text-slate-900 pt-1 border-t border-slate-200">
              <span>TOTAL:</span>
              <span className="text-emerald-600">R$ {total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Barra Inferior com Botão de Cobrança */}
        <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModalOpcoesCarrinho(true)}
            className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-lg cursor-pointer"
            title="Mais Opções"
          >
            ...
          </button>

          <button
            type="button"
            onClick={() => onAbrirFechamento()}
            disabled={itens.length === 0}
            className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm flex items-center justify-between px-4 shadow-md transition cursor-pointer disabled:opacity-50"
          >
            <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'} = R$ {total.toFixed(2)}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Modal de Desconto */}
        {modalDescontoAberto && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-sm text-slate-800">Aplicar Desconto</h3>
                <button
                  type="button"
                  onClick={() => setModalDescontoAberto(false)}
                  className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDescontoTempTipo('valor')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                    descontoTempTipo === 'valor' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  R$ Valor
                </button>
                <button
                  type="button"
                  onClick={() => setDescontoTempTipo('percentual')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                    descontoTempTipo === 'percentual' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
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
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                autoFocus
              />

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDescontoValor(0);
                    setModalDescontoAberto(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold"
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
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Opções do Carrinho (...) */}
        {modalOpcoesCarrinho && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-0">
            <div className="bg-white rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-sm text-slate-800">Opções da Venda</h3>
                <button
                  type="button"
                  onClick={() => setModalOpcoesCarrinho(false)}
                  className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  limparCarrinho();
                  setModalOpcoesCarrinho(false);
                }}
                className="w-full p-3 rounded-2xl bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-2 hover:bg-rose-100 transition text-left"
              >
                <Trash2 className="w-4 h-4" />
                <span>Limpar todos os itens do carrinho</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // TELA 001 & TELA 007: TELA PRINCIPAL DE VENDER (MOBILE)
  // =========================================================================
  return (
    <div className="flex flex-col h-full bg-white text-slate-900 overflow-hidden select-none">
      {/* 1. Header Superior Mobile */}
      <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuDrawerAberto(true)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            title="Menu Principal"
          >
            <div className="space-y-1">
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
            </div>
          </button>
          <h1 className="font-black text-lg text-slate-800 tracking-tight">Vender</h1>
        </div>

        <button
          type="button"
          onClick={() => setSubTela('clientes')}
          className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center font-black text-xs shadow-sm transition cursor-pointer active:scale-95"
          title="Adicionar ou Selecionar Cliente"
        >
          {clienteSelecionado ? (
            <span className="text-[11px] uppercase truncate max-w-[32px] px-0.5">
              {clienteSelecionado.nome.slice(0, 2)}
            </span>
          ) : (
            '+8'
          )}
        </button>
      </div>

      {/* 2. Barra de Ferramentas / Ações Rápidas (Ou Barra de Busca Tela 004) */}
      {buscaAberta ? (
        // TELA 004: Busca Aberta
        <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0 animate-in fade-in">
          <div className="relative flex-1">
            <input
              ref={inputBuscaRef}
              type="text"
              placeholder="Item ou código"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
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
          <button
            type="button"
            onClick={() => {
              setBuscaAberta(false);
              setTermoBusca('');
            }}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        // Barra de Ícones Padrão (Tela 001)
        <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 text-slate-600">
            {/* Busca 🔍 */}
            <button
              type="button"
              onClick={() => setBuscaAberta(true)}
              className="p-1 text-slate-600 hover:text-slate-900 transition"
              title="Buscar Produto"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Leitor Código de Barras 📷 */}
            <button
              type="button"
              onClick={() => setSubTela('camera')}
              className="p-1 text-slate-600 hover:text-slate-900 transition"
              title="Leitor de Código de Barras"
            >
              <div className="w-5 h-5 border-2 border-dashed border-slate-600 rounded flex items-center justify-center">
                <span className="w-2.5 h-0.5 bg-slate-600" />
              </div>
            </button>

            {/* Item Avulso / Raio ⚡ */}
            <button
              type="button"
              onClick={() => setSubTela('avulso')}
              className="p-1 text-slate-600 hover:text-slate-900 transition"
              title="Vender item não cadastrado"
            >
              <Zap className="w-5 h-5" />
            </button>

            {/* Alternador Grade / Lista ☷ / 㗊 */}
            <button
              type="button"
              onClick={() => setModoVisualizacao(modoVisualizacao === 'grade' ? 'lista' : 'grade')}
              className="p-1 text-slate-600 hover:text-slate-900 transition"
              title="Alternar Visualização Grade/Lista"
            >
              {modoVisualizacao === 'grade' ? (
                <List className="w-5 h-5" />
              ) : (
                <LayoutGrid className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Multiplicador 1X */}
          <button
            type="button"
            onClick={() => setModalMultiplicador(true)}
            className="px-2.5 py-1 rounded-md border border-slate-300 text-xs font-black text-slate-700 bg-white hover:bg-slate-50 shadow-xs transition"
          >
            {multiplicadorQtd}X
          </button>
        </div>
      )}

      {/* 3. Abas de Categorias Horizontais */}
      <div className="px-3 border-b border-slate-200 bg-white flex items-center gap-4 overflow-x-auto scrollbar-none shrink-0 text-xs font-bold uppercase tracking-wider text-slate-400">
        <button
          type="button"
          onClick={() => setCategoriaAtiva('tudo')}
          className={`py-2.5 border-b-2 whitespace-nowrap transition cursor-pointer ${
            categoriaAtiva === 'tudo' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
          }`}
        >
          TUDO
        </button>

        <button
          type="button"
          onClick={() => setCategoriaAtiva('destaques')}
          className={`py-2.5 border-b-2 whitespace-nowrap transition cursor-pointer ${
            categoriaAtiva === 'destaques' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
          }`}
        >
          DESTAQUES
        </button>

        {categorias.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoriaAtiva(cat.id)}
            className={`py-2.5 border-b-2 whitespace-nowrap transition cursor-pointer ${
              categoriaAtiva === cat.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
            }`}
          >
            {cat.nome}
          </button>
        ))}
      </div>

      {/* 4. Catálogo de Produtos */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3">
        {produtosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-2 text-xs">
            <Package className="w-8 h-8 stroke-1" />
            <p>Nenhum produto encontrado.</p>
          </div>
        ) : modoVisualizacao === 'grade' ? (
          // MODO GRADE: 3 COLUNAS COMPACTAS (TELA 001)
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
              const qtdNoCarrinho = mapaQuantidadesCarrinho.get(produto.id) || 0;
              const precoFinal = produto.preco_venda_varejo;
              const precoOriginal = produto.preco_promocional ? produto.preco_venda_varejo : null;

              return (
                <div
                  key={produto.id}
                  onClick={() => handleClicarProduto(produto)}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:border-emerald-400 active:scale-95 transition-all duration-100 flex flex-col justify-between cursor-pointer group"
                >
                  <div className="relative aspect-square bg-slate-50">
                    <img
                      src={fotoUrl}
                      alt={produto.nome}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Badge Verde de Quantidade Acumulada */}
                    {qtdNoCarrinho > 0 && (
                      <span className="absolute top-1 right-1 bg-emerald-500 text-white font-black text-[10px] w-5 h-5 rounded-md flex items-center justify-center shadow-md animate-in zoom-in-75">
                        {qtdNoCarrinho}
                      </span>
                    )}
                  </div>

                  {/* Card Bottom Limpo */}
                  <div className="bg-white p-2 space-y-0.5 border-t border-slate-100">
                    <div className="flex items-start gap-1">
                      {produto.destaque && (
                        <span className="text-amber-500 text-[10px] shrink-0">★</span>
                      )}
                      <h3 className="font-bold text-[11px] uppercase truncate leading-tight text-slate-800">
                        {produto.nome}
                      </h3>
                    </div>

                    <div className="flex items-baseline justify-between pt-0.5">
                      <span className="font-black text-xs text-emerald-600">
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
          <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
              const qtdNoCarrinho = mapaQuantidadesCarrinho.get(produto.id) || 0;
              const precoFinal = produto.preco_venda_varejo;
              const precoOriginal = produto.preco_promocional ? produto.preco_venda_varejo : null;

              return (
                <div
                  key={produto.id}
                  onClick={() => handleClicarProduto(produto)}
                  className="p-3 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                      <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover" />
                      {qtdNoCarrinho > 0 && (
                        <span className="absolute top-0.5 right-0.5 bg-emerald-500 text-white font-black text-[9px] w-4 h-4 rounded flex items-center justify-center">
                          {qtdNoCarrinho}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 max-w-[190px]">
                      <div className="flex items-center gap-1">
                        {produto.destaque && <span className="text-amber-500 text-xs">★</span>}
                        <h3 className="font-bold text-xs uppercase text-slate-800 truncate">{produto.nome}</h3>
                      </div>
                      <span className="text-[10px] text-slate-400 block font-mono">
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
                    <span className="font-black text-xs text-emerald-600">
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
      <div className="p-3 border-t border-slate-200 bg-white shadow-lg shrink-0">
        {itens.length === 0 ? (
          <div className="w-full py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-400 font-bold text-xs">
            Nenhum item
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSubTela('carrinho')}
            className="w-full py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-white font-black text-sm flex items-center justify-between shadow-md shadow-emerald-500/20 transition cursor-pointer"
          >
            <span>
              {totalItens} {totalItens === 1 ? 'item' : 'itens'} = R$ {total.toFixed(2)}
            </span>
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Modal de Escolha do Multiplicador (1x, 2x, 3x, 5x, 10x) */}
      {modalMultiplicador && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-800">Multiplicador de Quantidade</h3>
              <button
                type="button"
                onClick={() => setModalMultiplicador(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
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
                  className={`py-3 rounded-2xl border transition ${
                    multiplicadorQtd === fator
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {fator}X
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DRAWER MENU UNIFICADO MOBILE */}
      <MobileMenuDrawer
        aberto={menuDrawerAberto}
        onFechar={() => setMenuDrawerAberto(false)}
        pedidosConfirmadosCount={pedidosConfirmadosCount}
      />
    </div>
  );
};
export default PosCheckoutMobile;
