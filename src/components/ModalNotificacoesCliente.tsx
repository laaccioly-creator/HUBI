import React, { useEffect, useState } from 'react';
import { X, Bell, Check, ExternalLink, Loader2, AlertCircle, CheckCheck } from 'lucide-react';
import { ClienteNotificacao } from '../types';
import { ClienteCatalogoService } from '../services/clienteCatalogoService';

interface ModalNotificacoesClienteProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  clienteId: string;
  corTema?: string;
  onNavegarLink?: (link: string) => void;
  onAtualizarContador?: () => void;
}

export const ModalNotificacoesCliente: React.FC<ModalNotificacoesClienteProps> = ({
  isOpen,
  onClose,
  lojaId,
  clienteId,
  corTema = '#10B981',
  onNavegarLink,
  onAtualizarContador
}) => {
  const [notificacoes, setNotificacoes] = useState<ClienteNotificacao[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarNotificacoes = async () => {
    if (!lojaId || !clienteId) return;
    try {
      setCarregando(true);
      setErro(null);
      const data = await ClienteCatalogoService.listarNotificacoes(lojaId, clienteId);
      setNotificacoes(data);
    } catch {
      setErro('Não foi possível carregar as notificações.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarNotificacoes();
    }
  }, [isOpen, lojaId, clienteId]);

  if (!isOpen) return null;

  const handleMarcarLida = async (notif: ClienteNotificacao) => {
    if (!notif.lida) {
      await ClienteCatalogoService.marcarNotificacaoLida(lojaId, notif.id);
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, lida: true } : n))
      );
      if (onAtualizarContador) onAtualizarContador();
    }

    if (notif.link_acao) {
      onClose();
      if (onNavegarLink) {
        onNavegarLink(notif.link_acao);
      } else {
        window.open(notif.link_acao, '_blank');
      }
    }
  };

  const handleMarcarTodasLidas = async () => {
    try {
      await ClienteCatalogoService.marcarTodasNotificacoesLidas(lojaId, clienteId);
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
      if (onAtualizarContador) onAtualizarContador();
    } catch {
      // Ignore
    }
  };

  const formatarData = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border-2 border-slate-700/80 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow"
              style={{ backgroundColor: corTema }}
            >
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-100 flex items-center gap-2">
                <span>Notificações</span>
                {naoLidas > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-rose-500 text-white">
                    {naoLidas}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">Avisos e atualizações dos seus pedidos</p>
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

        {/* Barra de Ações Rápidas */}
        {naoLidas > 0 && (
          <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/40 flex justify-end">
            <button
              type="button"
              onClick={handleMarcarTodasLidas}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar todas como lidas</span>
            </button>
          </div>
        )}

        {/* Mensagem de Erro */}
        {erro && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{erro}</span>
          </div>
        )}

        {/* Lista de Notificações */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
          {carregando ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Carregando avisos...</span>
            </div>
          ) : notificacoes.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500">
                <Bell className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200">Nenhuma notificação no momento</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Quando houver novidades sobre seus pedidos ou ofertas especiais, elas aparecerão aqui.
                </p>
              </div>
            </div>
          ) : (
            notificacoes.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleMarcarLida(notif)}
                className={`p-3 rounded-2xl border transition cursor-pointer ${
                  notif.lida
                    ? 'bg-slate-950/40 border-slate-800/60 opacity-80 hover:opacity-100'
                    : 'bg-slate-900 border-slate-700 hover:border-emerald-500/50 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    {!notif.lida && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0 animate-pulse"></span>
                    )}
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 leading-snug">{notif.titulo}</h4>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{notif.mensagem}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0 mt-0.5">
                    {formatarData(notif.criado_em)}
                  </span>
                </div>

                {notif.link_acao && (
                  <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-end text-[11px] text-emerald-400 font-semibold gap-1">
                    <span>Ver detalhes</span>
                    <ExternalLink className="w-3 h-3" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
