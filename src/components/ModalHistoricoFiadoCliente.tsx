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
  MessageCircle,
  Package,
  ArrowRight,
  Receipt
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { Cliente, Pedido, FormaPagamento, TipoPagamento, StatusPagamento } from '../types';
import { caixaService } from '../services/caixaService';
import { SyncService } from '../services/syncService';
import { obterDataOperacaoISO } from '../utils/dataOperacao';

interface ModalHistoricoFiadoClienteProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  onClienteAtualizado: (cliente: Cliente) => void;
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
  cliente,
  onClienteAtualizado
}) => {
  const { loja, usuario } = useAuth();
  const { mostrarSucesso, mostrarAviso, mostrarErro } = useFeedbackModal();

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
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
    if (!loja?.id || !cliente?.id) return;
    try {
      setCarregando(true);

      // Buscar formas de pagamento
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
        .eq('cliente_id', cliente.id)
        .neq('status', 'cancelado')
        .order('data_venda', { ascending: false });

      if (error) throw error;

      if (peds) {
        // Filtrar apenas pedidos que possuam pagamento na modalidade Fiado em aberto
        const pedidosComFiado = peds.filter((p: any) => {
          const saldo = Number(p.saldo_devedor ?? 0);
          const fiadoNaoQuitado = p.fiado_quitado === false;
          const temLinhaFiado = p.pagamentos && p.pagamentos.some((pag: any) => pag.eh_pagamento_fiado || pag.forma_pagamento?.tipo === 'fiado');
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
    if (isOpen && cliente) {
      carregarDados();
      setModalReceberAberto(false);
      setPedidoSelecionadoReceber(null);
    }
  }, [isOpen, cliente?.id]);

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
    let dataVenc: string | null = pedido.data_vencimento_fiado || null;
    if (!dataVenc && pedido.metadados) {
      try {
        const meta = typeof pedido.metadados === 'string' ? JSON.parse(pedido.metadados) : pedido.metadados;
        dataVenc = meta?.data_vencimento_fiado || null;
      } catch (e) {}
    }
    if (!dataVenc && pedido.data_venda) {
      const dv = new Date(pedido.data_venda);
      dv.setDate(dv.getDate() + 30);
      dataVenc = dv.toISOString().split('T')[0];
    }
    if (!dataVenc) {
      dataVenc = new Date().toISOString().split('T')[0];
    }

    const hoje = new Date().toISOString().split('T')[0];
    const estaVencido = dataVenc < hoje;

    return {
      dataIso: dataVenc,
      formatada: formatarData(dataVenc),
      estaVencido
    };
  };

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
          valor_pago: novoValorPago,
          saldo_devedor: novoSaldoDevedor,
          fiado_quitado: quitado,
          status_pagamento: novoStatusPag,
          atualizado_em: dataIso
        }).eq('id', ped.id);
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
              valor_pago: novoPago,
              saldo_devedor: novoSaldo,
              fiado_quitado: quitado,
              status_pagamento: quitado ? 'pago' : 'parcialmente_pago',
              atualizado_em: dataIso
            }).eq('id', ped.id);

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
      onClienteAtualizado(clienteAtualizado);

      // 3. REGRA DE CAIXA: Somente agora lançar os valores recebidos na sessão de caixa ativa
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
          data_pagamento: dataIso
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div>
            <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              <span>Histórico de Compras Fiado</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cliente: <span className="font-bold text-slate-200">{cliente.nome}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo do Cliente (Saldo Devedor e Limite de Crédito) */}
        <div className="p-4 sm:p-5 bg-slate-950/60 border-b border-slate-800 grid grid-cols-2 gap-3">
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1">
            <span className="text-xs text-amber-300/80 font-semibold block">Total Fiado (Saldo Devedor)</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400 block">
              R$ {Number(cliente.saldo_devedor_fiado || 0).toFixed(2)}
            </span>
            <span className="text-[11px] text-amber-200/70">
              {pedidos.length} {pedidos.length === 1 ? 'compra em aberto' : 'compras em aberto'}
            </span>
          </div>

          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-1 flex flex-col justify-between">
            <div>
              <span className="text-xs text-emerald-300/80 font-semibold block">Limite de Crédito Disponível</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400 block">
                R$ {Number(cliente.limite_credito || 0).toFixed(2)}
              </span>
            </div>
            {Number(cliente.saldo_devedor_fiado || 0) > 0 && (
              <button
                type="button"
                onClick={handleAbrirReceberTotalCliente}
                className="w-full mt-2 py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Receber Total</span>
              </button>
            )}
          </div>
        </div>

        {/* Lista de Compras / Pedidos de Fiado */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {carregando ? (
            <div className="py-16 text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
              <p className="text-xs text-slate-400">Carregando compras no fiado...</p>
            </div>
          ) : pedidos.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400/50 mx-auto" />
              <h4 className="text-sm font-bold text-slate-200">Nenhum fiado pendente!</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Este cliente não possui compras a prazo em aberto no momento.
              </p>
            </div>
          ) : (
            pedidos.map((pedido) => {
              const infoVenc = obterInfoVencimento(pedido);
              const saldoPed = Number(pedido.saldo_devedor ?? (Number(pedido.valor_total) - Number(pedido.valor_pago || 0)));
              const expandido = !!itensExpandidos[pedido.id];

              return (
                <div
                  key={pedido.id}
                  className="bg-slate-950/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 space-y-3 transition shadow-sm"
                >
                  {/* Topo do Pedido */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100">
                          Pedido #{pedido.numero_pedido || pedido.id.slice(0, 8)}
                        </span>
                        {/* Vencimento com destaque se vencido */}
                        {infoVenc.estaVencido ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                            ⚠️ VENCIDO ({infoVenc.formatada})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Vence em: {infoVenc.formatada}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          Compra: {formatarData(pedido.data_venda)}
                        </span>
                      </div>
                    </div>

                    {/* Botão Receber */}
                    <button
                      type="button"
                      onClick={() => handleAbrirReceberPedido(pedido)}
                      className="py-2 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Receber</span>
                    </button>
                  </div>

                  {/* Valores */}
                  <div className="grid grid-cols-3 gap-2 py-2 px-3 bg-slate-900/90 rounded-xl border border-slate-800/80 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Total Compra</span>
                      <span className="text-xs font-bold text-slate-200">
                        R$ {Number(pedido.valor_total).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Valor Pago</span>
                      <span className="text-xs font-bold text-emerald-400">
                        R$ {Number(pedido.valor_pago || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-amber-400/90 block font-semibold">Valor Fiado</span>
                      <span className="text-xs font-black text-amber-400">
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
                        className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition py-1 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-500" />
                          <span>{pedido.itens.length} {pedido.itens.length === 1 ? 'produto nesta compra' : 'produtos nesta compra'}</span>
                        </span>
                        {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {expandido && (
                        <div className="mt-2 divide-y divide-slate-800/60 bg-slate-900/60 rounded-xl border border-slate-800/60 p-2.5 space-y-1.5">
                          {pedido.itens.map((item: any, itIdx: number) => (
                            <div key={item.id || itIdx} className="flex items-center justify-between text-xs pt-1.5 first:pt-0">
                              <div>
                                <span className="font-bold text-slate-200 block">
                                  {item.quantidade}x {item.nome_produto}
                                </span>
                                {item.rotulo_variacao && (
                                  <span className="text-[10px] text-slate-400 block">
                                    Var: {item.rotulo_variacao}
                                  </span>
                                )}
                              </div>
                              <span className="font-bold text-slate-300">
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
        <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-900/90">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUBMODAL RECEBER (MULTI-PAGAMENTO - NUNCA FIADO - LANÇA NO CAIXA) */}
      {/* ========================================================================= */}
      {modalReceberAberto && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-60 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Receber Pagamento do Fiado</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalReceberAberto(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informações do Recebimento */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-center space-y-1">
              <span className="text-xs text-slate-400 font-medium block">
                {pedidoSelecionadoReceber
                  ? `Receber Pedido #${pedidoSelecionadoReceber.numero_pedido || pedidoSelecionadoReceber.id.slice(0, 8)}`
                  : 'Recebimento de Fiado (Saldo do Cliente)'}
              </span>
              <span className="text-3xl font-black text-emerald-400 block">
                R$ {valorTotalReceber.toFixed(2)}
              </span>
              <span className="text-[11px] text-slate-400 block">
                Cliente: <span className="text-white font-bold">{cliente.nome}</span>
              </span>
            </div>

            {/* Linhas de Multi-Pagamento */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">
                  Meios de Pagamento ({linhasRecebimento.length}):
                </span>
                <span className="text-[11px] text-slate-400">
                  Permite mais de um meio (Dinheiro, Pix, Cartão)
                </span>
              </div>

              {linhasRecebimento.map((linha, idx) => {
                const formaSel = formasValidasRecebimento.find(f => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
                const maxParc = formaSel?.maximo_parcelas || 12;

                return (
                  <div key={linha.id} className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        Meio #{idx + 1}
                      </span>
                      {linhasRecebimento.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoverLinha(linha.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Botões de Seleção do Meio (Fiado excluído) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {formasValidasRecebimento.map((fp) => {
                        const sel = linha.forma_pagamento_id === fp.id || (!linha.forma_pagamento_id && linha.forma_tipo === fp.tipo);
                        return (
                          <button
                            key={fp.id}
                            type="button"
                            onClick={() => handleAlterarFormaLinha(linha.id, fp)}
                            className={`p-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 ${
                              sel
                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                                : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {fp.tipo === 'dinheiro' && <Banknote className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                            {fp.tipo === 'pix' && <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                            {fp.tipo === 'cartao_debito' && <CreditCard className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                            {fp.tipo === 'cartao_credito' && <CreditCard className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                            <span className="truncate">{fp.nome}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Valor deste meio */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                      <span className="text-xs text-slate-400 font-medium">Valor pago:</span>
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 focus-within:border-emerald-500">
                        <span className="text-xs text-slate-500 font-bold">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={linha.valor > 0 ? linha.valor : ''}
                          onChange={(e) => handleAlterarValorLinha(linha.id, parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-28 bg-transparent text-right text-xs font-bold text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Troco se for dinheiro */}
                    {linha.forma_tipo === 'dinheiro' && (
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-800/60 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Valor Entregue pelo Cliente:</span>
                          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1">
                            <span className="text-xs text-slate-500 font-bold">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={linha.valor_entregue != null && linha.valor_entregue > 0 ? linha.valor_entregue : ''}
                              onChange={(e) => handleAlterarEntregueLinha(linha.id, parseFloat(e.target.value) || 0)}
                              className="w-28 bg-transparent text-right text-xs font-bold text-slate-100 focus:outline-none"
                            />
                          </div>
                        </div>
                        {linha.valor_entregue != null && linha.valor_entregue > linha.valor && (
                          <div className="flex justify-between font-bold text-amber-400">
                            <span>Troco a devolver:</span>
                            <span>R$ {(linha.valor_entregue - linha.valor).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Parcelas se for cartão de crédito */}
                    {linha.forma_tipo === 'cartao_credito' && (
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/60 text-xs">
                        <span className="text-slate-400">Parcelas:</span>
                        <select
                          value={linha.parcelas || 1}
                          onChange={(e) => handleAlterarParcelasLinha(linha.id, parseInt(e.target.value) || 1)}
                          className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none cursor-pointer"
                        >
                          {Array.from({ length: Math.min(12, maxParc) }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num}>
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
                className="w-full py-2.5 px-3 rounded-2xl border border-dashed border-slate-700 hover:border-emerald-500/60 bg-slate-800/40 hover:bg-slate-800/80 text-xs font-bold text-emerald-400 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>
                  Adicionar outro meio de pagamento {diferencaRecebimento > 0 ? `(Faltam R$ ${diferencaRecebimento.toFixed(2)})` : ''}
                </span>
              </button>
            </div>

            {/* Resumo de Conferência */}
            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Total a Receber:</span>
                <span className="font-bold text-white">R$ {valorTotalReceber.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total dos Meios Informados:</span>
                <span className="font-bold text-white">R$ {totalLinhasRecebimento.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold pt-1.5 border-t border-slate-800/80">
                {Math.abs(diferencaRecebimento) < 0.01 ? (
                  <>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Total Conferido
                    </span>
                    <span className="text-emerald-400">R$ 0,00</span>
                  </>
                ) : diferencaRecebimento > 0 ? (
                  <>
                    <span className="text-amber-400">Falta informar:</span>
                    <span className="text-amber-400">R$ {diferencaRecebimento.toFixed(2)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-rose-400">Excedente:</span>
                    <span className="text-rose-400">R$ {Math.abs(diferencaRecebimento).toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalReceberAberto(false)}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={processandoRecebimento || Math.abs(diferencaRecebimento) > 0.01}
                onClick={handleConfirmarRecebimento}
                className="flex-1 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-xs shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-98"
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
