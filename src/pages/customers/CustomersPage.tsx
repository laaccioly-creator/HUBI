import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Share2,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  X,
  CreditCard
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Cliente, TabelaPreco } from '../../types/database';

export const CustomersPage: React.FC = () => {
  const { loja } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [busca, setBusca] = useState<string>('');

  // Modal Novo Cliente
  const [modalNovoCliente, setModalNovoCliente] = useState<boolean>(false);
  const [nome, setNome] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [documento, setDocumento] = useState<string>('');
  const [tabelaPreco, setTabelaPreco] = useState<TabelaPreco>('varejo');
  const [limiteCredito, setLimiteCredito] = useState<string>('500.00');

  // Modal Quitar Fiado
  const [clienteQuitar, setClienteQuitar] = useState<Cliente | null>(null);
  const [valorAbatimento, setValorAbatimento] = useState<string>('');
  const [processandoQuitacao, setProcessandoQuitacao] = useState<boolean>(false);

  const carregarClientes = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id)
        .order('nome');

      if (error) throw error;
      if (data) setClientes(data);
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarClientes();
  }, [loja?.id]);

  const handleCadastrarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !nome.trim()) return;

    try {
      const { data, error } = await supabase.from('clientes').insert([
        {
          loja_id: loja.id,
          nome,
          whatsapp,
          email,
          numero_documento: documento,
          tabela_preco_padrao: tabelaPreco,
          limite_credito: Number(limiteCredito) || 0,
          saldo_devedor_fiado: 0,
          permite_fiado: true
        }
      ]).select().single();

      if (error) throw error;
      if (data) setClientes(prev => [...prev, data]);

      setModalNovoCliente(false);
      setNome('');
      setWhatsapp('');
      setEmail('');
      setDocumento('');
    } catch (err: any) {
      alert(`Erro ao cadastrar cliente: ${err.message}`);
    }
  };

  // Quitação Parcial ou Total de Fiado
  const handleQuitarFiado = async () => {
    if (!loja?.id || !clienteQuitar || !valorAbatimento) return;
    const valor = Number(valorAbatimento);
    if (isNaN(valor) || valor <= 0) return;

    try {
      setProcessandoQuitacao(true);
      const novoSaldo = Math.max(0, Number(clienteQuitar.saldo_devedor_fiado) - valor);

      // Atualizar saldo do cliente
      const { error: erroCli } = await supabase
        .from('clientes')
        .update({ saldo_devedor_fiado: novoSaldo })
        .eq('id', clienteQuitar.id);

      if (erroCli) throw erroCli;

      // Inserir registro financeiro da quitação
      await supabase.from('transacoes_financeiras').insert([
        {
          loja_id: loja.id,
          tipo: 'ENTRADA',
          categoria: 'Quitação de Fiado',
          descricao: `Recebimento de Fiado - Cliente: ${clienteQuitar.nome}`,
          valor: valor,
          data_vencimento: new Date().toISOString().split('T')[0],
          data_pagamento: new Date().toISOString(),
          status: 'pago'
        }
      ]);

      setClientes(prev =>
        prev.map(c => (c.id === clienteQuitar.id ? { ...c, saldo_devedor_fiado: novoSaldo } : c))
      );

      // Enviar mensagem de confirmação para o WhatsApp
      if (clienteQuitar.whatsapp) {
        const msg = `🧾 *COMPROVANTE DE PAGAMENTO DE FIADO - ${loja.nome_fantasia}*\n\nOlá, *${clienteQuitar.nome}*!\nConfirmamos o recebimento de *R$ ${valor.toFixed(2)}* referente à quitação do seu débito.\n\n💰 *Novo Saldo Devedor Restante:* R$ ${novoSaldo.toFixed(2)}\n\nAgradecemos a sua preferência! ✨`;
        const phone = clienteQuitar.whatsapp.replace(/\D/g, '');
        window.open(`https://api.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(msg)}`, '_blank');
      }

      setClienteQuitar(null);
      setValorAbatimento('');
    } catch (err: any) {
      alert(`Erro ao registrar quitação: ${err.message}`);
    } finally {
      setProcessandoQuitacao(false);
    }
  };

  const totalFiadoNaRua = clientes.reduce((acc, c) => acc + Number(c.saldo_devedor_fiado || 0), 0);
  const clientesEmDebito = clientes.filter(c => Number(c.saldo_devedor_fiado) > 0);

  const clientesFiltrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.whatsapp && c.whatsapp.includes(busca)) ||
    (c.numero_documento && c.numero_documento.includes(busca))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950">
      {/* HEADER & DASHBOARD FIADO */}
      <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span>Clientes & Controle de Fiado</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Histórico de clientes, cobrança automática e quitação parcial de débitos.
            </p>
          </div>

          <button
            onClick={() => setModalNovoCliente(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Cliente</span>
          </button>
        </div>

        {/* Cards de Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-xs text-slate-400 block">Total de Clientes</span>
            <span className="text-xl font-bold text-slate-100">{clientes.length} cadastrados</span>
          </div>

          <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-400 font-semibold">Total a Receber (Fiado)</span>
              <AlertCircle className="w-4 h-4 text-amber-400" />
            </div>
            <span className="text-xl font-bold text-amber-400">R$ {totalFiadoNaRua.toFixed(2)}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-xs text-slate-400 block">Clientes em Débito</span>
            <span className="text-xl font-bold text-rose-400">{clientesEmDebito.length} pessoas</span>
          </div>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou CPF..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* LISTA DE CLIENTES */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {carregando ? (
          <div className="col-span-full text-center py-16 text-slate-500 text-sm">Carregando clientes...</div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="col-span-full text-center py-16 text-slate-500 text-sm">Nenhum cliente cadastrado.</div>
        ) : (
          clientesFiltrados.map((cliente) => {
            const emDebito = Number(cliente.saldo_devedor_fiado) > 0;

            return (
              <div
                key={cliente.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-sm hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-slate-100">{cliente.nome}</h3>
                      <span className="text-[10px] text-slate-500 capitalize">
                        Tabela Padrão: {cliente.tabela_preco_padrao}
                      </span>
                    </div>
                    {emDebito ? (
                      <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Em Débito
                      </span>
                    ) : (
                      <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Em Dia
                      </span>
                    )}
                  </div>

                  {cliente.whatsapp && (
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-2">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{cliente.whatsapp}</span>
                    </p>
                  )}
                </div>

                {/* Saldo devedor & Botão de Quitação */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Saldo Devedor:</span>
                    <span className={`text-sm font-bold ${emDebito ? 'text-amber-400' : 'text-slate-400'}`}>
                      R$ {Number(cliente.saldo_devedor_fiado).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {emDebito && (
                      <button
                        onClick={() => {
                          setClienteQuitar(cliente);
                          setValorAbatimento(Number(cliente.saldo_devedor_fiado).toFixed(2));
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow transition"
                      >
                        Abater / Quitar
                      </button>
                    )}

                    {cliente.whatsapp && (
                      <button
                        onClick={() => {
                          const phone = cliente.whatsapp?.replace(/\D/g, '');
                          const msg = emDebito
                            ? `Olá, ${cliente.nome}! Lembramos do seu saldo em aberto de R$ ${Number(cliente.saldo_devedor_fiado).toFixed(2)} na loja ${loja?.nome_fantasia}. Chave Pix: ${loja?.email || loja?.whatsapp}`
                            : `Olá, ${cliente.nome}! Passando para desejar um ótimo dia da equipe ${loja?.nome_fantasia}! ✨`;
                          window.open(`https://api.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="Enviar WhatsApp"
                      >
                        <Share2 className="w-4 h-4 text-emerald-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL CADASTRAR CLIENTE */}
      {modalNovoCliente && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">Novo Cliente</h3>
              <button onClick={() => setModalNovoCliente(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCadastrarCliente} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">WhatsApp (DDD + Número)</label>
                <input
                  type="text"
                  placeholder="Ex: 85999998888"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Tabela Padrão</label>
                  <select
                    value={tabelaPreco}
                    onChange={(e) => setTabelaPreco(e.target.value as TabelaPreco)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 capitalize"
                  >
                    <option value="varejo">Varejo</option>
                    <option value="atacado">Atacado</option>
                    <option value="autoatacado">Autoatacado</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Limite de Fiado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={limiteCredito}
                    onChange={(e) => setLimiteCredito(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-bold text-white text-xs shadow-lg shadow-emerald-500/25 transition mt-2"
              >
                Cadastrar Cliente
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL QUITAR / ABATER FIADO */}
      {clienteQuitar && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-100">Quitar / Abater Fiado</h3>
                <p className="text-xs text-slate-400">{clienteQuitar.nome}</p>
              </div>
              <button onClick={() => setClienteQuitar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
              <span className="text-xs text-slate-400 block">Saldo Devedor Atual</span>
              <span className="text-2xl font-bold text-amber-400">
                R$ {Number(clienteQuitar.saldo_devedor_fiado).toFixed(2)}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">Valor a Abater (R$):</label>
              <input
                type="number"
                step="0.01"
                value={valorAbatimento}
                onChange={(e) => setValorAbatimento(e.target.value)}
                className="w-full bg-slate-800 border border-emerald-500 rounded-xl px-4 py-2.5 text-base font-bold text-emerald-400 text-center"
              />
            </div>

            <button
              disabled={processandoQuitacao}
              onClick={handleQuitarFiado}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{processandoQuitacao ? 'Gravando...' : 'Confirmar e Enviar Recibo WhatsApp'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
