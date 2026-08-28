import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Printer,
  Share2,
  CheckCircle2,
  Clock,
  Truck,
  Package,
  XCircle,
  Store,
  X,
  FileText,
  User,
  ArrowUpDown,
  Volume2,
  VolumeX,
  Receipt,
  Check,
  Tag,
  CreditCard,
  ChevronDown,
  Copy,
  Info,
  Mail,
  Download,
  ArrowLeft,
  DollarSign,
  Loader2,
  Filter,
  Calendar,
  ExternalLink,
  MapPin,
  Ban,
  ShoppingBag,
  SlidersHorizontal,
  Wallet,
  Coins
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Pedido, ItemPedido, Produto, Cliente, UsuarioLoja, StatusPedido } from '../types';
import { PrintService, formatarDataRecibo } from '../services/printService';
import { ModalItensPedido } from './ModalItensPedido';
import { ModalDetalhesProduto } from './ModalDetalhesProduto';
import { VendasHistoricoMobile } from './VendasHistoricoMobile';

type OrdenacaoCampo = 'data' | 'valor' | 'codigo' | 'cliente';
type OrdenacaoDirecao = 'asc' | 'desc';
type PeriodoPreset =
  | 'todos'
  | '30dias'
  | 'hoje'
  | 'ontem'
  | 'esta_semana'
  | 'semana_passada'
  | 'este_mes'
  | 'mes_passado'
  | 'este_ano'
  | 'ano_passado'
  | 'custom';

export const VendasHistorico: React.FC = () => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  // Estados principais de dados
  const [vendas, setVendas] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioLoja[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);

  // Estados de busca e filtros
  const [busca, setBusca] = useState<string>('');
  const [drawerFiltrosAberto, setDrawerFiltrosAberto] = useState<boolean>(false);
  const [dropdownVendedorAberto, setDropdownVendedorAberto] = useState<boolean>(false);

  // Filtros aplicados
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoPreset>('todos');
  const [dataInicial, setDataInicial] = useState<string>('');
  const [dataFinal, setDataFinal] = useState<string>('');
  const [meiosPagamentoSelecionados, setMeiosPagamentoSelecionados] = useState<string[]>([]);
  const [vendedorSelecionadoId, setVendedorSelecionadoId] = useState<string>('todos');

  // Ordenação
  const [campoOrdenacao, setCampoOrdenacao] = useState<OrdenacaoCampo>('data');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<OrdenacaoDirecao>('desc');

  // Modais e Popovers
  const [vendaReciboModal, setVendaReciboModal] = useState<Pedido | null>(null);
  const [vendaItensModal, setVendaItensModal] = useState<Pedido | null>(null);
  const [vendaCancelarModal, setVendaCancelarModal] = useState<Pedido | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState<string>('');
  const [cancelandoVenda, setCancelandoVenda] = useState<boolean>(false);
  const [produtoDetalhesModal, setProdutoDetalhesModal] = useState<Produto | null>(null);

  // Popover de Endereço de Entrega (TELA004)
  const [enderecoPopover, setEnderecoPopover] = useState<{
    venda: Pedido;
    rect: DOMRect | null;
  } | null>(null);

  const [copiado, setCopiado] = useState<boolean>(false);
  const dropdownVendedorRef = useRef<HTMLDivElement>(null);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownVendedorRef.current &&
        !dropdownVendedorRef.current.contains(event.target as Node)
      ) {
        setDropdownVendedorAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Carregar dados
  const carregarVendas = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);

      // Carregar clientes e usuários
      supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id)
        .then(({ data }) => {
          if (data) setClientes(data);
        });

      supabase
        .from('usuarios_loja')
        .select('*')
        .eq('loja_id', loja.id)
        .then(({ data }) => {
          if (data) setUsuarios(data);
        });

      let query = supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(
            *,
            forma_pagamento:formas_pagamento(*)
          )
        `)
        .eq('loja_id', loja.id)
        // Regra de negócio: Na tela de Vendas, somente pedidos Concluídos (e vendas canceladas originárias de vendas)
        .in('status', ['concluido', 'cancelado']);

      // Se operador restrito, filtra apenas suas transações
      if (usuario && !permissions.podeVerTransacoesOutros) {
        query = query.eq('vendedor_id', usuario.id);
      }

      const { data, error } = await query.order('criado_em', { ascending: false });

      if (error) throw error;
      if (data) {
        setVendas(data as unknown as Pedido[]);
      }
    } catch (err) {
      console.error('Erro ao buscar histórico de vendas:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarVendas();

    if (loja?.id) {
      const channel = supabase
        .channel(`vendas-historico-realtime-${loja.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${loja.id}` },
          () => carregarVendas()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pagamentos_pedido', filter: `loja_id=eq.${loja.id}` },
          () => carregarVendas()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loja?.id, usuario?.id, permissions.podeVerTransacoesOutros]);

  // Cálculos das Métricas de Resumo (Hoje, Ontem, Esta semana, Este mês)
  const metricas = useMemo(() => {
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);

    const inicioOntem = new Date(inicioHoje);
    inicioOntem.setDate(inicioOntem.getDate() - 1);
    const fimOntem = new Date(inicioHoje);
    fimOntem.setMilliseconds(-1);

    // Início da semana (Segunda-feira)
    const diaSemana = agora.getDay();
    const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana; // 0 é domingo
    const inicioEstaSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diffSegunda, 0, 0, 0);

    // Início deste mês
    const inicioEsteMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);

    let hojeVendas = 0;
    let hojeTotal = 0;
    let ontemVendas = 0;
    let ontemTotal = 0;
    let semanaVendas = 0;
    let semanaTotal = 0;
    let mesVendas = 0;
    let mesTotal = 0;

    vendas.forEach((v) => {
      // Considera apenas vendas efetivamente concluídas (não canceladas) para métricas
      if (v.status !== 'concluido') return;

      const dataVenda = new Date(v.data_venda || v.criado_em || '');
      const valor = Number(v.valor_total || 0);

      // Hoje
      if (dataVenda >= inicioHoje) {
        hojeVendas++;
        hojeTotal += valor;
      }

      // Ontem
      if (dataVenda >= inicioOntem && dataVenda <= fimOntem) {
        ontemVendas++;
        ontemTotal += valor;
      }

      // Esta semana
      if (dataVenda >= inicioEstaSemana) {
        semanaVendas++;
        semanaTotal += valor;
      }

      // Este mês
      if (dataVenda >= inicioEsteMes) {
        mesVendas++;
        mesTotal += valor;
      }
    });

    return {
      hoje: { qtd: hojeVendas, total: hojeTotal },
      ontem: { qtd: ontemVendas, total: ontemTotal },
      estaSemana: { qtd: semanaVendas, total: semanaTotal },
      esteMes: { qtd: mesVendas, total: mesTotal }
    };
  }, [vendas]);

  // Aplicar filtros por período e meio de pagamento
  const vendasFiltradas = useMemo(() => {
    return vendas
      .filter((v) => {
        // 1. Busca textual
        const termo = busca.toLowerCase().trim();
        if (termo) {
          const nomeCliente = (v.cliente?.nome || 'cliente avulso balcão').toLowerCase();
          const docCliente = (v.cliente?.numero_documento || '').toLowerCase();
          const numPedido = v.numero_pedido.toString();
          const nomeVendedor = (v.vendedor?.nome_completo || '').toLowerCase();
          const temItem = v.itens?.some((i) => i.nome_produto.toLowerCase().includes(termo));

          const bateBusca =
            nomeCliente.includes(termo) ||
            docCliente.includes(termo) ||
            numPedido.includes(termo) ||
            nomeVendedor.includes(termo) ||
            temItem;

          if (!bateBusca) return false;
        }

        // 2. Filtro de Vendedor
        if (vendedorSelecionadoId !== 'todos') {
          if (vendedorSelecionadoId === 'catalogo') {
            if (v.origem !== 'catalogo_online') return false;
          } else {
            if (v.vendedor_id !== vendedorSelecionadoId) return false;
          }
        }

        // 3. Filtro de Meio de Pagamento
        if (meiosPagamentoSelecionados.length > 0) {
          const formasUsadas: string[] = (v.pagamentos || []).map((p: any) => {
            const tipo = p.forma_pagamento?.tipo?.toLowerCase() || '';
            const nome = p.forma_pagamento?.nome?.toLowerCase() || '';
            if (p.eh_pagamento_fiado || tipo === 'fiado' || nome.includes('fiado')) return 'fiado';
            if (tipo === 'pix' || nome.includes('pix')) return 'pix';
            if (tipo === 'dinheiro' || nome.includes('dinheiro')) return 'dinheiro';
            if (tipo === 'cartao_debito' || nome.includes('debito') || nome.includes('débito')) return 'cartao_debito';
            if (tipo === 'cartao_credito' || nome.includes('credito') || nome.includes('crédito')) return 'cartao_credito';
            if (nome.includes('cheque')) return 'cheque';
            if (nome.includes('voucher')) return 'voucher';
            if (nome.includes('saldo')) return 'saldo_cliente';
            if (nome.includes('link')) return 'link_pagamento';
            return 'outros';
          });

          const temFormaSelecionada = meiosPagamentoSelecionados.some((m) => formasUsadas.includes(m));
          if (!temFormaSelecionada && formasUsadas.length > 0) return false;
        }

        // 4. Filtro de Período
        const dataVenda = new Date(v.data_venda || v.criado_em || '');
        const agora = new Date();
        const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);

        if (periodoSelecionado === 'hoje') {
          if (dataVenda < inicioHoje) return false;
        } else if (periodoSelecionado === 'ontem') {
          const inicioOntem = new Date(inicioHoje);
          inicioOntem.setDate(inicioOntem.getDate() - 1);
          const fimOntem = new Date(inicioHoje);
          fimOntem.setMilliseconds(-1);
          if (dataVenda < inicioOntem || dataVenda > fimOntem) return false;
        } else if (periodoSelecionado === '30dias') {
          const limite30 = new Date(inicioHoje);
          limite30.setDate(limite30.getDate() - 30);
          if (dataVenda < limite30) return false;
        } else if (periodoSelecionado === 'esta_semana') {
          const diaSemana = agora.getDay();
          const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
          const inicioEstaSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diffSegunda, 0, 0, 0);
          if (dataVenda < inicioEstaSemana) return false;
        } else if (periodoSelecionado === 'semana_passada') {
          const diaSemana = agora.getDay();
          const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
          const inicioEstaSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diffSegunda, 0, 0, 0);
          const inicioSemanaPassada = new Date(inicioEstaSemana);
          inicioSemanaPassada.setDate(inicioSemanaPassada.getDate() - 7);
          const fimSemanaPassada = new Date(inicioEstaSemana);
          fimSemanaPassada.setMilliseconds(-1);
          if (dataVenda < inicioSemanaPassada || dataVenda > fimSemanaPassada) return false;
        } else if (periodoSelecionado === 'este_mes') {
          const inicioEsteMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
          if (dataVenda < inicioEsteMes) return false;
        } else if (periodoSelecionado === 'mes_passado') {
          const inicioMesPassado = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0);
          const fimMesPassado = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
          fimMesPassado.setMilliseconds(-1);
          if (dataVenda < inicioMesPassado || dataVenda > fimMesPassado) return false;
        } else if (periodoSelecionado === 'este_ano') {
          const inicioAno = new Date(agora.getFullYear(), 0, 1, 0, 0, 0);
          if (dataVenda < inicioAno) return false;
        } else if (periodoSelecionado === 'ano_passado') {
          const inicioAnoPassado = new Date(agora.getFullYear() - 1, 0, 1, 0, 0, 0);
          const fimAnoPassado = new Date(agora.getFullYear(), 0, 1, 0, 0, 0);
          fimAnoPassado.setMilliseconds(-1);
          if (dataVenda < inicioAnoPassado || dataVenda > fimAnoPassado) return false;
        } else if (periodoSelecionado === 'custom' || (dataInicial && dataFinal)) {
          if (dataInicial) {
            const dtIni = new Date(dataInicial + 'T00:00:00');
            if (dataVenda < dtIni) return false;
          }
          if (dataFinal) {
            const dtFim = new Date(dataFinal + 'T23:59:59');
            if (dataVenda > dtFim) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (campoOrdenacao === 'data') {
          cmp = new Date(a.data_venda || a.criado_em || '').getTime() - new Date(b.data_venda || b.criado_em || '').getTime();
        } else if (campoOrdenacao === 'valor') {
          cmp = Number(a.valor_total || 0) - Number(b.valor_total || 0);
        } else if (campoOrdenacao === 'codigo') {
          cmp = (Number(a.numero_pedido) || 0) - (Number(b.numero_pedido) || 0);
        } else if (campoOrdenacao === 'cliente') {
          const nomeA = a.cliente?.nome || 'cliente';
          const nomeB = b.cliente?.nome || 'cliente';
          cmp = nomeA.localeCompare(nomeB);
        }
        return direcaoOrdenacao === 'asc' ? cmp : -cmp;
      });
  }, [
    vendas,
    busca,
    vendedorSelecionadoId,
    meiosPagamentoSelecionados,
    periodoSelecionado,
    dataInicial,
    dataFinal,
    campoOrdenacao,
    direcaoOrdenacao
  ]);

  const toggleOrdenacao = (campo: OrdenacaoCampo) => {
    if (campoOrdenacao === campo) {
      setDirecaoOrdenacao((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCampoOrdenacao(campo);
      setDirecaoOrdenacao('desc');
    }
  };

  // Contagem de filtros ativos
  const totalFiltrosAtivos = useMemo(() => {
    let count = 0;
    if (periodoSelecionado !== 'todos') count++;
    if (meiosPagamentoSelecionados.length > 0) count += meiosPagamentoSelecionados.length;
    if (dataInicial || dataFinal) count++;
    return count;
  }, [periodoSelecionado, meiosPagamentoSelecionados, dataInicial, dataFinal]);

  const limparTodosFiltros = () => {
    setPeriodoSelecionado('todos');
    setDataInicial('');
    setDataFinal('');
    setMeiosPagamentoSelecionados([]);
  };

  // Cancelar venda (TELA005)
  const handleConfirmarCancelamento = async () => {
    if (!vendaCancelarModal) return;
    try {
      setCancelandoVenda(true);
      const { error } = await supabase
        .from('pedidos')
        .update({
          status: 'cancelado',
          motivo_cancelamento: motivoCancelamento || 'Cancelado pelo usuário no Histórico de Vendas',
          atualizado_em: new Date().toISOString()
        })
        .eq('id', vendaCancelarModal.id);

      if (error) throw error;

      setVendas((prev) =>
        prev.map((v) =>
          v.id === vendaCancelarModal.id
            ? { ...v, status: 'cancelado' as StatusPedido, motivo_cancelamento: motivoCancelamento }
            : v
        )
      );

      setVendaCancelarModal(null);
      setMotivoCancelamento('');
    } catch (err: any) {
      console.error('Erro ao cancelar venda:', err);
      alert(`Erro ao cancelar venda: ${err.message || 'Tente novamente.'}`);
    } finally {
      setCancelandoVenda(false);
    }
  };

  const handleConsultarProduto = async (item: ItemPedido) => {
    try {
      if (item.produto_id) {
        const { data } = await supabase
          .from('produtos')
          .select('*, categoria:categorias(*), variacoes:variacoes_produto(*)')
          .eq('id', item.produto_id)
          .maybeSingle();

        if (data) {
          setProdutoDetalhesModal(data as unknown as Produto);
          return;
        }
      }
      setProdutoDetalhesModal({
        id: item.produto_id || 'temp',
        loja_id: loja?.id || '',
        nome: item.nome_produto,
        preco_venda_varejo: item.preco_venda_unitario,
        preco_custo: 0,
        quantidade_estoque: 0,
        estoque_minimo_alerta: 0,
        tipo_unidade: 'un',
        ativo: true,
        exibir_catalogo: true,
        destaque: false,
        fotos_urls: [],
        tem_variacoes: false,
        controlar_estoque: false,
        promocao_ativa: false,
        qtd_minima_atacado: 1,
        qtd_minima_autoatacado: 1,
        criado_em: new Date().toISOString()
      } as unknown as Produto);
    } catch (e) {
      console.warn('Erro ao carregar detalhes do produto:', e);
    }
  };

  const formatarDataTabela = (dataStr: string) => {
    try {
      const d = new Date(dataStr);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = String(d.getFullYear()).slice(-2);
      const hora = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return { data: `${dia}/${mes}/${ano}`, hora: `${hora}:${min}` };
    } catch {
      return { data: dataStr, hora: '' };
    }
  };

  const calcularTotalItens = (pedido: Pedido) => {
    const itens = pedido.itens || pedido.itens_pedido || [];
    return itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);
  };

  const obterIconeMeioPagamento = (pedido: Pedido) => {
    const pag = pedido.pagamentos?.[0];
    const tipo = (pag as any)?.forma_pagamento?.tipo?.toLowerCase() || '';
    if (tipo === 'dinheiro') {
      return (
        <span title="Dinheiro">
          <Coins className="w-3.5 h-3.5 text-emerald-400" />
        </span>
      );
    }
    if (tipo === 'pix') {
      return (
        <span title="Pix">
          <Wallet className="w-3.5 h-3.5 text-teal-400" />
        </span>
      );
    }
    if (tipo === 'cartao_credito' || tipo === 'cartao_debito') {
      return (
        <span title="Cartão">
          <CreditCard className="w-3.5 h-3.5 text-sky-400" />
        </span>
      );
    }
    return (
      <span title="Pagamento">
        <DollarSign className="w-3.5 h-3.5 text-slate-400" />
      </span>
    );
  };

  const handleCopiarReciboTexto = (pedido: Pedido) => {
    if (!loja) return;
    const msg = PrintService.generateWhatsAppMessage(pedido, loja);
    navigator.clipboard.writeText(msg);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // Nome do vendedor selecionado para exibição no botão
  const labelVendedorBotao = useMemo(() => {
    if (vendedorSelecionadoId === 'todos') return 'Todos os vendedores';
    if (vendedorSelecionadoId === 'catalogo') return 'Catálogo Online';
    const user = usuarios.find((u) => u.id === vendedorSelecionadoId);
    return user ? user.nome_completo : 'Vendedor';
  }, [vendedorSelecionadoId, usuarios]);

  return (
    <div className="h-full w-full overflow-hidden select-none">
      {/* 1. VISUALIZAÇÃO MOBILE EXCLUSIVA (TEMA CLARO PADRÃO PEDIDOS/PRODUTOS) */}
      <div className="block md:hidden h-full overflow-hidden">
        <VendasHistoricoMobile
          vendas={vendas}
          clientes={clientes}
          usuarios={usuarios}
          carregando={carregando}
          onVerItens={(pedido) => setVendaItensModal(pedido)}
          onVerRecibo={(pedido) => setVendaReciboModal(pedido)}
          onCancelarVenda={(pedido) => {
            setMotivoCancelamento('');
            setVendaCancelarModal(pedido);
          }}
        />
      </div>

      {/* 2. VISUALIZAÇÃO DESKTOP (100% PRESERVADA NO TEMA ESCURO ORIGINAL) */}
      <div className="hidden md:flex flex-col h-full overflow-hidden bg-slate-950 text-slate-100 font-sans">
        {/* CORPO PRINCIPAL */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* TOPO: CABEÇALHO DA TELA DE VENDAS */}
          <div className="p-4 sm:px-6 py-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
                title="Voltar"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                  <span>Histórico de vendas</span>
                </h1>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>{vendasFiltradas.length} vendas concluídas listadas</span>
                  {!permissions.podeVerTransacoesOutros && (
                    <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      👤 Suas Vendas ({usuario?.nome_completo || 'Vendedor'})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* BARRA DE AÇÕES: BUSCA + BOTÃO FILTROS + BOTÃO VENDEDORES */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Campo de Busca (TELA001) */}
              <div className="relative min-w-[240px] sm:min-w-[280px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Nome do cliente ou produto"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-8 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-inner"
                />
                {busca && (
                  <button
                    onClick={() => setBusca('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Botão de Filtros (TELA001 / Abre Gaveta TELA002) */}
              <button
                type="button"
                onClick={() => setDrawerFiltrosAberto(true)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer shadow-sm ${
                  totalFiltrosAtivos > 0
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 text-slate-300 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filtros</span>
                {totalFiltrosAtivos > 0 && (
                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center ml-0.5">
                    {totalFiltrosAtivos}
                  </span>
                )}
              </button>

              {/* Dropdown de Vendedores (TELA001 / Popover TELA003) */}
              <div className="relative" ref={dropdownVendedorRef}>
                <button
                  type="button"
                  onClick={() => setDropdownVendedorAberto((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer shadow-sm ${
                    vendedorSelecionadoId !== 'todos'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold'
                      : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 text-slate-300 hover:text-white'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span className="max-w-[130px] truncate">{labelVendedorBotao}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${dropdownVendedorAberto ? 'rotate-180 text-emerald-400' : ''}`}
                  />
                </button>

                {/* Popover TELA003 (Filtrar por Vendedor) */}
                {dropdownVendedorAberto && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-slate-200">Filtrar por vendedor</span>
                      <button
                        type="button"
                        onClick={() => {
                          setVendedorSelecionadoId('todos');
                        }}
                        className="text-[11px] text-emerald-400 hover:underline font-semibold cursor-pointer"
                      >
                        Limpar
                      </button>
                    </div>

                    <div className="space-y-1 max-h-56 overflow-y-auto pt-1">
                      {/* Opção Todos */}
                      <label
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                          vendedorSelecionadoId === 'todos'
                            ? 'bg-emerald-500/15 text-emerald-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="vendedor_filtro"
                          checked={vendedorSelecionadoId === 'todos'}
                          onChange={() => setVendedorSelecionadoId('todos')}
                          className="accent-emerald-500"
                        />
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>Todos os vendedores</span>
                        </div>
                      </label>

                      {/* Opção Catálogo */}
                      <label
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                          vendedorSelecionadoId === 'catalogo'
                            ? 'bg-emerald-500/15 text-emerald-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="vendedor_filtro"
                          checked={vendedorSelecionadoId === 'catalogo'}
                          onChange={() => setVendedorSelecionadoId('catalogo')}
                          className="accent-emerald-500"
                        />
                        <div className="flex items-center gap-1.5 truncate">
                          <Store className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Catálogo Online</span>
                        </div>
                      </label>

                      {/* Vendedores Cadastrados */}
                      {usuarios.map((u) => (
                        <label
                          key={u.id}
                          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                            vendedorSelecionadoId === u.id
                              ? 'bg-emerald-500/15 text-emerald-300 font-bold'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name="vendedor_filtro"
                            checked={vendedorSelecionadoId === u.id}
                            onChange={() => setVendedorSelecionadoId(u.id)}
                            className="accent-emerald-500"
                          />
                          <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">{u.nome_completo}</span>
                          </div>
                        </label>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setDropdownVendedorAberto(false)}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer shadow mt-1"
                    >
                      Filtrar histórico
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BARRA DE MÉTRICAS DE RESUMO (TELA001) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 space-y-0.5 shadow-sm">
              <span className="text-[11px] font-medium text-slate-400 block">
                Hoje: <strong className="text-slate-200">{metricas.hoje.qtd} {metricas.hoje.qtd === 1 ? 'venda' : 'vendas'}</strong>
              </span>
              <div className="text-sm sm:text-base font-bold text-slate-100 font-mono">
                R$ {metricas.hoje.total.toFixed(2)}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 space-y-0.5 shadow-sm">
              <span className="text-[11px] font-medium text-slate-400 block">
                Ontem: <strong className="text-slate-200">{metricas.ontem.qtd} {metricas.ontem.qtd === 1 ? 'venda' : 'vendas'}</strong>
              </span>
              <div className="text-sm sm:text-base font-bold text-slate-100 font-mono">
                R$ {metricas.ontem.total.toFixed(2)}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 space-y-0.5 shadow-sm">
              <span className="text-[11px] font-medium text-slate-400 block">
                Esta semana: <strong className="text-slate-200">{metricas.estaSemana.qtd} {metricas.estaSemana.qtd === 1 ? 'venda' : 'vendas'}</strong>
              </span>
              <div className="text-sm sm:text-base font-bold text-slate-100 font-mono">
                R$ {metricas.estaSemana.total.toFixed(2)}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 space-y-0.5 shadow-sm">
              <span className="text-[11px] font-medium text-slate-400 block">
                Este mês: <strong className="text-slate-200">{metricas.esteMes.qtd} {metricas.esteMes.qtd === 1 ? 'vendas' : 'vendas'}</strong>
              </span>
              <div className="text-sm sm:text-base font-bold text-slate-100 font-mono">
                R$ {metricas.esteMes.total.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* TABELA DE VENDAS (TELA001) */}
        <div className="flex-1 overflow-auto">
          {carregando ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-xs text-slate-400">Carregando histórico de vendas...</p>
            </div>
          ) : vendasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 text-center p-6 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                <Receipt className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-200">Nenhuma venda concluída encontrada</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Os pedidos concluídos na frente de caixa e no catálogo online aparecerão listados aqui como vendas finalizadas.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-semibold sticky top-0 z-10 border-b border-slate-800/80 backdrop-blur">
                <tr>
                  <th
                    onClick={() => toggleOrdenacao('codigo')}
                    className="py-3 px-4 cursor-pointer hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Código</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleOrdenacao('data')}
                    className="py-3 px-4 cursor-pointer hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Data</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleOrdenacao('cliente')}
                    className="py-3 px-4 cursor-pointer hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Cliente</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Vendedor</th>
                  <th className="py-3 px-4 text-center">Itens</th>
                  <th
                    onClick={() => toggleOrdenacao('valor')}
                    className="py-3 px-4 text-right cursor-pointer hover:text-slate-200 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Valor</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Tipo</th>
                  <th className="py-3 px-4 text-center">Obs.</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {vendasFiltradas.map((venda) => {
                  const { data, hora } = formatarDataTabela(venda.data_venda || venda.criado_em || '');
                  const totalItens = calcularTotalItens(venda);
                  const isCatalogo = venda.origem === 'catalogo_online';
                  const codigoFormatado = isCatalogo ? `#c-${venda.numero_pedido}` : `#${venda.numero_pedido}`;
                  const temEntrega = Boolean(venda.endereco_entrega || Number(venda.valor_frete || 0) > 0);
                  const foiCancelada = venda.status === 'cancelado';

                  return (
                    <tr
                      key={venda.id}
                      className={`hover:bg-slate-900/60 transition group ${
                        foiCancelada ? 'opacity-60 bg-rose-950/10' : ''
                      }`}
                    >
                      {/* Código da Venda (TELA006) */}
                      <td className="py-3.5 px-4 font-mono font-medium">
                        <button
                          type="button"
                          onClick={() => setVendaReciboModal(venda)}
                          className="inline-flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition cursor-pointer font-bold"
                          title="Clique para abrir o Recibo da Venda (TELA006)"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
                          <span>{codigoFormatado}</span>
                        </button>
                      </td>

                      {/* Data da Venda */}
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        <span className="font-medium text-slate-200">{data}</span>
                        {hora && <span className="text-slate-400 ml-1.5 font-mono text-[11px]">{hora}</span>}
                      </td>

                      {/* Cliente */}
                      <td className="py-3.5 px-4 font-medium text-slate-100 max-w-[200px] truncate">
                        {venda.cliente?.nome || 'Cliente Avulso (Balcão)'}
                      </td>

                      {/* Vendedor */}
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        {isCatalogo ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                            <Store className="w-3.5 h-3.5" />
                            <span>Catálogo</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-300">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{venda.vendedor?.nome_completo || 'Balcão'}</span>
                          </span>
                        )}
                      </td>

                      {/* Itens (TELA008) */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setVendaItensModal(venda)}
                          className="inline-block px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-bold transition cursor-pointer"
                          title="Clique para ver os itens do pedido (TELA008)"
                        >
                          {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                        </button>
                      </td>

                      {/* Valor */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-bold text-slate-100">
                        <div className="flex items-center justify-end gap-1.5">
                          {obterIconeMeioPagamento(venda)}
                          <span className={foiCancelada ? 'line-through text-slate-500' : 'text-slate-100'}>
                            R$ {Number(venda.valor_total || 0).toFixed(2)}
                          </span>
                        </div>
                      </td>

                      {/* Tipo de Entrega / Retirada (TELA004) */}
                      <td className="py-3.5 px-4 text-center">
                        {temEntrega ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setEnderecoPopover({ venda, rect });
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 transition cursor-pointer"
                            title="Ver Endereço de Entrega"
                          >
                            <Truck className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-500" title="Retirada no balcão">
                            <Store className="w-4 h-4 inline opacity-50" />
                          </span>
                        )}
                      </td>

                      {/* Observações */}
                      <td className="py-3.5 px-4 text-center text-slate-400">
                        {venda.observacoes ? (
                          <span className="truncate max-w-[120px] block mx-auto text-[11px]" title={venda.observacoes}>
                            {venda.observacoes}
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                      </td>

                      {/* Ações: Cancelar Venda (TELA005) */}
                      <td className="py-3.5 px-4 text-center">
                        {foiCancelada ? (
                          <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                            Cancelada
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setVendaCancelarModal(venda)}
                            className="p-1.5 rounded-lg text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Cancelar venda (TELA005)"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* GAVETA LATERAL DE FILTROS (TELA002) */}
      {drawerFiltrosAberto && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end animate-in fade-in">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header da Gaveta */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-base text-slate-100">Filtros</h3>
              </div>
              <button
                type="button"
                onClick={() => setDrawerFiltrosAberto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* SEÇÃO 1: PERÍODO */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Período</h4>

                {/* Inputs de Data Inicial e Final */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Inicial</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={dataInicial}
                        onChange={(e) => {
                          setDataInicial(e.target.value);
                          setPeriodoSelecionado('custom');
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Final</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={dataFinal}
                        onChange={(e) => {
                          setDataFinal(e.target.value);
                          setPeriodoSelecionado('custom');
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Checkboxes de Períodos Rápidos (Conforme TELA002) */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    { id: '30dias', label: 'Últimos 30 dias' },
                    { id: 'hoje', label: 'Hoje' },
                    { id: 'ontem', label: 'Ontem' },
                    { id: 'esta_semana', label: 'Esta semana' },
                    { id: 'semana_passada', label: 'Semana passada' },
                    { id: 'este_mes', label: 'Este mês' },
                    { id: 'mes_passado', label: 'Mês passado' },
                    { id: 'este_ano', label: 'Este ano' },
                    { id: 'ano_passado', label: 'Ano passado' }
                  ].map((p) => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition ${
                        periodoSelecionado === p.id
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <input
                        type="radio"
                        name="periodo_preset"
                        checked={periodoSelecionado === p.id}
                        onChange={() => {
                          setPeriodoSelecionado(p.id as PeriodoPreset);
                          setDataInicial('');
                          setDataFinal('');
                        }}
                        className="accent-emerald-500"
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* SEÇÃO 2: MEIO DE PAGAMENTO (Conforme TELA002) */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Meio de Pagamento</h4>
                  {meiosPagamentoSelecionados.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMeiosPagamentoSelecionados([])}
                      className="text-[10px] text-emerald-400 hover:underline"
                    >
                      Desmarcar todos
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'pix', label: 'Pix' },
                    { id: 'dinheiro', label: 'Dinheiro' },
                    { id: 'cartao_debito', label: 'Cartão de Débito' },
                    { id: 'cartao_credito', label: 'Cartão de Crédito' },
                    { id: 'cheque', label: 'Cheque' },
                    { id: 'voucher', label: 'Voucher' },
                    { id: 'outros', label: 'Outros' },
                    { id: 'saldo_cliente', label: 'Saldo Cliente' },
                    { id: 'fiado', label: 'Venda Fiado' },
                    { id: 'link_pagamento', label: 'Link de Pagamento' }
                  ].map((m) => {
                    const ativo = meiosPagamentoSelecionados.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition ${
                          ativo
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={ativo}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMeiosPagamentoSelecionados((prev) => [...prev, m.id]);
                            } else {
                              setMeiosPagamentoSelecionados((prev) => prev.filter((id) => id !== m.id));
                            }
                          }}
                          className="accent-emerald-500"
                        />
                        <span className="truncate">{m.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Rodapé da Gaveta */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={limparTodosFiltros}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setDrawerFiltrosAberto(false)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer shadow"
              >
                Filtrar ({vendasFiltradas.length} vendas)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPOVER DE ENDEREÇO DE ENTREGA (TELA004) */}
      {enderecoPopover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>Endereço de entrega</span>
              </div>
              <button
                type="button"
                onClick={() => setEnderecoPopover(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <p className="font-semibold text-slate-100">
                {enderecoPopover.venda.endereco_entrega || 'Endereço não especificado'}
              </p>
              {enderecoPopover.venda.cliente?.nome && (
                <p className="text-slate-400 text-[11px]">
                  Destinatário: {enderecoPopover.venda.cliente.nome}
                </p>
              )}
            </div>

            {enderecoPopover.venda.endereco_entrega && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  enderecoPopover.venda.endereco_entrega
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Ver no mapa</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            )}
          </div>
        </div>
      )}
      </div>

      {/* MODAL DE CANCELAMENTO DE VENDA (TELA005) */}
      {vendaCancelarModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-slate-200">
                R$ {Number(vendaCancelarModal.valor_total || 0).toFixed(2)} para{' '}
                {vendaCancelarModal.cliente?.nome || 'Cliente Balcão'}
              </span>
              <button
                type="button"
                onClick={() => setVendaCancelarModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-1.5 py-2">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto mb-2">
                <Ban className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-100">Cancelar venda?</h3>
              <p className="text-xs text-slate-400">
                Esta venda <strong className="text-slate-200">não poderá ser reativada</strong>.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Motivo do cancelamento (opcional):</label>
              <input
                type="text"
                placeholder="Ex: Desistência do cliente, troca, etc."
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setVendaCancelarModal(null)}
                disabled={cancelandoVenda}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmarCancelamento}
                disabled={cancelandoVenda}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition cursor-pointer shadow flex items-center justify-center gap-1.5"
              >
                {cancelandoVenda ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Cancelar venda</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RECIBO DA VENDA (TELA006) */}
      {vendaReciboModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Topo do Recibo */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 text-sm">
                    Recibo da Venda #{vendaReciboModal.numero_pedido}
                  </h3>
                  <p className="text-[11px] text-slate-400">{loja?.nome_fantasia || 'HUBI PDV'}</p>
                </div>
              </div>
              <button
                onClick={() => setVendaReciboModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cupom/Recibo Formatado */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-slate-200 text-xs space-y-3 shadow-inner">
                {loja?.url_logo && (
                  <div className="text-center pb-1">
                    <img
                      src={loja.url_logo}
                      alt={loja.nome_fantasia}
                      className="max-h-12 max-w-[160px] mx-auto object-contain"
                    />
                  </div>
                )}

                <div className="text-center">
                  <h4 className="font-bold text-slate-100 text-base tracking-wide">
                    RECIBO #{vendaReciboModal.numero_pedido}
                  </h4>
                </div>

                {/* Dados da Loja */}
                <div className="space-y-0.5 text-xs text-slate-300">
                  <p className="font-bold uppercase text-slate-100">{loja?.nome_fantasia || 'HUBI PDV'}</p>
                  <p className="text-slate-400">
                    {[
                      loja?.endereco_logradouro,
                      loja?.endereco_numero,
                      loja?.endereco_bairro,
                      loja?.endereco_cidade
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    {loja?.whatsapp ? ` - +55 ${loja.whatsapp}` : loja?.telefone ? ` - +55 ${loja.telefone}` : ''}
                  </p>
                </div>

                {/* Dados do Cliente */}
                <div className="space-y-0.5 text-xs text-slate-300">
                  <p className="font-semibold text-slate-100">
                    {vendaReciboModal.cliente?.nome || 'Cliente Avulso (Balcão)'}
                  </p>
                  {(vendaReciboModal.cliente?.whatsapp || vendaReciboModal.cliente?.telefone) && (
                    <p className="text-slate-400">
                      +55 {vendaReciboModal.cliente.whatsapp || vendaReciboModal.cliente.telefone}
                    </p>
                  )}
                  {vendaReciboModal.endereco_entrega && (
                    <p className="text-[11px] text-slate-400">Entrega: {vendaReciboModal.endereco_entrega}</p>
                  )}
                </div>

                {/* Resumo de itens */}
                <div className="font-semibold text-slate-300 text-xs pt-1">
                  {vendaReciboModal.itens?.length || 0} itens (Qtd.:{' '}
                  {vendaReciboModal.itens?.reduce((acc, i) => acc + Number(i.quantidade || 1), 0) || 0})
                </div>

                <div className="border-t border-slate-700 my-2"></div>

                {/* Lista de Itens */}
                <div className="space-y-1.5">
                  {vendaReciboModal.itens?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-xs">
                      <span className="text-slate-200">
                        <strong>{Number(item.quantidade)}x</strong> {item.nome_produto}{' '}
                        {item.rotulo_variacao ? ` / ${item.rotulo_variacao}` : ''}
                      </span>
                      <span className="font-semibold text-slate-100 whitespace-nowrap pl-3">
                        R$ {Number(item.subtotal || item.preco_venda_unitario || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-700 my-2"></div>

                {/* Totais e Descontos */}
                {(Number(vendaReciboModal.valor_desconto) > 0 || Number(vendaReciboModal.valor_frete) > 0) && (
                  <div className="space-y-1 text-xs text-slate-400">
                    {Number(vendaReciboModal.subtotal) > 0 && (
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>R$ {Number(vendaReciboModal.subtotal).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(vendaReciboModal.valor_desconto) > 0 && (
                      <div className="flex justify-between text-rose-400">
                        <span>Desconto:</span>
                        <span>- R$ {Number(vendaReciboModal.valor_desconto).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(vendaReciboModal.valor_frete) > 0 && (
                      <div className="flex justify-between text-purple-400">
                        <span>Taxa de Entrega:</span>
                        <span>+ R$ {Number(vendaReciboModal.valor_frete).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-right text-sm font-bold text-slate-100">
                  Total: R$ {Number(vendaReciboModal.valor_total).toFixed(2)}
                </div>

                <div className="border-t border-slate-700 my-2"></div>

                <div className="text-center text-[11px] text-slate-400">
                  {formatarDataRecibo(vendaReciboModal.data_venda || vendaReciboModal.criado_em)}
                </div>
              </div>
            </div>

            {/* Ações de Impressão e Compartilhamento */}
            <div className="p-3.5 border-t border-slate-800 bg-slate-900 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => PrintService.printReceipt(vendaReciboModal, loja, '80mm')}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="truncate">Térmica 58/80mm</span>
                </button>

                <button
                  type="button"
                  onClick={() => PrintService.printReceipt(vendaReciboModal, loja, 'a4')}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="truncate">Imprimir A4</span>
                </button>

                <button
                  type="button"
                  onClick={() => PrintService.printReceipt(vendaReciboModal, loja, 'a4')}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span className="truncate">Baixar PDF</span>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => PrintService.openEmail(vendaReciboModal, loja)}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                  <span className="truncate">E-mail</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (loja && vendaReciboModal) {
                      const msg = PrintService.generateWhatsAppMessage(vendaReciboModal, loja);
                      PrintService.openWhatsApp(vendaReciboModal.cliente?.whatsapp || '', msg);
                    }
                  }}
                  className="py-2 px-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="truncate">WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopiarReciboTexto(vendaReciboModal)}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  {copiado ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span className="truncate">{copiado ? 'Copiado!' : 'Copiar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVendaReciboModal(null)}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ITENS DO PEDIDO (TELA008) */}
      <ModalItensPedido
        isOpen={!!vendaItensModal}
        onClose={() => setVendaItensModal(null)}
        pedido={vendaItensModal}
        onConsultarProduto={(item) => handleConsultarProduto(item)}
      />

      {/* MODAL DE DETALHES DO PRODUTO */}
      <ModalDetalhesProduto
        isOpen={!!produtoDetalhesModal}
        onClose={() => setProdutoDetalhesModal(null)}
        produto={produtoDetalhesModal}
      />
    </div>
  );
};
