import React, { useState, useEffect } from 'react';
import {
  Search,
  Barcode,
  Plus,
  Minus,
  Trash2,
  User,
  CheckCircle2,
  Printer,
  Share2,
  X,
  CreditCard,
  Banknote,
  QrCode,
  Tag,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { Produto, VariacaoProduto, Categoria, Cliente, FormaPagamento, FormaEntrega, TabelaPreco } from '../../types/database';
import { PrintService } from '../../services/printService';
import { audioService } from '../../services/audioService';

export const PosPage: React.FC = () => {
  const { loja, usuario } = useAuth();
  const {
    itens,
    clienteSelecionado,
    tabelaPrecoGlobal,
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

  // Estados locais
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [formasEntrega, setFormasEntrega] = useState<FormaEntrega[]>([]);
  
  const [busca, setBusca] = useState<string>('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('todas');
  const [produtoModalVariacao, setProdutoModalVariacao] = useState<Produto | null>(null);
  
  // Modal de Finalização / Checkout
  const [modalCheckoutAberto, setModalCheckoutAberto] = useState<boolean>(false);
  const [formaPagamentoEscolhida, setFormaPagamentoEscolhida] = useState<FormaPagamento | null>(null);
  const [formaEntregaEscolhida, setFormaEntregaEscolhida] = useState<FormaEntrega | null>(null);
  const [valorRecebido, setValorRecebido] = useState<string>('');
  const [parcelasCartao, setParcelasCartao] = useState<number>(1);
  const [observacaoPedido, setObservacaoPedido] = useState<string>('');
  const [processandoVenda, setProcessandoVenda] = useState<boolean>(false);
  
  // Modal de Recibo Concluído
  const [pedidoConcluido, setPedidoConcluido] = useState<any | null>(null);
  const [drawerCarrinhoMobile, setDrawerCarrinhoMobile] = useState<boolean>(false);

  // Carregar dados da loja
  useEffect(() => {
    if (!loja?.id) return;

    const carregarDados = async () => {
      // 1. Produtos com variações
      const { data: prodData } = await supabase
        .from('produtos')
        .select('*, variacoes:variacoes_produto(*), categoria:categorias(*)')
        .eq('loja_id', loja.id)
        .eq('ativo', true)
        .order('nome');
      if (prodData) setProdutos(prodData as unknown as Produto[]);

      // 2. Categorias
      const { data: catData } = await supabase
        .from('categorias')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('ativo', true)
        .order('ordem_exibicao');
      if (catData) setCategorias(catData);

      // 3. Clientes
      const { data: cliData } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id)
        .order('nome');
      if (cliData) setClientes(cliData);

      // 4. Formas de Pagamento
      const { data: pagData } = await supabase
        .from('formas_pagamento')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('ativo', true);
      if (pagData) {
        setFormasPagamento(pagData);
        if (pagData.length > 0) setFormaPagamentoEscolhida(pagData[0]);
      }

      // 5. Formas de Entrega
      const { data: entData } = await supabase
        .from('formas_entrega')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('ativo', true);
      if (entData) {
        setFormasEntrega(entData);
        if (entData.length > 0) {
          setFormaEntregaEscolhida(entData[0]);
          setTaxaEntrega(Number(entData[0].valor_taxa || 0));
        }
      }
    };

    carregarDados();
  }, [loja?.id]);

  // Filtragem de Produtos
  const produtosFiltrados = produtos.filter((prod) => {
    const matchBusca =
      prod.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (prod.codigo_interno && prod.codigo_interno.toLowerCase().includes(busca.toLowerCase())) ||
      (prod.codigo_barras && prod.codigo_barras.includes(busca));

    const matchCategoria =
      categoriaSelecionada === 'todas' || prod.categoria_id === categoriaSelecionada;

    return matchBusca && matchCategoria;
  });

  // Handler de Leitura de Código de Barras (Enter)
  const handleBarcodeSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && busca.trim()) {
      const match = produtos.find(
        (p) => p.codigo_barras === busca.trim() || p.codigo_interno === busca.trim()
      );
      if (match) {
        if (match.tem_variacoes && match.variacoes && match.variacoes.length > 0) {
          setProdutoModalVariacao(match);
        } else {
          adicionarItem(match);
          setBusca('');
        }
      }
    }
  };

  // Finalizar Venda e Salvar no Supabase
  const handleFinalizarVenda = async () => {
    if (!loja?.id || itens.length === 0) return;
    if (!formaPagamentoEscolhida) {
      alert('Selecione uma forma de pagamento.');
      return;
    }

    try {
      setProcessandoVenda(true);

      const ehFiado = formaPagamentoEscolhida.tipo === 'fiado';
      const valorPagoInicial = ehFiado ? (Number(valorRecebido) || 0) : total;
      const saldoDevedorInicial = ehFiado ? Math.max(0, total - valorPagoInicial) : 0;

      // 1. Criar Registro do Pedido
      const { data: pedidoCriado, error: erroPedido } = await supabase
        .from('pedidos')
        .insert([
          {
            loja_id: loja.id,
            cliente_id: clienteSelecionado?.id || null,
            vendedor_id: usuario?.id || null,
            origem: 'pdv_desktop',
            tabela_preco_aplicada: tabelaPrecoGlobal,
            status: 'confirmado',
            subtotal,
            valor_desconto: desconto,
            valor_frete: taxaEntrega,
            valor_total: total,
            valor_pago: valorPagoInicial,
            saldo_devedor: saldoDevedorInicial,
            fiado_quitado: saldoDevedorInicial === 0,
            endereco_entrega: formaEntregaEscolhida?.nome || 'Retirada no Local',
            observacoes: observacaoPedido,
            data_venda: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (erroPedido || !pedidoCriado) {
        throw erroPedido || new Error('Falha ao registrar pedido.');
      }

      // 2. Inserir Itens do Pedido (dispara o trigger automático de baixa de estoque)
      const itensFormatados = itens.map((item) => ({
        loja_id: loja.id,
        pedido_id: pedidoCriado.id,
        produto_id: item.produto.id,
        variacao_id: item.variacao?.id || null,
        tabela_preco_utilizada: item.tabelaPrecoUtilizada,
        nome_produto: item.produto.nome,
        rotulo_variacao: item.variacao
          ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim()
          : null,
        preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
        preco_venda_unitario: item.precoUnitario,
        quantidade: item.quantidade,
        subtotal: item.subtotal,
        observacoes: item.observacoes || null
      }));

      const { error: erroItens } = await supabase
        .from('itens_pedido')
        .insert(itensFormatados);

      if (erroItens) console.error('Erro ao registrar itens:', erroItens);

      // 3. Registrar Pagamento (se houve valor pago)
      if (valorPagoInicial > 0) {
        const taxaPercentual = Number(formaPagamentoEscolhida.taxa_percentual) || 0;
        const valorTaxa = (valorPagoInicial * taxaPercentual) / 100;
        const valorLiquido = valorPagoInicial - valorTaxa;

        await supabase.from('pagamentos_pedido').insert([
          {
            loja_id: loja.id,
            pedido_id: pedidoCriado.id,
            forma_pagamento_id: formaPagamentoEscolhida.id,
            valor: valorPagoInicial,
            parcelas: parcelasCartao,
            valor_taxa: valorTaxa,
            valor_liquido: valorLiquido,
            eh_pagamento_fiado: false
          }
        ]);
      }

      // Obter pedido completo para recibo
      const pedidoFormatado = {
        ...pedidoCriado,
        cliente: clienteSelecionado,
        itens: itensFormatados
      };

      setPedidoConcluido(pedidoFormatado);
      setModalCheckoutAberto(false);
      limparCarrinho();
      audioService.playNewOrderSound();
    } catch (err: any) {
      console.error('Erro ao finalizar venda:', err);
      alert(`Erro ao processar venda: ${err.message || 'Tente novamente.'}`);
    } finally {
      setProcessandoVenda(false);
    }
  };

  const trocoCalculado = Math.max(0, (Number(valorRecebido) || 0) - total);

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-slate-950">
      {/* COLUNA ESQUERDA: CATÁLOGO DE PRODUTOS */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-800/80">
        {/* BARRA SUPERIOR: BUSCA & SELEÇÃO DE TABELA DE PREÇO */}
        <div className="p-3 md:p-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-3">
          <div className="flex items-center gap-3">
            {/* Campo de Busca */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por nome, código ou ler código de barras..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={handleBarcodeSearch}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-10 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
              <Barcode className="w-5 h-5 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Seletor Rápido de Tabela de Preço */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700/60 text-xs">
              <Tag className="w-3.5 h-3.5 text-emerald-400 ml-1.5" />
              {(['varejo', 'atacado', 'autoatacado'] as TabelaPreco[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setTabelaPrecoGlobal(tab)}
                  className={`px-2.5 py-1 rounded-lg capitalize font-medium transition ${
                    tabelaPrecoGlobal === tab
                      ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Categorias (Pills Horizontais) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setCategoriaSelecionada('todas')}
              className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium transition ${
                categoriaSelecionada === 'todas'
                  ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos os Produtos
            </button>
            {categorias.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoriaSelecionada(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium transition ${
                  categoriaSelecionada === cat.id
                    ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.nome}
              </button>
            ))}
          </div>
        </div>

        {/* GRID DE PRODUTOS */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {produtosFiltrados.map((produto) => {
            const hasPromo = produto.promocao_ativa && produto.preco_promocional;
            const precoExibicao =
              tabelaPrecoGlobal === 'autoatacado' && produto.preco_venda_autoatacado
                ? produto.preco_venda_autoatacado
                : tabelaPrecoGlobal === 'atacado' && produto.preco_venda_atacado
                ? produto.preco_venda_atacado
                : hasPromo
                ? produto.preco_promocional
                : produto.preco_venda_varejo;

            const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';

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
                className="group relative bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800/80 hover:border-emerald-500/50 rounded-2xl p-2.5 flex flex-col justify-between cursor-pointer transition-all duration-200 shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 select-none"
              >
                <div>
                  {/* Foto do Produto */}
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-950 mb-2">
                    <img
                      src={fotoUrl}
                      alt={produto.nome}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {hasPromo && (
                      <span className="absolute top-2 left-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        PROMO
                      </span>
                    )}
                    {produto.tem_variacoes && (
                      <span className="absolute bottom-2 left-2 bg-slate-900/90 backdrop-blur text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                        Variações
                      </span>
                    )}
                  </div>

                  {/* Detalhes */}
                  <h3 className="font-semibold text-xs text-slate-100 line-clamp-2 leading-snug">
                    {produto.nome}
                  </h3>
                  {produto.codigo_interno && (
                    <span className="text-[10px] text-slate-500 block">#{produto.codigo_interno}</span>
                  )}
                </div>

                {/* Preços e Ação */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                  <div>
                    {hasPromo && tabelaPrecoGlobal === 'varejo' && (
                      <span className="text-[10px] text-slate-500 line-through block leading-none">
                        R$ {Number(produto.preco_venda_varejo).toFixed(2)}
                      </span>
                    )}
                    <span className="font-bold text-emerald-400 text-sm">
                      R$ {Number(precoExibicao).toFixed(2)}
                    </span>
                  </div>

                  <button
                    className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition shadow-sm"
                    title="Adicionar ao carrinho"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* COLUNA DIREITA (DESKTOP) / DRAWER (MOBILE): CARRINHO PDV */}
      <div className="hidden lg:flex flex-col w-96 bg-slate-900 border-l border-slate-800 h-full">
        {/* Header do Carrinho & Seleção de Cliente */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-slate-100 flex items-center gap-2">
              <span>Pedido Atual</span>
              <span className="text-xs font-normal text-slate-400">({totalItens} itens)</span>
            </h2>
            {itens.length > 0 && (
              <button
                onClick={limparCarrinho}
                className="text-xs text-rose-400 hover:text-rose-300 transition"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Selecionar Cliente com Saldo de Fiado */}
          <div className="relative">
            <select
              value={clienteSelecionado?.id || ''}
              onChange={(e) => {
                const cli = clientes.find((c) => c.id === e.target.value) || null;
                setClienteSelecionado(cli);
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition"
            >
              <option value="">👤 Cliente Avulso / Balcão</option>
              {clientes.map((cli) => (
                <option key={cli.id} value={cli.id}>
                  {cli.nome} {cli.saldo_devedor_fiado > 0 ? `(Devendo R$ ${Number(cli.saldo_devedor_fiado).toFixed(2)})` : ''}
                </option>
              ))}
            </select>
          </div>

          {clienteSelecionado && Number(clienteSelecionado.saldo_devedor_fiado) > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Fiado acumulado:</span>
              </div>
              <span className="font-bold">R$ {Number(clienteSelecionado.saldo_devedor_fiado).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Lista de Itens do Carrinho */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {itens.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mb-3">
                <Search className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-300">Carrinho Vazio</p>
              <p className="text-xs text-slate-500 mt-1">
                Toque nos produtos ao lado ou leia o código de barras para iniciar a venda.
              </p>
            </div>
          ) : (
            itens.map((item) => (
              <div
                key={item.id}
                className="bg-slate-800/60 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-slate-100 truncate">
                    {item.produto.nome}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.variacao && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        {item.variacao.valor_variacao_1} {item.variacao.valor_variacao_2 || ''}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                      R$ {item.precoUnitario.toFixed(2)}
                    </span>
                    {item.tabelaPrecoUtilizada !== 'varejo' && (
                      <span className="text-[10px] uppercase font-bold text-indigo-400">
                        ({item.tabelaPrecoUtilizada})
                      </span>
                    )}
                  </div>
                </div>

                {/* Controles de Quantidade */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-slate-700 bg-slate-900 rounded-lg overflow-hidden">
                    <button
                      onClick={() => atualizarQuantidade(item.id, item.quantidade - 1)}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 text-xs font-bold text-slate-100 min-w-[24px] text-center">
                      {item.quantidade}
                    </span>
                    <button
                      onClick={() => atualizarQuantidade(item.id, item.quantidade + 1)}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => removerItem(item.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Resumo Financeiro & Botão de Pagamento */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-3">
          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-200">R$ {subtotal.toFixed(2)}</span>
            </div>
            {desconto > 0 && (
              <div className="flex justify-between text-rose-400">
                <span>Desconto:</span>
                <span>- R$ {desconto.toFixed(2)}</span>
              </div>
            )}
            {taxaEntrega > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Taxa de Entrega:</span>
                <span>+ R$ {taxaEntrega.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-slate-800">
              <span>Total a Pagar:</span>
              <span className="text-emerald-400 text-lg">R$ {total.toFixed(2)}</span>
            </div>
          </div>

          <button
            disabled={itens.length === 0}
            onClick={() => setModalCheckoutAberto(true)}
            className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-white shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition"
          >
            <span>Ir para Pagamento</span>
            <span>(R$ {total.toFixed(2)})</span>
          </button>
        </div>
      </div>

      {/* BARRA FLUTUANTE MOBILE (CARRINHO) */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 p-3 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex items-center justify-between z-20">
        <div>
          <span className="text-xs text-slate-400 block">{totalItens} itens no pedido</span>
          <span className="font-bold text-emerald-400 text-base">R$ {total.toFixed(2)}</span>
        </div>

        <button
          disabled={itens.length === 0}
          onClick={() => setModalCheckoutAberto(true)}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-md shadow-emerald-500/20 disabled:opacity-50"
        >
          Finalizar Venda
        </button>
      </div>

      {/* MODAL SELEÇÃO DE VARIAÇÃO */}
      {produtoModalVariacao && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-100 text-base">{produtoModalVariacao.nome}</h3>
                <p className="text-xs text-slate-400">Selecione a opção desejada:</p>
              </div>
              <button
                onClick={() => setProdutoModalVariacao(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
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
                    <span className="font-semibold text-sm text-slate-100 block">
                      {variacao.valor_variacao_1} {variacao.valor_variacao_2 ? `- ${variacao.valor_variacao_2}` : ''}
                    </span>
                    <span className="text-xs text-slate-400">
                      Estoque: {variacao.quantidade_estoque} un
                    </span>
                  </div>
                  <span className="font-bold text-emerald-400 text-sm">
                    R$ {Number(variacao.preco_venda_varejo).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CHECKOUT / PAGAMENTO */}
      {modalCheckoutAberto && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-100">Fechamento do Pedido</h3>
                <span className="text-xs text-slate-400">Total a pagar: </span>
                <span className="text-sm font-bold text-emerald-400">R$ {total.toFixed(2)}</span>
              </div>
              <button
                onClick={() => setModalCheckoutAberto(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selecionar Meio de Pagamento */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">Forma de Pagamento</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {formasPagamento.map((fp) => (
                  <button
                    key={fp.id}
                    onClick={() => setFormaPagamentoEscolhida(fp)}
                    className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition ${
                      formaPagamentoEscolhida?.id === fp.id
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow'
                        : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {fp.tipo === 'dinheiro' && <Banknote className="w-5 h-5" />}
                    {fp.tipo === 'pix' && <QrCode className="w-5 h-5" />}
                    {(fp.tipo === 'cartao_credito' || fp.tipo === 'cartao_debito') && <CreditCard className="w-5 h-5" />}
                    {fp.tipo === 'fiado' && <User className="w-5 h-5" />}
                    <span>{fp.nome}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Se Dinheiro: Campo Valor Recebido e Troco */}
            {formaPagamentoEscolhida?.tipo === 'dinheiro' && (
              <div className="bg-slate-800/50 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-medium">Valor Recebido do Cliente:</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 50.00"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                    className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-right font-bold text-sm text-emerald-400"
                  />
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/50">
                  <span className="text-slate-400 font-medium">Troco a Devolver:</span>
                  <span className="font-bold text-amber-400 text-sm">
                    R$ {trocoCalculado.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Se Cartão Crédito: Parcelamento */}
            {formaPagamentoEscolhida?.tipo === 'cartao_credito' && (
              <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-800">
                <label className="text-xs text-slate-300 font-medium">Número de Parcelas:</label>
                <select
                  value={parcelasCartao}
                  onChange={(e) => setParcelasCartao(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                >
                  {[1, 2, 3, 4, 5, 6, 10, 12].map((p) => (
                    <option key={p} value={p}>
                      {p}x de R$ {(total / p).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Observações do Pedido */}
            <div>
              <input
                type="text"
                placeholder="Observações do pedido (ex: embalar para presente)..."
                value={observacaoPedido}
                onChange={(e) => setObservacaoPedido(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200"
              />
            </div>

            {/* Botão de Confirmação */}
            <button
              disabled={processandoVenda}
              onClick={handleFinalizarVenda}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {processandoVenda ? (
                <span>Gravando no Banco...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Confirmar e Emitir Recibo (R$ {total.toFixed(2)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE RECIBO CONCLUÍDO COM BOTÕES DE IMPRESSÃO */}
      {pedidoConcluido && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in zoom-in-95">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-extrabold text-xl text-slate-100">Venda Concluída!</h3>
              <p className="text-xs text-slate-400 mt-0.5">Pedido #{pedidoConcluido.numero_pedido || 'OK'} registrado com sucesso.</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left font-mono text-xs space-y-1.5">
              <p className="font-bold text-center text-slate-200">{loja?.nome_fantasia}</p>
              <div className="border-b border-slate-800 my-1"></div>
              <p className="text-slate-400">Total: <span className="font-bold text-emerald-400">R$ {Number(pedidoConcluido.valor_total).toFixed(2)}</span></p>
              <p className="text-slate-400">Data: {new Date().toLocaleString('pt-BR')}</p>
            </div>

            {/* Ações de Impressão e Compartilhamento */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  if (loja) PrintService.printBluetoothThermal(pedidoConcluido, loja, '58mm');
                }}
                className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Térmica (58/80mm)</span>
              </button>

              <button
                onClick={() => PrintService.printWindow()}
                className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700"
              >
                <Printer className="w-4 h-4 text-indigo-400" />
                <span>Imprimir A4</span>
              </button>
            </div>

            {pedidoConcluido.cliente?.whatsapp && (
              <button
                onClick={() => {
                  if (loja) {
                    const msg = PrintService.generateWhatsAppMessage(pedidoConcluido, loja);
                    PrintService.openWhatsApp(pedidoConcluido.cliente.whatsapp, msg);
                  }
                }}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar Recibo por WhatsApp</span>
              </button>
            )}

            <button
              onClick={() => setPedidoConcluido(null)}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
            >
              Nova Venda
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
