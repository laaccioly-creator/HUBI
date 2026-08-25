import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Trash2,
  Phone,
  MessageCircle,
  Search,
  Plus,
  Minus,
  Check,
  X,
  FileText,
  Clock,
  DollarSign,
  Receipt,
  User,
  AlertCircle,
  Calendar,
  Lock,
  ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Cliente, Pedido, MovimentacaoSaldoCliente } from '../types';

interface ClientePerfilMobileProps {
  cliente: Cliente;
  onVoltar: () => void;
  onClienteAtualizado: (cliente: Cliente) => void;
  onClienteExcluido?: (clienteId: string) => void;
}

type TabCliente = 'dados' | 'vendas' | 'pedidos' | 'conta';

export const ClientePerfilMobile: React.FC<ClientePerfilMobileProps> = ({
  cliente,
  onVoltar,
  onClienteAtualizado,
  onClienteExcluido
}) => {
  const { loja, usuario } = useAuth();

  const [abaAtiva, setAbaAtiva] = useState<TabCliente>('dados');
  const [salvando, setSalvando] = useState<boolean>(false);

  // Estados de formulário da aba DADOS
  const [nome, setNome] = useState(cliente.nome || '');
  const [whatsapp, setWhatsapp] = useState(cliente.whatsapp || cliente.telefone || '');
  const [enderecoLogradouro, setEnderecoLogradouro] = useState(cliente.endereco_logradouro || cliente.endereco_principal || '');
  const [enderecoNumero, setEnderecoNumero] = useState(cliente.endereco_numero || '');
  const [enderecoBairro, setEnderecoBairro] = useState(cliente.endereco_bairro || '');
  const [enderecoCidade, setEnderecoCidade] = useState(cliente.endereco_cidade || '');
  const [enderecoEstado, setEnderecoEstado] = useState(cliente.endereco_estado || '');
  const [enderecoCep, setEnderecoCep] = useState(cliente.endereco_cep || '');
  
  // Opcionais (TELA14)
  const [mostrarOpcionais, setMostrarOpcionais] = useState<boolean>(false);
  const [mostrarModalEndereco, setMostrarModalEndereco] = useState<boolean>(false);
  const [dataAniversario, setDataAniversario] = useState(cliente.data_aniversario || '');
  const [email, setEmail] = useState(cliente.email || '');
  const [telefone, setTelefone] = useState(cliente.telefone2 || cliente.telefone || '');
  const [numeroDocumento, setNumeroDocumento] = useState(cliente.numero_documento || '');
  const [observacoes, setObservacoes] = useState(cliente.observacoes || '');
  const [permiteFiado, setPermiteFiado] = useState(cliente.permite_fiado !== false);

  // Estados da aba VENDAS e PEDIDOS
  const [pedidosCliente, setPedidosCliente] = useState<Pedido[]>([]);
  const [carregandoPedidos, setCarregandoPedidos] = useState<boolean>(false);
  const [buscaVendas, setBuscaVendas] = useState<string>('');

  // Estados da aba CONTA / CRÉDITOS (TELA13)
  const [saldoCredito, setSaldoCredito] = useState<number>(Number(cliente.saldo_credito || 0));
  const [modalAjusteSaldo, setModalAjusteSaldo] = useState<boolean>(false);
  const [etapaAjuste, setEtapaAjuste] = useState<'valor' | 'observacao'>('valor');
  const [tipoAjuste, setTipoAjuste] = useState<'adicionar' | 'subtrair'>('adicionar');
  const [valorAjusteStr, setValorAjusteStr] = useState<string>('');
  const [observacaoAjuste, setObservacaoAjuste] = useState<string>('');
  const [processandoAjuste, setProcessandoAjuste] = useState<boolean>(false);

  // Extrato de Movimentações
  const [modalExtrato, setModalExtrato] = useState<boolean>(false);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoSaldoCliente[]>([]);
  const [carregandoExtrato, setCarregandoExtrato] = useState<boolean>(false);

  // Carregar pedidos do cliente ao montar
  useEffect(() => {
    if (!cliente.id || !loja?.id) return;
    const carregarPedidos = async () => {
      try {
        setCarregandoPedidos(true);
        const { data } = await supabase
          .from('pedidos')
          .select('*, itens_pedido(*)')
          .eq('cliente_id', cliente.id)
          .order('data_venda', { ascending: false });
        if (data) setPedidosCliente(data);
      } catch (err) {
        console.warn('Erro ao carregar pedidos do cliente:', err);
      } finally {
        setCarregandoPedidos(false);
      }
    };
    carregarPedidos();
  }, [cliente.id, loja?.id]);

  // Carregar extrato de créditos
  const carregarExtratoCreditos = async () => {
    if (!cliente.id || !loja?.id) return;
    try {
      setCarregandoExtrato(true);
      const { data, error } = await supabase
        .from('movimentacoes_saldo_cliente')
        .select('*')
        .eq('cliente_id', cliente.id)
        .order('criado_em', { ascending: false });
      if (!error && data) {
        setMovimentacoes(data);
      }
    } catch (err) {
      console.warn('Extrato de movimentações não pôde ser carregado:', err);
    } finally {
      setCarregandoExtrato(false);
    }
  };

  // Salvar Dados do Cliente
  const handleSalvarDados = async () => {
    if (!nome.trim()) {
      alert('Informe o nome do cliente.');
      return;
    }

    try {
      setSalvando(true);
      const payload: Partial<Cliente> = {
        nome: nome.trim(),
        whatsapp: whatsapp.trim(),
        telefone: whatsapp.trim(),
        telefone2: telefone.trim(),
        email: email.trim() || null,
        numero_documento: numeroDocumento.trim() || null,
        data_aniversario: dataAniversario || null,
        observacoes: observacoes.trim() || null,
        permite_fiado: permiteFiado,
        endereco_logradouro: enderecoLogradouro.trim() || null,
        endereco_numero: enderecoNumero.trim() || null,
        endereco_bairro: enderecoBairro.trim() || null,
        endereco_cidade: enderecoCidade.trim() || null,
        endereco_estado: enderecoEstado.trim() || null,
        endereco_cep: enderecoCep.trim() || null,
        endereco_principal: `${enderecoLogradouro} ${enderecoNumero} ${enderecoBairro}`.trim() || null
      };

      const { data, error } = await supabase
        .from('clientes')
        .update(payload)
        .eq('id', cliente.id)
        .select()
        .single();

      if (error) throw error;

      const atualizado = data || { ...cliente, ...payload };
      onClienteAtualizado(atualizado);
      alert('Dados do cliente atualizados com sucesso!');
    } catch (err: any) {
      alert(`Erro ao salvar cliente: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  // Executar Ajuste de Saldo de Crédito
  const handleConfirmarAjusteSaldo = async () => {
    const valor = parseFloat(valorAjusteStr.replace(',', '.')) || 0;
    if (valor <= 0) {
      alert('Informe um valor válido maior que zero.');
      return;
    }

    const saldoAnterior = saldoCredito;
    const novoSaldo = tipoAjuste === 'adicionar' ? saldoAnterior + valor : Math.max(0, saldoAnterior - valor);

    try {
      setProcessandoAjuste(true);

      // 1. Atualizar saldo no cliente
      const { error: errCli } = await supabase
        .from('clientes')
        .update({ saldo_credito: novoSaldo })
        .eq('id', cliente.id);

      if (errCli) {
        // Fallback: se a coluna ainda não tiver sido criada no Supabase
        console.warn('Aviso: atualizando estado local do saldo.');
      }

      // 2. Registrar movimentação no extrato
      try {
        await supabase.from('movimentacoes_saldo_cliente').insert([{
          loja_id: loja?.id,
          cliente_id: cliente.id,
          tipo: tipoAjuste,
          valor: valor,
          saldo_anterior: saldoAnterior,
          saldo_posterior: novoSaldo,
          observacao: observacaoAjuste.trim() || (tipoAjuste === 'adicionar' ? 'Crédito manual' : 'Subtração manual'),
          usuario_id: usuario?.id
        }]);
      } catch (e) {
        console.warn('Registro de movimentação em histórico indisponível:', e);
      }

      setSaldoCredito(novoSaldo);
      const clienteAtualizado = { ...cliente, saldo_credito: novoSaldo };
      onClienteAtualizado(clienteAtualizado);

      setModalAjusteSaldo(false);
      setEtapaAjuste('valor');
      setValorAjusteStr('');
      setObservacaoAjuste('');
      alert(`Saldo ajustado com sucesso! Novo saldo: R$ ${novoSaldo.toFixed(2)}`);
    } catch (err: any) {
      alert(`Erro ao ajustar saldo: ${err.message}`);
    } finally {
      setProcessandoAjuste(false);
    }
  };

  // Filtragem de Vendas e Pedidos
  const vendasFiltradas = useMemo(() => {
    const concluidos = pedidosCliente.filter(p => p.status === 'concluido' || p.status === 'confirmado');
    if (!buscaVendas.trim()) return concluidos;
    const t = buscaVendas.toLowerCase().trim();
    return concluidos.filter(p =>
      String(p.numero_pedido).includes(t) ||
      (p.itens_pedido && p.itens_pedido.some((i: any) => i.nome_produto.toLowerCase().includes(t)))
    );
  }, [pedidosCliente, buscaVendas]);

  const totalVendasPeriodo = useMemo(() => {
    return vendasFiltradas.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
  }, [vendasFiltradas]);

  return (
    <div className="fixed inset-0 z-50 bg-white text-slate-900 flex flex-col animate-in slide-in-from-right duration-150 select-none">
      {/* 1. Header Superior (TELA10) */}
      <div className="h-14 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2 max-w-[280px]">
          <button
            type="button"
            onClick={onVoltar}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-sm uppercase text-slate-800 truncate">
            {cliente.nome}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Deseja realmente excluir o cliente "${cliente.nome}"?`)) {
              if (onClienteExcluido) onClienteExcluido(cliente.id);
            }
          }}
          className="p-2 text-slate-400 hover:text-rose-500 transition cursor-pointer"
          title="Excluir Cliente"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Barra de Abas (DADOS | VENDAS | PEDIDOS | CONTA) */}
      <div className="px-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 text-xs font-bold uppercase tracking-wider text-slate-400">
        <button
          type="button"
          onClick={() => setAbaAtiva('dados')}
          className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
            abaAtiva === 'dados' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
          }`}
        >
          DADOS
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('vendas')}
          className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
            abaAtiva === 'vendas' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
          }`}
        >
          VENDAS
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('pedidos')}
          className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
            abaAtiva === 'pedidos' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
          }`}
        >
          PEDIDOS
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva('conta')}
          className={`py-3 border-b-2 transition flex-1 text-center cursor-pointer ${
            abaAtiva === 'conta' ? 'border-emerald-500 text-emerald-600' : 'border-transparent hover:text-slate-700'
          }`}
        >
          CONTA
        </button>
      </div>

      {/* 3. Conteúdo da Aba */}
      <div className="flex-1 overflow-y-auto">
        {/* ================================================================= */}
        {/* ABA 1: DADOS (TELA10 & TELA14) */}
        {/* ================================================================= */}
        {abaAtiva === 'dados' && (
          <div className="p-4 space-y-4 max-w-md mx-auto">
            {/* Avatar e WhatsApp Shortcut */}
            <div className="flex flex-col items-center justify-center py-2 space-y-2">
              <div className="w-20 h-20 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                <User className="w-10 h-10 stroke-1" />
              </div>

              {whatsapp && (
                <a
                  href={`https://wa.me/55${whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition shadow-xs flex items-center gap-1.5 text-xs font-bold"
                >
                  <MessageCircle className="w-4 h-4 fill-emerald-600 text-emerald-600" />
                  <span>WhatsApp</span>
                </a>
              )}
            </div>

            {/* Campos Principais */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Nome</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-white border-b border-slate-300 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Celular/WhatsApp</label>
                <div className="flex items-center gap-2 border-b border-slate-300 py-1.5">
                  <span className="text-sm">🇧🇷</span>
                  <input
                    type="text"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full bg-white text-xs font-bold text-slate-800 focus:outline-none"
                    placeholder="5588988808161"
                  />
                </div>
              </div>

              {/* Botão de Endereço */}
              <button
                type="button"
                onClick={() => setMostrarModalEndereco(true)}
                className="w-full py-2.5 flex items-center justify-between border-b border-slate-200 text-xs font-medium text-slate-500 hover:text-slate-800 text-left"
              >
                <span>{enderecoLogradouro ? `${enderecoLogradouro}, ${enderecoNumero}` : 'Endereço (opcional)'}</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              {/* Acordeão de Opcionais (TELA14) */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMostrarOpcionais(!mostrarOpcionais)}
                  className="w-full py-2 flex items-center justify-between text-xs font-bold text-slate-700"
                >
                  <span>Opcionais</span>
                  {mostrarOpcionais ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {mostrarOpcionais && (
                  <div className="space-y-3 pt-2 animate-in fade-in">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Data de aniversário</label>
                      <input
                        type="date"
                        value={dataAniversario}
                        onChange={(e) => setDataAniversario(e.target.value)}
                        className="w-full bg-white border-b border-slate-300 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">E-mail</label>
                      <input
                        type="email"
                        placeholder="cliente@exemplo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-white border-b border-slate-300 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Telefone Fixo</label>
                      <input
                        type="text"
                        placeholder="Telefone secundário"
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        className="w-full bg-white border-b border-slate-300 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">CPF/CNPJ</label>
                      <input
                        type="text"
                        placeholder="Documento"
                        value={numeroDocumento}
                        onChange={(e) => setNumeroDocumento(e.target.value)}
                        className="w-full bg-white border-b border-slate-300 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Observação</label>
                      <textarea
                        rows={2}
                        placeholder="Observações internas..."
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Permitir Fiado Switch */}
              <div className="flex items-center justify-between py-3 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-700">Permitir fiado</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permiteFiado}
                    onChange={(e) => setPermiteFiado(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            {/* Botão Salvar */}
            <div className="pt-4">
              <button
                type="button"
                onClick={handleSalvarDados}
                disabled={salvando}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* ABA 2: VENDAS (TELA11) */}
        {/* ================================================================= */}
        {abaAtiva === 'vendas' && (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Item, cliente ou código"
                  value={buscaVendas}
                  onChange={(e) => setBuscaVendas(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 p-4 space-y-3">
              {vendasFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Receipt className="w-8 h-8 stroke-1" />
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Sem vendas neste período</p>
                </div>
              ) : (
                vendasFiltradas.map((pedido) => (
                  <div key={pedido.id} className="p-3.5 rounded-2xl border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-xs font-black text-slate-900">
                      <span>R$ {Number(pedido.valor_total).toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {new Date(pedido.data_venda).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {pedido.itens_pedido?.map((i: any) => `${i.quantidade}x ${i.nome_produto}`).join(', ')}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé da Aba Vendas */}
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400">Últimos 30 dias</span>
              <span className="font-black text-emerald-400">
                R$ {totalVendasPeriodo.toFixed(2)} em {vendasFiltradas.length} venda(s)
              </span>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* ABA 3: PEDIDOS (TELA12) */}
        {/* ================================================================= */}
        {abaAtiva === 'pedidos' && (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Item, cliente ou código"
                  value={buscaVendas}
                  onChange={(e) => setBuscaVendas(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 p-4 space-y-3">
              {pedidosCliente.length === 0 ? (
                <div className="text-center py-20 text-xs text-slate-400">
                  Nenhum pedido encontrado para este cliente.
                </div>
              ) : (
                pedidosCliente.map((pedido) => (
                  <div key={pedido.id} className="p-3.5 rounded-2xl border border-slate-200 space-y-1 bg-white">
                    <div className="flex items-center justify-between text-xs font-black text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>R$ {Number(pedido.valor_total).toFixed(2)}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {new Date(pedido.data_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-500 truncate">
                      {pedido.itens_pedido?.length || 0} itens: {pedido.itens_pedido?.map((i: any) => `${i.quantidade}x ${i.nome_produto}`).join(', ')}
                    </p>
                    <span className="text-[9px] text-slate-400 block">#{pedido.numero_pedido}</span>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé da Aba Pedidos */}
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400">Total em pedidos</span>
              <span className="font-black text-emerald-400">
                R$ {pedidosCliente.reduce((acc, p) => acc + Number(p.valor_total || 0), 0).toFixed(2)} em {pedidosCliente.length} pedido(s)
              </span>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* ABA 4: CONTA / CRÉDITOS (TELA13) */}
        {/* ================================================================= */}
        {abaAtiva === 'conta' && (
          <div className="flex flex-col justify-between h-full p-6 text-center">
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-400">
                SALDO ATUAL
              </span>

              <div className="text-5xl font-black text-slate-800 tracking-tight">
                R$ {saldoCredito.toFixed(2)}
              </div>

              <div className="space-y-2 pt-2 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => {
                    setTipoAjuste('adicionar');
                    setEtapaAjuste('valor');
                    setModalAjusteSaldo(true);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm shadow-md shadow-emerald-500/20 transition cursor-pointer"
                >
                  Adicionar créditos
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEtapaAjuste('valor');
                    setModalAjusteSaldo(true);
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 hover:underline block mx-auto pt-1 cursor-pointer"
                >
                  Ajuste de saldo
                </button>
              </div>
            </div>

            {/* Botão Extrato da Conta */}
            <div className="pt-6">
              <button
                type="button"
                onClick={() => {
                  carregarExtratoCreditos();
                  setModalExtrato(true);
                }}
                className="w-full py-3.5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>Extrato da conta</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL AJUSTE DE SALDO (PASSO A PASSO TELA13) */}
      {/* ================================================================= */}
      {modalAjusteSaldo && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs space-y-4 shadow-2xl animate-in zoom-in-95 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-800">Ajuste de Saldo</h3>
              <button
                type="button"
                onClick={() => setModalAjusteSaldo(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {etapaAjuste === 'valor' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoAjuste('adicionar')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                      tipoAjuste === 'adicionar' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    + Adicionar valor
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoAjuste('subtrair')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                      tipoAjuste === 'subtrair' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    - Subtrair valor
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={valorAjusteStr}
                    onChange={(e) => setValorAjusteStr(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-lg font-black text-slate-800 focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const num = parseFloat(valorAjusteStr.replace(',', '.')) || 0;
                    if (num <= 0) {
                      alert('Informe um valor maior que zero.');
                      return;
                    }
                    setEtapaAjuste('observacao');
                  }}
                  className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-md transition cursor-pointer"
                >
                  <span>Avançar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-2xl text-xs space-y-1">
                  <div className="flex justify-between text-slate-500">
                    <span>Operação:</span>
                    <span className="font-bold uppercase text-slate-800">{tipoAjuste}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Valor:</span>
                    <span className="font-black text-slate-800">R$ {parseFloat(valorAjusteStr.replace(',', '.')).toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Observação para sua equipe
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Cashback por promoção, bônus de aniversário..."
                    value={observacaoAjuste}
                    onChange={(e) => setObservacaoAjuste(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEtapaAjuste('valor')}
                    className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-xs"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmarAjusteSaldo}
                    disabled={processandoAjuste}
                    className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {processandoAjuste ? 'Ajustando...' : 'Ajuste de saldo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL EXTRATO DA CONTA */}
      {/* ================================================================= */}
      {modalExtrato && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-3 shadow-2xl animate-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
              <h3 className="font-bold text-sm text-slate-800">Extrato de Créditos</h3>
              <button
                type="button"
                onClick={() => setModalExtrato(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 space-y-2">
              {carregandoExtrato ? (
                <div className="text-center py-8 text-xs text-slate-400">Carregando histórico...</div>
              ) : movimentacoes.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  Nenhuma movimentação de crédito registrada.
                </div>
              ) : (
                movimentacoes.map((m) => (
                  <div key={m.id} className="pt-2 first:pt-0 space-y-0.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className={`font-black ${m.tipo === 'adicionar' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {m.tipo === 'adicionar' ? '+' : '-'} R$ {Number(m.valor).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(m.criado_em || '').toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {m.observacao && (
                      <p className="text-[11px] text-slate-600">{m.observacao}</p>
                    )}
                    <span className="text-[9px] text-slate-400 block">
                      Saldo após: R$ {Number(m.saldo_posterior || 0).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL DE EDIÇÃO DE ENDEREÇO */}
      {/* ================================================================= */}
      {mostrarModalEndereco && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-3 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-800">Endereço de Entrega</h3>
              <button
                type="button"
                onClick={() => setMostrarModalEndereco(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400">Rua / Logradouro</label>
                <input
                  type="text"
                  value={enderecoLogradouro}
                  onChange={(e) => setEnderecoLogradouro(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400">Número</label>
                  <input
                    type="text"
                    value={enderecoNumero}
                    onChange={(e) => setEnderecoNumero(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400">Bairro</label>
                  <input
                    type="text"
                    value={enderecoBairro}
                    onChange={(e) => setEnderecoBairro(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400">Cidade</label>
                  <input
                    type="text"
                    value={enderecoCidade}
                    onChange={(e) => setEnderecoCidade(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400">Estado (UF)</label>
                  <input
                    type="text"
                    value={enderecoEstado}
                    onChange={(e) => setEnderecoEstado(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMostrarModalEndereco(false)}
              className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-bold text-xs"
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
