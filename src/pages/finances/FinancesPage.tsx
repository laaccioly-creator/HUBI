import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Repeat,
  X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { TransacaoFinanceira, Caixa } from '../../types/database';

export const FinancesPage: React.FC = () => {
  const { loja, usuario } = useAuth();
  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[]>([]);
  const [caixaAberto, setCaixaAberto] = useState<Caixa | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [abaAtiva, setAbaAtiva] = useState<'fluxo' | 'pagar' | 'caixa'>('fluxo');

  // Modal Nova Despesa
  const [modalNovaDespesa, setModalNovaDespesa] = useState<boolean>(false);
  const [descricao, setDescricao] = useState<string>('');
  const [categoria, setCategoria] = useState<string>('Fornecedor');
  const [valor, setValor] = useState<string>('');
  const [dataVencimento, setDataVencimento] = useState<string>(new Date().toISOString().split('T')[0]);
  const [ehRecorrente, setEhRecorrente] = useState<boolean>(false);

  // Modal Caixa (Abertura / Fechamento)
  const [modalCaixa, setModalCaixa] = useState<boolean>(false);
  const [fundoTroco, setFundoTroco] = useState<string>('100.00');
  const [valorContadoFechamento, setValorContadoFechamento] = useState<string>('');

  const carregarFinanceiro = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      // 1. Transações
      const { data: trData } = await supabase
        .from('transacoes_financeiras')
        .select('*')
        .eq('loja_id', loja.id)
        .order('data_vencimento', { ascending: false });
      if (trData) setTransacoes(trData);

      // 2. Caixa Aberto
      const { data: cxData } = await supabase
        .from('caixas')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('status', 'ABERTO')
        .order('data_abertura', { ascending: false })
        .limit(1);

      if (cxData && cxData.length > 0) {
        setCaixaAberto(cxData[0]);
      } else {
        setCaixaAberto(null);
      }
    } catch (err) {
      console.error('Erro ao carregar dados financeiros:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarFinanceiro();
  }, [loja?.id]);

  // Salvar Despesa
  const handleCadastrarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !descricao.trim() || !valor) return;

    try {
      const { data, error } = await supabase.from('transacoes_financeiras').insert([
        {
          loja_id: loja.id,
          tipo: 'SAIDA',
          categoria,
          descricao,
          valor: Number(valor),
          data_vencimento: dataVencimento,
          status: 'pendente',
          eh_recorrente: ehRecorrente,
          frequencia_recorrencia: ehRecorrente ? 'mensal' : null
        }
      ]).select().single();

      if (error) throw error;
      if (data) setTransacoes(prev => [data, ...prev]);

      setModalNovaDespesa(false);
      setDescricao('');
      setValor('');
    } catch (err: any) {
      alert(`Erro ao lançar despesa: ${err.message}`);
    }
  };

  // Abrir Caixa
  const handleAbrirCaixa = async () => {
    if (!loja?.id || !usuario?.id) return;
    try {
      const { data, error } = await supabase.from('caixas').insert([
        {
          loja_id: loja.id,
          usuario_id: usuario.id,
          saldo_inicial: Number(fundoTroco) || 0,
          status: 'ABERTO'
        }
      ]).select().single();

      if (error) throw error;
      setCaixaAberto(data);
      setModalCaixa(false);
    } catch (err: any) {
      alert(`Erro ao abrir caixa: ${err.message}`);
    }
  };

  // Fechar Caixa
  const handleFecharCaixa = async () => {
    if (!caixaAberto) return;
    try {
      const valorDeclarado = Number(valorContadoFechamento) || 0;
      const totalEntradas = transacoes
        .filter(t => t.tipo === 'ENTRADA' && t.status === 'pago')
        .reduce((acc, t) => acc + Number(t.valor), 0);

      const totalCalculado = Number(caixaAberto.saldo_inicial) + totalEntradas;
      const diferenca = valorDeclarado - totalCalculado;

      const { error } = await supabase.from('caixas').update({
        data_fechamento: new Date().toISOString(),
        saldo_final_declarado: valorDeclarado,
        saldo_final_calculado: totalCalculado,
        diferenca_quebra: diferenca,
        status: 'FECHADO'
      }).eq('id', caixaAberto.id);

      if (error) throw error;
      setCaixaAberto(null);
      setModalCaixa(false);
      setValorContadoFechamento('');
      alert(`Caixa fechado com sucesso! Diferença: R$ ${diferenca.toFixed(2)}`);
    } catch (err: any) {
      alert(`Erro ao fechar caixa: ${err.message}`);
    }
  };

  // Métricas
  const totalReceitas = transacoes.filter(t => t.tipo === 'ENTRADA' && t.status === 'pago').reduce((acc, t) => acc + Number(t.valor), 0);
  const totalDespesasPagas = transacoes.filter(t => t.tipo === 'SAIDA' && t.status === 'pago').reduce((acc, t) => acc + Number(t.valor), 0);
  const totalDespesasPendentes = transacoes.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').reduce((acc, t) => acc + Number(t.valor), 0);
  const lucroLiquido = totalReceitas - totalDespesasPagas;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950">
      {/* HEADER & MÉTRICAS */}
      <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <span>Finanças & Fluxo de Caixa</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Abertura e fechamento de caixa, despesas recorrentes e contas a pagar.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setModalCaixa(true)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition ${
                caixaAberto
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {caixaAberto ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              <span>{caixaAberto ? 'Fechar Caixa' : 'Abrir Caixa'}</span>
            </button>

            <button
              onClick={() => setModalNovaDespesa(true)}
              className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-500/25 transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Despesa</span>
            </button>
          </div>
        </div>

        {/* Cards Resumo Financeiro */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> Entradas Recebidas
            </span>
            <span className="text-lg font-bold text-emerald-400">R$ {totalReceitas.toFixed(2)}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" /> Saídas Pagas
            </span>
            <span className="text-lg font-bold text-rose-400">R$ {totalDespesasPagas.toFixed(2)}</span>
          </div>

          <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-3.5 space-y-1">
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Contas a Pagar
            </span>
            <span className="text-lg font-bold text-amber-400">R$ {totalDespesasPendentes.toFixed(2)}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <span className="text-xs text-slate-400 block">Lucro Líquido Real</span>
            <span className={`text-lg font-bold ${lucroLiquido >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
              R$ {lucroLiquido.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-2 border-b border-slate-800">
          <button
            onClick={() => setAbaAtiva('fluxo')}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition ${
              abaAtiva === 'fluxo' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400'
            }`}
          >
            Fluxo Geral ({transacoes.length})
          </button>
          <button
            onClick={() => setAbaAtiva('pagar')}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition ${
              abaAtiva === 'pagar' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400'
            }`}
          >
            Contas a Pagar ({transacoes.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').length})
          </button>
        </div>
      </div>

      {/* LISTA DE TRANSAÇÕES */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
        {carregando ? (
          <div className="text-center py-16 text-slate-500 text-sm">Carregando transações...</div>
        ) : transacoes.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">Nenhuma movimentação financeira lançada.</div>
        ) : (
          transacoes
            .filter(t => (abaAtiva === 'pagar' ? t.tipo === 'SAIDA' && t.status === 'pendente' : true))
            .map((tr) => (
              <div
                key={tr.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      tr.tipo === 'ENTRADA' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {tr.tipo === 'ENTRADA' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{tr.descricao}</h4>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span>{tr.categoria}</span>
                      <span>•</span>
                      <span>Vencimento: {new Date(tr.data_vencimento).toLocaleDateString('pt-BR')}</span>
                      {tr.eh_recorrente && (
                        <span className="text-indigo-400 flex items-center gap-0.5">
                          <Repeat className="w-2.5 h-2.5" /> Mensal
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`font-bold text-sm ${
                      tr.tipo === 'ENTRADA' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {tr.tipo === 'ENTRADA' ? '+' : '-'} R$ {Number(tr.valor).toFixed(2)}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    {tr.status}
                  </span>
                </div>
              </div>
            ))
        )}
      </div>

      {/* MODAL NOVA DESPESA */}
      {modalNovaDespesa && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">Lançar Nova Despesa</h3>
              <button onClick={() => setModalNovaDespesa(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCadastrarDespesa} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Descrição do Gasto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pagamento Fornecedor de Embalagens"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 250.00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Categoria</label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="Fornecedor">Fornecedor</option>
                    <option value="Aluguel">Aluguel / Ponto</option>
                    <option value="Energia/Água">Energia / Água / Internet</option>
                    <option value="Salário">Salário / Comissão</option>
                    <option value="Marketing">Marketing / Anúncios</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Data de Vencimento</label>
                <input
                  type="date"
                  value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="chkRecorrente"
                  checked={ehRecorrente}
                  onChange={(e) => setEhRecorrente(e.target.checked)}
                  className="rounded border-slate-700"
                />
                <label htmlFor="chkRecorrente" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Despesa Fixa Recorrente (Repetir todo mês)
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 font-bold text-white text-xs shadow-lg shadow-rose-500/25 transition mt-2"
              >
                Salvar Despesa
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ABERTURA / FECHAMENTO DE CAIXA */}
      {modalCaixa && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">
                {caixaAberto ? 'Fechamento de Caixa' : 'Abertura de Caixa'}
              </h3>
              <button onClick={() => setModalCaixa(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {caixaAberto ? (
              <div className="space-y-4">
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs space-y-1">
                  <p className="text-slate-400">Aberto em: {new Date(caixaAberto.data_abertura).toLocaleString('pt-BR')}</p>
                  <p className="text-slate-400">Fundo Inicial: R$ {Number(caixaAberto.saldo_inicial).toFixed(2)}</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Valor Total Contado na Gaveta (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 850.00"
                    value={valorContadoFechamento}
                    onChange={(e) => setValorContadoFechamento(e.target.value)}
                    className="w-full bg-slate-800 border border-amber-500/50 rounded-xl px-4 py-2.5 text-sm font-bold text-amber-400 text-center"
                  />
                </div>

                <button
                  onClick={handleFecharCaixa}
                  className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition"
                >
                  Conferir e Fechar Caixa
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Fundo de Troco Inicial (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={fundoTroco}
                    onChange={(e) => setFundoTroco(e.target.value)}
                    className="w-full bg-slate-800 border border-emerald-500 rounded-xl px-4 py-2.5 text-sm font-bold text-emerald-400 text-center"
                  />
                </div>

                <button
                  onClick={handleAbrirCaixa}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition"
                >
                  Confirmar Abertura de Caixa
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
