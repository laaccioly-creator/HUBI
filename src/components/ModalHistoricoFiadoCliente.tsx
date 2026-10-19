import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileText,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CreditCard,
  Banknote,
  Zap,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Package
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useTheme } from '../contexts/ThemeContext';
import { Cliente, Pedido, FormaPagamento, TipoPagamento, StatusPagamento } from '../types';
import { caixaService } from '../services/caixaService';
import { SyncService } from '../services/syncService';
import { obterDataOperacaoISO } from '../utils/dataOperacao';
import { obterInfoVencimentoFiado } from '../utils/statusPedidoUtils';

interface ModalHistoricoFiadoClienteProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  onClienteAtualizado: (cliente: Cliente) => void;
  filtroInicial?: 'todos' | 'vencidos' | 'a_vencer';
}

interface LinhaRecebimentoFiado {
  id: string;
  forma_pagamento_id: string;
  forma_tipo: TipoPagamento;
  forma_nome: string;
  valor: number;
  valor_entregue?: number | null;
  parcelas?: number;
}

export const ModalHistoricoFiadoCliente: React.FC<ModalHistoricoFiadoClienteProps> = ({
  isOpen,
  onClose,
  cliente: clienteProp,
  onClienteAtualizado,
  filtroInicial = 'todos'
}) => {
  const { isDark } = useTheme();
  const { loja, usuario } = useAuth();
  const { mostrarSucesso, mostrarAviso, mostrarErro } = useFeedbackModal();

  const [cliente, setCliente] = useState<Cliente | null>(clienteProp);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'vencidos' | 'a_vencer'>(filtroInicial || 'todos');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [itensExpandidos, setItensExpandidos] = useState<Record<string, boolean>>({});
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);

  // Estados do Submodal Receber
  const [modalReceberAberto, setModalReceberAberto] = useState<boolean>(false);
  const [pedidoSelecionadoReceber, setPedidoSelecionadoReceber] = useState<Pedido | null>(null);
  const [valorTotalReceber, setValorTotalReceber] = useState<number>(0);
  const [linhasRecebimento, setLinhasRecebimento] = useState<LinhaRecebimentoFiado[]>([]);
  const [processandoRecebimento, setProcessandoRecebimento] = useState<boolean>(false);

  // Formas de pagamento disponíveis para recebimento (NUNCA fiado)
  const formasValidasRecebimento = useMemo(() => {
    const lista = formasPagamento.length > 0 ? formasPagamento : [
      { id: 'fp_dinheiro', loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro' as TipoPagamento, taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
      { id: 'fp_pix', loja_id: loja?.id || '', nome: 'Pix', tipo: 'pix' as TipoPagamento, taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
      { id: 'fp_debito', loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito' as TipoPagamento, taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
      { id: 'fp_credito', loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito' as TipoPagamento, taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true }
    ];
    // REGRA DE OURO: NUNCA permitir fiado para receber pagamento de fiado
    return lista.filter(f => f.tipo !== 'fiado' && f.ativo);
  }, [formasPagamento, loja?.id]);

  // Carregar dados de pedidos e formas de pagamento
  const carregarDados = async () => {
    const cId = clienteProp?.id || cliente?.id;
    if (!loja?.id || !cId) return;
    try {
      setCarregando(true);

      // Buscar cliente atualizado do banco
      const { data: cliData } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', cId)
        .single();

      if (cliData) {
        setCliente(cliData);
      } else if (clienteProp) {
        setCliente(clienteProp);
      }

      // Buscar formas de pagamento ativas
      const { data: fps } = await supabase
        .from('formas_pagamento')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('ativo', true)
        .order('nome');

      if (fps) {
        setFormasPagamento(fps);
      }

      // Buscar pedidos de fiado ou em aberto do cliente
      const { data: peds, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(
            *,
            forma_pagamento:formas_pagamento(*)
          )
        `)
        .eq('loja_id', loja.id)
        .eq('cliente_id', cId)
        .neq('status', 'cancelado')
        .order('data_venda', { ascending: false });

      if (error) throw error;

      if (peds) {
        // Filtrar apenas pedidos que possuam modalidade Fiado em aberto
        const pedidosComFiado = peds.filter((p: any) => {
          const saldo = Number(p.saldo_devedor ?? (Number(p.valor_total || 0) - Number(p.valor_pago || 0)));
          const fiadoNaoQuitado = p.fiado_quitado !== true;
          const temLinhaFiado = (p.pagamentos && p.pagamentos.some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado')) || p.status_pagamento === 'fiado';
          return temLinhaFiado && fiadoNaoQuitado && saldo > 0;
        });

        setPedidos(pedidosComFiado);
      }
    } catch (err: any) {
      console.error('Erro ao carregar pedidos fiado:', err);
      mostrarErro(err.message || 'Erro ao carregar histórico de fiado');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (isOpen && (clienteProp || cliente)) {
      setCliente(clienteProp);
      carregarDados();
      setModalReceberAberto(false);
      setPedidoSelecionadoReceber(null);
      setFiltroStatus(filtroInicial || 'todos');
    }
  }, [isOpen, clienteProp?.id, filtroInicial]);

  const alternarExpansaoItens = (pedidoId: string) => {
    setItensExpandidos(prev => ({
      ...prev,
      [pedidoId]: !prev[pedidoId]
    }));
  };

  const formatarData = (dataStr?: string | null) => {
    if (!dataStr) return '-';
    try {
      const d = new Date(dataStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dataStr;
    }
  };

  const obterInfoVencimento = (pedido: Pedido) => {
    return obterInfoVencimentoFiado(pedido);
  };

  const pedidosAVencer = useMemo(() => {
    return pedidos.filter(p => !obterInfoVencimento(p).estaVencido);
  }, [pedidos]);

  const pedidosVencidos = useMemo(() => {
    return pedidos.filter(p => obterInfoVencimento(p).estaVencido);
  }, [pedidos]);

  const pedidosFiltrados = useMemo(() => {
    if (filtroStatus === 'vencidos') return pedidosVencidos;
    if (filtroStatus === 'a_vencer') return pedidosAVencer;
    return pedidos;
  }, [pedidos, filtroStatus, pedidosVencidos, pedidosAVencer]);

  // Abrir Modal Receber para um pedido específico
  const handleAbrirReceberPedido = (pedido: Pedido) => {
    const saldo = Number(pedido.saldo_devedor ?? (Number(pedido.valor_total) - Number(pedido.valor_pago || 0)));
    const valorParaReceber = Math.max(0, saldo > 0 ? saldo : Number(pedido.valor_total));
    setPedidoSelecionadoReceber(pedido);
    setValorTotalReceber(valorParaReceber);

    const fpPadrao = formasValidasRecebimento[0];
    setLinhasRecebimento([
      {
        id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        forma_pagamento_id: fpPadrao.id,
        forma_tipo: fpPadrao.tipo,
        forma_nome: fpPadrao.nome,
        valor: valorParaReceber,
        valor_entregue: null,
        parcelas: 1
      }
    ]);
    setModalReceberAberto(true);
  };

  // Abrir Modal Receber para o saldo total do cliente
  const handleAbrirReceberTotalCliente = () => {
    const totalDevedor = Number(cliente?.saldo_devedor_fiado || 0);
    if (totalDevedor <= 0) {
      mostrarAviso('O cliente não possui débitos de fiado pendentes.');
      return;
    }
    setPedidoSelecionadoReceber(null);
    setValorTotalReceber(totalDevedor);

    const fpPadrao = formasValidasRecebimento[0];
    setLinhasRecebimento([
      {
        id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        forma_pagamento_id: fpPadrao.id,
        forma_tipo: fpPadrao.tipo,
        forma_nome: fpPadrao.nome,
        valor: totalDevedor,
        valor_entregue: null,
        parcelas: 1
      }
    ]);
    setModalReceberAberto(true);
  };

  // Handlers do Multi-pagamento no recebimento
  const handleAlterarFormaLinha = (linhaId: string, fp: FormaPagamento) => {
    setLinhasRecebimento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return {
        ...l,
        forma_pagamento_id: fp.id,
        forma_tipo: fp.tipo,
        forma_nome: fp.nome,
        parcelas: fp.tipo === 'cartao_credito' ? (l.parcelas || 1) : 1
      };
    }));
  };

  const handleAlterarValorLinha = (linhaId: string, valor: number) => {
    setLinhasRecebimento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return { ...l, valor: Math.max(0, valor) };
    }));
  };

  const handleAlterarEntregueLinha = (linhaId: string, entregue: number) => {
    setLinhasRecebimento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return { ...l, valor_entregue: entregue };
    }));
  };

  const handleAlterarParcelasLinha = (linhaId: string, parcelas: number) => {
    setLinhasRecebimento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return { ...l, parcelas: Math.max(1, parcelas) };
    }));
  };

  const totalLinhasRecebimento = useMemo(() => {
    return linhasRecebimento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
  }, [linhasRecebimento]);

  const diferencaRecebimento = useMemo(() => {
    return Number((valorTotalReceber - totalLinhasRecebimento).toFixed(2));
  }, [valorTotalReceber, totalLinhasRecebimento]);

  const handleAdicionarLinha = () => {
    const restante = Math.max(0, diferencaRecebimento);
    const fpPadrao = formasValidasRecebimento.find(f => !linhasRecebimento.some(l => l.forma_tipo === f.tipo)) || formasValidasRecebimento[0];
    setLinhasRecebimento(prev => [
      ...prev,
      {
        id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        forma_pagamento_id: fpPadrao.id,
        forma_tipo: fpPadrao.tipo,
        forma_nome: fpPadrao.nome,
        valor: restante,
        valor_entregue: null,
        parcelas: 1
      }
    ]);
  };

  const handleRemoverLinha = (linhaId: string) => {
    if (linhasRecebimento.length <= 1) return;
    setLinhasRecebimento(prev => prev.filter(l => l.id !== linhaId));
  };

  // Concluir Recebimento de Fiado
  const handleConfirmarRecebimento = async () => {
    if (!cliente || !loja?.id) return;

    if (linhasRecebimento.length === 0 || totalLinhasRecebimento <= 0) {
      mostrarAviso('Informe um valor válido a receber.');
      return;
    }

    if (Math.abs(diferencaRecebimento) > 0.05) {
      mostrarAviso(`A soma dos meios de pagamento (R$ ${totalLinhasRecebimento.toFixed(2)}) difere do valor total a receber (R$ ${valorTotalReceber.toFixed(2)}).`);
      return;
    }

    try {
      setProcessandoRecebimento(true);
      const dataIso = obterDataOperacaoISO();
      const valorRecebido = totalLinhasRecebimento;

      // 1. Atualizar Pedido(s)
      if (pedidoSelecionadoReceber) {
        const ped = pedidoSelecionadoReceber;
        const valorJaPago = Number(ped.valor_pago || 0);
        const valorTotalPed = Number(ped.valor_total || 0);
        const novoValorPago = valorJaPago + valorRecebido;
        const novoSaldoDevedor = Math.max(0, valorTotalPed - novoValorPago);
        const quitado = novoSaldoDevedor <= 0;
        const novoStatusPag: StatusPagamento = quitado
          ? 'pago'
          : novoValorPago > 0
          ? 'parcialmente_pago'
          : 'aguardando_pagamento';

        // Inserir cada forma de pagamento usada em pagamentos_pedido
        for (const linha of linhasRecebimento) {
          const fpIdReal = await SyncService.resolverFormaPagamentoId(loja.id, linha.forma_pagamento_id, linha.forma_tipo);
          const fpRef = formasValidasRecebimento.find(f => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
          const taxa = (Number(linha.valor) * Number(fpRef?.taxa_percentual || 0)) / 100;

          await supabase.from('pagamentos_pedido').insert([{
            loja_id: loja.id,
            pedido_id: ped.id,
            forma_pagamento_id: fpIdReal,
            valor: Number(linha.valor),
            parcelas: linha.parcelas || 1,
            valor_taxa: taxa,
            valor_liquido: Number(linha.valor) - taxa,
            data_pagamento: dataIso,
            eh_pagamento_fiado: false
          }]);
        }

        await supabase.from('pedidos').update({
          status: quitado ? 'concluido' : ped.status,
          valor_pago: novoValorPago,
          saldo_devedor: novoSaldoDevedor,
          fiado_quitado: quitado,
          status_pagamento: novoStatusPag,
          atualizado_em: dataIso
        }).eq('id', ped.id);

        if (quitado && loja?.id) {
          try {
            await supabase.from('historico_pedidos').insert([{
              loja_id: loja.id,
              pedido_id: ped.id,
              usuario_id: usuario?.id || null,
              tipo_evento: 'status_alterado',
              status_anterior: ped.status,
              status_novo: 'concluido',
              descricao: `Fiado quitado (R$ ${valorRecebido.toFixed(2)}) - Pedido concluído e transferido para Vendas`
            }]);
          } catch (eH) {
            console.warn('Aviso ao registrar historico_pedidos:', eH);
          }
        }
      } else {
        // Abatimento em múltiplos pedidos em aberto do cliente
        let saldoParaAbater = valorRecebido;
        for (const ped of pedidos) {
          if (saldoParaAbater <= 0) break;
          const saldoPed = Number(ped.saldo_devedor ?? (Number(ped.valor_total) - Number(ped.valor_pago || 0)));
          if (saldoPed > 0) {
            const abaterDeste = Math.min(saldoPed, saldoParaAbater);
            const novoPago = Number(ped.valor_pago || 0) + abaterDeste;
            const novoSaldo = saldoPed - abaterDeste;
            const quitado = novoSaldo <= 0;

            await supabase.from('pedidos').update({
              status: quitado ? 'concluido' : ped.status,
              valor_pago: novoPago,
              saldo_devedor: novoSaldo,
              fiado_quitado: quitado,
              status_pagamento: quitado ? 'pago' : 'parcialmente_pago',
              atualizado_em: dataIso
            }).eq('id', ped.id);

            if (quitado && loja?.id) {
              try {
                await supabase.from('historico_pedidos').insert([{
                  loja_id: loja.id,
                  pedido_id: ped.id,
                  usuario_id: usuario?.id || null,
                  tipo_evento: 'status_alterado',
                  status_anterior: ped.status,
                  status_novo: 'concluido',
                  descricao: `Fiado quitado (R$ ${abaterDeste.toFixed(2)}) - Pedido concluído e transferido para Vendas`
                }]);
              } catch (eH) {
                console.warn('Aviso ao registrar historico_pedidos:', eH);
              }
            }

            saldoParaAbater -= abaterDeste;
          }
        }
      }

      // 2. REGRA DE CRÉDITO: Devolver o valor pago ao limite de crédito do cliente e abater do saldo devedor
      const novoLimiteCredito = Number(cliente.limite_credito || 0) + valorRecebido;
      const novoSaldoDevedorFiado = Math.max(0, Number(cliente.saldo_devedor_fiado || 0) - valorRecebido);

      const { error: erroCli } = await supabase
        .from('clientes')
        .update({
          limite_credito: novoLimiteCredito,
          saldo_devedor_fiado: novoSaldoDevedorFiado
        })
        .eq('id', cliente.id);

      if (erroCli) throw erroCli;

      const clienteAtualizado: Cliente = {
        ...cliente,
        limite_credito: novoLimiteCredito,
        saldo_devedor_fiado: novoSaldoDevedorFiado
      };
      setCliente(clienteAtualizado);
      onClienteAtualizado(clienteAtualizado);

      // 3. REGRA DE CAIXA: Lançar os valores recebidos na sessão de caixa ativa
      try {
        await caixaService.registrarVendaPedido({
          lojaId: loja.id,
          pedido: pedidoSelecionadoReceber || {
            id: 'rec_fiado_' + Date.now(),
            numero_pedido: 999999,
            valor_total: valorRecebido
          } as any,
          pagamentos: linhasRecebimento.map(l => ({
            forma_nome: l.forma_nome,
            forma_tipo: l.forma_tipo,
            valor: Number(l.valor)
          })),
          usuarioId: usuario?.id || ''
        });
      } catch (errCaixa) {
        console.warn('Aviso ao lançar recebimento no caixa:', errCaixa);
      }

      // 4. Registrar transação financeira de entrada
      try {
        await supabase.from('transacoes_financeiras').insert([{
          loja_id: loja.id,
          tipo: 'ENTRADA',
          categoria: 'Recebimento de Fiado',
          descricao: `Recebimento de Fiado: ${cliente.nome} ${pedidoSelecionadoReceber ? `(Pedido #${pedidoSelecionadoReceber.numero_pedido})` : ''}`.trim(),
          valor: valorRecebido,
          forma_pagamento: linhasRecebimento.map(l => l.forma_nome).join(' + '),
          status: 'pago',
          data_vencimento: dataIso.split('T')[0],
          data_pagamento: dataIso,
          pedido_id: pedidoSelecionadoReceber?.id || null
        }]);
      } catch (errFin) {
        console.warn('Aviso ao registrar transação financeira:', errFin);
      }

      mostrarSucesso(`Recebimento de R$ ${valorRecebido.toFixed(2)} confirmado! Limite de crédito do cliente restabelecido para R$ ${novoLimiteCredito.toFixed(2)}.`);

      // 5. Opção de comprovante via WhatsApp
      const phone = cliente.whatsapp || cliente.telefone;
      if (phone) {
        const msg = `🧾 *COMPROVANTE DE PAGAMENTO DE FIADO - ${loja.nome_fantasia}*\n\nOlá, *${cliente.nome}*!\nConfirmamos o recebimento de *R$ ${valorRecebido.toFixed(2)}* referente ao pagamento de fiado.\n\n💳 *Limite de Crédito Disponível:* R$ ${novoLimiteCredito.toFixed(2)}\n💰 *Saldo Devedor Restante:* R$ ${novoSaldoDevedorFiado.toFixed(2)}\n\nAgradecemos pela pontualidade! ✨`;
        const phoneFormatado = phone.replace(/\D/g, '');
        window.open(`https://api.whatsapp.com/send?phone=55${phoneFormatado}&text=${encodeURIComponent(msg)}`, '_blank');
      }

      setModalReceberAberto(false);
      setPedidoSelecionadoReceber(null);
      await carregarDados();
    } catch (err: any) {
      console.error('Erro ao processar recebimento:', err);
      mostrarErro(err.message || 'Erro ao processar recebimento de fiado.');
    } finally {
      setProcessandoRecebimento(false);
    }
  };

  if (!isOpen || !cliente) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[70] animate-in fade-in">
      <div className={`rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 ${
        isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
      }`}>
        
        {/* Cabeçalho */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between ${
          isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isDark ? 'bg-[#000000] border border-amber-500/50 text-amber-400' : 'bg-white border-2 border-amber-300 text-amber-700'
            }`}>
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-black text-base leading-tight ${isDark ? 'text-white' : 'text-black'}`}>
                {filtroStatus === 'vencidos'
                  ? 'Compras Fiado Vencidas'
                  : filtroStatus === 'a_vencer'
                  ? 'Compras Fiado a Vencer'
                  : 'Histórico de Compras Fiado'}
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-white' : 'text-black font-semibold'}`}>
                Cliente: <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{cliente.nome}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-xs"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo do Cliente (Saldo Devedor e Limite de Crédito) */}
        <div className={`p-4 sm:p-5 border-b grid grid-cols-2 gap-3 ${
          isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
        }`}>
          <div className={`p-3.5 rounded-2xl space-y-1 shadow-xs ${
            isDark ? 'bg-[#000000] border border-amber-500/50' : 'bg-white border-2 border-amber-300'
          }`}>
            <span className={`text-xs font-black block ${isDark ? 'text-amber-400' : 'text-amber-900'}`}>Total Fiado (Saldo Devedor)</span>
            <span className={`text-xl sm:text-2xl font-black block ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
              R$ {Number(cliente.saldo_devedor_fiado || 0).toFixed(2)}
            </span>
            <span className={`text-[11px] font-bold block ${isDark ? 'text-white' : 'text-black'}`}>
              {pedidosFiltrados.length} {pedidosFiltrados.length === 1 ? 'compra listada' : 'compras listadas'}
            </span>
          </div>

          <div className={`p-3.5 rounded-2xl space-y-1 flex flex-col justify-between shadow-xs ${
            isDark ? 'bg-[#000000] border border-emerald-500/50' : 'bg-white border-2 border-emerald-300'
          }`}>
            <div>
              <span className={`text-xs font-black block ${isDark ? 'text-emerald-400' : 'text-emerald-900'}`}>Limite de Crédito Disponível</span>
              <span className={`text-xl sm:text-2xl font-black block ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                R$ {Number(cliente.limite_credito || 0).toFixed(2)}
              </span>
            </div>
            {Number(cliente.saldo_devedor_fiado || 0) > 0 && (
              <button
                type="button"
                onClick={handleAbrirReceberTotalCliente}
                className="w-full mt-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 border border-emerald-500"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Receber Total</span>
              </button>
            )}
          </div>
        </div>

        {/* Filtros rápidos: Todas | A Vencer | Vencidas */}
        <div className={`px-4 sm:px-5 py-2.5 border-b flex items-center gap-2 shrink-0 ${
          isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
        }`}>
          <button
            type="button"
            onClick={() => setFiltroStatus('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              filtroStatus === 'todos'
                ? 'bg-emerald-600 text-white shadow-xs border border-emerald-500'
                : isDark
                ? 'bg-[#000000] text-white border border-slate-700 hover:border-slate-500'
                : 'bg-white text-black border-2 border-slate-300 hover:border-slate-400'
            }`}
          >
            Todas ({pedidos.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroStatus('a_vencer')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              filtroStatus === 'a_vencer'
                ? 'bg-amber-600 text-white shadow-xs border border-amber-500'
                : isDark
                ? 'bg-[#000000] text-amber-400 border border-slate-700 hover:border-amber-500'
                : 'bg-white text-amber-900 border-2 border-slate-300 hover:border-amber-400'
            }`}
          >
            A Vencer ({pedidosAVencer.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroStatus('vencidos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              filtroStatus === 'vencidos'
                ? 'bg-rose-600 text-white shadow-xs border border-rose-500'
                : isDark
                ? 'bg-[#000000] text-rose-400 border border-slate-700 hover:border-rose-500'
                : 'bg-white text-rose-900 border-2 border-slate-300 hover:border-rose-400'
            }`}
          >
            Vencidas ({pedidosVencidos.length})
          </button>
        </div>

        {/* Lista de Compras / Pedidos de Fiado */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 ${
          isDark ? 'bg-[#08131A]' : 'bg-slate-100'
        }`}>
          {carregando ? (
            <div className="py-16 text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
              <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>Carregando compras no fiado...</p>
            </div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className={`py-16 text-center space-y-2 rounded-2xl p-8 shadow-xs ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>
                {filtroStatus === 'vencidos'
                  ? 'Nenhuma compra vencida!'
                  : filtroStatus === 'a_vencer'
                  ? 'Nenhuma compra a vencer!'
                  : 'Nenhum fiado pendente!'}
              </h4>
              <p className={`text-xs max-w-sm mx-auto ${isDark ? 'text-white font-semibold' : 'text-black font-semibold'}`}>
                {filtroStatus === 'vencidos'
                  ? 'Todas as compras deste cliente estão com o pagamento em dia.'
                  : filtroStatus === 'a_vencer'
                  ? 'Não há compras no fiado a vencer para este cliente.'
                  : 'Este cliente não possui compras a prazo em aberto no momento.'}
              </p>
            </div>
          ) : (
            pedidosFiltrados.map((pedido) => {
              const infoVenc = obterInfoVencimento(pedido);
              const saldoPed = Number(pedido.saldo_devedor ?? (Number(pedido.valor_total) - Number(pedido.valor_pago || 0)));
              const expandido = !!itensExpandidos[pedido.id];

              return (
                <div
                  key={pedido.id}
                  className={`rounded-2xl p-4 space-y-3 transition shadow-xs ${
                    isDark
                      ? 'bg-[#000000] border border-slate-700 hover:border-slate-500'
                      : 'bg-white border-2 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {/* Topo do Pedido */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>
                          Pedido #{pedido.numero_pedido || pedido.id.slice(0, 8)}
                        </span>
                        {/* Vencimento com destaque se vencido */}
                        {infoVenc.estaVencido ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white border border-rose-500 shadow-xs">
                            ⚠️ VENCIDO ({infoVenc.formatada})
                          </span>
                        ) : (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            isDark
                              ? 'bg-amber-950/60 text-amber-400 border border-amber-600/50'
                              : 'bg-amber-100 text-amber-900 border-2 border-amber-300'
                          }`}>
                            Vence em: {infoVenc.formatada}
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center gap-3 text-xs mt-1 ${isDark ? 'text-white font-semibold' : 'text-black font-semibold'}`}>
                        <span className="flex items-center gap-1">
                          <Calendar className={`w-3.5 h-3.5 ${isDark ? 'text-white' : 'text-black'}`} />
                          Compra: {formatarData(pedido.data_venda)}
                        </span>
                      </div>
                    </div>

                    {/* Botão Receber */}
                    <button
                      type="button"
                      onClick={() => handleAbrirReceberPedido(pedido)}
                      className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 border border-emerald-500"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Receber</span>
                    </button>
                  </div>

                  {/* Valores */}
                  <div className={`grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl text-center ${
                    isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-slate-100 border-2 border-slate-300'
                  }`}>
                    <div>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-white' : 'text-black'}`}>Total Compra</span>
                      <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>
                        R$ {Number(pedido.valor_total).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-900'}`}>Valor Pago</span>
                      <span className={`text-xs font-black ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        R$ {Number(pedido.valor_pago || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className={`text-[10px] block font-black ${isDark ? 'text-amber-400' : 'text-amber-900'}`}>Valor Fiado</span>
                      <span className={`text-xs font-black ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        R$ {saldoPed.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Produtos da Compra (Accordion) */}
                  {pedido.itens && pedido.itens.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => alternarExpansaoItens(pedido.id)}
                        className={`w-full flex items-center justify-between text-xs font-bold transition py-1 cursor-pointer ${
                          isDark ? 'text-white hover:text-white' : 'text-black hover:text-black'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Package className={`w-3.5 h-3.5 ${isDark ? 'text-white' : 'text-black'}`} />
                          <span>{pedido.itens.length} {pedido.itens.length === 1 ? 'produto nesta compra' : 'produtos nesta compra'}</span>
                        </span>
                        {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {expandido && (
                        <div className={`mt-2 divide-y rounded-xl p-2.5 space-y-1.5 ${
                          isDark
                            ? 'bg-[#08131A] border border-slate-700 divide-slate-800'
                            : 'bg-slate-100 border-2 border-slate-300 divide-slate-200'
                        }`}>
                          {pedido.itens.map((item: any, itIdx: number) => (
                            <div key={item.id || itIdx} className="flex items-center justify-between text-xs pt-1.5 first:pt-0">
                              <div>
                                <span className={`font-bold block ${isDark ? 'text-white' : 'text-black'}`}>
                                  {item.quantidade}x {item.nome_produto}
                                </span>
                                {item.rotulo_variacao && (
                                  <span className={`text-[10px] block font-medium ${isDark ? 'text-white' : 'text-black'}`}>
                                    Var: {item.rotulo_variacao}
                                  </span>
                                )}
                              </div>
                              <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>
                                R$ {Number(item.subtotal || item.quantidade * item.preco_venda_unitario).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé */}
        <div className={`p-4 border-t flex justify-end ${
          isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`py-2.5 px-5 rounded-xl font-bold text-xs transition cursor-pointer ${
              isDark
                ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
                : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Fechar
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUBMODAL RECEBER (MULTI-PAGAMENTO - NUNCA FIADO - LANÇA NO CAIXA) */}
      {/* ========================================================================= */}
      {modalReceberAberto && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[80] animate-in fade-in">
          <div className={`rounded-3xl w-full max-w-xl sm:max-w-2xl p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto ${
            isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-slate-100 border-2 border-slate-300 text-black'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-slate-700' : 'border-slate-300'
            }`}>
              <h3 className={`font-black text-base flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-black'
              }`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isDark ? 'bg-[#000000] border border-emerald-500/50 text-emerald-400' : 'bg-white border-2 border-emerald-300 text-emerald-700'
                }`}>
                  <CreditCard className="w-4 h-4" />
                </div>
                <span>Receber Pagamento do Fiado</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalReceberAberto(false)}
                className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-xs"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informações do Recebimento */}
            <div className={`p-3.5 rounded-2xl text-center space-y-1 shadow-xs ${
              isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
            }`}>
              <span className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-black'}`}>
                {pedidoSelecionadoReceber
                  ? `Receber Pedido #${pedidoSelecionadoReceber.numero_pedido || pedidoSelecionadoReceber.id.slice(0, 8)}`
                  : 'Recebimento de Fiado (Saldo do Cliente)'}
              </span>
              <span className={`text-3xl font-black block ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                R$ {valorTotalReceber.toFixed(2)}
              </span>
              <span className={`text-[11px] block ${isDark ? 'text-white' : 'text-black font-semibold'}`}>
                Cliente: <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{cliente.nome}</span>
              </span>
            </div>

            {/* Linhas de Multi-Pagamento */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>
                  Meios de Pagamento ({linhasRecebimento.length}):
                </span>
                <span className={`text-[11px] font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                  Permite mais de um meio (Dinheiro, Pix, Cartão)
                </span>
              </div>

              {linhasRecebimento.map((linha, idx) => {
                const formaSel = formasValidasRecebimento.find(f => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
                const maxParc = formaSel?.maximo_parcelas || 12;

                return (
                  <div key={linha.id} className={`p-3 rounded-2xl space-y-2.5 shadow-xs ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-black flex items-center gap-1.5 ${
                        isDark ? 'text-emerald-400' : 'text-emerald-800'
                      }`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                          isDark ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}>
                          {idx + 1}
                        </span>
                        Meio #{idx + 1}
                      </span>
                      {linhasRecebimento.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoverLinha(linha.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Botões de Seleção do Meio em 2 colunas com texto completo */}
                    <div className="grid grid-cols-2 gap-2">
                      {formasValidasRecebimento.map((fp) => {
                        const sel = linha.forma_pagamento_id === fp.id || (!linha.forma_pagamento_id && linha.forma_tipo === fp.tipo);
                        return (
                          <button
                            key={fp.id}
                            type="button"
                            onClick={() => handleAlterarFormaLinha(linha.id, fp)}
                            className={`p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 ${
                              sel
                                ? 'border-emerald-500 bg-emerald-600 text-white shadow-xs'
                                : isDark
                                ? 'border-slate-700 bg-[#08131A] text-white hover:border-slate-500'
                                : 'border-2 border-slate-300 bg-white text-black hover:border-slate-400'
                            }`}
                          >
                            {fp.tipo === 'dinheiro' && <Banknote className="w-4 h-4 text-emerald-500 shrink-0" />}
                            {fp.tipo === 'pix' && <Zap className="w-4 h-4 text-cyan-500 shrink-0" />}
                            {fp.tipo === 'cartao_debito' && <CreditCard className="w-4 h-4 text-blue-500 shrink-0" />}
                            {fp.tipo === 'cartao_credito' && <CreditCard className="w-4 h-4 text-purple-500 shrink-0" />}
                            <span className="whitespace-normal text-center">{fp.nome}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Valor deste meio */}
                    <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                      isDark ? 'border-slate-700' : 'border-slate-200'
                    }`}>
                      <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>Valor pago:</span>
                      <div className={`flex items-center gap-1 rounded-xl px-2.5 py-1 ${
                        isDark ? 'bg-[#08131A] border border-slate-700 focus-within:border-emerald-500' : 'bg-white border-2 border-slate-300 focus-within:border-emerald-500'
                      }`}>
                        <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={linha.valor > 0 ? linha.valor : ''}
                          onChange={(e) => handleAlterarValorLinha(linha.id, parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className={`w-28 bg-transparent text-right text-xs font-black focus:outline-none ${
                            isDark ? 'text-white placeholder:text-slate-500' : 'text-black placeholder:text-slate-400'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Troco se for dinheiro */}
                    {linha.forma_tipo === 'dinheiro' && (
                      <div className={`space-y-1.5 pt-1.5 border-t text-xs ${
                        isDark ? 'border-slate-700' : 'border-slate-200'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>Valor Entregue pelo Cliente:</span>
                          <div className={`flex items-center gap-1 rounded-xl px-2.5 py-1 ${
                            isDark ? 'bg-[#08131A] border border-slate-700' : 'bg-white border-2 border-slate-300'
                          }`}>
                            <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>R$</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={linha.valor_entregue != null && linha.valor_entregue > 0 ? linha.valor_entregue : ''}
                              onChange={(e) => handleAlterarEntregueLinha(linha.id, parseFloat(e.target.value) || 0)}
                              className={`w-28 bg-transparent text-right text-xs font-black focus:outline-none ${
                                isDark ? 'text-white placeholder:text-slate-500' : 'text-black placeholder:text-slate-400'
                              }`}
                            />
                          </div>
                        </div>
                        {linha.valor_entregue != null && linha.valor_entregue > linha.valor && (
                          <div className={`flex justify-between font-black ${
                            isDark ? 'text-amber-400' : 'text-amber-700'
                          }`}>
                            <span>Troco a devolver:</span>
                            <span>R$ {(linha.valor_entregue - linha.valor).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Parcelas se for cartão de crédito */}
                    {linha.forma_tipo === 'cartao_credito' && (
                      <div className={`flex items-center justify-between gap-2 pt-1.5 border-t text-xs ${
                        isDark ? 'border-slate-700' : 'border-slate-200'
                      }`}>
                        <span className={`font-bold ${isDark ? 'text-white' : 'text-black'}`}>Parcelas:</span>
                        <select
                          value={linha.parcelas || 1}
                          onChange={(e) => handleAlterarParcelasLinha(linha.id, parseInt(e.target.value) || 1)}
                          className={`rounded-xl px-2 py-1 text-xs font-black focus:border-emerald-500 focus:outline-none cursor-pointer ${
                            isDark ? 'bg-[#08131A] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                          }`}
                        >
                          {Array.from({ length: Math.min(12, maxParc) }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num} className={isDark ? 'bg-[#08131A] text-white' : 'bg-white text-black'}>
                              {num}x {linha.valor > 0 ? `de R$ ${(linha.valor / num).toFixed(2)}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Botão Adicionar Outro Meio */}
              <button
                type="button"
                onClick={handleAdicionarLinha}
                className={`w-full py-2.5 px-3 rounded-2xl border border-dashed text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98 ${
                  isDark
                    ? 'border-emerald-500/50 bg-[#000000] text-emerald-400 hover:bg-emerald-950/20'
                    : 'border-2 border-emerald-600 bg-white text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>
                  Adicionar outro meio de pagamento {diferencaRecebimento > 0 ? `(Faltam R$ ${diferencaRecebimento.toFixed(2)})` : ''}
                </span>
              </button>
            </div>

            {/* Resumo de Conferência */}
            <div className={`p-3 rounded-2xl space-y-1.5 text-xs shadow-xs ${
              isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="flex justify-between font-bold">
                <span className={isDark ? 'text-white' : 'text-black'}>Total a Receber:</span>
                <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>R$ {valorTotalReceber.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className={isDark ? 'text-white' : 'text-black'}>Total dos Meios Informados:</span>
                <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>R$ {totalLinhasRecebimento.toFixed(2)}</span>
              </div>
              <div className={`flex justify-between font-black pt-1.5 border-t ${
                isDark ? 'border-slate-700' : 'border-slate-200'
              }`}>
                {Math.abs(diferencaRecebimento) < 0.01 ? (
                  <>
                    <span className={`flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Total Conferido
                    </span>
                    <span className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>R$ 0,00</span>
                  </>
                ) : diferencaRecebimento > 0 ? (
                  <>
                    <span className={isDark ? 'text-amber-400' : 'text-amber-700'}>Falta informar:</span>
                    <span className={isDark ? 'text-amber-400' : 'text-amber-700'}>R$ {diferencaRecebimento.toFixed(2)}</span>
                  </>
                ) : (
                  <>
                    <span className={isDark ? 'text-rose-400' : 'text-rose-700'}>Excedente:</span>
                    <span className={isDark ? 'text-rose-400' : 'text-rose-700'}>R$ {Math.abs(diferencaRecebimento).toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalReceberAberto(false)}
                className={`py-3 px-4 rounded-2xl font-bold text-xs transition cursor-pointer ${
                  isDark
                    ? 'bg-[#000000] text-white border border-slate-700 hover:bg-slate-900'
                    : 'bg-white text-black border-2 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={processandoRecebimento || Math.abs(diferencaRecebimento) > 0.01}
                onClick={handleConfirmarRecebimento}
                className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-98 border border-emerald-500"
              >
                {processandoRecebimento ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirmando no Caixa...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar e Devolver Crédito</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
