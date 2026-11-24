import React, { useState, useEffect } from 'react';
import { X, Target, Save, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { MoneyInput } from '../ui/MoneyInput';
import { MetasAreaHubi } from '../../services/areaHubiService';

interface ModalConfigurarMetasHubiProps {
  isOpen: boolean;
  onClose: () => void;
  metasAtuais: MetasAreaHubi;
  onSalvar: (metas: MetasAreaHubi) => Promise<void>;
}

export const ModalConfigurarMetasHubi: React.FC<ModalConfigurarMetasHubiProps> = ({
  isOpen,
  onClose,
  metasAtuais,
  onSalvar,
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  useRegisterOverlay(isOpen, onClose, 'area-hubi-modal-metas', 'modal');

  const [faturamento, setFaturamento] = useState<number>(0);
  const [vendas, setVendas] = useState<string>('0');
  const [conversao, setConversao] = useState<string>('0');
  const [maxNaoRenovados, setMaxNaoRenovados] = useState<string>('0');
  const [lojasAtivas, setLojasAtivas] = useState<string>('0');
  const [receitaWhatsapp, setReceitaWhatsapp] = useState<number>(0);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFaturamento(Number(metasAtuais.meta_hubi_faturamento || 0));
      setVendas(String(Math.round(Number(metasAtuais.meta_hubi_vendas || 0))));
      setConversao(String(Number(metasAtuais.meta_hubi_conversao_percentual || 0)));
      setMaxNaoRenovados(String(Math.round(Number(metasAtuais.meta_hubi_max_nao_renovados || 0))));
      setLojasAtivas(String(Math.round(Number(metasAtuais.meta_hubi_lojas_ativas || 0))));
      setReceitaWhatsapp(Number(metasAtuais.meta_hubi_receita_whatsapp || 0));
      setErro(null);
    }
  }, [isOpen, metasAtuais]);

  if (!isOpen) return null;

  const inputBaseClass = `w-full px-3 py-2 rounded-xl text-sm border transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 ${
    isDark
      ? 'bg-slate-900 border-slate-700 text-white'
      : 'bg-white border-slate-300 text-black font-medium'
  }`;

  const labelBaseClass = `block text-xs font-bold mb-1.5 ${
    isDark ? 'text-slate-200' : 'text-black'
  }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    try {
      setSalvando(true);
      await onSalvar({
        meta_hubi_faturamento: Math.max(0, Number(faturamento || 0)),
        meta_hubi_vendas: Math.max(0, Math.round(Number(vendas || 0))),
        meta_hubi_conversao_percentual: Math.max(0, Math.min(100, Number(conversao.replace(',', '.') || 0))),
        meta_hubi_max_nao_renovados: Math.max(0, Math.round(Number(maxNaoRenovados || 0))),
        meta_hubi_lojas_ativas: Math.max(0, Math.round(Number(lojasAtivas || 0))),
        meta_hubi_receita_whatsapp: Math.max(0, Number(receitaWhatsapp || 0)),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível salvar as metas da plataforma.';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div
        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden ${
          isDark ? 'bg-[#0B0F17] border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-black'
        }`}
      >
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>
                Configurar Metas Rubi
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                Metas executivas globais exibidas nos 6 velocímetros do Cockpit SaaS
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition cursor-pointer ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {erro && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 text-xs font-semibold text-red-700 dark:text-red-300">
              {erro}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelBaseClass}>Meta Faturamento Bruto Rubi (R$)</label>
              <MoneyInput
                value={faturamento}
                onChange={setFaturamento}
                className={inputBaseClass}
              />
            </div>

            <div>
              <label className={labelBaseClass}>Meta Volume de Assinaturas (Qtd)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={vendas}
                onChange={(e) => setVendas(e.target.value)}
                className={inputBaseClass}
              />
            </div>

            <div>
              <label className={labelBaseClass}>Meta Taxa de Conversão (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={conversao}
                onChange={(e) => setConversao(e.target.value)}
                className={inputBaseClass}
              />
            </div>

            <div>
              <label className={labelBaseClass}>Teto Máx. Não Renovados / Expirados</label>
              <input
                type="number"
                min={0}
                step={1}
                value={maxNaoRenovados}
                onChange={(e) => setMaxNaoRenovados(e.target.value)}
                className={inputBaseClass}
              />
            </div>

            <div>
              <label className={labelBaseClass}>Meta Base de Lojas Ativas Pagantes</label>
              <input
                type="number"
                min={0}
                step={1}
                value={lojasAtivas}
                onChange={(e) => setLojasAtivas(e.target.value)}
                className={inputBaseClass}
              />
            </div>

            <div>
              <label className={labelBaseClass}>Meta Receita Carteira WhatsApp (R$)</label>
              <MoneyInput
                value={receitaWhatsapp}
                onChange={setReceitaWhatsapp}
                className={inputBaseClass}
              />
            </div>
          </div>

          <div
            className={`pt-4 border-t flex items-center justify-end gap-2.5 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className={`px-4 py-2 rounded-xl text-xs border transition cursor-pointer ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 font-semibold'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black font-semibold'
              }`}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{salvando ? 'Salvando...' : 'Salvar Metas Rubi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
