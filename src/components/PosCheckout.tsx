import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  Plus,
  Minus,
  Trash2,
  User,
  CreditCard,
  Printer,
  Share2,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Tag,
  ArrowRight,
  Layers,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  CloudOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { Produto, VariacaoProduto, Cliente, FormaPagamento, TabelaPreco, Pedido, ItemPedido } from '../types';
import { PrintService } from '../services/printService';
import { ModalNovoCliente } from './ModalNovoCliente';
import { SyncService } from '../services/syncService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { VendaOfflineFila } from '../services/offlineDb';

export const PosCheckout: React.FC = () => {
  const { loja, usuario } = useAuth();
  const {
    itens,
    clienteSelecionado,
    tabelaPrecoGlobal,
    tabelaPrecoCalculada,
    avaliacaoCarrinho,
    desconto,
    taxaEntrega,
    subtotal,
    total,
    totalItens,
    adicionarItem,
    removerItem,
    atualizarQuantidade,
    setClienteSelecionado,
    setTabelaPrecoGlobal,
    setDesconto,
    setTaxaEntrega,
    limparCarrinho
  } = useCart();

  const {
    isOnline,
    pendentesCount,
    sincronizando,
    ultimoSyncMsg,
    atualizarContadorPendentes,
    sincronizarAgora
  } = useNetworkStatus(loja?.id);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [buscaProduto, setBuscaProduto] = useState<string>('');
  const [buscaCodigoBarras, setBuscaCodigoBarras] = useState<string>('');

  const [produtoModalVariacao, setProdutoModalVariacao] = useState<Produto | null>(null);
  const [modalFechamento, setModalFechamento] = useState<boolean>(false);
  const [formaPagamentoEscolhida, setFormaPagamentoEscolhida] = useState<FormaPagamento | null>(null);
  const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<string>('');
  const [parcelasCartao, setParcelasCartao] = useState<number>(1);
  const [finalizandoVenda, setFinalizandoVenda] = useState<boolean>(false);
  const [pedidoConcluido, setPedidoConcluido] = useState<Pedido | null>(null);
  const [ehVendaOfflineSalva, setEhVendaOfflineSalva] = useState<boolean>(false);

  const [modalNovoCliente, setModalNovoCliente] = useState<boolean>(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loja?.id) return;
    const carregarDados = async () => {
      try {
        setCarregando(true);
        // Carregamento Híbrido: sincroniza do Supabase para o IndexedDB e traz os dados
        const dados = await SyncService.baixarDadosParaOffline(loja.id);
        if (dados.produtos) setProdutos(dados.produtos);
        if (dados.clientes) setClientes(dados.clientes);
        if (dados.formasPagamento) {
          setFormasPagamento(dados.formasPagamento);
          if (dados.formasPagamento.length > 0 && !formaPagamentoEscolhida) {
            setFormaPagamentoEscolhida(dados.formasPagamento[0]);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados do PDV:', err);
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [loja?.id]);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buscaCodigoBarras.trim()) return;

    const barcode = buscaCodigoBarras.trim();
    let produtoEncontrado: Produto | null = null;
    let variacaoEncontrada: VariacaoProduto | null = null;

    for (const p of produtos) {
      if (p.codigo_barras === barcode || p.codigo_interno === barcode) {
        produtoEncontrado = p;
        break;
      }
      if (p.variacoes) {
        const v = p.variacoes.find(varItem => varItem.codigo_barras === barcode || varItem.sku === barcode);
        if (v) {
          produtoEncontrado = p;
          variacaoEncontrada = v;
          break;
        }
      }
    }

    if (produtoEncontrado) {
      if (produtoEncontrado.tem_variacoes && !variacaoEncontrada) {
        setProdutoModalVariacao(produtoEncontrado);
      } else {
        adicionarItem(produtoEncontrado, variacaoEncontrada);
      }
      setBuscaCodigoBarras('');
    } else {
      alert(`Produto com código ${barcode} não foi encontrado.`);
    }
  };

  const handleFinalizarVenda = async () => {
    if (!loja?.id || !usuario?.id || itens.length === 0 || !formaPagamentoEscolhida) return;

    const ehFiado = formaPagamentoEscolhida.tipo === 'fiado';
    if (ehFiado && !clienteSelecionado) {
      alert('Para vendas no FIADO / A PRAZO, é obrigatório selecionar um cliente cadastrado.');
      return;
    }

    try {
      setFinalizandoVenda(true);
      setEhVendaOfflineSalva(false);

      const taxaValor = (total * Number(formaPagamentoEscolhida.taxa_percentual || 0)) / 100;
      const valorLiquido = total - taxaValor;
      const dataIso = new Date().toISOString();

      const dadosBasePedido = {
        loja_id: loja.id,
        vendedor_id: usuario.id,
        cliente_id: clienteSelecionado ? clienteSelecionado.id : null,
        origem: 'pdv_desktop' as const,
        tabela_preco_aplicada: tabelaPrecoGlobal,
        status: 'confirmado' as const,
        subtotal,
        valor_desconto: desconto,
        valor_frete: taxaEntrega,
        valor_total: total,
        valor_pago: ehFiado ? 0 : total,
        saldo_devedor: ehFiado ? total : 0,
        fiado_quitado: !ehFiado,
        data_venda: dataIso
      };

      const itensFormatados = itens.map(item => ({
        loja_id: loja.id,
        produto_id: item.produto.id,
        variacao_id: item.variacao ? item.variacao.id : null,
        tabela_preco_utilizada: item.tabelaPrecoUtilizada,
        nome_produto: item.produto.nome,
        rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
        preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
        preco_venda_unitario: item.precoUnitario,
        quantidade: item.quantidade,
        subtotal: item.subtotal,
        observacoes: item.observacoes || null
      }));

      const dadosPagamento = {
        loja_id: loja.id,
        forma_pagamento_id: formaPagamentoEscolhida.id,
        valor: total,
        parcelas: parcelasCartao,
        valor_taxa: taxaValor,
        valor_liquido: valorLiquido,
        data_pagamento: dataIso,
        eh_pagamento_fiado: ehFiado
      };

      // Se estiver online, tenta enviar direto para o Supabase
      if (navigator.onLine) {
        try {
          const { data: pedidoCriado, error: erroPedido } = await supabase
            .from('pedidos')
            .insert([dadosBasePedido])
            .select()
            .single();

          if (erroPedido || !pedidoCriado) throw erroPedido;

          const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoCriado.id }));
          const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
          if (erroItens) throw erroItens;

          await supabase.from('pagamentos_pedido').insert([{
            ...dadosPagamento,
            pedido_id: pedidoCriado.id
          }]);

          const pedidoCompleto: Pedido = {
            ...pedidoCriado,
            cliente: clienteSelecionado,
            vendedor: usuario,
            itens: itensComId as any
          };

          setPedidoConcluido(pedidoCompleto);
          setModalFechamento(false);
          limparCarrinho();
          setValorRecebidoDinheiro('');
          return;
        } catch (nuvemErr) {
          console.warn('Falha no envio para o Supabase, realizando fallback para o banco offline local:', nuvemErr);
          // Continua para o salvamento offline abaixo
        }
      }

      // SALVAMENTO OFFLINE RESILIENTE (IndexedDB)
      const idLocal = 'offline_' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()));
      const numPedidoOffline = Math.floor(100000 + Math.random() * 900000);

      const vendaOffline: VendaOfflineFila = {
        id_local: idLocal,
        ...dadosBasePedido,
        itens: itensFormatados,
        pagamento: dadosPagamento,
        cliente_dados: clienteSelecionado,
        vendedor_dados: usuario,
        criado_em: dataIso,
        tentativas_sync: 0
      };

      await SyncService.registrarVendaOffline(vendaOffline);
      await atualizarContadorPendentes();

      // Abater estoque local em memória para resposta instantânea
      setProdutos(prev => prev.map(p => {
        const itemVendido = itens.find(it => it.produto.id === p.id);
        if (itemVendido) {
          return {
            ...p,
            quantidade_estoque: Math.max(0, (p.quantidade_estoque || 0) - itemVendido.quantidade)
          };
        }
        return p;
      }));

      const pedidoOfflineCompleto: Pedido = {
        id: idLocal,
        numero_pedido: numPedidoOffline,
        ...dadosBasePedido,
        cliente: clienteSelecionado,
        vendedor: usuario,
        itens: itensFormatados.map(it => ({
          ...it,
          id: idLocal + '_' + it.produto_id,
          tabela_preco_utilizada: it.tabela_preco_utilizada as TabelaPreco
        })) as ItemPedido[],
        criado_em: dataIso
      };

      setEhVendaOfflineSalva(true);
      setPedidoConcluido(pedidoOfflineCompleto);
      setModalFechamento(false);
      limparCarrinho();
      setValorRecebidoDinheiro('');
    } catch (err: any) {
      console.error('Erro ao finalizar venda:', err);
      alert(`Erro ao processar venda: ${err.message || 'Tente novamente.'}`);
    } finally {
      setFinalizandoVenda(false);
    }
  };

  const produtosFiltrados = produtos.filter(p => {
    const termo = buscaProduto.toLowerCase();
    return (
      p.nome.toLowerCase().includes(termo) ||
      (p.codigo_interno && p.codigo_interno.toLowerCase().includes(termo)) ||
      (p.codigo_barras && p.codigo_barras.includes(termo))
    );
  });

  const trocoCalculado = Math.max(0, (Number(valorRecebidoDinheiro) || 0) - total);

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-slate-950">
      {/* PAINEL ESQUERDO: CATÁLOGO & BUSCA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-800/80">
        {/* Topo do PDV: Busca, Tabela de Preço e Status de Conexão */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-3">
          {/* Barra de Status de Conexão e Sincronização */}
          <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[11px] border border-emerald-500/30">
                  <Wifi className="w-3 h-3" />
                  <span>Online (Sincronizado)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold text-[11px] border border-amber-500/30">
                  <WifiOff className="w-3 h-3 text-amber-400 animate-pulse" />
                  <span>Modo Offline</span>
                </span>
              )}

              {pendentesCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30">
                  <CloudOff className="w-3 h-3" />
                  <span>{pendentesCount} venda(s) na fila</span>
                </span>
              )}

              {ultimoSyncMsg && (
                <span className="text-[11px] text-emerald-400 font-medium animate-in fade-in">
                  {ultimoSyncMsg}
                </span>
              )}
            </div>

            {isOnline && pendentesCount > 0 && (
              <button
                type="button"
                onClick={sincronizarAgora}
                disabled={sincronizando}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                title="Enviar vendas salvas offline para o Supabase agora"
              >
                <RefreshCw className={`w-3 h-3 ${sincronizando ? 'animate-spin' : ''}`} />
                <span>{sincronizando ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar produto por nome, código..."
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <form onSubmit={handleBarcodeSubmit} className="relative w-full sm:w-60">
              <Barcode className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Código de Barras (Enter)"
                value={buscaCodigoBarras}
                onChange={(e) => setBuscaCodigoBarras(e.target.value)}
                className="w-full bg-slate-800/80 border border-emerald-500/40 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </form>
          </div>

          {/* Seletor Rápido de Tabela de Preço */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-emerald-400" /> Tabela de Preço Ativa:
            </span>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {(['varejo', 'atacado', 'autoatacado'] as TabelaPreco[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setTabelaPrecoGlobal(tab)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                    tabelaPrecoGlobal === tab
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid de Produtos */}
        <div className="flex-1 overflow-y-auto p-3.5">
          {carregando ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando catálogo de produtos...</div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">Nenhum produto encontrado.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {produtosFiltrados.map((produto) => {
                const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
                const temEstoqueBaixo = Number(produto.quantidade_estoque) <= Number(produto.estoque_minimo_alerta);

                let precoExibido = produto.preco_venda_varejo;
                if (tabelaPrecoGlobal === 'atacado' && produto.preco_venda_atacado) precoExibido = produto.preco_venda_atacado;
                if (tabelaPrecoGlobal === 'autoatacado' && produto.preco_venda_autoatacado) precoExibido = produto.preco_venda_autoatacado;

                return (
                  <div
                    key={produto.id}
                    onClick={() => {
                      if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                        setProdutoModalVariacao(produto);
                      } else {
                        adicionarItem(produto);
                      }
                    }}
                    className="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-2.5 cursor-pointer transition-all duration-150 flex flex-col justify-between group shadow-sm active:scale-[0.98]"
                  >
                    <div>
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-950 mb-2">
                        <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                        {temEstoqueBaixo && (
                          <span className="absolute top-1.5 right-1.5 bg-amber-500/90 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow">
                            Estoque {produto.quantidade_estoque}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-xs text-slate-100 line-clamp-2 leading-tight">
                        {produto.nome}
                      </h3>
                      {produto.codigo_interno && (
                        <span className="text-[10px] text-slate-500 block mt-0.5">#{produto.codigo_interno}</span>
                      )}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="font-black text-emerald-400 text-xs sm:text-sm">
                        R$ {Number(precoExibido).toFixed(2)}
                      </span>
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white flex items-center justify-center transition">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PAINEL DIREITO: CARRINHO & TOTAL */}
      <div className="w-full lg:w-[380px] bg-slate-900 flex flex-col h-full border-t lg:border-t-0 lg:border-l border-slate-800">
        {/* Header do Carrinho & Seleção de Cliente */}
        <div className="p-3.5 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <span>Carrinho de Venda</span>
              <span className="text-[11px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                {totalItens} un
              </span>
            </h2>
            {itens.length > 0 && (
              <button onClick={limparCarrinho} className="text-xs text-rose-400 hover:text-rose-300 font-medium">
                Limpar
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <select
                value={clienteSelecionado ? clienteSelecionado.id : ''}
                onChange={(e) => {
                  const cli = clientes.find(c => c.id === e.target.value) || null;
                  setClienteSelecionado(cli);
                }}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="">👤 Cliente Avulso (Balcão)</option>
                {clientes.map(cli => (
                  <option key={cli.id} value={cli.id}>
                    👤 {cli.nome} {Number(cli.saldo_devedor_fiado) > 0 ? `(Devendo R$ ${Number(cli.saldo_devedor_fiado).toFixed(2)})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setModalNovoCliente(true)}
              className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition flex items-center justify-center shrink-0"
              title="Cadastrar Novo Cliente"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* BADGE DA TABELA ATIVA & PROGRESSO NO PDV */}
          {itens.length > 0 && (
            <div className={`p-2.5 rounded-xl border transition text-xs font-bold space-y-1.5 ${
              tabelaPrecoCalculada === 'autoatacado'
                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                : tabelaPrecoCalculada === 'atacado'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}>
              <div className="flex items-center justify-between">
                <span>
                  {tabelaPrecoCalculada === 'autoatacado' ? '⚡ Tabela: Autoatacado' : tabelaPrecoCalculada === 'atacado' ? '🏷️ Tabela: Atacado' : '🛒 Tabela: Varejo'}
                </span>
                {avaliacaoCarrinho.economiaTotal > 0 && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-black">
                    -R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}
                  </span>
                )}
              </div>

              {avaliacaoCarrinho.proximoNivel && (
                <div className="text-[10px] font-normal text-slate-400 pt-1 border-t border-slate-700/50 flex justify-between items-center">
                  <span>
                    Falta R$ {avaliacaoCarrinho.faltaValorParaProximo.toFixed(2)} ou {avaliacaoCarrinho.faltaPecasParaProximo} un p/ {avaliacaoCarrinho.proximoNivel}
                  </span>
                  <span className="font-bold text-amber-300">{avaliacaoCarrinho.progressoGeralPercent}%</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista de Itens do Carrinho */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 space-y-2 py-12">
              <Layers className="w-10 h-10 opacity-30" />
              <p className="text-xs">O carrinho está vazio.<br />Adicione produtos ou bipe o código de barras.</p>
            </div>
          ) : (
            itens.map((item) => {
              const skuFracionado = avaliacaoCarrinho.skusFracionados.find(s => s.id === item.id);

              return (
                <div
                  key={item.id}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-2.5 space-y-1.5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-slate-200 truncate">{item.produto.nome}</h4>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        {item.variacao && (
                          <span className="text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded font-medium">
                            {item.variacao.valor_variacao_1} {item.variacao.valor_variacao_2 || ''}
                          </span>
                        )}
                        <span>R$ {item.precoUnitario.toFixed(2)} / un</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-slate-700 bg-slate-900 rounded-lg overflow-hidden">
                        <button onClick={() => atualizarQuantidade(item.id, item.quantidade - 1)} className="p-1 text-slate-400 hover:text-white">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 text-xs font-bold text-slate-100">{item.quantidade}</span>
                        <button onClick={() => atualizarQuantidade(item.id, item.quantidade + 1)} className="p-1 text-slate-400 hover:text-white">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="font-bold text-xs text-emerald-400 w-16 text-right">
                        R$ {item.subtotal.toFixed(2)}
                      </span>

                      <button onClick={() => removerItem(item.id)} className="text-slate-500 hover:text-rose-400 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {skuFracionado && (
                    <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-[10px] text-amber-300">
                      <span>Mín. {skuFracionado.quantidadeMinimaExigida} un (faltam {skuFracionado.faltamUnidades})</span>
                      <button
                        type="button"
                        onClick={() => atualizarQuantidade(item.id, item.quantidade + skuFracionado.faltamUnidades)}
                        className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 font-bold"
                      >
                        +{skuFracionado.faltamUnidades}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Resumo Financeiro & Botão de Fechamento */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/90 space-y-3">
          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="text-slate-200 font-medium">R$ {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Desconto (R$):</span>
              <input
                type="number"
                step="0.01"
                value={desconto || ''}
                onChange={(e) => setDesconto(Number(e.target.value) || 0)}
                placeholder="0.00"
                className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-right text-xs text-rose-400 font-semibold"
              />
            </div>
            <div className="flex justify-between text-base font-bold text-white pt-1.5 border-t border-slate-800">
              <span>TOTAL A PAGAR:</span>
              <span className="text-emerald-400 text-lg">R$ {total.toFixed(2)}</span>
            </div>
          </div>

          <button
            disabled={itens.length === 0}
            onClick={() => setModalFechamento(true)}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-40"
          >
            <span>Finalizar Venda</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MODAL VARIAÇÕES */}
      {produtoModalVariacao && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-100">{produtoModalVariacao.nome}</h3>
                <span className="text-xs text-slate-400">Selecione a variação desejada:</span>
              </div>
              <button onClick={() => setProdutoModalVariacao(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {produtoModalVariacao.variacoes?.map((variacao) => (
                <button
                  key={variacao.id}
                  onClick={() => {
                    adicionarItem(produtoModalVariacao, variacao);
                    setProdutoModalVariacao(null);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 flex items-center justify-between text-left transition"
                >
                  <div>
                    <span className="font-bold text-xs text-slate-100 block">
                      {variacao.valor_variacao_1} {variacao.valor_variacao_2 ? `- ${variacao.valor_variacao_2}` : ''}
                    </span>
                    <span className="text-[10px] text-slate-400">Estoque: {variacao.quantidade_estoque} un</span>
                  </div>
                  <span className="font-bold text-emerald-400 text-xs">
                    R$ {Number(variacao.preco_venda_varejo).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO DE VENDA */}
      {modalFechamento && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">Pagamento & Fechamento</h3>
              <button onClick={() => setModalFechamento(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
              <span className="text-xs text-slate-400 block font-medium">Valor Total da Venda</span>
              <span className="text-3xl font-black text-emerald-400">R$ {total.toFixed(2)}</span>
            </div>

            {/* Formas de Pagamento */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300 block">Selecione o Meio de Pagamento:</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {formasPagamento.map((fp) => (
                  <button
                    key={fp.id}
                    onClick={() => setFormaPagamentoEscolhida(fp)}
                    className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                      formaPagamentoEscolhida?.id === fp.id
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>{fp.nome}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dinheiro (Cálculo de Troco) */}
            {formaPagamentoEscolhida?.tipo === 'dinheiro' && (
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Valor Entregue pelo Cliente:</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={valorRecebidoDinheiro}
                    onChange={(e) => setValorRecebidoDinheiro(e.target.value)}
                    className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-right text-xs font-bold text-slate-100"
                  />
                </div>
                {Number(valorRecebidoDinheiro) > 0 && (
                  <div className="flex justify-between text-xs font-bold text-amber-400 pt-1 border-t border-slate-800">
                    <span>Troco:</span>
                    <span>R$ {trocoCalculado.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            <button
              disabled={finalizandoVenda}
              onClick={handleFinalizarVenda}
              className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{finalizandoVenda ? 'Processando Venda...' : 'Confirmar e Concluir Venda'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE RECIBO & IMPRESSÃO BLUETOOTH */}
      {pedidoConcluido && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-base text-slate-100">
                {ehVendaOfflineSalva ? 'Venda Salva no Modo Offline!' : 'Venda Concluída com Sucesso!'}
              </h3>
              <p className="text-xs text-slate-400">Pedido #{pedidoConcluido.numero_pedido} registrado no sistema.</p>

              {ehVendaOfflineSalva && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 text-left space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CloudOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Armazenado com segurança localmente</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    O pedido foi gravado no dispositivo e será enviado automaticamente para a nuvem assim que a internet reconectar.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1.5 font-mono text-xs text-slate-300">
              <div className="flex justify-between">
                <span>Total da Venda:</span>
                <span className="font-bold text-emerald-400">R$ {Number(pedidoConcluido.valor_total).toFixed(2)}</span>
              </div>
              {pedidoConcluido.cliente && (
                <div className="flex justify-between text-slate-400">
                  <span>Cliente:</span>
                  <span>{pedidoConcluido.cliente.nome}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  if (loja) PrintService.printBluetoothThermal(pedidoConcluido, loja, '58mm');
                }}
                className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Imprimir 58/80mm</span>
              </button>

              <button
                onClick={() => PrintService.printWindow()}
                className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition"
              >
                <Printer className="w-4 h-4 text-indigo-400" />
                <span>Imprimir A4</span>
              </button>
            </div>

            {pedidoConcluido.cliente?.whatsapp && (
              <button
                onClick={() => {
                  if (loja && pedidoConcluido.cliente?.whatsapp) {
                    const msg = PrintService.generateWhatsAppMessage(pedidoConcluido, loja);
                    PrintService.openWhatsApp(pedidoConcluido.cliente.whatsapp, msg);
                  }
                }}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow transition"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar Recibo por WhatsApp</span>
              </button>
            )}

            <button
              onClick={() => setPedidoConcluido(null)}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition mt-1"
            >
              Nova Venda
            </button>
          </div>
        </div>
      )}

      {/* Modal Novo Cliente */}
      <ModalNovoCliente
        isOpen={modalNovoCliente}
        onClose={() => setModalNovoCliente(false)}
        onClienteCadastrado={(novoCliente) => {
          setClientes(prev => [novoCliente, ...prev]);
          setClienteSelecionado(novoCliente);
        }}
      />
    </div>
  );
};
