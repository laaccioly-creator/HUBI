// src/components/configuracoes/CardParametrosHubiAdmin.tsx
// Painel restrito de parâmetros comerciais globais da plataforma HUBI (Super Admin)
// Governança: supabase-rls-guard, anti-jsonb-linter, pii-leak-detector

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Save,
  Loader2,
  Calendar,
  CreditCard,
  Percent,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Settings2,
} from 'lucide-react';
import { configuracoesPlataformaService } from '../../services/configuracoesPlataformaService';
import { ConfiguracoesPlataformaHubi } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';

interface CardParametrosHubiAdminProps {
  emailLogado: string;
}

export const CardParametrosHubiAdmin: React.FC<CardParametrosHubiAdminProps> = ({ emailLogado }) => {
  const { isDark } = useTheme();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);

  // Estados dos campos comerciais
  const [diasTrial, setDiasTrial] = useState<number>(7);
  const [valorMensalAnual, setValorMensalAnual] = useState<number>(49.90);
  const [valorPlanoMensalAvulso, setValorPlanoMensalAvulso] = useState<number>(69.90);
  const [descontoPixPercentual, setDescontoPixPercentual] = useState<number>(5.00);
  const [aceitaDebito, setAceitaDebito] = useState<boolean>(true);
  const [maxParcelas, setMaxParcelas] = useState<number>(12);
  const [parcelasSemJuros, setParcelasSemJuros] = useState<number>(12);
  const [emailSuperAdmin, setEmailSuperAdmin] = useState<string>('laaccioly@hotmail.com');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);

  // Calcula valor total anual dinâmico (12x mensal anual)
  const valorAnualCalculado = Number((valorMensalAnual * 12).toFixed(2));

  // Carrega parâmetros iniciais do banco
  const carregarParametros = async () => {
    try {
      setCarregando(true);
      const params = await configuracoesPlataformaService.obterParametros();
      setDiasTrial(params.dias_trial);
      setValorMensalAnual(params.valor_mensal_anual);
      setValorPlanoMensalAvulso(params.valor_plano_mensal_avulso);
      setDescontoPixPercentual(params.desconto_pix_percentual);
      setAceitaDebito(params.aceita_cartao_debito);
      setMaxParcelas(params.max_parcelas_cartao);
      setParcelasSemJuros(params.parcelas_sem_juros);
      setEmailSuperAdmin(params.email_super_admin);
      setUltimaAtualizacao(params.atualizado_em || null);
    } catch (err: any) {
      console.error('[CardParametrosHubiAdmin] Falha ao carregar parâmetros:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarParametros();
  }, []);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSalvando(true);
      const atualizado = await configuracoesPlataformaService.salvarParametros({
        dias_trial: diasTrial,
        valor_mensal_anual: valorMensalAnual,
        valor_anual_total: valorAnualCalculado,
        valor_plano_mensal_avulso: valorPlanoMensalAvulso,
        desconto_pix_percentual: descontoPixPercentual,
        aceita_cartao_debito: aceitaDebito,
        max_parcelas_cartao: maxParcelas,
        parcelas_sem_juros: parcelasSemJuros,
        email_super_admin: emailSuperAdmin,
      });

      setUltimaAtualizacao(atualizado.atualizado_em || null);
      mostrarSucesso(
        'Os parâmetros comerciais e de degustação da plataforma foram atualizados com sucesso.',
        'Parâmetros Globais Salvos'
      );
    } catch (err: any) {
      mostrarErro(err?.message || 'Falha ao salvar parâmetros da plataforma.', 'Erro de Gravação');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
        <span>Carregando parâmetros globais da plataforma...</span>
      </div>
    );
  }

  return (
    <div
      className={`p-5 sm:p-6 rounded-2xl border transition-all duration-200 shadow-sm ${
        isDark ? 'bg-slate-950 border-amber-500/30' : 'bg-amber-50/40 border-amber-300'
      }`}
    >
      {/* Cabeçalho do Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-amber-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-black text-sm sm:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                ⚙️ Parâmetros Globais HUBI
              </h3>
              <span className="text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Super Admin
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Gerencie prazos de degustação gratuita (trial), valores dos planos e regras comerciais para todas as lojas.
            </p>
          </div>
        </div>

        {ultimaAtualizacao && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 self-start sm:self-auto font-mono">
            Última alteração: {new Date(ultimaAtualizacao).toLocaleString('pt-BR')}
          </span>
        )}
      </div>

      <form onSubmit={handleSalvar} className="mt-5 space-y-5">
        {/* Bloco 1: Degustação Gratuita (Trial) */}
        <div>
          <h4 className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            <span>Período de Degustação Gratuita (Trial)</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-2xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Prazo Padrão de Trial (Dias)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="90"
                  required
                  value={diasTrial}
                  onChange={(e) => setDiasTrial(parseInt(e.target.value) || 7)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-bold outline-hidden focus:border-amber-500"
                />
                <span className="absolute right-3 top-2 text-[11px] text-slate-400 font-bold">dias</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                A tarja superior e os bloqueios de novas lojas consumirão este prazo a partir de <code>criado_em</code>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-2xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                E-mail Mestre Super Admin
              </label>
              <input
                type="email"
                required
                value={emailSuperAdmin}
                onChange={(e) => setEmailSuperAdmin(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-bold outline-hidden focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Apenas esta conta autenticada tem autorização de gravação via RLS no banco de dados.
              </p>
            </div>
          </div>
        </div>

        {/* Bloco 2: Valores dos Planos */}
        <div>
          <h4 className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
            <span>Valores de Planos & Assinatura</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-2xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Plano Anual (Mensal Ref.)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">R$</span>
                <input
                  type="number"
                  step="0.10"
                  min="1"
                  required
                  value={valorMensalAnual}
                  onChange={(e) => setValorMensalAnual(parseFloat(e.target.value) || 0)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold outline-hidden focus:border-emerald-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Valor exibido no banner de trial (Ex: R$ 49,90/mês).
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-2xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Total Anual Faturado
              </label>
              <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-black text-emerald-600 dark:text-emerald-400">
                R$ {valorAnualCalculado.toFixed(2)} / ano
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Calculado automaticamente: 12 parcelas de R$ {valorMensalAnual.toFixed(2)}.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-2xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Plano Mensal Avulso
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">R$</span>
                <input
                  type="number"
                  step="0.10"
                  min="1"
                  required
                  value={valorPlanoMensalAvulso}
                  onChange={(e) => setValorPlanoMensalAvulso(parseFloat(e.target.value) || 0)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold outline-hidden focus:border-emerald-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Cobrança mensal avulsa sem fidelidade anual.
              </p>
            </div>
          </div>
        </div>

        {/* Bloco 3: Regras de Checkout & Cartão */}
        <div>
          <h4 className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <CreditCard className="w-3.5 h-3.5 text-blue-500" />
            <span>Condições de Pagamento & Gateway</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-2xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Desconto PIX (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  value={descontoPixPercentual}
                  onChange={(e) => setDescontoPixPercentual(parseFloat(e.target.value) || 0)}
                  className="w-full pr-7 pl-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold outline-hidden focus:border-blue-500"
                />
                <Percent className="w-3 h-3 text-slate-400 absolute right-3 top-2.5" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-2xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Máximo de Parcelas
              </label>
              <select
                value={maxParcelas}
                onChange={(e) => setMaxParcelas(parseInt(e.target.value) || 12)}
                className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold outline-hidden focus:border-blue-500"
              >
                {[1, 2, 3, 4, 5, 6, 10, 12, 18, 24].map((n) => (
                  <option key={n} value={n}>
                    Até {n}x
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-2xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Parcelas Sem Juros
              </label>
              <select
                value={parcelasSemJuros}
                onChange={(e) => setParcelasSemJuros(parseInt(e.target.value) || 12)}
                className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold outline-hidden focus:border-blue-500"
              >
                {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}x sem juros
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-2xs">
              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Aceitar Débito
                </span>
                <span className="text-[10px] text-slate-400 block">Cartão de débito no MP</span>
              </div>
              <input
                type="checkbox"
                checked={aceitaDebito}
                onChange={(e) => setAceitaDebito(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Rodapé com Botão Salvar */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>As mudanças refletirão imediatamente em novos checkouts e no banner de trial.</span>
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            {salvando ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Gravando Parâmetros...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Parâmetros Globais</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
