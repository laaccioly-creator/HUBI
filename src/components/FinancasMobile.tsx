import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ShoppingCart,
  Store,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Plus,
  Search,
  Calendar,
  HelpCircle,
  Clock,
  CheckCircle2,
  Trash2,
  Copy,
  Edit2,
  Filter,
  Share2,
  Download,
  AlertCircle,
  X,
  CreditCard,
  Banknote,
  Zap,
  Repeat,
  Tag,
  Phone,
  Mail,
  MapPin,
  User,
  Info,
  Check,
  ArrowUp,
  ArrowDown,
  LogOut
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { TransacaoFinanceira, Fornecedor, Pedido, Caixa } from '../types';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';

export type SubTelaMobileFinance =
  | 'hub'
  | 'contas_pagar'
  | 'fluxo_caixa'
  | 'entradas'
  | 'saidas'
  | 'fornecedores'
  | 'adicionar_saida'
  | 'editar_saida'
  | 'adicionar_entrada'
  | 'editar_entrada'
  | 'adicionar_fornecedor'
  | 'detalhes_fornecedor';

interface FinancasMobileProps {
  transacoes: TransacaoFinanceira[];
  pedidos: Pedido[];
  caixaAberto: Caixa | null;
  fornecedoresIniciais?: Fornecedor[];
  carregando: boolean;
  onRecarregar: () => Promise<void>;
  onAbrirCaixa?: () => void;
  onSangria?: () => void;
  onSuprimento?: () => void;
  onFechamentoCego?: () => void;
  saldoEsperadoGaveta?: number;
}

// Categorias de Gastos Predefinidas (TELA010 / TELA022)
const CATEGORIAS_GASTOS_PADRAO = [
  { id: 'alimentacao', nome: 'Alimentação', icone: '🍔' },
  { id: 'aluguel', nome: 'Aluguel', icone: '🏠' },
  { id: 'compra_produtos', nome: 'Compra de produtos e insumos', icone: '📦' },
  { id: 'despesas_admin', nome: 'Despesas administrativas', icone: '🗄️' },
  { id: 'despesas_finan', nome: 'Despesas financeiras', icone: '💰' },
  { id: 'equipamentos', nome: 'Equipamentos', icone: '🖨️' },
  { id: 'funcionarios', nome: 'Funcionários', icone: '👥' },
  { id: 'impostos', nome: 'Impostos', icone: '⚖️' },
  { id: 'manutencao', nome: 'Manutenção e reparos', icone: '🔧' },
  { id: 'marketing', nome: 'Marketing e divulgação', icone: '📢' },
  { id: 'taxas_pagamento', nome: 'Taxas de pagamento', icone: '💳' },
  { id: 'transporte', nome: 'Transporte e logística', icone: '🚚' },
  { id: 'outros', nome: 'Outros', icone: '📁' },
];

// Categorização por Origem (Natureza da Receita)
const ORIGENS_RECEITA = {
  operacionais: [
    { id: 'venda_produtos', nome: 'Venda de Produtos / Balcão', icone: '🛍️', desc: 'Consumo de itens físicos (bebidas, alimentos, produtos)' },
    { id: 'locacao_espaco', nome: 'Locação / Uso de Espaço', icone: '⏳', desc: 'Cobrança por tempo ou taxa de uso (mesas, espaços)' },
    { id: 'taxas_torneios', nome: 'Taxas de Inscrição / Torneios', icone: '🏆', desc: 'Valores arrecadados em competições ou eventos' },
    { id: 'mensalidades', nome: 'Mensalidades / Assinaturas', icone: '💳', desc: 'Planos recorrentes de fidelidade ou membros' },
  ],
  nao_operacionais: [
    { id: 'aporte_caixa', nome: 'Aporte de Caixa / Fundo de Troco', icone: '💵', desc: 'Dinheiro inicial injetado para troco' },
    { id: 'recuperacao_credito', nome: 'Recuperação de Crédito / Fiado', icone: '🤝', desc: 'Recebimento de contas a prazo anteriores' },
    { id: 'rendimentos_outros', nome: 'Rendimentos / Outros', icone: '📈', desc: 'Outras entradas pontuais' },
  ]
};

// Formas de Liquidação (Meios de Pagamento)
const FORMAS_LIQUIDACAO = [
  { id: 'dinheiro', nome: 'Dinheiro em Espécie', icone: '💵' },
  { id: 'pix', nome: 'Pix (Imediato / Transferência)', icone: '⚡' },
  { id: 'cartao_debito', nome: 'Cartão de Débito', icone: '💳' },
  { id: 'cartao_credito', nome: 'Cartão de Crédito', icone: '💳' },
  { id: 'credito_comanda', nome: 'Crédito em Comanda / Pré-pago', icone: '🏷️' },
];

export const FinancasMobile: React.FC<FinancasMobileProps> = ({
  transacoes,
  pedidos,
  caixaAberto,
  carregando,
  onRecarregar,
  onAbrirCaixa,
  onSangria,
  onSuprimento,
  onFechamentoCego,
  saldoEsperadoGaveta
}) => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  // Pilha de Navegação Mobile
  const [subTela, setSubTela] = useState<SubTelaMobileFinance>('hub');
  const [menuDrawerAberto, setMenuDrawerAberto] = useState<boolean>(false);

  // Estado dos Fornecedores
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregandoFornecedores, setCarregandoFornecedores] = useState<boolean>(false);

  // Filtros de Período (TELA016)
  const [modalPeriodo, setModalPeriodo] = useState<boolean>(false);
  const [tipoPeriodoTab, setTipoPeriodoTab] = useState<'dia' | 'semana' | 'mes' | 'ano'>('semana');
  const [periodoPreset, setPeriodoPreset] = useState<string>('esta_semana');
  const [dataInicioFiltro, setDataInicioFiltro] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dataFimFiltro, setDataFimFiltro] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [periodoLabel, setPeriodoLabel] = useState<string>('Esta semana');

  // Filtros de Contas a Pagar (TELA002)
  const [filtroContasPagar, setFiltroContasPagar] = useState<'atrasados' | 'hoje' | 'proximos_7' | 'todos'>('atrasados');

  // Busca e Filtros Gerais
  const [buscaTermo, setBuscaTermo] = useState<string>('');

  // Modais de Apoio
  const [modalComoCalculado, setModalComoCalculado] = useState<boolean>(false); // TELA015
  const [modalCategoriaGastos, setModalCategoriaGastos] = useState<boolean>(false); // TELA010 / TELA022
  const [modalSelecionarFornecedor, setModalSelecionarFornecedor] = useState<boolean>(false); // TELA011
  const [modalRepetirSaida, setModalRepetirSaida] = useState<boolean>(false); // TELA012 / TELA023 / TELA024 / TELA025
  const [modalDuplicarSaida, setModalDuplicarSaida] = useState<boolean>(false); // TELA013
  const [modalExcluirSaida, setModalExcluirSaida] = useState<boolean>(false); // TELA014
  const [modalExcluirEntrada, setModalExcluirEntrada] = useState<boolean>(false);
  const [modalOrigemReceita, setModalOrigemReceita] = useState<boolean>(false);
  const [modalFormaLiquidacao, setModalFormaLiquidacao] = useState<boolean>(false);

  // Estados dos Formulários
  // 1. Saída (Adicionar / Editar)
  const [saidaTipoStatus, setSaidaTipoStatus] = useState<'a_pagar' | 'pago'>('a_pagar');
  const [saidaValor, setSaidaValor] = useState<string>('');
  const [saidaVencimento, setSaidaVencimento] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [saidaCategoria, setSaidaCategoria] = useState<string>('Outros');
  const [saidaNome, setSaidaNome] = useState<string>('');
  const [saidaFornecedorId, setSaidaFornecedorId] = useState<string>('');
  const [saidaPagoEm, setSaidaPagoEm] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [saidaMeioPagamento, setSaidaMeioPagamento] = useState<string>('dinheiro');
  const [saidaObservacoes, setSaidaObservacoes] = useState<string>('');
  const [saidaRepetirAtivo, setSaidaRepetirAtivo] = useState<boolean>(false);
  const [saidaRepetirTipo, setSaidaRepetirTipo] = useState<'gasto_fixo' | 'parcelas'>('gasto_fixo');
  const [saidaFrequencia, setSaidaFrequencia] = useState<string>('mensal');
  const [saidaTodoDia, setSaidaTodoDia] = useState<string>(() => String(new Date().getDate()));
  const [saidaNumParcelas, setSaidaNumParcelas] = useState<number>(3);
  const [saidaEditando, setSaidaEditando] = useState<TransacaoFinanceira | null>(null);

  // 2. Entrada (Adicionar / Editar)
  const [entradaValor, setEntradaValor] = useState<string>('');
  const [entradaRecebidoEm, setEntradaRecebidoEm] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [entradaOrigem, setEntradaOrigem] = useState<string>('Venda de Produtos / Balcão');
  const [entradaFormaLiquidacao, setEntradaFormaLiquidacao] = useState<string>('pix');
  const [entradaNome, setEntradaNome] = useState<string>('');
  const [entradaObservacoes, setEntradaObservacoes] = useState<string>('');
  const [entradaEditando, setEntradaEditando] = useState<TransacaoFinanceira | null>(null);

  // 3. Fornecedor (Adicionar / Detalhes)
  const [fornNome, setFornNome] = useState<string>('');
  const [fornDoc, setFornDoc] = useState<string>('');
  const [fornEndereco, setFornEndereco] = useState<string>('');
  const [fornTelefone, setFornTelefone] = useState<string>('');
  const [fornEmail, setFornEmail] = useState<string>('');
  const [fornObs, setFornObs] = useState<string>('');
  const [fornContatoNome, setFornContatoNome] = useState<string>('');
  const [fornContatoWhats, setFornContatoWhats] = useState<string>('');
  const [fornAtivo, setFornAtivo] = useState<boolean>(true);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);

  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagemToast, setMensagemToast] = useState<string>('');

  const exibirToast = (msg: string) => {
    setMensagemToast(msg);
    setTimeout(() => setMensagemToast(''), 3000);
  };

  // Carregar Fornecedores
  const carregarFornecedores = async () => {
    if (!loja?.id) return;
    try {
      setCarregandoFornecedores(true);
      const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .eq('loja_id', loja.id)
        .order('nome', { ascending: true });
      if (!error && data) {
        setFornecedores(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCarregandoFornecedores(false);
    }
  };

  useEffect(() => {
    carregarFornecedores();
  }, [loja?.id]);

  // Formatação de Moeda
  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(val || 0);
  };

  // Unificação de Entradas e Vendas
  const todasEntradas = useMemo(() => {
    const list: Array<{
      id: string;
      tipoOrigem: 'pdv' | 'manual';
      titulo: string;
      subtitulo: string;
      valor: number;
      data: string;
      formaPagamento?: string;
      transacaoOriginal?: TransacaoFinanceira;
      pedidoOriginal?: Pedido;
    }> = [];

    const pedidosIds = new Set<string>();
    const pedidosNumeros = new Set<string>();

    // 1. Vendas de Pedidos
    (pedidos || []).forEach(ped => {
      if (ped.id) pedidosIds.add(ped.id.toLowerCase());
      if (ped.numero_pedido != null) pedidosNumeros.add(String(ped.numero_pedido));

      if (ped.status === 'cancelado') return;
      const dataIso = ped.data_venda || ped.criado_em || '';
      const dataFormatada = dataIso.split('T')[0];
      list.push({
        id: 'ped_' + ped.id,
        tipoOrigem: 'pdv',
        titulo: `Vendas (${ped.itens?.length || 1})`,
        subtitulo: ped.cliente?.nome ? `Cliente: ${ped.cliente.nome}` : 'Venda de Balcão / PDV',
        valor: Number(ped.valor_total) || 0,
        data: dataFormatada,
        formaPagamento: ped.pagamentos?.[0]?.forma_pagamento?.nome || 'Diversos',
        pedidoOriginal: ped
      });
    });

    // 2. Entradas Manuais (ignorar as vinculadas a pedidos para evitar duplicações)
    const transacoesProcessadas = new Set<string>();
    (transacoes || [])
      .filter(t => t.tipo === 'ENTRADA')
      .forEach(tr => {
        if (tr.id && transacoesProcessadas.has(tr.id)) return;
        if (tr.id) transacoesProcessadas.add(tr.id);

        if (tr.pedido_id && pedidosIds.has(tr.pedido_id.toLowerCase())) return;

        const desc = (tr.descricao || '').trim();
        const uuidMatch = desc.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch && uuidMatch[0] && pedidosIds.has(uuidMatch[0].toLowerCase())) return;

        const numMatch = desc.match(/(?:recebimento\s+)?(?:pedido|venda)\s*(?:#|\bn[ºo]\b)?\s*(\d+)/i);
        if (numMatch && numMatch[1] && pedidosNumeros.has(String(Number(numMatch[1])))) return;

        if ((tr.categoria === 'Venda' || tr.categoria === 'Venda Balcão / PDV') && (tr.pedido_id || uuidMatch || numMatch)) return;

        const dataIso = tr.data_pagamento || tr.data_vencimento || tr.criado_em || '';
        const dataFormatada = dataIso.split('T')[0];
        list.push({
          id: tr.id,
          tipoOrigem: 'manual',
          titulo: tr.descricao || 'Entrada manual',
          subtitulo: tr.origem_receita || tr.categoria || 'Outros',
          valor: Number(tr.valor) || 0,
          data: dataFormatada,
          formaPagamento: tr.forma_pagamento || 'Dinheiro',
          transacaoOriginal: tr
        });
      });

    return list.sort((a, b) => b.data.localeCompare(a.data));
  }, [pedidos, transacoes]);

  // Lista de Saídas
  const todasSaidas = useMemo(() => {
    const ids = new Set<string>();
    return (transacoes || [])
      .filter(t => {
        if (t.tipo !== 'SAIDA') return false;
        if (t.id && ids.has(t.id)) return false;
        if (t.id) ids.add(t.id);
        return true;
      })
      .sort((a, b) => (b.data_vencimento || '').localeCompare(a.data_vencimento || ''));
  }, [transacoes]);

  // Contas a Pagar Filtradas (TELA002)
  const hojeStr = new Date().toISOString().split('T')[0];
  const em7Dias = new Date();
  em7Dias.setDate(em7Dias.getDate() + 7);
  const em7DiasStr = em7Dias.toISOString().split('T')[0];

  const saidasAtrasadas = useMemo(() => {
    return todasSaidas.filter(s => s.status === 'pendente' && s.data_vencimento < hojeStr);
  }, [todasSaidas, hojeStr]);

  const saidasHoje = useMemo(() => {
    return todasSaidas.filter(s => s.status === 'pendente' && s.data_vencimento === hojeStr);
  }, [todasSaidas, hojeStr]);

  const saidasProximos7Dias = useMemo(() => {
    return todasSaidas.filter(s => s.status === 'pendente' && s.data_vencimento >= hojeStr && s.data_vencimento <= em7DiasStr);
  }, [todasSaidas, hojeStr, em7DiasStr]);

  const contasPagarExibicao = useMemo(() => {
    switch (filtroContasPagar) {
      case 'atrasados':
        return saidasAtrasadas;
      case 'hoje':
        return saidasHoje;
      case 'proximos_7':
        return saidasProximos7Dias;
      case 'todos':
      default:
        return todasSaidas.filter(s => s.status === 'pendente');
    }
  }, [filtroContasPagar, saidasAtrasadas, saidasHoje, saidasProximos7Dias, todasSaidas]);

  const totalAtrasadas = saidasAtrasadas.reduce((acc, s) => acc + Number(s.valor || 0), 0);

  // Cálculos do Fluxo de Caixa (TELA003)
  const totalEntradasCalculado = useMemo(() => {
    return todasEntradas.reduce((acc, e) => acc + e.valor, 0);
  }, [todasEntradas]);

  const totalSaidasPagas = useMemo(() => {
    return todasSaidas
      .filter(s => s.status === 'pago')
      .reduce((acc, s) => acc + Number(s.valor || 0), 0);
  }, [todasSaidas]);

  const saldoLiquidoFluxo = totalEntradasCalculado - totalSaidasPagas;

  // Breakdown por Meio de Pagamento / Liquidação no Fluxo
  const breakdownLiquidacao = useMemo(() => {
    const map: { [key: string]: { count: number; total: number } } = {};
    todasEntradas.forEach(e => {
      const forma = e.formaPagamento || 'Outros';
      if (!map[forma]) map[forma] = { count: 0, total: 0 };
      map[forma].count += 1;
      map[forma].total += e.valor;
    });
    return Object.entries(map).map(([forma, data]) => ({
      forma,
      count: data.count,
      total: data.total
    }));
  }, [todasEntradas]);

  // Handler: Salvar Saída (TELA007 / TELA008)
  const salvarSaida = async () => {
    if (!loja?.id || !saidaNome.trim() || !saidaValor) {
      exibirToast('Preencha o nome e o valor da saída');
      return;
    }

    try {
      setSalvando(true);
      const valNum = parseFloat(saidaValor.replace(',', '.')) || 0;
      if (valNum <= 0) {
        exibirToast('Informe um valor válido');
        return;
      }

      const payload: any = {
        loja_id: loja.id,
        tipo: 'SAIDA',
        categoria: saidaCategoria,
        descricao: saidaNome.trim(),
        valor: valNum,
        data_vencimento: saidaVencimento,
        data_pagamento: saidaTipoStatus === 'pago' ? (saidaPagoEm ? new Date(saidaPagoEm).toISOString() : new Date().toISOString()) : null,
        status: saidaTipoStatus === 'pago' ? 'pago' : 'pendente',
        eh_recorrente: saidaRepetirAtivo,
        frequencia_recorrencia: saidaRepetirAtivo ? (saidaFrequencia as any) : null,
        dia_vencimento_recorrencia: saidaRepetirAtivo ? parseInt(saidaTodoDia) || 1 : null,
        fornecedor_id: saidaFornecedorId || null,
        forma_pagamento: saidaTipoStatus === 'pago' ? saidaMeioPagamento : 'dinheiro',
        observacoes: saidaObservacoes.trim() || null,
        tipo_recorrencia: saidaRepetirAtivo ? saidaRepetirTipo : 'gasto_fixo',
        parcelas_total: saidaRepetirTipo === 'parcelas' ? saidaNumParcelas : 1,
        parcela_numero: 1
      };

      if (saidaEditando) {
        const { error } = await supabase
          .from('transacoes_financeiras')
          .update(payload)
          .eq('id', saidaEditando.id);
        if (error) throw error;
        exibirToast('Saída atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('transacoes_financeiras')
          .insert([payload]);
        if (error) throw error;
        exibirToast('Saída adicionada com sucesso!');
      }

      await onRecarregar();
      setSubTela(saidaTipoStatus === 'pago' ? 'saidas' : 'contas_pagar');
    } catch (e: any) {
      console.error(e);
      exibirToast('Erro ao salvar saída: ' + (e.message || 'Tente novamente'));
    } finally {
      setSalvando(false);
    }
  };

  // Handler: Duplicar Saída (TELA013)
  const confirmarDuplicarSaida = async () => {
    if (!saidaEditando || !loja?.id) return;
    try {
      setSalvando(true);
      const { id, criado_em, atualizado_em, ...rest } = saidaEditando;
      const payload = {
        ...rest,
        descricao: `${saidaEditando.descricao} (Cópia)`,
        status: 'pendente'
      };
      const { error } = await supabase.from('transacoes_financeiras').insert([payload]);
      if (error) throw error;
      exibirToast('Saída duplicada com sucesso!');
      setModalDuplicarSaida(false);
      await onRecarregar();
      setSubTela('saidas');
    } catch (e: any) {
      console.error(e);
      exibirToast('Erro ao duplicar saída');
    } finally {
      setSalvando(false);
    }
  };

  // Handler: Excluir Saída (TELA014)
  const confirmarExcluirSaida = async () => {
    if (!saidaEditando || !loja?.id) return;
    try {
      setSalvando(true);
      const { error } = await supabase
        .from('transacoes_financeiras')
        .delete()
        .eq('id', saidaEditando.id);
      if (error) throw error;
      exibirToast('Saída excluída com sucesso!');
      setModalExcluirSaida(false);
      await onRecarregar();
      setSubTela('saidas');
    } catch (e: any) {
      console.error(e);
      exibirToast('Erro ao excluir saída');
    } finally {
      setSalvando(false);
    }
  };

  // Handler: Salvar Entrada (TELA026 / TELA027)
  const salvarEntrada = async () => {
    if (!loja?.id || !entradaNome.trim() || !entradaValor) {
      exibirToast('Preencha o nome e o valor da entrada');
      return;
    }

    try {
      setSalvando(true);
      const valNum = parseFloat(entradaValor.replace(',', '.')) || 0;
      if (valNum <= 0) {
        exibirToast('Informe um valor válido');
        return;
      }

      const payload: any = {
        loja_id: loja.id,
        tipo: 'ENTRADA',
        categoria: entradaOrigem,
        origem_receita: entradaOrigem,
        descricao: entradaNome.trim(),
        valor: valNum,
        data_vencimento: entradaRecebidoEm,
        data_pagamento: new Date(entradaRecebidoEm).toISOString(),
        status: 'pago',
        forma_pagamento: entradaFormaLiquidacao,
        observacoes: entradaObservacoes.trim() || null
      };

      if (entradaEditando) {
        const { error } = await supabase
          .from('transacoes_financeiras')
          .update(payload)
          .eq('id', entradaEditando.id);
        if (error) throw error;
        exibirToast('Entrada atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('transacoes_financeiras')
          .insert([payload]);
        if (error) throw error;
        exibirToast('Entrada adicionada com sucesso!');
      }

      await onRecarregar();
      setSubTela('entradas');
    } catch (e: any) {
      console.error(e);
      exibirToast('Erro ao salvar entrada: ' + (e.message || 'Tente novamente'));
    } finally {
      setSalvando(false);
    }
  };

  // Handler: Excluir Entrada (TELA027)
  const confirmarExcluirEntrada = async () => {
    if (!entradaEditando || !loja?.id) return;
    try {
      setSalvando(true);
      const { error } = await supabase
        .from('transacoes_financeiras')
        .delete()
        .eq('id', entradaEditando.id);
      if (error) throw error;
      exibirToast('Entrada excluída com sucesso!');
      setModalExcluirEntrada(false);
      await onRecarregar();
      setSubTela('entradas');
    } catch (e: any) {
      console.error(e);
      exibirToast('Erro ao excluir entrada');
    } finally {
      setSalvando(false);
    }
  };

  // Handler: Salvar Fornecedor (TELA028 / TELA029)
  const salvarFornecedor = async () => {
    if (!loja?.id || !fornNome.trim()) {
      exibirToast('Nome ou Razão Social é obrigatório');
      return;
    }

    try {
      setSalvando(true);
      const payload = {
        loja_id: loja.id,
        nome: fornNome.trim(),
        numero_documento: fornDoc.trim() || null,
        endereco: fornEndereco.trim() || null,
        telefone: fornTelefone.trim() || null,
        email: fornEmail.trim() || null,
        observacoes: fornObs.trim() || null,
        pessoa_contato: fornContatoNome.trim() || null,
        whatsapp: fornContatoWhats.trim() || null,
        ativo: fornAtivo
      };

      if (fornecedorSelecionado) {
        const { error } = await supabase
          .from('fornecedores')
          .update(payload)
          .eq('id', fornecedorSelecionado.id);
        if (error) throw error;
        exibirToast('Fornecedor atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('fornecedores')
          .insert([payload]);
        if (error) throw error;
        exibirToast('Fornecedor cadastrado com sucesso!');
      }

      await carregarFornecedores();
      setSubTela('fornecedores');
    } catch (e: any) {
      console.error(e);
      exibirToast('Erro ao salvar fornecedor');
    } finally {
      setSalvando(false);
    }
  };

  // Helper de Abertura de Nova Saída
  const abrirNovaSaida = (tipo: 'a_pagar' | 'pago' = 'a_pagar') => {
    setSaidaEditando(null);
    setSaidaTipoStatus(tipo);
    setSaidaValor('');
    setSaidaVencimento(new Date().toISOString().split('T')[0]);
    setSaidaCategoria('Outros');
    setSaidaNome('');
    setSaidaFornecedorId('');
    setSaidaPagoEm(new Date().toISOString().split('T')[0]);
    setSaidaMeioPagamento('dinheiro');
    setSaidaObservacoes('');
    setSaidaRepetirAtivo(false);
    setSubTela('adicionar_saida');
  };

  // Helper de Edição de Saída (TELA008)
  const abrirEditarSaida = (saida: TransacaoFinanceira) => {
    setSaidaEditando(saida);
    setSaidaTipoStatus(saida.status === 'pago' ? 'pago' : 'a_pagar');
    setSaidaValor(String(saida.valor || ''));
    setSaidaVencimento(saida.data_vencimento || new Date().toISOString().split('T')[0]);
    setSaidaCategoria(saida.categoria || 'Outros');
    setSaidaNome(saida.descricao || '');
    setSaidaFornecedorId(saida.fornecedor_id || '');
    setSaidaPagoEm(saida.data_pagamento ? saida.data_pagamento.split('T')[0] : new Date().toISOString().split('T')[0]);
    setSaidaMeioPagamento(saida.forma_pagamento || 'dinheiro');
    setSaidaObservacoes(saida.observacoes || '');
    setSaidaRepetirAtivo(saida.eh_recorrente || false);
    setSaidaRepetirTipo((saida.tipo_recorrencia as any) || 'gasto_fixo');
    setSaidaFrequencia(saida.frequencia_recorrencia || 'mensal');
    setSaidaTodoDia(String(saida.dia_vencimento_recorrencia || new Date().getDate()));
    setSubTela('editar_saida');
  };

  // Helper de Abertura de Nova Entrada (TELA026)
  const abrirNovaEntrada = () => {
    setEntradaEditando(null);
    setEntradaValor('');
    setEntradaRecebidoEm(new Date().toISOString().split('T')[0]);
    setEntradaOrigem('Venda de Produtos / Balcão');
    setEntradaFormaLiquidacao('pix');
    setEntradaNome('');
    setEntradaObservacoes('');
    setSubTela('adicionar_entrada');
  };

  // Helper de Edição de Entrada (TELA027)
  const abrirEditarEntrada = (tr: TransacaoFinanceira) => {
    setEntradaEditando(tr);
    setEntradaValor(String(tr.valor || ''));
    setEntradaRecebidoEm(tr.data_vencimento || new Date().toISOString().split('T')[0]);
    setEntradaOrigem(tr.origem_receita || tr.categoria || 'Venda de Produtos / Balcão');
    setEntradaFormaLiquidacao(tr.forma_pagamento || 'pix');
    setEntradaNome(tr.descricao || '');
    setEntradaObservacoes(tr.observacoes || '');
    setSubTela('editar_entrada');
  };

  // Helper de Abertura de Novo Fornecedor (TELA028)
  const abrirNovoFornecedor = () => {
    setFornecedorSelecionado(null);
    setFornNome('');
    setFornDoc('');
    setFornEndereco('');
    setFornTelefone('');
    setFornEmail('');
    setFornObs('');
    setFornContatoNome('');
    setFornContatoWhats('');
    setFornAtivo(true);
    setSubTela('adicionar_fornecedor');
  };

  // Helper de Detalhes do Fornecedor (TELA029)
  const abrirDetalhesFornecedor = (forn: Fornecedor) => {
    setFornecedorSelecionado(forn);
    setFornNome(forn.nome || '');
    setFornDoc(forn.numero_documento || '');
    setFornEndereco(forn.endereco || '');
    setFornTelefone(forn.telefone || '');
    setFornEmail(forn.email || '');
    setFornObs(forn.observacoes || '');
    setFornContatoNome(forn.pessoa_contato || '');
    setFornContatoWhats(forn.whatsapp || '');
    setFornAtivo(forn.ativo ?? true);
    setSubTela('detalhes_fornecedor');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-slate-900 font-sans select-none">
      {/* TOAST DE NOTIFICAÇÃO */}
      {mensagemToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{mensagemToast}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TELA 001: HUB / MENU PRINCIPAL DE FINANÇAS MOBILE                      */}
      {/* ========================================================================= */}
      {subTela === 'hub' && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in bg-white">
          {/* Header Superior Mobile (Padrão Pedidos) */}
          <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                title="Voltar"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
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
              <h1 className="font-black text-base text-slate-800 tracking-tight">Finanças & Caixa</h1>
            </div>

            <button
              type="button"
              onClick={() => abrirNovaSaida('a_pagar')}
              className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center font-bold shadow-sm transition active:scale-95 cursor-pointer"
              title="Nova saída"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Conteúdo: Seção Finanças e Grid de Botões */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50">
            {/* CARD FRENTE DE CAIXA / TURNO */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                    caixaAberto ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-xs text-slate-800">
                      Frente de Caixa
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {caixaAberto ? `Turno ${caixaAberto.turno || '1'} • Caixa ativo` : 'Nenhum turno aberto no momento'}
                    </p>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                  caixaAberto
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {caixaAberto ? '● ABERTO' : '● FECHADO'}
                </span>
              </div>

              {caixaAberto ? (
                <div className="space-y-3 pt-1 border-t border-slate-100">
                  <div className="flex items-baseline justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500">Saldo em Dinheiro Esperado</span>
                    <span className="text-sm font-black text-slate-900">
                      R$ {Number(saldoEsperadoGaveta !== undefined ? saldoEsperadoGaveta : caixaAberto.saldo_inicial).toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={onSangria}
                      className="py-2.5 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] flex flex-col items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs"
                    >
                      <ArrowUp className="w-4 h-4 text-rose-600" />
                      <span>Sangria</span>
                    </button>

                    <button
                      type="button"
                      onClick={onSuprimento}
                      className="py-2.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] flex flex-col items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs"
                    >
                      <ArrowDown className="w-4 h-4 text-emerald-600" />
                      <span>Suprimento</span>
                    </button>

                    <button
                      type="button"
                      onClick={onFechamentoCego}
                      className="py-2.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-[11px] flex flex-col items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs"
                    >
                      <LogOut className="w-4 h-4 text-amber-400" />
                      <span>Fechar</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onAbrirCaixa}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>Abrir Novo Turno de Caixa</span>
                  </button>
                </div>
              )}
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 block mb-3">
                Módulos Financeiros
              </span>

              <div className="grid grid-cols-2 gap-3">
                {/* 1. Contas a pagar */}
                <button
                  type="button"
                  onClick={() => setSubTela('contas_pagar')}
                  className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/40 hover:bg-slate-50 active:scale-98 flex flex-col items-start gap-3 transition cursor-pointer text-left relative group shadow-xs"
                >
                  {saidasAtrasadas.length > 0 && (
                    <span className="absolute top-3 right-3 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
                      {saidasAtrasadas.length}
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center group-hover:scale-105 transition">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-600 transition">
                    Contas a pagar
                  </span>
                </button>

                {/* 2. Fluxo de caixa */}
                <button
                  type="button"
                  onClick={() => setSubTela('fluxo_caixa')}
                  className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/40 hover:bg-slate-50 active:scale-98 flex flex-col items-start gap-3 transition cursor-pointer text-left group shadow-xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center group-hover:scale-105 transition">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-600 transition">
                    Fluxo de caixa
                  </span>
                </button>

                {/* 3. Entradas */}
                <button
                  type="button"
                  onClick={() => setSubTela('entradas')}
                  className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/40 hover:bg-slate-50 active:scale-98 flex flex-col items-start gap-3 transition cursor-pointer text-left group shadow-xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center group-hover:scale-105 transition">
                    <ArrowDownLeft className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-600 transition">
                    Entradas
                  </span>
                </button>

                {/* 4. Saídas */}
                <button
                  type="button"
                  onClick={() => setSubTela('saidas')}
                  className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/40 hover:bg-slate-50 active:scale-98 flex flex-col items-start gap-3 transition cursor-pointer text-left group shadow-xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center group-hover:scale-105 transition">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-xs text-slate-800 group-hover:text-rose-600 transition">
                    Saídas
                  </span>
                </button>

                {/* 5. Fornecedores */}
                <button
                  type="button"
                  onClick={() => setSubTela('fornecedores')}
                  className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/40 hover:bg-slate-50 active:scale-98 flex flex-col items-start gap-3 transition cursor-pointer text-left group shadow-xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center group-hover:scale-105 transition">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-600 transition">
                    Fornecedores
                  </span>
                </button>

                {/* 6. Vendas */}
                <button
                  type="button"
                  onClick={() => navigate('/sales')}
                  className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/40 hover:bg-slate-50 active:scale-98 flex flex-col items-start gap-3 transition cursor-pointer text-left group shadow-xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center group-hover:scale-105 transition">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-600 transition">
                    Vendas
                  </span>
                </button>
              </div>
            </div>

            {/* 7. Card Banner Vendas e Catálogo */}
            <div
              onClick={() => navigate('/catalog-config')}
              className="p-4 rounded-3xl bg-white border border-slate-200 hover:border-emerald-500/40 transition cursor-pointer flex items-center gap-3.5 shadow-xs"
            >
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-xs text-slate-100">Vendas e catálogo</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                  Controle suas vendas, estoque e crie um catálogo online para sua loja
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TELA 002: CONTAS A PAGAR                                              */}
      {/* ========================================================================= */}
      {subTela === 'contas_pagar' && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">Contas a pagar</h2>
            </div>

            <button
              type="button"
              onClick={() => abrirNovaSaida('a_pagar')}
              className="w-8 h-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Card Principal: Total Atrasados */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-1 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Atrasados</span>
              <div className="text-2xl font-black text-slate-100 tracking-tight">
                {formatarMoeda(totalAtrasadas)}
              </div>
              <span className="text-[11px] text-slate-400 block">
                em {saidasAtrasadas.length} {saidasAtrasadas.length === 1 ? 'saída' : 'saídas'}
              </span>
            </div>

            {/* Segmented Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto no-scrollbar">
              {[
                { id: 'atrasados', label: `ATRASADOS (${saidasAtrasadas.length})` },
                { id: 'hoje', label: 'HOJE' },
                { id: 'proximos_7', label: 'PRÓXIMOS 7 DIAS' },
                { id: 'todos', label: 'TODOS' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFiltroContasPagar(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition shrink-0 ${
                    filtroContasPagar === tab.id
                      ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Lista de Saídas a Pagar */}
            <div className="space-y-2 pt-1">
              {contasPagarExibicao.length === 0 ? (
                <div className="p-8 rounded-3xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto" />
                  <p className="text-xs font-bold text-slate-300">Nenhuma conta pendente neste período</p>
                  <p className="text-[11px] text-slate-500">Tudo em dia com suas contas a pagar.</p>
                </div>
              ) : (
                contasPagarExibicao.map(saida => {
                  const forn = fornecedores.find(f => f.id === saida.fornecedor_id);
                  return (
                    <div
                      key={saida.id}
                      onClick={() => abrirEditarSaida(saida)}
                      className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 active:bg-slate-850 transition cursor-pointer flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-lg shrink-0">
                          🏠
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-100 truncate">
                              {saida.descricao}
                            </span>
                            {saida.eh_recorrente && (
                              <Repeat className="w-3 h-3 text-slate-400 shrink-0" />
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block truncate">
                            {forn?.nome || saida.categoria || 'Gasto Operacional'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-black text-xs text-rose-400">
                          {formatarMoeda(saida.valor)}
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {saida.data_vencimento ? saida.data_vencimento.split('-').reverse().join('/') : ''}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TELA 003: FLUXO DE CAIXA                                              */}
      {/* ========================================================================= */}
      {subTela === 'fluxo_caixa' && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">Fluxo de caixa</h2>
            </div>

            <button
              type="button"
              onClick={() => setModalComoCalculado(true)}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-emerald-400"
              title="Como é calculado?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {/* Seletor de Período Superior */}
          <div
            onClick={() => setModalPeriodo(true)}
            className="px-4 py-2.5 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-300 cursor-pointer hover:bg-slate-850 transition shrink-0"
          >
            <div className="flex items-center gap-2">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
              <span className="font-bold">{periodoLabel}</span>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
            <Calendar className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Card Saldo Líquido */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 text-center shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Fluxo de caixa líquido</span>
              <div className="text-3xl font-black text-slate-100 tracking-tight">
                {formatarMoeda(saldoLiquidoFluxo)}
              </div>
              <button
                type="button"
                onClick={() => setModalComoCalculado(true)}
                className="text-[11px] font-bold text-emerald-400 hover:underline"
              >
                Entenda, como este valor é calculado
              </button>

              {/* Progress Bar de Entradas vs Saídas */}
              <div className="pt-2 space-y-1.5">
                <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${totalEntradasCalculado + totalSaidasPagas > 0 ? (totalEntradasCalculado / (totalEntradasCalculado + totalSaidasPagas)) * 100 : 50}%`
                    }}
                  />
                  <div
                    className="h-full bg-rose-500"
                    style={{
                      width: `${totalEntradasCalculado + totalSaidasPagas > 0 ? (totalSaidasPagas / (totalEntradasCalculado + totalSaidasPagas)) * 100 : 50}%`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Boxes Entradas x Saídas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                <span className="text-[10px] font-black uppercase text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> ENTRADAS
                </span>
                <div className="font-black text-sm text-emerald-300">
                  {formatarMoeda(totalEntradasCalculado)}
                </div>
              </div>

              <div
                onClick={() => setSubTela('saidas')}
                className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-1 cursor-pointer hover:bg-rose-500/15 transition"
              >
                <span className="text-[10px] font-black uppercase text-rose-400 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" /> SAÍDAS
                </span>
                <div className="font-black text-sm text-rose-300">
                  - {formatarMoeda(totalSaidasPagas)}
                </div>
              </div>
            </div>

            {/* Seção ENTRADAS NO PDV / BREAKDOWN */}
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
                Entradas por Meio de Pagamento
              </span>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800/80">
                {breakdownLiquidacao.map((item, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      {item.forma} ({item.count})
                    </span>
                    <span className="text-xs font-black text-slate-100">
                      {formatarMoeda(item.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

            {/* Bottom Floating Bar */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSubTela('entradas')}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5"
              >
                <span>→≡ Ver todas as entradas</span>
              </button>

              <button
                type="button"
                onClick={abrirNovaEntrada}
                className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Entrada</span>
              </button>
            </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TELA 004 & TELA 018: ENTRADAS                                         */}
      {/* ========================================================================= */}
      {subTela === 'entradas' && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">Entradas</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalPeriodo(true)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300"
              >
                <Filter className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={abrirNovaEntrada}
                className="w-8 h-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-md shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lista de Entradas Agrupadas por Data */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {todasEntradas.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2">
                <ArrowDownLeft className="w-8 h-8 text-emerald-400/60 mx-auto" />
                <p className="text-xs font-bold text-slate-300">Nenhuma entrada registrada</p>
                <p className="text-[11px] text-slate-500">Adicione novas entradas manuais ou registre vendas no PDV.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todasEntradas.map(item => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.tipoOrigem === 'manual' && item.transacaoOriginal) {
                        abrirEditarEntrada(item.transacaoOriginal);
                      } else {
                        exibirToast('Vendas do PDV são registradas automaticamente e não podem ser editadas diretamente');
                      }
                    }}
                    className={`p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 transition shadow-sm ${
                      item.tipoOrigem === 'manual' ? 'hover:border-slate-700 cursor-pointer active:bg-slate-850' : 'opacity-90'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 border ${
                        item.tipoOrigem === 'manual'
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      }`}>
                        {item.tipoOrigem === 'manual' ? '📁' : '📱'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-100 truncate block">
                          {item.titulo}
                        </span>
                        <span className="text-[11px] text-slate-400 block truncate">
                          {item.subtitulo}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-black text-xs text-emerald-400">
                        {formatarMoeda(item.valor)}
                      </div>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {item.data.split('-').reverse().join('/')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Navigator Bar */}
          <div
            onClick={() => setModalPeriodo(true)}
            className="p-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300 cursor-pointer hover:bg-slate-850 transition shrink-0"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
            <span className="font-bold">{periodoLabel}</span>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. TELA 005 & TELA 017: SAÍDAS                                           */}
      {/* ========================================================================= */}
      {subTela === 'saidas' && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">Saídas</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalPeriodo(true)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300"
              >
                <Filter className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => abrirNovaSaida('pago')}
                className="w-8 h-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-md shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-4 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Nome, fornecedor ou categoria"
                value={buscaTermo}
                onChange={e => setBuscaTermo(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Lista de Saídas */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {todasSaidas.length === 0 ? (
              /* TELA 017: Empty State Ilustrado */
              <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-4 my-auto">
                <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 text-3xl flex items-center justify-center mx-auto shadow-inner">
                  💸
                </div>
                <div className="space-y-1">
                  <h3 className="font-extrabold text-sm text-slate-100">Registre suas saídas</h3>
                  <p className="text-xs text-slate-400">Mantenha o controle financeiro do seu negócio</p>
                </div>
                <button
                  type="button"
                  onClick={() => abrirNovaSaida('pago')}
                  className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20"
                >
                  Adicionar saída
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {todasSaidas
                  .filter(s => {
                    if (!buscaTermo.trim()) return true;
                    const b = buscaTermo.toLowerCase();
                    return (
                      s.descricao?.toLowerCase().includes(b) ||
                      s.categoria?.toLowerCase().includes(b) ||
                      fornecedores.find(f => f.id === s.fornecedor_id)?.nome?.toLowerCase().includes(b)
                    );
                  })
                  .map(saida => {
                    const forn = fornecedores.find(f => f.id === saida.fornecedor_id);
                    return (
                      <div
                        key={saida.id}
                        onClick={() => abrirEditarSaida(saida)}
                        className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 active:bg-slate-850 transition cursor-pointer flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-lg shrink-0">
                            🏠
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-100 truncate">
                                {saida.descricao}
                              </span>
                              {saida.eh_recorrente && (
                                <Repeat className="w-3 h-3 text-slate-400 shrink-0" />
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 block truncate">
                              {forn?.nome || saida.categoria || 'Aluguel'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-black text-xs text-rose-400">
                            {formatarMoeda(saida.valor)}
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            {saida.data_vencimento ? saida.data_vencimento.split('-').reverse().join('/') : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Bottom Navigator Bar */}
          <div
            onClick={() => setModalPeriodo(true)}
            className="p-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300 cursor-pointer hover:bg-slate-850 transition shrink-0"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
            <div className="text-center font-bold">
              <span>{periodoLabel}</span>
              <span className="text-[10px] text-slate-500 block">
                {formatarMoeda(totalSaidasPagas)} em {todasSaidas.length} saídas
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. TELA 006: FORNECEDORES                                                */}
      {/* ========================================================================= */}
      {subTela === 'fornecedores' && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">Fornecedores</h2>
            </div>

            <button
              type="button"
              onClick={abrirNovoFornecedor}
              className="w-8 h-8 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="px-4 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Nome do fornecedor"
                value={buscaTermo}
                onChange={e => setBuscaTermo(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Alphabetical List of Suppliers */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {fornecedores.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2">
                <Building2 className="w-8 h-8 text-emerald-400/60 mx-auto" />
                <p className="text-xs font-bold text-slate-300">Nenhum fornecedor cadastrado</p>
                <p className="text-[11px] text-slate-500">Cadastre seus parceiros e fornecedores de insumos.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {fornecedores
                  .filter(f => !buscaTermo.trim() || f.nome.toLowerCase().includes(buscaTermo.toLowerCase()))
                  .map(forn => (
                    <div
                      key={forn.id}
                      onClick={() => abrirDetalhesFornecedor(forn)}
                      className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 active:bg-slate-850 transition cursor-pointer flex items-center justify-between shadow-sm"
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold text-xs text-slate-100 block">
                          {forn.nome}
                        </span>
                        {forn.pessoa_contato && (
                          <span className="text-[11px] text-slate-400 block">
                            Contato: {forn.pessoa_contato}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. TELA 007 / 009 / 020 / 021 / 008: FORMULÁRIO DE SAÍDA                   */}
      {/* ========================================================================= */}
      {(subTela === 'adicionar_saida' || subTela === 'editar_saida') && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('saidas')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">
                {subTela === 'editar_saida' ? 'Editar saída' : 'Adicionar saída'}
              </h2>
            </div>

            {subTela === 'editar_saida' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalDuplicarSaida(true)}
                  className="p-2 rounded-xl bg-slate-800/80 text-slate-300 hover:text-emerald-400"
                  title="Duplicar saída"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setModalExcluirSaida(true)}
                  className="p-2 rounded-xl bg-slate-800/80 text-rose-400 hover:bg-rose-500/10"
                  title="Excluir saída"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Top Toggle: A pagar | Pago */}
            <div className="p-1 bg-slate-900 border border-slate-800 rounded-2xl flex">
              <button
                type="button"
                onClick={() => setSaidaTipoStatus('a_pagar')}
                className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition ${
                  saidaTipoStatus === 'a_pagar'
                    ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700'
                    : 'text-slate-400'
                }`}
              >
                A pagar
              </button>
              <button
                type="button"
                onClick={() => setSaidaTipoStatus('pago')}
                className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
                  saidaTipoStatus === 'pago'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400'
                }`}
              >
                <Check className="w-3.5 h-3.5" /> Pago
              </button>
            </div>

            {/* Big Value Input */}
            <div className="space-y-1 text-center py-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Valor</span>
              <div className="relative inline-flex items-center justify-center">
                <span className="text-xl font-black text-emerald-400 mr-1.5">R$</span>
                <input
                  type="text"
                  placeholder="0,00"
                  value={saidaValor}
                  onChange={e => setSaidaValor(e.target.value)}
                  className="text-3xl font-black text-slate-100 bg-transparent border-b-2 border-slate-700 focus:border-emerald-500 focus:outline-none text-center w-48 tracking-tight"
                />
              </div>
            </div>

            {/* Vencimento & Categoria Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Vencimento
                </span>
                <input
                  type="date"
                  value={saidaVencimento}
                  onChange={e => setSaidaVencimento(e.target.value)}
                  className="w-full bg-transparent text-xs font-bold text-slate-200 focus:outline-none"
                />
              </div>

              <div
                onClick={() => setModalCategoriaGastos(true)}
                className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 cursor-pointer hover:border-slate-700"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Categoria
                </span>
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span className="truncate">{saidaCategoria}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </div>
              </div>
            </div>

            {/* Mais Informações Section */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-black text-slate-300 block">Mais informações</span>

              {/* Nome da saída */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Nome da saída*</label>
                <input
                  type="text"
                  placeholder="Ex: Aluguel da loja, Compra de bebidas"
                  value={saidaNome}
                  onChange={e => setSaidaNome(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Fornecedor */}
              <div
                onClick={() => setModalSelecionarFornecedor(true)}
                className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Fornecedor</span>
                  <span className="text-xs font-bold text-slate-200 block mt-0.5">
                    {fornecedores.find(f => f.id === saidaFornecedorId)?.nome || 'Selecionar fornecedor'}
                  </span>
                </div>
                {saidaFornecedorId ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSaidaFornecedorId('');
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </div>

              {/* Se Pago: Data de Pagamento e Meio */}
              {saidaTipoStatus === 'pago' && (
                <>
                  <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Pago em</span>
                    <input
                      type="date"
                      value={saidaPagoEm}
                      onChange={e => setSaidaPagoEm(e.target.value)}
                      className="w-full bg-transparent text-xs font-bold text-slate-200 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400">Meio de Pagamento da Despesa</label>
                    <div className="grid grid-cols-2 gap-2">
                      {FORMAS_LIQUIDACAO.map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setSaidaMeioPagamento(f.id)}
                          className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 transition text-left ${
                            saidaMeioPagamento === f.id
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <span>{f.icone}</span>
                          <span className="truncate">{f.nome.split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Observações */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Observações</label>
                <input
                  type="text"
                  placeholder="Informações complementares (opcional)"
                  value={saidaObservacoes}
                  onChange={e => setSaidaObservacoes(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Repetir Saída (TELA012 / TELA023 / TELA024 / TELA025) */}
              <div
                onClick={() => setModalRepetirSaida(true)}
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700"
              >
                <div>
                  <span className="font-bold text-xs text-slate-100 block">Repetir saída</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {saidaRepetirAtivo
                      ? `${saidaRepetirTipo === 'gasto_fixo' ? 'Gasto Fixo' : 'Parcelas'} (${saidaFrequencia}, dia ${saidaTodoDia})`
                      : 'Não recorrente'}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>

          {/* Action Button Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/90 backdrop-blur shrink-0">
            <button
              type="button"
              disabled={salvando}
              onClick={salvarSaida}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 transition flex items-center justify-center gap-2"
            >
              {salvando ? 'Salvando...' : subTela === 'editar_saida' ? 'Salvar alterações' : 'Adicionar saída'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. TELA 019 / 026 / 027: FORMULÁRIO DE ENTRADA                            */}
      {/* ========================================================================= */}
      {(subTela === 'adicionar_entrada' || subTela === 'editar_entrada') && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('entradas')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">
                {subTela === 'editar_entrada' ? 'Editar entrada' : 'Adicionar entrada'}
              </h2>
            </div>

            {subTela === 'editar_entrada' && (
              <button
                type="button"
                onClick={() => setModalExcluirEntrada(true)}
                className="p-2 rounded-xl bg-slate-800/80 text-rose-400 hover:bg-rose-500/10"
                title="Excluir entrada"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Big Value Input */}
            <div className="space-y-1 text-center py-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Valor</span>
              <div className="relative inline-flex items-center justify-center">
                <span className="text-xl font-black text-emerald-400 mr-1.5">R$</span>
                <input
                  type="text"
                  placeholder="0,00"
                  value={entradaValor}
                  onChange={e => setEntradaValor(e.target.value)}
                  className="text-3xl font-black text-slate-100 bg-transparent border-b-2 border-slate-700 focus:border-emerald-500 focus:outline-none text-center w-48 tracking-tight"
                />
              </div>
            </div>

            {/* Recebido em & Origem Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Recebido em</span>
                <input
                  type="date"
                  value={entradaRecebidoEm}
                  onChange={e => setEntradaRecebidoEm(e.target.value)}
                  className="w-full bg-transparent text-xs font-bold text-slate-200 focus:outline-none"
                />
              </div>

              {/* Categorização por Origem (Dimensão 1) */}
              <div
                onClick={() => setModalOrigemReceita(true)}
                className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 cursor-pointer hover:border-slate-700"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Origem</span>
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span className="truncate">{entradaOrigem}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </div>
              </div>
            </div>

            {/* Categorização por Forma de Liquidação (Dimensão 2) */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400">Forma de Liquidação (Meio de Pagamento)</label>
              <div className="grid grid-cols-2 gap-2">
                {FORMAS_LIQUIDACAO.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setEntradaFormaLiquidacao(f.id)}
                    className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 transition text-left ${
                      entradaFormaLiquidacao === f.id
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span>{f.icone}</span>
                    <span className="truncate">{f.nome}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mais Informações */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-black text-slate-300 block">Mais informações</span>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Nome da entrada*</label>
                <input
                  type="text"
                  placeholder="Ex: Fundo de troco matutino, Aluguel de espaço"
                  value={entradaNome}
                  onChange={e => setEntradaNome(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Observações</label>
                <input
                  type="text"
                  placeholder="Informações adicionais (opcional)"
                  value={entradaObservacoes}
                  onChange={e => setEntradaObservacoes(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Action Button Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/90 backdrop-blur shrink-0">
            <button
              type="button"
              disabled={salvando}
              onClick={salvarEntrada}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 transition flex items-center justify-center gap-2"
            >
              {salvando ? 'Salvando...' : subTela === 'editar_entrada' ? 'Salvar alterações' : 'Adicionar entrada'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. TELA 028: ADICIONAR FORNECEDOR                                        */}
      {/* ========================================================================= */}
      {subTela === 'adicionar_fornecedor' && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('fornecedores')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">Adicionar fornecedor</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Seção 1: Dados do Fornecedor */}
            <div className="space-y-3">
              <span className="text-xs font-black text-slate-300 block">Dados do fornecedor</span>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Nome ou Razão social*</label>
                <input
                  type="text"
                  placeholder="Nome comercial do fornecedor"
                  value={fornNome}
                  onChange={e => setFornNome(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">CPF ou CNPJ</label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={fornDoc}
                  onChange={e => setFornDoc(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Endereço</label>
                <input
                  type="text"
                  placeholder="Rua, número, bairro e cidade"
                  value={fornEndereco}
                  onChange={e => setFornEndereco(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Telefone</label>
                <div className="flex gap-2">
                  <div className="px-3 py-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-1.5 text-xs text-slate-300">
                    <span>🇧🇷</span>
                    <span>+55</span>
                  </div>
                  <input
                    type="text"
                    placeholder="(85) 99999-9999"
                    value={fornTelefone}
                    onChange={e => setFornTelefone(e.target.value)}
                    className="flex-1 p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">E-mail</label>
                <input
                  type="email"
                  placeholder="fornecedor@email.com"
                  value={fornEmail}
                  onChange={e => setFornEmail(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Observações</label>
                <input
                  type="text"
                  placeholder="Condições de entrega, prazos, etc."
                  value={fornObs}
                  onChange={e => setFornObs(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Seção 2: Dados da Pessoa de Contato */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-black text-slate-300 block">Dados da pessoa de contato</span>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Nome do contato</label>
                <input
                  type="text"
                  placeholder="Ex: João Silva (Representante)"
                  value={fornContatoNome}
                  onChange={e => setFornContatoNome(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Celular/WhatsApp</label>
                <div className="flex gap-2">
                  <div className="px-3 py-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-1.5 text-xs text-slate-300">
                    <span>🇧🇷</span>
                    <span>+55</span>
                  </div>
                  <input
                    type="text"
                    placeholder="(85) 99999-9999"
                    value={fornContatoWhats}
                    onChange={e => setFornContatoWhats(e.target.value)}
                    className="flex-1 p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Button Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/90 backdrop-blur shrink-0">
            <button
              type="button"
              disabled={salvando}
              onClick={salvarFornecedor}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 transition flex items-center justify-center gap-2"
            >
              {salvando ? 'Salvando...' : 'Adicionar fornecedor'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. TELA 029: DETALHES / INATIVAR FORNECEDOR                              */}
      {/* ========================================================================= */}
      {subTela === 'detalhes_fornecedor' && fornecedorSelecionado && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubTela('fornecedores')}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="font-extrabold text-sm text-slate-100">{fornecedorSelecionado.nome}</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Card 1: Dados do Fornecedor */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-200">Dados do fornecedor</span>
                <button
                  type="button"
                  onClick={() => setSubTela('adicionar_fornecedor')}
                  className="text-xs font-bold text-emerald-400 flex items-center gap-1 hover:underline"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-slate-400">
                {fornecedorSelecionado.numero_documento && (
                  <p>Documento: <span className="text-slate-200">{fornecedorSelecionado.numero_documento}</span></p>
                )}
                {fornecedorSelecionado.telefone && (
                  <p>Telefone: <span className="text-slate-200">{fornecedorSelecionado.telefone}</span></p>
                )}
                {fornecedorSelecionado.email && (
                  <p>E-mail: <span className="text-slate-200">{fornecedorSelecionado.email}</span></p>
                )}
                {fornecedorSelecionado.endereco && (
                  <p>Endereço: <span className="text-slate-200">{fornecedorSelecionado.endereco}</span></p>
                )}
              </div>
            </div>

            {/* Card 2: Contato */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="font-bold text-xs text-slate-200 block">Pessoa de Contato</span>
              {fornecedorSelecionado.pessoa_contato ? (
                <div className="space-y-1 text-xs text-slate-400">
                  <p>Nome: <span className="text-slate-200">{fornecedorSelecionado.pessoa_contato}</span></p>
                  {fornecedorSelecionado.whatsapp && (
                    <p>WhatsApp: <span className="text-slate-200">{fornecedorSelecionado.whatsapp}</span></p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSubTela('adicionar_fornecedor')}
                  className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-xs font-bold text-emerald-400 hover:bg-slate-850 transition"
                >
                  Adicionar um contato
                </button>
              )}
            </div>

            {/* Toggle: Inativar Fornecedor */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span className="font-bold text-xs text-slate-200">Inativar fornecedor</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!fornAtivo}
                  onChange={e => {
                    setFornAtivo(!e.target.checked);
                    salvarFornecedor();
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CATEGORIAS DE GASTOS (TELA010 / TELA022)                           */}
      {/* ========================================================================= */}
      {modalCategoriaGastos && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 max-h-[85vh] flex flex-col space-y-4 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
              <h3 className="font-extrabold text-sm text-slate-100">Categoria de gastos</h3>
              <button
                type="button"
                onClick={() => setModalCategoriaGastos(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {CATEGORIAS_GASTOS_PADRAO.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSaidaCategoria(cat.nome);
                    setModalCategoriaGastos(false);
                  }}
                  className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 active:bg-slate-850 flex items-center gap-3 text-left transition"
                >
                  <span className="text-xl">{cat.icone}</span>
                  <span className="font-bold text-xs text-slate-200">{cat.nome}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ORIGEM DA RECEITA (DIMENSÃO 1 DE ENTRADAS)                          */}
      {/* ========================================================================= */}
      {modalOrigemReceita && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 max-h-[85vh] flex flex-col space-y-4 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="font-extrabold text-sm text-slate-100">Origem Financeira</h3>
                <p className="text-[10px] text-slate-400">Pelo que o dinheiro está entrando</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOrigemReceita(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Operacionais */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-emerald-400 block px-1">
                  Receitas Operacionais (Vendas e Serviços)
                </span>
                <div className="space-y-1.5">
                  {ORIGENS_RECEITA.operacionais.map(op => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => {
                        setEntradaOrigem(op.nome);
                        setModalOrigemReceita(false);
                      }}
                      className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 active:bg-slate-850 flex items-center gap-3 text-left transition"
                    >
                      <span className="text-lg">{op.icone}</span>
                      <div>
                        <span className="font-bold text-xs text-slate-100 block">{op.nome}</span>
                        <span className="text-[10px] text-slate-400 block">{op.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Não Operacionais */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-amber-400 block px-1">
                  Receitas Não-Operacionais e Ajustes
                </span>
                <div className="space-y-1.5">
                  {ORIGENS_RECEITA.nao_operacionais.map(op => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => {
                        setEntradaOrigem(op.nome);
                        setModalOrigemReceita(false);
                      }}
                      className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 active:bg-slate-850 flex items-center gap-3 text-left transition"
                    >
                      <span className="text-lg">{op.icone}</span>
                      <div>
                        <span className="font-bold text-xs text-slate-100 block">{op.nome}</span>
                        <span className="text-[10px] text-slate-400 block">{op.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SELECIONAR FORNECEDOR (TELA011)                                    */}
      {/* ========================================================================= */}
      {modalSelecionarFornecedor && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 max-h-[85vh] flex flex-col space-y-4 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
              <h3 className="font-extrabold text-sm text-slate-100">Selecionar Fornecedor</h3>
              <button
                type="button"
                onClick={() => setModalSelecionarFornecedor(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {fornecedores.map(forn => (
                <button
                  key={forn.id}
                  type="button"
                  onClick={() => {
                    setSaidaFornecedorId(forn.id);
                    setModalSelecionarFornecedor(false);
                  }}
                  className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 active:bg-slate-850 flex items-center justify-between text-left transition"
                >
                  <span className="font-bold text-xs text-slate-200">{forn.nome}</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REPETIR SAÍDA (TELA012 / TELA023 / TELA024 / TELA025)             */}
      {/* ========================================================================= */}
      {modalRepetirSaida && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 space-y-4 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-100">Repetir saída</h3>
              <button
                type="button"
                onClick={() => setModalRepetirSaida(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Segmented Control: GASTO FIXO | PARCELAS */}
            <div className="p-1 bg-slate-950 border border-slate-800 rounded-2xl flex">
              <button
                type="button"
                onClick={() => setSaidaRepetirTipo('gasto_fixo')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                  saidaRepetirTipo === 'gasto_fixo'
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400'
                }`}
              >
                GASTO FIXO
              </button>
              <button
                type="button"
                onClick={() => setSaidaRepetirTipo('parcelas')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                  saidaRepetirTipo === 'parcelas'
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400'
                }`}
              >
                PARCELAS
              </button>
            </div>

            {/* Campos Gasto Fixo / Parcelas */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Frequência</label>
                <select
                  value={saidaFrequencia}
                  onChange={e => setSaidaFrequencia(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none"
                >
                  <option value="mensal">Mensal</option>
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400">Todo dia</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={saidaTodoDia}
                  onChange={e => setSaidaTodoDia(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none"
                />
              </div>

              {saidaRepetirTipo === 'parcelas' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Número de parcelas</label>
                  <input
                    type="number"
                    min="2"
                    max="48"
                    value={saidaNumParcelas}
                    onChange={e => setSaidaNumParcelas(parseInt(e.target.value) || 2)}
                    className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSaidaRepetirAtivo(true);
                setModalRepetirSaida(false);
              }}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20"
            >
              Aplicar configuração
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: COMO O FLUXO DE CAIXA É CALCULADO? (TELA015)                      */}
      {/* ========================================================================= */}
      {modalComoCalculado && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto space-y-5 animate-in slide-in-from-bottom">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-3xl bg-slate-950 border border-slate-800 text-3xl flex items-center justify-center mx-auto shadow-inner">
                👛
              </div>
              <h3 className="font-extrabold text-base text-slate-100">
                Como o fluxo de caixa líquido é calculado?
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-slate-200">O cálculo é simples:</strong> juntamos todo o dinheiro que entrou e subtraímos o dinheiro que saiu.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> Dinheiro que entra:
                </span>
                <p className="text-[11px] text-slate-300">
                  Entradas lançadas, considerando a data do recebimento e vendas realizadas.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4" /> Dinheiro que sai:
                </span>
                <p className="text-[11px] text-slate-300">
                  Saídas marcadas como pagas, considerando a data de pagamento.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalComoCalculado(false)}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20"
            >
              Ok, entendi
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SELETOR DE PERÍODO (TELA016)                                      */}
      {/* ========================================================================= */}
      {modalPeriodo && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 space-y-4 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-100">Período</h3>
              <button
                type="button"
                onClick={() => setModalPeriodo(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas: Dia | Semana | Mês | Ano */}
            <div className="p-1 bg-slate-950 border border-slate-800 rounded-2xl flex">
              {(['dia', 'semana', 'mes', 'ano'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTipoPeriodoTab(tab)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold uppercase transition ${
                    tipoPeriodoTab === tab
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Presets */}
            <div className="space-y-2 pt-1">
              {[
                { id: 'ultimos_7', label: 'Últimos 7 dias' },
                { id: 'proximos_7', label: 'Próximos 7 dias' },
                { id: 'semana_passada', label: 'Semana passada' },
                { id: 'esta_semana', label: 'Esta semana' },
                { id: 'este_mes', label: 'Este mês' }
              ].map(opt => (
                <label
                  key={opt.id}
                  onClick={() => {
                    setPeriodoPreset(opt.id);
                    setPeriodoLabel(opt.label);
                  }}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                    periodoPreset === opt.id
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="font-bold text-xs">{opt.label}</span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    periodoPreset === opt.id ? 'border-emerald-500 bg-emerald-500' : 'border-slate-700'
                  }`}>
                    {periodoPreset === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                  </div>
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setModalPeriodo(false)}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20"
            >
              Selecionar período
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DUPLICAR SAÍDA (TELA013)                                          */}
      {/* ========================================================================= */}
      {modalDuplicarSaida && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 text-center shadow-2xl">
            <h3 className="font-extrabold text-sm text-slate-100">Atenção</h3>
            <p className="text-xs text-slate-400">Deseja duplicar esta saída?</p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalDuplicarSaida(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={confirmarDuplicarSaida}
                className="flex-1 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20"
              >
                SIM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EXCLUIR SAÍDA (TELA014)                                           */}
      {/* ========================================================================= */}
      {modalExcluirSaida && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 text-center shadow-2xl">
            <h3 className="font-extrabold text-sm text-slate-100">Excluir saída</h3>
            <p className="text-xs text-slate-400">
              {saidaEditando?.eh_recorrente
                ? 'Esta saída faz parte de uma série de gastos recorrentes. O que deseja fazer?'
                : 'Tem certeza que deseja excluir esta saída?'}
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={confirmarExcluirSaida}
                className="w-full py-3 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs shadow-lg shadow-rose-500/20"
              >
                Excluir saída
              </button>
              <button
                type="button"
                onClick={() => setModalExcluirSaida(false)}
                className="w-full py-3 rounded-2xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EXCLUIR ENTRADA (TELA027)                                         */}
      {/* ========================================================================= */}
      {modalExcluirEntrada && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 text-center shadow-2xl">
            <h3 className="font-extrabold text-sm text-slate-100">Excluir entrada</h3>
            <p className="text-xs text-slate-400">Tem certeza que deseja excluir este lançamento de entrada?</p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalExcluirEntrada(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarExcluirEntrada}
                className="flex-1 py-3 rounded-2xl bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-500/20"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER MENU UNIFICADO MOBILE */}
      <MobileMenuDrawer
        aberto={menuDrawerAberto}
        onFechar={() => setMenuDrawerAberto(false)}
      />
    </div>
  );
};
export default FinancasMobile;
