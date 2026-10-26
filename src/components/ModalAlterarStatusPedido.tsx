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
import { useTheme } from '../contexts/ThemeContext';

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
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  if (!isOpen || !pedido) return null;

  const saldoDev = Number(
    pedido.saldo_devedor ?? (Number(pedido.valor_total || 0) - Number(pedido.valor_pago || 0))
  );
  const temFiado = (pedido.pagamentos || []).some(
    (p) => p.eh_pagamento_fiado || p.forma_pagamento?.tipo === 'fiado' || p.forma_pagamento?.tipo === 'caderneta'
  );
  const ehCadernetaOuFiado =
    pedido.status_pagamento === 'caderneta' ||
    pedido.status_pagamento === 'fiado' ||
    Boolean((pedido as any).eh_venda_caderneta) ||
    Boolean((pedido as any).eh_venda_fiado) ||
    temFiado;
  const quitado = pedido.status_pagamento === 'pago' || saldoDev <= 0.009 || ehCadernetaOuFiado;

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => {
        if (!atualizandoStatusRapido) onClose();
      }}
    >
      <div
        className={`w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl ${
          isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className={`flex items-center justify-between p-6 border-b ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>
                Alterar Status do Pedido #{pedido.origem === 'catalogo_online' ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Cliente: <strong className={`font-bold ${isDark ? 'text-slate-200' : 'text-black'}`}>{pedido.cliente?.nome || pedido.cliente_nome_avulso || 'Cliente Balcão'}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={atualizandoStatusRapido}
            onClick={onClose}
            className={`rounded-xl p-1.5 border transition cursor-pointer ${
              isDark ? 'bg-[#000000] border-slate-700 text-slate-400 hover:text-white hover:bg-slate-900' : 'bg-white border-slate-300 text-slate-500 hover:text-black hover:bg-slate-50'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className={`p-6 space-y-5 max-h-[calc(85vh-160px)] overflow-y-auto ${
          isDark ? 'bg-[#08131A]' : 'bg-slate-100'
        }`}>
          {/* Bloco "Status Atual" */}
          <div className={`rounded-xl p-3.5 flex items-center justify-between ${
            isDark ? 'bg-[#000000] border border-slate-700 text-slate-200' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>Status Atual:</span>
            <div className="flex items-center gap-2">
              {getStatusBadgeElement(pedido.status, pedido)}
            </div>
          </div>

          {/* Verificação da Trava Financeira */}
          {!quitado && (
            <div className={`p-4 rounded-xl border space-y-2.5 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 text-slate-400 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Pagamento Pendente</p>
                  <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Este pedido ainda não foi pago. O recebimento é obrigatório antes da expedição ou entrega final.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReceberPagamento(pedido);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
              >
                <CreditCard className="w-4 h-4 stroke-[2.5]" />
                <span>Receber Pagamento ({formatarMoeda(saldoDev)})</span>
              </button>
            </div>
          )}

          {/* Lista de Próximos Status */}
          <div>
            <h4 className={`text-[11px] font-black uppercase tracking-wider mb-2.5 ${isDark ? 'text-slate-300' : 'text-black'}`}>
              Selecione o Próximo Status:
            </h4>

            <div className="space-y-2">
              {opcoesDisponiveis.map((opcao) => {
                const ehCancelamento = opcao.id === 'cancelado';
                // Transição para Confirmado é permitida sem pagamento prévio para possibilitar separação e pesagem.
                // Vendas em Caderneta ou Fiado têm expedição autorizada pela concessão prévia de crédito.
                const permiteSemQuitacao = ehCancelamento || opcao.id === 'confirmado' || ehCadernetaOuFiado;
                const requerQuitacao = !permiteSemQuitacao && !quitado;
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
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all group cursor-pointer ${
                      isDark
                        ? 'bg-[#000000] border-slate-700 hover:border-emerald-500 hover:bg-slate-900 text-slate-100'
                        : 'bg-white border-2 border-slate-300 hover:border-emerald-600 hover:bg-slate-50 text-black'
                    } ${
                      estaDesabilitado
                        ? 'opacity-50 cursor-not-allowed'
                        : 'active:scale-98'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {getStatusBadgeElement(opcao.id)}
                    </div>

                    {requerQuitacao ? (
                      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border ${
                        isDark ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-100 border-slate-200'
                      }`}>
                        Requer Pagamento
                      </span>
                    ) : (
                      <span className={`text-xs font-bold transition-colors ${
                        isDark ? 'text-slate-400 group-hover:text-emerald-400' : 'text-slate-600 group-hover:text-emerald-700'
                      }`}>
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
        <div className={`border-t px-6 py-4 flex justify-end ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer active:scale-95 ${
              isDark ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
            }`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
