import React, { useEffect, useState } from 'react';
import { Store, Loader2, CheckCircle2, Maximize2, X, ClipboardList } from 'lucide-react';
import {
  EstadoPublicacaoMassaShopee,
  shopeePublicacaoMassaService,
} from '../../services/shopeePublicacaoMassaService';

export const BarraProgressoPublicacaoMassaShopee: React.FC = () => {
  const [estado, setEstado] = useState<EstadoPublicacaoMassaShopee>(() =>
    shopeePublicacaoMassaService.getEstado()
  );

  useEffect(() => {
    return shopeePublicacaoMassaService.inscrever(() => {
      setEstado(shopeePublicacaoMassaService.getEstado());
    });
  }, []);

  if (!estado.minimizado || estado.status === 'ocioso') {
    return null;
  }

  const emExecucao = estado.status === 'executando';
  const percentual =
    estado.total > 0 ? Math.round((estado.processados / estado.total) * 100) : 0;

  const handleAcao = () => {
    if (emExecucao) {
      shopeePublicacaoMassaService.restaurar();
      return;
    }
    shopeePublicacaoMassaService.abrirRelatorios(estado.loteAtualId);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white text-black border-2 border-slate-300 shadow-2xl p-3.5 space-y-2.5 animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#EE4D2D] flex items-center justify-center shrink-0">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-black text-black">
              {emExecucao ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              )}
              <span className="truncate">
                {emExecucao
                  ? `Publicando na Shopee: ${estado.processados} de ${estado.total}...`
                  : estado.status === 'cancelado'
                  ? 'Publicação Shopee interrompida'
                  : 'Publicação na Shopee concluída'}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-700 truncate mt-0.5">
              {emExecucao
                ? estado.produtoAtualNome || estado.etapaAtual || 'Processando fila...'
                : `${estado.publicados} publicado(s) • ${estado.falhas + estado.pulados} pendência(s)`}
            </p>
          </div>
        </div>

        {!emExecucao && (
          <button
            type="button"
            onClick={() => shopeePublicacaoMassaService.fecharModal()}
            aria-label="Fechar resumo"
            title="Fechar"
            className="hubi-btn-close-x p-1 rounded-lg text-slate-700 hover:text-black transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {emExecucao && (
        <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
          <div
            className="h-full bg-emerald-400 transition-all duration-300"
            style={{ width: `${percentual}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[11px] font-bold text-slate-700">
          {estado.publicados} ok • {estado.falhas + estado.pulados} pendente(s)
        </span>

        <button
          type="button"
          onClick={handleAcao}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
            emExecucao
              ? 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black'
              : 'bg-emerald-300 hover:bg-emerald-400 text-black shadow-xs'
          }`}
        >
          {emExecucao ? (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-black" />
              <span>Expandir</span>
            </>
          ) : (
            <>
              <ClipboardList className="w-3.5 h-3.5 text-black" />
              <span>Ver Relatório do Lote</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
