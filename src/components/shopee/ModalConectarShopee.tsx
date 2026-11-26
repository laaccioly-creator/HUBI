import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, X, ExternalLink, Loader2 } from 'lucide-react';
import { shopeeService } from '../../services/shopeeService';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { useFeedbackModal } from '../../contexts/FeedbackContext';

interface ModalConectarShopeeProps {
  aberto: boolean;
  onFechar: () => void;
  lojaId: string;
  nomeLoja?: string | null;
}

export const ModalConectarShopee: React.FC<ModalConectarShopeeProps> = ({
  aberto,
  onFechar,
  lojaId,
  nomeLoja,
}) => {
  const navigate = useNavigate();
  const { mostrarAviso } = useFeedbackModal();
  const [conectando, setConectando] = useState<boolean>(false);

  useRegisterOverlay(aberto, onFechar, 'modal-conectar-shopee', 'modal');

  if (!aberto) return null;

  const handleConectar = async () => {
    if (!lojaId) {
      onFechar();
      navigate('/config?tab=parceiros');
      return;
    }

    try {
      setConectando(true);
      const urlAutorizacao = await shopeeService.obterUrlAutorizacao(lojaId);
      window.location.href = urlAutorizacao;
    } catch {
      mostrarAviso(
        'Abrindo as configurações de integração para você conectar sua conta da Shopee.',
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
      <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl border-2 border-slate-300 bg-white text-black space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#EE4D2D] flex items-center justify-center text-white font-black shadow-xs shrink-0">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-lg leading-tight text-black">
                Conta da Shopee não conectada
              </h3>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
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
            className="hubi-btn-close-x p-1.5 rounded-xl text-slate-700 hover:text-black transition cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm font-medium leading-relaxed text-black">
          Para publicar ou vincular seus produtos na Shopee, primeiro conecte a conta da sua loja (
          <strong className="font-black">{nomeLoja?.trim() || 'sua loja'}</strong>). A conexão usa autenticação oficial OAuth2 da Shopee.
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onFechar}
            disabled={conectando}
            className="hubi-btn-neutral px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-sm font-bold text-black transition cursor-pointer disabled:opacity-50"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={handleConectar}
            disabled={conectando}
            className="px-5 py-2.5 rounded-xl bg-[#EE4D2D] hover:bg-[#D73211] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {conectando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 text-white" />
                <span>Conectar Conta Shopee</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
