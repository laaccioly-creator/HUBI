import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CreditCard,
  Banknote,
  Zap,
  Plus,
  Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { Cliente, Pedido, FormaPagamento, TipoPagamento, StatusPagamento } from '../types';
import { caixaService } from '../services/caixaService';
import { SyncService } from '../services/syncService';
import { obterDataOperacaoISO } from '../utils/dataOperacao';

export interface ModalReceberFiadoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  cliente?: Cliente | null;
  onRecebimentoConcluido?: (pedidoAtualizado?: Pedido, clienteAtualizado?: Cliente) => void;
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

export const ModalReceberFiado: React.FC<ModalReceberFiadoProps> = ({
  isOpen,
  onClose,
  pedido,
  cliente: clienteProp,
  onRecebimentoConcluido
}) => {
  const { loja, usuario } = useAuth();
  const { mostrarSucesso, mostrarAviso, mostrarErro } = useFeedbackModal();

  const [cliente, setCliente] = useState<Cliente | null>(clienteProp || null);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
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
    // REGRA: NUNCA permitir fiado para receber pagamento de fiado
    return lista.filter(f => f.tipo !== 'fiado' && f.ativo);
  }, [formasPagamento, loja?.id]);

  // Carregar formas de pagamento e cliente quando o modal abrir
  useEffect(() => {
    if (!isOpen || !loja?.id) return;

    const carregarDadosIniciais = async () => {
      try {
        // 1. Carregar formas de pagamento ativas da loja
        const { data: fps } = await supabase
          .from('formas_pagamento')
          .select('*')
          .eq('loja_id', loja.id)
          .eq('ativo', true)
          .order('nome');

        if (fps) {
          setFormasPagamento(fps);
        }

        // 2. Carregar dados atualizados do cliente se houver cliente_id
        const clienteId = clienteProp?.id || pedido?.cliente_id;
        if (clienteId) {
          const { data: cliData } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', clienteId)
            .single();

          if (cliData) {
            setCliente(cliData);
          } else if (clienteProp) {
            setCliente(clienteProp);
          } else if (pedido?.cliente) {
            setCliente(pedido.cliente as Cliente);
          }
        } else if (clienteProp) {
          setCliente(clienteProp);
        } else if (pedido?.cliente) {
          setCliente(pedido.cliente as Cliente);
        }

        // 3. Definir valor total a receber
        let valor = 0;
        if (pedido) {
          const saldo = Number(pedido.saldo_devedor ?? (Number(pedido.valor_total) - Number(pedido.valor_pago || 0)));
          valor = Math.max(0, saldo > 0 ? saldo : Number(pedido.valor_total));
        } else if (clienteProp) {
          valor = Number(clienteProp.saldo_devedor_fiado || 0);
        }
        setValorTotalReceber(valor);

        // 4. Inicializar linha padrão com a primeira forma de pagamento disponível
        const listaFps = (fps && fps.length > 0) ? fps.filter(f => f.tipo !== 'fiado' && f.ativo) : [];
        const fpPadrao = listaFps[0] || { id: 'fp_dinheiro', nome: 'Dinheiro', tipo: 'dinheiro' };

        setLinhasRecebimento([
          {
            id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            forma_pagamento_id: fpPadrao.id,
            forma_tipo: fpPadrao.tipo as TipoPagamento,
            forma_nome: fpPadrao.nome,
            valor: valor,
            valor_entregue: null,
            parcelas: 1
          }
        ]);
      } catch (err) {
        console.error('Erro ao inicializar dados do modal receber fiado:', err);
      }
    };

    carregarDadosIniciais();
  }, [isOpen, pedido?.id, clienteProp?.id, loja?.id]);

  // Handlers do Multi-pagamento
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
    if (!loja?.id) return;

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
      let pedidoAtualizado: Pedido | undefined;

      // 1. Atualizar Pedido
      if (pedido) {
        const ped = pedido;
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

        const atualizacaoPedido = {
          status: quitado ? ('concluido' as const) : ped.status,
          valor_pago: novoValorPago,
          saldo_devedor: novoSaldoDevedor,
          fiado_quitado: quitado,
          status_pagamento: novoStatusPag,
          atualizado_em: dataIso
        };

        const { error: erroPed } = await supabase
          .from('pedidos')
          .update(atualizacaoPedido)
          .eq('id', ped.id);

        if (erroPed) throw erroPed;

        pedidoAtualizado = {
          ...ped,
          ...atualizacaoPedido
        };

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
      }

      // 2. REGRA DE CRÉDITO: Devolver o valor pago ao limite de crédito do cliente e abater do saldo devedor
      let clienteAtualizado: Cliente | undefined;
      let novoLimiteCredito = 0;
      let novoSaldoDevedorFiado = 0;

      if (cliente) {
        novoLimiteCredito = Number(cliente.limite_credito || 0) + valorRecebido;
        novoSaldoDevedorFiado = Math.max(0, Number(cliente.saldo_devedor_fiado || 0) - valorRecebido);

        const { error: erroCli } = await supabase
          .from('clientes')
          .update({
            limite_credito: novoLimiteCredito,
            saldo_devedor_fiado: novoSaldoDevedorFiado
          })
          .eq('id', cliente.id);

        if (erroCli) {
          console.warn('Aviso ao atualizar limite do cliente:', erroCli);
        } else {
          clienteAtualizado = {
            ...cliente,
            limite_credito: novoLimiteCredito,
            saldo_devedor_fiado: novoSaldoDevedorFiado
          };
        }
      }

      // 3. REGRA DE CAIXA: Lançar os valores recebidos na sessão de caixa ativa
      try {
        await caixaService.registrarVendaPedido({
          lojaId: loja.id,
          pedido: pedido || {
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
          descricao: `Recebimento de Fiado: ${cliente?.nome || 'Cliente'} ${pedido ? `(Pedido #${pedido.numero_pedido || pedido.id.slice(0, 8)})` : ''}`.trim(),
          valor: valorRecebido,
          forma_pagamento: linhasRecebimento.map(l => l.forma_nome).join(' + '),
          status: 'pago',
          data_vencimento: dataIso.split('T')[0],
          data_pagamento: dataIso
        }]);
      } catch (errFin) {
        console.warn('Aviso ao registrar transação financeira:', errFin);
      }

      mostrarSucesso(`Recebimento de R$ ${valorRecebido.toFixed(2)} confirmado! Limite de crédito do cliente restabelecido${novoLimiteCredito > 0 ? ` para R$ ${novoLimiteCredito.toFixed(2)}` : ''}.`);

      // 5. Opção de comprovante via WhatsApp
      if (cliente) {
        const phone = cliente.whatsapp || cliente.telefone;
        if (phone) {
          const msg = `🧾 *COMPROVANTE DE PAGAMENTO DE FIADO - ${loja.nome_fantasia}*\n\nOlá, *${cliente.nome}*!\nConfirmamos o recebimento de *R$ ${valorRecebido.toFixed(2)}* referente ao pagamento de fiado.\n\n💳 *Limite de Crédito Disponível:* R$ ${novoLimiteCredito.toFixed(2)}\n💰 *Saldo Devedor Restante:* R$ ${novoSaldoDevedorFiado.toFixed(2)}\n\nAgradecemos pela pontualidade! ✨`;
          const phoneFormatado = phone.replace(/\D/g, '');
          window.open(`https://api.whatsapp.com/send?phone=55${phoneFormatado}&text=${encodeURIComponent(msg)}`, '_blank');
        }
      }

      onClose();
      if (onRecebimentoConcluido) {
        onRecebimentoConcluido(pedidoAtualizado, clienteAtualizado);
      }
    } catch (err: any) {
      console.error('Erro ao processar recebimento:', err);
      mostrarErro(err.message || 'Erro ao processar recebimento de fiado.');
    } finally {
      setProcessandoRecebimento(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[80] animate-in fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl sm:max-w-2xl p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto text-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CreditCard className="w-4 h-4" />
            </div>
            <span>Receber Pagamento do Fiado</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informações do Recebimento */}
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center space-y-1">
          <span className="text-xs text-slate-500 font-medium block">
            {pedido
              ? `Receber Pedido #${pedido.numero_pedido || pedido.id.slice(0, 8)}`
              : 'Recebimento de Fiado (Saldo do Cliente)'}
          </span>
          <span className="text-3xl font-black text-emerald-600 block">
            R$ {valorTotalReceber.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 block">
            Cliente: <span className="text-slate-900 font-bold">{cliente?.nome || pedido?.cliente?.nome || 'Cliente não identificado'}</span>
          </span>
        </div>

        {/* Linhas de Multi-Pagamento */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
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
              <div key={linha.id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    Meio #{idx + 1}
                  </span>
                  {linhasRecebimento.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoverLinha(linha.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
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
                        className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 ${
                          sel
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/40 shadow-xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {fp.tipo === 'dinheiro' && <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />}
                        {fp.tipo === 'pix' && <Zap className="w-4 h-4 text-cyan-600 shrink-0" />}
                        {fp.tipo === 'cartao_debito' && <CreditCard className="w-4 h-4 text-blue-600 shrink-0" />}
                        {fp.tipo === 'cartao_credito' && <CreditCard className="w-4 h-4 text-purple-600 shrink-0" />}
                        <span className="whitespace-normal text-center">{fp.nome}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Valor deste meio */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
                  <span className="text-xs text-slate-500 font-medium">Valor pago:</span>
                  <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1 focus-within:border-emerald-500">
                    <span className="text-xs text-slate-400 font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={linha.valor > 0 ? linha.valor : ''}
                      onChange={(e) => handleAlterarValorLinha(linha.id, parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-28 bg-transparent text-right text-xs font-bold text-slate-900 focus:outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Troco se for dinheiro */}
                {linha.forma_tipo === 'dinheiro' && (
                  <div className="space-y-1.5 pt-1.5 border-t border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Valor Entregue pelo Cliente:</span>
                      <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1">
                        <span className="text-xs text-slate-400 font-bold">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={linha.valor_entregue != null && linha.valor_entregue > 0 ? linha.valor_entregue : ''}
                          onChange={(e) => handleAlterarEntregueLinha(linha.id, parseFloat(e.target.value) || 0)}
                          className="w-28 bg-transparent text-right text-xs font-bold text-slate-900 focus:outline-none placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                    {linha.valor_entregue != null && linha.valor_entregue > linha.valor && (
                      <div className="flex justify-between font-bold text-amber-700">
                        <span>Troco a devolver:</span>
                        <span>R$ {(linha.valor_entregue - linha.valor).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Parcelas se for cartão de crédito */}
                {linha.forma_tipo === 'cartao_credito' && (
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200 text-xs">
                    <span className="text-slate-500">Parcelas:</span>
                    <select
                      value={linha.parcelas || 1}
                      onChange={(e) => handleAlterarParcelasLinha(linha.id, parseInt(e.target.value) || 1)}
                      className="bg-white border border-slate-300 rounded-xl px-2 py-1 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none cursor-pointer"
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
            className="w-full py-2.5 px-3 rounded-2xl border border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-emerald-700 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>
              Adicionar outro meio de pagamento {diferencaRecebimento > 0 ? `(Faltam R$ ${diferencaRecebimento.toFixed(2)})` : ''}
            </span>
          </button>
        </div>

        {/* Resumo de Conferência */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-500">
            <span>Total a Receber:</span>
            <span className="font-bold text-slate-800">R$ {valorTotalReceber.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Total dos Meios Informados:</span>
            <span className="font-bold text-slate-800">R$ {totalLinhasRecebimento.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold pt-1.5 border-t border-slate-200">
            {Math.abs(diferencaRecebimento) < 0.01 ? (
              <>
                <span className="text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Total Conferido
                </span>
                <span className="text-emerald-700">R$ 0,00</span>
              </>
            ) : diferencaRecebimento > 0 ? (
              <>
                <span className="text-amber-700">Falta informar:</span>
                <span className="text-amber-700">R$ {diferencaRecebimento.toFixed(2)}</span>
              </>
            ) : (
              <>
                <span className="text-rose-700">Excedente:</span>
                <span className="text-rose-700">R$ {Math.abs(diferencaRecebimento).toFixed(2)}</span>
              </>
            )}
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={processandoRecebimento || Math.abs(diferencaRecebimento) > 0.01}
            onClick={handleConfirmarRecebimento}
            className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-98"
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
  );
};
