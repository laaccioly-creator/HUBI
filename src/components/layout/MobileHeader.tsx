import React from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { useMenu } from '../../contexts/MenuContext';
import { useGlobalNavigation } from '../../hooks/useGlobalNavigation';

export interface MobileHeaderProps {
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  iconeTitulo?: React.ReactNode;
  onVoltar?: () => void;
  mostrarVoltar?: boolean;
  mostrarMenu?: boolean;
  acoesDireita?: React.ReactNode;
  className?: string;
  fallbackVoltar?: string;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  titulo,
  subtitulo,
  iconeTitulo,
  onVoltar,
  mostrarVoltar = true,
  mostrarMenu = true,
  acoesDireita,
  className = '',
  fallbackVoltar = '/pos'
}) => {
  const { abrirMenuMobile } = useMenu();
  const { voltar } = useGlobalNavigation({ fallbackPath: fallbackVoltar });

  const handleVoltar = () => {
    if (onVoltar) {
      onVoltar();
    } else {
      voltar();
    }
  };

  return (
    <header
      className={`h-14 sm:h-16 border-b border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#0B0F17] px-3 sm:px-4 flex items-center justify-between shrink-0 sticky top-0 z-20 select-none ${className}`}
    >
      {/* Bloco Esquerda: [ <- Voltar ] [ ☰ Menu ] [ Ícone & Título ] */}
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        {mostrarVoltar && (
          <button
            type="button"
            onClick={handleVoltar}
            className="p-1.5 sm:p-2 rounded-xl sm:rounded-2xl hover:bg-slate-100 dark:hover:bg-[#1E293B] text-slate-800 dark:text-slate-200 transition cursor-pointer shrink-0"
            title="Voltar"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {mostrarMenu && (
          <button
            type="button"
            onClick={abrirMenuMobile}
            className="p-1.5 sm:p-2 rounded-xl sm:rounded-2xl hover:bg-slate-100 dark:hover:bg-[#1E293B] text-slate-900 dark:text-white transition cursor-pointer shrink-0"
            title="Menu Principal"
            aria-label="Menu Principal"
          >
            <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-slate-900 dark:text-white stroke-[2.25]" />
          </button>
        )}

        {iconeTitulo && (
          <div className="shrink-0 flex items-center">
            {iconeTitulo}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {typeof titulo === 'string' ? (
            <h1 className="font-black text-sm sm:text-base text-slate-900 dark:text-white tracking-tight truncate leading-tight">
              {titulo}
            </h1>
          ) : (
            titulo
          )}

          {subtitulo && (
            typeof subtitulo === 'string' ? (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                {subtitulo}
              </p>
            ) : (
              subtitulo
            )
          )}
        </div>
      </div>

      {/* Bloco Direita: Ações Contextuais (Filtros, Novo, Status) */}
      {acoesDireita && (
        <div className="flex items-center gap-2 shrink-0">
          {acoesDireita}
        </div>
      )}
    </header>
  );
};
