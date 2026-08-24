import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Award,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Users,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
  Percent,
  Check,
  ChevronDown,
  ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Pedido, ItemPedido, PagamentoPedido } from '../types';

type TipoMetrica =
  | 'faturamento'
  | 'vendas'
  | 'ticket_medio'
  | 'lucro'
  | 'taxa_venda'
  | 'meio_pagamento'
  | 'ranking_produtos'
  | 'ranking_clientes'
  | 'vendas_usuario';

type TipoAgrupamento = 'hora' | 'dia' | 'dia_semana' | 'mes';

type TipoPeriodo =
  | 'hoje'
  | 'ontem'
  | 'esta_semana'
  | 'semana_passada'
  | 'este_mes'
  | 'mes_passado'
  | 'este_ano'
  | 'personalizado';

const PERIODOS_OPCOES: { id: TipoPeriodo; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: 'esta_semana', label: 'Esta semana' },
  { id: 'semana_passada', label: 'Semana passada' },
  { id: 'este_mes', label: 'Este mês' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: 'este_ano', label: 'Este ano' },
  { id: 'personalizado', label: 'Personalizado' }
];

const DIAS_SEMANA_NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_COMPLETOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const CORES_PALETA = [
  '#10B981', // Emerald
  '#6366F1', // Indigo
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#84CC16'  // Lime
];

export const EstatisticasAnalytics: React.FC = () => {
  const { loja } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!permissions.podeAcessarAnalytics) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarAnalytics, navigate]);

  const [todosPedidos, setTodosPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);

  // Estados de navegação e filtros
  const [metricaSelecionada, setMetricaSelecionada] = useState<TipoMetrica>('faturamento');
  const [agrupamentoSelecionado, setAgrupamentoSelecionado] = useState<TipoAgrupamento>('hora');
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodo>('esta_semana');
  const [periodoOffset, setPeriodoOffset] = useState<number>(0);
  const [dropdownPeriodoAberto, setDropdownPeriodoAberto] = useState<boolean>(false);
  const [dataInicioCustom, setDataInicioCustom] = useState<string>('');
  const [dataFimCustom, setDataFimCustom] = useState<string>('');

  // 1. Carregar todos os pedidos da loja
  useEffect(() => {
    if (!loja?.id) return;
    const carregarDados = async () => {
      try {
        setCarregando(true);
        const { data, error } = await supabase
          .from('pedidos')
          .select(`
            *,
            cliente:clientes(*),
            vendedor:usuarios_loja(*),
            itens:itens_pedido(*),
            pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))
          `)
          .eq('loja_id', loja.id)
          .neq('status', 'cancelado')
          .order('data_venda', { ascending: false });

        if (error) throw error;
        if (data) {
          setTodosPedidos(data as unknown as Pedido[]);
        }
      } catch (err) {
        console.error('Erro ao carregar pedidos para estatísticas:', err);
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [loja?.id]);

  // 2. Calcular intervalo de datas ativo com base no tipoPeriodo e offset
  const { dataInicio, dataFim, labelExibicaoPeriodo } = useMemo(() => {
    const agora = new Date();

    if (tipoPeriodo === 'personalizado') {
      const inicio = dataInicioCustom ? new Date(`${dataInicioCustom}T00:00:00`) : new Date(agora.getFullYear(), agora.getMonth(), 1);
      const fim = dataFimCustom ? new Date(`${dataFimCustom}T23:59:59.999`) : new Date();
      return {
        dataInicio: inicio,
        dataFim: fim,
        labelExibicaoPeriodo: 'Personalizado'
      };
    }

    if (tipoPeriodo === 'hoje') {
      const ref = new Date();
      ref.setDate(ref.getDate() + periodoOffset);
      const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0);
      const fim = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
      const label = periodoOffset === 0 ? 'Hoje' : periodoOffset === -1 ? 'Ontem' : ref.toLocaleDateString('pt-BR');
      return { dataInicio: inicio, dataFim: fim, labelExibicaoPeriodo: label };
    }

    if (tipoPeriodo === 'ontem') {
      const ref = new Date();
      ref.setDate(ref.getDate() - 1 + periodoOffset);
      const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0);
      const fim = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
      return { dataInicio: inicio, dataFim: fim, labelExibicaoPeriodo: 'Ontem' };
    }

    if (tipoPeriodo === 'esta_semana' || tipoPeriodo === 'semana_passada') {
      const ref = new Date();
      const baseOffset = tipoPeriodo === 'semana_passada' ? -7 : 0;
      const totalDaysOffset = baseOffset + (periodoOffset * 7);
      ref.setDate(ref.getDate() + totalDaysOffset);

      const dayOfWeek = ref.getDay(); // 0 = Domingo, 1 = Segunda
      const diffToMonday = (dayOfWeek + 6) % 7;

      const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - diffToMonday, 0, 0, 0);
      const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6, 23, 59, 59, 999);
      
      const label = periodoOffset === 0 && tipoPeriodo === 'esta_semana' 
        ? 'Esta semana' 
        : `Semana ${inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;

      return { dataInicio: inicio, dataFim: fim, labelExibicaoPeriodo: label };
    }

    if (tipoPeriodo === 'este_mes' || tipoPeriodo === 'mes_passado') {
      const ref = new Date();
      const baseMonthOffset = tipoPeriodo === 'mes_passado' ? -1 : 0;
      const totalMonthOffset = baseMonthOffset + periodoOffset;
      ref.setMonth(ref.getMonth() + totalMonthOffset);

      const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0);
      const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);

      const label = periodoOffset === 0 && tipoPeriodo === 'este_mes' 
        ? 'Este mês' 
        : `${MESES_COMPLETOS[ref.getMonth()]} de ${ref.getFullYear()}`;

      return { dataInicio: inicio, dataFim: fim, labelExibicaoPeriodo: label };
    }

    if (tipoPeriodo === 'este_ano') {
      const ref = new Date();
      ref.setFullYear(ref.getFullYear() + periodoOffset);
      const inicio = new Date(ref.getFullYear(), 0, 1, 0, 0, 0);
      const fim = new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999);
      const label = `Ano ${ref.getFullYear()}`;
      return { dataInicio: inicio, dataFim: fim, labelExibicaoPeriodo: label };
    }

    const padraoInicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);
    const padraoFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);
    return { dataInicio: padraoInicio, dataFim: padraoFim, labelExibicaoPeriodo: 'Este mês' };
  }, [tipoPeriodo, periodoOffset, dataInicioCustom, dataFimCustom]);

  // 3. Filtrar pedidos dentro do intervalo selecionado
  const pedidosFiltrados = useMemo(() => {
    return todosPedidos.filter(p => {
      const dataVenda = new Date(p.data_venda || p.criado_em || '');
      return dataVenda >= dataInicio && dataVenda <= dataFim;
    });
  }, [todosPedidos, dataInicio, dataFim]);

  // 4. Calcular Métricas Gerais do Período
  const faturamentoTotal = useMemo(() => {
    return pedidosFiltrados.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
  }, [pedidosFiltrados]);

  const totalVendas = useMemo(() => {
    return pedidosFiltrados.length;
  }, [pedidosFiltrados]);

  const ticketMedio = useMemo(() => {
    return totalVendas > 0 ? faturamentoTotal / totalVendas : 0;
  }, [faturamentoTotal, totalVendas]);

  const custoTotal = useMemo(() => {
    return pedidosFiltrados.reduce((acc, p) => {
      const custoPedido = (p.itens || []).reduce((accI, item) => {
        return accI + (Number(item.preco_custo_unitario || 0) * Number(item.quantidade || 1));
      }, 0);
      return acc + custoPedido;
    }, 0);
  }, [pedidosFiltrados]);

  const taxasVendaTotal = useMemo(() => {
    return pedidosFiltrados.reduce((acc, p) => {
      const taxas = (p.pagamentos || []).reduce((accP, pag) => accP + Number(pag.valor_taxa || 0), 0);
      return acc + taxas;
    }, 0);
  }, [pedidosFiltrados]);

  const lucroTotal = useMemo(() => {
    return faturamentoTotal - custoTotal - taxasVendaTotal;
  }, [faturamentoTotal, custoTotal, taxasVendaTotal]);

  // 5. Agrupamentos por Meio de Pagamento
  const dadosMeiosPagamento = useMemo(() => {
    const map: Record<string, { nome: string; qtd: number; valor: number; tipo: string }> = {};

    pedidosFiltrados.forEach(p => {
      if (p.pagamentos && p.pagamentos.length > 0) {
        p.pagamentos.forEach(pag => {
          const nomeFp = pag.forma_pagamento?.nome || (pag.eh_pagamento_fiado ? 'Fiado' : 'Outro');
          if (!map[nomeFp]) {
            map[nomeFp] = { nome: nomeFp, qtd: 0, valor: 0, tipo: pag.forma_pagamento?.tipo || 'outro' };
          }
          map[nomeFp].qtd += 1;
          map[nomeFp].valor += Number(pag.valor || 0);
        });
      } else {
        const nomeFp = 'Dinheiro / Balcão';
        if (!map[nomeFp]) map[nomeFp] = { nome: nomeFp, qtd: 0, valor: 0, tipo: 'dinheiro' };
        map[nomeFp].qtd += 1;
        map[nomeFp].valor += Number(p.valor_total || 0);
      }
    });

    const lista = Object.values(map).sort((a, b) => b.valor - a.valor);
    const totalVal = lista.reduce((acc, i) => acc + i.valor, 0);

    return lista.map((item, idx) => ({
      ...item,
      cor: CORES_PALETA[idx % CORES_PALETA.length],
      percentual: totalVal > 0 ? (item.valor / totalVal) * 100 : 0
    }));
  }, [pedidosFiltrados]);

  const principalMeioPagamento = dadosMeiosPagamento[0] || null;

  // 6. Agrupamento Ranking de Produtos
  const rankingProdutos = useMemo(() => {
    const map: Record<string, { nome: string; valor: number; qtd: number }> = {};

    pedidosFiltrados.forEach(p => {
      (p.itens || []).forEach(item => {
        const nome = item.nome_produto || 'Item sem nome';
        if (!map[nome]) {
          map[nome] = { nome, valor: 0, qtd: 0 };
        }
        map[nome].qtd += Number(item.quantidade || 1);
        map[nome].valor += Number(item.subtotal || item.preco_venda_unitario || 0);
      });
    });

    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [pedidosFiltrados]);

  const principalProduto = rankingProdutos[0] || null;

  // 7. Agrupamento Ranking de Clientes
  const rankingClientes = useMemo(() => {
    const map: Record<string, { id: string; nome: string; valor: number; compras: number }> = {};

    pedidosFiltrados.forEach(p => {
      const nomeCli = p.cliente?.nome || 'Cliente Avulso (Balcão)';
      const idCli = p.cliente_id || 'avulso';

      if (!map[idCli]) {
        map[idCli] = { id: idCli, nome: nomeCli, valor: 0, compras: 0 };
      }
      map[idCli].compras += 1;
      map[idCli].valor += Number(p.valor_total || 0);
    });

    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [pedidosFiltrados]);

  const principalCliente = rankingClientes[0] || null;

  // 8. Agrupamento Vendas por Usuário / Colaborador
  const vendasPorUsuario = useMemo(() => {
    const map: Record<string, { id: string; nome: string; qtd: number; valor: number }> = {};

    pedidosFiltrados.forEach(p => {
      const nomeVendedor = p.vendedor?.nome_completo || (p.origem === 'catalogo_online' ? 'Catálogo Online' : 'Caixa / PDV');
      const idVendedor = p.vendedor_id || (p.origem === 'catalogo_online' ? 'catalogo' : 'pdv_geral');

      if (!map[idVendedor]) {
        map[idVendedor] = { id: idVendedor, nome: nomeVendedor, qtd: 0, valor: 0 };
      }
      map[idVendedor].qtd += 1;
      map[idVendedor].valor += Number(p.valor_total || 0);
    });

    const lista = Object.values(map).sort((a, b) => b.valor - a.valor);
    const totalVal = lista.reduce((acc, i) => acc + i.valor, 0);

    return lista.map((item, idx) => ({
      ...item,
      cor: CORES_PALETA[idx % CORES_PALETA.length],
      percentual: totalVal > 0 ? (item.valor / totalVal) * 100 : 0
    }));
  }, [pedidosFiltrados]);

  const principalUsuario = vendasPorUsuario[0] || null;

  // 9. Agrupamento Temporal dos Dados para Gráficos e Tabelas
  const dadosAgrupadosTemporais = useMemo(() => {
    if (agrupamentoSelecionado === 'hora') {
      const horas: { chave: string; rotulo: string; faturamento: number; vendas: number; ticketMedio: number; lucro: number; taxaVenda: number }[] = [];
      for (let h = 0; h < 24; h++) {
        horas.push({
          chave: String(h),
          rotulo: `${h}h`,
          faturamento: 0,
          vendas: 0,
          ticketMedio: 0,
          lucro: 0,
          taxaVenda: 0
        });
      }

      pedidosFiltrados.forEach(p => {
        const d = new Date(p.data_venda || p.criado_em || '');
        const hora = d.getHours();
        const custo = (p.itens || []).reduce((acc, it) => acc + (Number(it.preco_custo_unitario || 0) * Number(it.quantidade || 1)), 0);
        const taxas = (p.pagamentos || []).reduce((acc, pag) => acc + Number(pag.valor_taxa || 0), 0);
        const val = Number(p.valor_total || 0);

        if (horas[hora]) {
          horas[hora].faturamento += val;
          horas[hora].vendas += 1;
          horas[hora].taxaVenda += taxas;
          horas[hora].lucro += (val - custo - taxas);
        }
      });

      horas.forEach(h => {
        h.ticketMedio = h.vendas > 0 ? h.faturamento / h.vendas : 0;
      });

      return horas;
    }

    if (agrupamentoSelecionado === 'dia') {
      const formatKeyLocal = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
      };

      const formatRotuloLocal = (d: Date) => {
        const dia = String(d.getDate()).padStart(2, '0');
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${dia}/${m}`;
      };

      const diasLista: { chave: string; rotulo: string; faturamento: number; vendas: number; ticketMedio: number; lucro: number; taxaVenda: number }[] = [];
      const curr = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), dataInicio.getDate());
      const end = new Date(dataFim.getFullYear(), dataFim.getMonth(), dataFim.getDate());

      let safety = 0;
      while (curr <= end && safety < 370) {
        diasLista.push({
          chave: formatKeyLocal(curr),
          rotulo: formatRotuloLocal(curr),
          faturamento: 0,
          vendas: 0,
          ticketMedio: 0,
          lucro: 0,
          taxaVenda: 0
        });
        curr.setDate(curr.getDate() + 1);
        safety++;
      }

      pedidosFiltrados.forEach(p => {
        const d = new Date(p.data_venda || p.criado_em || '');
        const chave = formatKeyLocal(d);
        let diaItem = diasLista.find(item => item.chave === chave);

        if (!diaItem) {
          diaItem = {
            chave,
            rotulo: formatRotuloLocal(d),
            faturamento: 0,
            vendas: 0,
            ticketMedio: 0,
            lucro: 0,
            taxaVenda: 0
          };
          diasLista.push(diaItem);
        }

        const custo = (p.itens || []).reduce((acc, it) => acc + (Number(it.preco_custo_unitario || 0) * Number(it.quantidade || 1)), 0);
        const taxas = (p.pagamentos || []).reduce((acc, pag) => acc + Number(pag.valor_taxa || 0), 0);
        const val = Number(p.valor_total || 0);

        diaItem.faturamento += val;
        diaItem.vendas += 1;
        diaItem.taxaVenda += taxas;
        diaItem.lucro += (val - custo - taxas);
      });

      diasLista.sort((a, b) => a.chave.localeCompare(b.chave));
      diasLista.forEach(d => {
        d.ticketMedio = d.vendas > 0 ? d.faturamento / d.vendas : 0;
      });

      return diasLista.length > 0 ? diasLista : [{ chave: 'hoje', rotulo: 'Hoje', faturamento: 0, vendas: 0, ticketMedio: 0, lucro: 0, taxaVenda: 0 }];
    }

    if (agrupamentoSelecionado === 'dia_semana') {
      const dias = DIAS_SEMANA_NOMES.map((rotulo, idx) => ({
        chave: String(idx),
        rotulo,
        faturamento: 0,
        vendas: 0,
        ticketMedio: 0,
        lucro: 0,
        taxaVenda: 0
      }));

      pedidosFiltrados.forEach(p => {
        const d = new Date(p.data_venda || p.criado_em || '');
        const diaSemanaIdx = d.getDay();
        const custo = (p.itens || []).reduce((acc, it) => acc + (Number(it.preco_custo_unitario || 0) * Number(it.quantidade || 1)), 0);
        const taxas = (p.pagamentos || []).reduce((acc, pag) => acc + Number(pag.valor_taxa || 0), 0);
        const val = Number(p.valor_total || 0);

        if (dias[diaSemanaIdx]) {
          dias[diaSemanaIdx].faturamento += val;
          dias[diaSemanaIdx].vendas += 1;
          dias[diaSemanaIdx].taxaVenda += taxas;
          dias[diaSemanaIdx].lucro += (val - custo - taxas);
        }
      });

      dias.forEach(d => {
        d.ticketMedio = d.vendas > 0 ? d.faturamento / d.vendas : 0;
      });

      return dias;
    }

    if (agrupamentoSelecionado === 'mes') {
      const meses = MESES_NOMES.map((rotulo, idx) => ({
        chave: String(idx),
        rotulo,
        faturamento: 0,
        vendas: 0,
        ticketMedio: 0,
        lucro: 0,
        taxaVenda: 0
      }));

      pedidosFiltrados.forEach(p => {
        const d = new Date(p.data_venda || p.criado_em || '');
        const mesIdx = d.getMonth();
        const custo = (p.itens || []).reduce((acc, it) => acc + (Number(it.preco_custo_unitario || 0) * Number(it.quantidade || 1)), 0);
        const taxas = (p.pagamentos || []).reduce((acc, pag) => acc + Number(pag.valor_taxa || 0), 0);
        const val = Number(p.valor_total || 0);

        if (meses[mesIdx]) {
          meses[mesIdx].faturamento += val;
          meses[mesIdx].vendas += 1;
          meses[mesIdx].taxaVenda += taxas;
          meses[mesIdx].lucro += (val - custo - taxas);
        }
      });

      meses.forEach(m => {
        m.ticketMedio = m.vendas > 0 ? m.faturamento / m.vendas : 0;
      });

      return meses;
    }

    return [];
  }, [pedidosFiltrados, agrupamentoSelecionado]);

  // Identificar melhor e pior hora/dia
  const { melhorItem, piorItem } = useMemo(() => {
    if (dadosAgrupadosTemporais.length === 0) return { melhorItem: null, piorItem: null };
    
    const itensComValores = dadosAgrupadosTemporais.filter(i => {
      if (metricaSelecionada === 'faturamento') return i.faturamento > 0;
      if (metricaSelecionada === 'vendas') return i.vendas > 0;
      if (metricaSelecionada === 'ticket_medio') return i.ticketMedio > 0;
      if (metricaSelecionada === 'lucro') return i.lucro > 0;
      if (metricaSelecionada === 'taxa_venda') return i.taxaVenda > 0;
      return false;
    });

    if (itensComValores.length === 0) return { melhorItem: null, piorItem: null };

    const getValor = (item: typeof dadosAgrupadosTemporais[0]) => {
      if (metricaSelecionada === 'faturamento') return item.faturamento;
      if (metricaSelecionada === 'vendas') return item.vendas;
      if (metricaSelecionada === 'ticket_medio') return item.ticketMedio;
      if (metricaSelecionada === 'lucro') return item.lucro;
      if (metricaSelecionada === 'taxa_venda') return item.taxaVenda;
      return 0;
    };

    const ordenado = [...itensComValores].sort((a, b) => getValor(b) - getValor(a));
    return {
      melhorItem: ordenado[0],
      piorItem: ordenado.length > 1 ? ordenado[ordenado.length - 1] : null
    };
  }, [dadosAgrupadosTemporais, metricaSelecionada]);

  // Função para renderizar SVG Donut Chart
  const renderDonutChart = (dados: { nome: string; valor: number; percentual: number; cor: string }[]) => {
    if (dados.length === 0 || dados.every(d => d.valor === 0)) {
      return (
        <div className="flex items-center justify-center h-48 text-slate-500 text-xs">
          Nenhum dado registrado para o período.
        </div>
      );
    }

    const total = dados.reduce((acc, d) => acc + d.valor, 0);
    let acumuloPercent = 0;

    const strokeWidth = 24;
    const radius = 60;
    const circumference = 2 * Math.PI * radius;

    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-8 py-6">
        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
            {dados.map((d, i) => {
              const strokeDasharray = `${(d.percentual / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -((acumuloPercent / 100) * circumference);
              acumuloPercent += d.percentual;

              return (
                <circle
                  key={i}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="transparent"
                  stroke={d.cor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500 hover:opacity-80"
                />
              );
            })}
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total</span>
            <span className="text-xs font-bold text-slate-100">R$ {total.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 max-w-xs">
          {dados.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.cor }} />
              <span className="text-slate-300 font-medium truncate">{d.nome}:</span>
              <span className="text-slate-100 font-bold">{d.percentual.toFixed(1)}%</span>
              <span className="text-slate-500 text-[11px]">(R$ {d.valor.toFixed(2)})</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Renderizar Gráfico de Linhas / Área SVG Interativo
  const renderLineAreaChart = () => {
    const dados = dadosAgrupadosTemporais;
    if (dados.length === 0) {
      return (
        <div className="flex items-center justify-center h-56 text-slate-500 text-xs">
          Sem dados para o período selecionado.
        </div>
      );
    }

    const getValor = (item: typeof dados[0]) => {
      if (metricaSelecionada === 'faturamento') return item.faturamento;
      if (metricaSelecionada === 'vendas') return item.vendas;
      if (metricaSelecionada === 'ticket_medio') return item.ticketMedio;
      if (metricaSelecionada === 'lucro') return item.lucro;
      if (metricaSelecionada === 'taxa_venda') return item.taxaVenda;
      return 0;
    };

    const valores = dados.map(getValor);
    const maxVal = Math.max(...valores, 10);
    const minVal = 0;

    const width = 700;
    const height = 220;
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 35;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const points = dados.map((d, index) => {
      const x = paddingLeft + (index / (dados.length - 1 || 1)) * chartWidth;
      const val = getValor(d);
      const y = paddingTop + chartHeight - ((val - minVal) / (maxVal - minVal || 1)) * chartHeight;
      return { x, y, val, rotulo: d.rotulo, item: d };
    });

    const pathString = points.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
    }, '');

    const areaString = `${pathString} L ${points[points.length - 1].x},${paddingTop + chartHeight} L ${points[0].x},${paddingTop + chartHeight} Z`;

    const isMoeda = metricaSelecionada !== 'vendas';

    return (
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 select-none font-sans text-[10px]">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Linhas de Grade Horizontais */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            const gridVal = minVal + ratio * (maxVal - minVal);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#334155"
                  strokeDasharray="2 2"
                  strokeWidth="0.8"
                />
                <text x={paddingLeft - 8} y={y + 3} textAnchor="end" fill="#94A3B8" className="text-[9px]">
                  {isMoeda ? `R$ ${gridVal >= 1000 ? `${(gridVal / 1000).toFixed(1)}k` : gridVal.toFixed(0)}` : Math.round(gridVal)}
                </text>
              </g>
            );
          })}

          {/* Área Preenchida com Gradiente */}
          <path d={areaString} fill="url(#areaGradient)" />

          {/* Linha Principal */}
          <path d={pathString} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Pontos de Dados */}
          {points.map((pt, idx) => {
            const isMelhor = melhorItem && pt.item.chave === melhorItem.chave && pt.val > 0;
            const isPior = piorItem && pt.item.chave === piorItem.chave && pt.val > 0 && !isMelhor;

            return (
              <g key={idx} className="cursor-pointer group">
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isMelhor ? 5 : 3.5}
                  fill={isMelhor ? '#10B981' : isPior ? '#EF4444' : '#10B981'}
                  stroke="#0F172A"
                  strokeWidth="2"
                  className="transition-transform group-hover:scale-150"
                />
                {/* Rótulo Eixo X */}
                {(dados.length <= 12 || idx % 2 === 0 || idx === dados.length - 1) && (
                  <text x={pt.x} y={height - 12} textAnchor="middle" fill="#94A3B8" className="text-[9px]">
                    {pt.rotulo}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Legenda de Picos no Rodapé */}
        <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-2 px-2">
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-emerald-400 uppercase">Melhor {agrupamentoSelecionado === 'hora' ? 'Hora' : 'Dia'}:</span>
            <span className="text-slate-200">{melhorItem ? melhorItem.rotulo : '-'}</span>
          </div>

          {piorItem && (
            <div className="flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-rose-400 uppercase">Pior {agrupamentoSelecionado === 'hora' ? 'Hora' : 'Dia'}:</span>
              <span className="text-slate-200">{piorItem.rotulo}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950">
      {/* CABEÇALHO SUPERIOR */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg md:text-xl font-extrabold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <span>Estatísticas & Analytics</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Relatórios completos de vendas, lucro real, clientes e performance da loja.
            </p>
          </div>
        </div>
      </div>

      {/* ÁREA PRINCIPAL: DUAS COLUNAS (MASTER-DETAIL) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* COLUNA ESQUERDA: LISTA DE INDICADORES / MÉTRICAS */}
        <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/40 flex flex-col overflow-y-auto shrink-0">
          
          {/* SELETOR DE PERÍODO (KYTE STYLE) */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/80 sticky top-0 z-20 space-y-2">
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setPeriodoOffset(prev => prev - 1)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition cursor-pointer"
                title="Período Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="relative flex-1 text-center">
                <button
                  type="button"
                  onClick={() => setDropdownPeriodoAberto(prev => !prev)}
                  className="w-full py-1 text-xs font-bold text-slate-200 hover:text-emerald-400 transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>{labelExibicaoPeriodo}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {/* Dropdown de Períodos */}
                {dropdownPeriodoAberto && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-1.5 z-50 text-left space-y-1 animate-in fade-in zoom-in-95">
                    {PERIODOS_OPCOES.map(op => (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => {
                          setTipoPeriodo(op.id);
                          setPeriodoOffset(0);
                          setDropdownPeriodoAberto(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition ${
                          tipoPeriodo === op.id
                            ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>{op.label}</span>
                        {tipoPeriodo === op.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPeriodoOffset(prev => prev + 1)}
                disabled={periodoOffset >= 0}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                title="Próximo Período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Seletor Customizado se 'personalizado' */}
            {tipoPeriodo === 'personalizado' && (
              <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in">
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">De:</label>
                  <input
                    type="date"
                    value={dataInicioCustom}
                    onChange={(e) => setDataInicioCustom(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Até:</label>
                  <input
                    type="date"
                    value={dataFimCustom}
                    onChange={(e) => setDataFimCustom(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs text-slate-200"
                  />
                </div>
              </div>
            )}
          </div>

          {/* LISTA DE CARDS DE INDICADORES (CLICÁVEIS) */}
          <div className="p-3 space-y-2">
            
            {/* 1. FATURAMENTO */}
            <div
              onClick={() => setMetricaSelecionada('faturamento')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'faturamento'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Faturamento</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="text-lg font-black text-slate-100 mt-1">
                R$ {faturamentoTotal.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>{totalVendas} pedido{totalVendas !== 1 ? 's' : ''}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* 2. VENDAS */}
            <div
              onClick={() => setMetricaSelecionada('vendas')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'vendas'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Vendas</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="text-lg font-black text-slate-100 mt-1">
                {totalVendas}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>Pedidos concluídos</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* 3. TICKET MÉDIO */}
            <div
              onClick={() => setMetricaSelecionada('ticket_medio')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'ticket_medio'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ticket Médio</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="text-lg font-black text-slate-100 mt-1">
                R$ {ticketMedio.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>Média por pedido</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* 4. LUCRO */}
            <div
              onClick={() => setMetricaSelecionada('lucro')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'lucro'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Lucro Real</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="text-lg font-black text-emerald-400 mt-1">
                R$ {lucroTotal.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>Margem: {faturamentoTotal > 0 ? ((lucroTotal / faturamentoTotal) * 100).toFixed(1) : 0}%</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* 5. TAXA DE VENDA */}
            <div
              onClick={() => setMetricaSelecionada('taxa_venda')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'taxa_venda'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Taxa de Venda</span>
                <span className="w-2 h-2 rounded-full bg-slate-500" />
              </div>
              <div className="text-lg font-black text-slate-100 mt-1">
                R$ {taxasVendaTotal.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>Taxas de cartões e meios</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* 6. MEIO DE PAGAMENTO */}
            <div
              onClick={() => setMetricaSelecionada('meio_pagamento')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'meio_pagamento'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Meio de Pagamento</span>
                <div className="w-5 h-5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin-slow" />
              </div>
              <div className="text-base font-black text-slate-100 mt-1">
                {principalMeioPagamento ? `${principalMeioPagamento.percentual.toFixed(1)}%` : '0%'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>Usam {principalMeioPagamento?.nome || 'N/A'}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* 7. RANKING DE PRODUTOS */}
            <div
              onClick={() => setMetricaSelecionada('ranking_produtos')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'ranking_produtos'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ranking de Produtos</span>
                <Package className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-sm font-bold text-slate-100 mt-1 truncate">
                {principalProduto?.nome || 'Nenhum produto'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>#1 em Vendas: R$ {principalProduto ? principalProduto.valor.toFixed(2) : '0,00'}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* 8. RANKING DE CLIENTES */}
            <div
              onClick={() => setMetricaSelecionada('ranking_clientes')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'ranking_clientes'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ranking de Clientes</span>
                <Users className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-sm font-bold text-slate-100 mt-1 truncate">
                {principalCliente?.nome || 'Nenhum cliente'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>#1 em Compras: R$ {principalCliente ? principalCliente.valor.toFixed(2) : '0,00'}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* 9. VENDAS POR USUÁRIO */}
            <div
              onClick={() => setMetricaSelecionada('vendas_usuario')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                metricaSelecionada === 'vendas_usuario'
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Vendas por Usuário</span>
                <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin-slow" />
              </div>
              <div className="text-sm font-bold text-slate-100 mt-1 truncate">
                {principalUsuario?.nome || 'Nenhum usuário'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                <span>#1 em Vendas: R$ {principalUsuario ? principalUsuario.valor.toFixed(2) : '0,00'}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

          </div>
        </div>

        {/* COLUNA DIREITA: DETALHE / GRÁFICOS / TABELAS */}
        <div className="flex-1 bg-slate-950 p-4 md:p-6 overflow-y-auto space-y-6">
          
          {/* PAINEL PARA FATURAMENTO, VENDAS, TICKET MÉDIO, LUCRO, TAXA DE VENDA */}
          {(metricaSelecionada === 'faturamento' ||
            metricaSelecionada === 'vendas' ||
            metricaSelecionada === 'ticket_medio' ||
            metricaSelecionada === 'lucro' ||
            metricaSelecionada === 'taxa_venda') && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-6">
              
              {/* Título & Abas de Agrupamento Temporal */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <h2 className="text-base font-extrabold text-slate-100 capitalize">
                  {metricaSelecionada === 'faturamento' && 'Faturamento'}
                  {metricaSelecionada === 'vendas' && 'Vendas'}
                  {metricaSelecionada === 'ticket_medio' && 'Ticket Médio'}
                  {metricaSelecionada === 'lucro' && 'Lucro Real'}
                  {metricaSelecionada === 'taxa_venda' && 'Taxa de Venda'}
                </h2>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {(['hora', 'dia', 'dia_semana', 'mes'] as TipoAgrupamento[]).map(ag => (
                    <button
                      key={ag}
                      type="button"
                      onClick={() => setAgrupamentoSelecionado(ag)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition ${
                        agrupamentoSelecionado === ag
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {ag === 'dia_semana' ? 'Dia da Semana' : ag === 'mes' ? 'Mês' : ag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gráfico de Linha e Área */}
              {renderLineAreaChart()}

              {/* Tabela Detalhada dos Dados */}
              <div className="overflow-x-auto border-t border-slate-800 pt-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="py-2 px-3">
                        {agrupamentoSelecionado === 'hora' && 'Hora'}
                        {agrupamentoSelecionado === 'dia' && 'Dia'}
                        {agrupamentoSelecionado === 'dia_semana' && 'Dia da Semana'}
                        {agrupamentoSelecionado === 'mes' && 'Mês'}
                      </th>
                      <th className="py-2 px-3 text-right">Faturamento</th>
                      {(metricaSelecionada === 'faturamento' || metricaSelecionada === 'vendas' || metricaSelecionada === 'ticket_medio') && (
                        <>
                          <th className="py-2 px-3 text-right">Vendas</th>
                          <th className="py-2 px-3 text-right">Ticket Médio</th>
                        </>
                      )}
                      {metricaSelecionada === 'lucro' && (
                        <th className="py-2 px-3 text-right text-emerald-400">Lucro</th>
                      )}
                      {metricaSelecionada === 'taxa_venda' && (
                        <th className="py-2 px-3 text-right text-rose-400">Taxa de Venda</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dadosAgrupadosTemporais.filter(d => d.faturamento > 0 || d.vendas > 0).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-slate-500">
                          Nenhuma venda registrada no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      dadosAgrupadosTemporais.filter(d => d.faturamento > 0 || d.vendas > 0).map((linha) => (
                        <tr key={linha.chave} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3 font-semibold text-emerald-400">
                            {linha.rotulo}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-200">
                            R$ {linha.faturamento.toFixed(2)}
                          </td>
                          {(metricaSelecionada === 'faturamento' || metricaSelecionada === 'vendas' || metricaSelecionada === 'ticket_medio') && (
                            <>
                              <td className="py-2.5 px-3 text-right text-slate-300">
                                {linha.vendas}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-slate-300">
                                R$ {linha.ticketMedio.toFixed(2)}
                              </td>
                            </>
                          )}
                          {metricaSelecionada === 'lucro' && (
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                              R$ {linha.lucro.toFixed(2)}
                            </td>
                          )}
                          {metricaSelecionada === 'taxa_venda' && (
                            <td className="py-2.5 px-3 text-right font-bold text-rose-400">
                              R$ {linha.taxaVenda.toFixed(2)}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAINEL PARA MEIO DE PAGAMENTO */}
          {metricaSelecionada === 'meio_pagamento' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base font-extrabold text-slate-100">Meio de Pagamento</h2>
                <p className="text-xs text-slate-400">Distribuição dos valores por forma de pagamento no período.</p>
              </div>

              {/* Gráfico Donut */}
              {renderDonutChart(dadosMeiosPagamento)}

              {/* Tabela de Meios de Pagamento */}
              <div className="overflow-x-auto border-t border-slate-800 pt-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="py-2 px-3">Tipo</th>
                      <th className="py-2 px-3 text-center">Qtd.</th>
                      <th className="py-2 px-3 text-right">Valor</th>
                      <th className="py-2 px-3 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dadosMeiosPagamento.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-slate-500">
                          Nenhum pagamento registrado no período.
                        </td>
                      </tr>
                    ) : (
                      dadosMeiosPagamento.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3 font-semibold text-slate-200 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.cor }} />
                            <span>{item.nome}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-300">
                            {item.qtd}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-200">
                            R$ {item.valor.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-300">
                            {item.percentual.toFixed(2)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-700 font-bold text-slate-100 bg-slate-900/60">
                      <td className="py-3 px-3">Total</td>
                      <td className="py-3 px-3 text-center">{dadosMeiosPagamento.reduce((acc, i) => acc + i.qtd, 0)}</td>
                      <td className="py-3 px-3 text-right text-emerald-400">
                        R$ {dadosMeiosPagamento.reduce((acc, i) => acc + i.valor, 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* PAINEL PARA RANKING DE PRODUTOS */}
          {metricaSelecionada === 'ranking_produtos' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base font-extrabold text-slate-100">Ranking de Produtos</h2>
                <p className="text-xs text-slate-400">Produtos mais vendidos ordenados pelo faturamento gerado.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="py-2 px-3 w-12 text-center">#</th>
                      <th className="py-2 px-3">Nome</th>
                      <th className="py-2 px-3 text-right">Valor</th>
                      <th className="py-2 px-3 text-right">Qtd.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {rankingProdutos.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-slate-500">
                          Nenhum produto vendido no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      rankingProdutos.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-200">
                            {item.nome}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-400">
                            R$ {item.valor.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-200">
                            {item.qtd}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAINEL PARA RANKING DE CLIENTES */}
          {metricaSelecionada === 'ranking_clientes' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base font-extrabold text-slate-100">Ranking de Clientes</h2>
                <p className="text-xs text-slate-400">Clientes com maior volume de compras no período selecionado.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="py-2 px-3 w-12 text-center">#</th>
                      <th className="py-2 px-3">Nome</th>
                      <th className="py-2 px-3 text-right">Valor</th>
                      <th className="py-2 px-3 text-right">Compras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {rankingClientes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-slate-500">
                          Nenhum cliente registrado no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      rankingClientes.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-200">
                            {item.nome}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-400">
                            R$ {item.valor.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-200">
                            {item.compras}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAINEL PARA VENDAS POR USUÁRIO */}
          {metricaSelecionada === 'vendas_usuario' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base font-extrabold text-slate-100">Vendas por Usuário</h2>
                <p className="text-xs text-slate-400">Desempenho e faturamento por operador, vendedor ou catálogo online.</p>
              </div>

              {/* Gráfico Donut de Usuários */}
              {renderDonutChart(vendasPorUsuario)}

              {/* Tabela de Usuários */}
              <div className="overflow-x-auto border-t border-slate-800 pt-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="py-2 px-3">Usuário</th>
                      <th className="py-2 px-3 text-center">Qtd.</th>
                      <th className="py-2 px-3 text-right">Valor</th>
                      <th className="py-2 px-3 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {vendasPorUsuario.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-slate-500">
                          Nenhuma venda registrada no período.
                        </td>
                      </tr>
                    ) : (
                      vendasPorUsuario.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3 font-semibold text-slate-200 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.cor }} />
                            <span>{item.nome}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-300">
                            {item.qtd}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-200">
                            R$ {item.valor.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-300">
                            {item.percentual.toFixed(2)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
