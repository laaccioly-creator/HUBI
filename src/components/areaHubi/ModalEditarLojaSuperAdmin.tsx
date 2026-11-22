import React, { useState, useEffect } from 'react';
import {
  X,
  Store,
  Save,
  Loader2,
  Receipt,
  Calendar,
  MapPin,
  FileText,
  CheckCircle2
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { StatusAssinaturaLoja, TipoDocumento } from '../../types';
import { formatarMoeda } from '../../utils/formatters';
import {
  LojaAreaHubi,
  areaHubiService
} from '../../services/areaHubiService';

interface ModalEditarLojaSuperAdminProps {
  isOpen: boolean;
  onClose: () => void;
  loja: LojaAreaHubi | null;
  onSucesso: () => Promise<void> | void;
}

const isoParaDateInput = (iso?: string | null): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const dateInputParaIsoFimDia = (val: string): string | null => {
  const limpo = val.trim();
  if (!limpo) return null;
  return `${limpo}T23:59:59.000Z`;
};

const formatarDataBr = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
};

export const ModalEditarLojaSuperAdmin: React.FC<ModalEditarLojaSuperAdminProps> = ({
  isOpen,
  onClose,
  loja,
  onSucesso,
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  useRegisterOverlay(isOpen, onClose, 'area-hubi-modal-editar-loja', 'modal');

  const [nomeFantasia, setNomeFantasia] = useState<string>('');
  const [razaoSocial, setRazaoSocial] = useState<string>('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('CNPJ');
  const [numeroDocumento, setNumeroDocumento] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [cep, setCep] = useState<string>('');
  const [logradouro, setLogradouro] = useState<string>('');
  const [numero, setNumero] = useState<string>('');
  const [complemento, setComplemento] = useState<string>('');
  const [bairro, setBairro] = useState<string>('');
  const [cidade, setCidade] = useState<string>('');
  const [estado, setEstado] = useState<string>('');
  const [statusAssinatura, setStatusAssinatura] = useState<StatusAssinaturaLoja>('trial');
  const [trialFimDate, setTrialFimDate] = useState<string>('');
  const [assinaturaFimDate, setAssinaturaFimDate] = useState<string>('');

  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && loja) {
      setNomeFantasia(loja.nome_fantasia || '');
      setRazaoSocial(loja.razao_social || '');
      const digits = (loja.numero_documento || '').replace(/\D/g, '');
      setTipoDocumento(loja.tipo_documento || (digits.length === 11 ? 'CPF' : 'CNPJ'));
      setNumeroDocumento(loja.numero_documento || '');
      setWhatsapp(loja.whatsapp || '');
      setEmail(loja.email || '');
      setCep(loja.endereco_cep || '');
      setLogradouro(loja.endereco_logradouro || '');
      setNumero(loja.endereco_numero || '');
      setComplemento(loja.endereco_complemento || '');
      setBairro(loja.endereco_bairro || '');
      setCidade(loja.endereco_cidade || '');
      setEstado(loja.endereco_estado || '');
      setStatusAssinatura(loja.status_assinatura || 'trial');
      setTrialFimDate(isoParaDateInput(loja.trial_fim_em));
      setAssinaturaFimDate(isoParaDateInput(loja.assinatura_fim_em));
      setErro(null);
    }
  }, [isOpen, loja]);

  if (!isOpen || !loja) return null;

  const inputClass = `w-full px-3 py-2 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 ${
    isDark
      ? 'bg-slate-900 border-slate-700 text-white'
      : 'bg-white border-slate-300 text-black font-medium'
  }`;

  const labelClass = `block text-[11px] font-bold mb-1 ${
    isDark ? 'text-slate-200' : 'text-black'
  }`;

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeFantasia.trim()) {
      setErro('O Nome Fantasia da loja é obrigatório.');
      return;
    }

    setErro(null);
    try {
      setSalvando(true);
      await areaHubiService.atualizarDadosLoja({
        loja_id: loja.id,
        nome_fantasia: nomeFantasia.trim(),
        razao_social: razaoSocial.trim() || null,
        tipo_documento: tipoDocumento,
        numero_documento: numeroDocumento.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        endereco_cep: cep.trim() || null,
        endereco_logradouro: logradouro.trim() || null,
        endereco_numero: numero.trim() || null,
        endereco_complemento: complemento.trim() || null,
        endereco_bairro: bairro.trim() || null,
        endereco_cidade: cidade.trim() || null,
        endereco_estado: estado.trim().toUpperCase().slice(0, 2) || null,
        status_assinatura: statusAssinatura,
        trial_fim_em: dateInputParaIsoFimDia(trialFimDate),
        assinatura_fim_em: dateInputParaIsoFimDia(assinaturaFimDate),
      });
      await onSucesso();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar dados cadastrais da loja.';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in">
      <div
        className={`w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
          isDark ? 'bg-[#0B0F17] border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-black'
        }`}
      >
        {/* Cabeçalho */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm sm:text-base font-black truncate ${isDark ? 'text-white' : 'text-black'}`}>
                Dados da Loja: {loja.nome_fantasia}
              </h3>
              <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                Edição cadastral, vigência de assinatura e histórico financeiro
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition cursor-pointer shrink-0 ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulário + Histórico Scrollável */}
        <form onSubmit={handleSalvar} className="flex-1 overflow-y-auto p-5 space-y-6">
          {erro && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 text-xs font-semibold text-red-700 dark:text-red-300">
              {erro}
            </div>
          )}

          {/* Bloco 1: Identificação e Contato */}
          <div className="space-y-3">
            <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wide ${isDark ? 'text-emerald-400' : 'text-black'}`}>
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Identificação & Contato</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Nome Fantasia *</label>
                <input
                  type="text"
                  required
                  value={nomeFantasia}
                  onChange={(e) => setNomeFantasia(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Razão Social</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Tipo de Documento</label>
                <select
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                  className={inputClass}
                >
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Número do Documento</label>
                <input
                  type="text"
                  value={numeroDocumento}
                  onChange={(e) => setNumeroDocumento(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>WhatsApp</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Bloco 2: Endereço Completo */}
          <div className="space-y-3">
            <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wide ${isDark ? 'text-emerald-400' : 'text-black'}`}>
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Endereço da Loja</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClass}>CEP</label>
                <input
                  type="text"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-3">
                <label className={labelClass}>Logradouro</label>
                <input
                  type="text"
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-1">
                <label className={labelClass}>Número</label>
                <input
                  type="text"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>Complemento</label>
                <input
                  type="text"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>Bairro</label>
                <input
                  type="text"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-1">
                <label className={labelClass}>Cidade</label>
                <input
                  type="text"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-1">
                <label className={labelClass}>UF</label>
                <input
                  type="text"
                  maxLength={2}
                  value={estado}
                  onChange={(e) => setEstado(e.target.value.toUpperCase())}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Bloco 3: Status e Vigência */}
          <div className="space-y-3">
            <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wide ${isDark ? 'text-emerald-400' : 'text-black'}`}>
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Status Comercial & Vigência</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Status da Assinatura</label>
                <select
                  value={statusAssinatura}
                  onChange={(e) => setStatusAssinatura(e.target.value as StatusAssinaturaLoja)}
                  className={inputClass}
                >
                  <option value="trial">Trial (Período de Teste)</option>
                  <option value="ativo">Ativo (Assinante)</option>
                  <option value="atrasado">Atrasado</option>
                  <option value="bloqueado">Bloqueado</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Fim do Trial</label>
                <input
                  type="date"
                  value={trialFimDate}
                  onChange={(e) => setTrialFimDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Fim da Assinatura</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={assinaturaFimDate}
                    onChange={(e) => setAssinaturaFimDate(e.target.value)}
                    className={inputClass}
                  />
                  {assinaturaFimDate && (
                    <button
                      type="button"
                      onClick={() => setAssinaturaFimDate('')}
                      title="Limpar data"
                      className={`px-2 py-2 rounded-xl border text-xs cursor-pointer ${
                        isDark
                          ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                          : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-black'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bloco 4: Histórico de Pagamentos desta Loja */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wide ${isDark ? 'text-emerald-400' : 'text-black'}`}>
                <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Histórico de Pagamentos ({loja.pagamentos.length})</span>
              </div>
              <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-black'}`}>
                Total Investido: {formatarMoeda(loja.total_investido)}
              </span>
            </div>

            {loja.pagamentos.length === 0 ? (
              <div
                className={`p-4 rounded-xl border text-xs text-center ${
                  isDark
                    ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                    : 'bg-slate-50 border-slate-300 text-black font-medium'
                }`}
              >
                Nenhum registro de pagamento de assinatura encontrado para esta loja.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {loja.pagamentos.map((pag) => {
                  const ehManual = pag.bandeira_metodo === 'manual';
                  const aprovado = pag.status_pagamento === 'approved';
                  return (
                    <div
                      key={pag.id}
                      className={`p-3 rounded-xl border text-xs space-y-1 ${
                        isDark
                          ? 'bg-slate-900/80 border-slate-800'
                          : 'bg-slate-50 border-slate-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>
                            {formatarMoeda(pag.valor_total)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              aprovado
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                                : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'
                            }`}
                          >
                            {aprovado ? 'Aprovado' : pag.status_pagamento}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isDark
                                ? 'bg-slate-800 border-slate-700 text-slate-300'
                                : 'bg-white border-slate-300 text-black'
                            }`}
                          >
                            {ehManual ? 'Manual Admin' : 'Mercado Pago'}
                          </span>
                        </div>
                        <span className={`font-mono text-[11px] ${isDark ? 'text-slate-400' : 'text-black'}`}>
                          {formatarDataBr(pag.aprovado_em || pag.criado_em)}
                        </span>
                      </div>

                      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] ${isDark ? 'text-slate-300' : 'text-black'}`}>
                        <span>
                          <strong>Meio:</strong> {pag.meio_pagamento || '—'}
                        </span>
                        <span>
                          <strong>Ciclo:</strong> {pag.ciclo_meses} {pag.ciclo_meses === 1 ? 'mês' : 'meses'}
                        </span>
                        {pag.periodo_fim_em && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Vigência até {formatarDataBr(pag.periodo_fim_em)}</span>
                          </span>
                        )}
                      </div>

                      {pag.observacoes_admin && (
                        <div className={`text-[11px] pt-1 border-t ${isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-black'}`}>
                          <strong>Acordo:</strong> {pag.observacoes_admin}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rodapé do Formulário */}
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
              Fechar
            </button>

            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{salvando ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
