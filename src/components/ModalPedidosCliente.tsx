import React, { useEffect, useState } from 'react';
import { X, Package, Clock, ExternalLink, Loader2, AlertCircle, ShoppingBag, CheckCircle, Truck, Receipt } from 'lucide-react';
import { Pedido, Loja } from '../types';
import { ClienteCatalogoService } from '../services/clienteCatalogoService';
import { ModalReciboPedido } from './ModalReciboPedido';

interface ModalPedidosClienteProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  loja?: Loja | null;
  clienteId: string;
  corTema?: string;
  onExplorarCatalogo?: () => void;
}

export const ModalPedidosCliente: React.FC<ModalPedidosClienteProps> = ({
  isOpen,
  onClose,
  lojaId,
  loja,
  clienteId,
  corTema = '#10B981',
  onExplorarCatalogo
}) => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoReciboModal, setPedidoReciboModal] = useState<Pedido | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      if (!isOpen || !lojaId || !clienteId) return;

      try {
        setCarregando(true);
        setErro(null);
        const data = await ClienteCatalogoService.listarPedidosCliente(lojaId, clienteId);
        if (ativo) {
          setPedidos(data);
        }
      } catch (e: any) {
        if (ativo) {
          setErro('Não foi possível carregar o histórico de pedidos.');
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, [isOpen, lojaId, clienteId]);

  if (!isOpen) return null;

  const formatarData = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'concluido' || s === 'entregue') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          <span>{status.toUpperCase()}</span>
        </span>
      );
    }
    if (s === 'em_rota' || s === 'despachado') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1">
          <Truck className="w-3 h-3" />
          <span>EM ROTA</span>
        </span>
      );
    }
    if (s === 'preparando' || s === 'aprovado') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>PREPARANDO</span>
        </span>
      );
    }
    if (s === 'cancelado') {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
          CANCELADO
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        <span>{status.toUpperCase()}</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border-2 border-slate-700/80 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow"
              style={{ backgroundColor: corTema }}
            >
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-100">Meus Pedidos</h3>
              <p className="text-[11px] text-slate-400">Histórico de compras e rastreamento em tempo real</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro */}
        {erro && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{erro}</span>
          </div>
        )}

        {/* Lista de Pedidos */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {carregando ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Carregando seus pedidos...</span>
            </div>
          ) : pedidos.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500">
                <ShoppingBag className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200">Nenhum pedido encontrado</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Você ainda não finalizou compras com este cadastro nesta loja.
                </p>
              </div>
              {onExplorarCatalogo && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onExplorarCatalogo();
                  }}
                  className="mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow transition hover:brightness-110 cursor-pointer"
                  style={{ backgroundColor: corTema }}
                >
                  Explorar Vitrine
                </button>
              )}
            </div>
          ) : (
            pedidos.map((ped) => (
              <div
                key={ped.id}
                className="bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 space-y-2.5 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">Pedido #{ped.numero_pedido}</span>
                    <span className="text-[10px] text-slate-500">
                      • {formatarData(ped.criado_em || ped.data_venda)}
                    </span>
                  </div>
                  {getStatusBadge(ped.status)}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                  <div>
                    <span className="text-slate-400 text-[11px]">Total: </span>
                    <strong className="text-slate-100 font-extrabold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        ped.valor_total || 0
                      )}
                    </strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPedidoReciboModal(ped)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition cursor-pointer active:scale-95 shadow-sm"
                      title="Visualizar Recibo do Pedido"
                    >
                      <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Recibo</span>
                    </button>

                    <a
                      href={`/order-tracking/${ped.numero_pedido}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-bold text-xs border border-slate-700 transition cursor-pointer"
                    >
                      <span>Rastrear Pedido</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal de Recibo do Pedido */}
      <ModalReciboPedido
        isOpen={!!pedidoReciboModal}
        onClose={() => setPedidoReciboModal(null)}
        pedido={pedidoReciboModal}
        loja={loja}
        lojaId={lojaId}
      />
    </div>
  );
};
