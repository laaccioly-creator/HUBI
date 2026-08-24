import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Plus,
  Phone,
  Trash2,
  MapPin,
  Download,
  CheckCircle2,
  X,
  AlertCircle,
  MessageCircle,
  ArrowUpDown,
  FileText,
  Calendar,
  CreditCard,
  Mail,
  Pencil,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Cliente } from '../types';
import { ModalNovoCliente } from './ModalNovoCliente';

export const ClientesFiado: React.FC = () => {
  const { loja } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [busca, setBusca] = useState<string>('');
  const [ordemCrescente, setOrdemCrescente] = useState<boolean>(true);

  // Modais
  const [modalNovoCliente, setModalNovoCliente] = useState<boolean>(false);
  const [clienteEditar, setClienteEditar] = useState<Cliente | null>(null);

  const [clienteQuitar, setClienteQuitar] = useState<Cliente | null>(null);
  const [valorAbatimento, setValorAbatimento] = useState<string>('');
  const [processandoQuitacao, setProcessandoQuitacao] = useState<boolean>(false);

  const [clienteDetalhes, setClienteDetalhes] = useState<Cliente | null>(null);
  const [clienteExcluir, setClienteExcluir] = useState<Cliente | null>(null);
  const [excluindo, setExcluindo] = useState<boolean>(false);

  const carregarClientes = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id)
        .order('nome', { ascending: ordemCrescente });

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
  }, [loja?.id, ordemCrescente]);

  const handleClienteCadastrado = (clienteSalvo: Cliente) => {
    setClientes(prev => {
      const index = prev.findIndex(c => c.id === clienteSalvo.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = clienteSalvo;
        return updated;
      }
      return [clienteSalvo, ...prev];
    });
  };

  // Excluir Cliente
  const handleConfirmarExclusao = async () => {
    if (!clienteExcluir) return;
    try {
      setExcluindo(true);
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', clienteExcluir.id);

      if (error) throw error;

      setClientes(prev => prev.filter(c => c.id !== clienteExcluir.id));
      setClienteExcluir(null);
    } catch (err: any) {
      alert(`Erro ao excluir cliente: ${err.message}`);
    } finally {
      setExcluindo(false);
    }
  };

  // Quitar Débito de Fiado
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

  // Exportar Lista de Clientes para CSV
  const handleExportarCsv = () => {
    if (clientes.length === 0) {
      alert('Nenhum cliente disponível para exportação.');
      return;
    }

    const headers = [
      'Nome',
      'Documento (CPF/CNPJ)',
      'Telefone 1',
      'Telefone 2',
      'WhatsApp',
      'E-mail',
      'Saldo Devedor (R$)',
      'Limite Crédito (R$)',
      'Permite Fiado',
      'Data Aniversário',
      'Endereço Completo',
      'Observações'
    ];

    const formatMoedaCsv = (val: number | string | null | undefined) => {
      return Number(val || 0).toFixed(2).replace('.', ',');
    };

    const rows = clientes.map(c => [
      `"${c.nome.replace(/"/g, '""')}"`,
      `"${c.numero_documento || ''}"`,
      `"${c.telefone || ''}"`,
      `"${c.telefone2 || ''}"`,
      `"${c.whatsapp || ''}"`,
      `"${c.email || ''}"`,
      `"${formatMoedaCsv(c.saldo_devedor_fiado)}"`,
      `"${formatMoedaCsv(c.limite_credito)}"`,
      `"${c.permite_fiado ? 'Sim' : 'Não'}"`,
      `"${c.data_aniversario || ''}"`,
      `"${(c.endereco_principal || '').replace(/"/g, '""')}"`,
      `"${(c.observacoes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `clientes_hubi_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Obter Iniciais do Nome para o Avatar
  const getIniciais = (nomeCompleto: string) => {
    const partes = nomeCompleto.trim().split(' ').filter(Boolean);
    if (partes.length === 0) return 'CL';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
  };

  // Filtragem de clientes pela busca
  const clientesFiltrados = clientes.filter(c => {
    const termo = busca.toLowerCase();
    return (
      c.nome.toLowerCase().includes(termo) ||
      (c.whatsapp && c.whatsapp.includes(termo)) ||
      (c.telefone && c.telefone.includes(termo)) ||
      (c.telefone2 && c.telefone2.includes(termo)) ||
      (c.numero_documento && c.numero_documento.includes(termo)) ||
      (c.email && c.email.toLowerCase().includes(termo))
    );
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* ========================================================================= */}
      {/* HEADER DA TELA (ESTILO EXATO DA IMAGEM DO KYTE)                           */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-6 lg:px-8 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Título Principal */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight flex items-center gap-2.5">
                <span>Clientes</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  {clientes.length}
                </span>
              </h1>
            </div>
          </div>

          {/* Barra de Ações: Busca + Exportar + Novo Cliente */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Input de Busca estilo Kyte */}
            <div className="relative flex-1 sm:w-72">
              <input
                type="text"
                placeholder="Procure por nome"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-full pl-4 pr-9 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition shadow-inner"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Botão Exportar (Apenas se autorizado) */}
            {permissions.podeExportarRelatorios && (
              <button
                type="button"
                onClick={handleExportarCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer shadow-sm shrink-0"
                title="Exportar Lista em CSV"
              >
                <Download className="w-4 h-4 text-slate-400" />
                <span>Exportar</span>
              </button>
            )}

            {/* Botão + Cliente */}
            <button
              type="button"
              onClick={() => {
                setClienteEditar(null);
                setModalNovoCliente(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ Cliente</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TABELA EM LISTA (ESTILO EXATO DO KYTE COM AVATAR, TELEFONE, SALDO, AÇÕES) */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:px-8">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              {/* Cabeçalho da Tabela */}
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/40">
                  <th
                    className="py-3.5 px-4 sm:px-6 cursor-pointer hover:text-slate-200 transition select-none"
                    onClick={() => setOrdemCrescente(!ordemCrescente)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Nome</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">Celular/WhatsApp</th>
                  <th className="py-3.5 px-4 hidden md:table-cell">E-mail</th>
                  <th className="py-3.5 px-4">Valor Pendente</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>

              {/* Corpo da Tabela */}
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {carregando ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-500">
                      Carregando clientes...
                    </td>
                  </tr>
                ) : clientesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Users className="w-8 h-8 opacity-30" />
                        <p className="text-sm font-medium">Nenhum cliente cadastrado.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setClienteEditar(null);
                            setModalNovoCliente(true);
                          }}
                          className="text-xs text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer"
                        >
                          Clique aqui para cadastrar seu primeiro cliente
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  clientesFiltrados.map((cliente) => {
                    const emDebito = Number(cliente.saldo_devedor_fiado || 0) > 0;
                    const phoneWhatsapp =
                      cliente.whatsapp ||
                      (cliente.telefone_is_whatsapp ? cliente.telefone : cliente.telefone);

                    return (
                      <tr
                        key={cliente.id}
                        className="hover:bg-slate-800/50 transition duration-150 group"
                      >
                        {/* Coluna 1: Avatar + Nome Apenas (Sem documento para visual limpo) */}
                        <td className="py-3 px-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            {/* Avatar com Iniciais */}
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700/80 text-slate-200 font-bold text-xs flex items-center justify-center shrink-0 shadow-sm group-hover:border-emerald-500/40 group-hover:text-emerald-400 transition">
                              {getIniciais(cliente.nome)}
                            </div>
                            <div className="min-w-0">
                              <span
                                onClick={() => {
                                  setClienteEditar(cliente);
                                  setModalNovoCliente(true);
                                }}
                                className="font-bold text-slate-100 group-hover:text-emerald-400 cursor-pointer block truncate text-xs sm:text-sm"
                                title="Clique para editar este cliente"
                              >
                                {cliente.nome}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Coluna 2: Celular/WhatsApp */}
                        <td className="py-3 px-4">
                          {phoneWhatsapp ? (
                            <a
                              href={`https://api.whatsapp.com/send?phone=55${phoneWhatsapp.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium hover:underline"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                              <span>+55 {phoneWhatsapp}</span>
                            </a>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>

                        {/* Coluna 3: E-mail */}
                        <td className="py-3 px-4 hidden md:table-cell text-slate-400 truncate max-w-[200px]">
                          {cliente.email || '-'}
                        </td>

                        {/* Coluna 4: Saldo */}
                        <td className="py-3 px-4 font-bold">
                          {emDebito ? (
                            <span className="text-amber-400">
                              R$ {Number(cliente.saldo_devedor_fiado).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400">R$ 0,00</span>
                          )}
                        </td>

                        {/* Coluna 5: Ações (Ver Endereço / Alterar / Excluir) */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Botão Ver Endereço / Detalhes */}
                            {(cliente.endereco_principal || cliente.endereco_cidade) && (
                              <button
                                type="button"
                                onClick={() => setClienteDetalhes(cliente)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
                                title="Ver Endereço e Detalhes"
                              >
                                <MapPin className="w-4 h-4" />
                              </button>
                            )}

                            {/* Botão Alterar / Editar Cliente */}
                            <button
                              type="button"
                              onClick={() => {
                                setClienteEditar(cliente);
                                setModalNovoCliente(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                              title="Alterar / Editar Dados do Cliente"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL DETALHES DO CLIENTE / ENDEREÇO                                      */}
      {/* ========================================================================= */}
      {clienteDetalhes && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center">
                  {getIniciais(clienteDetalhes.nome)}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-100">{clienteDetalhes.nome}</h3>
                  <span className="text-xs text-slate-400 capitalize">
                    Tabela: {clienteDetalhes.tabela_preco_padrao || 'Varejo'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setClienteDetalhes(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              {clienteDetalhes.numero_documento && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>CPF/CNPJ: {clienteDetalhes.numero_documento}</span>
                </div>
              )}

              {clienteDetalhes.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <span>{clienteDetalhes.email}</span>
                </div>
              )}

              {clienteDetalhes.telefone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>Telefone 1: {clienteDetalhes.telefone}</span>
                </div>
              )}

              {clienteDetalhes.telefone2 && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-500" />
                  <span>Telefone 2: {clienteDetalhes.telefone2}</span>
                </div>
              )}

              {clienteDetalhes.data_aniversario && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>
                    Aniversário:{' '}
                    {new Date(clienteDetalhes.data_aniversario).toLocaleDateString('pt-BR', {
                      timeZone: 'UTC'
                    })}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800 space-y-1">
                <span className="font-bold text-slate-200 block">Endereço Completo:</span>
                <div className="flex items-start gap-2 text-slate-400">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    {clienteDetalhes.endereco_principal ||
                      `${clienteDetalhes.endereco_logradouro || ''}, ${clienteDetalhes.endereco_numero || 'S/N'} - ${clienteDetalhes.endereco_bairro || ''}, ${clienteDetalhes.endereco_cidade || ''} - ${clienteDetalhes.endereco_estado || ''}`}
                  </span>
                </div>
              </div>

              {clienteDetalhes.observacoes && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="font-bold text-slate-200 block mb-0.5">Observações:</span>
                  <p className="text-slate-400 italic">"{clienteDetalhes.observacoes}"</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const c = clienteDetalhes;
                  setClienteDetalhes(null);
                  setClienteEditar(c);
                  setModalNovoCliente(true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar Dados</span>
              </button>
              <button
                type="button"
                onClick={() => setClienteDetalhes(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL CONFIRMAÇÃO DE EXCLUSÃO                                            */}
      {/* ========================================================================= */}
      {clienteExcluir && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-slate-100">Excluir Cliente</h3>
              <p className="text-xs text-slate-400">
                Tem certeza que deseja remover o cadastro de <strong>{clienteExcluir.nome}</strong>?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClienteExcluir(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={excluindo}
                onClick={handleConfirmarExclusao}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                {excluindo ? 'Removendo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL NOVO / EDITAR CLIENTE                                               */}
      {/* ========================================================================= */}
      <ModalNovoCliente
        isOpen={modalNovoCliente}
        onClose={() => {
          setModalNovoCliente(false);
          setClienteEditar(null);
        }}
        onClienteCadastrado={handleClienteCadastrado}
        clienteEditar={clienteEditar}
      />

      {/* ========================================================================= */}
      {/* MODAL QUITAR FIADO                                                        */}
      {/* ========================================================================= */}
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
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
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
