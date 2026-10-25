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
  Settings2,
  Phone,
  ExternalLink,
  Eye,
  EyeOff,
  Copy,
  Check,
  Shield,
  AlertTriangle,
  Sliders
} from 'lucide-react';
import { configuracoesPlataformaService } from '../../services/configuracoesPlataformaService';
import { testarConexaoMeta, salvarConfiguracoesWhatsApp } from '../../services/whatsappIaService';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';

interface CardParametrosHubiAdminProps {
  emailLogado: string;
  lojaId?: string;
}

export const CardParametrosHubiAdmin: React.FC<CardParametrosHubiAdminProps> = ({
  emailLogado,
  lojaId,
}) => {
  const { isDark } = useTheme();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);

  // Estados dos campos comerciais
  const [diasTrial, setDiasTrial] = useState<number>(7);
  const [valorMensalAnual, setValorMensalAnual] = useState<number>(49.9);
  const [valorPlanoMensalAvulso, setValorPlanoMensalAvulso] = useState<number>(69.9);
  const [descontoPixPercentual, setDescontoPixPercentual] = useState<number>(5.0);
  const [aceitaDebito, setAceitaDebito] = useState<boolean>(true);
  const [maxParcelas, setMaxParcelas] = useState<number>(12);
  const [parcelasSemJuros, setParcelasSemJuros] = useState<number>(12);
  const [emailSuperAdmin, setEmailSuperAdmin] = useState<string>('laaccioly@hotmail.com');
  const [custoDisparoWhatsapp, setCustoDisparoWhatsapp] = useState<number>(0.15);
  const [valorMinimoRecargaWhatsapp, setValorMinimoRecargaWhatsapp] = useState<number>(10.0);
  const [creditoBonusTrialWhatsapp, setCreditoBonusTrialWhatsapp] = useState<number>(2.0);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);

  // Estados da Meta Cloud API
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState<string>('');
  const [metaWabaId, setMetaWabaId] = useState<string>('');
  const [metaAccessToken, setMetaAccessToken] = useState<string>('');
  const [metaVerifyToken, setMetaVerifyToken] = useState<string>('hubi_whatsapp_webhook_token');
  const [mostrarMetaToken, setMostrarMetaToken] = useState<boolean>(false);
  const [testandoMeta, setTestandoMeta] = useState<boolean>(false);
  const [statusMeta, setStatusMeta] = useState<{ sucesso: boolean; mensagem: string } | null>(null);
  const [copiadoUrl, setCopiadoUrl] = useState<boolean>(false);
  const [copiadoToken, setCopiadoToken] = useState<boolean>(false);

  // URL do Webhook dinamicamente montada com o host do Supabase
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://eylpiwynsbnmcacmwiqg.supabase.co';
  const webhookCallbackUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/whatsapp-webhook`;

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
      setCustoDisparoWhatsapp(Number(params.custo_disparo_whatsapp ?? 0.15));
      setValorMinimoRecargaWhatsapp(Number(params.valor_minimo_recarga_whatsapp ?? 10.0));
      setCreditoBonusTrialWhatsapp(Number(params.credito_bonus_trial_whatsapp ?? 2.0));
      setMetaPhoneNumberId(params.meta_phone_number_id || '');
      setMetaWabaId(params.meta_waba_id || '');
      setMetaAccessToken(params.meta_access_token || '');
      setMetaVerifyToken(params.meta_verify_token || 'hubi_whatsapp_webhook_token');
      setUltimaAtualizacao(params.atualizado_em || null);
    } catch (err: unknown) {
      console.error('[CardParametrosHubiAdmin] Falha ao carregar parâmetros:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarParametros();
  }, []);

  const copiarParaClipboard = async (
    texto: string,
    setFeedback: (val: boolean) => void
  ) => {
    try {
      await navigator.clipboard.writeText(texto);
      setFeedback(true);
      setTimeout(() => setFeedback(false), 2500);
    } catch {
      // Silencioso
    }
  };

  const handleTestarMeta = async () => {
    try {
      setTestandoMeta(true);
      setStatusMeta(null);
      const resultado = await testarConexaoMeta(metaPhoneNumberId, metaAccessToken);
      setStatusMeta(resultado);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao validar credenciais da Meta.';
      setStatusMeta({ sucesso: false, mensagem: msg });
    } finally {
      setTestandoMeta(false);
    }
  };

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
        custo_disparo_whatsapp: custoDisparoWhatsapp,
        valor_minimo_recarga_whatsapp: valorMinimoRecargaWhatsapp,
        credito_bonus_trial_whatsapp: creditoBonusTrialWhatsapp,
        meta_phone_number_id: metaPhoneNumberId.trim() || null,
        meta_waba_id: metaWabaId.trim() || null,
        meta_access_token: metaAccessToken.trim() || null,
        meta_verify_token: metaVerifyToken.trim() || 'hubi_whatsapp_webhook_token',
      });

      if (lojaId) {
        await salvarConfiguracoesWhatsApp(lojaId, {
          meta_phone_number_id: metaPhoneNumberId.trim() || undefined,
          meta_waba_id: metaWabaId.trim() || undefined,
          meta_access_token: metaAccessToken.trim() || undefined,
          meta_verify_token: metaVerifyToken.trim() || 'hubi_whatsapp_webhook_token',
        });
      }

      setUltimaAtualizacao(atualizado.atualizado_em || null);
      mostrarSucesso(
        'Os parâmetros comerciais e credenciais da Meta Cloud API foram atualizados com sucesso.',
        'Parâmetros Globais Salvos'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar parâmetros da plataforma.';
      mostrarErro(msg, 'Erro de Gravação');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div
        className={`p-6 rounded-2xl border flex items-center justify-center gap-2 text-xs ${
          isDark
            ? 'bg-slate-900 border-slate-700/80 text-slate-400'
            : 'bg-white border-slate-200 text-slate-500'
        }`}
      >
        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
        <span>Carregando parâmetros globais da plataforma...</span>
      </div>
    );
  }

  return (
    <div
      className={`p-5 sm:p-6 rounded-2xl border transition-all duration-200 shadow-sm ${
        isDark ? 'bg-slate-900 border-slate-700/80' : 'bg-white border-slate-200'
      }`}
    >
      {/* Cabeçalho do Card */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
            <ShieldAlert className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-black text-sm sm:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                ⚙️ Parâmetros Globais HUBI
              </h3>
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Super Admin
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Gerencie prazos de degustação gratuita (trial), valores dos planos, regras comerciais e infraestrutura Meta.
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
          <h4
            className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
            <span>Período de Degustação Gratuita (Trial)</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
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
                  className={`w-full rounded-xl px-3 py-2 text-xs font-bold outline-hidden border ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
                <span className="absolute right-3 top-2 text-[11px] text-slate-400 font-bold">dias</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                A tarja superior e os bloqueios de novas lojas consumirão este prazo a partir de <code>criado_em</code>.
              </p>
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                E-mail Mestre Super Admin
              </label>
              <input
                type="email"
                required
                value={emailSuperAdmin}
                onChange={(e) => setEmailSuperAdmin(e.target.value)}
                className={`w-full rounded-xl px-3 py-2 text-xs font-bold outline-hidden border ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                }`}
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Apenas esta conta autenticada ({emailLogado}) tem autorização de gravação via RLS no banco de dados.
              </p>
            </div>
          </div>
        </div>

        {/* Bloco 2: Valores dos Planos */}
        <div>
          <h4
            className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
            <span>Valores de Planos & Assinatura</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
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
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold outline-hidden border ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Valor exibido no banner de trial (Ex: R$ 49,90/mês).
              </p>
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                Total Anual Faturado
              </label>
              <div
                className={`px-3 py-2 rounded-xl border text-xs font-black ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-emerald-400'
                    : 'bg-slate-100 border-slate-200 text-emerald-600'
                }`}
              >
                R$ {valorAnualCalculado.toFixed(2)} / ano
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Calculado automaticamente: 12 parcelas de R$ {valorMensalAnual.toFixed(2)}.
              </p>
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
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
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold outline-hidden border ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
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
          <h4
            className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-blue-500" />
            <span>Condições de Pagamento & Gateway</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
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
                  className={`w-full pr-7 pl-3 py-2 rounded-xl text-xs font-bold outline-hidden border ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-blue-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                  }`}
                />
                <Percent className="w-3 h-3 text-slate-400 absolute right-3 top-2.5" />
              </div>
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                Máximo de Parcelas
              </label>
              <select
                value={maxParcelas}
                onChange={(e) => setMaxParcelas(parseInt(e.target.value) || 12)}
                className={`w-full py-2 px-3 rounded-xl text-xs font-bold outline-hidden border ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-white focus:border-blue-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              >
                {[1, 2, 3, 4, 5, 6, 10, 12, 18, 24].map((n) => (
                  <option key={n} value={n}>
                    Até {n}x
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                Parcelas Sem Juros
              </label>
              <select
                value={parcelasSemJuros}
                onChange={(e) => setParcelasSemJuros(parseInt(e.target.value) || 12)}
                className={`w-full py-2 px-3 rounded-xl text-xs font-bold outline-hidden border ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-white focus:border-blue-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              >
                {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}x sem juros
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <span
                  className={`text-xs font-bold block ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
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

        {/* Bloco 4: Carteira Pré-Paga & Motor Híbrido WhatsApp */}
        <div>
          <h4
            className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Carteira Pré-Paga & Tarifação WhatsApp Cloud API</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                Tarifa por Disparo Ativo (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={custoDisparoWhatsapp}
                  onChange={(e) => setCustoDisparoWhatsapp(parseFloat(e.target.value) || 0)}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold outline-hidden border ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Valor debitado da carteira por template enviado fora da janela de 24h.
              </p>
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                Recarga Mínima via Pix (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">R$</span>
                <input
                  type="number"
                  step="1.00"
                  min="1"
                  required
                  value={valorMinimoRecargaWhatsapp}
                  onChange={(e) => setValorMinimoRecargaWhatsapp(parseFloat(e.target.value) || 10)}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold outline-hidden border ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Depósito mínimo exigido para recarregar créditos na carteira.
              </p>
            </div>

            <div
              className={`p-3.5 rounded-xl border space-y-1 shadow-2xs ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label
                className={`text-xs font-bold block ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                Bônus Inicial Trial (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">R$</span>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  required
                  value={creditoBonusTrialWhatsapp}
                  onChange={(e) => setCreditoBonusTrialWhatsapp(parseFloat(e.target.value) || 0)}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold outline-hidden border ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Cortesia inicial (válida nos 7 primeiros dias de degustação).
              </p>
            </div>
          </div>
        </div>

        {/* Bloco 5: Infraestrutura Meta Cloud API (WhatsApp Oficial) */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4
              className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              <Phone className="w-3.5 h-3.5 text-emerald-500" />
              <span>Infraestrutura Meta Cloud API (WhatsApp Oficial)</span>
            </h4>
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-emerald-500 hover:text-emerald-400 hover:underline"
            >
              <span>Portal Meta Developers</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div
            className={`p-4 rounded-xl border space-y-4 ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  className={`block text-xs font-bold mb-1 ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  Phone Number ID
                </label>
                <input
                  type="text"
                  placeholder="Ex: 104523991283..."
                  value={metaPhoneNumberId}
                  onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden font-mono ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div>
                <label
                  className={`block text-xs font-bold mb-1 ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  WhatsApp Business Account ID (WABA)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 109283746501..."
                  value={metaWabaId}
                  onChange={(e) => setMetaWabaId(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-hidden font-mono ${
                    isDark
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>

            {/* Token de Acesso Meta */}
            <div>
              <label
                className={`block text-xs font-bold mb-1 ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                Token Permanente de Usuário do Sistema (System User Token)
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={mostrarMetaToken ? 'text' : 'password'}
                    placeholder="EAA..."
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                    className={`w-full pl-3 pr-10 py-2 text-xs rounded-xl border outline-hidden font-mono ${
                      isDark
                        ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarMetaToken(!mostrarMetaToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  >
                    {mostrarMetaToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTestarMeta}
                  disabled={testandoMeta || !metaPhoneNumberId || !metaAccessToken}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    isDark
                      ? 'bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  } disabled:opacity-50`}
                >
                  {testandoMeta ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Validando...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Testar Meta API</span>
                    </>
                  )}
                </button>
              </div>

              {/* Feedback Teste Meta */}
              {statusMeta && (
                <div
                  className={`p-2.5 mt-2 rounded-xl flex items-center gap-2 text-xs ${
                    statusMeta.sucesso
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {statusMeta.sucesso ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{statusMeta.mensagem}</span>
                </div>
              )}
            </div>

            {/* Configuração de Webhook */}
            <div
              className={`p-3.5 rounded-xl border space-y-3 ${
                isDark
                  ? 'bg-slate-950 border-slate-700 text-slate-200'
                  : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
                  Configuração de Webhook no Painel da Meta
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Callback URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookCallbackUrl}
                      className={`w-full px-3 py-1.5 text-xs rounded-lg border font-mono select-all ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-emerald-400'
                          : 'bg-slate-50 border-slate-300 text-emerald-800'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => copiarParaClipboard(webhookCallbackUrl, setCopiadoUrl)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1 shrink-0"
                    >
                      {copiadoUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{copiadoUrl ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Verify Token
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={metaVerifyToken}
                      onChange={(e) => setMetaVerifyToken(e.target.value)}
                      className={`w-full px-3 py-1.5 text-xs rounded-lg border font-mono ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => copiarParaClipboard(metaVerifyToken, setCopiadoToken)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1 shrink-0"
                    >
                      {copiadoToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{copiadoToken ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                💡 No portal <strong>Meta for Developers &gt; WhatsApp &gt; Configuração &gt; Webhook</strong>, insira a URL e Token acima. Depois, em <strong>Campos do Webhook</strong>, assine o campo <code>messages</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé com Botão Salvar Padrão HUBI (Verde Esmeralda) */}
        <div
          className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>As mudanças refletirão imediatamente em toda a infraestrutura e checkouts do HUBI.</span>
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 text-xs shadow-sm"
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
