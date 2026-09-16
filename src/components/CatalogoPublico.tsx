import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
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
  TrendingUp,
  Layers,
  ChevronDown,
  Trash2,
  Gift,
  Truck
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Loja, Produto, VariacaoProduto, Categoria, FormaEntrega, ModoExibicaoCatalogo, Cupom, Cliente, PedidoEntrega } from '../types';
import { LojaShippingConfig, ShippingSelectionResult } from '../types/shipping';
import { ShippingFulfillmentSelector } from './shipping/ShippingFulfillmentSelector';
import { ShippingOrchestrator } from '../services/shippingOrchestrator';
import {
  obterRegrasPrecificacao,
  avaliarNivelCarrinho,
  calcularPrecoUnitarioPorTabela
} from '../services/pricingEngine';
import { LayoutGrid, List, Smartphone, Info, Copy, QrCode, ExternalLink, Ticket, Check, Loader2, User, Phone, MapPin, UserCheck, Edit2, Banknote, CreditCard, Eye } from 'lucide-react';
import { paymentGatewayService, PixDinamicoResponse } from '../services/paymentGatewayService';
import { CupomService } from '../services/cupomService';
import { audioService } from '../services/audioService';
import { useCart } from '../contexts/CartContext';
import { ModalBuscaClienteCatalogo } from './ModalBuscaClienteCatalogo';
import { ModalContatoClienteCatalogo, DadosContatoCliente } from './ModalContatoClienteCatalogo';
import { ModalEnderecoClienteCatalogo, DadosEnderecoCliente } from './ModalEnderecoClienteCatalogo';
import { ModalDetalhesProdutoCatalogo } from './ModalDetalhesProdutoCatalogo';
import { formatarResumoDescricao } from './DescricaoFormatadaProduto';
import { ChatRubiCatalogo } from './ChatRubiCatalogo';
import { getCategoriaPeso } from './PosCheckout';
import { obterDataOperacaoISO, obterDataOperacaoISOParaLoja, definirDataOperacao } from '../utils/dataOperacao';

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
  preferenceId?: string | null;
  formaPagamentoEscolhida?: string;
}

export const CatalogoPublico: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const cartContext = useCart();
  const [loja, setLoja] = useState<Loja | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [formasEntrega, setFormasEntrega] = useState<FormaEntrega[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);

  const [busca, setBusca] = useState<string>('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('todas');
  const [carrinho, setCarrinho] = useState<ItemCarrinhoPublico[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const slugKey = slug || window.location.pathname.split('/').pop() || 'default';
      const salvo = sessionStorage.getItem(`hubi_carrinho_catalogo_${slugKey}`);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Erro ao carregar carrinho do sessionStorage:', e);
    }
    return [];
  });
  const [drawerCarrinhoAberto, setDrawerCarrinhoAberto] = useState<boolean>(false);
  const [produtoModalVariacao, setProdutoModalVariacao] = useState<Produto | null>(null);

  // Controle do modal de detalhes do produto e assistente Rubi IA
  const [produtoDetalhesModal, setProdutoDetalhesModal] = useState<Produto | null>(null);
  const [mensagemRubiExterna, setMensagemRubiExterna] = useState<{ id: number; texto: string; produto?: Produto } | null>(null);
  const [rubiAbertaExterna, setRubiAbertaExterna] = useState<boolean>(false);

  // Sincronizar carrinho com sessionStorage para preservar estado contra recarregamentos
  useEffect(() => {
    try {
      const slugKey = slug || window.location.pathname.split('/').pop() || 'default';
      if (carrinho.length > 0) {
        sessionStorage.setItem(`hubi_carrinho_catalogo_${slugKey}`, JSON.stringify(carrinho));
      } else {
        sessionStorage.removeItem(`hubi_carrinho_catalogo_${slugKey}`);
      }
    } catch (e) {
      console.warn('Erro ao salvar carrinho no sessionStorage:', e);
    }
  }, [carrinho, slug]);

  // Referência para medir altura dinâmica do cabeçalho
  const headerRef = React.useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(64);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    updateHeight();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(el);
    }

    window.addEventListener('resize', updateHeight);
    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [loja]);

  // Modo de exibição
  const [modoExibicaoPublico, setModoExibicaoPublico] = useState<ModoExibicaoCatalogo>('grade');
  const [pedidoConcluidoModal, setPedidoConcluidoModal] = useState<PedidoConcluidoInfo | null>(null);
  const [pixCopiado, setPixCopiado] = useState<boolean>(false);

  // Tratamento do Retorno Mercado Pago & Polling do Pix
  const [searchParams] = useSearchParams();
  const [modalRetornoMP, setModalRetornoMP] = useState<{
    aberto: boolean;
    pedidoNumero: number;
    sucesso: boolean;
    mensagem: string;
  } | null>(null);
  const [pixAprovadoEmTempoReal, setPixAprovadoEmTempoReal] = useState<boolean>(false);
  const [verificandoPixManual, setVerificandoPixManual] = useState<boolean>(false);

  const slugKey = slug || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : 'default') || 'default';

  const [nomeCliente, setNomeCliente] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return sessionStorage.getItem(`hubi_nome_cliente_catalogo_${slugKey}`) || '';
    } catch {
      return '';
    }
  });
  const [whatsappCliente, setWhatsappCliente] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return sessionStorage.getItem(`hubi_whatsapp_cliente_catalogo_${slugKey}`) || '';
    } catch {
      return '';
    }
  });
  const [enderecoEntrega, setEnderecoEntrega] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return sessionStorage.getItem(`hubi_endereco_formatado_catalogo_${slugKey}`) || '';
    } catch {
      return '';
    }
  });
  const [formaEntregaEscolhida, setFormaEntregaEscolhida] = useState<FormaEntrega | null>(null);
  const [pedidoEntrega, setPedidoEntrega] = useState<PedidoEntrega | null>(null);
  const [modalShippingAberto, setModalShippingAberto] = useState<boolean>(false);
  const [draftResultadoShipping, setDraftResultadoShipping] = useState<ShippingSelectionResult | null>(null);
  const [configShippingLoja, setConfigShippingLoja] = useState<LojaShippingConfig | null>(null);
  const [observacoes, setObservacoes] = useState<string>('');
  const [enviandoPedido, setEnviandoPedido] = useState<boolean>(false);

  // Carregar configurações de frete da loja (incluindo frete grátis e retirada)
  useEffect(() => {
    let ativo = true;
    async function carregarConfigShipping() {
      if (!loja?.id) return;
      try {
        const conf = await ShippingOrchestrator.buscarConfigLoja(loja.id);
        if (ativo && conf) {
          setConfigShippingLoja(conf);
        }
      } catch (err) {
        console.warn('Erro ao carregar configurações de frete no catálogo:', err);
      }
    }
    carregarConfigShipping();
    return () => {
      ativo = false;
    };
  }, [loja?.id]);

  // Estados de Identificação do Cliente (3 Botões)
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const salvo = sessionStorage.getItem(`hubi_cliente_catalogo_${slugKey}`);
      if (salvo) return JSON.parse(salvo);
    } catch {
      // Ignore
    }
    return null;
  });
  const [modalBuscaClienteAberto, setModalBuscaClienteAberto] = useState<boolean>(false);
  const [modalContatoAberto, setModalContatoAberto] = useState<boolean>(false);
  const [modalEnderecoAberto, setModalEnderecoAberto] = useState<boolean>(false);
  const [dadosContato, setDadosContato] = useState<DadosContatoCliente>(() => {
    if (typeof window === 'undefined') return { nome: '', telefone: '', telefoneIsWhatsapp: true };
    try {
      const salvo = sessionStorage.getItem(`hubi_contato_catalogo_${slugKey}`);
      if (salvo) return JSON.parse(salvo);
    } catch {
      // Ignore
    }
    return {
      nome: '',
      telefone: '',
      telefoneIsWhatsapp: true
    };
  });
  const [dadosEndereco, setDadosEndereco] = useState<DadosEnderecoCliente>(() => {
    if (typeof window === 'undefined') {
      return { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };
    }
    try {
      const salvo = sessionStorage.getItem(`hubi_endereco_catalogo_${slugKey}`);
      if (salvo) return JSON.parse(salvo);
    } catch {
      // Ignore
    }
    return {
      cep: '',
      rua: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: ''
    };
  });

  const handleSelecionarCliente = (cliente: Cliente) => {
    setClienteSelecionado(cliente);
    try {
      sessionStorage.setItem(`hubi_cliente_catalogo_${slugKey}`, JSON.stringify(cliente));
      cartContext?.setClienteSelecionado(cliente);
    } catch {
      // Ignore
    }
    setNomeCliente(cliente.nome || '');
    const tel = cliente.whatsapp || cliente.telefone || cliente.telefone2 || '';
    setWhatsappCliente(tel);

    const novoContato: DadosContatoCliente = {
      nome: cliente.nome || '',
      telefone: tel,
      telefoneIsWhatsapp: cliente.telefone_is_whatsapp ?? true,
      telefone2: cliente.telefone2 || '',
      telefone2IsWhatsapp: cliente.telefone2_is_whatsapp ?? false,
      cpfCnpj: cliente.numero_documento || '',
      dataAniversario: cliente.data_aniversario || '',
      email: cliente.email || ''
    };
    setDadosContato(novoContato);

    const endObj: DadosEnderecoCliente = {
      cep: cliente.endereco_cep || cliente.cep || '',
      rua: cliente.endereco_logradouro || cliente.rua || cliente.endereco || '',
      numero: cliente.endereco_numero || cliente.numero || '',
      complemento: cliente.endereco_complemento || cliente.complemento || '',
      bairro: cliente.endereco_bairro || cliente.bairro || '',
      cidade: cliente.endereco_cidade || cliente.cidade || '',
      estado: cliente.endereco_estado || cliente.estado || ''
    };
    setDadosEndereco(endObj);

    const partes = [
      endObj.rua,
      endObj.numero ? `nº ${endObj.numero}` : '',
      endObj.complemento ? `(${endObj.complemento})` : '',
      endObj.bairro ? `- ${endObj.bairro}` : '',
      endObj.cidade,
      endObj.estado ? `/${endObj.estado}` : '',
      endObj.cep ? `• CEP: ${endObj.cep}` : ''
    ].filter(Boolean);

    const formatado = partes.join(' ');
    setEnderecoEntrega(formatado);

    try {
      sessionStorage.setItem(`hubi_contato_catalogo_${slugKey}`, JSON.stringify(novoContato));
      sessionStorage.setItem(`hubi_nome_cliente_catalogo_${slugKey}`, cliente.nome || '');
      sessionStorage.setItem(`hubi_whatsapp_cliente_catalogo_${slugKey}`, tel);
      sessionStorage.setItem(`hubi_endereco_catalogo_${slugKey}`, JSON.stringify(endObj));
      sessionStorage.setItem(`hubi_endereco_formatado_catalogo_${slugKey}`, formatado);
      cartContext?.setEnderecoEntrega(formatado);
      cartContext?.setDadosEndereco(endObj);
    } catch {
      // Ignore
    }
  };

  const handleSalvarContato = (novosDados: DadosContatoCliente) => {
    setDadosContato(novosDados);
    setNomeCliente(novosDados.nome);
    setWhatsappCliente(novosDados.telefone);

    try {
      sessionStorage.setItem(`hubi_contato_catalogo_${slugKey}`, JSON.stringify(novosDados));
      sessionStorage.setItem(`hubi_nome_cliente_catalogo_${slugKey}`, novosDados.nome);
      sessionStorage.setItem(`hubi_whatsapp_cliente_catalogo_${slugKey}`, novosDados.telefone);
    } catch (e) {
      console.warn('Erro ao salvar contato no sessionStorage:', e);
    }

    if (clienteSelecionado) {
      const cliAtualizado: Cliente = {
        ...clienteSelecionado,
        nome: novosDados.nome,
        telefone: novosDados.telefone,
        whatsapp: novosDados.telefone,
        telefone_is_whatsapp: novosDados.telefoneIsWhatsapp,
        telefone2: novosDados.telefone2,
        telefone2_is_whatsapp: novosDados.telefone2IsWhatsapp,
        numero_documento: novosDados.cpfCnpj,
        data_aniversario: novosDados.dataAniversario,
        email: novosDados.email
      };
      setClienteSelecionado(cliAtualizado);
      try {
        sessionStorage.setItem(`hubi_cliente_catalogo_${slugKey}`, JSON.stringify(cliAtualizado));
        cartContext?.setClienteSelecionado(cliAtualizado);
      } catch {
        // Ignore
      }
    }
  };

  const handleSalvarEndereco = (novosDados: DadosEnderecoCliente, formatado: string) => {
    setDadosEndereco(novosDados);
    setEnderecoEntrega(formatado);

    try {
      sessionStorage.setItem(`hubi_endereco_catalogo_${slugKey}`, JSON.stringify(novosDados));
      sessionStorage.setItem(`hubi_endereco_formatado_catalogo_${slugKey}`, formatado);
    } catch (e) {
      console.warn('Erro ao salvar endereco no sessionStorage:', e);
    }

    if (clienteSelecionado) {
      const cliAtualizado: Cliente = {
        ...clienteSelecionado,
        endereco_cep: novosDados.cep,
        endereco_logradouro: novosDados.rua,
        endereco_numero: novosDados.numero,
        endereco_complemento: novosDados.complemento,
        endereco_bairro: novosDados.bairro,
        endereco_cidade: novosDados.cidade,
        endereco_estado: novosDados.estado,
        cep: novosDados.cep,
        rua: novosDados.rua,
        numero: novosDados.numero,
        complemento: novosDados.complemento,
        bairro: novosDados.bairro,
        cidade: novosDados.cidade,
        estado: novosDados.estado
      };
      setClienteSelecionado(cliAtualizado);
      try {
        sessionStorage.setItem(`hubi_cliente_catalogo_${slugKey}`, JSON.stringify(cliAtualizado));
        cartContext?.setClienteSelecionado(cliAtualizado);
      } catch {
        // Ignore
      }
    }

    try {
      cartContext?.setEnderecoEntrega(formatado);
      cartContext?.setDadosEndereco(novosDados);
    } catch {
      // Ignore
    }
  };

  const handleClienteAtualizadoPelaRubi = async (dados: { nome?: string; telefone?: string; endereco?: string }) => {
    if (dados.nome) {
      setNomeCliente(dados.nome);
      setDadosContato(prev => ({ ...prev, nome: dados.nome! }));
    }
    if (dados.telefone) {
      setWhatsappCliente(dados.telefone);
      setDadosContato(prev => ({ ...prev, telefone: dados.telefone!, telefoneIsWhatsapp: true }));
    }
    if (dados.endereco) {
      setEnderecoEntrega(dados.endereco);
      setDadosEndereco(prev => ({ ...prev, rua: dados.endereco! }));
    }

    if (loja?.id && (dados.nome || nomeCliente)) {
      const nomeFinal = (dados.nome || nomeCliente).trim();
      const telFinal = (dados.telefone || whatsappCliente || '').trim();
      const endFinal = (dados.endereco || enderecoEntrega || '').trim();

      if (nomeFinal) {
        try {
          const { data: rpcCli, error: rpcCliErr } = await supabase.rpc('salvar_cliente_catalogo', {
            p_loja_id: loja.id,
            p_nome: nomeFinal,
            p_telefone: telFinal || null,
            p_email: dadosContato.email?.trim() || null,
            p_cpf_cnpj: dadosContato.cpfCnpj?.trim() || null,
            p_aniversario: dadosContato.dataAniversario || null,
            p_endereco: endFinal || null,
            p_cliente_id: clienteSelecionado?.id || null
          });

          if (!rpcCliErr && rpcCli?.sucesso && rpcCli?.cliente_id) {
            if (rpcCli.cliente) setClienteSelecionado(rpcCli.cliente);
          } else if (!clienteSelecionado?.id && telFinal) {
            const { data: novoCli } = await supabase
              .from('clientes')
              .insert([{
                loja_id: loja.id,
                nome: nomeFinal,
                telefone: telFinal,
                whatsapp: telFinal,
                endereco_principal: endFinal || null,
                tabela_preco_padrao: 'varejo'
              }])
              .select()
              .single();
            if (novoCli) {
              setClienteSelecionado(novoCli);
            }
          }
        } catch (err) {
          console.warn('Não foi possível sincronizar cliente detectado pela Rubi:', err);
        }
      }
    }
  };

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

          const simLoja = l.configuracoes_extras?.simulacao_data_operacao;
          if (simLoja?.ativa && simLoja?.dataYMD) {
            definirDataOperacao(simLoja.dataYMD, simLoja.horaHM);
          }

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

  // 1. Tratar Retorno do Mercado Pago (Redirecionamento pós-checkout)
  useEffect(() => {
    if (!loja?.id) return;

    const statusParam = searchParams.get('status') || searchParams.get('collection_status');
    const rawPedido = searchParams.get('pedido') || searchParams.get('external_reference')?.replace('PEDIDO_', '');
    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
    const paymentType = searchParams.get('payment_type');
    const paymentMethodId = searchParams.get('payment_method_id');

    if (!statusParam || !rawPedido) return;

    const pedidoNumero = Number(rawPedido);
    if (!pedidoNumero) return;

    const statusLimpo = statusParam.toLowerCase();
    const isAprovado = ['aprovado', 'approved'].includes(statusLimpo);
    const isPendente = ['pendente', 'pending', 'in_process'].includes(statusLimpo);

    const processarRetornoMP = async () => {
      if (isAprovado) {
        try {
          const accessToken = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.access_token;
          const res = await paymentGatewayService.confirmarPagamentoMercadoPago({
            lojaId: loja.id,
            pedidoNumero,
            paymentId: paymentId || undefined,
            status: 'approved',
            accessToken,
            paymentType: paymentType || undefined,
            paymentMethod: paymentMethodId || undefined
          });

          audioService.playNewOrderSound();

          setModalRetornoMP({
            aberto: true,
            pedidoNumero,
            sucesso: true,
            mensagem: res.sucesso
              ? `Pagamento do Pedido #${pedidoNumero} confirmado com sucesso no Mercado Pago! O status do seu pedido já está PAGO e foi enviado para a loja preparar.`
              : `Pagamento do Pedido #${pedidoNumero} recebido! Atualizando status no sistema.`
          });
        } catch (err: any) {
          console.error('Erro ao confirmar retorno do Mercado Pago:', err);
          setModalRetornoMP({
            aberto: true,
            pedidoNumero,
            sucesso: true,
            mensagem: `Pagamento do Pedido #${pedidoNumero} processado com sucesso!`
          });
        }
      } else if (isPendente) {
        setModalRetornoMP({
          aberto: true,
          pedidoNumero,
          sucesso: false,
          mensagem: `O pagamento do Pedido #${pedidoNumero} está em análise/processamento no Mercado Pago. Assim que for compensado, o status será atualizado automaticamente.`
        });
      } else {
        setModalRetornoMP({
          aberto: true,
          pedidoNumero,
          sucesso: false,
          mensagem: `O pagamento do Pedido #${pedidoNumero} não foi concluído ou foi cancelado no Mercado Pago.`
        });
      }

      // Limpar parâmetros da URL para evitar loops ao recarregar a página
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    processarRetornoMP();
  }, [loja?.id, searchParams]);

  // 2. Polling em Tempo Real para Pix Dinâmico no Modal
  useEffect(() => {
    if (!pedidoConcluidoModal?.pixInfo?.transacaoId || pixAprovadoEmTempoReal || !loja?.id) {
      return;
    }

    const transacaoId = pedidoConcluidoModal.pixInfo.transacaoId;
    const pedidoNumero = pedidoConcluidoModal.numeroPedido;
    const accessToken = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.access_token;

    let ativo = true;

    const checarStatusPix = async () => {
      try {
        const res = await paymentGatewayService.confirmarPagamentoMercadoPago({
          lojaId: loja.id,
          pedidoNumero,
          paymentId: transacaoId,
          accessToken,
          paymentType: 'bank_transfer',
          paymentMethod: 'pix'
        });

        if (ativo && (res.status === 'approved' || res.status === 'pago' || res.jaPago)) {
          setPixAprovadoEmTempoReal(true);
          audioService.playNewOrderSound();
        }
      } catch (err) {
        console.warn('Checagem em segundo plano do Pix:', err);
      }
    };

    const intervalId = setInterval(checarStatusPix, 4000);

    return () => {
      ativo = false;
      clearInterval(intervalId);
    };
  }, [pedidoConcluidoModal, pixAprovadoEmTempoReal, loja?.id]);

  const handleVerificarPixManualmente = async () => {
    if (!pedidoConcluidoModal?.pixInfo?.transacaoId || !loja?.id) return;
    setVerificandoPixManual(true);
    try {
      const transacaoId = pedidoConcluidoModal.pixInfo.transacaoId;
      const pedidoNumero = pedidoConcluidoModal.numeroPedido;
      const accessToken = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.access_token;

      const res = await paymentGatewayService.confirmarPagamentoMercadoPago({
        lojaId: loja.id,
        pedidoNumero,
        paymentId: transacaoId,
        accessToken,
        paymentType: 'bank_transfer',
        paymentMethod: 'pix'
      });

      if (res.status === 'approved' || res.status === 'pago' || res.jaPago) {
        setPixAprovadoEmTempoReal(true);
        audioService.playNewOrderSound();
      } else {
        alert('O pagamento ainda não foi identificado como aprovado pelo banco. Aguarde alguns instantes e tente novamente.');
      }
    } catch (err: any) {
      alert(`Não foi possível verificar no momento: ${err.message || 'Tente novamente em instantes.'}`);
    } finally {
      setVerificandoPixManual(false);
    }
  };


  const corTema = loja?.cor_primaria || '#10B981';

  // Carregar e Avaliar Regras de Precificação em Tempo Real
  const regrasAtivas = useMemo(() => obterRegrasPrecificacao(loja), [loja]);

  const avaliacaoCarrinho = useMemo(() => {
    return avaliarNivelCarrinho(carrinho, regrasAtivas);
  }, [carrinho, regrasAtivas]);

  const contextoRubi = useMemo(() => {
    if (!loja) return null;
    return {
      loja,
      categorias,
      produtos,
      formasEntrega,
      regrasAtivas,
      clienteAtual: clienteSelecionado,
      nomeClienteAtual: nomeCliente
    };
  }, [loja, categorias, produtos, formasEntrega, regrasAtivas, clienteSelecionado, nomeCliente]);

  const totalItens = avaliacaoCarrinho.totalPecas;
  const subtotal = avaliacaoCarrinho.totalFinal;
  const valorFrete = pedidoEntrega ? Number(pedidoEntrega.valor_frete || 0) : Number(formaEntregaEscolhida?.valor_taxa || 0);
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

  const handleLimparCarrinho = () => {
    if (carrinho.length === 0) return;
    setCarrinho([]);
    setPedidoEntrega(null);
    setFormaEntregaEscolhida(null);
    setCupomAplicado(null);
    setDescontoCupom(0);
    setFreteGratisCupom(false);
    setCodigoCupomInput('');
    setMensagemCupom(null);
    try {
      const slugKey = slug || window.location.pathname.split('/').pop() || 'default';
      sessionStorage.removeItem(`hubi_carrinho_catalogo_${slugKey}`);
    } catch (e) {}
    audioService.playRemoveSound();
  };

  const handleEnviarConsultaWhatsApp = () => {
    if (!loja?.id || carrinho.length === 0) return;
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

    const msgWhatsApp = `Olá, ${loja.nome_fantasia}! Gostaria de consultar a disponibilidade dos seguintes produtos:\n\n${itensMsg}\n\n*Total Estimado:* R$ ${total.toFixed(2)}`;
    const lojaPhone = loja.whatsapp.replace(/\D/g, '');
    window.open(`https://api.whatsapp.com/send?phone=55${lojaPhone}&text=${encodeURIComponent(msgWhatsApp)}`, '_blank');
  };

  const handleClicarFormaEntregaCatalogo = () => {
    const nomeLimpo = nomeCliente.trim();
    const telNumeros = whatsappCliente.replace(/\D/g, '');

    if (!nomeLimpo || telNumeros.length < 10) {
      alert('Para selecionar uma forma de entrega, primeiro informe seu Nome e WhatsApp no botão "Contato".');
      setModalContatoAberto(true);
      return;
    }

    setDraftResultadoShipping(null);
    setModalShippingAberto(true);
  };

  const handleFinalizarPedido = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!loja?.id || carrinho.length === 0) return;

    if (!aceitaPedidos) {
      handleEnviarConsultaWhatsApp();
      return;
    }

    const nomeLimpo = nomeCliente.trim();
    const telNumeros = whatsappCliente.replace(/\D/g, '');

    if (!nomeLimpo || telNumeros.length < 10) {
      setModalContatoAberto(true);
      alert('Identificação obrigatória: Por favor, informe seu Nome e um WhatsApp válido com DDD (mínimo 10 dígitos) no botão "Contato" para finalizar o pedido.');
      return;
    }

    if (!pedidoEntrega) {
      alert('Por favor, selecione a Forma de Entrega (Retirada ou Entrega) no carrinho antes de finalizar seu pedido.');
      setModalShippingAberto(true);
      return;
    }

    try {
      setEnviandoPedido(true);

      // 1. Criar ou Atualizar Cliente na base de dados do HUBI
      let clienteFinalId = clienteSelecionado?.id || null;

      console.group('🛒 [HUBI Catálogo] Processando Pedido e Cliente');
      console.info('Cliente selecionado prévio:', clienteSelecionado);
      console.info('Dados de contato:', { nomeCliente, whatsappCliente, dadosContato });
      console.info('Dados de endereço:', { enderecoEntrega, dadosEndereco });

      try {
        console.log('💾 Persistindo cliente na base HUBI...');
        const { data: rpcCli, error: rpcCliErr } = await supabase.rpc('salvar_cliente_catalogo', {
          p_loja_id: loja.id,
          p_nome: nomeCliente.trim(),
          p_telefone: whatsappCliente.trim(),
          p_email: dadosContato.email?.trim() || null,
          p_cpf_cnpj: dadosContato.cpfCnpj?.trim() || null,
          p_aniversario: dadosContato.dataAniversario || null,
          p_endereco: enderecoEntrega || null,
          p_cliente_id: clienteFinalId
        });

        if (!rpcCliErr && rpcCli?.sucesso && rpcCli?.cliente_id) {
          console.log('✅ Cliente persistido via RPC no HUBI! ID:', rpcCli.cliente_id, rpcCli.cliente);
          clienteFinalId = rpcCli.cliente_id;
          if (rpcCli.cliente) setClienteSelecionado(rpcCli.cliente);
        } else {
          // Fallback para operação direta na tabela caso RPC ainda não exista
          if (!clienteFinalId) {
            console.log('Tentando inserção direta na tabela public.clientes...');
            const { data: novoCliente, error: erroNovoCliente } = await supabase
              .from('clientes')
              .insert([
                {
                  loja_id: loja.id,
                  nome: nomeCliente.trim(),
                  telefone: whatsappCliente.trim(),
                  whatsapp: whatsappCliente.trim(),
                  email: dadosContato.email?.trim() || null,
                  numero_documento: dadosContato.cpfCnpj?.trim() || null,
                  data_aniversario: dadosContato.dataAniversario || null,
                  endereco_principal: enderecoEntrega || null,
                  tabela_preco_padrao: 'varejo'
                }
              ])
              .select()
              .single();

            if (erroNovoCliente) {
              console.error('❌ Erro ao salvar novo cliente no Supabase:', erroNovoCliente);
            } else if (novoCliente) {
              console.log('✅ Novo cliente cadastrado com sucesso no HUBI! ID:', novoCliente.id, novoCliente);
              clienteFinalId = novoCliente.id;
              setClienteSelecionado(novoCliente);
            }
          } else {
            console.log('Tentando atualização direta na tabela public.clientes...');
            const { data: cliAtualizado, error: erroAtualizar } = await supabase
              .from('clientes')
              .update({
                nome: nomeCliente.trim(),
                telefone: whatsappCliente.trim(),
                whatsapp: whatsappCliente.trim(),
                email: dadosContato.email?.trim() || null,
                numero_documento: dadosContato.cpfCnpj?.trim() || null,
                data_aniversario: dadosContato.dataAniversario || null,
                endereco_principal: enderecoEntrega || null
              })
              .eq('id', clienteFinalId)
              .select()
              .single();

            if (erroAtualizar) {
              console.warn('Aviso ao atualizar cliente:', erroAtualizar);
            } else if (cliAtualizado) {
              console.log('✅ Cliente atualizado no banco HUBI:', cliAtualizado);
            }
          }
        }
      } catch (cliErr) {
        console.error('Exceção ao persistir cliente:', cliErr);
      }
      console.groupEnd();

      const dataOperacaoIso = obterDataOperacaoISOParaLoja(loja);

      const payloadPedido = {
        loja_id: loja.id,
        cliente_id: clienteFinalId,
        origem: 'catalogo_online',
        status: 'pendente',
        status_pagamento: 'aguardando_pagamento',
        forma_pagamento_catalogo: 'a_combinar',
        tabela_preco_aplicada: avaliacaoCarrinho.tabelaAtiva,
        subtotal,
        subtotal_produtos: subtotal,
        valor_frete: valorFreteEfetivo,
        valor_desconto: (Number(avaliacaoCarrinho.economiaTotal || 0) + Number(descontoCupom || 0)),
        valor_total: total,
        saldo_devedor: total,
        troco_para: null,
        cupom_id: cupomAplicado?.id || null,
        cupom_codigo: cupomAplicado?.codigo || null,
        valor_desconto_cupom: Number(descontoCupom || 0),
        endereco_entrega: pedidoEntrega?.destino_logradouro 
          ? `${pedidoEntrega.destino_logradouro}, ${pedidoEntrega.destino_numero || 'S/N'}${pedidoEntrega.destino_complemento ? ` - ${pedidoEntrega.destino_complemento}` : ''}, ${pedidoEntrega.destino_bairro}, ${pedidoEntrega.destino_cidade}-${pedidoEntrega.destino_uf}`
          : `${formaEntregaEscolhida?.nome || 'Entrega'} - ${enderecoEntrega || 'Retirada'}`,
        observacoes: observacoes?.trim() || null,
        forma_entrega_id: formaEntregaEscolhida?.id || null,
        cliente_nome_avulso: nomeCliente || null,
        cliente_telefone_avulso: whatsappCliente || null,
        cliente_documento_avulso: dadosContato.cpfCnpj || null,
        cliente_email_avulso: dadosContato.email || null,
        metadados: null,
        data_venda: dataOperacaoIso,
        criado_em: dataOperacaoIso,
        atualizado_em: dataOperacaoIso
      };

      let { data: pedidoCriado, error: erroPedido } = await supabase
        .from('pedidos')
        .insert([payloadPedido])
        .select()
        .single();

      // Fallback defensivo se a coluna forma_pagamento_catalogo não for reconhecida pelo schema cache
      if (erroPedido && (erroPedido.message?.includes('forma_pagamento') || (erroPedido as any).details?.includes('forma_pagamento'))) {
        console.warn('Campo forma_pagamento_catalogo ausente na tabela pedidos. Tentando salvar sem ele...');
        const { forma_pagamento_catalogo, ...payloadSemForma } = payloadPedido;
        const retry = await supabase.from('pedidos').insert([payloadSemForma]).select().single();
        pedidoCriado = retry.data;
        erroPedido = retry.error;
      }

      if (erroPedido || !pedidoCriado) throw erroPedido;

      // Persistir isolamento relacional em pedido_entregas
      try {
        const entregaPayload = pedidoEntrega ? {
          ...pedidoEntrega,
          pedido_id: pedidoCriado.id,
          valor_frete: valorFreteEfetivo
        } : {
          pedido_id: pedidoCriado.id,
          tipo_atendimento: (valorFreteEfetivo > 0 ? 'entrega' : 'retirada') as any,
          valor_frete: valorFreteEfetivo,
          provedor: (valorFreteEfetivo > 0 ? 'uber' : 'retirada_loja') as any,
          transportadora_nome: valorFreteEfetivo > 0 ? (formaEntregaEscolhida?.nome || 'Entrega Padrão') : 'Retirada na Loja',
          status_envio: 'pendente'
        };
        await ShippingOrchestrator.salvarPedidoEntrega(pedidoCriado.id, entregaPayload);
      } catch (eEntregaCat) {
        console.warn('Aviso ao salvar pedido_entregas no catálogo:', eEntregaCat);
      }

      // Inserir registro inicial de auditoria na tabela relacional historico_pedidos
      try {
        await supabase.from('historico_pedidos').insert({
          loja_id: loja.id,
          pedido_id: pedidoCriado.id,
          usuario_id: null,
          tipo_evento: 'criacao',
          status_anterior: null,
          status_novo: 'pendente',
          motivo: 'Pedido recebido via catálogo online',
          criado_em: dataOperacaoIso
        });
      } catch (errHist) {
        console.warn('Aviso: Histórico de pedidos não pôde ser gravado:', errHist);
      }

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
          subtotal: precoUnitario * item.quantidade,
          criado_em: dataOperacaoIso
        };
      });

      await supabase.from('itens_pedido').insert(itensFormatados);

      // Gerar cobrança e preferência Mercado Pago se estiver ativo na loja
      let pixInfoRes: PixDinamicoResponse | null = null;
      let linkPagamentoUrl: string | null = null;
      let linkPreferenceId: string | null = null;

      if (loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.ativo) {
        const emailEfetivo = dadosContato.email?.trim() || clienteSelecionado?.email?.trim() || undefined;

        try {
          pixInfoRes = await paymentGatewayService.gerarPixMercadoPago({
            loja,
            valor: total,
            descricao: `Pedido #${pedidoCriado.numero_pedido} - ${loja.nome_fantasia}`,
            pedidoNumero: pedidoCriado.numero_pedido,
            emailCliente: emailEfetivo,
            nomeCliente: nomeCliente
          });
        } catch (errPix) {
          console.warn('Aviso ao gerar Pix Mercado Pago:', errPix);
        }

        try {
          const itensPreference = carrinho.map(c => {
            const precoUnitario = calcularPrecoUnitarioPorTabela(
              c.produto,
              c.variacao,
              avaliacaoCarrinho.tabelaAtiva,
              avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? regrasAtivas.descontoAutoatacado : regrasAtivas.descontoAtacado
            );
            return {
              titulo: `${c.produto.nome}${c.variacao ? ` - ${c.variacao.valor_variacao_1}` : ''}`,
              quantidade: c.quantidade,
              precoUnitario: precoUnitario
            };
          });

          if (valorFreteEfetivo > 0) {
            itensPreference.push({
              titulo: `Frete / Entrega (${formaEntregaEscolhida?.nome || 'Padrão'})`,
              quantidade: 1,
              precoUnitario: valorFreteEfetivo
            });
          }

          const linkRes = await paymentGatewayService.gerarLinkMercadoPago({
            loja,
            itens: itensPreference,
            pedidoNumero: pedidoCriado.numero_pedido,
            clienteEmail: emailEfetivo
          });

          if (linkRes.sucesso && linkRes.linkPagamento) {
            linkPagamentoUrl = linkRes.linkPagamento;
            linkPreferenceId = linkRes.preferenceId || null;
          }
        } catch (errLink) {
          console.warn('Aviso ao gerar Link Mercado Pago:', errLink);
        }
      }

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

      const textoFormaPagamento = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.ativo
        ? 'A combinar / Mercado Pago'
        : 'A combinar com a loja';

      const msgWhatsApp = `🛍️ *NOVO PEDIDO ONLINE #${pedidoCriado.numero_pedido}*

Olá, ${loja.nome_fantasia}! Gostaria de confirmar meu pedido feito pelo catálogo online:

${itensMsg}

━━━━━━━━━━━━━━━━━━━━
🏷️ *Tabela Aplicada:* ${tabelaTexto}
${avaliacaoCarrinho.economiaTotal > 0 ? `💰 *Economia Obtida:* R$ ${avaliacaoCarrinho.economiaTotal.toFixed(2)}\n` : ''}💰 *Subtotal:* R$ ${subtotal.toFixed(2)}
🛵 *Entrega:* ${formaEntregaEscolhida?.nome || 'A combinar'} (+ R$ ${valorFrete.toFixed(2)})
💳 *Pagamento:* ${textoFormaPagamento}
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
      setPixAprovadoEmTempoReal(false);
      try {
        const slugKey = slug || window.location.pathname.split('/').pop() || 'default';
        sessionStorage.removeItem(`hubi_carrinho_catalogo_${slugKey}`);
      } catch (e) {}

      setPedidoConcluidoModal({
        numeroPedido: pedidoCriado.numero_pedido,
        whatsAppUrl: (loja.resumo_whatsapp ?? true) ? urlWhats : '',
        pixInfo: pixInfoRes?.sucesso ? pixInfoRes : null,
        linkPagamento: linkPagamentoUrl,
        preferenceId: linkPreferenceId,
        formaPagamentoEscolhida: 'a_combinar'
      });
    } catch (err: any) {
      console.error('Erro ao enviar pedido:', err);
      alert(`Erro ao finalizar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setEnviandoPedido(false);
    }
  };

  const handleAbrirCheckoutMP = () => {
    if (!pedidoConcluidoModal) return;

    const MP_SDK = (window as any).MercadoPago;
    const publicKey = loja?.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.public_key;

    if (MP_SDK && publicKey && pedidoConcluidoModal.preferenceId) {
      try {
        console.info('🚀 [Mercado Pago SDK] Abrindo Checkout Modal oficial (padrão TSB)...', {
          publicKey,
          preferenceId: pedidoConcluidoModal.preferenceId
        });
        const mp = new MP_SDK(publicKey.trim(), { locale: 'pt-BR' });
        mp.checkout({
          preference: { id: pedidoConcluidoModal.preferenceId },
          autoOpen: true,
        });
        return;
      } catch (err) {
        console.warn('⚠️ Falha ao abrir modal SDK, usando redirecionamento direto:', err);
      }
    }

    if (pedidoConcluidoModal.linkPagamento) {
      console.info('🌐 [Mercado Pago Fallback] Abrindo link de pagamento em nova aba:', pedidoConcluidoModal.linkPagamento);
      window.open(pedidoConcluidoModal.linkPagamento, '_blank');
    }
  };

  const getEstoqueTotal = (p: Produto) => {
    if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
      return p.variacoes.reduce((acc, v) => acc + Number(v.quantidade_estoque || 0), 0);
    }
    return Number(p.quantidade_estoque || 0);
  };

  const isProdutoEsgotado = (p: Produto): boolean => {
    if (p.tipo_item === 'servico') return false;
    const controlaEstoque = loja?.configuracoes_extras?.controlar_estoque !== false;
    if (!controlaEstoque) return false;
    return getEstoqueTotal(p) <= 0;
  };

  const isVariacaoEsgotada = (p: Produto, v: VariacaoProduto): boolean => {
    if (p.tipo_item === 'servico') return false;
    const controlaEstoque = loja?.configuracoes_extras?.controlar_estoque !== false;
    if (!controlaEstoque) return false;
    return Number(v.quantidade_estoque || 0) <= 0;
  };

  const catConfig = loja?.configuracoes_extras?.catalogo;
  const semEstoqueModo = catConfig?.produtos_sem_estoque || 'exibir';
  const exibirSemFoto = catConfig?.exibir_produtos_sem_foto ?? false;
  const bannerAtivo = (catConfig?.exibir_banner ?? Boolean(loja?.url_banner)) && Boolean(loja?.url_banner);
  const aceitaPedidos = loja?.aceita_pedidos_online ?? true;

  const categoriasOrdenadas = useMemo(() => {
    return [...categorias].sort((a, b) => {
      const pesoA = getCategoriaPeso(a.nome);
      const pesoB = getCategoriaPeso(b.nome);
      if (pesoA !== pesoB) return pesoA - pesoB;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [categorias]);

  const mapaCategorias = useMemo(() => {
    const mapa = new Map<string, { nome: string; peso: number }>();
    categorias.forEach(c => {
      mapa.set(c.id, { nome: c.nome, peso: getCategoriaPeso(c.nome) });
    });
    return mapa;
  }, [categorias]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    const filtrados = produtos.filter(p => {
      const matchBusca = !termo || p.nome.toLowerCase().includes(termo) || (p.codigo_interno && p.codigo_interno.toLowerCase().includes(termo));
      const matchCat = categoriaSelecionada === 'todas' || p.categoria_id === categoriaSelecionada;
      if (!matchCat) return false;

      // Regra de produtos sem estoque
      if (semEstoqueModo === 'ocultar') {
        if (p.tipo_item !== 'servico') {
          const est = getEstoqueTotal(p);
          if (est <= 0) return false;
        }
      }

      // Regra de produtos sem foto (padrão desligado / false)
      if (!exibirSemFoto) {
        const temFoto = p.fotos_urls && Array.isArray(p.fotos_urls) && p.fotos_urls.length > 0 && Boolean(p.fotos_urls[0]);
        if (!temFoto) return false;
      }

      return matchBusca;
    });

    // Ordenação com prioridade: 1º Cosméticos, 2º Brinquedos Eróticos, 3º Próteses, 4º Fantasias, 5º Couro/Sado
    return filtrados.sort((a, b) => {
      const pesoA = a.categoria_id ? (mapaCategorias.get(a.categoria_id)?.peso ?? 999) : 999;
      const pesoB = b.categoria_id ? (mapaCategorias.get(b.categoria_id)?.peso ?? 999) : 999;
      if (pesoA !== pesoB) return pesoA - pesoB;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [produtos, busca, categoriaSelecionada, semEstoqueModo, exibirSemFoto, mapaCategorias]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* HEADER PRINCIPAL DO CATÁLOGO COM COR DO TEMA */}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4"
      >
        {/* Identidade da Loja (Esquerda) */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
          {loja?.url_logo ? (
            <img src={loja.url_logo} alt={loja.nome_fantasia} className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-contain bg-slate-900 border border-slate-800 shrink-0" />
          ) : (
            <div
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-white shadow text-xs sm:text-base shrink-0"
              style={{ backgroundColor: corTema }}
            >
              {loja?.nome_fantasia ? loja.nome_fantasia.slice(0, 2).toUpperCase() : 'HB'}
            </div>
          )}
          <div className="min-w-0 hidden sm:block">
            <h1 className="font-extrabold text-xs sm:text-sm text-slate-100 leading-tight truncate">
              {loja?.nome_fantasia || 'Catálogo Online'}
            </h1>
            <span className="text-[10px] sm:text-[11px] font-medium flex items-center gap-1 truncate" style={{ color: aceitaPedidos ? corTema : '#94A3B8' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: aceitaPedidos ? corTema : '#64748B' }}></span>
              {aceitaPedidos ? 'Aberto para pedidos' : 'Modo Mostruário'}
            </span>
          </div>
        </div>

        {/* Mensagem solicitada na mesma linha do cabeçalho */}
        <div className="flex-1 px-1.5 sm:px-4 text-center min-w-0">
          <p className="text-[11px] sm:text-xs md:text-sm text-slate-200 font-medium leading-snug">
            Bem-vindo ao catálogo da <strong className="font-bold text-white">{loja?.nome_fantasia || 'Hotamazon'}</strong>. Faça seus pedidos online aqui.
          </p>
        </div>

        {/* Botão do Carrinho (Direita) */}
        <button
          onClick={() => setDrawerCarrinhoAberto(true)}
          className="relative px-3 sm:px-3.5 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 sm:gap-2 shadow-lg transition hover:brightness-110 cursor-pointer shrink-0"
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

      {loja?.sobre_loja && !loja.sobre_loja.toLowerCase().includes('faça seus pedidos online') && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-4 border-b border-slate-800/80 text-center">
          <p className="text-xs text-slate-300 max-w-xl mx-auto italic">
            "{loja.sobre_loja}"
          </p>
        </div>
      )}

      {/* BARRA FIXA: SELETOR DE CATEGORIAS, PESQUISA E MODOS DE EXIBIÇÃO */}
      <div
        className="sticky z-20 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 shadow-md py-2.5 sm:py-3 transition-all"
        style={{ top: `${headerHeight}px` }}
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Seletor Dropdown de Categorias */}
            <div className="relative w-full sm:w-56 md:w-64 shrink-0 order-2 sm:order-1">
              <Layers
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: corTema || '#10B981' }}
              />
              <select
                value={categoriaSelecionada}
                onChange={(e) => setCategoriaSelecionada(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-emerald-500 rounded-2xl pl-10 pr-9 py-2.5 sm:py-3 text-xs font-semibold text-slate-200 focus:outline-none transition appearance-none cursor-pointer shadow-xs"
                title="Filtrar produtos por categoria"
              >
                <option value="todas" className="bg-slate-900 text-slate-200">
                  Todas as Categorias ({produtos.length})
                </option>
                {categoriasOrdenadas.map((cat) => {
                  const totalCat = produtos.filter(p => p.categoria_id === cat.id).length;
                  return (
                    <option key={cat.id} value={cat.id} className="bg-slate-900 text-slate-200">
                      {cat.nome} ({totalCat})
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* BUSCA E SELETORES DE MODO DE EXIBIÇÃO */}
            <div className="flex items-center gap-2 flex-1 min-w-0 order-1 sm:order-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="O que você está procurando hoje?"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 sm:py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
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
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full p-4 space-y-4 flex-1">

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
              const esgotado = isProdutoEsgotado(produto);

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      onClick={() => setProdutoDetalhesModal(produto)}
                      className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-950 shrink-0 cursor-pointer hover:opacity-90 transition group/photo"
                      title="Clique para ver fotos e detalhes"
                    >
                      <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover group-hover/photo:scale-105 transition duration-200" />
                      {esgotado && (
                        <span className="absolute inset-0 bg-black/70 flex items-center justify-center text-[9px] font-black text-rose-300">
                          ESGOTADO
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3
                        onClick={() => setProdutoDetalhesModal(produto)}
                        className="font-bold text-xs sm:text-sm text-slate-100 truncate cursor-pointer hover:underline"
                        title="Ver detalhes do produto"
                      >
                        {produto.nome}
                      </h3>
                      {produto.descricao && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{formatarResumoDescricao(produto.descricao)}</p>
                      )}
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="font-black text-sm" style={{ color: corTema }}>
                          R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setProdutoDetalhesModal(produto)}
                      className="px-2.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer border border-slate-700"
                      title="Ver Detalhes do Produto"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                      <span className="hidden sm:inline">Detalhar</span>
                    </button>

                    <button
                      type="button"
                      disabled={esgotado}
                      onClick={() => {
                        if (esgotado) return;
                        if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                          setProdutoModalVariacao(produto);
                        } else {
                          adicionarAoCarrinho(produto);
                        }
                      }}
                      className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm ${
                        esgotado
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                          : 'text-white cursor-pointer hover:brightness-110'
                      }`}
                      style={{ backgroundColor: esgotado ? undefined : corTema }}
                    >
                      {esgotado ? (
                        <span>Esgotado</span>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Adicionar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : modoExibicaoPublico === 'instaview' ? (
          /* ================= MODO INSTAVIEW (FEED) ================= */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2 max-w-4xl mx-auto">
            {produtosFiltrados.map((produto) => {
              const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&auto=format&fit=crop&q=80';
              const esgotado = isProdutoEsgotado(produto);

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between"
                >
                  <div
                    onClick={() => setProdutoDetalhesModal(produto)}
                    className="relative aspect-square w-full bg-slate-950 cursor-pointer hover:opacity-95 transition group/photo"
                    title="Clique para ver fotos e detalhes"
                  >
                    <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover group-hover/photo:scale-102 transition duration-300" />
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
                      <h3
                        onClick={() => setProdutoDetalhesModal(produto)}
                        className="font-bold text-sm text-slate-100 cursor-pointer hover:underline"
                        title="Ver detalhes"
                      >
                        {produto.nome}
                      </h3>
                      {produto.descricao && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{formatarResumoDescricao(produto.descricao)}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <div>
                        <span className="text-base font-black" style={{ color: corTema }}>
                          R$ {Number(produto.promocao_ativa && produto.preco_promocional ? produto.preco_promocional : produto.preco_venda_varejo).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setProdutoDetalhesModal(produto)}
                          className="px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer border border-slate-700 shadow"
                          title="Ver detalhes do produto"
                        >
                          <Eye className="w-4 h-4 text-slate-400" />
                          <span>Detalhar</span>
                        </button>

                        <button
                          type="button"
                          disabled={esgotado}
                          onClick={() => {
                            if (esgotado) return;
                            if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                              setProdutoModalVariacao(produto);
                            } else {
                              adicionarAoCarrinho(produto);
                            }
                          }}
                          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition ${
                            esgotado
                              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                              : 'text-white cursor-pointer hover:brightness-110'
                          }`}
                          style={{ backgroundColor: esgotado ? undefined : corTema }}
                        >
                          {esgotado ? (
                            <span>Esgotado</span>
                          ) : (
                            <>
                              <ShoppingBag className="w-4 h-4" />
                              <span>Adicionar</span>
                            </>
                          )}
                        </button>
                      </div>
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
              const esgotado = isProdutoEsgotado(produto);

              return (
                <div
                  key={produto.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between shadow-sm hover:border-slate-700 transition group"
                >
                  <div>
                    <div
                      onClick={() => setProdutoDetalhesModal(produto)}
                      className="relative aspect-square rounded-xl overflow-hidden bg-slate-950 mb-2.5 cursor-pointer hover:opacity-95 transition group/photo"
                      title="Clique para ver fotos e detalhes"
                    >
                      <img
                        src={fotoUrl}
                        alt={produto.nome}
                        className="w-full h-full object-cover group-hover/photo:scale-105 transition duration-300"
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

                    <h3
                      onClick={() => setProdutoDetalhesModal(produto)}
                      className="font-bold text-xs text-slate-100 line-clamp-2 leading-snug cursor-pointer hover:underline"
                      title="Ver detalhes do produto"
                    >
                      {produto.nome}
                    </h3>
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

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setProdutoDetalhesModal(produto)}
                        className="p-2 rounded-xl flex items-center justify-center transition shadow-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                        title="Ver Detalhes do Produto"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                      </button>

                      <button
                        type="button"
                        disabled={esgotado}
                        onClick={() => {
                          if (esgotado) return;
                          if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                            setProdutoModalVariacao(produto);
                          } else {
                            adicionarAoCarrinho(produto);
                          }
                        }}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition shadow-sm font-bold ${
                          esgotado
                            ? 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed opacity-50'
                            : 'text-white cursor-pointer hover:brightness-110'
                        }`}
                        style={{ backgroundColor: esgotado ? undefined : corTema }}
                        title={esgotado ? 'Produto Esgotado' : 'Adicionar ao Pedido'}
                      >
                        {esgotado ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
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
              {produtoModalVariacao.variacoes?.map((variacao) => {
                const varEsgotada = isVariacaoEsgotada(produtoModalVariacao, variacao);

                return (
                  <button
                    key={variacao.id}
                    disabled={varEsgotada}
                    onClick={() => {
                      if (varEsgotada) return;
                      adicionarAoCarrinho(produtoModalVariacao, variacao);
                      setProdutoModalVariacao(null);
                    }}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition ${
                      varEsgotada
                        ? 'bg-slate-800/40 border-slate-800/80 opacity-50 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-slate-700/80 border-slate-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-xs ${varEsgotada ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                        {variacao.valor_variacao_1} {variacao.valor_variacao_2 ? `- ${variacao.valor_variacao_2}` : ''}
                      </span>
                      {varEsgotada && (
                        <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                          Esgotado
                        </span>
                      )}
                    </div>
                    <span className={`font-bold text-xs ${varEsgotada ? 'text-slate-500' : 'text-emerald-400'}`}>
                      R$ {Number(variacao.preco_venda_varejo).toFixed(2)}
                    </span>
                  </button>
                );
              })}
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
              <div className="flex items-center gap-2">
                {carrinho.length > 0 && (
                  <button
                    type="button"
                    onClick={handleLimparCarrinho}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/40 transition cursor-pointer"
                    title="Limpar todos os itens do carrinho"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrawerCarrinhoAberto(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* TERMÔMETROS ULTRA-COMPACTOS (ATACADO & FRETE GRÁTIS) */}
            {carrinho.length > 0 && (() => {
              const temRegraAtacado = Boolean(
                (loja?.qtd_minima_padrao_atacado && Number(loja.qtd_minima_padrao_atacado) > 0) ||
                (loja?.valor_minimo_padrao_atacado && Number(loja.valor_minimo_padrao_atacado) > 0) ||
                avaliacaoCarrinho.proximoNivel ||
                avaliacaoCarrinho.tabelaAtiva !== 'varejo'
              );

              const freteGratisAtivo = Boolean(configShippingLoja?.frete_gratis_ativo ?? loja?.frete_gratis_ativo);
              const valorMinimoFreteGratis = Number(configShippingLoja?.frete_gratis_valor_minimo ?? loja?.frete_gratis_valor_minimo) || 0;
              const temRegraFreteGratis = freteGratisAtivo && valorMinimoFreteGratis > 0;
              const faltaParaFreteGratis = Math.max(0, valorMinimoFreteGratis - subtotal);
              const percentualFreteGratis = valorMinimoFreteGratis > 0 
                ? Math.min(100, Math.round((subtotal / valorMinimoFreteGratis) * 100)) 
                : 0;

              if (!temRegraAtacado && !temRegraFreteGratis) return null;

              return (
                <div className="px-3.5 py-2.5 mx-4 mt-2 rounded-xl bg-slate-900 border border-slate-800 space-y-2 shadow-md">
                  {/* Linha 1: Atacado / Volume */}
                  {temRegraAtacado && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 flex items-center gap-1.5 truncate">
                          {avaliacaoCarrinho.proximoNivel ? (
                            <>
                              <Tag className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate">
                                Faltam <b className="text-emerald-400 font-bold">
                                  {(() => {
                                    const isAuto = avaliacaoCarrinho.proximoNivel === 'autoatacado';
                                    const qtdMin = isAuto ? loja?.qtd_minima_padrao_autoatacado : loja?.qtd_minima_padrao_atacado;
                                    const valMin = isAuto ? loja?.valor_minimo_padrao_autoatacado : loja?.valor_minimo_padrao_atacado;
                                    const tipoMin = isAuto ? loja?.tipo_minimo_padrao_autoatacado : loja?.tipo_minimo_padrao_atacado;

                                    if (tipoMin === 'quantidade' || (Number(qtdMin) > 0 && (!valMin || Number(valMin) === 0))) {
                                      const faltamPecas = avaliacaoCarrinho.faltaPecasParaProximo;
                                      return `${faltamPecas} ${faltamPecas === 1 ? 'peça' : 'peças'}`;
                                    }
                                    return `R$ ${avaliacaoCarrinho.faltaValorParaProximo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                  })()}
                                </b> para {avaliacaoCarrinho.proximoNivel === 'autoatacado' ? 'Autoatacado' : 'Atacado'}!
                              </span>
                            </>
                          ) : avaliacaoCarrinho.tabelaAtiva === 'autoatacado' ? (
                            <>
                              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                              <span className="text-amber-300 font-bold">Autoatacado Conquistado!</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="text-emerald-300 font-bold">Preço de Atacado Liberado!</span>
                            </>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {avaliacaoCarrinho.economiaTotal > 0 && (
                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              -R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-emerald-400">
                            {avaliacaoCarrinho.progressoGeralPercent}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                          style={{ width: `${avaliacaoCarrinho.progressoGeralPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Linha 2: Frete Grátis com Subsídio em Upgrade */}
                  {temRegraFreteGratis && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 flex items-center gap-1.5 truncate">
                          {subtotal >= valorMinimoFreteGratis ? (
                            <>
                              <Gift className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="text-emerald-300 font-bold truncate">🎉 Você ganhou Frete Grátis!</span>
                            </>
                          ) : (
                            <>
                              <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate">
                                Faltam <b className="text-emerald-400 font-bold">
                                  R$ {faltaParaFreteGratis.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </b> para Frete Grátis!
                              </span>
                            </>
                          )}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-400 shrink-0 ml-2">
                          {percentualFreteGratis}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-full transition-all duration-500"
                          style={{ width: `${percentualFreteGratis}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
                <form id="formCheckout" onSubmit={handleFinalizarPedido} className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-200 block">Identificação & Entrega</span>

                    {/* GRADE COM OS 3 BOTÕES */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setModalBuscaClienteAberto(true)}
                        className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/60 flex flex-col items-center justify-center text-center gap-1.5 transition cursor-pointer group shadow-sm"
                      >
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 flex items-center justify-center transition">
                          <UserCheck className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-200 group-hover:text-emerald-400 leading-tight">
                          Já tenho o cadastro
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalContatoAberto(true)}
                        className={`p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border ${
                          nomeCliente && whatsappCliente ? 'border-emerald-500/50' : 'border-slate-700'
                        } hover:border-sky-500/60 flex flex-col items-center justify-center text-center gap-1.5 transition cursor-pointer group shadow-sm relative`}
                      >
                        {nomeCliente && whatsappCliente && (
                          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400"></span>
                        )}
                        <div className={`w-8 h-8 rounded-xl ${
                          nomeCliente && whatsappCliente ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'
                        } group-hover:bg-sky-500 group-hover:text-slate-950 flex items-center justify-center transition`}>
                          <Phone className="w-4 h-4" />
                        </div>
                        <span className={`text-[11px] font-bold ${
                          nomeCliente && whatsappCliente ? 'text-emerald-400' : 'text-slate-200'
                        } group-hover:text-sky-400 leading-tight`}>
                          Contato
                        </span>
                      </button>

                      {(() => {
                        const temEnderecoPreenchido = Boolean(
                          enderecoEntrega ||
                          dadosEndereco.rua?.trim() ||
                          dadosEndereco.cep?.trim() ||
                          clienteSelecionado?.endereco_logradouro
                        );
                        return (
                          <button
                            type="button"
                            onClick={() => setModalEnderecoAberto(true)}
                            className={`p-3 rounded-2xl bg-slate-800 hover:bg-slate-750 border ${
                              temEnderecoPreenchido ? 'border-emerald-500/50' : 'border-slate-700'
                            } hover:border-emerald-500/60 flex flex-col items-center justify-center text-center gap-1.5 transition cursor-pointer group shadow-sm relative`}
                          >
                            {temEnderecoPreenchido && (
                              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400"></span>
                            )}
                            <div className={`w-8 h-8 rounded-xl ${
                              temEnderecoPreenchido ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/40 text-slate-300'
                            } group-hover:bg-emerald-500 group-hover:text-slate-950 flex items-center justify-center transition`}>
                              <MapPin className="w-4 h-4" />
                            </div>
                            <span className={`text-[11px] font-bold ${
                              temEnderecoPreenchido ? 'text-emerald-400' : 'text-slate-200'
                            } group-hover:text-emerald-400 leading-tight`}>
                              Endereço
                            </span>
                          </button>
                        );
                      })()}
                    </div>
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
              <div className="p-4 border-t border-slate-800 bg-slate-900/95 space-y-3">
                <div className="space-y-2">
                  {/* Linha Subtotal */}
                  <div className="flex items-center justify-between py-1 px-1">
                    <span className="text-sm font-medium text-slate-300 text-left">
                      Subtotal:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-100 tabular-nums w-28 text-right">
                        R$ {subtotal.toFixed(2)}
                      </span>
                      <div className="w-20 shrink-0" aria-hidden="true" />
                    </div>
                  </div>

                  {/* Desconto de Volume se houver */}
                  {avaliacaoCarrinho.economiaTotal > 0 && (
                    <div className="flex items-center justify-between py-0.5 px-1 text-emerald-400">
                      <span className="text-xs font-medium text-emerald-400 text-left">
                        Desconto de Volume ({avaliacaoCarrinho.tabelaAtiva}):
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-400 tabular-nums w-28 text-right">
                          - R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}
                        </span>
                        <div className="w-20 shrink-0" aria-hidden="true" />
                      </div>
                    </div>
                  )}

                  {/* Desconto de Cupom se houver */}
                  {descontoCupom > 0 && (
                    <div className="flex items-center justify-between py-0.5 px-1 text-emerald-400">
                      <span className="text-xs font-medium text-emerald-400 text-left">
                        Desconto Cupom ({cupomAplicado?.codigo}):
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-400 tabular-nums w-28 text-right">
                          - R$ {descontoCupom.toFixed(2)}
                        </span>
                        <div className="w-20 shrink-0" aria-hidden="true" />
                      </div>
                    </div>
                  )}

                  {/* Linha Forma de Entrega */}
                  <div className="flex items-center justify-between py-2 px-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                    <span className="text-sm font-medium text-slate-300 text-left">
                      Forma de Entrega:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums w-28 text-right truncate">
                        {!pedidoEntrega ? (
                          <span className="text-amber-400 font-medium text-xs">Não selecionada</span>
                        ) : pedidoEntrega.tipo_atendimento === 'retirada' ? (
                          <span className="text-slate-200 font-bold text-xs">Retirar na Loja</span>
                        ) : freteGratisCupom ? (
                          <span className="text-emerald-400">Grátis</span>
                        ) : valorFreteEfetivo > 0 ? (
                          <span className="text-emerald-400">R$ {valorFreteEfetivo.toFixed(2)}</span>
                        ) : (
                          <span className="text-emerald-400">Grátis</span>
                        )}
                      </span>

                      <div className="w-20 flex justify-end shrink-0">
                        <button
                          type="button"
                          onClick={handleClicarFormaEntregaCatalogo}
                          className={`px-2 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                            !pedidoEntrega
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm shadow-emerald-500/20'
                              : 'text-emerald-400 hover:text-emerald-300 underline'
                          }`}
                        >
                          {!pedidoEntrega ? 'Selecionar' : 'Alterar'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Linha Total do Pedido */}
                  <div className="flex items-center justify-between py-1.5 px-1 border-t border-slate-800 pt-2.5">
                    <span className="text-sm font-medium text-slate-300 text-left">
                      Total do Pedido:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-emerald-400 tabular-nums w-28 text-right">
                        R$ {total.toFixed(2)}
                      </span>
                      <div className="w-20 shrink-0" aria-hidden="true" />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFinalizarPedido}
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

            {/* SE PIX FOI APROVADO EM TEMPO REAL */}
            {pixAprovadoEmTempoReal && (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-center space-y-2 animate-in zoom-in-95 duration-200">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-black text-emerald-400">Pagamento Confirmado! 🎉</h4>
                <p className="text-xs text-slate-300">
                  Identificamos o seu pagamento com sucesso! O pedido está como <strong>PAGO</strong> e já foi enviado para a produção.
                </p>
                <Link
                  to={`/order-tracking/${pedidoConcluidoModal.numeroPedido}`}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-400 underline hover:text-emerald-300 font-semibold pt-1"
                  target="_blank"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Acompanhar status do pedido</span>
                </Link>
              </div>
            )}

            {/* BOTÃO PAGAR COM MERCADO PAGO */}
            {!pixAprovadoEmTempoReal && pedidoConcluidoModal.linkPagamento && (
              <button
                type="button"
                onClick={handleAbrirCheckoutMP}
                className="w-full py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-600/25 transition cursor-pointer"
              >
                <span>Pagar com Mercado Pago</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            )}

            <div className="space-y-2 pt-2">
              <Link
                to={`/order-tracking/${pedidoConcluidoModal.numeroPedido}`}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700"
                target="_blank"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                <span>Acompanhar Pedido #{pedidoConcluidoModal.numeroPedido}</span>
              </Link>

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
                onClick={() => {
                  setPedidoConcluidoModal(null);
                  setPixAprovadoEmTempoReal(false);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Voltar ao Catálogo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE RETORNO DO MERCADO PAGO */}
      {modalRetornoMP && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-lg ${
                modalRetornoMP.sucesso ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {modalRetornoMP.sucesso ? (
                <CheckCircle2 className="w-10 h-10" />
              ) : (
                <AlertTriangle className="w-10 h-10" />
              )}
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-100">
                {modalRetornoMP.sucesso ? `Pagamento Pedido #${modalRetornoMP.pedidoNumero} Confirmado!` : `Pagamento Pedido #${modalRetornoMP.pedidoNumero}`}
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {modalRetornoMP.mensagem}
              </p>
            </div>

            <div className="space-y-2 pt-2">
              {modalRetornoMP.sucesso && (
                <Link
                  to={`/order-tracking/${modalRetornoMP.pedidoNumero}`}
                  className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                  target="_blank"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Acompanhar Pedido Online</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setModalRetornoMP(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BUSCA CLIENTE (JÁ TENHO CADASTRO) */}
      {loja && (
        <ModalBuscaClienteCatalogo
          isOpen={modalBuscaClienteAberto}
          onClose={() => setModalBuscaClienteAberto(false)}
          lojaId={loja.id}
          onSelectCliente={handleSelecionarCliente}
        />
      )}

      {/* MODAL CONTATO DO CLIENTE */}
      <ModalContatoClienteCatalogo
        isOpen={modalContatoAberto}
        onClose={() => setModalContatoAberto(false)}
        dadosIniciais={dadosContato}
        onSalvar={handleSalvarContato}
      />

      {/* MODAL ENDEREÇO DO CLIENTE */}
      <ModalEnderecoClienteCatalogo
        isOpen={modalEnderecoAberto}
        onClose={() => setModalEnderecoAberto(false)}
        dadosIniciais={dadosEndereco}
        onSalvar={handleSalvarEndereco}
        clienteId={clienteSelecionado?.id || null}
        lojaId={loja?.id || null}
        cliente={clienteSelecionado}
      />

      {/* MODAL DETALHES DO PRODUTO NO CATÁLOGO */}
      {produtoDetalhesModal && (
        <ModalDetalhesProdutoCatalogo
          isOpen={Boolean(produtoDetalhesModal)}
          onClose={() => setProdutoDetalhesModal(null)}
          produto={produtoDetalhesModal}
          categoriaNome={
            produtoDetalhesModal.categoria_id
              ? mapaCategorias.get(produtoDetalhesModal.categoria_id)?.nome
              : (produtoDetalhesModal as any).categoria?.nome || 'Geral'
          }
          corTema={corTema}
          onAdicionarAoCarrinho={adicionarAoCarrinho}
          onAbrirModalVariacao={(prod) => setProdutoModalVariacao(prod)}
          onPerguntarRubi={(prod) => {
            setMensagemRubiExterna({
              id: Date.now(),
              texto: `Olá Rubi! Gostaria de tirar uma dúvida sobre o produto "${prod.nome}". Pode me dar mais informações sobre ele?`,
              produto: prod
            });
            setRubiAbertaExterna(true);
          }}
          onVerCarrinho={() => setDrawerCarrinhoAberto(true)}
          totalItensCarrinho={totalItens}
          valorTotalCarrinho={total}
          isEsgotado={isProdutoEsgotado(produtoDetalhesModal)}
        />
      )}

      {/* ASSISTENTE VIRTUAL RUBI IA NO CATÁLOGO */}
      {contextoRubi && (
        <ChatRubiCatalogo
          contexto={contextoRubi}
          onAdicionarAoCarrinho={adicionarAoCarrinho}
          onAbrirModalVariacao={(prod) => setProdutoModalVariacao(prod)}
          onClienteAtualizado={handleClienteAtualizadoPelaRubi}
          corTema={loja?.cor_primaria || '#6366f1'}
          mensagemExterna={mensagemRubiExterna}
          abertoExterno={rubiAbertaExterna}
          onFecharExterno={() => setRubiAbertaExterna(false)}
        />
      )}

      {/* MODAL DE SELEÇÃO DE FRETE E ENTREGA NO CATÁLOGO */}
      {modalShippingAberto && loja && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDraftResultadoShipping(null);
              setModalShippingAberto(false);
            }
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border-2 border-slate-600/80 rounded-3xl w-full max-w-xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-950/60 text-emerald-400 border border-emerald-500/20">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Escolha Como Deseja Receber
                  </h3>
                  <p className="text-xs text-slate-400">
                    Retirada presencial na loja física ou entrega no seu endereço
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraftResultadoShipping(null);
                  setModalShippingAberto(false);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ShippingFulfillmentSelector
              lojaId={loja.id}
              loja={loja}
              clienteId={clienteSelecionado?.id || null}
              cliente={{
                ...(clienteSelecionado || {}),
                id: clienteSelecionado?.id,
                nome: clienteSelecionado?.nome || nomeCliente,
                whatsapp: clienteSelecionado?.whatsapp || whatsappCliente,
                telefone: clienteSelecionado?.telefone || whatsappCliente,
                cep: dadosEndereco.cep || clienteSelecionado?.endereco_cep || clienteSelecionado?.cep,
                rua: dadosEndereco.rua || clienteSelecionado?.endereco_logradouro || clienteSelecionado?.rua,
                numero: dadosEndereco.numero || clienteSelecionado?.endereco_numero || clienteSelecionado?.numero,
                complemento: dadosEndereco.complemento || clienteSelecionado?.endereco_complemento || clienteSelecionado?.complemento,
                bairro: dadosEndereco.bairro || clienteSelecionado?.endereco_bairro || clienteSelecionado?.bairro,
                cidade: dadosEndereco.cidade || clienteSelecionado?.endereco_cidade || clienteSelecionado?.cidade,
                estado: dadosEndereco.estado || clienteSelecionado?.endereco_estado || clienteSelecionado?.estado,
                endereco_cep: dadosEndereco.cep || clienteSelecionado?.endereco_cep,
                endereco_logradouro: dadosEndereco.rua || clienteSelecionado?.endereco_logradouro,
                endereco_numero: dadosEndereco.numero || clienteSelecionado?.endereco_numero,
                endereco_complemento: dadosEndereco.complemento || clienteSelecionado?.endereco_complemento,
                endereco_bairro: dadosEndereco.bairro || clienteSelecionado?.endereco_bairro,
                endereco_cidade: dadosEndereco.cidade || clienteSelecionado?.endereco_cidade,
                endereco_estado: dadosEndereco.estado || clienteSelecionado?.endereco_estado
              }}
              subtotal={subtotal}
              itens={carrinho.map(i => ({
                nome: i.produto.nome,
                quantidade: i.quantidade,
                preco_unitario: i.produto.preco_venda_varejo || 0,
                peso_kg: (i.produto as any)?.peso_kg || 0.3,
                largura_cm: (i.produto as any)?.largura_cm || 15,
                altura_cm: (i.produto as any)?.altura_cm || 10,
                comprimento_cm: (i.produto as any)?.comprimento_cm || 20
              }))}
              valorFreteAtual={valorFrete}
              opcaoSelecionadaId={pedidoEntrega?.servico_codigo}
              tipoAtendimentoAtual={pedidoEntrega?.tipo_atendimento}
              onChange={(resultado) => {
                setDraftResultadoShipping(resultado);
              }}
            />

            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (draftResultadoShipping) {
                    const resultado = draftResultadoShipping;
                    setPedidoEntrega(resultado.pedido_entrega as PedidoEntrega);
                    if (resultado.tipo_atendimento === 'entrega' && resultado.endereco_selecionado) {
                      const end = resultado.endereco_selecionado;
                      const novoTxt = `${end.logradouro}, ${end.numero} ${end.complemento ? `(${end.complemento})` : ''} - ${end.bairro}, ${end.cidade}/${end.uf}`;
                      setEnderecoEntrega(novoTxt);
                      cartContext?.setEnderecoEntrega(novoTxt);
                      cartContext?.setDadosEndereco({
                        cep: end.cep,
                        rua: end.logradouro,
                        numero: end.numero,
                        complemento: end.complemento || '',
                        bairro: end.bairro,
                        cidade: end.cidade,
                        estado: end.uf
                      });
                    }
                    setFormaEntregaEscolhida({
                      id: resultado.tipo_atendimento === 'retirada' ? 'retirada' : 'entrega_shipping',
                      loja_id: loja.id,
                      nome: resultado.tipo_atendimento === 'retirada' 
                        ? 'Retirar na Loja' 
                        : (resultado.opcao_selecionada?.transportadora_nome || 'Entrega a Domicílio'),
                      tipo: resultado.tipo_atendimento === 'retirada' ? 'retirada' : 'taxa_fixa',
                      valor_taxa: resultado.valor_frete,
                      valor_por_km: 0,
                      tempo_estimado: resultado.opcao_selecionada?.prazo_estimado_texto || '60 minutos',
                      ativo: true
                    });
                    try {
                      cartContext?.setPedidoEntrega(resultado.pedido_entrega as PedidoEntrega);
                      cartContext?.setTaxaEntrega(resultado.valor_frete || 0);
                    } catch {
                      // Ignore
                    }
                  }
                  setModalShippingAberto(false);
                }}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition active:scale-95 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Confirmar Opção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
