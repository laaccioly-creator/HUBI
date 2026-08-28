import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Package,
  Layers,
  ArrowRight,
  ArrowDownToLine,
  RefreshCw,
  Info,
  Check,
  Filter,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Produto, Categoria } from '../types';
import {
  productImportExportService,
  ResultadoParseImportacao,
  RelatorioResultadoImportacao
} from '../services/productImportExportService';

interface ImportarExportarProdutosProps {
  onVoltar: () => void;
}

export const ImportarExportarProdutos: React.FC<ImportarExportarProdutosProps> = ({ onVoltar }) => {
  const { loja } = useAuth();

  const [abaAtiva, setAbaAtiva] = useState<'importar' | 'exportar'>('importar');

  // Estados de Carregamento
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregandoBase, setCarregandoBase] = useState<boolean>(true);

  // Estados da Importação
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [analisandoArquivo, setAnalisandoArquivo] = useState<boolean>(false);
  const [resultadoParse, setResultadoParse] = useState<ResultadoParseImportacao | null>(null);
  const [importando, setImportando] = useState<boolean>(false);
  const [progressoImportacao, setProgressoImportacao] = useState<number>(0);
  const [statusTextoProgresso, setStatusTextoProgresso] = useState<string>('');
  const [relatorioFinal, setRelatorioFinal] = useState<RelatorioResultadoImportacao | null>(null);
  const [filtroVisualizacao, setFiltroVisualizacao] = useState<'todos' | 'novos' | 'atualizacoes' | 'erros'>('todos');

  // Estados da Exportação
  const [apenasAtivos, setApenasAtivos] = useState<boolean>(false);
  const [categoriaExportFiltro, setCategoriaExportFiltro] = useState<string>('todas');
  const [exportando, setExportando] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carregar dados de produtos e categorias existentes para conferência
  const carregarDadosLoja = async () => {
    if (!loja?.id) return;
    try {
      setCarregandoBase(true);
      const [resProd, resCat] = await Promise.all([
        supabase
          .from('produtos')
          .select('*, categoria:categorias(id, nome)')
          .eq('loja_id', loja.id)
          .order('nome', { ascending: true }),
        supabase
          .from('categorias')
          .select('*')
          .eq('loja_id', loja.id)
          .order('ordem_exibicao', { ascending: true })
      ]);

      if (resProd.data) setProdutos(resProd.data as Produto[]);
      if (resCat.data) setCategorias(resCat.data as Categoria[]);
    } catch (err) {
      console.error('Erro ao carregar dados para importação/exportação:', err);
    } finally {
      setCarregandoBase(false);
    }
  };

  useEffect(() => {
    carregarDadosLoja();
  }, [loja?.id]);

  // Handler de seleção de arquivo
  const handleSelecionarArquivo = async (file: File) => {
    if (!file) return;
    setArquivoSelecionado(file);
    setRelatorioFinal(null);
    setAnalisandoArquivo(true);

    try {
      const resultado = await productImportExportService.processarArquivo(file, produtos);
      setResultadoParse(resultado);
    } catch (err: any) {
      console.error('Erro ao analisar arquivo:', err);
      alert(`Erro ao ler arquivo: ${err.message || 'Verifique o formato e tente novamente.'}`);
      setResultadoParse(null);
      setArquivoSelecionado(null);
    } finally {
      setAnalisandoArquivo(false);
    }
  };

  // Handler do input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleSelecionarArquivo(e.target.files[0]);
    }
  };

  // Handler de Drag and Drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelecionarArquivo(e.dataTransfer.files[0]);
    }
  };

  // Executar a importação definitiva no banco
  const handleConfirmarImportacao = async () => {
    if (!loja?.id || !resultadoParse || resultadoParse.produtosValidos.length === 0) return;

    try {
      setImportando(true);
      setProgressoImportacao(5);
      setStatusTextoProgresso('Iniciando importação de produtos...');

      const relatorio = await productImportExportService.executarImportacao(
        loja.id,
        resultadoParse.produtosValidos,
        (progresso, texto) => {
          setProgressoImportacao(progresso);
          setStatusTextoProgresso(texto);
        }
      );

      setRelatorioFinal(relatorio);
      if (relatorio.sucesso) {
        // Recarregar produtos e categorias da loja
        await carregarDadosLoja();
      }
    } catch (err: any) {
      console.error('Erro na importação:', err);
      alert(`Falha na importação: ${err.message || 'Tente novamente.'}`);
    } finally {
      setImportando(false);
    }
  };

  // Resetar importação para enviar outro arquivo
  const handleLimparImportacao = () => {
    setArquivoSelecionado(null);
    setResultadoParse(null);
    setRelatorioFinal(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Exportação para Excel
  const handleExportarXLSX = () => {
    try {
      setExportando(true);
      let lista = [...produtos];
      if (apenasAtivos) {
        lista = lista.filter(p => p.ativo !== false);
      }
      if (categoriaExportFiltro !== 'todas') {
        lista = lista.filter(p => p.categoria_id === categoriaExportFiltro);
      }
      productImportExportService.exportarProdutosXLSX(lista, categorias, loja?.nome_fantasia);
    } catch (err: any) {
      alert(`Erro ao exportar: ${err.message}`);
    } finally {
      setExportando(false);
    }
  };

  // Exportação para CSV
  const handleExportarCSV = () => {
    try {
      setExportando(true);
      let lista = [...produtos];
      if (apenasAtivos) {
        lista = lista.filter(p => p.ativo !== false);
      }
      if (categoriaExportFiltro !== 'todas') {
        lista = lista.filter(p => p.categoria_id === categoriaExportFiltro);
      }
      productImportExportService.exportarProdutosCSV(lista, categorias, loja?.nome_fantasia);
    } catch (err: any) {
      alert(`Erro ao exportar: ${err.message}`);
    } finally {
      setExportando(false);
    }
  };

  // Lista filtrada da pré-visualização
  const itensPreVisualizacao = React.useMemo(() => {
    if (!resultadoParse) return [];
    const todosItens = [...resultadoParse.produtosValidos, ...resultadoParse.produtosComErro];
    if (filtroVisualizacao === 'novos') return todosItens.filter(i => i.statusAcao === 'NOVO');
    if (filtroVisualizacao === 'atualizacoes') return todosItens.filter(i => i.statusAcao === 'ATUALIZAR');
    if (filtroVisualizacao === 'erros') return todosItens.filter(i => i.statusAcao === 'ERRO');
    return todosItens;
  }, [resultadoParse, filtroVisualizacao]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-6 animate-in fade-in">
      {/* Topo com Título e Voltar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Voltar ao menu de configurações"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-extrabold text-base sm:text-lg text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <span>Importar e Exportar Produtos</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cadastre ou atualize seus produtos em massa com planilhas Excel (.xlsx) e CSV 100% compatíveis.
            </p>
          </div>
        </div>

        {/* Seletor de Abas */}
        <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setAbaAtiva('importar')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              abaAtiva === 'importar'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importar</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('exportar')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              abaAtiva === 'exportar'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: IMPORTAR PRODUTOS                                                  */}
      {/* ========================================================================= */}
      {abaAtiva === 'importar' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Card 1: Baixar Planilha Modelo Padrão */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                    Layout Oficial Padrão
                  </span>
                </div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-100">
                  Baixe a Planilha Modelo de Importação
                </h3>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  Utilize o nosso layout padrão oficial com todas as colunas estruturadas, exemplos práticos e dicas de preenchimento para garantir que sua importação ocorra sem erros.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => productImportExportService.downloadModeloXLSX()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer active:scale-95"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Baixar Modelo (.XLSX Excel)</span>
                </button>

                <button
                  type="button"
                  onClick={() => productImportExportService.downloadModeloCSV()}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span>Baixar Modelo (.CSV)</span>
                </button>
              </div>
            </div>

            {/* Dica de Compatibilidade */}
            <div className="flex items-start gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>100% Compatível:</strong> Você também pode ir na aba <strong>Exportar</strong>, baixar a lista de produtos da sua loja no mesmo layout, alterar preços/estoques no Excel e reimportar o mesmo arquivo aqui!
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
                  {analisandoArquivo ? 'Analisando e validando planilha...' : 'Arraste e solte seu arquivo aqui'}
                </h4>
                <p className="text-xs text-slate-400">
                  ou clique para selecionar um arquivo do seu computador
                </p>
                <span className="text-[11px] text-slate-500 block pt-1">
                  Formatos suportados: Excel (.xlsx, .xls) ou CSV (.csv)
                </span>
              </div>
            </div>
          )}

          {/* Card 3: Pré-visualização dos Dados Analisados */}
          {resultadoParse && !relatorioFinal && (
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
              {/* Cabeçalho da Pré-visualização */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-200">Arquivo:</span>
                    <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                      {arquivoSelecionado?.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Revise os produtos identificados antes de confirmar a gravação no banco de dados.
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

              {/* Cards de Resumo da Análise */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Identificado</span>
                  <span className="text-xl font-black text-slate-100">{resultadoParse.totalLinhasLidas}</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">Novos Cadastros</span>
                  <span className="text-xl font-black text-emerald-400">+{resultadoParse.novosCadastros}</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-cyan-400 block">Atualizações</span>
                  <span className="text-xl font-black text-cyan-400">{resultadoParse.atualizacoes}</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-2xl border border-rose-500/30 text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-rose-400 block">Linhas c/ Erro</span>
                  <span className="text-xl font-black text-rose-400">{resultadoParse.produtosComErro.length}</span>
                </div>
              </div>

              {/* Categorias Novas Detectadas */}
              {resultadoParse.categoriasDetectadas.length > 0 && (
                <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center gap-2 text-xs flex-wrap">
                  <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-400 font-semibold">Categorias encontradas na planilha:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {resultadoParse.categoriasDetectadas.map((cat, idx) => (
                      <span key={idx} className="bg-slate-800 text-slate-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtros da Tabela de Pré-visualização */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-xs font-bold text-slate-300">Itens para Importação:</span>

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
                  {resultadoParse.produtosComErro.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFiltroVisualizacao('erros')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        filtroVisualizacao === 'erros' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-rose-400 hover:text-rose-200'
                      }`}
                    >
                      Erros ({resultadoParse.produtosComErro.length})
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
                      <th className="p-3">Produto</th>
                      <th className="p-3">Código Barras</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3 text-right">Preço Venda</th>
                      <th className="p-3 text-right">Estoque</th>
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
                        <td className="p-3 font-bold text-slate-200 max-w-[200px] truncate">{item.nome || <span className="text-rose-400 italic">(Em branco)</span>}</td>
                        <td className="p-3 font-mono text-slate-400 text-[11px]">{item.codigo_barras || '-'}</td>
                        <td className="p-3 text-slate-300">{item.categoria || '-'}</td>
                        <td className="p-3 text-right font-bold text-emerald-400">R$ {item.preco_venda_varejo.toFixed(2)}</td>
                        <td className="p-3 text-right text-slate-200 font-semibold">{item.quantidade_estoque} {item.tipo_unidade.toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Botões de Ação da Importação */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <span className="text-xs text-slate-400">
                  Pronto para processar <strong>{resultadoParse.produtosValidos.length}</strong> produtos válidos.
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
                    disabled={importando || resultadoParse.produtosValidos.length === 0}
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
                        <span>Confirmar e Importar Produtos</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Barra de Progresso Durante a Execução */}
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
                    {relatorioFinal.sucesso ? 'Importação Concluída com Sucesso!' : 'Importação Finalizada com Alertas'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Os dados foram processados e sincronizados na sua loja.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-1">
                  <span className="text-xs font-semibold text-emerald-300">Novos Cadastrados</span>
                  <span className="text-2xl font-black text-emerald-400 block">{relatorioFinal.totalCadastrados}</span>
                </div>

                <div className="p-4 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center space-y-1">
                  <span className="text-xs font-semibold text-cyan-300">Atualizados</span>
                  <span className="text-2xl font-black text-cyan-400 block">{relatorioFinal.totalAtualizados}</span>
                </div>

                <div className="p-4 bg-slate-900 rounded-2xl border border-indigo-500/30 text-center space-y-1">
                  <span className="text-xs font-semibold text-indigo-300">Categorias Criadas</span>
                  <span className="text-2xl font-black text-indigo-400 block">{relatorioFinal.totalCategoriasCriadas}</span>
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
      )}

      {/* ========================================================================= */}
      {/* ABA 2: EXPORTAR PRODUTOS                                                  */}
      {/* ========================================================================= */}
      {abaAtiva === 'exportar' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Card Resumo da Base de Produtos */}
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="font-extrabold text-base text-slate-100">
                Exportação de Produtos Cadastrados
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Exporte todos os produtos da sua loja no mesmo layout padrão para edição em lote no Excel ou backup.
              </p>
            </div>

            {/* Métricas da Base */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Produtos</span>
                <span className="text-2xl font-black text-emerald-400">{produtos.length}</span>
              </div>

              <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Produtos Ativos</span>
                <span className="text-2xl font-black text-slate-100">{produtos.filter(p => p.ativo !== false).length}</span>
              </div>

              <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-1 col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Categorias</span>
                <span className="text-2xl font-black text-cyan-400">{categorias.length}</span>
              </div>
            </div>

            {/* Opções de Filtro para Exportação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Filtrar por Categoria:</label>
                <select
                  value={categoriaExportFiltro}
                  onChange={(e) => setCategoriaExportFiltro(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="todas">Todas as categorias ({produtos.length} produtos)</option>
                  {categorias.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nome} ({produtos.filter(p => p.categoria_id === cat.id).length})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center sm:pt-6">
                <label className="flex items-center gap-2.5 p-2.5 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer w-full">
                  <input
                    type="checkbox"
                    checked={apenasAtivos}
                    onChange={(e) => setApenasAtivos(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-200">
                    Exportar apenas produtos com status <strong>ATIVO</strong>
                  </span>
                </label>
              </div>
            </div>

            {/* Botões de Exportação */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleExportarXLSX}
                disabled={exportando || produtos.length === 0}
                className="w-full sm:flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50 active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{exportando ? 'Gerando arquivo...' : 'Exportar para Excel (.XLSX)'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportarCSV}
                disabled={exportando || produtos.length === 0}
                className="w-full sm:flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-slate-400" />
                <span>{exportando ? 'Gerando arquivo...' : 'Exportar para CSV (.CSV)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
