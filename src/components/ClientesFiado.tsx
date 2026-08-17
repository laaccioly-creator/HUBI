import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Share2,
  AlertCircle,
  CheckCircle2,
  X,
  Calendar,
  MapPin,
  FileText,
  Mail,
  ShieldCheck,
  ShieldAlert,
  MessageCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Cliente } from '../types';
import { ModalNovoCliente } from './ModalNovoCliente';

export const ClientesFiado: React.FC = () => {
  const { loja } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [busca, setBusca] = useState<string>('');

  const [modalNovoCliente, setModalNovoCliente] = useState<boolean>(false);

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

  const handleClienteCadastrado = (novoCliente: Cliente) => {
    setClientes(prev => [novoCliente, ...prev]);
  };

  const handleQuitarFiado = async () => {
    if (!loja?.id || !clienteQuitar || !valorAbatimento) return;
    const valor = Number(valorAbatimento);
    if (isNaN(valor) || valor <= 0) return;

    try {
      setProcessandoQuitacao(true);
      const novoSaldo = Math.max(0, Number(clienteQuitar.saldo_devedor_fiado) - valor);

      const { error: erroCli } = await supabase
        .from('clientes')
        .update({ saldo_devedor_fiado: novoSaldo })
        .eq('id', clienteQuitar.id);

      if (erroCli) throw erroCli;

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

      const phoneDestino = clienteQuitar.whatsapp || clienteQuitar.telefone;
      if (phoneDestino) {
        const msg = `🧾 *COMPROVANTE DE PAGAMENTO DE FIADO - ${loja.nome_fantasia}*\n\nOlá, *${clienteQuitar.nome}*!\nConfirmamos o recebimento de *R$ ${valor.toFixed(2)}* referente à quitação do seu débito.\n\n💰 *Novo Saldo Devedor Restante:* R$ ${novoSaldo.toFixed(2)}\n\nAgradecemos a sua preferência! ✨`;
        const phone = phoneDestino.replace(/\D/g, '');
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

  const clientesFiltrados = clientes.filter(c => {
    const termo = busca.toLowerCase();
    return (
      c.nome.toLowerCase().includes(termo) ||
      (c.whatsapp && c.whatsapp.includes(termo)) ||
      (c.telefone && c.telefone.includes(termo)) ||
      (c.telefone2 && c.telefone2.includes(termo)) ||
      (c.numero_documento && c.numero_documento.includes(termo)) ||
      (c.email && c.email.toLowerCase().includes(termo)) ||
      (c.endereco_cidade && c.endereco_cidade.toLowerCase().includes(termo)) ||
      (c.endereco_principal && c.endereco_principal.toLowerCase().includes(termo))
    );
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950">
      {/* Topo / Header */}
      <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span>Clientes & Gestão de Fiado</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Cadastro completo, controle de limite a prazo e cobrança via WhatsApp
            </p>
          </div>

          <button
            onClick={() => setModalNovoCliente(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition cursor-pointer"
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

        {/* Barra de Busca */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, CPF/CNPJ, telefone, e-mail ou cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Grid de Clientes */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {carregando ? (
          <div className="col-span-full text-center py-16 text-slate-500 text-sm">Carregando clientes...</div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-500 space-y-3">
            <Users className="w-12 h-12 opacity-30" />
            <p className="text-sm">Nenhum cliente cadastrado.</p>
            <button
              onClick={() => setModalNovoCliente(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Primeiro Cliente</span>
            </button>
          </div>
        ) : (
          clientesFiltrados.map((cliente) => {
            const emDebito = Number(cliente.saldo_devedor_fiado) > 0;
            const phoneWhatsapp = cliente.whatsapp || (cliente.telefone_is_whatsapp ? cliente.telefone : (cliente.telefone2_is_whatsapp ? cliente.telefone2 : null));

            return (
              <div
                key={cliente.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-sm hover:border-slate-700 transition"
              >
                <div className="space-y-2.5">
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-100 truncate">{cliente.nome}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded capitalize">
                          {cliente.tabela_preco_padrao || 'Varejo'}
                        </span>
                        {cliente.permite_fiado ? (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Fiado Permitido (Limite R$ {Number(cliente.limite_credito || 0).toFixed(2)})</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-slate-500" />
                            <span>Sem Fiado</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {emDebito ? (
                      <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                        Em Débito
                      </span>
                    ) : (
                      <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                        Em Dia
                      </span>
                    )}
                  </div>

                  {/* Informações detalhadas */}
                  <div className="space-y-1 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                    {cliente.numero_documento && (
                      <p className="flex items-center gap-1.5 text-[11px]">
                        <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>Doc: {cliente.numero_documento}</span>
                      </p>
                    )}

                    {cliente.telefone && (
                      <p className="flex items-center gap-1.5 text-[11px]">
                        <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{cliente.telefone}</span>
                        {cliente.telefone_is_whatsapp && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1 rounded">WhatsApp</span>
                        )}
                      </p>
                    )}

                    {cliente.telefone2 && (
                      <p className="flex items-center gap-1.5 text-[11px]">
                        <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>{cliente.telefone2}</span>
                        {cliente.telefone2_is_whatsapp && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1 rounded">WhatsApp</span>
                        )}
                      </p>
                    )}

                    {cliente.email && (
                      <p className="flex items-center gap-1.5 text-[11px] truncate">
                        <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{cliente.email}</span>
                      </p>
                    )}

                    {cliente.data_aniversario && (
                      <p className="flex items-center gap-1.5 text-[11px]">
                        <Calendar className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Aniversário: {new Date(cliente.data_aniversario).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                      </p>
                    )}

                    {(cliente.endereco_principal || cliente.endereco_logradouro) && (
                      <p className="flex items-start gap-1.5 text-[11px] line-clamp-2">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                        <span>{cliente.endereco_principal || `${cliente.endereco_logradouro}, ${cliente.endereco_numero || 'S/N'} - ${cliente.endereco_bairro || ''}, ${cliente.endereco_cidade || ''}`}</span>
                      </p>
                    )}

                    {cliente.observacoes && (
                      <p className="text-[10px] text-slate-500 italic line-clamp-2 pt-0.5">
                        "{cliente.observacoes}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Rodapé do Card */}
                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
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

                    {phoneWhatsapp && (
                      <button
                        onClick={() => {
                          const phone = phoneWhatsapp.replace(/\D/g, '');
                          const msg = emDebito
                            ? `Olá, ${cliente.nome}! Lembramos do seu saldo em aberto de R$ ${Number(cliente.saldo_devedor_fiado).toFixed(2)} na loja ${loja?.nome_fantasia}. Chave Pix: ${loja?.email || loja?.whatsapp}`
                            : `Olá, ${cliente.nome}! Passando para desejar um ótimo dia da equipe ${loja?.nome_fantasia}! ✨`;
                          window.open(`https://api.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="Enviar Mensagem no WhatsApp"
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

      {/* Modal Novo Cliente */}
      <ModalNovoCliente
        isOpen={modalNovoCliente}
        onClose={() => setModalNovoCliente(false)}
        onClienteCadastrado={handleClienteCadastrado}
      />

      {/* Modal Quitar Fiado */}
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
                className="w-full bg-slate-800 border border-emerald-500 rounded-xl px-4 py-2.5 text-base font-bold text-emerald-400 text-center focus:outline-none"
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
