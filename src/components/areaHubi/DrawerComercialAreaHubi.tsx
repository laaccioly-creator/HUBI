import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  Search,
  MessageCircle,
  Edit3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Store,
  Phone,
  Mail
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { formatarMoeda } from '../../utils/formatters';
import {
  EstagioComercialLoja,
  LojaAreaHubi,
  gerarLinkWhatsappComercial
} from '../../services/areaHubiService';

interface DrawerComercialAreaHubiProps {
  isOpen: boolean;
  onClose: () => void;
  lojas: LojaAreaHubi[];
  abaInicial: EstagioComercialLoja;
  tituloContexto?: string;
  onEditarLoja: (loja: LojaAreaHubi) => void;
  onAtivarManual: (loja: LojaAreaHubi) => void;
}

const ABAS_ESTAGIO: { id: EstagioComercialLoja; label: string }[] = [
  { id: 'trial_ativo', label: 'Em Teste Ativo' },
  { id: 'trial_vencido', label: 'Teste Vencido' },
  { id: 'churn_nao_renovado', label: 'Não Renovados' },
  { id: 'assinante_ativo', label: 'Assinantes Ativos' },
];

const formatarDataBr = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
};

export const DrawerComercialAreaHubi: React.FC<DrawerComercialAreaHubiProps> = ({
  isOpen,
  onClose,
  lojas,
  abaInicial,
  tituloContexto,
  onEditarLoja,
  onAtivarManual,
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const { mostrarAviso } = useFeedbackModal();

  useRegisterOverlay(isOpen, onClose, 'area-hubi-drawer-comercial', 'drawer');

  const [abaAtiva, setAbaAtiva] = useState<EstagioComercialLoja>(abaInicial);
  const [busca, setBusca] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setAbaAtiva(abaInicial);
    }
  }, [isOpen, abaInicial]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const contagensPorEstagio = useMemo(() => {
    const mapa: Record<EstagioComercialLoja, number> = {
      trial_ativo: 0,
      trial_vencido: 0,
      churn_nao_renovado: 0,
      assinante_ativo: 0,
    };
    for (const l of lojas) {
      mapa[l.estagio_comercial] = (mapa[l.estagio_comercial] || 0) + 1;
    }
    return mapa;
  }, [lojas]);

  const lojasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lojas.filter((l) => {
      if (l.estagio_comercial !== abaAtiva) return false;
      if (!termo) return true;
      const campos = [
        l.nome_fantasia,
        l.razao_social,
        l.whatsapp,
        l.numero_documento,
        l.email,
        l.endereco_cidade,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return campos.includes(termo);
    });
  }, [lojas, abaAtiva, busca]);

  if (!isOpen) return null;

  const renderBadgeEstagio = (loja: LojaAreaHubi) => {
    switch (loja.estagio_comercial) {
      case 'trial_ativo':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-blue-50 text-blue-900 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
            <Clock className="w-3 h-3" />
            <span>
              {loja.dias_referencia <= 0
                ? 'Expira hoje'
                : `Restam ${loja.dias_referencia} ${loja.dias_referencia === 1 ? 'dia' : 'dias'}`}
            </span>
          </span>
        );
      case 'trial_vencido':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            <span>
              Trial venceu há {loja.dias_referencia} {loja.dias_referencia === 1 ? 'dia' : 'dias'}
            </span>
          </span>
        );
      case 'churn_nao_renovado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-red-50 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30">
            <AlertTriangle className="w-3 h-3" />
            <span>
              Assinatura venceu há {loja.dias_referencia} {loja.dias_referencia === 1 ? 'dia' : 'dias'}
            </span>
          </span>
        );
      case 'assinante_ativo':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>
              {loja.assinatura_fim_em
                ? `Ativa até ${formatarDataBr(loja.assinatura_fim_em)}`
                : 'Ativa (Sem vencimento)'}
            </span>
          </span>
        );
    }
  };

  const handleAbrirWhatsapp = (loja: LojaAreaHubi) => {
    const link = gerarLinkWhatsappComercial(loja);
    if (!link) {
      mostrarAviso(
        'Esta loja não possui número de WhatsApp válido cadastrado. Edite os dados para informar o contato.',
        'WhatsApp Indisponível'
      );
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const drawerBgClass = isDark ? 'bg-[#08131A] border-l-2 border-slate-400' : 'bg-slate-100 border-l border-slate-300';
  const neutralBtnClass = isDark
    ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-100 font-semibold'
    : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-semibold';

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-150">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Painel Lateral */}
      <div className={`relative z-10 w-full max-w-2xl h-full flex flex-col shadow-2xl ${drawerBgClass}`}>
        {/* Cabeçalho */}
        <div
          className={`px-4 sm:px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0 ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-white'
          }`}
        >
          <div className="min-w-0">
            <h2 className={`text-base font-black truncate ${isDark ? 'text-white' : 'text-black'}`}>
              {tituloContexto || 'Carteira Comercial HUBI'}
            </h2>
            <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
              {lojas.length} lojas registradas na plataforma • Segmentação em tempo real
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition cursor-pointer shrink-0 ${neutralBtnClass}`}
            title="Fechar gaveta"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Busca + 4 Abas de Estágio Comercial */}
        <div
          className={`p-4 border-b space-y-3 shrink-0 ${
            isDark ? 'border-slate-800 bg-[#0B0F17]' : 'border-slate-300 bg-slate-50'
          }`}
        >
          <div className="relative">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-black'}`} />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, WhatsApp, CPF/CNPJ, e-mail ou cidade..."
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm border transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500'
                  : 'bg-white border-slate-300 text-black placeholder:text-slate-500 font-medium'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ABAS_ESTAGIO.map((aba) => {
              const ativa = abaAtiva === aba.id;
              return (
                <button
                  key={aba.id}
                  type="button"
                  onClick={() => setAbaAtiva(aba.id)}
                  className={`px-2.5 py-2 rounded-xl border text-left transition cursor-pointer ${
                    ativa
                      ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'bg-slate-100 border-slate-300 text-black hover:bg-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-bold truncate">{aba.label}</div>
                  <div className={`text-sm font-black ${ativa ? 'text-white' : isDark ? 'text-white' : 'text-black'}`}>
                    {contagensPorEstagio[aba.id] || 0}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista de Cards de Lojas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {lojasFiltradas.length === 0 ? (
            <div
              className={`p-8 rounded-2xl border text-center space-y-2 ${
                isDark
                  ? 'bg-[#0B0F17] border-slate-800 text-slate-400'
                  : 'bg-white border-slate-300 text-black'
              }`}
            >
              <Store className="w-8 h-8 mx-auto opacity-50" />
              <p className="text-sm font-bold">Nenhuma loja encontrada neste estágio.</p>
              <p className="text-xs opacity-75">
                Ajuste o filtro de busca ou alterne entre as abas comerciais acima.
              </p>
            </div>
          ) : (
            lojasFiltradas.map((loja) => (
              <div
                key={loja.id}
                className={`p-4 rounded-2xl border space-y-3 shadow-2xs transition ${
                  isDark
                    ? 'bg-[#000000] border-slate-700 text-slate-100'
                    : 'bg-white border-slate-300 text-black'
                }`}
              >
                {/* Topo do Card: Nome + Badge de Estágio */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className={`text-sm font-black truncate ${isDark ? 'text-white' : 'text-black'}`}>
                      {loja.nome_fantasia}
                    </h4>
                    {loja.razao_social && (
                      <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                        {loja.razao_social}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">{renderBadgeEstagio(loja)}</div>
                </div>

                {/* Dados Operacionais */}
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs ${isDark ? 'text-slate-300' : 'text-black'}`}>
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-mono font-semibold">{loja.whatsapp || 'Sem WhatsApp'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span className="truncate">{loja.email || 'Sem e-mail'}</span>
                  </div>
                  {loja.numero_documento && (
                    <div className="truncate">
                      <strong>{loja.tipo_documento || 'Doc'}:</strong> {loja.numero_documento}
                    </div>
                  )}
                  {(loja.endereco_cidade || loja.endereco_estado) && (
                    <div className="truncate">
                      <strong>Local:</strong> {[loja.endereco_cidade, loja.endereco_estado].filter(Boolean).join(' / ')}
                    </div>
                  )}
                  <div>
                    <strong>Cadastro:</strong> {formatarDataBr(loja.criado_em)}
                  </div>
                  <div>
                    <strong>Investido:</strong>{' '}
                    <span className="font-bold">{formatarMoeda(loja.total_investido)}</span>{' '}
                    <span className="text-[11px]">({loja.total_pagamentos_aprovados} pgto)</span>
                  </div>
                </div>

                {/* Os 3 Botões Obrigatórios */}
                <div
                  className={`pt-3 border-t flex flex-wrap items-center gap-2 ${
                    isDark ? 'border-slate-800' : 'border-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onEditarLoja(loja)}
                    className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer ${neutralBtnClass}`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Ver / Editar Dados</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAbrirWhatsapp(loja)}
                    className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer ${neutralBtnClass}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onAtivarManual(loja)}
                    className="sm:ml-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Ativar / Renovar Manualmente</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Rodapé */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-end shrink-0 ${
            isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-white'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs border transition cursor-pointer ${neutralBtnClass}`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
