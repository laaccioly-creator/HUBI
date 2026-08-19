import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Share2,
  X,
  Tag,
  Zap,
  AlertTriangle,
  CheckCircle2,
  TrendingUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Loja, Produto, VariacaoProduto, Categoria, FormaEntrega } from '../types';
import {
  obterRegrasPrecificacao,
  avaliarNivelCarrinho,
  calcularPrecoUnitarioPorTabela
} from '../services/pricingEngine';

interface ItemCarrinhoPublico {
  id: string;
  produto: Produto;
  variacao?: VariacaoProduto | null;
  quantidade: number;
}

export const CatalogoPublico: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loja, setLoja] = useState<Loja | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [formasEntrega, setFormasEntrega] = useState<FormaEntrega[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);

  const [busca, setBusca] = useState<string>('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('todas');
  const [carrinho, setCarrinho] = useState<ItemCarrinhoPublico[]>([]);
  const [drawerCarrinhoAberto, setDrawerCarrinhoAberto] = useState<boolean>(false);
  const [produtoModalVariacao, setProdutoModalVariacao] = useState<Produto | null>(null);

  const [nomeCliente, setNomeCliente] = useState<string>('');
  const [whatsappCliente, setWhatsappCliente] = useState<string>('');
  const [enderecoEntrega, setEnderecoEntrega] = useState<string>('');
  const [formaEntregaEscolhida, setFormaEntregaEscolhida] = useState<FormaEntrega | null>(null);
  const [observacoes, setObservacoes] = useState<string>('');
  const [enviandoPedido, setEnviandoPedido] = useState<boolean>(false);

  useEffect(() => {
    const carregarCatalogo = async () => {
      try {
        setCarregando(true);
        let query = supabase.from('lojas').select('*');
        if (slug) {
          query = query.eq('slug_catalogo', slug);
        }
        const { data: lojas } = await query.limit(1);

        if (lojas && lojas.length > 0) {
          const l = lojas[0];
          setLoja(l);

          const { data: prods } = await supabase
            .from('produtos')
            .select('*, variacoes:variacoes_produto(*)')
            .eq('loja_id', l.id)
            .eq('exibir_catalogo', true)
            .eq('ativo', true);
          if (prods) setProdutos(prods as unknown as Produto[]);

          const { data: cats } = await supabase
            .from('categorias')
            .select('*')
            .eq('loja_id', l.id)
            .eq('ativo', true)
            .order('ordem_exibicao');
          if (cats) setCategorias(cats);

          const { data: fretes } = await supabase
            .from('formas_entrega')
            .select('*')
            .eq('loja_id', l.id)
            .eq('ativo', true);
          if (fretes) {
            setFormasEntrega(fretes);
            if (fretes.length > 0) setFormaEntregaEscolhida(fretes[0]);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar catálogo:', err);
      } finally {
        setCarregando(false);
      }
    };

    carregarCatalogo();
  }, [slug]);

  // Carregar e Avaliar Regras de Precificação em Tempo Real
  const regrasAtivas = useMemo(() => obterRegrasPrecificacao(loja), [loja]);

  const avaliacaoCarrinho = useMemo(() => {
    return avaliarNivelCarrinho(carrinho, regrasAtivas);
  }, [carrinho, regrasAtivas]);

  const totalItens = avaliacaoCarrinho.totalPecas;
  const subtotal = avaliacaoCarrinho.totalFinal;
  const valorFrete = Number(formaEntregaEscolhida?.valor_taxa || 0);
  const total = subtotal + valorFrete;

  const adicionarAoCarrinho = (produto: Produto, variacao?: VariacaoProduto | null, quantidade: number = 1) => {
    const key = variacao ? `${produto.id}-${variacao.id}` : `${produto.id}`;
    
    setCarrinho(prev => {
      const idx = prev.findIndex(i => i.id === key);
      if (idx >= 0) {
        const cp = [...prev];
        cp[idx] = {
          ...cp[idx],
          quantidade: cp[idx].quantidade + quantidade
        };
        return cp;
      } else {
        return [
          ...prev,
          {
            id: key,
            produto,
            variacao,
            quantidade
          }
        ];
      }
    });
  };

  const atualizarQtdCarrinho = (index: number, novaQtd: number) => {
    if (novaQtd <= 0) {
      setCarrinho(prev => prev.filter((_, i) => i !== index));
      return;
    }
    setCarrinho(prev => {
      const cp = [...prev];
      cp[index] = {
        ...cp[index],
        quantidade: novaQtd
      };
      return cp;
    });
  };

  const handleEnviarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || carrinho.length === 0 || !nomeCliente.trim() || !whatsappCliente.trim()) {
      alert('Por favor, informe seu nome e WhatsApp para finalizar o pedido.');
      return;
    }

    try {
      setEnviandoPedido(true);

      const { data: pedidoCriado, error: erroPedido } = await supabase
        .from('pedidos')
        .insert([
          {
            loja_id: loja.id,
            origem: 'catalogo_online',
            status: 'pendente',
            tabela_preco_aplicada: avaliacaoCarrinho.tabelaAtiva,
            subtotal,
            valor_frete: valorFrete,
            valor_total: total,
            saldo_devedor: total,
            endereco_entrega: `${formaEntregaEscolhida?.nome || 'Entrega'} - ${enderecoEntrega || 'Retirada'}`,
            observacoes: `Cliente: ${nomeCliente} (${whatsappCliente}). ${observacoes ? `Obs: ${observacoes}` : ''}`,
            data_venda: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (erroPedido || !pedidoCriado) throw erroPedido;

      const itensFormatados = carrinho.map(item => {
        const precoUnitario = calcularPrecoUnitarioPorTabela(
          item.produto,
          item.variacao,
          avaliacaoCarrinho.tabelaAtiva,
          avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? regrasAtivas.descontoAutoatacado : regrasAtivas.descontoAtacado
        );
        return {
          loja_id: loja.id,
          pedido_id: pedidoCriado.id,
          produto_id: item.produto.id,
          variacao_id: item.variacao?.id || null,
          tabela_preco_utilizada: avaliacaoCarrinho.tabelaAtiva,
          nome_produto: item.produto.nome,
          rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
          preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
          preco_venda_unitario: precoUnitario,
          quantidade: item.quantidade,
          subtotal: precoUnitario * item.quantidade
        };
      });

      await supabase.from('itens_pedido').insert(itensFormatados);

      const itensMsg = carrinho
        .map(i => {
          const precoUnitario = calcularPrecoUnitarioPorTabela(
            i.produto,
            i.variacao,
            avaliacaoCarrinho.tabelaAtiva,
            avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? regrasAtivas.descontoAutoatacado : regrasAtivas.descontoAtacado
          );
          const subtotalItem = precoUnitario * i.quantidade;
          return `▫️ *${i.quantidade}x* ${i.produto.nome} ${i.variacao ? `(${i.variacao.valor_variacao_1})` : ''} - R$ ${subtotalItem.toFixed(2)}`;
        })
        .join('\n');

      const tabelaTexto =
        avaliacaoCarrinho.tabelaAtiva === 'autoatacado'
          ? '⚡ Autoatacado (Distribuidor)'
          : avaliacaoCarrinho.tabelaAtiva === 'atacado'
          ? '🏷️ Atacado'
          : '🛒 Varejo';

      const msgWhatsApp = `🛍️ *NOVO PEDIDO ONLINE #${pedidoCriado.numero_pedido}*

Olá, ${loja.nome_fantasia}! Gostaria de confirmar meu pedido feito pelo catálogo online:

${itensMsg}

━━━━━━━━━━━━━━━━━━━━
🏷️ *Tabela Aplicada:* ${tabelaTexto}
${avaliacaoCarrinho.economiaTotal > 0 ? `💰 *Economia Obtida:* R$ ${avaliacaoCarrinho.economiaTotal.toFixed(2)}\n` : ''}💰 *Subtotal:* R$ ${subtotal.toFixed(2)}
🛵 *Entrega:* ${formaEntregaEscolhida?.nome || 'A combinar'} (+ R$ ${valorFrete.toFixed(2)})
💵 *TOTAL A PAGAR:* R$ ${total.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
👤 *Nome:* ${nomeCliente}
📱 *WhatsApp:* ${whatsappCliente}
📍 *Endereço:* ${enderecoEntrega || 'Retirada no Balcão'}
${observacoes ? `📝 *Observação:* ${observacoes}\n` : ''}
Fico no aguardo da confirmação! ✨`;

      const lojaPhone = loja.whatsapp.replace(/\D/g, '');
      const urlWhats = `https://api.whatsapp.com/send?phone=55${lojaPhone}&text=${encodeURIComponent(msgWhatsApp)}`;
      
      setCarrinho([]);
      setDrawerCarrinhoAberto(false);
      window.location.href = urlWhats;
    } catch (err: any) {
      console.error('Erro ao enviar pedido:', err);
      alert(`Erro ao finalizar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setEnviandoPedido(false);
    }
  };

  const produtosFiltrados = produtos.filter(p => {
    const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoriaSelecionada === 'todas' || p.categoria_id === categoriaSelecionada;
    return matchBusca && matchCat;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-emerald-400 flex items-center justify-center font-bold text-white shadow text-base">
            {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-slate-100 leading-tight">
              {loja?.nome_fantasia || 'Catálogo Online'}
            </h1>
            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Aberto para pedidos
            </span>
          </div>
        </div>

        <button
          onClick={() => setDrawerCarrinhoAberto(true)}
          className="relative px-3.5 py-2 rounded-xl bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25"
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="hidden sm:inline">Carrinho</span>
          {totalItens > 0 && (
            <span className="bg-white text-slate-950 text-[11px] font-black px-1.5 py-0.2 rounded-full">
              {totalItens}
            </span>
          )}
        </button>
      </header>

      {loja?.sobre_loja && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 p-4 border-b border-slate-800/80 text-center">
          <p className="text-xs text-slate-300 max-w-xl mx-auto italic">
            "{loja.sobre_loja}"
          </p>
        </div>
      )}

      <div className="max-w-6xl mx-auto w-full p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="O que você está procurando hoje?"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCategoriaSelecionada('todas')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              categoriaSelecionada === 'todas'
                ? 'bg-emerald-500 text-white shadow'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Todos
          </button>
          {categorias.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoriaSelecionada(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                categoriaSelecionada === cat.id
                  ? 'bg-emerald-500 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat.nome}
            </button>
          ))}
        </div>

        {carregando ? (
          <div className="text-center py-20 text-slate-500 text-sm">Carregando catálogo...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm">Nenhum produto disponível no momento.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pt-2">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between shadow-sm hover:border-emerald-500/40 transition group"
                >
                  <div>
                    <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-950 mb-2.5">
                      <img
                        src={fotoUrl}
                        alt={produto.nome}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      {produto.promocao_ativa && produto.preco_promocional && (
                        <span className="absolute top-2 left-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                          OFERTA
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-xs text-slate-100 line-clamp-2 leading-snug">
                      {produto.nome}
                    </h3>

                    {produto.preco_venda_atacado && (
                      <span className="text-[10px] text-indigo-400 block mt-1">
                        A partir de {produto.qtd_minima_atacado} un: <b>R$ {Number(produto.preco_venda_atacado).toFixed(2)}</b>
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <div>
                      {produto.promocao_ativa && produto.preco_promocional && (
                        <span className="text-[10px] text-slate-500 line-through block leading-none">
                          R$ {Number(produto.preco_venda_varejo).toFixed(2)}
                        </span>
                      )}
                      <span className="font-black text-emerald-400 text-sm">
                        R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                          setProdutoModalVariacao(produto);
                        } else {
                          adicionarAoCarrinho(produto);
                        }
                      }}
                      className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition shadow-sm font-bold"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {produtoModalVariacao && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-100">{produtoModalVariacao.nome}</h3>
              <button onClick={() => setProdutoModalVariacao(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {produtoModalVariacao.variacoes?.map((variacao) => (
                <button
                  key={variacao.id}
                  onClick={() => {
                    adicionarAoCarrinho(produtoModalVariacao, variacao);
                    setProdutoModalVariacao(null);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 flex items-center justify-between text-left transition"
                >
                  <span className="font-bold text-xs text-slate-100">
                    {variacao.valor_variacao_1} {variacao.valor_variacao_2 ? `- ${variacao.valor_variacao_2}` : ''}
                  </span>
                  <span className="font-bold text-emerald-400 text-xs">
                    R$ {Number(variacao.preco_venda_varejo).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {drawerCarrinhoAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-end z-50 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
                <span>Seu Pedido ({totalItens} itens)</span>
              </h3>
              <button onClick={() => setDrawerCarrinhoAberto(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DESTAQUE DA TABELA ATIVA & BARRA DE PROGRESSO */}
            {carrinho.length > 0 && (
              <div className="p-3.5 mx-4 mt-3 rounded-2xl border transition-all space-y-2.5 bg-slate-900 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm">
                    {avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? (
                      <div className="flex items-center gap-1.5 text-amber-300">
                        <Zap className="w-4 h-4 fill-amber-300 text-amber-300 animate-pulse" />
                        <span className="bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">
                          ⚡ Tabela Ativa: Autoatacado
                        </span>
                      </div>
                    ) : avaliacaoCarrinho.tabelaAtiva === 'atacado' ? (
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <Tag className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">
                          🏷️ Tabela Ativa: Atacado
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <ShoppingBag className="w-4 h-4 text-slate-400" />
                        <span>🛒 Tabela Ativa: Varejo</span>
                      </div>
                    )}
                  </div>

                  {avaliacaoCarrinho.economiaTotal > 0 && (
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500 text-white shadow shadow-emerald-500/30 whitespace-nowrap">
                      Economia de R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* BARRA DE PROGRESSO DINÂMICA & MENSAGEM DE UPSELL */}
                {avaliacaoCarrinho.proximoNivel && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 leading-tight">
                        Faltam <b className="text-emerald-400">R$ {avaliacaoCarrinho.faltaValorParaProximo.toFixed(2)}</b> ou <b className="text-emerald-400">{avaliacaoCarrinho.faltaPecasParaProximo} peças</b> para {avaliacaoCarrinho.proximoNivel === 'autoatacado' ? 'Autoatacado' : 'Atacado'}!
                      </span>
                      <span className="text-[10px] font-bold text-amber-300 ml-2">
                        {avaliacaoCarrinho.progressoGeralPercent}%
                      </span>
                    </div>

                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${avaliacaoCarrinho.progressoGeralPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {avaliacaoCarrinho.tabelaAtiva === 'autoatacado' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-semibold pt-1 border-t border-slate-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Nível Máximo! Você conquistou o preço de Autoatacado (Distribuidor).</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {carrinho.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm">Seu carrinho está vazio.</div>
              ) : (
                carrinho.map((item, idx) => {
                  const precoVarejoItem = Number(item.variacao ? item.variacao.preco_venda_varejo : item.produto.preco_venda_varejo) || 0;
                  const precoUnitarioAtivo = calcularPrecoUnitarioPorTabela(
                    item.produto,
                    item.variacao,
                    avaliacaoCarrinho.tabelaAtiva,
                    avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? regrasAtivas.descontoAutoatacado : regrasAtivas.descontoAtacado
                  );
                  const subtotalItem = precoUnitarioAtivo * item.quantidade;
                  const itemKey = item.variacao ? `${item.produto.id}-${item.variacao.id}` : `${item.produto.id}`;
                  const skuFracionado = avaliacaoCarrinho.skusFracionados.find(s => s.id === itemKey);

                  return (
                    <div key={idx} className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-xs text-slate-100 truncate">{item.produto.nome}</h4>
                          {item.variacao && (
                            <span className="text-[10px] text-slate-400 block">
                              {item.variacao.valor_variacao_1} {item.variacao.valor_variacao_2 ? `- ${item.variacao.valor_variacao_2}` : ''}
                            </span>
                          )}
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            {precoUnitarioAtivo < precoVarejoItem && (
                              <span className="text-[10px] text-slate-500 line-through">
                                R$ {(precoVarejoItem * item.quantidade).toFixed(2)}
                              </span>
                            )}
                            <span className="text-xs font-bold text-emerald-400">
                              R$ {subtotalItem.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              (R$ {precoUnitarioAtivo.toFixed(2)}/un)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center border border-slate-700 bg-slate-900 rounded-lg overflow-hidden shrink-0">
                          <button onClick={() => atualizarQtdCarrinho(idx, item.quantidade - 1)} className="p-1 text-slate-400 hover:text-white">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-xs font-bold text-slate-100 min-w-[20px] text-center">{item.quantidade}</span>
                          <button onClick={() => atualizarQtdCarrinho(idx, item.quantidade + 1)} className="p-1 text-slate-400 hover:text-white">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* ALERTA DE SKU FRACIONADO */}
                      {skuFracionado && (
                        <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 text-[10px] text-amber-300">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">
                              Aumente este item para <b>{skuFracionado.quantidadeMinimaExigida} un</b> para liberar {avaliacaoCarrinho.proximoNivel === 'autoatacado' ? 'autoatacado' : 'atacado'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => atualizarQtdCarrinho(idx, item.quantidade + skuFracionado.faltamUnidades)}
                            className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 font-black text-[10px] transition shrink-0 cursor-pointer shadow"
                          >
                            +{skuFracionado.faltamUnidades} un
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {carrinho.length > 0 && (
                <form id="formCheckout" onSubmit={handleEnviarPedido} className="pt-4 border-t border-slate-800 space-y-3">
                  <span className="text-xs font-bold text-slate-200 block">Dados para Entrega & Contato</span>

                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Seu Nome Completo *"
                      value={nomeCliente}
                      onChange={(e) => setNomeCliente(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <input
                      type="tel"
                      required
                      placeholder="Seu WhatsApp com DDD *"
                      value={whatsappCliente}
                      onChange={(e) => setWhatsappCliente(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>

                  {formasEntrega.length > 0 && (
                    <div>
                      <select
                        value={formaEntregaEscolhida?.id || ''}
                        onChange={(e) => {
                          const f = formasEntrega.find(fe => fe.id === e.target.value) || null;
                          setFormaEntregaEscolhida(f);
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                      >
                        {formasEntrega.map(fe => (
                          <option key={fe.id} value={fe.id}>
                            {fe.nome} (+ R$ {Number(fe.valor_taxa).toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <input
                      type="text"
                      placeholder="Endereço Completo (Rua, Número, Bairro)..."
                      value={enderecoEntrega}
                      onChange={(e) => setEnderecoEntrega(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder="Observações do pedido (opcional)..."
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>
                </form>
              )}
            </div>

            {carrinho.length > 0 && (
              <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-3">
                <div className="space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="text-slate-200 font-semibold">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  {avaliacaoCarrinho.economiaTotal > 0 && (
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>Desconto Aplicado ({avaliacaoCarrinho.tabelaAtiva}):</span>
                      <span>- R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {valorFrete > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Taxa de Entrega:</span>
                      <span>+ R$ {valorFrete.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-white pt-1.5 border-t border-slate-800">
                    <span>Total do Pedido:</span>
                    <span className="text-emerald-400 text-lg">R$ {total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  form="formCheckout"
                  disabled={enviandoPedido}
                  className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  <Share2 className="w-5 h-5" />
                  <span>{enviandoPedido ? 'Enviando...' : 'Enviar Pedido para WhatsApp'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
