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
import { Loja, Produto, VariacaoProduto, Categoria, FormaEntrega, ModoExibicaoCatalogo, Cupom } from '../types';
import {
  obterRegrasPrecificacao,
  avaliarNivelCarrinho,
  calcularPrecoUnitarioPorTabela
} from '../services/pricingEngine';
import { LayoutGrid, List, Smartphone, Info, Copy, QrCode, ExternalLink, Ticket, Check, Loader2 } from 'lucide-react';
import { paymentGatewayService, PixDinamicoResponse } from '../services/paymentGatewayService';
import { CupomService } from '../services/cupomService';

interface ItemCarrinhoPublico {
  id: string;
  produto: Produto;
  variacao?: VariacaoProduto | null;
  quantidade: number;
}

interface PedidoConcluidoInfo {
  numeroPedido: number;
  whatsAppUrl: string;
  pixInfo?: PixDinamicoResponse | null;
  linkPagamento?: string | null;
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

  // Modo de exibição
  const [modoExibicaoPublico, setModoExibicaoPublico] = useState<ModoExibicaoCatalogo>('grade');
  const [pedidoConcluidoModal, setPedidoConcluidoModal] = useState<PedidoConcluidoInfo | null>(null);
  const [pixCopiado, setPixCopiado] = useState<boolean>(false);

  const [nomeCliente, setNomeCliente] = useState<string>('');
  const [whatsappCliente, setWhatsappCliente] = useState<string>('');
  const [enderecoEntrega, setEnderecoEntrega] = useState<string>('');
  const [formaEntregaEscolhida, setFormaEntregaEscolhida] = useState<FormaEntrega | null>(null);
  const [observacoes, setObservacoes] = useState<string>('');
  const [enviandoPedido, setEnviandoPedido] = useState<boolean>(false);

  // Estados de Cupom de Desconto
  const [codigoCupomInput, setCodigoCupomInput] = useState<string>('');
  const [cupomAplicado, setCupomAplicado] = useState<Cupom | null>(null);
  const [descontoCupom, setDescontoCupom] = useState<number>(0);
  const [freteGratisCupom, setFreteGratisCupom] = useState<boolean>(false);
  const [validandoCupom, setValidandoCupom] = useState<boolean>(false);
  const [mensagemCupom, setMensagemCupom] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

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

          // Configuração de exibição inicial
          const catConfig = l.configuracoes_extras?.catalogo;
          if (catConfig?.modo_exibicao) {
            setModoExibicaoPublico(catConfig.modo_exibicao);
          }

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

  const corTema = loja?.cor_primaria || '#10B981';

  // Carregar e Avaliar Regras de Precificação em Tempo Real
  const regrasAtivas = useMemo(() => obterRegrasPrecificacao(loja), [loja]);

  const avaliacaoCarrinho = useMemo(() => {
    return avaliarNivelCarrinho(carrinho, regrasAtivas);
  }, [carrinho, regrasAtivas]);

  const totalItens = avaliacaoCarrinho.totalPecas;
  const subtotal = avaliacaoCarrinho.totalFinal;
  const valorFrete = Number(formaEntregaEscolhida?.valor_taxa || 0);
  const valorFreteEfetivo = freteGratisCupom ? 0 : valorFrete;
  const total = Math.max(0, subtotal - descontoCupom) + valorFreteEfetivo;

  // Revalidar cupom caso o subtotal mude
  useEffect(() => {
    if (cupomAplicado && loja?.id) {
      CupomService.validarCupomCatalogo(loja.id, cupomAplicado.codigo, subtotal).then(res => {
        if (res.valido) {
          setDescontoCupom(res.descontoCalculado);
          setFreteGratisCupom(res.freteGratis);
        } else {
          setCupomAplicado(null);
          setDescontoCupom(0);
          setFreteGratisCupom(false);
          setMensagemCupom({ tipo: 'erro', texto: res.mensagem || 'Cupom removido.' });
        }
      });
    }
  }, [subtotal, cupomAplicado?.codigo, loja?.id]);

  const handleAplicarCupom = async () => {
    if (!loja?.id || !codigoCupomInput.trim()) return;
    setValidandoCupom(true);
    setMensagemCupom(null);
    try {
      const res = await CupomService.validarCupomCatalogo(loja.id, codigoCupomInput, subtotal);
      if (res.valido && res.cupom) {
        setCupomAplicado(res.cupom);
        setDescontoCupom(res.descontoCalculado);
        setFreteGratisCupom(res.freteGratis);
        setMensagemCupom({
          tipo: 'sucesso',
          texto: res.freteGratis
            ? 'Cupom de Frete Grátis aplicado com sucesso! 🚚'
            : `Cupom ${res.cupom.codigo} aplicado: R$ ${res.descontoCalculado.toFixed(2)} de desconto! 🎉`
        });
      } else {
        setCupomAplicado(null);
        setDescontoCupom(0);
        setFreteGratisCupom(false);
        setMensagemCupom({
          tipo: 'erro',
          texto: res.mensagem || 'Cupom inválido ou não encontrado.'
        });
      }
    } catch (err) {
      setMensagemCupom({ tipo: 'erro', texto: 'Erro ao validar cupom.' });
    } finally {
      setValidandoCupom(false);
    }
  };

  const handleRemoverCupom = () => {
    setCupomAplicado(null);
    setDescontoCupom(0);
    setFreteGratisCupom(false);
    setCodigoCupomInput('');
    setMensagemCupom(null);
  };

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
            valor_frete: valorFreteEfetivo,
            valor_desconto: (Number(avaliacaoCarrinho.economiaTotal || 0) + Number(descontoCupom || 0)),
            valor_total: total,
            saldo_devedor: total,
            cupom_id: cupomAplicado?.id || null,
            cupom_codigo: cupomAplicado?.codigo || null,
            desconto_cupom: descontoCupom || (freteGratisCupom ? valorFrete : 0),
            endereco_entrega: `${formaEntregaEscolhida?.nome || 'Entrega'} - ${enderecoEntrega || 'Retirada'}`,
            observacoes: `Cliente: ${nomeCliente} (${whatsappCliente}). ${cupomAplicado ? `[Cupom: ${cupomAplicado.codigo}] ` : ''}${observacoes ? `Obs: ${observacoes}` : ''}`,
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
      
      let pixInfoRes: PixDinamicoResponse | null = null;
      let linkPagamentoUrl: string | null = null;

      // Gerar cobrança Mercado Pago se ativado
      if (loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.ativo) {
        pixInfoRes = await paymentGatewayService.gerarPixMercadoPago({
          loja,
          valor: total,
          descricao: `Pedido #${pedidoCriado.numero_pedido} - ${loja.nome_fantasia}`,
          pedidoNumero: pedidoCriado.numero_pedido,
          emailCliente: 'cliente@hubi.app',
          nomeCliente: nomeCliente
        });

        const linkRes = await paymentGatewayService.gerarLinkMercadoPago({
          loja,
          itens: carrinho.map(c => ({
            titulo: c.produto.nome,
            quantidade: c.quantidade,
            precoUnitario: c.produto.preco_venda_varejo
          })),
          pedidoNumero: pedidoCriado.numero_pedido
        });

        if (linkRes.sucesso && linkRes.linkPagamento) {
          linkPagamentoUrl = linkRes.linkPagamento;
        }
      }

      setCarrinho([]);
      setDrawerCarrinhoAberto(false);

      setPedidoConcluidoModal({
        numeroPedido: pedidoCriado.numero_pedido,
        whatsAppUrl: (loja.resumo_whatsapp ?? true) ? urlWhats : '',
        pixInfo: pixInfoRes?.sucesso ? pixInfoRes : null,
        linkPagamento: linkPagamentoUrl
      });
    } catch (err: any) {
      console.error('Erro ao enviar pedido:', err);
      alert(`Erro ao finalizar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setEnviandoPedido(false);
    }
  };

  const getEstoqueTotal = (p: Produto) => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0);
    }
    return Number(p.quantidade_estoque || 0);
  };

  const catConfig = loja?.configuracoes_extras?.catalogo;
  const semEstoqueModo = catConfig?.produtos_sem_estoque || 'exibir';
  const bannerAtivo = (catConfig?.exibir_banner ?? Boolean(loja?.url_banner)) && Boolean(loja?.url_banner);
  const aceitaPedidos = loja?.aceita_pedidos_online ?? true;

  const produtosFiltrados = produtos.filter(p => {
    const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoriaSelecionada === 'todas' || p.categoria_id === categoriaSelecionada;
    
    // Regra de produtos sem estoque
    if (semEstoqueModo === 'ocultar') {
      const est = getEstoqueTotal(p);
      if (est <= 0) return false;
    }

    return matchBusca && matchCat;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* HEADER PRINCIPAL DO CATÁLOGO COM COR DO TEMA */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {loja?.url_logo ? (
            <img src={loja.url_logo} alt={loja.nome_fantasia} className="w-10 h-10 rounded-xl object-contain bg-slate-900 border border-slate-800" />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow text-base"
              style={{ backgroundColor: corTema }}
            >
              {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
            </div>
          )}
          <div>
            <h1 className="font-extrabold text-sm text-slate-100 leading-tight">
              {loja?.nome_fantasia || 'Catálogo Online'}
            </h1>
            <span className="text-[11px] font-medium flex items-center gap-1" style={{ color: aceitaPedidos ? corTema : '#94A3B8' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: aceitaPedidos ? corTema : '#64748B' }}></span>
              {aceitaPedidos ? 'Aberto para pedidos' : 'Modo Mostruário / Consulta'}
            </span>
          </div>
        </div>

        <button
          onClick={() => setDrawerCarrinhoAberto(true)}
          className="relative px-3.5 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-lg transition hover:brightness-110 cursor-pointer"
          style={{ backgroundColor: corTema }}
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

      {/* BANNER DA LOJA SE HABILITADO */}
      {bannerAtivo && loja?.url_banner && (
        <div className="w-full bg-slate-950 border-b border-slate-800/80 overflow-hidden">
          <div className="max-w-6xl mx-auto">
            <img
              src={loja.url_banner}
              alt="Banner Promocional"
              className="w-full max-h-48 sm:max-h-64 object-cover"
            />
          </div>
        </div>
      )}

      {/* AVISO DE CATÁLOGO APENAS PARA CONSULTA */}
      {!aceitaPedidos && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs text-amber-300 flex items-center justify-center gap-2">
          <Info className="w-4 h-4" />
          <span>Nosso catálogo online está no momento configurado apenas para consulta e mostruário de produtos.</span>
        </div>
      )}

      {loja?.sobre_loja && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-4 border-b border-slate-800/80 text-center">
          <p className="text-xs text-slate-300 max-w-xl mx-auto italic">
            "{loja.sobre_loja}"
          </p>
        </div>
      )}

      <div className="max-w-6xl mx-auto w-full p-4 space-y-4">
        {/* BUSCA E SELETORES DE MODO DE EXIBIÇÃO */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="O que você está procurando hoje?"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* BOTÕES DE ALTERNAR MODO DE EXIBIÇÃO (LISTA / GRADE / INSTAVIEW) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1 flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setModoExibicaoPublico('lista')}
              className={`p-2 rounded-xl transition cursor-pointer ${
                modoExibicaoPublico === 'lista' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Modo Lista"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setModoExibicaoPublico('grade')}
              className={`p-2 rounded-xl transition cursor-pointer ${
                modoExibicaoPublico === 'grade' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Modo Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setModoExibicaoPublico('instaview')}
              className={`p-2 rounded-xl transition cursor-pointer ${
                modoExibicaoPublico === 'instaview' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Modo Instaview"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ABAS DE CATEGORIAS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCategoriaSelecionada('todas')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              categoriaSelecionada === 'todas'
                ? 'text-white shadow'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
            style={{ backgroundColor: categoriaSelecionada === 'todas' ? corTema : undefined }}
          >
            Todos
          </button>
          {categorias.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoriaSelecionada(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                categoriaSelecionada === cat.id
                  ? 'text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
              style={{ backgroundColor: categoriaSelecionada === cat.id ? corTema : undefined }}
            >
              {cat.nome}
            </button>
          ))}
        </div>

        {/* LISTAGEM DE PRODUTOS NOS 3 MODOS */}
        {carregando ? (
          <div className="text-center py-20 text-slate-500 text-sm">Carregando catálogo...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm">Nenhum produto disponível no momento.</div>
        ) : modoExibicaoPublico === 'lista' ? (
          /* ================= MODO LISTA ================= */
          <div className="space-y-2.5 pt-2">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
              const estoqueTotal = getEstoqueTotal(produto);
              const esgotado = estoqueTotal <= 0 && semEstoqueModo === 'indisponivel';

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-950 shrink-0">
                      <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover" />
                      {esgotado && (
                        <span className="absolute inset-0 bg-black/70 flex items-center justify-center text-[9px] font-black text-rose-300">
                          ESGOTADO
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-bold text-xs sm:text-sm text-slate-100 truncate">{produto.nome}</h3>
                      {produto.descricao && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{produto.descricao}</p>
                      )}
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="font-black text-sm" style={{ color: corTema }}>
                          R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                        </span>
                        {produto.preco_venda_atacado && (
                          <span className="text-[10px] text-indigo-400 hidden sm:inline">
                            Atacado ({produto.qtd_minima_atacado}+): R$ {Number(produto.preco_venda_atacado).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={esgotado}
                    onClick={() => {
                      if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                        setProdutoModalVariacao(produto);
                      } else {
                        adicionarAoCarrinho(produto);
                      }
                    }}
                    className="px-3 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-40 shrink-0"
                    style={{ backgroundColor: corTema }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Adicionar</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : modoExibicaoPublico === 'instaview' ? (
          /* ================= MODO INSTAVIEW (FEED) ================= */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2 max-w-4xl mx-auto">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&auto=format&fit=crop&q=80';
              const estoqueTotal = getEstoqueTotal(produto);
              const esgotado = estoqueTotal <= 0 && semEstoqueModo === 'indisponivel';

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between"
                >
                  <div className="relative aspect-square w-full bg-slate-950">
                    <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover" />
                    {esgotado && (
                      <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                        <span className="bg-rose-600 text-white font-black text-xs px-4 py-1 rounded-full shadow-lg">
                          ESGOTADO
                        </span>
                      </div>
                    )}
                    {produto.destaque && (
                      <span className="absolute top-3 left-3 bg-amber-500 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full shadow">
                        ★ Destaque
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-bold text-sm text-slate-100">{produto.nome}</h3>
                      {produto.descricao && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{produto.descricao}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">A partir de</span>
                        <span className="text-base font-black" style={{ color: corTema }}>
                          R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={esgotado}
                        onClick={() => {
                          if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                            setProdutoModalVariacao(produto);
                          } else {
                            adicionarAoCarrinho(produto);
                          }
                        }}
                        className="px-4 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer disabled:opacity-40"
                        style={{ backgroundColor: corTema }}
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span>Adicionar ao Pedido</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ================= MODO GRADE (DEFAULT) ================= */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pt-2">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
              const estoqueTotal = getEstoqueTotal(produto);
              const esgotado = estoqueTotal <= 0 && semEstoqueModo === 'indisponivel';

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between shadow-sm hover:border-slate-700 transition group"
                >
                  <div>
                    <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-950 mb-2.5">
                      <img
                        src={fotoUrl}
                        alt={produto.nome}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      {esgotado ? (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <span className="bg-rose-600 text-white font-black text-[9px] px-2 py-0.5 rounded shadow">
                            ESGOTADO
                          </span>
                        </div>
                      ) : (
                        produto.promocao_ativa && produto.preco_promocional && (
                          <span className="absolute top-2 left-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                            OFERTA
                          </span>
                        )
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
                      <span className="font-black text-sm" style={{ color: corTema }}>
                        R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={esgotado}
                      onClick={() => {
                        if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                          setProdutoModalVariacao(produto);
                        } else {
                          adicionarAoCarrinho(produto);
                        }
                      }}
                      className="w-8 h-8 rounded-xl text-white flex items-center justify-center transition shadow-sm font-bold cursor-pointer disabled:opacity-40"
                      style={{ backgroundColor: corTema }}
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

                  {/* CAMPO DE CUPOM DE DESCONTO */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Possui cupom de desconto?</span>
                    </span>

                    {cupomAplicado ? (
                      <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                            ✓
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-100">{cupomAplicado.codigo}</span>
                            <span className="text-[10px] text-emerald-400 block">
                              {freteGratisCupom ? 'Frete Grátis Aplicado' : `R$ ${descontoCupom.toFixed(2)} OFF`}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoverCupom}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition text-xs"
                          title="Remover cupom"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="CÓDIGO DO CUPOM"
                            value={codigoCupomInput}
                            onChange={(e) => setCodigoCupomInput(e.target.value.toUpperCase())}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-bold placeholder:text-slate-500 placeholder:font-normal focus:outline-none focus:border-emerald-500 tracking-wider"
                          />
                          <button
                            type="button"
                            onClick={handleAplicarCupom}
                            disabled={!codigoCupomInput.trim() || validandoCupom}
                            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs transition cursor-pointer shrink-0"
                          >
                            {validandoCupom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aplicar'}
                          </button>
                        </div>

                        {mensagemCupom && (
                          <span
                            className={`text-[10px] block ${
                              mensagemCupom.tipo === 'sucesso' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-medium'
                            }`}
                          >
                            {mensagemCupom.texto}
                          </span>
                        )}
                      </div>
                    )}
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
                      <span>Desconto de Volume ({avaliacaoCarrinho.tabelaAtiva}):</span>
                      <span>- R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {descontoCupom > 0 && (
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>Desconto Cupom ({cupomAplicado?.codigo}):</span>
                      <span>- R$ {descontoCupom.toFixed(2)}</span>
                    </div>
                  )}
                  {valorFrete > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Taxa de Entrega:</span>
                      {freteGratisCupom ? (
                        <span className="text-emerald-400 font-bold">GRÁTIS (Cupom)</span>
                      ) : (
                        <span>+ R$ {valorFrete.toFixed(2)}</span>
                      )}
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
                  className="w-full py-4 rounded-2xl text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer hover:brightness-110"
                  style={{ backgroundColor: corTema }}
                >
                  <Share2 className="w-5 h-5" />
                  <span>{enviandoPedido ? 'Enviando Pedido...' : aceitaPedidos ? 'Finalizar e Enviar Pedido' : 'Enviar Consulta via WhatsApp'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE SUCESSO / ORIENTAÇÕES PÓS-PEDIDO */}
      {pedidoConcluidoModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-lg"
              style={{ backgroundColor: `${corTema}25`, color: corTema }}
            >
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-100">
                Pedido #{pedidoConcluidoModal.numeroPedido} Enviado!
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Seu pedido foi registrado no sistema com sucesso.
              </p>
            </div>

            {/* Mensagem Personalizada de Orientações Pós-Pedido da Loja */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 text-left whitespace-pre-wrap leading-relaxed">
              {loja?.instrucoes_pos_pedido || 'Em breve entraremos em contato para confirmar os detalhes da sua compra. Agradecemos pela preferência!'}
            </div>

            {/* SE HOUVER PIX DINÂMICO MERCADO PAGO GERADO */}
            {pedidoConcluidoModal.pixInfo && (
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center space-y-3">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400">
                  <QrCode className="w-4 h-4" />
                  <span>Pague agora com Pix Instantâneo</span>
                </div>

                {pedidoConcluidoModal.pixInfo.qrCodeBase64 ? (
                  <img
                    src={`data:image/png;base64,${pedidoConcluidoModal.pixInfo.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="w-44 h-44 mx-auto rounded-xl bg-white p-2 border border-emerald-500/40 shadow-lg"
                  />
                ) : null}

                {pedidoConcluidoModal.pixInfo.qrCode && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (pedidoConcluidoModal.pixInfo?.qrCode) {
                        await navigator.clipboard.writeText(pedidoConcluidoModal.pixInfo.qrCode);
                        setPixCopiado(true);
                        setTimeout(() => setPixCopiado(false), 2500);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{pixCopiado ? 'Código Pix Copiado!' : 'Copiar Código Pix (Copia e Cola)'}</span>
                  </button>
                )}
              </div>
            )}

            {/* LINK DE PAGAMENTO EXTERNO MERCADO PAGO / CARTÃO */}
            {pedidoConcluidoModal.linkPagamento && (
              <a
                href={pedidoConcluidoModal.linkPagamento}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-600/25 transition cursor-pointer"
              >
                <span>Pagar com Cartão / Mercado Pago</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            <div className="space-y-2 pt-2">
              {pedidoConcluidoModal.whatsAppUrl && (
                <a
                  href={pedidoConcluidoModal.whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Enviar Resumo no WhatsApp da Loja</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setPedidoConcluidoModal(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Voltar ao Catálogo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
