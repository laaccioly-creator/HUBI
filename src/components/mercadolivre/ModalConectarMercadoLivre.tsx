import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, X, ExternalLink, Loader2 } from 'lucide-react';
import { mercadoLivreService } from '../../services/mercadoLivreService';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useFeedbackModal } from '../../contexts/FeedbackContext';

interface ModalConectarMercadoLivreProps {
  aberto: boolean;
  onFechar: () => void;
  lojaId: string;
  nomeLoja?: string | null;
}

export const ModalConectarMercadoLivre: React.FC<ModalConectarMercadoLivreProps> = ({
  aberto,
  onFechar,
  lojaId,
  nomeLoja,
}) => {
  const navigate = useNavigate();
  const { mostrarAviso } = useFeedbackModal();
  const [conectando, setConectando] = useState<boolean>(false);

  useRegisterOverlay(aberto, onFechar, 'modal-conectar-mercado-livre', 'modal');

  if (!aberto) return null;

  const handleConectar = async () => {
    if (!lojaId) {
      onFechar();
      navigate('/config?tab=parceiros');
      return;
    }

    try {
      setConectando(true);
      const urlAutorizacao = await mercadoLivreService.obterUrlAutorizacao(lojaId);
      window.location.href = urlAutorizacao;
    } catch {
      mostrarAviso(
        'Abrindo as configurações de integração para você conectar sua conta do Mercado Livre.',
        'Redirecionando para Integrações'
      );
      onFechar();
      navigate('/config?tab=parceiros');
    } finally {
      setConectando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !conectando) onFechar();
      }}
    >
      <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-black text-slate-900 dark:text-white space-y-5 animate-in zoom-in-95 duration-150">
        {/* CABEÇALHO */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FFE600] border border-amber-400 flex items-center justify-center text-slate-950 font-black shadow-xs shrink-0">
              <ShoppingBag className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h3 className="font-black text-lg leading-tight text-black dark:text-white">
                Conta do Mercado Livre não conectada
              </h3>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Integração de Marketplace
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onFechar}
            disabled={conectando}
            aria-label="Fechar"
            title="Fechar"
            className="hubi-btn-close-x p-1.5 rounded-xl text-slate-700 hover:text-black dark:text-slate-300 dark:hover:text-white transition cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* DESCRIÇÃO */}
        <p className="text-sm font-medium leading-relaxed text-black dark:text-slate-200">
          Para publicar ou vincular seus produtos no Mercado Livre, primeiro você precisa conectar a conta da sua loja (
          <strong className="font-black">{nomeLoja?.trim() || 'sua loja'}</strong>). O processo é rápido e seguro.
        </p>

        {/* AÇÕES */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onFechar}
            disabled={conectando}
            className="hubi-btn-neutral px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-sm font-bold text-slate-900 dark:text-slate-100 transition cursor-pointer disabled:opacity-50"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={handleConectar}
            disabled={conectando}
            className="px-5 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black font-black text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {conectando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 text-black" />
                <span>Conectar com Mercado Livre</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
