import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  ShoppingBag,
  RefreshCw,
  Info,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Cliente, Produto, FormaPagamento } from '../types';
import {
  orderImportExportService,
  ResultadoParsePedidoImportacao,
  RelatorioResultadoPedidoImportacao
} from '../services/orderImportExportService';

interface ImportarPedidosProps {
  onVoltar: () => void;
}

export const ImportarPedidos: React.FC<ImportarPedidosProps> = ({ onVoltar }) => {
  const { loja } = useAuth();

  const [clientesBase, setClientesBase] = useState<Cliente[]>([]);
  const [produtosBase, setProdutosBase] = useState<Produto[]>([]);
  const [formasPagamentoBase, setFormasPagamentoBase] = useState<FormaPagamento[]>([]);
  const [carregandoBase, setCarregandoBase] = useState<boolean>(true);

  // Estados da Importação
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [analisandoArquivo, setAnalisandoArquivo] = useState<boolean>(false);
  const [resultadoParse, setResultadoParse] = useState<ResultadoParsePedidoImportacao | null>(null);
  const [importando, setImportando] = useState<boolean>(false);
  const [progressoImportacao, setProgressoImportacao] = useState<number>(0);
  const [statusTextoProgresso, setStatusTextoProgresso] = useState<string>('');
  const [relatorioFinal, setRelatorioFinal] = useState<RelatorioResultadoPedidoImportacao | null>(null);
  const [filtroVisualizacao, setFiltroVisualizacao] = useState<'todos' | 'validos' | 'erros'>('todos');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const carregarDadosLoja = async () => {
    if (!loja?.id) return;
    try {
      setCarregandoBase(true);
      const [resCli, resProd, resFp] = await Promise.all([
        supabase.from('clientes').select('*').eq('loja_id', loja.id),
        supabase.from('produtos').select('*').eq('loja_id', loja.id),
        supabase.from('formas_pagamento').select('*').eq('loja_id', loja.id)
      ]);

      if (resCli.data) setClientesBase(resCli.data as Cliente[]);
      if (resProd.data) setProdutosBase(resProd.data as Produto[]);
      if (resFp.data) setFormasPagamentoBase(resFp.data as FormaPagamento[]);
    } catch (err) {
      console.error('Erro ao carregar dados para importação de pedidos:', err);
    } finally {
      setCarregandoBase(false);
    }
  };

  useEffect(() => {
    carregarDadosLoja();
  }, [loja?.id]);

  const handleSelecionarArquivo = async (file: File) => {
    if (!file) return;
    setArquivoSelecionado(file);
    setRelatorioFinal(null);
    setAnalisandoArquivo(true);

    try {
      const resultado = await orderImportExportService.processarArquivo(
        file,
        clientesBase,
        produtosBase,
        formasPagamentoBase
      );
      setResultadoParse(resultado);
    } catch (err: any) {
      console.error('Erro ao analisar arquivo de pedidos:', err);
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
    if (!loja?.id || !resultadoParse || resultadoParse.pedidosValidos.length === 0) return;

    try {
      setImportando(true);
      setProgressoImportacao(5);
      setStatusTextoProgresso('Iniciando gravação de pedidos no sistema...');

      const relatorio = await orderImportExportService.executarImportacao(
        loja.id,
        resultadoParse.pedidosValidos,
        (progresso, texto) => {
          setProgressoImportacao(progresso);
          setStatusTextoProgresso(texto);
        }
      );

      setRelatorioFinal(relatorio);
    } catch (err: any) {
      console.error('Erro na importação de pedidos:', err);
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

  const pedidosExibidos = useMemo(() => {
    if (!resultadoParse) return [];
    const todos = [...resultadoParse.pedidosValidos, ...resultadoParse.pedidosComErro];
    if (filtroVisualizacao === 'validos') return todos.filter(p => p.statusAcao === 'VALIDO');
    if (filtroVisualizacao === 'erros') return todos.filter(p => p.statusAcao === 'ERRO');
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
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase">
                3º Passo Final (Requer Clientes & Produtos)
              </span>
            </div>
            <h2 className="font-extrabold text-base sm:text-lg text-slate-800 md:text-slate-100 flex items-center gap-2 mt-1">
              <ShoppingBag className="w-5 h-5 text-emerald-600 md:text-emerald-400" />
              <span>Importar Pedidos e Vendas</span>
            </h2>
            <p className="text-xs text-slate-500 md:text-slate-400 mt-0.5">
              Importe histórico de vendas e pedidos completos com itens, preços e compradores via Excel ou CSV.
            </p>
          </div>
        </div>
      </div>

      {/* Alerta Importante da Ordem */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-300">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-200 block mb-1">Atenção antes de importar pedidos:</strong>
          Para que os pedidos sejam vinculados corretamente, certifique-se de que seus <strong>Clientes</strong> (Passo 1) e seus <strong>Produtos</strong> (Passo 2) já tenham sido importados ou cadastrados na loja. Linhas com produtos não cadastrados serão marcadas como inconsistentes.
        </div>
      </div>

      {/* Card 1: Baixar Planilha Modelo Padrão */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                Layout Oficial de Pedidos
              </span>
            </div>
            <h3 className="font-extrabold text-sm sm:text-base text-slate-100">
              Baixe a Planilha Modelo de Importação de Pedidos
            </h3>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Planilha com colunas para número de pedido, data, cliente, código/nome do produto, quantidade, preço unitário, desconto, taxas e forma de pagamento. Múltiplos itens com o mesmo número de pedido serão automaticamente agrupados na mesma venda!
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => orderImportExportService.downloadModeloXLSX()}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Baixar Modelo (.XLSX Excel)</span>
            </button>

            <button
              type="button"
              onClick={() => orderImportExportService.downloadModeloCSV()}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 border border-slate-700 transition cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-400" />
              <span>Baixar Modelo (.CSV)</span>
            </button>
          </div>
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
              {analisandoArquivo ? 'Analisando e agrupando pedidos...' : 'Arraste e solte sua planilha de pedidos aqui'}
            </h4>
            <p className="text-xs text-slate-400">
              ou clique para selecionar um arquivo Excel (.xlsx) ou CSV
            </p>
          </div>
        </div>
      )}

      {/* Card 3: Pré-visualização dos Pedidos */}
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
                Confira os pedidos agrupados e os itens identificados antes de prosseguir.
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
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Linhas Lidas</span>
              <span className="text-xl font-black text-slate-100">{resultadoParse.totalLinhasLidas}</span>
            </div>

            <div className="p-3 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-1">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block">Pedidos Válidos</span>
              <span className="text-xl font-black text-emerald-400">{resultadoParse.pedidosValidos.length}</span>
            </div>

            <div className="p-3 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center space-y-1">
              <span className="text-[10px] uppercase font-bold text-cyan-400 block">Total de Itens</span>
              <span className="text-xl font-black text-cyan-400">{resultadoParse.totalItensValidos}</span>
            </div>

            <div className="p-3 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-1">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block">Valor Geral</span>
              <span className="text-xl font-black text-emerald-400">R$ {resultadoParse.valorTotalGeral.toFixed(2)}</span>
            </div>
          </div>

          {/* Filtros da Tabela */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs font-bold text-slate-300">Pedidos Identificados:</span>

            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFiltroVisualizacao('todos')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filtroVisualizacao === 'todos' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({resultadoParse.pedidosValidos.length + resultadoParse.pedidosComErro.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroVisualizacao('validos')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filtroVisualizacao === 'validos' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Válidos ({resultadoParse.pedidosValidos.length})
              </button>
              {resultadoParse.pedidosComErro.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFiltroVisualizacao('erros')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filtroVisualizacao === 'erros' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-rose-400 hover:text-rose-200'
                  }`}
                >
                  Com Alertas ({resultadoParse.pedidosComErro.length})
                </button>
              )}
            </div>
          </div>

          {/* Tabela de Pré-visualização */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-slate-400 font-semibold sticky top-0 z-10 uppercase text-[10px]">
                <tr className="border-b border-slate-800">
                  <th className="p-3">Pedido</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Itens / Composição</th>
                  <th className="p-3">Pagamento</th>
                  <th className="p-3 text-right">Total (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pedidosExibidos.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/50 transition">
                    <td className="p-3 font-mono font-bold text-slate-300">
                      #{p.numeroPedidoOriginal || idx + 1}
                    </td>
                    <td className="p-3">
                      {p.statusAcao === 'VALIDO' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                          {p.status}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase" title={p.mensagensErro.join('; ')}>
                          Incompleto
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {p.clienteEncontrado ? (
                        <span className="font-bold text-slate-200">{p.clienteEncontrado.nome}</span>
                      ) : p.identificadorCliente ? (
                        <span className="text-amber-400 text-[11px]">Não localizado: {p.identificadorCliente}</span>
                      ) : (
                        <span className="text-slate-500 italic">Cliente Avulso</span>
                      )}
                    </td>
                    <td className="p-3 max-w-[240px]">
                      <div className="space-y-0.5">
                        {p.itens.map((it, iIdx) => (
                          <div key={iIdx} className="text-[11px] truncate flex items-center justify-between gap-1">
                            <span className={it.erro ? 'text-rose-400 font-semibold' : 'text-slate-300'}>
                              {it.quantidade}x {it.nomeProduto}
                            </span>
                            <span className="text-slate-500 font-mono">R$ {it.subtotal.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">
                      {p.formaPagamentoEncontrada ? p.formaPagamentoEncontrada.nome : (p.nomeFormaPagamento || 'Pix')}
                    </td>
                    <td className="p-3 text-right font-black text-emerald-400">
                      R$ {p.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-400">
              Pronto para importar <strong>{resultadoParse.pedidosValidos.length}</strong> pedidos válidos ({resultadoParse.totalItensValidos} itens).
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
                disabled={importando || resultadoParse.pedidosValidos.length === 0}
                className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {importando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Gravando Pedidos ({progressoImportacao}%)...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar e Importar Pedidos</span>
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

      {/* Card 4: Relatório Pós-Importação */}
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
                {relatorioFinal.sucesso ? 'Pedidos Importados com Sucesso!' : 'Importação Finalizada com Alertas'}
              </h3>
              <p className="text-xs text-slate-400">
                Os pedidos foram registrados no banco de dados e estão disponíveis no painel de vendas.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-1">
              <span className="text-xs font-semibold text-emerald-300">Pedidos Criados</span>
              <span className="text-2xl font-black text-emerald-400 block">{relatorioFinal.totalPedidosCriados}</span>
            </div>

            <div className="p-4 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center space-y-1">
              <span className="text-xs font-semibold text-cyan-300">Itens Registrados</span>
              <span className="text-2xl font-black text-cyan-400 block">{relatorioFinal.totalItensCriados}</span>
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
