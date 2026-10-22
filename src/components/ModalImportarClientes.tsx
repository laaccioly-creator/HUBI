import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Users,
  RefreshCw,
  Loader2,
  Sparkles,
  BookOpen,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  Filter
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { supabase } from '../lib/supabase';
import { Cliente } from '../types';
import {
  clientImportExportService,
  ResultadoParseClienteImportacao,
  RelatorioResultadoClienteImportacao,
  LinhaClienteImportacao,
  OpcoesImportacaoCliente
} from '../services/clientImportExportService';
import { MoneyInput } from './ui/MoneyInput';
import { ModalGuiaExportacaoWhatsApp } from './ModalGuiaExportacaoWhatsApp';

interface ModalImportarClientesProps {
  isOpen: boolean;
  onClose: () => void;
  onSucesso?: () => void;
}

export const ModalImportarClientes: React.FC<ModalImportarClientesProps> = ({
  isOpen,
  onClose,
  onSucesso
}) => {
  const { loja } = useAuth();
  const { isDark } = useTheme();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const [clientesBase, setClientesBase] = useState<Cliente[]>([]);
  const [carregandoBase, setCarregandoBase] = useState<boolean>(true);

  // Estados de Upload & Análise
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [analisandoArquivo, setAnalisandoArquivo] = useState<boolean>(false);
  const [resultadoParse, setResultadoParse] = useState<ResultadoParseClienteImportacao | null>(null);
  const [filtroTabela, setFiltroTabela] = useState<'todos' | 'novos' | 'atualizacoes' | 'ignorados' | 'erros'>('todos');

  // Opções em Lote
  const [modoDuplicados, setModoDuplicados] = useState<'ignorar' | 'atualizar'>('ignorar');
  const [ativarCaderneta, setAtivarCaderneta] = useState<boolean>(false);
  const [limiteCaderneta, setLimiteCaderneta] = useState<number>(300);
  const [diaVencimentoCaderneta, setDiaVencimentoCaderneta] = useState<number>(10);
  const [dddLoja, setDddLoja] = useState<string>('11');

  // Progresso & Relatório
  const [importando, setImportando] = useState<boolean>(false);
  const [progresso, setProgresso] = useState<number>(0);
  const [textoProgresso, setTextoProgresso] = useState<string>('');
  const [relatorioFinal, setRelatorioFinal] = useState<RelatorioResultadoClienteImportacao | null>(null);

  // Modal do Guia Didático
  const [modalGuiaAberto, setModalGuiaAberto] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extrair DDD padrão da loja
  useEffect(() => {
    if (loja) {
      const tel = (loja.whatsapp || loja.telefone || '').replace(/\D/g, '');
      if (tel.length >= 10) {
        // Se começar com 55 e tiver 12 ou 13 dígitos
        const semDdi = tel.startsWith('55') && tel.length >= 12 ? tel.slice(2) : tel;
        setDddLoja(semDdi.slice(0, 2));
      }
      if (loja.dia_vencimento_padrao_caderneta) {
        setDiaVencimentoCaderneta(loja.dia_vencimento_padrao_caderneta);
      }
      if (loja.caderneta_ativa) {
        setAtivarCaderneta(true);
      }
    }
  }, [loja]);

  // Carregar Clientes Existentes da Loja
  const carregarClientesLoja = async () => {
    if (!loja?.id) return;
    try {
      setCarregandoBase(true);
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id)
        .order('nome', { ascending: true });

      if (error) throw error;
      if (data) setClientesBase(data as Cliente[]);
    } catch (err: any) {
      console.error('Erro ao carregar clientes existentes:', err);
    } finally {
      setCarregandoBase(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarClientesLoja();
      setArquivoSelecionado(null);
      setResultadoParse(null);
      setRelatorioFinal(null);
      setProgresso(0);
      setFiltroTabela('todos');
    }
  }, [isOpen, loja?.id]);

  // Processar Arquivo Selecionado
  const processarArquivoComOpcoes = async (
    file: File,
    opcoes?: OpcoesImportacaoCliente
  ) => {
    setAnalisandoArquivo(true);
    try {
      const opts: OpcoesImportacaoCliente = opcoes || {
        modoDuplicados,
        dddPadraoLoja: dddLoja,
        ativarCaderneta,
        limiteCadernetaPadrao: limiteCaderneta,
        diaVencimentoCadernetaPadrao: diaVencimentoCaderneta
      };

      const resultado = await clientImportExportService.processarArquivo(
        file,
        clientesBase,
        opts
      );
      setResultadoParse(resultado);
    } catch (err: any) {
      mostrarErro(err.message || 'Erro ao processar arquivo. Verifique o formato.');
      setResultadoParse(null);
      setArquivoSelecionado(null);
    } finally {
      setAnalisandoArquivo(false);
    }
  };

  const handleSelecionarArquivo = (file: File) => {
    if (!file) return;
    setArquivoSelecionado(file);
    setRelatorioFinal(null);
    processarArquivoComOpcoes(file);
  };

  // Re-analisar se opções em lote mudarem com arquivo já carregado
  const handleAtualizarOpcoes = (novasOpcoes: Partial<OpcoesImportacaoCliente>) => {
    if (!arquivoSelecionado) return;
    const opts: OpcoesImportacaoCliente = {
      modoDuplicados: novasOpcoes.modoDuplicados ?? modoDuplicados,
      dddPadraoLoja: novasOpcoes.dddPadraoLoja ?? dddLoja,
      ativarCaderneta: novasOpcoes.ativarCaderneta ?? ativarCaderneta,
      limiteCadernetaPadrao: novasOpcoes.limiteCadernetaPadrao ?? limiteCaderneta,
      diaVencimentoCadernetaPadrao: novasOpcoes.diaVencimentoCadernetaPadrao ?? diaVencimentoCaderneta
    };
    processarArquivoComOpcoes(arquivoSelecionado, opts);
  };

  // Confirmar e Executar Importação
  const handleConfirmarImportacao = async () => {
    if (!loja?.id || !resultadoParse) return;

    try {
      setImportando(true);
      setProgresso(5);
      setTextoProgresso('Iniciando importação de clientes...');

      const opts: OpcoesImportacaoCliente = {
        modoDuplicados,
        dddPadraoLoja: dddLoja,
        ativarCaderneta,
        limiteCadernetaPadrao: limiteCaderneta,
        diaVencimentoCadernetaPadrao: diaVencimentoCaderneta
      };

      const relatorio = await clientImportExportService.executarImportacao(
        loja.id,
        resultadoParse.clientesValidos,
        (p, txt) => {
          setProgresso(p);
          setTextoProgresso(txt);
        },
        opts
      );

      setRelatorioFinal(relatorio);
      if (relatorio.sucesso || relatorio.totalCadastrados > 0 || relatorio.totalAtualizados > 0) {
        mostrarSucesso(
          `Importação concluída! ${relatorio.totalCadastrados} novos cadastrados, ${relatorio.totalAtualizados} atualizados.`
        );
        if (onSucesso) onSucesso();
      }
    } catch (err: any) {
      mostrarErro(err.message || 'Erro durante a gravação dos clientes.');
    } finally {
      setImportando(false);
    }
  };

  if (!isOpen) return null;

  // Filtragem da Lista para Prévia
  const itensExibidos = (resultadoParse?.clientesValidos || []).filter((c) => {
    if (filtroTabela === 'novos') return c.statusAcao === 'NOVO';
    if (filtroTabela === 'atualizacoes') return c.statusAcao === 'ATUALIZAR';
    if (filtroTabela === 'ignorados') return c.statusAcao === 'IGNORADO';
    return true;
  });

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
        <div
          className={`w-full max-w-4xl rounded-3xl border shadow-2xl flex flex-col max-h-[95vh] overflow-hidden transition-all ${
            isDark
              ? 'bg-[#0B151D] border-slate-800 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          {/* Cabeçalho */}
          <div
            className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
              isDark ? 'border-slate-800/80 bg-slate-900/50' : 'border-slate-100 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                  <span>Importar Clientes em Lote</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-extrabold uppercase">
                    CSV / Excel
                  </span>
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  Traga seus contatos do WhatsApp, Google Contatos ou Planilha com higienização automática
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalGuiaAberto(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-xs transition cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Como extrair contatos?</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  isDark
                    ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
                    : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-black'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Corpo com Scroll */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Botão Guia no Mobile */}
            <div className="block sm:hidden">
              <button
                type="button"
                onClick={() => setModalGuiaAberto(true)}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-xs"
              >
                <span className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  <span>Passo a passo: Como extrair do WhatsApp / Celular</span>
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* RELATÓRIO FINAL DE CONCLUSÃO */}
            {relatorioFinal ? (
              <div
                className={`p-6 rounded-3xl border text-center space-y-4 ${
                  relatorioFinal.sucesso
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-100">Importação Concluída!</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Seus contatos foram processados e já estão disponíveis no sistema.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2">
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Cadastrados</span>
                    <strong className="text-lg font-black text-emerald-500">
                      {relatorioFinal.totalCadastrados}
                    </strong>
                  </div>

                  <div
                    className={`p-3 rounded-2xl border ${
                      isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Atualizados</span>
                    <strong className="text-lg font-black text-blue-500">
                      {relatorioFinal.totalAtualizados}
                    </strong>
                  </div>

                  <div
                    className={`p-3 rounded-2xl border ${
                      isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Ignorados</span>
                    <strong className="text-lg font-black text-amber-500">
                      {relatorioFinal.totalIgnorados || 0}
                    </strong>
                  </div>
                </div>

                {relatorioFinal.erros.length > 0 && (
                  <div className="text-left max-w-md mx-auto p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
                    <strong className="block font-black">Avisos ({relatorioFinal.erros.length}):</strong>
                    {relatorioFinal.erros.slice(0, 3).map((err, idx) => (
                      <p key={idx} className="truncate">• {err}</p>
                    ))}
                    {relatorioFinal.erros.length > 3 && (
                      <p className="text-[10px] text-slate-400">... e mais {relatorioFinal.erros.length - 3} avisos.</p>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition cursor-pointer shadow-md"
                  >
                    Fechar e Ver Clientes
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* ZONA DE UPLOAD (DRAG & DROP) */}
                {!resultadoParse && (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleSelecionarArquivo(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-6 sm:p-10 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
                      isDark
                        ? 'border-slate-800 hover:border-emerald-500/60 bg-slate-900/30 hover:bg-slate-900/50'
                        : 'border-slate-300 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/30'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleSelecionarArquivo(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />

                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                      <Upload className="w-7 h-7" />
                    </div>

                    <div>
                      <h3 className="text-sm sm:text-base font-black">
                        Clique para escolher ou arraste o arquivo aqui
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Formatos suportados: <strong>.CSV</strong>, <strong>.XLSX</strong> ou <strong>.XLS</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                      <span>Google Contatos</span>
                      <span>•</span>
                      <span>WhatsApp Web / Business</span>
                      <span>•</span>
                      <span>Planilha Própria</span>
                    </div>
                  </div>
                )}

                {/* PAINEL DE CONFIGURAÇÕES EM LOTE (VISÍVEL ANTES OU DEPOIS DO ARQUIVO) */}
                <div
                  className={`p-4 sm:p-5 rounded-2xl border space-y-4 ${
                    isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between border-b pb-3 border-slate-800/40">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-500" />
                      <span>Configurações em Lote para esta Importação</span>
                    </span>

                    {/* Atalhos para Baixar Templates */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => clientImportExportService.downloadModeloSimplificadoXLSX()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-500 hover:underline cursor-pointer"
                        title="Baixar Modelo Simplificado em Excel"
                      >
                        <Download className="w-3 h-3" />
                        <span>Baixar Modelo Simplificado</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. Tratamento de Duplicados */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold block text-slate-300">
                        Como tratar clientes que já existem na loja?
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setModoDuplicados('ignorar');
                            handleAtualizarOpcoes({ modoDuplicados: 'ignorar' });
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            modoDuplicados === 'ignorar'
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                              : isDark
                              ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                              : 'bg-white border-slate-300 text-slate-600 hover:text-black'
                          }`}
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Ignorar Duplicados</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setModoDuplicados('atualizar');
                            handleAtualizarOpcoes({ modoDuplicados: 'atualizar' });
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            modoDuplicados === 'atualizar'
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                              : isDark
                              ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                              : 'bg-white border-slate-300 text-slate-600 hover:text-black'
                          }`}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Atualizar Dados</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Identificação automática por telefone (DDD + 8 dígitos) ou CPF/CNPJ.
                      </p>
                    </div>

                    {/* 2. DDD de Fallback da Loja */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold block text-slate-300">
                        DDD padrão para contatos sem DDD
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={2}
                          value={dddLoja}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                            setDddLoja(val);
                            handleAtualizarOpcoes({ dddPadraoLoja: val });
                          }}
                          className={`w-20 text-center font-black text-sm p-2 rounded-xl border focus:outline-none focus:border-emerald-500 ${
                            isDark
                              ? 'bg-slate-950 border-slate-800 text-white'
                              : 'bg-white border-slate-300 text-black'
                          }`}
                        />
                        <span className="text-xs text-slate-400 leading-tight">
                          Aplicado automaticamente em contatos salvos apenas com 8 ou 9 dígitos.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Facilitador da Caderneta de Mercadinho */}
                  <div
                    className={`p-3.5 rounded-2xl border transition ${
                      ativarCaderneta
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : isDark
                        ? 'bg-slate-950/60 border-slate-800/80'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black ${
                            ativarCaderneta
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div>
                          <strong className="text-xs font-black block">
                            Ativar Caderneta de Compras para estes clientes?
                          </strong>
                          <span className="text-[11px] text-slate-400">
                            Cria a conta corrente com ciclo de vencimento mensal para os contatos importados
                          </span>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ativarCaderneta}
                          onChange={(e) => {
                            setAtivarCaderneta(e.target.checked);
                            handleAtualizarOpcoes({ ativarCaderneta: e.target.checked });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                      </label>
                    </div>

                    {ativarCaderneta && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 mt-3 border-t border-amber-500/20 animate-in fade-in">
                        <div>
                          <label className="text-[11px] font-bold text-amber-500 block mb-1">
                            Limite de Crédito Padrão (R$)
                          </label>
                          <MoneyInput
                            value={limiteCaderneta}
                            onChange={(val) => {
                              setLimiteCaderneta(val);
                              handleAtualizarOpcoes({ limiteCadernetaPadrao: val });
                            }}
                            className="font-bold text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-amber-500 block mb-1">
                            Dia Fixo de Acerto/Vencimento Mensal
                          </label>
                          <select
                            value={diaVencimentoCaderneta}
                            onChange={(e) => {
                              const dia = Number(e.target.value);
                              setDiaVencimentoCaderneta(dia);
                              handleAtualizarOpcoes({ diaVencimentoCadernetaPadrao: dia });
                            }}
                            className={`w-full p-2.5 rounded-xl border text-xs font-bold focus:outline-none focus:border-amber-500 ${
                              isDark
                                ? 'bg-slate-950 border-slate-800 text-white'
                                : 'bg-white border-slate-300 text-black'
                            }`}
                          >
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((dia) => (
                              <option key={dia} value={dia}>
                                Todo dia {dia} do mês
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* PRÉVIA DOS DADOS PROCESSADOS */}
                {analisandoArquivo && (
                  <div className="p-8 text-center space-y-2">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
                    <p className="text-xs text-slate-400">Higienizando telefones e validando linhas...</p>
                  </div>
                )}

                {resultadoParse && !analisandoArquivo && (
                  <div className="space-y-3">
                    {/* Abas e Contadores */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
                        <button
                          type="button"
                          onClick={() => setFiltroTabela('todos')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            filtroTabela === 'todos'
                              ? 'bg-slate-800 text-white border-slate-700'
                              : 'border-transparent text-slate-400 hover:text-white'
                          }`}
                        >
                          Todos ({resultadoParse.clientesValidos.length})
                        </button>

                        <button
                          type="button"
                          onClick={() => setFiltroTabela('novos')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            filtroTabela === 'novos'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'border-transparent text-slate-400 hover:text-emerald-400'
                          }`}
                        >
                          Novos ({resultadoParse.novosCadastros})
                        </button>

                        <button
                          type="button"
                          onClick={() => setFiltroTabela('atualizacoes')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            filtroTabela === 'atualizacoes'
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                              : 'border-transparent text-slate-400 hover:text-blue-400'
                          }`}
                        >
                          Atualizações ({resultadoParse.atualizacoes})
                        </button>

                        <button
                          type="button"
                          onClick={() => setFiltroTabela('ignorados')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            filtroTabela === 'ignorados'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'border-transparent text-slate-400 hover:text-amber-400'
                          }`}
                        >
                          Ignorados ({resultadoParse.ignoradosDuplicados})
                        </button>
                      </div>

                      {/* Botão de Trocar Arquivo */}
                      <button
                        type="button"
                        onClick={() => {
                          setResultadoParse(null);
                          setArquivoSelecionado(null);
                        }}
                        className="text-xs text-slate-400 hover:text-rose-400 transition cursor-pointer underline font-medium"
                      >
                        Trocar arquivo
                      </button>
                    </div>

                    {/* Tabela de Preview */}
                    <div
                      className={`border rounded-2xl overflow-hidden max-h-60 overflow-y-auto ${
                        isDark ? 'border-slate-800 bg-[#070E13]' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <table className="w-full text-left text-xs">
                        <thead
                          className={`sticky top-0 z-10 font-bold border-b text-[11px] ${
                            isDark
                              ? 'bg-slate-900 border-slate-800 text-slate-400'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}
                        >
                          <tr>
                            <th className="p-2.5">Linha</th>
                            <th className="p-2.5">Nome Higienizado</th>
                            <th className="p-2.5">WhatsApp / Telefone</th>
                            <th className="p-2.5">Ação Prevista</th>
                            <th className="p-2.5">Caderneta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {itensExibidos.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-slate-500 text-xs">
                                Nenhum cliente encontrado neste filtro.
                              </td>
                            </tr>
                          ) : (
                            itensExibidos.slice(0, 50).map((c, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/20 transition">
                                <td className="p-2.5 text-slate-500 font-mono text-[10px]">
                                  #{c.linha}
                                </td>
                                <td className="p-2.5 font-bold truncate max-w-[180px]">
                                  {c.nome}
                                </td>
                                <td className="p-2.5 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-xs">{c.whatsapp || '-'}</span>
                                    {c.telefoneAjustadoComDddLoja && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 font-bold">
                                        +DDD
                                      </span>
                                    )}
                                    {c.telefoneAjustadoNonoDigito && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                                        +9º
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  {c.statusAcao === 'NOVO' && (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                                      NOVO
                                    </span>
                                  )}
                                  {c.statusAcao === 'ATUALIZAR' && (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                                      ATUALIZAR
                                    </span>
                                  )}
                                  {c.statusAcao === 'IGNORADO' && (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                                      IGNORAR
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-[11px] font-medium text-slate-400">
                                  {c.permite_caderneta ? (
                                    <span className="text-amber-500 font-bold">
                                      Sim (R$ {Number(c.limite_caderneta || 0).toFixed(0)} - Dia {c.dia_vencimento_caderneta})
                                    </span>
                                  ) : (
                                    'Não'
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {itensExibidos.length > 50 && (
                      <p className="text-[10px] text-slate-500 text-center">
                        Exibindo os primeiros 50 registros de {itensExibidos.length} encontrados.
                      </p>
                    )}
                  </div>
                )}

                {/* BARRA DE PROGRESSO DURANTE GRAVAÇÃO */}
                {importando && (
                  <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                      <span>{textoProgresso}</span>
                      <span>{progresso}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progresso}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rodapé de Ações */}
          {!relatorioFinal && (
            <div
              className={`p-4 sm:p-5 border-t flex flex-col-reverse sm:flex-row items-center justify-between gap-3 shrink-0 ${
                isDark ? 'border-slate-800 bg-[#091117]' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="text-xs text-slate-400">
                {resultadoParse ? (
                  <span>
                    Total: <strong>{resultadoParse.clientesValidos.length}</strong> contatos prontos
                  </span>
                ) : (
                  <span>Nenhum arquivo processado</span>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={importando}
                  className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    isDark
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                      : 'border-slate-300 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmarImportacao}
                  disabled={!resultadoParse || resultadoParse.clientesValidos.length === 0 || importando}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs transition shadow-md shadow-emerald-600/20 cursor-pointer active:scale-95"
                >
                  {importando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gravando...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar Importação</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Guia Didático */}
      {modalGuiaAberto && (
        <ModalGuiaExportacaoWhatsApp
          isOpen={modalGuiaAberto}
          onClose={() => setModalGuiaAberto(false)}
        />
      )}
    </>
  );
};
