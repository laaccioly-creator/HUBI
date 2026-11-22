import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Loader2, ShieldCheck, Calendar } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { MoneyInput } from '../ui/MoneyInput';
import { configuracoesPlataformaService } from '../../services/configuracoesPlataformaService';
import { LojaAreaHubi, areaHubiService } from '../../services/areaHubiService';

interface ModalAtivarAssinaturaManualProps {
  isOpen: boolean;
  onClose: () => void;
  loja: LojaAreaHubi | null;
  onSucesso: () => Promise<void> | void;
}

const MEIOS_PAGAMENTO_MANUAIS = [
  'Dinheiro (Espécie)',
  'Pix Direto',
  'Transferência',
  'Cortesia / Parceria',
] as const;

export const ModalAtivarAssinaturaManual: React.FC<ModalAtivarAssinaturaManualProps> = ({
  isOpen,
  onClose,
  loja,
  onSucesso,
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  useRegisterOverlay(isOpen, onClose, 'area-hubi-modal-ativar-manual', 'modal');

  const [cicloTipo, setCicloTipo] = useState<'anual' | 'mensal' | 'personalizado'>('mensal');
  const [unidadePersonalizada, setUnidadePersonalizada] = useState<'dias' | 'meses'>('dias');
  const [quantidadePersonalizada, setQuantidadePersonalizada] = useState<string>('30');
  const [meioPagamento, setMeioPagamento] = useState<string>('Dinheiro (Espécie)');
  const [valorTotal, setValorTotal] = useState<number>(69.90);
  const [observacoesAdmin, setObservacoesAdmin] = useState<string>('');

  const [valorTabelaAnual, setValorTabelaAnual] = useState<number>(598.80);
  const [valorTabelaMensal, setValorTabelaMensal] = useState<number>(69.90);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let ativo = true;

    setCicloTipo('mensal');
    setUnidadePersonalizada('dias');
    setQuantidadePersonalizada('30');
    setMeioPagamento('Dinheiro (Espécie)');
    setObservacoesAdmin('');
    setErro(null);

    configuracoesPlataformaService
      .obterParametros()
      .then((cfg) => {
        if (!ativo) return;
        const mensal = Number(cfg.valor_plano_mensal_avulso || 69.90);
        const anual = Number(cfg.valor_anual_total || Number((cfg.valor_mensal_anual || 49.90) * 12));
        setValorTabelaMensal(mensal);
        setValorTabelaAnual(anual);
        setValorTotal(mensal);
      })
      .catch(() => {
        if (!ativo) return;
        setValorTotal(69.90);
      });

    return () => {
      ativo = false;
    };
  }, [isOpen, loja?.id]);

  if (!isOpen || !loja) return null;

  const selecionarCiclo = (novoCiclo: 'anual' | 'mensal' | 'personalizado') => {
    setCicloTipo(novoCiclo);
    if (meioPagamento === 'Cortesia / Parceria') return;
    if (novoCiclo === 'anual') {
      setValorTotal(valorTabelaAnual);
    } else if (novoCiclo === 'mensal') {
      setValorTotal(valorTabelaMensal);
    }
  };

  const handleAlterarMeioPagamento = (novoMeio: string) => {
    setMeioPagamento(novoMeio);
    if (novoMeio === 'Cortesia / Parceria') {
      setValorTotal(0);
    } else if (valorTotal === 0) {
      setValorTotal(cicloTipo === 'anual' ? valorTabelaAnual : valorTabelaMensal);
    }
  };

  const calcularVigencia = (): { dias: number; meses: number; novaDataExibicao: string } => {
    let dias = 30;
    let meses = 1;
    if (cicloTipo === 'anual') {
      dias = 365;
      meses = 12;
    } else if (cicloTipo === 'mensal') {
      dias = 30;
      meses = 1;
    } else {
      const qtd = Math.max(1, Math.round(Number(quantidadePersonalizada || 1)));
      if (unidadePersonalizada === 'meses') {
        meses = qtd;
        dias = qtd * 30;
      } else {
        dias = qtd;
        meses = Math.max(1, Math.round(qtd / 30));
      }
    }

    const agora = new Date();
    const fimAtual = loja.assinatura_fim_em ? new Date(loja.assinatura_fim_em) : null;
    const base =
      loja.status_assinatura === 'ativo' && fimAtual && !isNaN(fimAtual.getTime()) && fimAtual > agora
        ? new Date(fimAtual)
        : agora;

    const novaData = new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
    return {
      dias,
      meses,
      novaDataExibicao: novaData.toLocaleDateString('pt-BR'),
    };
  };

  const vigenciaCalculada = calcularVigencia();

  const inputClass = `w-full px-3 py-2 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 ${
    isDark
      ? 'bg-slate-900 border-slate-700 text-white'
      : 'bg-white border-slate-300 text-black font-medium'
  }`;

  const labelClass = `block text-xs font-bold mb-1.5 ${
    isDark ? 'text-slate-200' : 'text-black'
  }`;

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    try {
      setSalvando(true);
      await areaHubiService.ativarAssinaturaManual({
        loja_id: loja.id,
        ciclo_tipo: cicloTipo,
        dias_vigencia: vigenciaCalculada.dias,
        ciclo_meses: vigenciaCalculada.meses,
        meio_pagamento: meioPagamento,
        valor_total: Number(valorTotal || 0),
        observacoes_admin: observacoesAdmin.trim() || undefined,
      });
      await onSucesso();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível concluir a ativação manual.';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden ${
          isDark ? 'bg-[#0B0F17] border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-black'
        }`}
      >
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm font-black truncate ${isDark ? 'text-white' : 'text-black'}`}>
                Ativar / Renovar Manualmente
              </h3>
              <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                {loja.nome_fantasia}
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

        <form onSubmit={handleConfirmar} className="p-5 space-y-4">
          {erro && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 text-xs font-semibold text-red-700 dark:text-red-300">
              {erro}
            </div>
          )}

          {/* Ciclo da Assinatura */}
          <div>
            <label className={labelClass}>Ciclo de Vigência</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'anual', titulo: 'Anual', desc: '12m / 365 dias' },
                { id: 'mensal', titulo: 'Mensal', desc: '1m / 30 dias' },
                { id: 'personalizado', titulo: 'Personalizado', desc: 'N dias/meses' },
              ].map((op) => {
                const selecionado = cicloTipo === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => selecionarCiclo(op.id as 'anual' | 'mensal' | 'personalizado')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      selecionado
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 dark:bg-emerald-500/15 dark:border-emerald-500 dark:text-emerald-300'
                        : isDark
                        ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                        : 'bg-slate-100 border-slate-300 text-black hover:bg-slate-200'
                    }`}
                  >
                    <div className="text-xs font-black">{op.titulo}</div>
                    <div className={`text-[10px] ${selecionado ? 'font-semibold' : isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      {op.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {cicloTipo === 'personalizado' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Quantidade</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantidadePersonalizada}
                  onChange={(e) => setQuantidadePersonalizada(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Unidade</label>
                <select
                  value={unidadePersonalizada}
                  onChange={(e) => setUnidadePersonalizada(e.target.value as 'dias' | 'meses')}
                  className={inputClass}
                >
                  <option value="dias">Dias</option>
                  <option value="meses">Meses (× 30 dias)</option>
                </select>
              </div>
            </div>
          )}

          {/* Meio de Pagamento e Valor Negociado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Meio de Pagamento</label>
              <select
                value={meioPagamento}
                onChange={(e) => handleAlterarMeioPagamento(e.target.value)}
                className={inputClass}
              >
                {MEIOS_PAGAMENTO_MANUAIS.map((meio) => (
                  <option key={meio} value={meio}>
                    {meio}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Valor Negociado (R$)</label>
              <MoneyInput
                value={valorTotal}
                onChange={setValorTotal}
                className={inputClass}
              />
            </div>
          </div>

          {/* Observação do Acordo */}
          <div>
            <label className={labelClass}>Observação do Acordo Comercial</label>
            <textarea
              rows={2}
              value={observacoesAdmin}
              onChange={(e) => setObservacoesAdmin(e.target.value)}
              placeholder='Ex: "Pagou o ano todo em dinheiro" ou "Combinado mensal todo dia 10"'
              className={inputClass}
            />
          </div>

          {/* Previsão de Vigência */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
              isDark
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-emerald-50 border-emerald-300 text-black font-semibold'
            }`}
          >
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              +{vigenciaCalculada.dias} dias de acesso. Nova vigência ativa até{' '}
              <strong className="font-black">{vigenciaCalculada.novaDataExibicao}</strong>.
            </span>
          </div>

          {/* Botões do Rodapé */}
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
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{salvando ? 'Ativando...' : 'Confirmar Ativação'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
