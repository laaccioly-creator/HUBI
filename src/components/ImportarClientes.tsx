import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Users,
  RefreshCw,
  Info,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Cliente } from '../types';
import {
  clientImportExportService,
  ResultadoParseClienteImportacao,
  RelatorioResultadoClienteImportacao
} from '../services/clientImportExportService';

interface ImportarClientesProps {
  onVoltar: () => void;
}

export const ImportarClientes: React.FC<ImportarClientesProps> = ({ onVoltar }) => {
  const { loja } = useAuth();

  const [clientesBase, setClientesBase] = useState<Cliente[]>([]);
  const [carregandoBase, setCarregandoBase] = useState<boolean>(true);

  // Estados de Importação
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [analisandoArquivo, setAnalisandoArquivo] = useState<boolean>(false);
  const [resultadoParse, setResultadoParse] = useState<ResultadoParseClienteImportacao | null>(null);
  const [importando, setImportando] = useState<boolean>(false);
  const [progressoImportacao, setProgressoImportacao] = useState<number>(0);
  const [statusTextoProgresso, setStatusTextoProgresso] = useState<string>('');
  const [relatorioFinal, setRelatorioFinal] = useState<RelatorioResultadoClienteImportacao | null>(null);
  const [filtroVisualizacao, setFiltroVisualizacao] = useState<'todos' | 'novos' | 'atualizacoes' | 'erros'>('todos');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const carregarClientesExistentes = async () => {
    if (!loja?.id) return;
    try {
      setCarregandoBase(true);
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id)
        .order('nome', { ascending: true });

      if (data) setClientesBase(data as Cliente[]);
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    } finally {
      setCarregandoBase(false);
    }
  };

  useEffect(() => {
    carregarClientesExistentes();
  }, [loja?.id]);

  const handleSelecionarArquivo = async (file: File) => {
    if (!file) return;
    setArquivoSelecionado(file);
    setRelatorioFinal(null);
    setAnalisandoArquivo(true);

    try {
      const resultado = await clientImportExportService.processarArquivo(file, clientesBase);
      setResultadoParse(resultado);
    } catch (err: any) {
      console.error('Erro ao analisar arquivo de clientes:', err);
      alert(`Erro ao ler arquivo: ${err.message || 'Verifique o formato e tente novamente.'}`);
      setResultadoParse(null);
      setArquivoSelecionado(null);
    } finally {
      setAnalisandoArquivo(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleSelecionarArquivo(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelecionarArquivo(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmarImportacao = async () => {
    if (!loja?.id || !resultadoParse || resultadoParse.clientesValidos.length === 0) return;

    try {
      setImportando(true);
      setProgressoImportacao(5);
      setStatusTextoProgresso('Iniciando gravação de clientes...');

      const relatorio = await clientImportExportService.executarImportacao(
        loja.id,
        resultadoParse.clientesValidos,
        (progresso, texto) => {
          setProgressoImportacao(progresso);
          setStatusTextoProgresso(texto);
        }
      );

      setRelatorioFinal(relatorio);
      if (relatorio.sucesso) {
        await carregarClientesExistentes();
      }
    } catch (err: any) {
      console.error('Erro na importação de clientes:', err);
      alert(`Falha na importação: ${err.message || 'Tente novamente.'}`);
    } finally {
      setImportando(false);
    }
  };

  const handleLimparImportacao = () => {
    setArquivoSelecionado(null);
    setResultadoParse(null);
    setRelatorioFinal(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const itensPreVisualizacao = useMemo(() => {
    if (!resultadoParse) return [];
    const todos = [...resultadoParse.clientesValidos, ...resultadoParse.clientesComErro];
    if (filtroVisualizacao === 'novos') return todos.filter(i => i.statusAcao === 'NOVO');
    if (filtroVisualizacao === 'atualizacoes') return todos.filter(i => i.statusAcao === 'ATUALIZAR');
    if (filtroVisualizacao === 'erros') return todos.filter(i => i.statusAcao === 'ERRO');
    return todos;
  }, [resultadoParse, filtroVisualizacao]);

  return (
    <div className="bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-6 animate-in fade-in text-slate-800 md:text-slate-100">
      {/* Topo com Título e Voltar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 md:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="p-2 rounded-xl bg-slate-100 md:bg-slate-800 hover:bg-slate-200 md:hover:bg-slate-700 text-slate-700 md:text-slate-300 transition cursor-pointer"
            title="Voltar ao menu de importação e exportação"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase">
                1º Passo Obrigatório
              </span>
            </div>
            <h2 className="font-extrabold text-base sm:text-lg text-slate-800 md:text-slate-100 flex items-center gap-2 mt-1">
              <Users className="w-5 h-5 text-emerald-600 md:text-emerald-400" />
              <span>Importar Clientes</span>
            </h2>
            <p className="text-xs text-slate-500 md:text-slate-400 mt-0.5">
              Cadastre ou atualize seus clientes em massa com planilhas Excel (.xlsx) e CSV.
            </p>
          </div>
        </div>
      </div>

      {/* Card 1: Baixar Planilha Modelo Padrão */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                Layout Oficial de Clientes
              </span>
            </div>
            <h3 className="font-extrabold text-sm sm:text-base text-slate-100">
              Baixe a Planilha Modelo de Importação de Clientes
            </h3>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Utilize o layout padrão do HUBI com colunas para dados pessoais, telefones, WhatsApp, limites de fiado e endereço para garantir uma importação segura.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => clientImportExportService.downloadModeloXLSX()}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Baixar Modelo (.XLSX Excel)</span>
            </button>

            <button
              type="button"
              onClick={() => clientImportExportService.downloadModeloCSV()}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-400" />
              <span>Baixar Modelo (.CSV)</span>
            </button>
          </div>
        </div>

        {/* Dica de Ordem e Integridade */}
        <div className="flex items-start gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Dica de Integridade:</strong> É fundamental importar os clientes antes de importar pedidos antigos ou vendas, permitindo que cada venda seja vinculada ao cliente correspondente.
          </span>
        </div>
      </div>

      {/* Card 2: Área de Upload de Arquivo */}
      {!resultadoParse && !relatorioFinal && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 bg-slate-950/60 hover:bg-slate-950 rounded-3xl p-8 sm:p-12 text-center space-y-4 transition cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto transition-transform group-hover:scale-110">
            {analisandoArquivo ? (
              <RefreshCw className="w-8 h-8 animate-spin" />
            ) : (
              <Upload className="w-8 h-8" />
            )}
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="font-extrabold text-sm sm:text-base text-slate-200">
              {analisandoArquivo ? 'Analisando e validando clientes...' : 'Arraste e solte sua planilha de clientes aqui'}
            </h4>
            <p className="text-xs text-slate-400">
              ou clique para selecionar um arquivo Excel (.xlsx) ou CSV do seu dispositivo
            </p>
          </div>
        </div>
      )}

      {/* Card 3: Pré-visualização dos Dados Analisados */}
      {resultadoParse && !relatorioFinal && (
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-200">Arquivo:</span>
                <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                  {arquivoSelecionado?.name}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Revise os clientes identificados antes de confirmar a gravação no banco de dados.
              </p>
            </div>

            <button
              type="button"
              onClick={handleLimparImportacao}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Trocar Arquivo</span>
            </button>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Identificado</span>
              <span className="text-xl font-black text-slate-100">{resultadoParse.totalLinhasLidas}</span>
            </div>

            <div className="p-3 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-1">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block">Novos Clientes</span>
              <span className="text-xl font-black text-emerald-400">+{resultadoParse.novosCadastros}</span>
            </div>

            <div className="p-3 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center space-y-1">
              <span className="text-[10px] uppercase font-bold text-cyan-400 block">Atualizações</span>
              <span className="text-xl font-black text-cyan-400">{resultadoParse.atualizacoes}</span>
            </div>

            <div className="p-3 bg-slate-900 rounded-2xl border border-rose-500/30 text-center space-y-1">
              <span className="text-[10px] uppercase font-bold text-rose-400 block">Linhas c/ Erro</span>
              <span className="text-xl font-black text-rose-400">{resultadoParse.clientesComErro.length}</span>
            </div>
          </div>

          {/* Filtros da Tabela */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs font-bold text-slate-300">Clientes para Importação:</span>

            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFiltroVisualizacao('todos')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filtroVisualizacao === 'todos' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({resultadoParse.totalLinhasLidas})
              </button>
              <button
                type="button"
                onClick={() => setFiltroVisualizacao('novos')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filtroVisualizacao === 'novos' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Novos ({resultadoParse.novosCadastros})
              </button>
              <button
                type="button"
                onClick={() => setFiltroVisualizacao('atualizacoes')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filtroVisualizacao === 'atualizacoes' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Atualizações ({resultadoParse.atualizacoes})
              </button>
              {resultadoParse.clientesComErro.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFiltroVisualizacao('erros')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filtroVisualizacao === 'erros' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-rose-400 hover:text-rose-200'
                  }`}
                >
                  Erros ({resultadoParse.clientesComErro.length})
                </button>
              )}
            </div>
          </div>

          {/* Tabela de Pré-visualização */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-slate-400 font-semibold sticky top-0 z-10 uppercase text-[10px]">
                <tr className="border-b border-slate-800">
                  <th className="p-3">Linha</th>
                  <th className="p-3">Status / Ação</th>
                  <th className="p-3">Nome</th>
                  <th className="p-3">Telefone / WhatsApp</th>
                  <th className="p-3">CPF / CNPJ</th>
                  <th className="p-3">Tabela Preço</th>
                  <th className="p-3 text-right">Limite Fiado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {itensPreVisualizacao.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/50 transition">
                    <td className="p-3 font-mono text-slate-500 text-[11px]">{item.linha}</td>
                    <td className="p-3">
                      {item.statusAcao === 'NOVO' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                          + Novo
                        </span>
                      )}
                      {item.statusAcao === 'ATUALIZAR' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
                          Atualizar
                        </span>
                      )}
                      {item.statusAcao === 'ERRO' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase" title={item.mensagemErro}>
                          Erro: {item.mensagemErro}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-slate-200 max-w-[200px] truncate">{item.nome}</td>
                    <td className="p-3 text-slate-300">{item.whatsapp || item.telefone || '-'}</td>
                    <td className="p-3 font-mono text-slate-400 text-[11px]">{item.numero_documento || '-'}</td>
                    <td className="p-3 text-slate-300 uppercase font-semibold">{item.tabela_preco_padrao}</td>
                    <td className="p-3 text-right font-bold text-emerald-400">
                      R$ {item.limite_credito.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Botões de Ação da Importação */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-400">
              Pronto para processar <strong>{resultadoParse.clientesValidos.length}</strong> clientes válidos.
            </span>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleLimparImportacao}
                disabled={importando}
                className="flex-1 sm:flex-none px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmarImportacao}
                disabled={importando || resultadoParse.clientesValidos.length === 0}
                className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {importando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importando ({progressoImportacao}%)...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar e Importar Clientes</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Barra de Progresso */}
          {importando && (
            <div className="space-y-2 pt-2 animate-in fade-in">
              <div className="flex justify-between text-xs text-slate-300">
                <span>{statusTextoProgresso}</span>
                <span className="font-bold text-emerald-400">{progressoImportacao}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressoImportacao}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card 4: Relatório Pós-Importação Concluída */}
      {relatorioFinal && (
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-5 animate-in zoom-in-95">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              relatorioFinal.sucesso ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {relatorioFinal.sucesso ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-100">
                {relatorioFinal.sucesso ? 'Clientes Importados com Sucesso!' : 'Importação Finalizada com Alertas'}
              </h3>
              <p className="text-xs text-slate-400">
                A base de clientes da sua loja foi atualizada no banco de dados.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-1">
              <span className="text-xs font-semibold text-emerald-300">Novos Cadastrados</span>
              <span className="text-2xl font-black text-emerald-400 block">{relatorioFinal.totalCadastrados}</span>
            </div>

            <div className="p-4 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center space-y-1">
              <span className="text-xs font-semibold text-cyan-300">Atualizados</span>
              <span className="text-2xl font-black text-cyan-400 block">{relatorioFinal.totalAtualizados}</span>
            </div>
          </div>

          {relatorioFinal.erros.length > 0 && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-2 text-xs text-rose-300">
              <span className="font-bold flex items-center gap-1.5 text-rose-400">
                <AlertCircle className="w-4 h-4" />
                <span>Inconsistências registradas:</span>
              </span>
              <ul className="list-disc pl-4 space-y-1 max-h-32 overflow-y-auto">
                {relatorioFinal.erros.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleLimparImportacao}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              Importar Outra Planilha
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
