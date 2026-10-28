import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  Barcode,
  Camera,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  Minus,
  Trash2,
  User,
  CreditCard,
  Printer,
  Share2,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Tag,
  ArrowRight,
  Layers,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  CloudOff,
  Banknote,
  Zap,
  FileText,
  Loader2,
  Mail,
  Download,
  Copy,
  Truck,
  Store,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Sparkles,
  Ticket
} from 'lucide-react';
import { creditRiskJevService, AvaliacaoRiscoCredito } from '../services/creditRiskJevService';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCart, FORMA_ENTREGA_RETIRADA_PADRAO, CartItem } from '../contexts/CartContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useTheme } from '../contexts/ThemeContext';
import { Produto, VariacaoProduto, Cliente, FormaPagamento, TabelaPreco, Pedido, ItemPedido, Categoria, StatusPedido, StatusPagamento, TipoPagamento, PedidoEntrega, Cupom } from '../types';
import { CupomService } from '../services/cupomService';
import { PrintService, formatarDataRecibo, obterDadosPagamentoRecibo } from '../services/printService';
import { ModalNovoCliente } from './ModalNovoCliente';
import { ModalLeitorCodigoBarras } from './ModalLeitorCodigoBarras';
import { ModalDefinirEnvio } from './pedidos/ModalDefinirEnvio';
import { ReciboPedidoModal } from './pedidos/ReciboPedidoModal';
import { ShippingFulfillmentSelector } from './shipping/ShippingFulfillmentSelector';
import { ModalAtualizarEnderecoCliente } from './shipping/ModalAtualizarEnderecoCliente';
import { ShippingOrchestrator } from '../services/shippingOrchestrator';
import { ShippingSelectionResult, LojaShippingConfig } from '../types/shipping';
import { extrairObservacaoLimpa, formatarMoeda, formatarValorBRL, ehProdutoFracionado, obterSiglaUnidade, formatarLinhaCalculoItem } from '../utils/formatters';
import { ModalInputPesoFracionado } from './ui/ModalInputPesoFracionado';
import { InputQuantidadeCarrinho } from './ui/InputQuantidadeCarrinho';
import { caixaService } from '../services/caixaService';
import { SyncService } from '../services/syncService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { VendaOfflineFila } from '../services/offlineDb';
import { obterDataOperacaoISO } from '../utils/dataOperacao';
import { audioService } from '../services/audioService';
import { VendaService } from '../services/vendaService';
import { PosCheckoutMobile, SubTelaMobile } from './PosCheckoutMobile';
import { obterOpcoesStatusAlteracao, isStatusPedidoAtivo, obterInfoVencimentoFiado, podeEditarPedido } from '../utils/statusPedidoUtils';
import { ReceiptPdfService } from '../services/receiptPdfService';
import { obterInfoEntregaRecibo } from '../services/printService';

/**
 * Retorna o peso de prioridade da categoria para ordenação no PDV:
 * 1º Cosméticos
 * 2º Brinquedos Eróticos
 * 3º Próteses
 * 4º Fantasias
 * 5º Couro / SADO
 * Demais categorias: alfabética
 */
export function getCategoriaPeso(nomeCategoria?: string | null): number {
  if (!nomeCategoria) return 999;
  const limpo = nomeCategoria
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (limpo.includes('COSMETICO')) return 1;
  if (limpo.includes('BRINQUEDO') || limpo.includes('BRNQUEDO')) return 2;
  if (limpo.includes('PROTESE')) return 3;
  if (limpo.includes('FANTASIA')) return 4;
  if (limpo.includes('COURO') || limpo.includes('SADO')) return 5;
  return 100;
}

export interface LinhaPagamentoPDV {
  id: string;
  forma_pagamento_id: string;
  forma_tipo: TipoPagamento;
  forma_nome: string;
  valor: number;
  valor_entregue?: number | null;
  parcelas?: number;
}

interface MoneyInputProps {
  valor: number;
  onChange: (novoValor: number) => void;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  style?: React.CSSProperties;
}

const MoneyInput: React.FC<MoneyInputProps> = ({
  valor,
  onChange,
  autoFocus,
  className,
  placeholder = "0,00",
  style
}) => {
  const [texto, setTexto] = useState<string>(() =>
    valor > 0 ? formatarValorBRL(valor) : ''
  );
  const [focado, setFocado] = useState(false);

  useEffect(() => {
    if (!focado) {
      setTexto(valor > 0 ? formatarValorBRL(valor) : '');
    }
  }, [valor, focado]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Permite apenas números e separadores decimais (vírgula e ponto)
    const sanitizado = raw.replace(/[^\d.,]/g, '');
    setTexto(sanitizado);

    if (!sanitizado) {
      onChange(0);
      return;
    }

    // Normaliza para float numérico: remove pontos e converte vírgula para ponto
    let normalizado = sanitizado;
    if (normalizado.includes(',')) {
      normalizado = normalizado.replace(/\./g, '').replace(',', '.');
    }
    const parsed = parseFloat(normalizado);
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  const handleBlur = () => {
    setFocado(false);
    if (valor > 0) {
      setTexto(formatarValorBRL(valor));
    } else {
      setTexto('');
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoFocus={autoFocus}
      onFocus={(e) => {
        setFocado(true);
        e.target.select();
      }}
      onBlur={handleBlur}
      value={texto}
      onChange={handleChange}
      placeholder={placeholder}
      style={style}
      className={className}
    />
  );
};

const gerarSnapshotCarrinhoPdv = (
  itensAtuais: CartItem[],
  cli: Cliente | null | undefined,
  desc: number,
  tipoDesc: 'valor' | 'percentual',
  taxa: number,
  entrega: PedidoEntrega | null | undefined
) => {
  const itensStr = (itensAtuais || [])
    .map(i => `${i.produto?.id || (i as any).produto_id || ''}_${i.variacao?.id || (i as any).variacao_id || 'base'}:${Number(i.quantidade || 0)}`)
    .sort()
    .join('|');
  const cliId = cli?.id || '';
  const descVal = Number(desc || 0).toFixed(2);
  const taxaVal = Number(taxa || 0).toFixed(2);
  const tipoAtend = entrega?.tipo_atendimento || 'retirada';
  return `${itensStr}#${cliId}#${descVal}#${tipoDesc}#${taxaVal}#${tipoAtend}`;
};

export const PosCheckout: React.FC = () => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const permissions = usePermissions();
  const { mostrarSucesso, mostrarAviso, mostrarErro, mostrarToast, setTemAlteracoesNaoSalvas, verificarSaidaComConfirmacao } = useFeedbackModal();
  const cart = useCart();
  const {
    itens: rawItens,
    clienteSelecionado,
    tabelaPrecoGlobal,
    tabelaPrecoCalculada,
    avaliacaoCarrinho,
    desconto,
    descontoPercentual,
    tipoDesconto,
    taxaEntrega,
    pedidoEntrega,
    subtotal,
    total,
    totalItens,
    pedidoEmEdicao,
    temAlteracoesPedido,
    isHydrated,
    resetarSnapshotPedido,
    adicionarItem,
    removerItem,
    atualizarQuantidade,
    sincronizarEstoqueCarrinho,
    setClienteSelecionado,
    setTabelaPrecoGlobal,
    setDescontoValor,
    setDescontoPercentual,
    setTipoDesconto,
    setDesconto,
    setTaxaEntrega,
    setPedidoEntrega,
    limparCarrinho,
    cancelarEdicaoPedido,
    atualizarStatusPedidoEmEdicao
  } = cart || {};

  const itens = useMemo(() => (Array.isArray(rawItens) ? rawItens : []), [rawItens]);

  const isEdicaoTravada = Boolean(pedidoEmEdicao && !podeEditarPedido(pedidoEmEdicao));

  const [modalFulfillmentAberto, setModalFulfillmentAberto] = useState<boolean>(false);
  const [draftFulfillment, setDraftFulfillment] = useState<ShippingSelectionResult | null>(null);
  const [modalAtualizarEnderecoAberto, setModalAtualizarEnderecoAberto] = useState<boolean>(false);
  const [modalDefinirEnvioAberto, setModalDefinirEnvioAberto] = useState<boolean>(false);
  const [freteConfirmado, setFreteConfirmado] = useState<boolean>(false);
  const [subTelaMobile, setSubTelaMobile] = useState<SubTelaMobile>('vender');

  const ehEnvio = pedidoEntrega?.tipo_atendimento === 'entrega';
  const temCliente = Boolean(clienteSelecionado && clienteSelecionado.id);
  const isFreteConfirmado = freteConfirmado || Boolean(
    ehEnvio &&
    pedidoEntrega &&
    pedidoEntrega.servico_codigo &&
    pedidoEntrega.servico_codigo !== 'pendente' &&
    (taxaEntrega > 0 || (pedidoEntrega.transportadora_nome && pedidoEntrega.transportadora_nome !== 'Envio a Definir'))
  );

  useEffect(() => {
    setFreteConfirmado(false);
  }, [clienteSelecionado?.id]);

  const snapshotInicialRef = useRef<string | null>(null);
  const pedidoIdInicialRef = useRef<string | null>(null);

  // Snapshot determinístico do carrinho para verificação estrita de alterações na sessão
  const snapshotAtual = useMemo(() => {
    return gerarSnapshotCarrinhoPdv(
      itens,
      clienteSelecionado,
      desconto,
      tipoDesconto,
      taxaEntrega,
      pedidoEntrega
    );
  }, [itens, clienteSelecionado, desconto, tipoDesconto, taxaEntrega, pedidoEntrega]);

  // Ao hidratar ou carregar um pedido, estabelece o snapshot inicial de referência da sessão
  useEffect(() => {
    if (!isHydrated) return;

    const idAtual = pedidoEmEdicao?.id || null;
    if (snapshotInicialRef.current === null || pedidoIdInicialRef.current !== idAtual) {
      snapshotInicialRef.current = snapshotAtual;
      pedidoIdInicialRef.current = idAtual;
      setTemAlteracoesNaoSalvas(false);
      return;
    }

    // Só bloqueia a saída se o operador efetivamente adicionou/removeu itens, alterou quantidades, cliente ou desconto
    const houveAlteracao = snapshotAtual !== snapshotInicialRef.current;
    setTemAlteracoesNaoSalvas(houveAlteracao);
  }, [
    isHydrated,
    pedidoEmEdicao?.id,
    snapshotAtual,
    setTemAlteracoesNaoSalvas
  ]);

  useEffect(() => {
    return () => {
      setTemAlteracoesNaoSalvas(false);
    };
  }, [setTemAlteracoesNaoSalvas]);

  const {
    isOnline,
    pendentesCount,
    sincronizando,
    ultimoSyncMsg,
    atualizarContadorPendentes,
    sincronizarAgora
  } = useNetworkStatus(loja?.id);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('todas');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [buscaProduto, setBuscaProduto] = useState<string>('');
  const [buscaCodigoBarras, setBuscaCodigoBarras] = useState<string>('');
  const [apenasEmEstoque, setApenasEmEstoque] = useState<boolean>(() => {
    try {
      const salvo = localStorage.getItem('hubi_pdv_apenas_em_estoque');
      return salvo !== null ? salvo === 'true' : false;
    } catch {
      return false;
    }
  });

  const [codigoCupomInput, setCodigoCupomInput] = useState<string>('');
  const [cupomAplicado, setCupomAplicado] = useState<Cupom | null>(null);
  const [valorDescontoCupom, setValorDescontoCupom] = useState<number>(0);
  const [validandoCupom, setValidandoCupom] = useState<boolean>(false);
  const [mensagemCupom, setMensagemCupom] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  const [produtoModalVariacao, setProdutoModalVariacao] = useState<Produto | null>(null);
  const [itemPesagemModal, setItemPesagemModal] = useState<{ produto: Produto; variacao?: VariacaoProduto | null; quantidadeAtual?: number; cartId?: string } | null>(null);
  const [modalFechamento, setModalFechamento] = useState<boolean>(false);
  const [formaPagamentoEscolhida, setFormaPagamentoEscolhida] = useState<FormaPagamento | null>(null);
  const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<string>('');
  const [parcelasCartao, setParcelasCartao] = useState<number>(1);
  const [linhasPagamento, setLinhasPagamento] = useState<LinhaPagamentoPDV[]>([]);
  const [configShippingLoja, setConfigShippingLoja] = useState<LojaShippingConfig | null>(null);
  const [finalizandoVenda, setFinalizandoVenda] = useState<boolean>(false);
  const [salvandoPendente, setSalvandoPendente] = useState<boolean>(false);
  const [pedidoConcluido, setPedidoConcluido] = useState<Pedido | null>(null);
  const [ehVendaOfflineSalva, setEhVendaOfflineSalva] = useState<boolean>(false);
  const [compartilhandoWhatsAppPdf, setCompartilhandoWhatsAppPdf] = useState<boolean>(false);
  const [baixandoPdfRecibo, setBaixandoPdfRecibo] = useState<boolean>(false);
  const reciboRef = useRef<HTMLDivElement>(null);

  const handleFecharRecibo = () => {
    setPedidoConcluido(null);
    setSubTelaMobile('vender');
  };

  const [modalNovoCliente, setModalNovoCliente] = useState<boolean>(false);
  const [modalCameraBarcode, setModalCameraBarcode] = useState<boolean>(false);
  const [clienteBuscaTexto, setClienteBuscaTexto] = useState<string>('');
  const [clienteDropdownAberto, setClienteDropdownAberto] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const clienteDropdownRef = useRef<HTMLDivElement>(null);
  const inputClienteBuscaRef = useRef<HTMLInputElement>(null);

  const FORMAS_PADRAO: FormaPagamento[] = [
    { id: `fp_dinheiro_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_pix_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Pix (Imediato)', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_debito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_credito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
    { id: `fp_fiado_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Fiado / A Prazo', tipo: 'fiado', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false },
    { id: `fp_caderneta_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Caderneta', tipo: 'caderneta', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false }
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clienteDropdownRef.current && !clienteDropdownRef.current.contains(event.target as Node)) {
        setClienteDropdownAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const clientesFiltrados = useMemo(() => {
    if (!clienteBuscaTexto.trim()) return clientes;
    const termo = clienteBuscaTexto.toLowerCase().trim();
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(termo) ||
      (c.whatsapp && c.whatsapp.includes(termo)) ||
      (c.telefone && c.telefone.includes(termo)) ||
      (c.numero_documento && c.numero_documento.includes(termo))
    );
  }, [clientes, clienteBuscaTexto]);

  const opcoesStatusPdv = useMemo(() => {
    return obterOpcoesStatusAlteracao(loja, pedidoEmEdicao?.status, false);
  }, [loja, pedidoEmEdicao?.status]);

  // Verifica se o cliente selecionado está habilitado e possui saldo no limite de crédito fiado
  const clienteAptoFiado = useMemo(() => {
    return Boolean(
      clienteSelecionado?.id &&
      clienteSelecionado.permite_fiado === true &&
      Number(clienteSelecionado.limite_credito || 0) > 0
    );
  }, [clienteSelecionado]);

  // Verifica se a loja e o cliente estão habilitados para a Caderneta de Mercadinho
  const clienteAptoCaderneta = useMemo(() => {
    const cadernetaAtivaLoja = Boolean(
      loja?.caderneta_ativa ?? loja?.configuracoes_extras?.pagamentos?.caderneta_ativa
    );
    if (!cadernetaAtivaLoja || !clienteSelecionado?.id) return false;
    const permite = Boolean(clienteSelecionado.permite_caderneta);
    const limite = Number(clienteSelecionado.limite_caderneta || 0);
    const saldo = Number(clienteSelecionado.saldo_devedor_caderneta || 0);
    return permite && (limite - saldo) > 0;
  }, [loja?.caderneta_ativa, loja?.configuracoes_extras, clienteSelecionado]);

  // Filtra as formas de pagamento disponíveis: Fiado e Caderneta respeitam habilitação, exclusividade mútua e saldo
  const formasPagamentoDisponiveis = useMemo(() => {
    const listaFPs = (((formasPagamento?.length || 0) > 0) ? formasPagamento : FORMAS_PADRAO).map(fp =>
      (fp.tipo === 'caderneta' || fp.nome?.toLowerCase().includes('caderneta'))
        ? { ...fp, tipo: 'caderneta' as const }
        : fp
    );
    const base = [...listaFPs];
    const cadernetaAtivaLoja = Boolean(loja?.caderneta_ativa ?? loja?.configuracoes_extras?.pagamentos?.caderneta_ativa);
    const fiadoAtivoLoja = !cadernetaAtivaLoja && Boolean(loja?.configuracoes_extras?.pagamentos?.permitir_fiado ?? true);

    // Se a loja tem caderneta ativa e não veio na lista do banco, injeta opção padrão de caderneta
    if (cadernetaAtivaLoja && !base.some(f => f.tipo === 'caderneta')) {
      base.push({
        id: `fp_caderneta_${loja?.id || 'default'}`,
        loja_id: loja?.id || '',
        nome: 'Caderneta',
        tipo: 'caderneta',
        taxa_percentual: 0,
        taxa_fixa: 0,
        maximo_parcelas: 1,
        ativo: true,
        exibir_catalogo: false
      });
    }

    return base.filter(fp => {
      if (!fp.ativo) return false;
      if (fp.tipo === 'fiado') {
        return fiadoAtivoLoja && permissions.podeAtivarFiado && clienteAptoFiado;
      }
      if (fp.tipo === 'caderneta') {
        return cadernetaAtivaLoja && clienteAptoCaderneta;
      }
      return true;
    });
  }, [formasPagamento, permissions.podeAtivarFiado, clienteAptoFiado, clienteAptoCaderneta, loja?.caderneta_ativa, loja?.configuracoes_extras?.pagamentos, loja?.id]);

  // Sanitiza linhas de pagamento caso o cliente selecionado mude ou não possua limite fiado/caderneta
  useEffect(() => {
    const temFiadoInvalido = !clienteAptoFiado && linhasPagamento.some(l => l.forma_tipo === 'fiado');
    const temCadernetaInvalida = !clienteAptoCaderneta && linhasPagamento.some(l => l.forma_tipo === 'caderneta');

    if (temFiadoInvalido || temCadernetaInvalida) {
      const fpPadrao = formasPagamentoDisponiveis.find(f => f.tipo === 'dinheiro') || formasPagamentoDisponiveis[0] || FORMAS_PADRAO[0];
      setLinhasPagamento(prev => prev.map(l => {
        if ((!clienteAptoFiado && l.forma_tipo === 'fiado') || (!clienteAptoCaderneta && l.forma_tipo === 'caderneta')) {
          return {
            ...l,
            forma_pagamento_id: fpPadrao.id,
            forma_tipo: fpPadrao.tipo,
            forma_nome: fpPadrao.nome
          };
        }
        return l;
      }));
    }
  }, [clienteAptoFiado, formasPagamentoDisponiveis, linhasPagamento]);

  // Totais e balanço das linhas de pagamento do pedido
  const totalLinhasPagamento = useMemo(() => {
    return linhasPagamento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
  }, [linhasPagamento]);

  // Fase 4: Avaliação Preditiva de Risco de Crédito no Fiado (TypeSafe Jev)
  const [avaliacaoRiscoFiado, setAvaliacaoRiscoFiado] = useState<AvaliacaoRiscoCredito | null>(null);
  const [avaliandoRiscoFiado, setAvaliandoRiscoFiado] = useState<boolean>(false);

  const valorLinhaFiado = useMemo(() => {
    const lFiado = linhasPagamento.find(l => l.forma_tipo === 'fiado');
    return lFiado ? Number(lFiado.valor || 0) : 0;
  }, [linhasPagamento]);

  useEffect(() => {
    if (!clienteSelecionado || !loja?.id || valorLinhaFiado <= 0) {
      setAvaliacaoRiscoFiado(null);
      return;
    }

    let ativo = true;
    const timer = setTimeout(async () => {
      setAvaliandoRiscoFiado(true);
      try {
        const res = await creditRiskJevService.avaliarRiscoFiado({
          cliente: clienteSelecionado,
          lojaId: loja.id,
          valorVendaAtual: valorLinhaFiado,
        });
        if (ativo) setAvaliacaoRiscoFiado(res);
      } catch (err) {
        console.warn('Erro ao avaliar risco de crédito fiado:', err);
      } finally {
        if (ativo) setAvaliandoRiscoFiado(false);
      }
    }, 300);

    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [clienteSelecionado, loja?.id, valorLinhaFiado]);

  const ehCupomFreteGratis = Boolean(cupomAplicado && cupomAplicado.tipo === 'frete_gratis');
  const totalComCupom = useMemo(() => {
    return Math.max(0, Number((total - (valorDescontoCupom || 0)).toFixed(2)));
  }, [total, valorDescontoCupom]);

  // Ponto 12: Quando houver apenas 1 linha de pagamento (sem split), sincronizar automaticamente com o total da venda ao atualizar frete ou desconto
  useEffect(() => {
    if (!modalFechamento) return;
    if (linhasPagamento.length === 1) {
      const valorAlvo = totalComCupom;
      if (Math.abs((linhasPagamento[0].valor || 0) - valorAlvo) > 0.009) {
        setLinhasPagamento(prev => {
          if (prev.length === 1 && Math.abs((prev[0].valor || 0) - valorAlvo) > 0.009) {
            return [{
              ...prev[0],
              valor: valorAlvo,
              valor_entregue: prev[0].forma_tipo === 'dinheiro' && prev[0].valor_entregue ? valorAlvo : prev[0].valor_entregue
            }];
          }
          return prev;
        });
      }
    }
  }, [modalFechamento, totalComCupom, linhasPagamento.length]);

  const diferencaPagamento = useMemo(() => {
    return Number((totalComCupom - totalLinhasPagamento).toFixed(2));
  }, [totalComCupom, totalLinhasPagamento]);

  const handleAlterarFormaLinha = (linhaId: string, fp: FormaPagamento) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      let val = l.valor;
      if (fp.tipo === 'fiado' && clienteSelecionado) {
        const limiteMax = Number(clienteSelecionado.limite_credito || 0);
        if (val > limiteMax) {
          val = limiteMax;
        }
      }
      return {
        ...l,
        forma_pagamento_id: fp.id,
        forma_tipo: fp.tipo,
        forma_nome: fp.nome,
        valor: val,
        valor_entregue: fp.tipo === 'dinheiro' ? (l.valor_entregue ?? l.valor) : null,
        parcelas: fp.tipo === 'cartao_credito' ? (l.parcelas || 1) : 1
      };
    }));
  };

  const handleAlterarValorLinha = (linhaId: string, valor: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      let val = Math.max(0, valor);
      if (l.forma_tipo === 'fiado' && clienteSelecionado) {
        const limiteMax = Number(clienteSelecionado.limite_credito || 0);
        if (val > limiteMax) {
          val = limiteMax;
        }
      }
      return { ...l, valor: val };
    }));
  };

  const handleAlterarEntregueLinha = (linhaId: string, valorEntregue: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return { ...l, valor_entregue: Math.max(0, valorEntregue) };
    }));
  };

  const handleUsarEntregueComoValorLinha = (linhaId: string) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      const novoVal = l.valor_entregue && l.valor_entregue > 0 ? l.valor_entregue : l.valor;
      return { ...l, valor: novoVal };
    }));
  };

  const handlePreencherRestanteLinha = (linhaId: string) => {
    setLinhasPagamento(prev => {
      const outrasLinhas = prev.filter(l => l.id !== linhaId);
      const somaOutras = outrasLinhas.reduce((sum, l) => sum + (Number(l.valor) || 0), 0);
      const restante = Math.max(0, Number((totalComCupom - somaOutras).toFixed(2)));
      return prev.map(l => l.id === linhaId ? { ...l, valor: restante } : l);
    });
  };

  const handleAlterarParcelasLinha = (linhaId: string, parcelas: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return { ...l, parcelas: Math.max(1, parcelas) };
    }));
  };

  const handleAdicionarLinhaPagamento = () => {
    const restante = Math.max(0, diferencaPagamento);
    const fpPadrao = formasPagamentoDisponiveis.find(f => f.tipo !== 'fiado' && !linhasPagamento.some(l => l.forma_tipo === f.tipo)) || formasPagamentoDisponiveis[0] || FORMAS_PADRAO[0];
    
    setLinhasPagamento(prev => [
      ...prev,
      {
        id: `linha_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        forma_pagamento_id: fpPadrao.id,
        forma_tipo: fpPadrao.tipo,
        forma_nome: fpPadrao.nome,
        valor: restante,
        valor_entregue: fpPadrao.tipo === 'dinheiro' ? (restante > 0 ? restante : null) : null,
        parcelas: 1
      }
    ]);
  };

  const handleRemoverLinhaPagamento = (linhaId: string) => {
    if ((linhasPagamento?.length || 0) <= 1) return;
    setLinhasPagamento(prev => prev.filter(l => l.id !== linhaId));
  };

  useEffect(() => {
    if (!loja?.id) return;
    const carregarDados = async () => {
      try {
        setCarregando(true);
        // Carregamento Híbrido: sincroniza do Supabase para o IndexedDB e traz os dados
        const dados = await SyncService.baixarDadosParaOffline(loja.id);
        if (dados?.produtos) setProdutos(dados.produtos);
        if (dados?.clientes) setClientes(dados.clientes);

        // Buscar categorias da loja
        try {
          const { data: cats } = await supabase
            .from('categorias')
            .select('*')
            .eq('loja_id', loja.id)
            .order('ordem_exibicao', { ascending: true });
          if (cats) setCategorias(cats);
        } catch (e) {
          console.warn('Categorias não puderam ser carregadas:', e);
        }

        try {
          const cfgShipping = await ShippingOrchestrator.buscarConfigLoja(loja.id);
          if (cfgShipping) setConfigShippingLoja(cfgShipping);
        } catch (e) {
          console.warn('Configurações de frete não puderam ser carregadas:', e);
        }

        const fps = (dados?.formasPagamento && (dados.formasPagamento?.length || 0) > 0) ? dados.formasPagamento : FORMAS_PADRAO;
        setFormasPagamento(fps);
        setFormaPagamentoEscolhida(prev => prev || fps[0]);
      } catch (err) {
        console.error('Erro ao carregar dados do PDV:', err);
        setFormasPagamento(FORMAS_PADRAO);
        setFormaPagamentoEscolhida(prev => prev || FORMAS_PADRAO[0]);
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [loja?.id]);

  const recarregarProdutos = useCallback(async () => {
    if (!loja?.id) return;
    try {
      const dados = await SyncService.baixarDadosParaOffline(loja.id);
      if (dados?.produtos && dados.produtos.length > 0) {
        setProdutos(dados.produtos);
      }
    } catch (err) {
      console.warn('Aviso ao sincronizar produtos atualizados no PDV:', err);
    }
  }, [loja?.id]);

  // Sincroniza imediatamente o estoque dos itens no carrinho sempre que a listagem de produtos atualizar
  useEffect(() => {
    if (produtos && produtos.length > 0 && sincronizarEstoqueCarrinho) {
      sincronizarEstoqueCarrinho(produtos);
    }
  }, [produtos, sincronizarEstoqueCarrinho]);

  // Atualização em tempo real via Supabase Realtime e ao focar na janela do PDV
  useEffect(() => {
    if (!loja?.id) return;

    const canalNome = `pdv_produtos_realtime_${loja.id}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(canalNome)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'produtos', filter: `loja_id=eq.${loja.id}` },
        () => {
          recarregarProdutos();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'variacoes_produto' },
        () => {
          recarregarProdutos();
        }
      )
      .subscribe();

    const handleFocus = () => {
      recarregarProdutos();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loja?.id, recarregarProdutos]);

  const handleClicarFormaEntrega = () => {
    setModalDefinirEnvioAberto(true);
  };

  const handleAbrirFechamento = () => {
    if ((itens?.length || 0) === 0) return;

    if (!pedidoEntrega) {
      mostrarAviso(
        'Por favor, selecione a Forma de Entrega (Retirada ou Entrega) no carrinho antes de prosseguir com o pagamento.',
        'Forma de Entrega Obrigatória'
      );
      return;
    }

    const listaFPs = ((formasPagamento?.length || 0) > 0) ? formasPagamento : FORMAS_PADRAO;
    if ((formasPagamento?.length || 0) === 0) {
      setFormasPagamento(listaFPs);
    }

    if (pedidoEmEdicao) {
      let infoPrevisto: any = null;

      // 1. Tentar ler da relação relacional pagamentos_previstos
      if (pedidoEmEdicao?.pagamentos_previstos && (pedidoEmEdicao.pagamentos_previstos?.length || 0) > 0) {
        const p = pedidoEmEdicao.pagamentos_previstos[pedidoEmEdicao.pagamentos_previstos.length - 1];
        infoPrevisto = {
          forma_pagamento_id: p.forma_pagamento_id,
          forma_tipo: p.forma_tipo,
          forma_nome: p.forma_nome,
          parcelas: p.parcelas
        };
      }

      if (!infoPrevisto) {
        try {
          const local = localStorage.getItem(`hubi_pag_previsto_${pedidoEmEdicao.id}`);
          if (local) infoPrevisto = JSON.parse(local);
        } catch (e) {}
      }

      if (!infoPrevisto && pedidoEmEdicao.metadados) {
        try {
          const metaObj = typeof pedidoEmEdicao.metadados === 'string'
            ? JSON.parse(pedidoEmEdicao.metadados)
            : pedidoEmEdicao.metadados;
          if (metaObj?.pagamento_previsto) {
            infoPrevisto = metaObj.pagamento_previsto;
          }
        } catch (e) {}
      }

      if (!infoPrevisto && typeof pedidoEmEdicao.observacoes === 'string') {
        const match = pedidoEmEdicao.observacoes.match(/\[PAG_PREVISTO:(.*?)\]/);
        if (match && match[1]) {
          try {
            infoPrevisto = JSON.parse(match[1]);
          } catch (e) {}
        }
      }

      if (!infoPrevisto && pedidoEmEdicao?.pagamentos && (pedidoEmEdicao.pagamentos?.length || 0) > 0) {
        const p = pedidoEmEdicao.pagamentos[pedidoEmEdicao.pagamentos.length - 1];
        infoPrevisto = {
          forma_pagamento_id: p.forma_pagamento_id,
          forma_tipo: p.forma_pagamento?.tipo,
          forma_nome: p.forma_pagamento?.nome,
          parcelas: p.parcelas
        };
      }

      if (infoPrevisto) {
        const fpCorrespondente = listaFPs.find(f =>
          (infoPrevisto.forma_pagamento_id && f.id === infoPrevisto.forma_pagamento_id) ||
          (infoPrevisto.forma_tipo && f.tipo === infoPrevisto.forma_tipo) ||
          (infoPrevisto.forma_nome && f.nome.toLowerCase() === infoPrevisto.forma_nome.toLowerCase())
        );
        if (fpCorrespondente) {
          setFormaPagamentoEscolhida(fpCorrespondente);
        }
        if (infoPrevisto.valor_entregue && Number(infoPrevisto.valor_entregue) > 0) {
          setValorRecebidoDinheiro(Number(infoPrevisto.valor_entregue).toFixed(2));
        }
        if (infoPrevisto.parcelas && Number(infoPrevisto.parcelas) > 0) {
          setParcelasCartao(Number(infoPrevisto.parcelas));
        }
      }
    }

    const fpPadrao = formasPagamentoDisponiveis.find(f => f.tipo === 'dinheiro') || formasPagamentoDisponiveis[0] || listaFPs[0];

    if (pedidoEmEdicao?.pagamentos && (pedidoEmEdicao.pagamentos?.length || 0) > 1) {
      const linhasMapeadas: LinhaPagamentoPDV[] = pedidoEmEdicao.pagamentos.map((p: any, idx: number) => ({
        id: `linha_${p.id || idx}_${Date.now()}`,
        forma_pagamento_id: p.forma_pagamento_id,
        forma_tipo: (p.forma_pagamento?.tipo || 'dinheiro') as TipoPagamento,
        forma_nome: p.forma_pagamento?.nome || 'Forma de Pagamento',
        valor: Number(p.valor || 0),
        valor_entregue: null,
        parcelas: p.parcelas || 1
      }));
      setLinhasPagamento(linhasMapeadas);
      setFormaPagamentoEscolhida(pedidoEmEdicao.pagamentos[0]?.forma_pagamento || fpPadrao);
    } else {
      const fpInicial = (pedidoEmEdicao?.pagamentos && pedidoEmEdicao.pagamentos[0]?.forma_pagamento) || fpPadrao;
      setLinhasPagamento([
        {
          id: `linha_1_${Date.now()}`,
          forma_pagamento_id: fpInicial.id,
          forma_tipo: fpInicial.tipo,
          forma_nome: fpInicial.nome,
          valor: total,
          valor_entregue: null,
          parcelas: 1
        }
      ]);
      setFormaPagamentoEscolhida(fpInicial);
    }

    setModalFechamento(true);
  };

  const handleAplicarCupom = async () => {
    if (!loja?.id || !codigoCupomInput.trim()) return;
    setValidandoCupom(true);
    setMensagemCupom(null);
    try {
      const res = await CupomService.validarCupomCatalogo(loja.id, codigoCupomInput, subtotal);
      if (res.valido && res.cupom) {
        setCupomAplicado(res.cupom);
        const descCupom = res.freteGratis ? Number(taxaEntrega || 0) : res.descontoCalculado;
        setValorDescontoCupom(descCupom);
        setMensagemCupom({
          tipo: 'sucesso',
          texto: res.freteGratis
            ? 'Cupom de Frete Grátis aplicado com sucesso!'
            : `Cupom ${res.cupom.codigo} aplicado: -${formatarMoeda(descCupom)}`
        });

        const novoTotal = Math.max(0, total - descCupom);
        setLinhasPagamento(prev => {
          if (prev.length <= 1) {
            return prev.map(l => ({
              ...l,
              valor: novoTotal,
              valor_entregue: l.forma_tipo === 'dinheiro' ? novoTotal : l.valor_entregue
            }));
          }
          return prev;
        });
      } else {
        setCupomAplicado(null);
        setValorDescontoCupom(0);
        setMensagemCupom({
          tipo: 'erro',
          texto: res.mensagem || 'Cupom inválido ou não encontrado.'
        });
      }
    } catch (err) {
      setMensagemCupom({ tipo: 'erro', texto: 'Erro ao validar cupom.' });
    } finally {
      setValidandoCupom(false);
    }
  };

  const handleRemoverCupom = () => {
    setCupomAplicado(null);
    setValorDescontoCupom(0);
    setCodigoCupomInput('');
    setMensagemCupom(null);

    setLinhasPagamento(prev => {
      if (prev.length <= 1) {
        return prev.map(l => ({
          ...l,
          valor: total,
          valor_entregue: l.forma_tipo === 'dinheiro' ? total : l.valor_entregue
        }));
      }
      return prev;
    });
  };

  const adicionarProdutoPorCodigo = (rawBarcode: string) => {
    const barcode = rawBarcode.trim();
    if (!barcode) return;

    let produtoEncontrado: Produto | null = null;
    let variacaoEncontrada: VariacaoProduto | null = null;

    for (const p of produtos) {
      if (p.codigo_barras === barcode || p.codigo_interno === barcode) {
        produtoEncontrado = p;
        break;
      }
      if (p.variacoes) {
        const v = p.variacoes.find(varItem => varItem.codigo_barras === barcode || varItem.sku === barcode);
        if (v) {
          produtoEncontrado = p;
          variacaoEncontrada = v;
          break;
        }
      }
    }

    if (produtoEncontrado) {
      if (isEdicaoTravada) {
        mostrarAviso('Alteração de itens bloqueada para pedidos que já foram pagos ou estão em trânsito/concluídos.');
        setBuscaCodigoBarras('');
        return;
      }
      if (produtoEncontrado.tem_variacoes && !variacaoEncontrada) {
        setProdutoModalVariacao(produtoEncontrado);
      } else {
        adicionarItem(produtoEncontrado, variacaoEncontrada);
      }
      setBuscaCodigoBarras('');
      audioService.playBeep();
    } else {
      mostrarAviso(`Produto com código ${barcode} não foi encontrado.`);
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buscaCodigoBarras.trim()) return;
    adicionarProdutoPorCodigo(buscaCodigoBarras);
  };

  const handleSalvarPedidoPendente = async () => {
    if (!loja?.id) {
      mostrarErro('Erro: Estabelecimento não selecionado. Por favor, recarregue a página.');
      return;
    }
    if ((itens?.length || 0) === 0) {
      mostrarAviso('O carrinho está vazio. Adicione produtos antes de salvar o pedido.');
      return;
    }
    if (pedidoEmEdicao?.status === 'cancelado') {
      mostrarAviso('Este pedido foi cancelado e não permite modificações.', 'Ação Bloqueada');
      return;
    }
    if (!pedidoEntrega) {
      mostrarAviso(
        'Por favor, selecione a Forma de Entrega (Retirada ou Entrega) antes de salvar o pedido.',
        'Forma de Entrega Obrigatória'
      );
      return;
    }

    try {
      setSalvandoPendente(true);

      let vendedorId: string = usuario?.id || '';
      if (!vendedorId) {
        const { data: u } = await supabase
          .from('usuarios_loja')
          .select('id')
          .eq('loja_id', loja.id)
          .limit(1);

        if (u && (u?.length || 0) > 0) {
          vendedorId = u[0].id;
        } else {
          vendedorId = loja.id;
        }
      }

      const dataIso = obterDataOperacaoISO();

      let vendedorIdSanitizado: string | null = SyncService.isUuidValido(vendedorId) ? vendedorId : null;
      if (vendedorIdSanitizado) {
        const { data: usuarioExiste } = await supabase
          .from('usuarios_loja')
          .select('id')
          .eq('id', vendedorIdSanitizado)
          .limit(1);

        if (!usuarioExiste || (usuarioExiste?.length || 0) === 0) {
          vendedorIdSanitizado = null;
        }
      }

      const clienteIdSanitizado = clienteSelecionado && SyncService.isUuidValido(clienteSelecionado.id) ? clienteSelecionado.id : null;

      // Regra Rígida: salvar sem quitação deve manter status = 'pendente' e status_pagamento = 'aguardando_pagamento'
      const statusFinal: StatusPedido = 'pendente';
      const obsLimpa = extrairObservacaoLimpa(pedidoEmEdicao?.observacoes);

      let metaExistente: Record<string, any> = {};
      if (pedidoEmEdicao?.metadados) {
        try {
          metaExistente = typeof pedidoEmEdicao.metadados === 'string'
            ? JSON.parse(pedidoEmEdicao.metadados)
            : { ...pedidoEmEdicao.metadados };
        } catch (e) {}
      }

      const historicoExistente = Array.isArray(metaExistente.historico_edicoes)
        ? metaExistente.historico_edicoes
        : [];

      const novaEntradaHistorico = pedidoEmEdicao ? {
        data: dataIso,
        usuario_id: usuario?.id || null,
        usuario_nome: usuario?.nome_completo || 'Operador',
        acao: 'Edição de itens/valores no PDV'
      } : null;

      const historicoStatusExistente = Array.isArray(metaExistente.historico_status)
        ? metaExistente.historico_status
        : [];

      const novoItemStatus = {
        data: dataIso,
        tipo: 'status',
        status: statusFinal,
        usuario: usuario?.nome_completo || 'Operador',
        detalhes: pedidoEmEdicao ? 'Edição de pedido pendente no PDV' : 'Pedido pendente criado no PDV'
      };

      const novosMetadados: Record<string, any> = {
        ...metaExistente,
        historico_status: [...historicoStatusExistente, novoItemStatus],
        ...(pedidoEmEdicao ? {
          ultimo_editor: {
            usuario_id: usuario?.id || null,
            usuario_nome: usuario?.nome_completo || 'Operador',
            data: dataIso
          },
          historico_edicoes: novaEntradaHistorico ? [...historicoExistente, novaEntradaHistorico] : historicoExistente
        } : {}),
        ...(tipoDesconto === 'percentual' && descontoPercentual > 0 ? { desconto_percentual: descontoPercentual } : {})
      };
      if (tipoDesconto !== 'percentual') {
        delete novosMetadados.desconto_percentual;
      }

      const vendedorIdFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.vendedor_id ?? null)
        : vendedorIdSanitizado;

      const origemFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.origem || 'pdv_desktop')
        : 'pdv_desktop';

      const dataVendaFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.data_venda || dataIso)
        : dataIso;

      const enderecoEntregaFinal = (() => {
        if (pedidoEntrega?.tipo_atendimento === 'retirada') return null;
        if (pedidoEntrega?.destino_logradouro) {
          const comp = pedidoEntrega.destino_complemento ? ` - ${pedidoEntrega.destino_complemento}` : '';
          const cep = pedidoEntrega.destino_cep ? ` (CEP: ${pedidoEntrega.destino_cep})` : '';
          return `${pedidoEntrega.destino_logradouro}, ${pedidoEntrega.destino_numero || 'S/N'}${comp}, ${pedidoEntrega.destino_bairro}, ${pedidoEntrega.destino_cidade}-${pedidoEntrega.destino_uf}${cep}`;
        }
        if (taxaEntrega > 0 && clienteSelecionado?.endereco_principal) {
          return clienteSelecionado.endereco_principal;
        }
        return null;
      })();

      const dadosBasePedido = {
        loja_id: loja.id,
        vendedor_id: vendedorIdFinal,
        cliente_id: clienteIdSanitizado,
        origem: origemFinal as any,
        tabela_preco_aplicada: tabelaPrecoCalculada,
        status: statusFinal as any,
        status_pagamento: 'aguardando_pagamento' as const,
        subtotal,
        subtotal_produtos: subtotal,
        valor_desconto: desconto,
        desconto_percentual: tipoDesconto === 'percentual' ? descontoPercentual : 0,
        atualizado_por: usuario?.id || null,
        forma_entrega_id: (pedidoEntrega?.forma_entrega_id && SyncService.isUuidValido(pedidoEntrega.forma_entrega_id)) ? pedidoEntrega.forma_entrega_id : null,
        codigo_rastreio: pedidoEntrega?.codigo_rastreio || null,
        link_rastreio: pedidoEntrega?.link_rastreio || null,
        entregador_nome: pedidoEntrega?.entregador_nome || null,
        valor_frete: taxaEntrega,
        endereco_entrega: enderecoEntregaFinal,
        valor_total: total,
        valor_pago: 0,
        saldo_devedor: total,
        observacoes: obsLimpa || null,
        metadados: {
          transportadora_nome: pedidoEntrega?.transportadora_nome || null,
          provedor_frete: pedidoEntrega?.provedor || null,
          servico_frete_codigo: pedidoEntrega?.servico_codigo || null,
          tipo_atendimento: pedidoEntrega?.tipo_atendimento || (taxaEntrega > 0 ? 'entrega' : 'retirada')
        },
        data_venda: dataVendaFinal
      };

      const itensFormatados = itens.map(item => {
        const tipoUnidade = String(item.produto?.tipo_unidade || item.produto?.unidade_medida || 'un').toLowerCase();
        const ehKg = tipoUnidade === 'kg';
        return {
          loja_id: loja.id,
          produto_id: item.produto.id,
          variacao_id: (item.variacao_id && SyncService.isUuidValido(item.variacao_id))
            ? item.variacao_id
            : (item.variacao?.id && SyncService.isUuidValido(item.variacao.id))
              ? item.variacao.id
              : null,
          tabela_preco_utilizada: item.tabelaPrecoUtilizada,
          nome_produto: item.produto.nome,
          rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
          preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
          preco_venda_unitario: item.precoUnitario,
          quantidade: item.quantidade,
          quantidade_solicitada: item.quantidade,
          unidade_medida: ehKg ? 'KG' : (item.produto?.unidade_medida ? item.produto.unidade_medida.toUpperCase() : 'UN'),
          tipo_unidade: tipoUnidade,
          peso_solicitado_kg: ehKg ? item.quantidade : null,
          subtotal: item.subtotal,
          observacoes: item.observacoes || null
        };
      });

      let pedidoIdFinal = '';

      if (navigator.onLine) {
        if (pedidoEmEdicao?.id) {
          pedidoIdFinal = pedidoEmEdicao.id;
          // Atualiza pedido pendente existente
          const { error: erroUpdate } = await supabase
            .from('pedidos')
            .update({
              ...dadosBasePedido,
              atualizado_em: dataIso
            })
            .eq('id', pedidoEmEdicao.id);

          if (erroUpdate) throw erroUpdate;

          // Deleta itens antigos e insere os novos
          await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoEmEdicao.id);
          const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoEmEdicao.id }));
          const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
          if (erroItens) throw erroItens;
        } else {
          // Insere novo pedido pendente
          const { data: pedidoCriado, error: erroPedido } = await supabase
            .from('pedidos')
            .insert([dadosBasePedido])
            .select()
            .single();

          if (erroPedido || !pedidoCriado) throw erroPedido;
          pedidoIdFinal = pedidoCriado.id;

          const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoCriado.id }));
          const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
          if (erroItens) throw erroItens;
        }

        // Salvar isolamento relacional da entrega em pedido_entregas
        if (pedidoIdFinal) {
          try {
            const entregaPayload = pedidoEntrega ? {
              ...pedidoEntrega,
              pedido_id: pedidoIdFinal,
              valor_frete: taxaEntrega
            } : {
              pedido_id: pedidoIdFinal,
              tipo_atendimento: (taxaEntrega > 0 ? 'entrega' : 'retirada') as any,
              valor_frete: taxaEntrega,
              provedor: (taxaEntrega > 0 ? 'frete_proprio' : 'retirada_loja') as any,
              transportadora_nome: taxaEntrega > 0 ? 'Entrega Padrão' : 'Retirada na Loja',
              status_envio: 'pendente'
            };
            await ShippingOrchestrator.salvarPedidoEntrega(pedidoIdFinal, entregaPayload);
          } catch (eEntrega) {
            console.warn('Aviso ao salvar pedido_entregas:', eEntrega);
          }
        }

        // Registrar auditoria relacional na tabela historico_pedidos
        if (pedidoIdFinal) {
          try {
            await supabase.from('historico_pedidos').insert([{
              loja_id: loja.id,
              pedido_id: pedidoIdFinal,
              usuario_id: usuario?.id || null,
              tipo_evento: pedidoEmEdicao ? 'pedido_editado' : 'criacao',
              status_novo: statusFinal,
              descricao: pedidoEmEdicao ? 'Edição de itens/valores no PDV' : 'Pedido pendente criado no PDV',
              criado_em: dataIso
            }]);
          } catch (eH) {
            console.warn('Aviso ao registrar historico_pedidos:', eH);
          }
        }
      }

      audioService.playBeep();
      const eraEdicao = !!pedidoEmEdicao;
      resetarSnapshotPedido();
      snapshotInicialRef.current = null;
      setTemAlteracoesNaoSalvas(false);

      const aoConfirmarSucesso = () => {
        limparCarrinho();
        if (eraEdicao) {
          navigate('/orders');
        } else {
          setSubTelaMobile('vender');
          navigate('/pos');
        }
      };

      mostrarSucesso('Pedido salvo com sucesso', 'Sucesso!', aoConfirmarSucesso);
    } catch (err: any) {
      console.error('Erro ao salvar pedido:', err);
      mostrarErro(`Erro ao salvar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSalvandoPendente(false);
    }
  };

  const handleSalvarComFormaPagamento = async () => {
    if (!loja?.id) {
      mostrarErro('Estabelecimento não selecionado. Por favor, recarregue a página.');
      return;
    }
    if ((itens?.length || 0) === 0) {
      mostrarAviso('O carrinho está vazio. Adicione produtos antes de salvar.');
      return;
    }
    if (pedidoEmEdicao?.status === 'cancelado') {
      mostrarAviso('Este pedido foi cancelado e não permite modificações.', 'Ação Bloqueada');
      return;
    }

    let pedidoCriadoId: string | null = null;

    try {
      setSalvandoPendente(true);
      const dataIso = obterDataOperacaoISO();
      let vendedorIdSanitizado: string | null = usuario?.id && SyncService.isUuidValido(usuario.id) ? usuario.id : null;
      const clienteIdSanitizado = clienteSelecionado && SyncService.isUuidValido(clienteSelecionado.id) ? clienteSelecionado.id : null;

      const obsFinal = extrairObservacaoLimpa(pedidoEmEdicao?.observacoes);

      const metaExistente = (pedidoEmEdicao?.metadados && typeof pedidoEmEdicao.metadados === 'object')
        ? { ...pedidoEmEdicao.metadados }
        : {};

      if (tipoDesconto === 'percentual' && descontoPercentual > 0) {
        metaExistente.desconto_percentual = descontoPercentual;
      } else {
        delete metaExistente.desconto_percentual;
      }

      const linhasParaSalvar = (linhasPagamento && (linhasPagamento?.length || 0) > 0) ? linhasPagamento : [
        {
          id: 'linha_default',
          forma_pagamento_id: formaPagamentoEscolhida?.id || FORMAS_PADRAO[0].id,
          forma_tipo: formaPagamentoEscolhida?.tipo || 'dinheiro',
          forma_nome: formaPagamentoEscolhida?.nome || 'Dinheiro',
          valor: total,
          valor_entregue: null,
          parcelas: parcelasCartao || 1
        }
      ];

      metaExistente.pagamentos_previstos = linhasParaSalvar.map(l => ({
        forma_pagamento_id: l.forma_pagamento_id,
        forma_tipo: l.forma_tipo,
        forma_nome: l.forma_nome,
        valor: l.valor,
        valor_entregue: l.valor_entregue || null,
        parcelas: l.parcelas || 1
      }));

      const historicoExistente = Array.isArray(metaExistente.historico_edicoes)
        ? metaExistente.historico_edicoes
        : [];

      if (pedidoEmEdicao) {
        metaExistente.ultimo_editor = {
          usuario_id: usuario?.id || null,
          usuario_nome: usuario?.nome_completo || 'Operador',
          data: dataIso
        };
        metaExistente.historico_edicoes = [
          ...historicoExistente,
          {
            data: dataIso,
            usuario_id: usuario?.id || null,
            usuario_nome: usuario?.nome_completo || 'Operador',
            acao: 'Venda vinculada a pagamentos no PDV'
          }
        ];
      }

      const statusFinal: StatusPedido = (pedidoEmEdicao?.status === 'concluido' || pedidoEmEdicao?.status === 'cancelado')
        ? pedidoEmEdicao.status
        : 'pendente';

      const historicoStatusExistente = Array.isArray(metaExistente.historico_status)
        ? metaExistente.historico_status
        : [];

      metaExistente.historico_status = [
        ...historicoStatusExistente,
        {
          data: dataIso,
          tipo: 'status',
          status: statusFinal,
          usuario: usuario?.nome_completo || 'Operador',
          detalhes: pedidoEmEdicao ? 'Venda atualizada com pagamentos no PDV' : 'Pedido pendente criado com formas de pagamento vinculadas'
        }
      ];

      const vendedorIdFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.vendedor_id ?? null)
        : vendedorIdSanitizado;

      const origemFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.origem || 'pdv_desktop')
        : 'pdv_desktop';

      const dataVendaFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.data_venda || dataIso)
        : dataIso;

      const dadosBasePedido = {
        loja_id: loja.id,
        vendedor_id: vendedorIdFinal,
        cliente_id: clienteIdSanitizado,
        origem: origemFinal as any,
        tabela_preco_aplicada: tabelaPrecoCalculada,
        status: statusFinal as any,
        status_pagamento: 'aguardando_pagamento' as const,
        subtotal,
        desconto_percentual: tipoDesconto === 'percentual' ? descontoPercentual : 0,
        valor_desconto: desconto,
        valor_frete: taxaEntrega,
        forma_entrega_id: pedidoEntrega?.forma_entrega_id && SyncService.isUuidValido(pedidoEntrega.forma_entrega_id) ? pedidoEntrega.forma_entrega_id : null,
        codigo_rastreio: pedidoEntrega?.codigo_rastreio || null,
        link_rastreio: pedidoEntrega?.link_rastreio || null,
        entregador_nome: pedidoEntrega?.entregador_nome || null,
        pin_entrega: pedidoEntrega?.pin_entrega || null,
        nome_app: pedidoEntrega?.nome_app || null,
        servico_correios: pedidoEntrega?.servico_correios || null,
        nome_transportadora: pedidoEntrega?.nome_transportadora || pedidoEntrega?.transportadora_nome || null,
        tipo_operacao: pedidoEntrega?.tipo_operacao || null,
        valor_total: total,
        valor_pago: 0,
        saldo_devedor: total,
        fiado_quitado: false,
        atualizado_por: usuario?.id || null,
        observacoes: obsFinal || null,
        metadados: {
          transportadora_nome: pedidoEntrega?.transportadora_nome || null,
          provedor_frete: pedidoEntrega?.provedor || null,
          servico_frete_codigo: pedidoEntrega?.servico_codigo || null,
          tipo_atendimento: pedidoEntrega?.tipo_atendimento || (taxaEntrega > 0 ? 'entrega' : 'retirada')
        },
        data_venda: dataVendaFinal
      };

      const itensFormatados = itens.map(item => {
        const tipoUnidade = String(item.produto?.tipo_unidade || item.produto?.unidade_medida || 'un').toLowerCase();
        const ehKg = tipoUnidade === 'kg';
        return {
          loja_id: loja.id,
          produto_id: item.produto.id,
          variacao_id: (item.variacao_id && SyncService.isUuidValido(item.variacao_id))
            ? item.variacao_id
            : (item.variacao?.id && SyncService.isUuidValido(item.variacao.id))
              ? item.variacao.id
              : null,
          tabela_preco_utilizada: item.tabelaPrecoUtilizada,
          nome_produto: item.produto.nome,
          rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
          preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
          preco_venda_unitario: item.precoUnitario,
          quantidade: item.quantidade,
          quantidade_solicitada: item.quantidade,
          unidade_medida: ehKg ? 'KG' : (item.produto?.unidade_medida ? item.produto.unidade_medida.toUpperCase() : 'UN'),
          tipo_unidade: tipoUnidade,
          peso_solicitado_kg: ehKg ? item.quantidade : null,
          subtotal: item.subtotal,
          observacoes: item.observacoes || null
        };
      });

      // 1. Pré-resolução estrita e atômica dos pagamentos antes de criar ou alterar pedidos
      const pagamentosResolvidos = (linhasParaSalvar?.length || 0) > 0
        ? await Promise.all(linhasParaSalvar.map(async (l) => {
            const fpRealId = await SyncService.resolverFormaPagamentoId(loja.id, l.forma_pagamento_id, l.forma_tipo);
            return {
              loja_id: loja.id,
              forma_pagamento_id: fpRealId,
              valor: Number(l.valor),
              parcelas: l.parcelas || 1,
              valor_taxa: 0,
              valor_liquido: Number(l.valor),
              data_pagamento: dataIso,
              eh_pagamento_fiado: l.forma_tipo === 'fiado',
              eh_pagamento_caderneta: l.forma_tipo === 'caderneta'
            };
          }))
        : [];

      let pedidoIdFinal = '';

      if (pedidoEmEdicao?.id) {
        pedidoIdFinal = pedidoEmEdicao.id;
        const { error: erroUpdate } = await supabase
          .from('pedidos')
          .update({
            ...dadosBasePedido,
            atualizado_em: dataIso
          })
          .eq('id', pedidoEmEdicao.id);

        if (erroUpdate) throw erroUpdate;

        await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoEmEdicao.id);
        const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoEmEdicao.id }));
        const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
        if (erroItens) throw erroItens;
      } else {
        const { data: pedidoCriado, error: erroPedido } = await supabase
          .from('pedidos')
          .insert([dadosBasePedido])
          .select()
          .single();

        if (erroPedido || !pedidoCriado) throw erroPedido;
        pedidoIdFinal = pedidoCriado.id;
        pedidoCriadoId = pedidoCriado.id;

        const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoCriado.id }));
        const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
        if (erroItens) throw erroItens;
      }

      // Inserir registro de auditoria na tabela relacional historico_pedidos
      try {
        await supabase.from('historico_pedidos').insert({
          loja_id: loja.id,
          pedido_id: pedidoIdFinal,
          usuario_id: usuario?.id || null,
          tipo_evento: pedidoEmEdicao ? 'edicao_pdv' : 'criacao',
          status_anterior: pedidoEmEdicao?.status || null,
          status_novo: statusFinal,
          descricao: pedidoEmEdicao ? 'Venda vinculada a pagamentos no PDV' : 'Pedido pendente criado com formas de pagamento vinculadas'
        });
      } catch (errAudit) {
        console.warn('Falha não-bloqueante ao registrar historico_pedidos:', errAudit);
      }

      // Registra pagamentos previstos na tabela pagamentos_pedido
      if (pedidoIdFinal && pagamentosResolvidos.length > 0) {
        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedidoIdFinal);
        const pagamentosComPedido = pagamentosResolvidos.map(p => ({ ...p, pedido_id: pedidoIdFinal }));
        const { error: erroPag } = await supabase.from('pagamentos_pedido').insert(pagamentosComPedido);
        if (erroPag) throw erroPag;

        // Registra também na tabela relacional pedidos_pagamentos_previstos
        try {
          await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedidoIdFinal);
          const previstosParaDb = linhasParaSalvar.map(l => ({
            loja_id: loja.id,
            pedido_id: pedidoIdFinal,
            forma_pagamento_id: l.forma_pagamento_id && SyncService.isUuidValido(l.forma_pagamento_id) ? l.forma_pagamento_id : null,
            forma_tipo: l.forma_tipo,
            forma_nome: l.forma_nome,
            valor: Number(l.valor),
            valor_entregue: l.valor_entregue ? Number(l.valor_entregue) : null,
            parcelas: l.parcelas || 1
          }));
          await supabase.from('pedidos_pagamentos_previstos').insert(previstosParaDb);
        } catch (errPrev) {
          console.warn('Falha não-bloqueante ao registrar pedidos_pagamentos_previstos:', errPrev);
        }
      }

      audioService.playBeep();
      setModalFechamento(false);
      const eraEdicao = !!pedidoEmEdicao;
      resetarSnapshotPedido();
      snapshotInicialRef.current = null;
      setTemAlteracoesNaoSalvas(false);

      const aoConfirmarSucesso = () => {
        limparCarrinho();
        if (eraEdicao) {
          navigate('/orders');
        } else {
          setSubTelaMobile('vender');
          navigate('/pos');
        }
      };

      mostrarSucesso('Pedido salvo com sucesso', 'Sucesso!', aoConfirmarSucesso);
    } catch (err: any) {
      console.error('Erro ao salvar pedido com forma de pagamento:', err);
      // Rollback compensatório para impedir pedidos órfãos sem itens ou pagamentos
      if (pedidoCriadoId) {
        try {
          await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoCriadoId);
          await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedidoCriadoId);
          await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedidoCriadoId);
          await supabase.from('pedidos').delete().eq('id', pedidoCriadoId);
        } catch (rollbackErr) {
          console.warn('Erro no rollback compensatório de pedido órfão:', rollbackErr);
        }
      }
      mostrarErro(`Erro ao salvar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSalvandoPendente(false);
    }
  };

  const handleFinalizarVenda = async () => {
    if (!loja?.id) {
      mostrarErro('Erro: Estabelecimento não selecionado. Por favor, recarregue a página.');
      return;
    }
    if ((itens?.length || 0) === 0) {
      mostrarAviso('O carrinho está vazio. Adicione produtos antes de fechar a venda.');
      return;
    }
    if (pedidoEmEdicao?.status === 'cancelado') {
      mostrarAviso('Este pedido foi cancelado e não permite modificações.', 'Ação Bloqueada');
      return;
    }

    if (linhasPagamento && linhasPagamento.length > 0 && linhasPagamento.some(l => Number(l.valor) <= 0)) {
      mostrarAviso('Existem formas de pagamento com valor zerado ou inválido. Remova-as ou informe um valor maior que zero.');
      return;
    }

    const totalEfetivo = valorDescontoCupom > 0 ? Math.max(0, total - valorDescontoCupom) : total;

    const linhasAtivas = (linhasPagamento?.length || 0) > 0 ? linhasPagamento.filter(l => Number(l.valor) > 0) : [
      {
        id: `linha_1_${Date.now()}`,
        forma_pagamento_id: formaPagamentoEscolhida?.id || FORMAS_PADRAO[0].id,
        forma_tipo: formaPagamentoEscolhida?.tipo || 'dinheiro',
        forma_nome: formaPagamentoEscolhida?.nome || 'Dinheiro',
        valor: totalEfetivo,
        parcelas: 1
      }
    ];

    if (linhasAtivas.length === 0) {
      mostrarAviso('Informe ao menos uma forma de pagamento com valor válido.');
      return;
    }

    const somaLinhas = linhasAtivas.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
    if (Math.abs(somaLinhas - totalEfetivo) > 0.05) {
      mostrarAviso(`A soma dos pagamentos (R$ ${somaLinhas.toFixed(2)}) difere do total da venda (R$ ${totalEfetivo.toFixed(2)}). Ajuste os valores antes de continuar.`);
      return;
    }

    const valorFiadoTotal = linhasAtivas
      .filter(l => l.forma_tipo === 'fiado')
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    const valorCadernetaTotal = linhasAtivas
      .filter(l => l.forma_tipo === 'caderneta' || l.forma_nome?.toLowerCase().includes('caderneta'))
      .reduce((acc, l) => acc + (Number(l.valor) || 0), 0);

    if (valorFiadoTotal > 0) {
      if (!clienteSelecionado) {
        mostrarAviso('Para pagamentos com Fiado / A Prazo, é obrigatório selecionar um cliente cadastrado.', 'Cliente Obrigatório');
        return;
      }
      if (!clienteSelecionado.permite_fiado) {
        mostrarAviso(`O cliente ${clienteSelecionado.nome} não possui permissão para compras no fiado.`, 'Fiado Não Permitido');
        return;
      }
      const limiteDisponivel = Number(clienteSelecionado.limite_credito || 0);
      if (valorFiadoTotal > limiteDisponivel + 0.01) {
        mostrarAviso(`O valor no fiado (R$ ${valorFiadoTotal.toFixed(2)}) excede o limite de crédito disponível do cliente (R$ ${limiteDisponivel.toFixed(2)}).`, 'Limite Insuficiente');
        return;
      }
    }

    if (valorCadernetaTotal > 0) {
      if (!clienteSelecionado) {
        mostrarAviso('Para lançamentos na Caderneta de Mercadinho, selecione um cliente cadastrado.', 'Cliente Obrigatório');
        return;
      }
      if (!clienteSelecionado.permite_caderneta) {
        mostrarAviso(`O cliente ${clienteSelecionado.nome} não possui Caderneta de Mercadinho habilitada.`, 'Caderneta Não Habilitada');
        return;
      }
      const limiteDisponivelCad = Math.max(0, Number(clienteSelecionado.limite_caderneta || 0) - Number(clienteSelecionado.saldo_devedor_caderneta || 0));
      if (valorCadernetaTotal > limiteDisponivelCad + 0.01) {
        mostrarAviso(`O valor na Caderneta (R$ ${valorCadernetaTotal.toFixed(2)}) excede o limite disponível do cliente (R$ ${limiteDisponivelCad.toFixed(2)}).`, 'Limite da Caderneta Insuficiente');
        return;
      }
    }

    try {
      setFinalizandoVenda(true);
      setEhVendaOfflineSalva(false);

      // Obter ou resolver ID de operador/vendedor
      let vendedorId: string = usuario?.id || '';
      if (!vendedorId) {
        const { data: u } = await supabase
          .from('usuarios_loja')
          .select('id')
          .eq('loja_id', loja.id)
          .limit(1);

        if (u && (u?.length || 0) > 0) {
          vendedorId = u[0].id;
        } else {
          vendedorId = loja.id;
        }
      }

      const dataIso = obterDataOperacaoISO();

      // Calcular prazo e data de vencimento do fiado caso utilizado
      let dataVencimentoFiado: string | null = null;
      if (valorFiadoTotal > 0) {
        const formaFiado = ((formasPagamento && (formasPagamento?.length || 0) > 0 ? formasPagamento : FORMAS_PADRAO)).find(f => f.tipo === 'fiado');
        const prazoDias = (formaFiado && formaFiado.prazo_dias != null && formaFiado.prazo_dias > 0)
          ? formaFiado.prazo_dias
          : 30;
        const dataBase = pedidoEmEdicao?.data_venda
          ? new Date(pedidoEmEdicao.data_venda)
          : new Date();
        const dataVenc = new Date(dataBase);
        dataVenc.setDate(dataVenc.getDate() + prazoDias);
        const ano = dataVenc.getFullYear();
        const mes = String(dataVenc.getMonth() + 1).padStart(2, '0');
        const dia = String(dataVenc.getDate()).padStart(2, '0');
        dataVencimentoFiado = `${ano}-${mes}-${dia}`;
      }

      const obsFinal = extrairObservacaoLimpa(pedidoEmEdicao?.observacoes);

      const metaExistente = (pedidoEmEdicao?.metadados && typeof pedidoEmEdicao.metadados === 'object')
        ? { ...pedidoEmEdicao.metadados }
        : {};

      if (tipoDesconto === 'percentual' && descontoPercentual > 0) {
        metaExistente.desconto_percentual = descontoPercentual;
      } else {
        delete metaExistente.desconto_percentual;
      }
      delete metaExistente.pagamento_previsto;

      const ehEntrega = pedidoEntrega?.tipo_atendimento === 'entrega' || taxaEntrega > 0;
      const estaTotalmentePago = valorFiadoTotal === 0;
      let statusFinal: StatusPedido = 'concluido';

      if (pedidoEmEdicao?.status && pedidoEmEdicao.status !== 'pendente') {
        statusFinal = pedidoEmEdicao.status;
      } else {
        // Regra Rígida: aguardando_envio só é permitido se estiver cumulativamente PAGO e com frete formalizado
        statusFinal = ehEntrega
          ? (estaTotalmentePago ? 'aguardando_envio' : 'pendente')
          : (estaTotalmentePago ? 'concluido' : 'pendente');
      }

      const historicoExistente = Array.isArray(metaExistente.historico_edicoes)
        ? metaExistente.historico_edicoes
        : [];

      if (pedidoEmEdicao) {
        metaExistente.ultimo_editor = {
          usuario_id: usuario?.id || null,
          usuario_nome: usuario?.nome_completo || 'Operador',
          data: dataIso
        };
        metaExistente.historico_edicoes = [
          ...historicoExistente,
          {
            data: dataIso,
            usuario_id: usuario?.id || null,
            usuario_nome: usuario?.nome_completo || 'Operador',
            acao: valorFiadoTotal > 0 ? 'Venda com parcela Fiado no PDV' : 'Conclusão de pagamento no PDV'
          }
        ];
      }

      const vendedorIdFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.vendedor_id ?? null)
        : vendedorId;

      const origemFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.origem || 'pdv_desktop')
        : 'pdv_desktop';

      const dataVendaFinal = pedidoEmEdicao
        ? (pedidoEmEdicao.data_venda || dataIso)
        : dataIso;

      const valorPago = Number((total - valorFiadoTotal).toFixed(2));
      const saldoDevedor = Number(valorFiadoTotal.toFixed(2));
      const fiadoQuitado = valorFiadoTotal <= 0;
      const statusPagamento: StatusPagamento = valorFiadoTotal === 0
        ? 'pago'
        : (valorPago > 0 ? 'parcialmente_pago' : 'aguardando_pagamento');

      const vendedorIdSanitizado: string | null = SyncService.isUuidValido(vendedorIdFinal) ? vendedorIdFinal : null;

      const clienteIdSanitizado = clienteSelecionado && SyncService.isUuidValido(clienteSelecionado.id) ? clienteSelecionado.id : null;

      const enderecoEntregaFinal = (() => {
        if (pedidoEntrega?.tipo_atendimento === 'retirada') return null;
        if (pedidoEntrega?.destino_logradouro) {
          const comp = pedidoEntrega.destino_complemento ? ` - ${pedidoEntrega.destino_complemento}` : '';
          const cep = pedidoEntrega.destino_cep ? ` (CEP: ${pedidoEntrega.destino_cep})` : '';
          return `${pedidoEntrega.destino_logradouro}, ${pedidoEntrega.destino_numero || 'S/N'}${comp}, ${pedidoEntrega.destino_bairro}, ${pedidoEntrega.destino_cidade}-${pedidoEntrega.destino_uf}${cep}`;
        }
        if (taxaEntrega > 0 && clienteSelecionado?.endereco_principal) {
          return clienteSelecionado.endereco_principal;
        }
        return null;
      })();

      const dadosBasePedido = {
        loja_id: loja.id,
        vendedor_id: vendedorIdSanitizado,
        cliente_id: clienteIdSanitizado,
        origem: origemFinal as any,
        tabela_preco_aplicada: tabelaPrecoCalculada,
        status: statusFinal as any,
        status_pagamento: statusPagamento,
        subtotal,
        subtotal_produtos: subtotal,
        desconto_percentual: tipoDesconto === 'percentual' ? descontoPercentual : 0,
        valor_desconto: desconto,
        forma_entrega_id: (pedidoEntrega?.forma_entrega_id && SyncService.isUuidValido(pedidoEntrega.forma_entrega_id)) ? pedidoEntrega.forma_entrega_id : null,
        codigo_rastreio: pedidoEntrega?.codigo_rastreio || null,
        link_rastreio: pedidoEntrega?.link_rastreio || null,
        entregador_nome: pedidoEntrega?.entregador_nome || null,
        pin_entrega: pedidoEntrega?.pin_entrega || null,
        nome_app: pedidoEntrega?.nome_app || null,
        servico_correios: pedidoEntrega?.servico_correios || null,
        nome_transportadora: pedidoEntrega?.nome_transportadora || pedidoEntrega?.transportadora_nome || null,
        tipo_operacao: pedidoEntrega?.tipo_operacao || null,
        valor_frete: taxaEntrega,
        endereco_entrega: enderecoEntregaFinal,
        valor_total: total,
        valor_pago: valorPago,
        saldo_devedor: saldoDevedor,
        fiado_quitado: fiadoQuitado,
        data_vencimento_fiado: dataVencimentoFiado || null,
        observacoes: obsFinal || null,
        data_venda: dataVendaFinal
      };

      const itensFormatados = itens.map(item => {
        const tipoUnidade = String(item.produto?.tipo_unidade || item.produto?.unidade_medida || 'un').toLowerCase();
        const ehKg = tipoUnidade === 'kg';
        return {
          loja_id: loja.id,
          produto_id: item.produto.id,
          variacao_id: (item.variacao_id && SyncService.isUuidValido(item.variacao_id))
            ? item.variacao_id
            : (item.variacao?.id && SyncService.isUuidValido(item.variacao.id))
              ? item.variacao.id
              : null,
          tabela_preco_utilizada: item.tabelaPrecoUtilizada,
          nome_produto: item.produto.nome,
          rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
          preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
          preco_venda_unitario: item.precoUnitario,
          quantidade: item.quantidade,
          quantidade_solicitada: item.quantidade,
          unidade_medida: ehKg ? 'KG' : (item.produto?.unidade_medida ? item.produto.unidade_medida.toUpperCase() : 'UN'),
          tipo_unidade: tipoUnidade,
          peso_solicitado_kg: ehKg ? item.quantidade : null,
          subtotal: item.subtotal,
          observacoes: item.observacoes || null
        };
      });

      // Chave de idempotência para evitar registros duplicados em caso de duplo clique ou repetições de rede
      const clientRequestId = pedidoEmEdicao?.id
        ? (pedidoEmEdicao.metadados?.client_request_id || null)
        : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

      // Se estiver online, tenta enviar direto para o Supabase
      if (navigator.onLine) {
        try {
          const taxaEntregaFinal = ehCupomFreteGratis ? 0 : taxaEntrega;
          const pedidoEntregaFinal = pedidoEntrega ? {
            ...pedidoEntrega,
            valor_frete: taxaEntregaFinal,
            is_frete_gratis: ehCupomFreteGratis || pedidoEntrega.is_frete_gratis,
            valor_original: pedidoEntrega.valor_original ?? taxaEntrega,
            valor_subsidio: ehCupomFreteGratis ? taxaEntrega : (pedidoEntrega.valor_subsidio || 0)
          } : pedidoEntrega;

          const pedidoCriado = await VendaService.gravarVendaSupabase({
            lojaId: loja.id,
            usuarioId: usuario?.id || vendedorId,
            usuario: usuario,
            clienteSelecionado: clienteSelecionado,
            pedidoEmEdicao: pedidoEmEdicao,
            pedidoEntrega: pedidoEntregaFinal,
            clientRequestId: clientRequestId,
            itens: itens,
            linhasPagamento: linhasAtivas,
            formasPagamentoDisponiveis: formasPagamento,
            taxaEntrega: taxaEntregaFinal,
            subtotal: subtotal,
            desconto: Number(((desconto || 0) + (ehCupomFreteGratis ? 0 : (valorDescontoCupom || 0))).toFixed(2)),
            descontoPercentual: descontoPercentual,
            tipoDesconto: tipoDesconto,
            total: totalEfetivo,
            cupomId: cupomAplicado?.id || null,
            cupomCodigo: cupomAplicado?.codigo || null,
            valorDescontoCupom: valorDescontoCupom || 0,
            observacoes: obsFinal,
            tabelaPrecoCalculada: tabelaPrecoCalculada,
            dataIso: dataIso,
            dataVencimentoFiado: dataVencimentoFiado
          });

          // Atualizar o Limite de Crédito e Saldo Devedor do Cliente na memória local
          if (clienteSelecionado) {
            const valorFiadoAnterior = pedidoEmEdicao
              ? (pedidoEmEdicao.pagamentos || [])
                  .filter((p: any) => (p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado') && !p.fiado_quitado)
                  .reduce((sum: number, p: any) => sum + Number(p.valor || 0), 0)
              : 0;

            const diferencaFiado = valorFiadoTotal - valorFiadoAnterior;
            const valorCadernetaTotal = linhasAtivas
              .filter(l => l.forma_tipo === 'caderneta' || l.forma_nome?.toLowerCase().includes('caderneta'))
              .reduce((sum, l) => sum + Number(l.valor || 0), 0);

            if (diferencaFiado !== 0 || valorCadernetaTotal > 0) {
              const novoLimite = Math.max(0, (clienteSelecionado.limite_credito || 0) - diferencaFiado);
              const novoSaldo = Math.max(0, (clienteSelecionado.saldo_devedor_fiado || 0) + diferencaFiado);
              const novoSaldoCaderneta = Number(((clienteSelecionado.saldo_devedor_caderneta || 0) + valorCadernetaTotal).toFixed(2));
              const clienteAtualizado: Cliente = {
                ...clienteSelecionado,
                limite_credito: novoLimite,
                saldo_devedor_fiado: novoSaldo,
                saldo_devedor_caderneta: novoSaldoCaderneta
              };
              setClienteSelecionado(clienteAtualizado);
              setClientes(prev => prev.map(c => c.id === clienteSelecionado.id ? clienteAtualizado : c));
            }
          }

          // Preservar o snapshot completo da entrega no pedido concluído antes de limpar o carrinho
          const entregaFinalSnapshot = pedidoCriado.pedido_entrega || (pedidoEntregaFinal ? {
            ...pedidoEntregaFinal,
            pedido_id: pedidoCriado.id,
            valor_frete: taxaEntregaFinal
          } as any : null);

          const pedidoCompletoFinal: Pedido = {
            ...pedidoCriado,
            pedido_entrega: entregaFinalSnapshot
          };

          resetarSnapshotPedido();
          snapshotInicialRef.current = null;
          setTemAlteracoesNaoSalvas(false);
          setEhVendaOfflineSalva(false);
          setModalFechamento(false);
          setLinhasPagamento([]);
          setPedidoConcluido(pedidoCompletoFinal);
          limparCarrinho();
          setCupomAplicado(null);
          setValorDescontoCupom(0);
          setCodigoCupomInput('');
          setMensagemCupom(null);
          try {
            localStorage.removeItem(`hubi_pos_cart_draft_${loja.id}`);
          } catch (_) {}
          setValorRecebidoDinheiro('');
          setSubTelaMobile('vender');
          return;
        } catch (nuvemErr: any) {
          console.error('[PosCheckout] Erro ao gravar venda no Supabase:', nuvemErr);
          let msgAmigavel = 'Falha ao gravar pedido no banco de dados. Verifique a conexão.';
          const rawMsg = String(nuvemErr?.message || '');
          if (rawMsg.includes('foreign key constraint') || rawMsg.includes('violates')) {
            msgAmigavel = 'Inconsistência cadastral de usuário/operador ao registrar o pedido. Verifique o operador selecionado ou reconecte sua sessão.';
          } else if (
            rawMsg.includes('Cannot coerce') ||
            rawMsg.includes('PGRST') ||
            rawMsg.includes('permission denied') ||
            rawMsg.includes('row-level security') ||
            rawMsg.includes('schema')
          ) {
            msgAmigavel = 'Sua sessão no PDV não tem permissão para gravar este pedido ou expirou. Por favor, feche e abra o PDV novamente.';
          } else if (rawMsg) {
            msgAmigavel = rawMsg;
          }
          mostrarErro(msgAmigavel, 'Erro na Gravação');
          return;
        }
      }

      // SALVAMENTO OFFLINE RESILIENTE (IndexedDB) - Apenas quando explicitamente desconectado
      const idLocal = 'offline_' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()));
      const numPedidoOffline = Math.floor(100000 + Math.random() * 900000);

      const vendaOffline: VendaOfflineFila = {
        id_local: idLocal,
        ...dadosBasePedido,
        vendedor_id: vendedorIdSanitizado || vendedorId || loja.id,
        itens: itensFormatados,
        pagamento: {
          loja_id: loja.id,
          forma_pagamento_id: linhasAtivas[0].forma_pagamento_id,
          valor: linhasAtivas[0].valor,
          parcelas: linhasAtivas[0].parcelas || 1,
          valor_taxa: 0,
          valor_liquido: linhasAtivas[0].valor,
          data_pagamento: dataIso,
          eh_pagamento_fiado: linhasAtivas[0].forma_tipo === 'fiado'
        },
        cliente_dados: clienteSelecionado,
        vendedor_dados: usuario,
        criado_em: dataIso,
        tentativas_sync: 0
      };

      await SyncService.registrarVendaOffline(vendaOffline);
      await atualizarContadorPendentes();

      // Abater estoque local em memória para resposta instantânea
      setProdutos(prev => prev.map(p => {
        const itemVendido = itens.find(it => it.produto.id === p.id);
        if (itemVendido) {
          return {
            ...p,
            quantidade_estoque: Math.max(0, (p.quantidade_estoque || 0) - itemVendido.quantidade)
          };
        }
        return p;
      }));

      const pedidoOfflineCompleto: Pedido = {
        id: idLocal,
        numero_pedido: numPedidoOffline,
        ...dadosBasePedido,
        cliente: clienteSelecionado,
        vendedor: usuario,
        itens: itensFormatados.map(it => ({
          ...it,
          id: idLocal + '_' + it.produto_id,
          tabela_preco_utilizada: it.tabela_preco_utilizada as TabelaPreco
        })) as ItemPedido[],
        pedido_entrega: pedidoEntrega ? {
          ...pedidoEntrega,
          pedido_id: idLocal,
          valor_frete: taxaEntrega
        } as any : null,
        criado_em: dataIso
      };

      resetarSnapshotPedido();
      snapshotInicialRef.current = null;
      setTemAlteracoesNaoSalvas(false);
      setEhVendaOfflineSalva(true);
      setPedidoConcluido(pedidoOfflineCompleto);
      setModalFechamento(false);
      limparCarrinho();
      setValorRecebidoDinheiro('');
      setSubTelaMobile('vender');
    } catch (err: any) {
      console.error('Erro ao finalizar venda:', err);
      mostrarErro(err.message || 'Tente novamente.', 'Erro ao processar venda');
    } finally {
      setFinalizandoVenda(false);
    }
  };

  const handleCompartilharWhatsAppPdf = async () => {
    if (!loja || !pedidoConcluido) return;

    try {
      setCompartilhandoWhatsAppPdf(true);
      await ReceiptPdfService.compartilharReciboWhatsApp(
        reciboRef.current || document.body,
        pedidoConcluido,
        loja
      );
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message.toLowerCase().includes('abort') ||
          err.message.toLowerCase().includes('cancel'))
      ) {
        return;
      }
      console.error('Erro ao compartilhar comprovante via WhatsApp:', err);
      const msg = err instanceof Error ? err.message : 'Falha ao abrir WhatsApp para envio do recibo.';
      mostrarErro(msg, 'Erro ao Compartilhar');
    } finally {
      setCompartilhandoWhatsAppPdf(false);
    }
  };

  const handleBaixarReciboPdf = async () => {
    if (!loja || !pedidoConcluido) return;
    if (!reciboRef.current) {
      mostrarAviso('Elemento visual do recibo não encontrado.');
      return;
    }

    try {
      setBaixandoPdfRecibo(true);
      await ReceiptPdfService.baixarPdfRecibo(
        reciboRef.current,
        pedidoConcluido,
        loja
      );
    } catch (err: unknown) {
      console.error('Erro ao baixar recibo em PDF:', err);
      const msg = err instanceof Error ? err.message : 'Falha ao baixar PDF do recibo.';
      mostrarErro(msg, 'Erro no Download');
    } finally {
      setBaixandoPdfRecibo(false);
    }
  };

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

  const produtosFiltrados = useMemo(() => {
    const termo = buscaProduto.toLowerCase().trim();

    const filtrados = produtos.filter(p => {
      // Filtro de categoria selecionada no dropdown
      if (categoriaSelecionada !== 'todas' && p.categoria_id !== categoriaSelecionada) {
        return false;
      }

      // Filtro de produtos em estoque
      if (apenasEmEstoque) {
        const estoqueTotal = p.tem_variacoes && p.variacoes && p.variacoes.length > 0
          ? p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0)
          : Number(p.quantidade_estoque || 0);
        if (estoqueTotal <= 0) return false;
      }

      // Filtro de busca por texto / código
      if (!termo) return true;
      return (
        p.nome.toLowerCase().includes(termo) ||
        (p.codigo_interno && p.codigo_interno.toLowerCase().includes(termo)) ||
        (p.codigo_barras && p.codigo_barras.includes(termo))
      );
    });

    // Ordenação com prioridade: 1º Cosméticos, 2º Brinquedos Eróticos, 3º Próteses, 4º Fantasias, 5º Couro/Sado
    return filtrados.sort((a, b) => {
      const pesoA = a.categoria_id ? (mapaCategorias.get(a.categoria_id)?.peso ?? 999) : 999;
      const pesoB = b.categoria_id ? (mapaCategorias.get(b.categoria_id)?.peso ?? 999) : 999;
      if (pesoA !== pesoB) return pesoA - pesoB;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [produtos, buscaProduto, categoriaSelecionada, apenasEmEstoque, mapaCategorias]);

  const trocoCalculado = Math.max(0, (Number(valorRecebidoDinheiro) || 0) - total);

  const freteGratisAtivoLoja = Boolean(configShippingLoja?.frete_gratis_ativo ?? (loja as any)?.frete_gratis_ativo);
  const freteGratisMinimoLoja = Number(configShippingLoja?.frete_gratis_valor_minimo ?? (loja as any)?.frete_gratis_valor_minimo ?? 0);
  const faltaParaFreteGratis = Math.max(0, freteGratisMinimoLoja - subtotal);
  const progressoFreteGratis = freteGratisMinimoLoja > 0 ? Math.min(100, Math.round((subtotal / freteGratisMinimoLoja) * 100)) : 100;

  return (
    <div className={`h-full w-full overflow-hidden ${isDark ? 'bg-[#0B0F17] text-white' : 'bg-slate-100 text-slate-900'}`}>
      {/* 1. VISUALIZAÇÃO MOBILE EXCLUSIVA (TELAS 001 A 008) */}
      <div className="block lg:hidden h-full overflow-hidden">
        <PosCheckoutMobile
          produtos={produtos}
          categorias={categoriasOrdenadas}
          clientes={clientes}
          formasPagamento={formasPagamento}
          pedidosConfirmadosCount={0}
          onAbrirFechamento={handleAbrirFechamento}
          onSalvarPedidoPendente={handleSalvarPedidoPendente}
          salvandoPendente={salvandoPendente}
          onAbrirNovoCliente={() => setModalNovoCliente(true)}
          onAbrirVariacoesModal={(produto) => setProdutoModalVariacao(produto)}
          onAbrirFormaEntrega={handleClicarFormaEntrega}
          isOnline={isOnline}
          pendentesCount={pendentesCount}
          subTelaControlada={subTelaMobile}
          onSubTelaChange={setSubTelaMobile}
        />
      </div>

      {/* 2. VISUALIZAÇÃO DESKTOP */}
      <div className={`hidden lg:flex h-full flex-col lg:flex-row overflow-hidden ${isDark ? 'bg-[#0B0F17]' : 'bg-slate-100'}`}>
        {/* PAINEL ESQUERDO: CATÁLOGO & BUSCA */}
        <div className={`flex-1 flex flex-col h-full overflow-hidden ${isDark ? 'border-r border-slate-800/80' : 'border-r border-slate-300'}`}>
        {/* Topo do PDV: Busca, Tabela de Preço e Status de Conexão */}
        <div className={`p-3.5 border-b space-y-3 ${isDark ? 'border-slate-800 bg-[#0B0F17]/95' : 'border-slate-300 bg-slate-100/95'} backdrop-blur`}>
          {/* Barra de Status de Conexão e Sincronização */}
          <div className={`flex items-center justify-between text-xs pb-1 border-b ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2">
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[11px] border border-emerald-500/30">
                  <Wifi className="w-3 h-3" />
                  <span>Online (Sincronizado)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold text-[11px] border border-amber-500/30">
                  <WifiOff className="w-3 h-3 text-amber-400 animate-pulse" />
                  <span>Modo Offline</span>
                </span>
              )}

              {pendentesCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30">
                  <CloudOff className="w-3 h-3" />
                  <span>{pendentesCount} venda(s) na fila</span>
                </span>
              )}

              {ultimoSyncMsg && (
                <span className="text-[11px] text-emerald-400 font-medium animate-in fade-in">
                  {ultimoSyncMsg}
                </span>
              )}
            </div>

            {isOnline && pendentesCount > 0 && (
              <button
                type="button"
                onClick={sincronizarAgora}
                disabled={sincronizando}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                title="Enviar vendas salvas offline para o Supabase agora"
              >
                <RefreshCw className={`w-3 h-3 ${sincronizando ? 'animate-spin' : ''}`} />
                <span>{sincronizando ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            {/* Seletor Dropdown de Categorias */}
            <div className="relative w-full sm:w-56 shrink-0">
              <Layers className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={categoriaSelecionada}
                onChange={(e) => setCategoriaSelecionada(e.target.value)}
                className={`w-full ${isDark ? 'bg-[#000000] border border-slate-700 text-slate-100 hover:border-slate-600' : 'bg-white border-2 border-slate-300 text-slate-900 hover:border-slate-400'} focus:border-emerald-500 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold focus:outline-none transition appearance-none cursor-pointer`}
                title="Filtrar produtos por categoria"
              >
                <option value="todas" className={isDark ? 'bg-[#000000] text-slate-200' : 'bg-white text-slate-900'}>
                  Todas as Categorias ({(produtos || []).length})
                </option>
                {categoriasOrdenadas.map((cat) => {
                  const totalCat = (produtos || []).filter(p => p.categoria_id === cat.id).length;
                  return (
                    <option key={cat.id} value={cat.id} className={isDark ? 'bg-[#000000] text-slate-200' : 'bg-white text-slate-900'}>
                      {cat.nome} ({totalCat})
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Toggle Filtro de Produtos em Estoque */}
            <button
              type="button"
              onClick={() => {
                setApenasEmEstoque(prev => {
                  const novo = !prev;
                  try { localStorage.setItem('hubi_pdv_apenas_em_estoque', String(novo)); } catch {}
                  return novo;
                });
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                apenasEmEstoque
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-xs'
                  : isDark
                  ? 'bg-[#000000] border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  : 'bg-white border-2 border-slate-300 text-slate-700 hover:text-black hover:border-slate-400'
              }`}
              title={apenasEmEstoque ? 'Exibindo apenas produtos em estoque. Clique para exibir todo o catálogo.' : 'Clique para ocultar produtos esgotados.'}
            >
              <span className={`w-2 h-2 rounded-full ${apenasEmEstoque ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
              <span>Em estoque</span>
            </button>

            {/* Campo de Busca por Nome / Código (Tamanho Otimizado) */}
            <div className="relative flex-1 w-full min-w-[170px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar produto por nome, cód..."
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                className={`w-full ${isDark ? 'bg-[#000000] border border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-2 border-slate-300 text-slate-900 placeholder:text-slate-400'} focus:border-emerald-500 rounded-xl pl-10 pr-8 py-2 text-xs focus:outline-none transition`}
              />
              {buscaProduto && (
                <button
                  type="button"
                  onClick={() => setBuscaProduto('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Leitor de Código de Barras / Câmera */}
            <form onSubmit={handleBarcodeSubmit} className="relative w-full sm:w-52 shrink-0 flex items-center">
              <Barcode className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Cód. Barras (Enter)"
                value={buscaCodigoBarras}
                onChange={(e) => setBuscaCodigoBarras(e.target.value)}
                className={`w-full ${isDark ? 'bg-[#000000] border border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-2 border-slate-300 text-slate-900 placeholder:text-slate-400'} focus:border-emerald-500 rounded-xl pl-9 pr-9 py-2 text-xs focus:outline-none transition`}
              />
              <button
                type="button"
                onClick={() => setModalCameraBarcode(true)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                title="Escanear Código de Barras pela Câmera (Mobile/Desktop)"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Grid de Produtos */}
        <div className="flex-1 overflow-y-auto p-3.5">
          {carregando ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando catálogo de produtos...</div>
          ) : (produtosFiltrados || []).length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">Nenhum produto encontrado.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {produtosFiltrados.map((produto) => {
                const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
                const estoqueQtd = produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0
                  ? produto.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0)
                  : Number(produto.quantidade_estoque ?? 0);
                const isEsgotado = estoqueQtd <= 0;
                const temEstoqueBaixo = estoqueQtd > 0 && estoqueQtd <= Number(produto.estoque_minimo_alerta || 0);

                let precoFinal = produto.preco_venda_varejo;
                if (tabelaPrecoCalculada === 'atacado' && produto.preco_venda_atacado) {
                  precoFinal = produto.preco_venda_atacado;
                } else if (tabelaPrecoCalculada === 'autoatacado' && produto.preco_venda_autoatacado) {
                  precoFinal = produto.preco_venda_autoatacado;
                } else if (produto.promocao_ativa && Number(produto.preco_promocional) > 0) {
                  precoFinal = Number(produto.preco_promocional);
                }
                const precoOriginal = (produto.promocao_ativa && Number(produto.preco_promocional) > 0 && precoFinal !== produto.preco_venda_varejo)
                  ? produto.preco_venda_varejo
                  : null;

                return (
                  <div
                    key={produto.id}
                    onClick={() => {
                      if (isEdicaoTravada) {
                        mostrarAviso('Alteração de itens bloqueada para pedidos com status diferente de pendente.');
                        return;
                      }
                      if (produto?.tem_variacoes && produto?.variacoes && (produto.variacoes?.length || 0) > 0) {
                        setProdutoModalVariacao(produto);
                      } else if (ehProdutoFracionado(produto)) {
                        setItemPesagemModal({ produto, quantidadeAtual: 1 });
                      } else {
                        adicionarItem(produto);
                      }
                    }}
                    className={`p-2 cursor-pointer transition-all duration-150 flex flex-col justify-between group shadow-sm active:scale-[0.98] rounded-xl ${
                      isDark
                        ? 'bg-[#000000] hover:bg-slate-950 border border-slate-700 hover:border-emerald-400'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <div>
                      <div className={`relative aspect-square rounded-lg overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-100'} mb-1.5`}>
                        <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                        {isEsgotado ? (
                          <div className="absolute inset-0 bg-black/65 backdrop-blur-[1px] flex items-center justify-center p-1">
                            <span className="bg-rose-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow uppercase tracking-wider">
                              Esgotado
                            </span>
                          </div>
                        ) : (
                          <>
                            {produto.promocao_ativa && Number(produto.preco_promocional) > 0 && (
                              <span className="absolute top-1 left-1 bg-rose-600 text-white font-black text-[8px] px-1.5 py-0.5 rounded shadow uppercase tracking-wider">
                                PROMO
                              </span>
                            )}
                            {temEstoqueBaixo ? (
                              <span className="absolute top-1 right-1 bg-amber-500/90 text-slate-950 font-black text-[8px] px-1 py-0.2 rounded shadow">
                                Est: {estoqueQtd}
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>

                      <h3 className={`font-bold text-[11px] sm:text-xs line-clamp-2 leading-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        {produto.nome}
                      </h3>
                      {produto.codigo_interno && (
                        <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">#{produto.codigo_interno}</span>
                      )}
                    </div>

                    <div className={`mt-1.5 pt-1.5 border-t flex items-center justify-between ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                      <div className="flex items-baseline gap-1.5 overflow-hidden">
                        <span className={`font-black text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                          R$ {Number(precoFinal).toFixed(2)}{ehProdutoFracionado(produto) ? `/${obterSiglaUnidade(produto)}` : ''}
                        </span>
                        {precoOriginal && (
                          <span className="text-[10px] text-slate-400 line-through">
                            R$ {Number(precoOriginal).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center transition shrink-0 ${isDark ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-300 group-hover:bg-emerald-600 group-hover:text-white'}`}>
                        <Plus className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PAINEL DIREITO: CARRINHO & TOTAL */}
      <div className={`w-full lg:w-[440px] xl:w-[480px] flex flex-col h-full border-t-2 lg:border-t-0 lg:border-l-2 ${
        isDark ? 'bg-[#08131A] border-slate-400' : 'bg-slate-100 border-slate-300'
      }`}>
        {/* Header do Carrinho & Seleção de Cliente */}
        <div className={`p-3.5 border-b space-y-2.5 ${isDark ? 'bg-[#08131A]/95 border-slate-800 text-white' : 'bg-slate-100/95 border-slate-300 text-slate-900'}`}>
          {/* Identificação de Modo Edição de Pedido */}
          {pedidoEmEdicao && (
            <div className={`p-2 px-3 rounded-2xl flex items-center justify-between gap-2 animate-in fade-in border ${
              isDark ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-emerald-50/80 border-emerald-200'
            }`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0`} />
                <span className={`text-xs font-bold truncate ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                  Editando Pedido #{pedidoEmEdicao.numero_pedido}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTemAlteracoesNaoSalvas(false);
                  snapshotInicialRef.current = null;
                  cancelarEdicaoPedido();
                  navigate('/orders');
                }}
                className={`p-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                  isDark ? 'bg-slate-700/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300' : 'bg-[#F1F5F9] hover:bg-rose-50 text-[#64748B] hover:text-rose-600'
                }`}
                title="Fechar e voltar para Pedidos"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className={`font-bold text-sm flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-[#0F172A]'}`}>
              <span>Carrinho de Venda</span>
            </h2>

            {((itens?.length || 0) > 0) && !isEdicaoTravada && (
              <button
                type="button"
                onClick={() => {
                  verificarSaidaComConfirmacao(() => {
                    limparCarrinho();
                    snapshotInicialRef.current = null;
                    setTemAlteracoesNaoSalvas(false);
                  });
                }}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {/* SELEÇÃO E BUSCA DIGITÁVEL DE CLIENTE */}
          <div className="relative" ref={clienteDropdownRef}>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={inputClienteBuscaRef}
                  type="text"
                  placeholder={isEdicaoTravada ? "Cliente fixo para pedidos neste status" : "Buscar cliente ou avulso..."}
                  value={clienteSelecionado ? clienteSelecionado.nome : clienteBuscaTexto}
                  disabled={isEdicaoTravada}
                  onChange={(e) => {
                    if (isEdicaoTravada) return;
                    if (clienteSelecionado) {
                      setClienteSelecionado(null);
                    }
                    setClienteBuscaTexto(e.target.value);
                    setClienteDropdownAberto(true);
                  }}
                  onFocus={() => {
                    if (!isEdicaoTravada) setClienteDropdownAberto(true);
                  }}
                  className={`w-full ${isDark ? 'bg-[#000000] border border-slate-700 text-slate-100 placeholder:text-slate-400' : 'bg-white border-2 border-slate-300 text-slate-900 placeholder:text-slate-400'} rounded-xl pl-9 pr-14 py-2 text-xs focus:outline-none focus:border-emerald-500 transition font-medium ${isEdicaoTravada ? 'opacity-70 cursor-not-allowed' : ''}`}
                />

                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {clienteSelecionado && !isEdicaoTravada && (
                    <button
                      type="button"
                      onClick={() => {
                        setClienteSelecionado(null);
                        setClienteBuscaTexto('');
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded-md transition cursor-pointer"
                      title="Remover cliente selecionado"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!isEdicaoTravada && (
                    <button
                      type="button"
                      onClick={() => setClienteDropdownAberto(prev => !prev)}
                      className="p-1 text-slate-400 hover:text-slate-200 rounded-md transition cursor-pointer"
                      title="Ver lista completa de clientes"
                    >
                      {clienteDropdownAberto ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalNovoCliente(true)}
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition flex items-center justify-center shrink-0"
                title="Cadastrar Novo Cliente"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Dropdown de Clientes com busca e seleção */}
            {clienteDropdownAberto && (
              <div className={`absolute left-0 right-0 top-full mt-1.5 z-40 rounded-2xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto animate-in fade-in border ${
                isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-slate-900'
              }`}>
                <button
                  type="button"
                  onClick={() => {
                    setClienteSelecionado(null);
                    setClienteBuscaTexto('');
                    setClienteDropdownAberto(false);
                  }}
                  className={`w-full p-2.5 text-left text-xs font-medium flex items-center justify-between border-b transition cursor-pointer ${
                    isDark ? 'border-slate-800' : 'border-slate-100'
                  } ${
                    !clienteSelecionado
                      ? isDark
                        ? 'bg-emerald-500/15 text-emerald-300 font-bold'
                        : 'bg-emerald-50 text-emerald-800 font-bold'
                      : isDark
                      ? 'text-slate-300 hover:bg-slate-800/80'
                      : 'text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className={!clienteSelecionado ? (isDark ? 'text-emerald-300 font-bold' : 'text-emerald-800 font-bold') : (isDark ? 'text-slate-200' : 'text-slate-900 font-semibold')}>
                    👤 Cliente Avulso (Balcão)
                  </span>
                  {!clienteSelecionado && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                </button>

                {(clientesFiltrados || []).length === 0 ? (
                  <div className={`p-3 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Nenhum cliente encontrado.
                  </div>
                ) : (
                  clientesFiltrados.map((cli) => {
                    const isSelected = clienteSelecionado?.id === cli.id;
                    return (
                      <button
                        key={cli.id}
                        type="button"
                        onClick={() => {
                          setClienteSelecionado(cli);
                          setClienteBuscaTexto('');
                          setClienteDropdownAberto(false);
                        }}
                        className={`w-full p-2.5 text-left text-xs flex items-center justify-between border-b transition cursor-pointer ${
                          isDark ? 'border-slate-800/60' : 'border-slate-100'
                        } ${
                          isSelected
                            ? isDark
                              ? 'bg-emerald-500/15 text-emerald-300 font-bold'
                              : 'bg-emerald-50 text-emerald-900 font-bold'
                            : isDark
                            ? 'text-slate-200 hover:bg-slate-800/80'
                            : 'text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <span className={`block truncate font-bold ${
                            isSelected
                              ? isDark ? 'text-emerald-300' : 'text-emerald-900'
                              : isDark ? 'text-slate-100' : 'text-slate-900'
                          }`}>
                            {cli.nome}
                          </span>
                          {(cli.whatsapp || cli.telefone) && (
                            <span className={`text-[10px] block truncate ${
                              isSelected
                                ? isDark ? 'text-emerald-400/80' : 'text-emerald-700'
                                : isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}>
                              Tel: {cli.whatsapp || cli.telefone}
                            </span>
                          )}
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* SELETORES RÁPIDOS: TIPO DA VENDA & FORMA DE ENTREGA */}
          <div className="space-y-2">
            {/* Linha 1: Tipo da Venda (oculto se apenas 1 modalidade estiver ativa) */}
            {(() => {
              const tiposAtivos = loja?.tipos_venda || loja?.configuracoes_extras?.tipos_venda_ativos || { varejo: true, atacado: true, distribuidor: true };
              const opcoes: { id: TabelaPreco; nome: string }[] = [];
              if (tiposAtivos.varejo !== false) opcoes.push({ id: 'varejo', nome: 'Varejo' });
              if (tiposAtivos.atacado !== false) opcoes.push({ id: 'atacado', nome: 'Atacado' });
              if (tiposAtivos.distribuidor !== false) opcoes.push({ id: 'autoatacado', nome: 'Distribuidor' });

              if (opcoes.length <= 1) return null;

              return (
                <div className={`p-2 rounded-xl flex items-center justify-between gap-2 border ${
                  isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Tag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-900'}`}>Tipo da Venda:</span>
                  </div>

                  {permissions.ehAdmin && !isEdicaoTravada ? (
                    <div className={`flex items-center gap-1 p-0.5 rounded-lg border ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-300'
                    }`}>
                      {opcoes.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setTabelaPrecoGlobal(tab.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase transition cursor-pointer ${
                            tabelaPrecoCalculada === tab.id
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : isDark
                              ? 'text-slate-400 hover:text-slate-200'
                              : 'text-slate-700 hover:text-slate-900'
                          }`}
                        >
                          {tab.nome}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg border ${
                      isDark ? 'text-slate-300 bg-slate-900 border-slate-700' : 'text-slate-900 bg-slate-100 border-slate-300'
                    }`}>
                      {tabelaPrecoCalculada === 'autoatacado' ? 'Distribuidor' : tabelaPrecoCalculada === 'atacado' ? 'Atacado' : 'Varejo'}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Linha 2: Forma de Entrega */}
            <div className={`p-2 rounded-xl flex items-center justify-between gap-2 border ${
              isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
            }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                {pedidoEntrega?.tipo_atendimento === 'entrega' ? (
                  <Truck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <Store className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                )}
                <span className={`text-[11px] font-semibold truncate ${isDark ? 'text-slate-400' : 'text-[#475569]'}`}>Forma de Entrega:</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTaxaEntrega(0);
                    setPedidoEntrega(FORMA_ENTREGA_RETIRADA_PADRAO);
                    setFreteConfirmado(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                    pedidoEntrega?.tipo_atendimento !== 'entrega'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      : 'bg-[#F1F5F9] text-[#334155] hover:text-[#0F172A] border border-[#E2E8F0]'
                  }`}
                >
                  <Store className="w-3 h-3" />
                  Retirada
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!clienteSelecionado?.id) {
                      setTaxaEntrega(0);
                      setPedidoEntrega(FORMA_ENTREGA_RETIRADA_PADRAO);
                      setFreteConfirmado(false);
                      mostrarToast('Para entregas (Envio), selecione primeiro o cliente para carregar o endereço de entrega.', 'aviso');
                      if (inputClienteBuscaRef.current) {
                        inputClienteBuscaRef.current.focus();
                        inputClienteBuscaRef.current.select();
                      }
                      setClienteDropdownAberto(true);
                      return;
                    }
                    setTaxaEntrega(0);
                    setPedidoEntrega({
                      ...FORMA_ENTREGA_RETIRADA_PADRAO,
                      tipo_atendimento: 'entrega',
                      transportadora_nome: 'Envio a Definir',
                      servico_codigo: 'pendente'
                    });
                    setFreteConfirmado(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                    pedidoEntrega?.tipo_atendimento === 'entrega'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      : 'bg-[#F1F5F9] text-[#334155] hover:text-[#0F172A] border border-[#E2E8F0]'
                  }`}
                >
                  <Truck className="w-3 h-3" />
                  Envio
                </button>
              </div>
            </div>


            {/* TERMÔMETROS COMPACTOS (ATACADO & FRETE GRÁTIS) */}
            {((itens?.length || 0) > 0) && (
              <div className="space-y-1.5 pt-0.5">
                {/* Termômetro Atacado / Volume */}
                {avaliacaoCarrinho.proximoNivel && (
                  <div className={`p-2 rounded-xl space-y-1.5 shadow-2xs ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <div className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1 font-medium truncate">
                        ⚡ {(() => {
                          const proxNome = avaliacaoCarrinho.proximoNivel === 'autoatacado' ? 'Distribuidor' : 'Atacado';
                          const isAuto = avaliacaoCarrinho.proximoNivel === 'autoatacado';
                          const valMin = isAuto ? loja?.valor_minimo_padrao_autoatacado : loja?.valor_minimo_padrao_atacado;
                          const qtdMin = isAuto ? loja?.qtd_minima_padrao_autoatacado : loja?.qtd_minima_padrao_atacado;
                          const tipoMin = isAuto ? loja?.tipo_minimo_padrao_autoatacado : loja?.tipo_minimo_padrao_atacado;

                          if (tipoMin === 'quantidade' || (Number(qtdMin) > 0 && (!valMin || Number(valMin) === 0))) {
                            const faltamPecas = avaliacaoCarrinho.faltaPecasParaProximo;
                            return `Faltam ${faltamPecas} ${faltamPecas === 1 ? 'peça' : 'peças'} para ${proxNome}`;
                          }
                          return `Faltam ${formatarMoeda(avaliacaoCarrinho.faltaValorParaProximo)} para ${proxNome}`;
                        })()}
                      </span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0 ml-1.5">{avaliacaoCarrinho.progressoGeralPercent}%</span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden p-0.5 ${
                      isDark ? 'bg-[#08131A] border border-slate-800' : 'bg-slate-100 border border-slate-200'
                    }`}>
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, avaliacaoCarrinho.progressoGeralPercent)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Termômetro Frete Grátis (Exibido estritamente se for Envio) */}
                {pedidoEntrega?.tipo_atendimento === 'entrega' && freteGratisAtivoLoja && freteGratisMinimoLoja > 0 && (
                  <div className={`p-2 rounded-xl space-y-1.5 shadow-2xs ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 truncate">
                        {subtotal >= freteGratisMinimoLoja ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">🎉 Frete Grátis Atingido!</span>
                        ) : (
                          <span>🚚 Faltam {formatarMoeda(faltaParaFreteGratis)} para Frete Grátis</span>
                        )}
                      </span>
                      <span className="font-bold shrink-0 ml-1.5 text-emerald-700 dark:text-emerald-400">
                        {progressoFreteGratis}%
                      </span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden p-0.5 ${
                      isDark ? 'bg-[#08131A] border border-slate-800' : 'bg-slate-100 border border-slate-200'
                    }`}>
                      <div
                        className="h-full rounded-full transition-all duration-300 bg-emerald-500"
                        style={{ width: `${progressoFreteGratis}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lista de Itens do Carrinho */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {((itens?.length || 0) === 0) ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 space-y-2 py-12">
              <Layers className="w-10 h-10 opacity-30" />
              <p className="text-xs">O carrinho está vazio.<br />Adicione produtos ou bipe o código de barras.</p>
            </div>
          ) : (
            itens.map((item) => {
              const minAtacado = (item.produto.tipo_minimo_atacado === 'minimo_sku' && Number(item.produto.qtd_minima_atacado) > 0) ? Number(item.produto.qtd_minima_atacado) : 0;
              const minDistribuidor = (item.produto.tipo_minimo_autoatacado === 'minimo_sku' && Number(item.produto.qtd_minima_autoatacado) > 0) ? Number(item.produto.qtd_minima_autoatacado) : 0;
              const msgVolume = minDistribuidor > 0 && (item.quantidade >= minAtacado || minAtacado === 0)
                ? `Mínimo ${minDistribuidor} para distribuidor`
                : minAtacado > 0
                ? `Mínimo ${minAtacado} para atacado`
                : null;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl p-2.5 space-y-1.5 shadow-xs border ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-bold text-xs truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.produto.nome}</h4>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        {item.variacao && (
                          <span className="text-emerald-500 bg-emerald-500/10 px-1 py-0.2 rounded font-medium">
                            {item.variacao.valor_variacao_1} {item.variacao.valor_variacao_2 || ''}
                          </span>
                        )}
                        {msgVolume ? (
                          <span className="text-amber-500 dark:text-amber-400 font-medium">
                            {msgVolume}
                          </span>
                        ) : ehProdutoFracionado(item.produto) ? (
                          <span>
                            {formatarLinhaCalculoItem(item.quantidade, Number(item.precoUnitario || 0), obterSiglaUnidade(item.produto))}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className={`flex items-center border rounded-lg overflow-hidden ${
                        isDark ? 'border border-slate-700 bg-[#000000]' : 'border border-slate-300 bg-white'
                      }`}>
                        <button
                          onClick={() => {
                            if (isEdicaoTravada) return;
                            const passo = ehProdutoFracionado(item.produto) ? 0.1 : 1;
                            atualizarQuantidade(item.id, Number((item.quantidade - passo).toFixed(3)), produtos);
                          }}
                          disabled={isEdicaoTravada}
                          className={`p-1 ${isEdicaoTravada ? 'text-slate-600 cursor-not-allowed' : isDark ? 'text-slate-400 hover:text-white cursor-pointer' : 'text-slate-500 hover:text-slate-900 cursor-pointer'}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <InputQuantidadeCarrinho
                          quantidade={item.quantidade}
                          ehFracionado={ehProdutoFracionado(item.produto)}
                          disabled={isEdicaoTravada}
                          isDark={isDark}
                          onChangeQtd={(novaQtd) => atualizarQuantidade(item.id, novaQtd, produtos)}
                          onDoubleClick={() => {
                            if (ehProdutoFracionado(item.produto) && !isEdicaoTravada) {
                              setItemPesagemModal({ produto: item.produto, variacao: item.variacao, quantidadeAtual: item.quantidade, cartId: item.id });
                            }
                          }}
                          title={ehProdutoFracionado(item.produto) ? "Digite a quantidade/peso ou dê duplo clique para abrir a balança" : "Digite a quantidade"}
                        />
                        <button
                          onClick={() => {
                            if (isEdicaoTravada) return;
                            const passo = ehProdutoFracionado(item.produto) ? 0.1 : 1;
                            atualizarQuantidade(item.id, Number((item.quantidade + passo).toFixed(3)), produtos);
                          }}
                          disabled={isEdicaoTravada}
                          className={`p-1 ${isEdicaoTravada ? 'text-slate-600 cursor-not-allowed' : isDark ? 'text-slate-400 hover:text-white cursor-pointer' : 'text-slate-500 hover:text-slate-900 cursor-pointer'}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className={`font-bold text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-700'} w-16 text-right`}>
                        R$ {Number(item.subtotal || 0).toFixed(2)}
                      </span>


                      {!isEdicaoTravada && (
                        <button onClick={() => removerItem(item.id)} className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Resumo Financeiro & Dois Botões de Fechamento */}
        <div className={`p-3.5 border-t space-y-3 ${
          isDark ? 'border-slate-800 bg-slate-950/90' : 'border-[#E2E8F0] bg-white'
        }`}>
          <div className={`space-y-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-[#475569]'}`}>
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className={`font-medium ${isDark ? 'text-slate-200' : 'text-[#0F172A]'}`}>R$ {Number(subtotal || 0).toFixed(2)}</span>
            </div>


            {/* Desconto R$ ou % (se autorizado) */}
            {permissions.podeDarDesconto ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span>Desconto:</span>
                  <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setTipoDesconto('valor')}
                      className={`px-1.5 py-0.5 rounded font-bold transition ${
                        tipoDesconto === 'valor' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoDesconto('percentual')}
                      className={`px-1.5 py-0.5 rounded font-bold transition ${
                        tipoDesconto === 'percentual' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      %
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {tipoDesconto === 'valor' ? (
                    <div className="flex items-center">
                      <span className="text-[11px] text-slate-500 mr-1">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={desconto > 0 ? desconto : ''}
                        onChange={(e) => setDescontoValor(parseFloat(e.target.value) || 0)}
                        placeholder="0,00"
                        className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-right text-xs text-rose-400 font-bold focus:outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        max="100"
                        value={descontoPercentual > 0 ? descontoPercentual : ''}
                        onChange={(e) => setDescontoPercentual(parseFloat(e.target.value) || 0)}
                        placeholder="0%"
                        className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-right text-xs text-rose-400 font-bold focus:outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[11px] text-slate-500 ml-1">%</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              desconto > 0 ? (
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Desconto de Tabela:</span>
                  <span className="text-rose-400 font-bold">-R$ {Number(desconto || 0).toFixed(2)}</span>
                </div>
              ) : null
            )}

            {desconto > 0 && permissions.podeDarDesconto && (
              <div className="text-[10px] text-rose-400 text-right font-medium">
                -R$ {Number(desconto || 0).toFixed(2)} ({Number(descontoPercentual || 0).toFixed(1)}%)
              </div>
            )}

            {taxaEntrega > 0 && (
              <div className="flex justify-between text-xs text-slate-400">
                <span>Taxa de Entrega:</span>
                <span className="text-emerald-400 font-bold">+{formatarMoeda(taxaEntrega)}</span>
              </div>
            )}

            <div className={`flex justify-between text-base font-bold pt-1.5 border-t ${
              isDark ? 'border-slate-800 text-white' : 'border-[#E2E8F0] text-[#0F172A]'
            }`}>
              <span>TOTAL A PAGAR:</span>
              <span className="text-emerald-600 text-lg font-black">{formatarMoeda(total)}</span>
            </div>
          </div>


          {/* BOTÕES: SALVAR, OPÇÕES DE ENVIO & FINALIZAR VENDA */}
          <div className="flex flex-row items-center gap-2 pt-1">
            {/* Botão Salvar */}
            <button
              type="button"
              disabled={(itens?.length || 0) === 0 || salvandoPendente}
              onClick={handleSalvarPedidoPendente}
              className={`flex-1 py-2 px-2.5 min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-center active:scale-95 shadow-xs ${
                isDark
                  ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white shadow-sm'
              }`}
              title={pedidoEmEdicao ? 'Atualizar pedido' : 'Salvar pedido como orçamento/pendente'}
            >
              {salvandoPendente ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-white" />
              ) : (
                <FileText className="w-3.5 h-3.5 shrink-0 text-white" />
              )}
              <span>{pedidoEmEdicao ? 'Atualizar' : 'Salvar'}</span>
            </button>

            {/* Botão Opções de Envio (visível exclusivamente quando tipoEntrega === 'envio') */}
            {ehEnvio && (
              <button
                type="button"
                disabled={!temCliente || salvandoPendente || (itens?.length || 0) === 0}
                onClick={() => setModalDefinirEnvioAberto(true)}
                className={`flex-1 py-2 px-2 min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition text-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-xs ${
                  isDark
                    ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-semibold'
                    : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white font-semibold shadow-sm'
                }`}
                title={
                  !temCliente
                    ? 'Selecione um cliente para cotar o frete'
                    : isFreteConfirmado
                    ? 'Frete definido! Clique para alterar opções'
                    : 'Definir opções de envio'
                }
              >
                <Truck className="w-3.5 h-3.5 shrink-0 text-white" />
                <span className="leading-tight">
                  Opções<br />de Envio
                </span>
              </button>
            )}

            {/* Botão Finalizar Venda */}
            <button
              type="button"
              disabled={
                (itens?.length || 0) === 0 ||
                salvandoPendente
              }
              onClick={handleAbrirFechamento}
              className={`flex-1 py-2 px-2 min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition text-center shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                isDark
                  ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white shadow-sm'
              }`}
              title="Abrir tela de pagamento e concluir venda"
            >
              <span className="leading-tight">
                Finalizar<br />Venda
              </span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-white" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* MODAL PESAGEM FRACIONADA (KG / GRAMAS / R$) */}
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

      {/* MODAL VARIAÇÕES */}
      {produtoModalVariacao && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className={`${isDark ? 'bg-[#08131A] border-2 border-slate-400' : 'bg-slate-100 border-2 border-slate-300'} rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-300'} pb-3`}>
              <div>
                <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-black'}`}>{produtoModalVariacao.nome}</h3>
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>Selecione a variação desejada:</span>
              </div>
              <button
                onClick={() => setProdutoModalVariacao(null)}
                className={`p-1.5 rounded-xl transition cursor-pointer ${
                  isDark
                    ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {produtoModalVariacao.variacoes?.map((variacao) => {
                const temPromocao = Boolean(
                  (variacao.preco_promocional && Number(variacao.preco_promocional) > 0) ||
                  (produtoModalVariacao.promocao_ativa && produtoModalVariacao.preco_promocional && Number(produtoModalVariacao.preco_promocional) > 0)
                );
                const precoNormal = Number(variacao.preco_venda_varejo || produtoModalVariacao.preco_venda_varejo || 0);
                const precoPromo = Number(variacao.preco_promocional || produtoModalVariacao.preco_promocional || 0);
                const precoFinal = (temPromocao && precoPromo > 0) ? precoPromo : precoNormal;

                return (
                  <button
                    key={variacao.id}
                    onClick={() => {
                      if (ehProdutoFracionado(produtoModalVariacao)) {
                        setItemPesagemModal({ produto: produtoModalVariacao, variacao, quantidadeAtual: 1 });
                      } else {
                        adicionarItem(produtoModalVariacao, variacao);
                      }
                      setProdutoModalVariacao(null);
                    }}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                      isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border-slate-700 text-white'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black shadow-xs'
                    }`}
                  >
                    <div>
                      <span className={`font-bold text-xs block ${isDark ? 'text-white' : 'text-black'}`}>
                        {variacao.valor_variacao_1} {variacao.valor_variacao_2 ? `- ${variacao.valor_variacao_2}` : ''}
                      </span>
                      <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-900 font-semibold'}`}>
                        Estoque: {variacao.quantidade_estoque} un
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5 text-right">
                      <span className={`font-black text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        R$ {precoFinal.toFixed(2)}
                      </span>
                      {temPromocao && precoNormal > precoFinal && (
                        <span className="text-[10px] text-slate-400 line-through">
                          R$ {precoNormal.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO DE VENDA */}
      {modalFechamento && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className={`${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
          } rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto`}>
            <div className={`flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-300'} pb-3`}>
              <h3 className={`font-bold text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-black'}`}>
                <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Pagamento & Fechamento</span>
              </h3>
              <button
                onClick={() => setModalFechamento(false)}
                className={`p-1.5 rounded-xl transition cursor-pointer ${
                  isDark
                    ? 'bg-[#000000] border border-slate-700 text-slate-200 hover:bg-slate-900'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`${
              isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
            } p-3.5 rounded-2xl text-center space-y-0.5`}>
              <span className={`text-xs block font-bold ${isDark ? 'text-emerald-400' : 'text-black'}`}>Valor Total da Venda</span>
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {formatarMoeda(valorDescontoCupom > 0 ? Math.max(0, total - valorDescontoCupom) : total)}
              </span>
              {valorDescontoCupom > 0 && (
                <div className="flex items-center justify-center gap-2 pt-1 text-xs">
                  <span className="text-slate-400 line-through">{formatarMoeda(total)}</span>
                  <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Cupom {cupomAplicado?.codigo}: -{formatarMoeda(valorDescontoCupom)}
                  </span>
                </div>
              )}
            </div>

            {/* Inclusão de Cupom de Desconto */}
            <div className={`p-3 rounded-2xl border space-y-2 ${
              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  <Ticket className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Cupom de Desconto</span>
                </span>
                {cupomAplicado && (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Ativo: {cupomAplicado.codigo}
                  </span>
                )}
              </div>

              {!cupomAplicado ? (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={codigoCupomInput}
                      onChange={(e) => setCodigoCupomInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAplicarCupom();
                        }
                      }}
                      placeholder="CÓDIGO DO CUPOM"
                      className={`flex-1 rounded-xl px-3 py-1.5 text-xs uppercase font-bold focus:outline-none focus:border-emerald-500 ${
                        isDark
                          ? 'bg-[#08131A] border border-slate-700 text-white placeholder:text-slate-500'
                          : 'bg-slate-50 border border-slate-300 text-black placeholder:text-slate-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAplicarCupom}
                      disabled={validandoCupom || !codigoCupomInput.trim()}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                    >
                      {validandoCupom ? 'Validando...' : 'Aplicar'}
                    </button>
                  </div>
                  {mensagemCupom && (
                    <p className={`text-[11px] font-medium ${mensagemCupom.tipo === 'sucesso' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {mensagemCupom.texto}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-emerald-400">
                      Cupom {cupomAplicado.codigo} (-{formatarMoeda(valorDescontoCupom)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoverCupom}
                    className="text-xs text-rose-400 hover:text-rose-300 underline font-semibold cursor-pointer"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>

            {/* Linhas de Pagamento (Múltiplas formas de pagamento) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                  Meios de Pagamento ({(linhasPagamento || []).length}):
                </span>
                <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-black'}`}>
                  Permite dividir o total em vários meios
                </span>
              </div>

              {linhasPagamento.map((linha, idx) => {
                const formaSelecionada = formasPagamentoDisponiveis.find(f => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
                const maxParcelas = formaSelecionada?.maximo_parcelas || 12;

                return (
                  <div key={linha.id} className={`p-3 rounded-2xl space-y-2.5 shadow-xs ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-[10px] font-black">
                          {idx + 1}
                        </span>
                        Pagamento #{idx + 1}
                      </span>
                      {(linhasPagamento?.length || 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoverLinhaPagamento(linha.id)}
                          className={`p-1.5 rounded-xl transition cursor-pointer ${
                            isDark
                              ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-900 border border-slate-700'
                              : 'text-slate-700 hover:text-rose-600 hover:bg-slate-100 border border-slate-200'
                          }`}
                          title="Remover este pagamento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Seleção da Forma de Pagamento */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {formasPagamentoDisponiveis.map((fp) => {
                        const estaSelecionado = linha.forma_pagamento_id === fp.id || (!linha.forma_pagamento_id && linha.forma_tipo === fp.tipo);
                        return (
                          <button
                            key={fp.id}
                            type="button"
                            onClick={() => handleAlterarFormaLinha(linha.id, fp)}
                            className={`p-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                              estaSelecionado
                                ? isDark
                                  ? 'border border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 shadow-xs'
                                  : 'border-2 border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/40 shadow-xs'
                                : isDark
                                ? 'border border-slate-700 bg-[#08131A] text-slate-200 hover:bg-slate-900 hover:border-slate-500'
                                : 'border-2 border-slate-300 bg-slate-50 text-black hover:bg-slate-100 hover:border-slate-400'
                            }`}
                          >
                            {fp.tipo === 'dinheiro' && <Banknote className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                            {fp.tipo === 'pix' && <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />}
                            {fp.tipo === 'cartao_debito' && <CreditCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                            {fp.tipo === 'cartao_credito' && <CreditCard className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />}
                            {fp.tipo === 'fiado' && <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                            {fp.tipo !== 'dinheiro' && fp.tipo !== 'pix' && fp.tipo !== 'cartao_debito' && fp.tipo !== 'cartao_credito' && fp.tipo !== 'fiado' && (
                              <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="truncate">{fp.nome}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Valor deste pagamento */}
                    <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                      isDark ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>Valor a pagar:</span>
                        {diferencaPagamento > 0 && (
                          <button
                            type="button"
                            onClick={() => handlePreencherRestanteLinha(linha.id)}
                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                            title="Preencher com o saldo restante da venda"
                          >
                            + Restante
                          </button>
                        )}
                      </div>
                      <div className={`flex items-center gap-1 border-2 rounded-xl px-2.5 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 ${
                        isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-slate-300'
                      }`}>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$</span>
                        <MoneyInput
                          autoFocus={idx === 0}
                          valor={linha.valor}
                          onChange={(novoValor) => handleAlterarValorLinha(linha.id, novoValor)}
                          placeholder="0,00"
                          className={`w-28 bg-transparent text-right text-xs font-semibold focus:outline-none placeholder:text-slate-400 ${
                            isDark ? 'text-white' : 'text-black'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Dinheiro: Valor Entregue e Troco para QUALQUER meio em dinheiro */}
                    {linha.forma_tipo === 'dinheiro' && (
                      <div className={`space-y-1.5 pt-1.5 border-t text-xs ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>Valor Entregue pelo Cliente:</span>
                          <div className={`flex items-center gap-1 border-2 rounded-xl px-2.5 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 ${
                            isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-slate-300'
                          }`}>
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$</span>
                            <MoneyInput
                              valor={linha.valor_entregue != null && linha.valor_entregue > 0 ? linha.valor_entregue : 0}
                              onChange={(novoValor) => handleAlterarEntregueLinha(linha.id, novoValor)}
                              placeholder="0,00"
                              className={`w-28 bg-transparent text-right text-xs font-semibold focus:outline-none placeholder:text-slate-400 ${
                                isDark ? 'text-white' : 'text-black'
                              }`}
                            />
                          </div>
                        </div>

                        {/* Cálculo Explicito do Troco para Qualquer Meio em Dinheiro */}
                        {linha.valor_entregue != null && linha.valor_entregue > 0 && (
                          linha.valor_entregue >= linha.valor ? (
                            <div className={`flex items-center justify-between gap-2 pt-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                              <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>Troco a devolver:</span>
                              <div className={`flex items-center gap-1 border-2 rounded-xl px-2.5 py-1.5 ${
                                isDark ? 'bg-[#08131A] border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
                              }`}>
                                <span className="w-28 text-right text-xs font-black text-emerald-600 dark:text-emerald-400">
                                  {formatarMoeda(Math.max(0, Number(linha.valor_entregue - linha.valor)))}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className={`flex items-center justify-between gap-2 pt-1.5 border-t text-[11px] ${
                              isDark ? 'border-slate-800 text-amber-400' : 'border-slate-200 text-amber-700'
                            }`}>
                              <span>Faltam {formatarMoeda(linha.valor - linha.valor_entregue)} nesta forma.</span>
                              <button
                                type="button"
                                onClick={() => handleUsarEntregueComoValorLinha(linha.id)}
                                className="px-2 py-0.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold transition cursor-pointer"
                                title="Definir o valor entregue como o montante pago nesta forma"
                              >
                                Pagar {formatarMoeda(linha.valor_entregue)} nesta forma
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* Cartão de Crédito: Parcelas */}
                    {linha.forma_tipo === 'cartao_credito' && (
                      <div className={`flex items-center justify-between gap-2 pt-1.5 border-t text-xs ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={isDark ? 'text-slate-300' : 'text-black font-semibold'}>Número de Parcelas:</span>
                        <select
                          value={linha.parcelas || 1}
                          onChange={(e) => handleAlterarParcelasLinha(linha.id, parseInt(e.target.value) || 1)}
                          className={`border-2 rounded-xl px-2.5 py-1 text-xs font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none cursor-pointer ${
                            isDark
                              ? 'bg-[#08131A] border-slate-700 text-white'
                              : 'bg-slate-50 border-slate-300 text-black'
                          }`}
                        >
                          {Array.from({ length: Math.min(12, maxParcelas) }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num} className="text-slate-900 dark:text-white bg-white dark:bg-slate-900">
                              {num}x {linha.valor > 0 ? `de ${formatarMoeda(linha.valor / num)}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Fiado: Informações do Cliente e Limite */}
                    {linha.forma_tipo === 'fiado' && (
                      <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 rounded-xl space-y-2 text-xs text-amber-900 dark:text-amber-200">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-700 dark:text-amber-400">Cliente Fiado:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-[200px]">
                            {clienteSelecionado ? clienteSelecionado.nome : 'Nenhum selecionado'}
                          </span>
                        </div>
                        {clienteSelecionado && (
                          <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                            <span>Limite de Crédito Disponível:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {formatarMoeda(Number(clienteSelecionado.limite_credito || 0))}
                            </span>
                          </div>
                        )}
                        {linha.valor > Number(clienteSelecionado?.limite_credito || 0) && (
                          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                            ⚠️ Valor informado excede o limite disponível de {formatarMoeda(Number(clienteSelecionado?.limite_credito || 0))}.
                          </p>
                        )}

                        {/* Fase 4: Análise Preditiva de Risco de Crédito (TypeSafe Jev) */}
                        {avaliandoRiscoFiado ? (
                          <div className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 text-[11px] animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 dark:text-amber-400" />
                            <span>Analisando comportamento financeiro com IA...</span>
                          </div>
                        ) : avaliacaoRiscoFiado ? (
                          <div className={`p-2 rounded-xl border space-y-1 transition text-xs ${
                            avaliacaoRiscoFiado.badgeCor === 'emerald'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200'
                              : avaliacaoRiscoFiado.badgeCor === 'amber'
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-200'
                              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/40 text-rose-900 dark:text-rose-200'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 font-bold">
                                {avaliacaoRiscoFiado.badgeCor === 'emerald' && <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                {avaliacaoRiscoFiado.badgeCor === 'amber' && <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />}
                                {avaliacaoRiscoFiado.badgeCor === 'rose' && <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />}
                                <span className="text-[11px] uppercase tracking-wide font-black">{avaliacaoRiscoFiado.titulo}</span>
                              </div>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-black/40 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" /> Jev AI
                              </span>
                            </div>
                            <p className="text-[11px] leading-tight text-slate-700 dark:text-slate-300">
                              {avaliacaoRiscoFiado.recomendacao}
                            </p>
                            {avaliacaoRiscoFiado.totalFiadosQuitados > 0 && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                                • {avaliacaoRiscoFiado.totalFiadosQuitados} compras fiado quitadas anteriormente
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Caderneta de Mercadinho: Informações do Cliente, Limite e Dia de Vencimento */}
                    {linha.forma_tipo === 'caderneta' && (
                      <div className={`p-3.5 rounded-2xl space-y-2 text-xs ${
                        isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                      }`}>
                        <div className={`flex items-center justify-between ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                          <span className="font-semibold flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Caderneta Mensal:</span>
                          </span>
                          <span className={`font-bold truncate max-w-[200px] ${isDark ? 'text-slate-100' : 'text-black'}`}>
                            {clienteSelecionado ? clienteSelecionado.nome : 'Nenhum selecionado'}
                          </span>
                        </div>
                        {clienteSelecionado && (
                          <div className="space-y-2">
                            <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                              <span className="font-semibold">Saldo Devedor Atual:</span>
                              <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-black'}`}>
                                {formatarMoeda(Number(clienteSelecionado.saldo_devedor_caderneta || 0))}
                              </span>
                            </div>
                            <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                              <span className="font-semibold">Limite Disponível na Caderneta:</span>
                              <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                {formatarMoeda(Math.max(0, Number(clienteSelecionado.limite_caderneta || 0) - Number(clienteSelecionado.saldo_devedor_caderneta || 0)))}
                              </span>
                            </div>
                            <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                              <span className="font-semibold">Ciclo de Acerto / Vencimento:</span>
                              <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-black'}`}>
                                Todo dia {clienteSelecionado.dia_vencimento_caderneta || loja?.dia_vencimento_padrao_caderneta || 10}
                              </span>
                            </div>
                          </div>
                        )}
                        {clienteSelecionado && linha.valor > Math.max(0, Number(clienteSelecionado.limite_caderneta || 0) - Number(clienteSelecionado.saldo_devedor_caderneta || 0)) && (
                          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold pt-1 border-t border-rose-300 dark:border-rose-900/50">
                            ⚠️ Valor informado excede o limite disponível na caderneta ({formatarMoeda(Math.max(0, Number(clienteSelecionado.limite_caderneta || 0) - Number(clienteSelecionado.saldo_devedor_caderneta || 0)))}).
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Botão Adicionar Outro Meio de Pagamento */}
              <button
                type="button"
                onClick={handleAdicionarLinhaPagamento}
                className={`w-full py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98 ${
                  isDark
                    ? 'border border-slate-700 bg-[#000000] hover:bg-slate-900 text-emerald-400'
                    : 'border-2 border-slate-300 bg-white hover:bg-slate-50 text-black shadow-xs'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>
                  Adicionar outro meio de pagamento {diferencaPagamento > 0 ? `(Faltam ${formatarMoeda(diferencaPagamento)})` : ''}
                </span>
              </button>
            </div>

            {/* Resumo de Conferência dos Valores com Discriminação de Frete */}
            <div className={`p-3.5 rounded-2xl space-y-2 text-xs ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                <span className="font-semibold">Subtotal dos Produtos:</span>
                <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-black'}`}>{formatarMoeda(subtotal)}</span>
              </div>

              {desconto > 0 && (
                <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                  <span className="font-semibold">Desconto {tipoDesconto === 'percentual' ? `(${descontoPercentual}%)` : ''}:</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">- {formatarMoeda(desconto)}</span>
                </div>
              )}

              {valorDescontoCupom > 0 && (
                <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                  <span className="font-semibold">Desconto (Cupom: {cupomAplicado?.codigo || 'Ativo'}):</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">- {formatarMoeda(valorDescontoCupom)}</span>
                </div>
              )}

              {/* Discriminação explícita do Frete / Retirada */}
              <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-black font-semibold'}`}>
                <span className="flex items-center gap-1.5 font-semibold">
                  <Truck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    {(() => {
                      if (pedidoEntrega?.tipo_atendimento === 'retirada') {
                        return 'Retirada no Balcão:';
                      }
                      const transp = pedidoEntrega?.transportadora_nome || '';
                      const serv = (pedidoEntrega?.servico_codigo || '').toLowerCase();
                      let servicoNome = pedidoEntrega?.servico_codigo || '';
                      if (serv === '1' || serv.includes('sedex')) servicoNome = 'SEDEX';
                      else if (serv === '2' || serv.includes('pac')) servicoNome = 'PAC';

                      if (transp && servicoNome && !transp.toLowerCase().includes(servicoNome.toLowerCase())) {
                        return `Frete (${transp} - ${servicoNome}):`;
                      } else if (transp) {
                        return `Frete (${transp}):`;
                      } else if (servicoNome) {
                        return `Frete (${servicoNome}):`;
                      }
                      return 'Taxa de Entrega / Frete:';
                    })()}
                  </span>
                </span>
                {ehEnvio && !isFreteConfirmado ? (
                  <button
                    type="button"
                    onClick={() => setModalDefinirEnvioAberto(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer active:scale-95 shadow-2xs"
                    title="Definir frete agora"
                  >
                    <span>A definir</span>
                    <span className="text-[11px]">✏️</span>
                  </button>
                ) : (
                  <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                    {ehCupomFreteGratis ? (
                      <span className="inline-flex items-center gap-1.5">
                        {taxaEntrega > 0 && <span className="line-through text-slate-400 text-[11px]">{formatarMoeda(taxaEntrega)}</span>}
                        <span className="text-emerald-500 font-black">Grátis (Cupom)</span>
                      </span>
                    ) : taxaEntrega > 0 ? (
                      formatarMoeda(taxaEntrega)
                    ) : pedidoEntrega?.tipo_atendimento === 'retirada' ? (
                      'Grátis (Balcão)'
                    ) : pedidoEntrega?.is_frete_gratis ? (
                      'Grátis'
                    ) : (
                      formatarMoeda(0)
                    )}
                  </span>
                )}
              </div>

              {/* Alerta de Frete a Definir no Modal de Fechamento */}
              {ehEnvio && !isFreteConfirmado && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Para efetuar o pagamento, primeiro é necessário definir a opção de frete.</span>
                </div>
              )}

              {/* TOTAL DA VENDA (EM DESTAQUE) */}
              <div className={`pt-2 border-t flex justify-between items-center font-bold text-sm ${
                isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-black'
              }`}>
                <span>Total da Venda:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-black text-base">{formatarMoeda(totalComCupom)}</span>
              </div>

              {/* Total dos Meios Informados */}
              <div className={`flex justify-between items-center pt-1 border-t border-dashed ${
                isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-black font-semibold'
              }`}>
                <span className="font-semibold">Total dos Meios Informados:</span>
                <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>{formatarMoeda(totalLinhasPagamento)}</span>
              </div>

              {/* Total Conferido / Diferença */}
              <div className={`flex justify-between items-center font-semibold pt-1 border-t ${
                isDark ? 'border-slate-800/80 text-slate-300' : 'border-slate-200 text-black'
              }`}>
                {Math.abs(diferencaPagamento) < 0.01 ? (
                  <>
                    <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Total Conferido (100%):
                    </span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>R$ 0,00</span>
                  </>
                ) : diferencaPagamento > 0 ? (
                  <>
                    <span className="text-amber-700 dark:text-amber-400 font-bold">Restante a Definir:</span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">{formatarMoeda(diferencaPagamento)}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalFechamento(false)}
                className={`py-3 px-3 rounded-2xl font-bold text-xs transition cursor-pointer shadow-xs ${
                  isDark
                    ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-200'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
                }`}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={salvandoPendente || finalizandoVenda}
                onClick={handleSalvarComFormaPagamento}
                className={`flex-1 py-3 px-3 rounded-2xl font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white shadow-sm'
                }`}
              >
                {salvandoPendente ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <FileText className="w-4 h-4 text-white" />
                )}
                <span>Salvar</span>
              </button>

              <button
                type="button"
                disabled={
                  finalizandoVenda ||
                  salvandoPendente ||
                  (ehEnvio && !isFreteConfirmado) ||
                  Math.abs(diferencaPagamento) >= 0.01 ||
                  linhasPagamento.length === 0 ||
                  linhasPagamento.some(l => Number(l.valor) <= 0) ||
                  linhasPagamento.some(l => l.forma_tipo === 'fiado' && l.valor > (Number(clienteSelecionado?.limite_credito || 0) + 0.01)) ||
                  linhasPagamento.some(l => l.forma_tipo === 'caderneta' && l.valor > (Math.max(0, Number(clienteSelecionado?.limite_caderneta || 0) - Number(clienteSelecionado?.saldo_devedor_caderneta || 0)) + 0.01))
                }
                onClick={handleFinalizarVenda}
                className={`flex-[2] py-3 px-3 rounded-2xl font-black text-xs shadow-md flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-98 ${
                  isDark
                    ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white'
                }`}
              >
                {finalizandoVenda ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span className="truncate">
                      Confirmar
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RECIBO OFICIAL PADRONIZADO (DRY) */}
      {pedidoConcluido && (
        <ReciboPedidoModal
          isOpen={Boolean(pedidoConcluido)}
          pedido={pedidoConcluido}
          loja={loja}
          onClose={handleFecharRecibo}
          onImprimir={(ped) => PrintService.printReceipt(ped, loja, '80mm')}
          onCompartilharWhatsApp={loja ? (ped) => {
            const msg = PrintService.generateWhatsAppMessage(ped, loja);
            const phone = (ped.cliente?.whatsapp || ped.cliente?.telefone || '').replace(/\D/g, '');
            PrintService.openWhatsApp(phone, msg);
          } : undefined}
          onCopiarTexto={loja ? (ped) => {
            const msg = PrintService.generateWhatsAppMessage(ped, loja);
            navigator.clipboard.writeText(msg);
          } : undefined}
        />
      )}

      {/* Modal Novo Cliente */}
      <ModalNovoCliente
        isOpen={modalNovoCliente}
        onClose={() => setModalNovoCliente(false)}
        onClienteCadastrado={(novoCliente) => {
          setClientes(prev => [novoCliente, ...prev]);
          setClienteSelecionado(novoCliente);
        }}
      />

      {/* Modal Leitor de Código de Barras por Câmera */}
      <ModalLeitorCodigoBarras
        isOpen={modalCameraBarcode}
        onClose={() => setModalCameraBarcode(false)}
        onBarcodeDetected={(codigo) => {
          setBuscaCodigoBarras(codigo);
          adicionarProdutoPorCodigo(codigo);
        }}
      />

      {/* Modal de Atualização de Endereço do Cliente */}
      {modalAtualizarEnderecoAberto && clienteSelecionado && (
        <ModalAtualizarEnderecoCliente
          aberto={modalAtualizarEnderecoAberto}
          onFechar={() => {
            setModalAtualizarEnderecoAberto(false);
            setModalDefinirEnvioAberto(true);
          }}
          cliente={clienteSelecionado}
          onSucesso={(clienteAtualizado) => {
            setClienteSelecionado(clienteAtualizado);
            setClientes(prev => prev.map(c => c.id === clienteAtualizado.id ? clienteAtualizado : c));
            setModalAtualizarEnderecoAberto(false);
            setModalDefinirEnvioAberto(true);
          }}
        />
      )}

      {/* Modal Definir Envio do PDV */}
      {modalDefinirEnvioAberto && (
        <ModalDefinirEnvio
          isOpen={modalDefinirEnvioAberto}
          pedido={{
            id: pedidoEmEdicao?.id || 'carrinho_pos_temp',
            numero_pedido: pedidoEmEdicao?.numero_pedido || 'PDV',
            loja_id: loja?.id || '',
            cliente_id: clienteSelecionado?.id || null,
            cliente: clienteSelecionado || undefined,
            subtotal,
            valor_total: total,
            valor_frete: taxaEntrega,
            status: 'pendente',
            status_pagamento: 'aguardando_pagamento',
            pedido_entrega: pedidoEntrega || undefined,
            itens: itens.map((item, idx) => ({
              id: `item_${idx}`,
              pedido_id: pedidoEmEdicao?.id || 'carrinho_pos_temp',
              produto_id: item.produto.id,
              produto: item.produto,
              quantidade: item.quantidade,
              preco_unitario: item.precoUnitario || 0,
              preco_venda_unitario: item.precoUnitario || 0,
              valor_total: (item.precoUnitario || 0) * item.quantidade,
              nome_produto: item.produto.nome
            })) as any
          } as unknown as Pedido}
          loja={loja}
          usuario={usuario}
          onClose={() => setModalDefinirEnvioAberto(false)}
          onSucesso={() => {}}
          onConfirmarEnvio={(resultado: ShippingSelectionResult) => {
            setFreteConfirmado(true);
            const valFrete = Number(resultado.valor_frete ?? resultado.opcao_frete?.valor_frete ?? resultado.pedido_entrega?.valor_frete ?? 0);
            setTaxaEntrega(valFrete);
            const provedorResolvido =
              resultado.opcao_frete?.provedor ||
              resultado.pedido_entrega?.provedor ||
              ((resultado.opcao_frete?.transportadora_nome || '').toLowerCase().includes('uber') ? 'uber' : 'melhor_envio');

            if (resultado.pedido_entrega) {
              setPedidoEntrega({
                ...resultado.pedido_entrega,
                provedor: provedorResolvido,
                valor_frete: valFrete
              } as PedidoEntrega);
            } else {
              setPedidoEntrega({
                ...(pedidoEntrega || FORMA_ENTREGA_RETIRADA_PADRAO),
                tipo_atendimento: 'entrega',
                provedor: provedorResolvido,
                valor_frete: valFrete,
                transportadora_nome: resultado.opcao_frete?.transportadora_nome || 'Melhor Envio',
                servico_codigo: resultado.opcao_frete?.servico_codigo || 'entrega_definida'
              });
            }
            setModalDefinirEnvioAberto(false);
          }}
          onFeedbackSucesso={() => {}}
          onFeedbackErro={(msg) => mostrarErro(msg)}
        />
      )}
    </div>
  );
};
