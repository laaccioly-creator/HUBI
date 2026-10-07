import React from 'react';
import {
  CheckCircle2,
  Clock,
  Package,
  XCircle,
  Store,
  Tag,
  AlertCircle,
  Truck,
  CreditCard,
  X
} from 'lucide-react';
import { Pedido, StatusPedido, Loja } from '../types';
import { obterOpcoesStatusAlteracao, ROTULOS_STATUS_PEDIDO, obterInfoVencimentoFiado } from '../utils/statusPedidoUtils';
import { formatarMoeda } from '../utils/formatters';

interface ModalAlterarStatusPedidoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  loja?: Loja | null;
  atualizandoStatusRapido?: boolean;
  onAlterarStatus: (pedidoId: string, novoStatus: StatusPedido) => Promise<void>;
  onCancelarPedido: (pedido: Pedido) => void;
  onReceberPagamento: (pedido: Pedido) => void;
}

/**
 * Renderiza o badge de status com a anatomia padronizada do Design System HUBI v1.4.0:
 * - Cantos levemente arredondados (rounded-lg)
 * - Altura compacta (py-1.5 px-3)
 * - Borda sutil (border)
 * - Tipografia (text-xs font-medium)
 * - Ícone Lucide à esquerda
 * - Suporte completo a tema claro e escuro
 */
export const getStatusBadgeElement = (
  status: StatusPedido | string,
  pedido?: Pedido | null
): React.ReactNode => {
  let classes = '';
  let icone = <Tag className="w-3.5 h-3.5 shrink-0" />;
  let rotulo = ROTULOS_STATUS_PEDIDO[status] || status.replace('_', ' ');

  switch (status) {
    case 'entregue':
      classes = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60 dark:hover:bg-emerald-950/70';
      icone = <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />;
      rotulo = 'Entregue';
      break;
    case 'concluido':
      classes = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60 dark:hover:bg-emerald-950/70';
      icone = <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />;
      rotulo = 'Concluído';
      break;
    case 'aguardando_envio':
    case 'envio_pendente':
      classes = 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60 dark:hover:bg-amber-950/70';
      icone = <Clock className="w-3.5 h-3.5 shrink-0" />;
      rotulo = 'Aguardando Envio';
      break;
    case 'enviado':
    case 'saiu_para_entrega':
      classes = 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60 dark:hover:bg-sky-950/70';
      icone = <Truck className="w-3.5 h-3.5 shrink-0" />;
      rotulo = status === 'saiu_para_entrega' ? 'Saiu para Entrega' : 'Enviado';
      break;
    case 'cancelado':
      classes = 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60 dark:hover:bg-rose-950/70';
      icone = <XCircle className="w-3.5 h-3.5 shrink-0" />;
      rotulo = 'Cancelado';
      break;
    case 'pendente':
      classes = 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60 dark:hover:bg-amber-950/70';
      icone = <Clock className="w-3.5 h-3.5 shrink-0" />;
      rotulo = 'Pendente';
      break;
    case 'confirmado':
      classes = 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60 dark:hover:bg-blue-950/70';
      icone = <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />;
      rotulo = 'Confirmado';
      break;
    case 'em_separacao':
    case 'em_producao':
      classes = 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60 dark:hover:bg-indigo-950/70';
      icone = <Package className="w-3.5 h-3.5 shrink-0" />;
      rotulo = status === 'em_producao' ? 'Em produção' : 'Em separação';
      break;
    case 'em_expedicao':
      classes = 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/60 dark:hover:bg-purple-950/70';
      icone = <Package className="w-3.5 h-3.5 shrink-0" />;
      rotulo = 'Em expedição';
      break;
    case 'pronto_para_retirar':
      classes = 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800/60 dark:hover:bg-teal-950/70';
      icone = <Store className="w-3.5 h-3.5 shrink-0" />;
      rotulo = 'Pronto para retirar';
      break;
    case 'vencido': {
      const infoVenc = pedido ? obterInfoVencimentoFiado(pedido) : null;
      return (
        <div className="inline-flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-xs font-medium bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60 dark:hover:bg-rose-950/70 transition-colors">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Vencido</span>
          </span>
          {infoVenc && (
            <span className="text-[10px] text-rose-600 dark:text-rose-400/90 font-semibold mt-0.5 whitespace-nowrap">
              Vencimento: {infoVenc.formatada}
            </span>
          )}
        </div>
      );
    }
    default:
      classes = 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800/60 dark:hover:bg-slate-900/70';
      icone = <Tag className="w-3.5 h-3.5 shrink-0" />;
      rotulo = ROTULOS_STATUS_PEDIDO[status] || status.replace('_', ' ');
      break;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${classes}`}>
      {icone}
      <span>{rotulo}</span>
    </span>
  );
};

export const ModalAlterarStatusPedido: React.FC<ModalAlterarStatusPedidoProps> = ({
  isOpen,
  onClose,
  pedido,
  loja,
  atualizandoStatusRapido = false,
  onAlterarStatus,
  onCancelarPedido,
  onReceberPagamento
}) => {
  if (!isOpen || !pedido) return null;

  const saldoDev = Number(
    pedido.saldo_devedor ?? (Number(pedido.valor_total || 0) - Number(pedido.valor_pago || 0))
  );
  const temFiado = (pedido.pagamentos || []).some(
    (p) => p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado'
  );
  const quitado = pedido.status_pagamento === 'pago' || saldoDev <= 0.009 || temFiado;

  const ehRetiradaModal =
    pedido.forma_entrega?.tipo === 'retirada' ||
    pedido.pedido_entrega?.tipo_atendimento === 'retirada' ||
    (pedido as unknown as { tipo_atendimento?: string }).tipo_atendimento === 'retirada' ||
    (pedido as unknown as { tipo_entrega?: string }).tipo_entrega === 'retirada';

  const opcoesDisponiveis = obterOpcoesStatusAlteracao(
    loja,
    pedido.status,
    ehRetiradaModal
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => {
        if (!atualizandoStatusRapido) onClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl dark:bg-[#1E293B] dark:border-slate-700/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Alterar Status do Pedido #{pedido.origem === 'catalogo_online' ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cliente: <strong className="font-semibold text-slate-800 dark:text-slate-200">{pedido.cliente?.nome || pedido.cliente_nome_avulso || 'Cliente Balcão'}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={atualizandoStatusRapido}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg p-1.5 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-5 max-h-[calc(85vh-160px)] overflow-y-auto">
          {/* Bloco "Status Atual" */}
          <div className="bg-slate-50 border border-slate-100 dark:bg-slate-800/50 dark:border-slate-700/50 rounded-xl p-3.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status Atual:</span>
            <div className="flex items-center gap-2">
              {getStatusBadgeElement(pedido.status, pedido)}
            </div>
          </div>

          {/* Verificação da Trava Financeira */}
          {!quitado && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-amber-900 dark:text-amber-200">Pagamento Pendente</p>
                  <p className="text-amber-700 dark:text-amber-300/90 leading-relaxed">
                    Este pedido ainda não foi pago. Efetue o recebimento antes de avançar para separação ou envio.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReceberPagamento(pedido);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
              >
                <CreditCard className="w-4 h-4 stroke-[2.5]" />
                <span>Receber Pagamento ({formatarMoeda(saldoDev)})</span>
              </button>
            </div>
          )}

          {/* Lista de Próximos Status */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2.5">
              Selecione o Próximo Status:
            </h4>

            <div className="space-y-2">
              {opcoesDisponiveis.map((opcao) => {
                const ehCancelamento = opcao.id === 'cancelado';
                const requerQuitacao = !ehCancelamento && !quitado;
                const estaDesabilitado = atualizandoStatusRapido || requerQuitacao;

                return (
                  <button
                    key={opcao.id}
                    type="button"
                    disabled={estaDesabilitado}
                    onClick={async () => {
                      if (ehCancelamento) {
                        onClose();
                        onCancelarPedido(pedido);
                      } else {
                        await onAlterarStatus(pedido.id, opcao.id);
                        onClose();
                      }
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-slate-50/80 transition-all dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-emerald-500/60 dark:hover:bg-slate-800 group cursor-pointer ${
                      estaDesabilitado
                        ? 'opacity-50 cursor-not-allowed hover:border-slate-200 dark:hover:border-slate-700 hover:bg-transparent dark:hover:bg-slate-800/40'
                        : 'active:scale-98'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {getStatusBadgeElement(opcao.id)}
                    </div>

                    {requerQuitacao ? (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-2.5 py-1 rounded-lg">
                        Requer Pagamento
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
                        Avançar &rarr;
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="bg-slate-50/60 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50 px-6 py-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
