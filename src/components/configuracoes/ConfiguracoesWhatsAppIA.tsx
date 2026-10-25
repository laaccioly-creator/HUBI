import React, { useEffect } from 'react';
import { Bot, ArrowLeft } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { CardCarteiraWhatsapp } from './CardCarteiraWhatsapp';

export interface ConfiguracoesWhatsAppIAProps {
  lojaId?: string;
  onVoltar?: () => void;
  saveRef?: React.MutableRefObject<{ salvar: () => Promise<void> } | null>;
  onSalvandoChange?: (salvando: boolean) => void;
}

export const ConfiguracoesWhatsAppIA: React.FC<ConfiguracoesWhatsAppIAProps> = ({
  onVoltar,
  saveRef,
  onSalvandoChange,
}) => {
  const { isDark } = useTheme();
  const { loja, usuario, recarregarDadosLoja } = useAuth();

  useEffect(() => {
    if (saveRef) {
      saveRef.current = {
        salvar: async () => {},
      };
    }
    onSalvandoChange?.(false);
  }, [saveRef, onSalvandoChange]);

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Cabeçalho da Aba */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              onClick={onVoltar}
              className={`p-2 rounded-xl transition-all ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
              title="Voltar ao menu"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Atendimento WhatsApp com IA</h1>
            <p className={`text-xs md:text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Carteira Pré-Paga e Motor Híbrido de Notificações Inteligentes
            </p>
          </div>
        </div>
      </div>

      {/* CARTEIRA PRÉ-PAGA (WALLET) & MOTOR HÍBRIDO DE NOTIFICAÇÕES WHATSAPP */}
      {loja && (
        <CardCarteiraWhatsapp
          loja={loja}
          usuarioId={usuario?.id || null}
          aoAtualizarLoja={() => {
            recarregarDadosLoja?.();
          }}
        />
      )}
    </div>
  );
};
