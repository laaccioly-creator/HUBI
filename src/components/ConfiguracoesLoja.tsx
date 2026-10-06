import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Store,
  Settings,
  CreditCard,
  Truck,
  Receipt,
  Download,
  Share2,
  Lock,
  Package,
  Globe,
  Sliders,
  DollarSign,
  Info,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Plus,
  Trash2,
  Edit2,
  Layers,
  BarChart3,
  Mail,
  Printer,
  Copy,
  Calendar,
  Save,
  Search,
  ArrowLeft,
  ShoppingBag,
  ChevronDown,
  ChevronRight,
  Percent,
  Upload,
  Zap,
  Smartphone,
  X,
  Check,
  FileText,
  FileSpreadsheet,
  Sparkles,
  Key,
  ExternalLink,
  RefreshCw,
  Loader2,
  Gift,
  Target,
  Tag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { ShippingOrchestrator } from '../services/shippingOrchestrator';
import {
  Loja,
  FormaPagamento,
  FormaEntrega,
  Categoria,
  StatusPedidoPersonalizado,
  ModoExibicaoCatalogo,
  ComportamentoSemEstoque
} from '../types';
import { PrintService } from '../services/printService';
import { feedExportService } from '../services/feedExportService';
import { paymentGatewayService } from '../services/paymentGatewayService';
import { ImportarExportarProdutos } from './ImportarExportarProdutos';
import { CentralImportarExportar } from './CentralImportarExportar';
import { ConfiguracoesMetas } from './configuracoes/ConfiguracoesMetas';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import { setGoogleSearchConfig } from '../services/geminiService';
import { testarConexaoSerpApi, salvarSerpApiKey, obterSerpApiKey } from '../services/serpApiService';

type SubTelaConfig =
  | 'menu'
  | 'geral'
  | 'tipos-venda'
  | 'metas'
  | 'dados-loja'
  | 'produtos'
  | 'catalogo'
  | 'recibo'
  | 'pagamentos'
  | 'pagamentos-automaticos'
  | 'prazos-taxas'
  | 'pedidos-vendas'
  | 'status-pedidos'
  | 'entrega'
  | 'retirada'
  | 'exportar'
  | 'importar-exportar'
  | 'importar-exportar-produtos'
  | 'parceiros';

export const SEGMENTOS_NEGOCIO = [
  {
    id: 'restaurante',
    nome: 'Restaurante / Bar / Gastronomia',
    icone: '🍽️',
    papel: 'Maître & Atendente Gourmet',
    descricao: 'Pizzarias, lanchonetes, bares, confeitarias e delivery',
    exemploFala: 'Olá! Sou a Rubi, sua maître virtual! O que gostaria de saborear hoje? Temos pratos deliciosos, porções e bebidas especiais!'
  },
  {
    id: 'motepecas',
    nome: 'Motopeças / Autopeças / Oficina',
    icone: '🏍️',
    papel: 'Consultor Técnico Especialista',
    descricao: 'Peças para motos, carros, ferramentas e acessórios mecânicos',
    exemploFala: 'E aí, tudo bem? Sou a Rubi, especialista em peças automotivas e de motos. Qual o modelo e ano do seu veículo para eu indicar a peça certa?'
  },
  {
    id: 'moda',
    nome: 'Moda / Vestuário / Calçados',
    icone: '👗',
    papel: 'Consultora de Estilo e Moda',
    descricao: 'Roupas masculinas, femininas, infantis, sapatos e acessórios',
    exemploFala: 'Olá, que alegria ter você aqui! Sou a Rubi, sua consultora de moda e estilo. Procurando um look para o dia a dia ou para uma ocasião especial?'
  },
  {
    id: 'lingerie',
    nome: 'Lingerie / Moda Íntima / Praia',
    icone: '👙',
    papel: 'Consultora Íntima e Delicadeza',
    descricao: 'Lingeries, moda íntima, pijamas, moda praia e fitness',
    exemploFala: 'Olá! Sou a Rubi. Estou aqui para te ajudar a escolher as peças mais confortáveis e elegantes, com todo cuidado e discrição.'
  },
  {
    id: 'sexshop',
    nome: 'Sex Shop / Produtos Eróticos / Bem-Estar Íntimo',
    icone: '🔥',
    papel: 'Consultora Especialista em Produtos Eróticos',
    descricao: 'Vibradores, cosméticos eróticos, lubrificantes, fetiches, géis, fantasias e bem-estar sexual',
    exemploFala: 'Olá! Sou a Rubi, sua consultora de produtos eróticos e bem-estar íntimo. Estou aqui para tirar dúvidas com total discrição e te ajudar a escolher as melhores sensações e experiências!'
  },
  {
    id: 'cosmeticos',
    nome: 'Beleza / Cosméticos / Perfumes',
    icone: '💄',
    papel: 'Especialista em Beleza e Cuidados',
    descricao: 'Maquiagens, skincare, perfumes e produtos capilares',
    exemploFala: 'Olá! Sou a Rubi, sua consultora de beleza. Me conta: qual tipo de cuidado para pele, cabelo ou maquiagem você procura hoje?'
  },
  {
    id: 'mercado',
    nome: 'Mercado / Mercearia / Empório',
    icone: '🛒',
    papel: 'Atendente Prático de Compras',
    descricao: 'Alimentos, bebidas, hortifrúti, despensa e itens de limpeza',
    exemploFala: 'Olá! Sou a Rubi, pronta para te ajudar a encher a cesta com os melhores produtos e ofertas da nossa loja!'
  },
  {
    id: 'petshop',
    nome: 'Pet Shop / Veterinária / Agro',
    icone: '🐾',
    papel: 'Consultor Amigo dos Pets',
    descricao: 'Rações, brinquedos, medicamentos, petiscos e acessórios',
    exemploFala: 'Olá! Sou a Rubi, apaixonada por pets! Seu melhor amigo é um cãozinho, gato ou outro pet? Me conta o que ele está precisando!'
  },
  {
    id: 'eletronicos',
    nome: 'Eletrônicos / Celulares / Informática',
    icone: '📱',
    papel: 'Especialista em Tecnologia',
    descricao: 'Smartphones, cabos, carregadores, fones e periféricos',
    exemploFala: 'Fala aí! Sou a Rubi, especialista em eletrônicos. Qual aparelho ou acessório você precisa? Garanto compatibilidade e máxima performance!'
  },
  {
    id: 'farmacia',
    nome: 'Farmácia / Suplementos / Saúde',
    icone: '💊',
    papel: 'Consultor de Bem-Estar e Saúde',
    descricao: 'Suplementos esportivos, vitaminas e cuidados diários',
    exemploFala: 'Olá! Sou a Rubi, sua parceira de saúde e bem-estar. Posso te indicar as melhores opções em suplementos, vitaminas e cuidados diários!'
  },
  {
    id: 'construcao',
    nome: 'Construção / Ferramentas / Tintas',
    icone: '🛠️',
    papel: 'Consultor Prático de Reformas',
    descricao: 'Materiais elétricos, hidráulicos, ferramentas e reparos',
    exemploFala: 'Olá! Sou a Rubi, especialista em materiais e ferramentas. Qual reforma, conserto ou projeto você está executando hoje?'
  },
  {
    id: 'geral',
    nome: 'Varejo Geral / Outro Segmento',
    icone: '🏪',
    papel: 'Vendedora Consultiva Dedicada',
    descricao: 'Presentes, utilidades, papelaria e comércio variado',
    exemploFala: 'Olá! Sou a Rubi, sua consultora de compras. O que você gostaria de encontrar hoje? Posso te sugerir os melhores produtos e novidades!'
  }
];

const gerarSnapshotConfig = (dados: any) => {
  return JSON.stringify({
    moeda: dados.moeda || 'BR - R$',
    casasDecimais: Boolean(dados.casasDecimais),
    controlarEstoque: Boolean(dados.controlarEstoque),
    transacoesCanceladas: dados.transacoesCanceladas || 'riscadas',
    ordenarProdutosPdv: dados.ordenarProdutosPdv || 'cadastro',
    segmentoNegocio: dados.segmentoNegocio || 'geral',
    especialidadeNegocio: (dados.especialidadeNegocio || '').trim(),
    tomVozRubi: dados.tomVozRubi || 'consultivo',
    geminiApiKey: (dados.geminiApiKey || '').trim(),
    googleSearchApiKey: (dados.googleSearchApiKey || '').trim(),
    googleSearchCx: (dados.googleSearchCx || '').trim(),
    serpApiKey: (dados.serpApiKey || '').trim(),
    nomeLoja: (dados.nomeLoja || '').trim(),
    urlLogo: dados.urlLogo || '',
    telefone: (dados.telefone || '').trim(),
    whatsapp: (dados.whatsapp || '').trim(),
    email: (dados.email || '').trim(),
    instagram: (dados.instagram || '').trim(),
    sobreLoja: (dados.sobreLoja || '').trim(),
    enderecoLogradouro: (dados.enderecoLogradouro || '').trim(),
    enderecoNumero: (dados.enderecoNumero || '').trim(),
    enderecoBairro: (dados.enderecoBairro || '').trim(),
    enderecoComplemento: (dados.enderecoComplemento || '').trim(),
    enderecoCep: (dados.enderecoCep || '').trim(),
    enderecoCidade: (dados.enderecoCidade || '').trim(),
    enderecoEstado: dados.enderecoEstado || 'CE',
    documento: (dados.documento || '').trim(),
    razaoSocial: (dados.razaoSocial || '').trim(),
    reciboAdicionarCliente: Boolean(dados.reciboAdicionarCliente),
    reciboExibirCodigo: Boolean(dados.reciboExibirCodigo),
    reciboCabecalho: (dados.reciboCabecalho || '').trim(),
    reciboRodape: (dados.reciboRodape || '').trim(),
    tipoImpressaoPadrao: dados.tipoImpressaoPadrao || 'termica_80mm',
    provedorDigital: dados.provedorDigital || 'nenhum',
    mpPublicKey: (dados.mpPublicKey || '').trim(),
    mpAccessToken: (dados.mpAccessToken || '').trim(),
    mpTaxaCredito: Number(dados.mpTaxaCredito ?? 2.99),
    mpTaxaPix: Number(dados.mpTaxaPix ?? 0.99),
    mpPrazoDias: Number(dados.mpPrazoDias ?? 2),
    mpMaxParcelas: Number(dados.mpMaxParcelas ?? 10),
    pagseguroEmail: (dados.pagseguroEmail || '').trim(),
    pagseguroToken: (dados.pagseguroToken || '').trim(),
    pagseguroPublicKey: (dados.pagseguroPublicKey || '').trim(),
    googlePayMerchantId: (dados.googlePayMerchantId || '').trim(),
    asaasApiKey: (dados.asaasApiKey || '').trim(),
    asaasAmbiente: dados.asaasAmbiente || 'producao',
    stripePublishableKey: (dados.stripePublishableKey || '').trim(),
    stripeSecretKey: (dados.stripeSecretKey || '').trim(),
    picpayToken: (dados.picpayToken || '').trim(),
    picpaySellerToken: (dados.picpaySellerToken || '').trim(),
    pixAtivo: Boolean(dados.pixAtivo),
    pixChave: (dados.pixChave || '').trim(),
    pixOrientacoes: (dados.pixOrientacoes || '').trim(),
    dinheiroAtivo: Boolean(dados.dinheiroAtivo),
    dinheiroDescricao: (dados.dinheiroDescricao || '').trim(),
    debitoAtivo: Boolean(dados.debitoAtivo),
    debitoDescricao: (dados.debitoDescricao || '').trim(),
    creditoAtivo: Boolean(dados.creditoAtivo),
    creditoDescricao: (dados.creditoDescricao || '').trim(),
    outrosAtivo: Boolean(dados.outrosAtivo),
    outrosDescricao: (dados.outrosDescricao || '').trim(),
    permitirFiado: Boolean(dados.permitirFiado),
    maqCreditoAtivo: Boolean(dados.maqCreditoAtivo),
    maqCreditoDias: Number(dados.maqCreditoDias ?? 30),
    maqCreditoTaxa: Number(dados.maqCreditoTaxa ?? 2.99),
    maqDebitoAtivo: Boolean(dados.maqDebitoAtivo),
    maqDebitoDias: Number(dados.maqDebitoDias ?? 1),
    maqDebitoTaxa: Number(dados.maqDebitoTaxa ?? 1.49),
    usarTaxaVenda: Boolean(dados.usarTaxaVenda),
    nomeTaxaVenda: (dados.nomeTaxaVenda || 'Taxa de Serviço').trim(),
    valorTaxaVenda: Number(dados.valorTaxaVenda ?? 10),
    tipoTaxaVenda: dados.tipoTaxaVenda || 'percentual',
    aplicarTaxaVenda: dados.aplicarTaxaVenda || 'adicionar',
    taxaVendaOpcional: Boolean(dados.taxaVendaOpcional),
    usarTaxaCatalogo: Boolean(dados.usarTaxaCatalogo),
    nomeTaxaCatalogo: (dados.nomeTaxaCatalogo || 'Taxa de Conveniência').trim(),
    valorTaxaCatalogo: Number(dados.valorTaxaCatalogo ?? 5),
    tipoTaxaCatalogo: dados.tipoTaxaCatalogo || 'percentual',
    aplicarTaxaCatalogo: dados.aplicarTaxaCatalogo || 'adicionar',
    taxaCatalogoSomenteEntrega: Boolean(dados.taxaCatalogoSomenteEntrega),
    statusEmSeparacao: Boolean(dados.statusEmSeparacao ?? dados.statusEmProducao ?? true),
    statusEmExpedicao: Boolean(dados.statusEmExpedicao ?? true),
    statusAguardandoEnvio: Boolean(dados.statusAguardandoEnvio ?? true),
    statusEnviado: Boolean(dados.statusEnviado ?? dados.statusSaiuEntrega ?? true),
    statusEntregue: Boolean(dados.statusEntregue ?? true),
    statusProntoRetirar: Boolean(dados.statusProntoRetirar ?? true),
    trabalhoComEntregas: Boolean(dados.trabalhoComEntregas),
    descricaoEntregas: (dados.descricaoEntregas || '').trim(),
    trabalhoComRetirada: Boolean(dados.trabalhoComRetirada),
    descricaoRetirada: (dados.descricaoRetirada || '').trim(),
    freteGratisAtivo: Boolean(dados.freteGratisAtivo),
    freteGratisValorMinimo: Number(dados.freteGratisValorMinimo ?? 0),
    facebookPixelId: (dados.facebookPixelId || '').trim(),
    tiktokPixelId: (dados.tiktokPixelId || '').trim(),
    tipoVendaVarejo: Boolean(dados.tipoVendaVarejo ?? true),
    tipoVendaAtacado: Boolean(dados.tipoVendaAtacado ?? true),
    tipoVendaDistribuidor: Boolean(dados.tipoVendaDistribuidor ?? true)
  });
};

interface ConfiguracoesLojaProps {
  subTelaInicial?: SubTelaConfig;
}

export const ConfiguracoesLoja: React.FC<ConfiguracoesLojaProps> = ({ subTelaInicial }) => {
  const { loja, recarregarDadosLoja } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mostrarErro, mostrarSucesso, mostrarAviso, setTemAlteracoesNaoSalvas, verificarSaidaComConfirmacao } = useFeedbackModal();

  useEffect(() => {
    if (!permissions.podeAcessarConfig) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarConfig, navigate]);

  const location = useLocation();
  const [subTela, setSubTela] = useState<SubTelaConfig>('menu');
  const [salvando, setSalvando] = useState<boolean>(false);
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);
  const [mensagemToast, setMensagemToast] = useState<string>('');
  const [copiadoTexto, setCopiadoTexto] = useState<string>('');
  const [snapshotInicial, setSnapshotInicial] = useState<string>('');
  const salvouRecenteRef = useRef<boolean>(false);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (location.pathname.includes('tipos-venda') || subTelaInicial === 'tipos-venda' || tabParam === 'tipos-venda') {
      setSubTela('tipos-venda');
    } else if (tabParam) {
      setSubTela(tabParam as SubTelaConfig);
    } else if (subTelaInicial) {
      setSubTela(subTelaInicial);
    } else {
      setSubTela('menu');
    }
  }, [searchParams, location.pathname, subTelaInicial]);

  useEffect(() => {
    const handleResetSubTela = (e: any) => {
      if (!e?.detail?.path || e.detail.path === '/config' || e.detail.path === '/configuracoes') {
        setSubTela('menu');
      }
    };

    window.addEventListener('hubi_navegacao_menu', handleResetSubTela);
    window.addEventListener('hubi_reset_configuracoes', handleResetSubTela);
    return () => {
      window.removeEventListener('hubi_navegacao_menu', handleResetSubTela);
      window.removeEventListener('hubi_reset_configuracoes', handleResetSubTela);
    };
  }, []);

  // 1. GERAL
  const [moeda, setMoeda] = useState<string>('BR - R$');
  const [casasDecimais, setCasasDecimais] = useState<boolean>(true);
  const [controlarEstoque, setControlarEstoque] = useState<boolean>(true);
  const [transacoesCanceladas, setTransacoesCanceladas] = useState<'riscadas' | 'ocultar'>('riscadas');
  const [ordenarProdutosPdv, setOrdenarProdutosPdv] = useState<'cadastro' | 'alfabetica'>('cadastro');

  // 1.1 TIPOS DE VENDA ATIVOS (VAREJO, ATACADO, DISTRIBUIDOR)
  const [tipoVendaVarejo, setTipoVendaVarejo] = useState<boolean>(true);
  const [tipoVendaAtacado, setTipoVendaAtacado] = useState<boolean>(true);
  const [tipoVendaDistribuidor, setTipoVendaDistribuidor] = useState<boolean>(true);
  const [erroTiposVenda, setErroTiposVenda] = useState<string | null>(null);
  const [carregandoTiposVenda, setCarregandoTiposVenda] = useState<boolean>(false);
  const [salvandoTiposVenda, setSalvandoTiposVenda] = useState<boolean>(false);

  const carregarTiposVendaDoBanco = async () => {
    if (!loja?.id) return;
    try {
      setCarregandoTiposVenda(true);
      const { data, error } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', loja.id)
        .single();

      if (error) throw error;

      if (data) {
        const configBanco = (data as any)?.tipos_venda || (data as any)?.configuracoes_extras?.tipos_venda_ativos || {};
        setTipoVendaVarejo(configBanco.varejo !== false);
        setTipoVendaAtacado(configBanco.atacado !== false);
        setTipoVendaDistribuidor(configBanco.distribuidor !== false);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar tipos de venda diretamente do Supabase:', err);
    } finally {
      setCarregandoTiposVenda(false);
    }
  };

  useEffect(() => {
    if (subTela === 'tipos-venda' && loja?.id) {
      carregarTiposVendaDoBanco();
    }
  }, [subTela, loja?.id]);

  const handleToggleTipoVenda = (tipo: 'varejo' | 'atacado' | 'distribuidor') => {
    const atual = {
      varejo: tipoVendaVarejo,
      atacado: tipoVendaAtacado,
      distribuidor: tipoVendaDistribuidor
    };
    const novoValor = !atual[tipo];
    const proximos = { ...atual, [tipo]: novoValor };
    const ativos = Object.values(proximos).filter(Boolean).length;

    if (ativos === 0) {
      setErroTiposVenda('Pelo menos um modelo de venda deve permanecer ativo na loja.');
      setTimeout(() => setErroTiposVenda(null), 4000);
      return;
    }

    setErroTiposVenda(null);
    if (tipo === 'varejo') setTipoVendaVarejo(novoValor);
    if (tipo === 'atacado') setTipoVendaAtacado(novoValor);
    if (tipo === 'distribuidor') setTipoVendaDistribuidor(novoValor);
  };

  const handleSalvarTiposVenda = async () => {
    if (!loja?.id) return;

    if (!tipoVendaVarejo && !tipoVendaAtacado && !tipoVendaDistribuidor) {
      setErroTiposVenda('Pelo menos uma modalidade de venda deve permanecer ativa na loja.');
      mostrarAviso('Pelo menos uma modalidade de venda deve permanecer ativa.', 'Seleção Obrigatória');
      return;
    }

    try {
      setSalvandoTiposVenda(true);
      setErroTiposVenda(null);

      const payloadTiposVenda = {
        varejo: Boolean(tipoVendaVarejo),
        atacado: Boolean(tipoVendaAtacado),
        distribuidor: Boolean(tipoVendaDistribuidor)
      };

      const extrasAtuais = (loja as any)?.configuracoes_extras || {};
      const novasExtras = {
        ...extrasAtuais,
        tipos_venda_ativos: payloadTiposVenda
      };

      let erroDb: any = null;
      const resComColuna = await supabase
        .from('lojas')
        .update({
          tipos_venda: payloadTiposVenda,
          configuracoes_extras: novasExtras
        })
        .eq('id', loja.id);

      if (resComColuna.error) {
        if (resComColuna.error.code === '42703' || resComColuna.error.message?.includes('tipos_venda')) {
          const resFallback = await supabase
            .from('lojas')
            .update({
              configuracoes_extras: novasExtras
            })
            .eq('id', loja.id);
          erroDb = resFallback.error;
        } else {
          erroDb = resComColuna.error;
        }
      }

      if (erroDb) throw erroDb;

      salvouRecenteRef.current = true;
      await recarregarDadosLoja();
      setSnapshotInicial(snapshotAtual);
      setTemAlteracoesNaoSalvas(false);

      mostrarToast('Tipos de venda salvos no Supabase com sucesso!');
      mostrarSucesso('As modalidades de venda foram salvas no Supabase e sincronizadas com o PDV.', 'Configurações Salvas');
    } catch (err: any) {
      console.error('Erro ao salvar tipos de venda:', err);
      const msg = err?.message || 'Falha ao gravar modalidades no banco de dados. Verifique a conexão e permissões.';
      setErroTiposVenda(msg);
      mostrarErro(msg, 'Erro ao Salvar');
    } finally {
      setSalvandoTiposVenda(false);
    }
  };

  // 2. DADOS DA LOJA & IDENTIFICAÇÃO
  const [nomeLoja, setNomeLoja] = useState<string>('');
  const [urlLogo, setUrlLogo] = useState<string>('');
  const [telefone, setTelefone] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [instagram, setInstagram] = useState<string>('');
  const [sobreLoja, setSobreLoja] = useState<string>('');
  const [enderecoLogradouro, setEnderecoLogradouro] = useState<string>('');
  const [enderecoNumero, setEnderecoNumero] = useState<string>('');
  const [enderecoBairro, setEnderecoBairro] = useState<string>('');
  const [enderecoComplemento, setEnderecoComplemento] = useState<string>('');
  const [enderecoCep, setEnderecoCep] = useState<string>('');
  const [enderecoCidade, setEnderecoCidade] = useState<string>('');
  const [enderecoEstado, setEnderecoEstado] = useState<string>('CE');
  const [documento, setDocumento] = useState<string>('');
  const [razaoSocial, setRazaoSocial] = useState<string>('');

  // 2.1 PERFIL DO NEGÓCIO & ESPECIALIZAÇÃO DA RUBI IA
  const [segmentoNegocio, setSegmentoNegocio] = useState<string>('geral');
  const [especialidadeNegocio, setEspecialidadeNegocio] = useState<string>('');
  const [tomVozRubi, setTomVozRubi] = useState<'consultivo' | 'tecnico' | 'amigavel' | 'formal'>('consultivo');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [googleSearchApiKey, setGoogleSearchApiKey] = useState<string>('');
  const [googleSearchCx, setGoogleSearchCx] = useState<string>('');

  // 2.2 BUSCA DE FOTOS SERPAPI (BYOK)
  const [serpApiKey, setSerpApiKey] = useState<string>('');
  const [editandoSerpApiKey, setEditandoSerpApiKey] = useState<boolean>(false);
  const [testandoSerpApi, setTestandoSerpApi] = useState<boolean>(false);
  const [resultadoTesteSerpApi, setResultadoTesteSerpApi] = useState<{
    sucesso: boolean;
    mensagem: string;
    plano?: string;
    buscasRestantes?: number;
  } | null>(null);

  // 3. RECIBO
  const [reciboAdicionarCliente, setReciboAdicionarCliente] = useState<boolean>(true);
  const [reciboExibirCodigo, setReciboExibirCodigo] = useState<boolean>(false);
  const [reciboCabecalho, setReciboCabecalho] = useState<string>('');
  const [reciboRodape, setReciboRodape] = useState<string>('');
  const [tipoImpressaoPadrao, setTipoImpressaoPadrao] = useState<'termica_80mm' | 'termica_58mm' | 'a4'>('termica_80mm');
  const [modalPreviewRecibo, setModalPreviewRecibo] = useState<boolean>(false);

  // 4. MEIOS DE PAGAMENTO & GATEWAYS
  const [provedorDigital, setProvedorDigital] = useState<
    'nenhum' | 'mercado_pago' | 'pagseguro' | 'asaas' | 'stripe' | 'picpay' | 'google_pay'
  >('nenhum');
  const [modalProvedor, setModalProvedor] = useState<boolean>(false);

  const [mpPublicKey, setMpPublicKey] = useState<string>('');
  const [mpAccessToken, setMpAccessToken] = useState<string>('');
  const [mpAmbiente, setMpAmbiente] = useState<'producao' | 'sandbox'>('sandbox');
  const [mpTaxaCredito, setMpTaxaCredito] = useState<number>(2.99);
  const [mpTaxaPix, setMpTaxaPix] = useState<number>(0.99);
  const [mpPrazoDias, setMpPrazoDias] = useState<number>(2);
  const [mpMaxParcelas, setMpMaxParcelas] = useState<number>(10);

  const [pagseguroEmail, setPagseguroEmail] = useState<string>('');
  const [pagseguroToken, setPagseguroToken] = useState<string>('');
  const [pagseguroPublicKey, setPagseguroPublicKey] = useState<string>('');

  const [asaasApiKey, setAsaasApiKey] = useState<string>('');
  const [asaasAmbiente, setAsaasAmbiente] = useState<'producao' | 'sandbox'>('producao');

  const [stripePublishableKey, setStripePublishableKey] = useState<string>('');
  const [stripeSecretKey, setStripeSecretKey] = useState<string>('');

  const [picpayToken, setPicpayToken] = useState<string>('');
  const [picpaySellerToken, setPicpaySellerToken] = useState<string>('');

  const [googlePayMerchantId, setGooglePayMerchantId] = useState<string>('');

  // Meios Manuais / Presenciais
  const [pixAtivo, setPixAtivo] = useState<boolean>(true);
  const [pixChave, setPixChave] = useState<string>('');
  const [pixOrientacoes, setPixOrientacoes] = useState<string>('');
  const [dinheiroAtivo, setDinheiroAtivo] = useState<boolean>(true);
  const [dinheiroDescricao, setDinheiroDescricao] = useState<string>('');
  const [debitoAtivo, setDebitoAtivo] = useState<boolean>(true);
  const [debitoDescricao, setDebitoDescricao] = useState<string>('');
  const [creditoAtivo, setCreditoAtivo] = useState<boolean>(true);
  const [creditoDescricao, setCreditoDescricao] = useState<string>('');
  const [outrosAtivo, setOutrosAtivo] = useState<boolean>(false);
  const [outrosDescricao, setOutrosDescricao] = useState<string>('');
  const [permitirFiado, setPermitirFiado] = useState<boolean>(true);

  // Prazos e Taxas Maquininha
  const [maqCreditoAtivo, setMaqCreditoAtivo] = useState<boolean>(true);
  const [maqCreditoDias, setMaqCreditoDias] = useState<number>(30);
  const [maqCreditoTaxa, setMaqCreditoTaxa] = useState<number>(2.99);
  const [maqDebitoAtivo, setMaqDebitoAtivo] = useState<boolean>(true);
  const [maqDebitoDias, setMaqDebitoDias] = useState<number>(1);
  const [maqDebitoTaxa, setMaqDebitoTaxa] = useState<number>(1.49);

  // 5. PEDIDOS, VENDAS E TAXAS
  const [usarTaxaVenda, setUsarTaxaVenda] = useState<boolean>(false);
  const [nomeTaxaVenda, setNomeTaxaVenda] = useState<string>('Taxa de Serviço');
  const [valorTaxaVenda, setValorTaxaVenda] = useState<number>(10);
  const [tipoTaxaVenda, setTipoTaxaVenda] = useState<'percentual' | 'fixo'>('percentual');
  const [aplicarTaxaVenda, setAplicarTaxaVenda] = useState<'adicionar' | 'incluida'>('adicionar');
  const [taxaVendaOpcional, setTaxaVendaOpcional] = useState<boolean>(false);

  const [usarTaxaCatalogo, setUsarTaxaCatalogo] = useState<boolean>(false);
  const [nomeTaxaCatalogo, setNomeTaxaCatalogo] = useState<string>('Taxa de Conveniência');
  const [valorTaxaCatalogo, setValorTaxaCatalogo] = useState<number>(5);
  const [tipoTaxaCatalogo, setTipoTaxaCatalogo] = useState<'percentual' | 'fixo'>('percentual');
  const [aplicarTaxaCatalogo, setAplicarTaxaCatalogo] = useState<'adicionar' | 'incluida'>('adicionar');
  const [taxaCatalogoSomenteEntrega, setTaxaCatalogoSomenteEntrega] = useState<boolean>(true);

  // Status de Pedidos (Opcionais com fallback padrão)
  const [statusEmSeparacao, setStatusEmSeparacao] = useState<boolean>(true);
  const [statusEmExpedicao, setStatusEmExpedicao] = useState<boolean>(true);
  const [statusAguardandoEnvio, setStatusAguardandoEnvio] = useState<boolean>(true);
  const [statusEnviado, setStatusEnviado] = useState<boolean>(true);
  const [statusEntregue, setStatusEntregue] = useState<boolean>(true);
  const [statusProntoRetirar, setStatusProntoRetirar] = useState<boolean>(true);
  const [statusCustomizados, setStatusCustomizados] = useState<StatusPedidoPersonalizado[]>([]);
  const [novoStatusNome, setNovoStatusNome] = useState<string>('');
  const [modalNovoStatus, setModalNovoStatus] = useState<boolean>(false);

  // 6. ENTREGA E RETIRADA
  const [trabalhoComEntregas, setTrabalhoComEntregas] = useState<boolean>(true);
  const [descricaoEntregas, setDescricaoEntregas] = useState<string>(
    'Entregas feitas via UBER envios / Motoboy para Fortaleza e região metropolitana.'
  );
  const [trabalhoComRetirada, setTrabalhoComRetirada] = useState<boolean>(false);
  const [descricaoRetirada, setDescricaoRetirada] = useState<string>(
    'Retirada disponível no balcão da loja em horário comercial.'
  );
  const [freteGratisAtivo, setFreteGratisAtivo] = useState<boolean>(false);
  const [freteGratisValorMinimo, setFreteGratisValorMinimo] = useState<number | string>(0);
  const [listaFormasEntrega, setListaFormasEntrega] = useState<FormaEntrega[]>([]);

  // 7. EXPORTAÇÃO DE RELATÓRIOS
  const [dataInicioExport, setDataInicioExport] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
  );
  const [dataFimExport, setDataFimExport] = useState<string>(new Date().toISOString().split('T')[0]);
  const [exportarVendas, setExportarVendas] = useState<boolean>(true);
  const [exportarProdutos, setExportarProdutos] = useState<boolean>(false);
  const [exportarClientes, setExportarClientes] = useState<boolean>(false);
  const [modalExportConcluido, setModalExportConcluido] = useState<boolean>(false);

  // 8. INTEGRAÇÃO COM PARCEIROS
  const [facebookPixelId, setFacebookPixelId] = useState<string>('');
  const [tiktokPixelId, setTiktokPixelId] = useState<string>('');
  const [modalTutorialParceiro, setModalTutorialParceiro] = useState<string | null>(null);

  // Registros na pilha de navegação (ESC Desktop e Voltar Mobile)
  useRegisterOverlay(modalProvedor, () => setModalProvedor(false), 'config-modal-provedor');
  useRegisterOverlay(modalPreviewRecibo, () => setModalPreviewRecibo(false), 'config-modal-preview');
  useRegisterOverlay(modalExportConcluido, () => setModalExportConcluido(false), 'config-modal-export');
  useRegisterOverlay(modalNovoStatus, () => setModalNovoStatus(false), 'config-modal-status');
  useRegisterOverlay(drawerMenuAberto, () => setDrawerMenuAberto(false), 'config-drawer-menu');
  useRegisterOverlay(subTela !== 'menu', () => {
    verificarSaidaComConfirmacao(() => setSubTela('menu'));
  }, 'config-subtela');

  // Inicialização com dados da Loja
  useEffect(() => {
    if (loja) {
      if (salvouRecenteRef.current) {
        salvouRecenteRef.current = false;
        return;
      }
      const extras = loja.configuracoes_extras || {};
      const geral = extras.geral || {};
      const recibo = extras.recibo || {};
      const pagDigitais = extras.pagamentos_digitais || {};
      const mp = pagDigitais.mercado_pago || {};
      const pagSeg = pagDigitais.pagseguro || {};
      const gpay = pagDigitais.google_pay || {};
      const asaas = pagDigitais.asaas || {};
      const stripe = pagDigitais.stripe || {};
      const picpay = pagDigitais.picpay || {};
      const prazosMaq = extras.prazos_taxas_maquininhas || {};
      const pagManuais = extras.pagamentos || {};
      const taxas = extras.taxas_venda || {};
      const statusAtivos = extras.status_pedidos_ativos || {};
      const entregaRet = extras.entrega_retirada || {};
      const parceiros = extras.integracoes_parceiros || {};

      // Tipos de Venda
      const tiposVenda = extras.tipos_venda_ativos || {};
      setTipoVendaVarejo(tiposVenda.varejo !== false);
      setTipoVendaAtacado(tiposVenda.atacado !== false);
      setTipoVendaDistribuidor(tiposVenda.distribuidor !== false);

      // Geral
      setMoeda(geral.moeda || 'BR - R$');
      setCasasDecimais(geral.casas_decimais ?? extras.preferencias_gerais?.casas_decimais ?? true);
      setControlarEstoque(extras.controlar_estoque ?? geral.controlar_estoque ?? true);
      setTransacoesCanceladas(geral.transacoes_canceladas || extras.preferencias_gerais?.transacoes_canceladas || 'riscadas');
      setOrdenarProdutosPdv(geral.ordenar_produtos_pdv || 'cadastro');

      // Dados da Loja
      setNomeLoja(loja.nome_fantasia || '');
      setUrlLogo(loja.url_logo || '');
      setTelefone(loja.telefone || '');
      setWhatsapp(loja.whatsapp || '');
      setEmail(loja.email || '');
      setInstagram(loja.instagram || '');
      setSobreLoja(loja.sobre_loja || '');
      setEnderecoLogradouro(loja.endereco_logradouro || '');
      setEnderecoNumero(loja.endereco_numero || '');
      setEnderecoBairro(loja.endereco_bairro || '');
      setEnderecoComplemento(loja.endereco_complemento || '');
      setEnderecoCep(loja.endereco_cep || '');
      setEnderecoCidade(loja.endereco_cidade || '');
      setEnderecoEstado(loja.endereco_estado || 'CE');
      setDocumento(loja.numero_documento || '');
      setRazaoSocial(loja.razao_social || '');

      // Perfil do Negócio & Rubi IA
      const perfilNegocio = extras.perfil_negocio || {};
      setSegmentoNegocio(perfilNegocio.segmento || 'geral');
      setEspecialidadeNegocio(perfilNegocio.descricao_especialidade || '');
      setTomVozRubi(perfilNegocio.tom_voz || 'consultivo');
      const iaConfig = extras.ia || {};
      setGeminiApiKey(iaConfig.gemini_api_key || '');
      setGoogleSearchApiKey(iaConfig.google_search_api_key || localStorage.getItem('hubi_google_search_api_key') || '');
      setGoogleSearchCx(iaConfig.google_search_cx || localStorage.getItem('hubi_google_search_cx') || '');
      setSerpApiKey(loja.serpapi_key || iaConfig.serpapi_key || localStorage.getItem('hubi_serpapi_key') || '');

      // Recibo
      setReciboAdicionarCliente(recibo.adicionar_cliente ?? true);
      setReciboExibirCodigo(recibo.exibir_codigo_produto ?? false);
      setReciboCabecalho(recibo.cabecalho || '');
      setReciboRodape(recibo.rodape || '');
      setTipoImpressaoPadrao(recibo.tipo_impressao_padrao || 'termica_80mm');

      // Pagamentos Digitais
      const provAtivo =
        pagDigitais.provedor_ativo ||
        (mp.ativo
          ? 'mercado_pago'
          : pagSeg.ativo
          ? 'pagseguro'
          : asaas.ativo
          ? 'asaas'
          : stripe.ativo
          ? 'stripe'
          : picpay.ativo
          ? 'picpay'
          : gpay.ativo
          ? 'google_pay'
          : 'nenhum');
      setProvedorDigital(provAtivo as any);

      setMpPublicKey(mp.public_key || '');
      setMpAccessToken(mp.access_token || '');
      setMpAmbiente(mp.ambiente || 'sandbox');
      setMpTaxaCredito(Number(mp.taxa_credito_percentual ?? 2.99));
      setMpTaxaPix(Number(mp.taxa_pix_percentual ?? 0.99));
      setMpPrazoDias(Number(mp.prazo_dias ?? 2));
      setMpMaxParcelas(Number(mp.max_parcelas ?? 10));

      setPagseguroEmail(pagSeg.email || '');
      setPagseguroToken(pagSeg.token || '');
      setPagseguroPublicKey(pagSeg.public_key || '');

      setGooglePayMerchantId(gpay.merchant_id || '');

      setAsaasApiKey(asaas.api_key || '');
      setAsaasAmbiente(asaas.ambiente || 'producao');

      setStripePublishableKey(stripe.publishable_key || '');
      setStripeSecretKey(stripe.secret_key || '');

      setPicpayToken(picpay.token || '');
      setPicpaySellerToken(picpay.seller_token || '');

      // Pagamentos Manuais
      setPixAtivo(pagManuais.pix_ativo ?? true);
      setPixChave(pagManuais.pix_chave || loja.whatsapp || '');
      setPixOrientacoes(pagManuais.pix_orientacoes || '');
      setDinheiroAtivo(pagManuais.dinheiro_ativo ?? true);
      setDinheiroDescricao(pagManuais.dinheiro_orientacoes || '');
      setDebitoAtivo(pagManuais.debito_ativo ?? true);
      setDebitoDescricao(pagManuais.debito_orientacoes || '');
      setCreditoAtivo(pagManuais.credito_ativo ?? true);
      setCreditoDescricao(pagManuais.credito_orientacoes || '');
      setOutrosAtivo(pagManuais.outros_ativo ?? false);
      setOutrosDescricao(pagManuais.outros_orientacoes || '');
      setPermitirFiado(pagManuais.permitir_fiado ?? true);

      // Maquininhas Prazos
      setMaqCreditoAtivo(prazosMaq.credito_ativo ?? true);
      setMaqCreditoDias(Number(prazosMaq.credito_dias ?? 30));
      setMaqCreditoTaxa(Number(prazosMaq.credito_taxa_percentual ?? 2.99));
      setMaqDebitoAtivo(prazosMaq.debito_ativo ?? true);
      setMaqDebitoDias(Number(prazosMaq.debito_dias ?? 1));
      setMaqDebitoTaxa(Number(prazosMaq.debito_taxa_percentual ?? 1.49));

      // Taxas
      setUsarTaxaVenda(taxas.usar_taxa_pdv ?? false);
      setNomeTaxaVenda(taxas.nome_taxa_pdv || 'Taxa de Serviço');
      setValorTaxaVenda(Number(taxas.valor_taxa_pdv ?? 10));
      setTipoTaxaVenda(taxas.tipo_taxa_pdv || 'percentual');
      setAplicarTaxaVenda(taxas.aplicar_taxa_pdv || 'adicionar');
      setTaxaVendaOpcional(taxas.taxa_pdv_opcional ?? false);

      setUsarTaxaCatalogo(taxas.usar_taxa_catalogo ?? false);
      setNomeTaxaCatalogo(taxas.nome_taxa_catalogo || 'Taxa de Conveniência');
      setValorTaxaCatalogo(Number(taxas.valor_taxa_catalogo ?? 5));
      setTipoTaxaCatalogo(taxas.tipo_taxa_catalogo || 'percentual');
      setAplicarTaxaCatalogo(taxas.aplicar_taxa_catalogo || 'adicionar');
      setTaxaCatalogoSomenteEntrega(taxas.taxa_catalogo_somente_entrega ?? true);

      // Status Operacionais Opcionais (com fallback padrão)
      setStatusEmSeparacao(statusAtivos.em_separacao ?? statusAtivos.em_producao ?? true);
      setStatusEmExpedicao(statusAtivos.em_expedicao ?? true);
      setStatusAguardandoEnvio(statusAtivos.aguardando_envio ?? true);
      setStatusEnviado(statusAtivos.enviado ?? statusAtivos.saiu_para_entrega ?? true);
      setStatusEntregue(statusAtivos.entregue ?? true);
      setStatusProntoRetirar(statusAtivos.pronto_para_retirar ?? true);
      setStatusCustomizados(statusAtivos.status_personalizados || []);

      // Entrega / Retirada
      setTrabalhoComEntregas(entregaRet.trabalho_com_entregas ?? true);
      setDescricaoEntregas(entregaRet.descricao_entregas || '');
      const retiradaAtivaIni = loja.retirada_loja_ativa ?? entregaRet.trabalho_com_retirada ?? false;
      setTrabalhoComRetirada(retiradaAtivaIni);
      setDescricaoRetirada(entregaRet.descricao_retirada || '');
      const freteGratisAtivoIni = Boolean(loja.frete_gratis_ativo);
      const freteGratisValorMinIni = Number(loja.frete_gratis_valor_minimo ?? 0);
      setFreteGratisAtivo(freteGratisAtivoIni);
      setFreteGratisValorMinimo(freteGratisValorMinIni);

      let retBalcaoFinal = retiradaAtivaIni;
      let freteGratisFinal = freteGratisAtivoIni;
      let freteMinimoFinal = freteGratisValorMinIni;

      // Carga direta e prioritária da tabela loja_shipping_configs aguardada antes do snapshot
      const inicializarConfiguracoesAsync = async () => {
        try {
          const { data: configData, error: errShip } = await supabase
            .from('loja_shipping_configs')
            .select('*')
            .eq('loja_id', loja.id)
            .maybeSingle();

          if (!errShip && configData) {
            retBalcaoFinal = Boolean(configData.retirada_balcao_ativa);
            freteGratisFinal = Boolean(configData.frete_gratis_ativo);
            freteMinimoFinal = Number(configData.frete_gratis_valor_minimo) || 0;
            setTrabalhoComRetirada(retBalcaoFinal);
            setFreteGratisAtivo(freteGratisFinal);
            setFreteGratisValorMinimo(freteMinimoFinal);
          }
        } catch (err: unknown) {
          console.warn('Erro ao carregar shipping config:', err);
        }

        // Parceiros
        setFacebookPixelId(parceiros.facebook_pixel_id || '');
        setTiktokPixelId(parceiros.tiktok_pixel_id || '');

        setSnapshotInicial(
        gerarSnapshotConfig({
          telaInicialPadrao: geral.tela_inicial_padrao || 'inicio',
          moeda: geral.moeda || 'BR - R$',
          casasDecimais: geral.casas_decimais ?? extras.preferencias_gerais?.casas_decimais ?? true,
          controlarEstoque: extras.controlar_estoque ?? geral.controlar_estoque ?? true,
          transacoesCanceladas: geral.transacoes_canceladas || extras.preferencias_gerais?.transacoes_canceladas || 'riscadas',
          ordenarProdutosPdv: geral.ordenar_produtos_pdv || 'cadastro',
          segmentoNegocio: perfilNegocio.segmento || 'geral',
          especialidadeNegocio: perfilNegocio.descricao_especialidade || '',
          tomVozRubi: perfilNegocio.tom_voz || 'consultivo',
          geminiApiKey: iaConfig.gemini_api_key || '',
          googleSearchApiKey: iaConfig.google_search_api_key || localStorage.getItem('hubi_google_search_api_key') || '',
          googleSearchCx: iaConfig.google_search_cx || localStorage.getItem('hubi_google_search_cx') || '',
          serpApiKey: loja.serpapi_key || iaConfig.serpapi_key || localStorage.getItem('hubi_serpapi_key') || '',
          nomeLoja: loja.nome_fantasia || '',
          urlLogo: loja.url_logo || '',
          telefone: loja.telefone || '',
          whatsapp: loja.whatsapp || '',
          email: loja.email || '',
          instagram: loja.instagram || '',
          sobreLoja: loja.sobre_loja || '',
          enderecoLogradouro: loja.endereco_logradouro || '',
          enderecoNumero: loja.endereco_numero || '',
          enderecoBairro: loja.endereco_bairro || '',
          enderecoComplemento: loja.endereco_complemento || '',
          enderecoCep: loja.endereco_cep || '',
          enderecoCidade: loja.endereco_cidade || '',
          enderecoEstado: loja.endereco_estado || 'CE',
          documento: loja.numero_documento || '',
          razaoSocial: loja.razao_social || '',
          reciboAdicionarCliente: recibo.adicionar_cliente ?? true,
          reciboExibirCodigo: recibo.exibir_codigo_produto ?? false,
          reciboCabecalho: recibo.cabecalho || '',
          reciboRodape: recibo.rodape || '',
          tipoImpressaoPadrao: recibo.tipo_impressao_padrao || 'termica_80mm',
          provedorDigital: provAtivo,
          mpPublicKey: mp.public_key || '',
          mpAccessToken: mp.access_token || '',
          mpTaxaCredito: mp.taxa_credito_percentual ?? 2.99,
          mpTaxaPix: mp.taxa_pix_percentual ?? 0.99,
          mpPrazoDias: mp.prazo_dias ?? 2,
          mpMaxParcelas: mp.max_parcelas ?? 10,
          pagseguroEmail: pagSeg.email || '',
          pagseguroToken: pagSeg.token || '',
          pagseguroPublicKey: pagSeg.public_key || '',
          googlePayMerchantId: gpay.merchant_id || '',
          asaasApiKey: asaas.api_key || '',
          asaasAmbiente: asaas.ambiente || 'producao',
          stripePublishableKey: stripe.publishable_key || '',
          stripeSecretKey: stripe.secret_key || '',
          picpayToken: picpay.token || '',
          picpaySellerToken: picpay.seller_token || '',
          pixAtivo: pagManuais.pix_ativo ?? true,
          pixChave: pagManuais.pix_chave || loja.whatsapp || '',
          pixOrientacoes: pagManuais.pix_orientacoes || '',
          dinheiroAtivo: pagManuais.dinheiro_ativo ?? true,
          dinheiroDescricao: pagManuais.dinheiro_orientacoes || '',
          debitoAtivo: pagManuais.debito_ativo ?? true,
          debitoDescricao: pagManuais.debito_orientacoes || '',
          creditoAtivo: pagManuais.credito_ativo ?? true,
          creditoDescricao: pagManuais.credito_orientacoes || '',
          outrosAtivo: pagManuais.outros_ativo ?? false,
          outrosDescricao: pagManuais.outros_orientacoes || '',
          permitirFiado: pagManuais.permitir_fiado ?? true,
          maqCreditoAtivo: prazosMaq.credito_ativo ?? true,
          maqCreditoDias: prazosMaq.credito_dias ?? 30,
          maqCreditoTaxa: prazosMaq.credito_taxa_percentual ?? 2.99,
          maqDebitoAtivo: prazosMaq.debito_ativo ?? true,
          maqDebitoDias: prazosMaq.debito_dias ?? 1,
          maqDebitoTaxa: prazosMaq.debito_taxa_percentual ?? 1.49,
          usarTaxaVenda: taxas.usar_taxa_pdv ?? false,
          nomeTaxaVenda: taxas.nome_taxa_pdv || 'Taxa de Serviço',
          valorTaxaVenda: taxas.valor_taxa_pdv ?? 10,
          tipoTaxaVenda: taxas.tipo_taxa_pdv || 'percentual',
          aplicarTaxaVenda: taxas.aplicar_taxa_pdv || 'adicionar',
          taxaVendaOpcional: taxas.taxa_pdv_opcional ?? false,
          usarTaxaCatalogo: taxas.usar_taxa_catalogo ?? false,
          nomeTaxaCatalogo: taxas.nome_taxa_catalogo || 'Taxa de Conveniência',
          valorTaxaCatalogo: taxas.valor_taxa_catalogo ?? 5,
          tipoTaxaCatalogo: taxas.tipo_taxa_catalogo || 'percentual',
          aplicarTaxaCatalogo: taxas.aplicar_taxa_catalogo || 'adicionar',
          taxaCatalogoSomenteEntrega: taxas.taxa_catalogo_somente_entrega ?? true,
          statusEmSeparacao: statusAtivos.em_separacao ?? statusAtivos.em_producao ?? true,
          statusEmExpedicao: statusAtivos.em_expedicao ?? true,
          statusAguardandoEnvio: statusAtivos.aguardando_envio ?? true,
          statusEnviado: statusAtivos.enviado ?? statusAtivos.saiu_para_entrega ?? true,
          statusEntregue: statusAtivos.entregue ?? true,
          statusProntoRetirar: statusAtivos.pronto_para_retirar ?? true,
          trabalhoComEntregas: entregaRet.trabalho_com_entregas ?? true,
          trabalhoComRetirada: retBalcaoFinal,
          descricaoRetirada: entregaRet.descricao_retirada || '',
          freteGratisAtivo: freteGratisFinal,
          freteGratisValorMinimo: freteMinimoFinal,
          facebookPixelId: parceiros.facebook_pixel_id || '',
          tiktokPixelId: parceiros.tiktok_pixel_id || ''
        })
      );

      setTemAlteracoesNaoSalvas(false);
      carregarFormasEntrega();
    };

    inicializarConfiguracoesAsync();
  }
}, [loja]);

  const carregarFormasEntrega = async () => {
    if (!loja?.id) return;
    const { data } = await supabase
      .from('formas_entrega')
      .select('*')
      .eq('loja_id', loja.id)
      .order('criado_em');
    if (data) setListaFormasEntrega(data);
  };

  const mostrarToast = (msg: string) => {
    setMensagemToast(msg);
    setTimeout(() => setMensagemToast(''), 3500);
  };

  const copiarTexto = async (texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoTexto(label);
      setTimeout(() => setCopiadoTexto(''), 2500);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  const handleSalvarTodasConfiguracoes = async () => {
    if (!loja?.id) return;
    try {
      setSalvando(true);
      const extrasAtuais = loja.configuracoes_extras || {};

      const novasExtras = {
        ...extrasAtuais,
        tipos_venda_ativos: {
          varejo: tipoVendaVarejo,
          atacado: tipoVendaAtacado,
          distribuidor: tipoVendaDistribuidor
        },
        controlar_estoque: controlarEstoque,
        geral: {
          moeda,
          casas_decimais: casasDecimais,
          controlar_estoque: controlarEstoque,
          transacoes_canceladas: transacoesCanceladas,
          ordenar_produtos_pdv: ordenarProdutosPdv
        },
        preferencias_gerais: {
          casas_decimais: casasDecimais,
          controlar_estoque: controlarEstoque,
          transacoes_canceladas: transacoesCanceladas
        },
        recibo: {
          ...extrasAtuais.recibo,
          adicionar_cliente: reciboAdicionarCliente,
          exibir_codigo_produto: reciboExibirCodigo,
          cabecalho: reciboCabecalho,
          rodape: reciboRodape,
          tipo_impressao_padrao: tipoImpressaoPadrao
        },
        taxas_venda: {
          usar_taxa_pdv: usarTaxaVenda,
          nome_taxa_pdv: nomeTaxaVenda,
          valor_taxa_pdv: Number(valorTaxaVenda),
          tipo_taxa_pdv: tipoTaxaVenda,
          aplicar_taxa_pdv: aplicarTaxaVenda,
          taxa_pdv_opcional: taxaVendaOpcional,
          usar_taxa_catalogo: usarTaxaCatalogo,
          nome_taxa_catalogo: nomeTaxaCatalogo,
          valor_taxa_catalogo: Number(valorTaxaCatalogo),
          tipo_taxa_catalogo: tipoTaxaCatalogo,
          aplicar_taxa_catalogo: aplicarTaxaCatalogo,
          taxa_catalogo_somente_entrega: taxaCatalogoSomenteEntrega
        },
        status_pedidos_ativos: {
          em_separacao: statusEmSeparacao,
          em_expedicao: statusEmExpedicao,
          aguardando_envio: statusAguardandoEnvio,
          enviado: statusEnviado,
          entregue: statusEntregue,
          pronto_para_retirar: statusProntoRetirar,
          // Retrocompatibilidade
          em_producao: statusEmSeparacao,
          saiu_para_entrega: statusEnviado,
          status_personalizados: statusCustomizados
        },
        entrega_retirada: {
          trabalho_com_entregas: trabalhoComEntregas,
          descricao_entregas: descricaoEntregas,
          trabalho_com_retirada: trabalhoComRetirada,
          descricao_retirada: descricaoRetirada
        },
        pagamentos: {
          permitir_fiado: permitirFiado,
          pix_ativo: pixAtivo,
          pix_chave: pixChave,
          pix_orientacoes: pixOrientacoes,
          dinheiro_ativo: dinheiroAtivo,
          dinheiro_orientacoes: dinheiroDescricao,
          debito_ativo: debitoAtivo,
          debito_orientacoes: debitoDescricao,
          credito_ativo: creditoAtivo,
          credito_orientacoes: creditoDescricao,
          outros_ativo: outrosAtivo,
          outros_orientacoes: outrosDescricao
        },
        pagamentos_digitais: {
          provedor_ativo: provedorDigital,
          mercado_pago: {
            ativo: provedorDigital === 'mercado_pago',
            ambiente: mpAmbiente,
            public_key: mpPublicKey,
            access_token: mpAccessToken,
            taxa_credito_percentual: mpTaxaCredito,
            taxa_pix_percentual: mpTaxaPix,
            prazo_dias: mpPrazoDias,
            max_parcelas: mpMaxParcelas
          },
          pagseguro: {
            ativo: provedorDigital === 'pagseguro',
            email: pagseguroEmail,
            token: pagseguroToken,
            public_key: pagseguroPublicKey
          },
          google_pay: {
            ativo: provedorDigital === 'google_pay',
            merchant_id: googlePayMerchantId,
            merchant_name: nomeLoja
          },
          asaas: {
            ativo: provedorDigital === 'asaas',
            api_key: asaasApiKey,
            ambiente: asaasAmbiente
          },
          stripe: {
            ativo: provedorDigital === 'stripe',
            publishable_key: stripePublishableKey,
            secret_key: stripeSecretKey
          },
          picpay: {
            ativo: provedorDigital === 'picpay',
            token: picpayToken,
            seller_token: picpaySellerToken
          }
        },
        prazos_taxas_maquininhas: {
          credito_ativo: maqCreditoAtivo,
          credito_dias: maqCreditoDias,
          credito_taxa_percentual: maqCreditoTaxa,
          debito_ativo: maqDebitoAtivo,
          debito_dias: maqDebitoDias,
          debito_taxa_percentual: maqDebitoTaxa
        },
        integracoes_parceiros: {
          facebook_pixel_id: facebookPixelId,
          tiktok_pixel_id: tiktokPixelId,
          facebook_catalog_feed_ativo: true,
          google_merchant_feed_ativo: true
        },
        perfil_negocio: {
          segmento: segmentoNegocio,
          descricao_especialidade: especialidadeNegocio.trim(),
          tom_voz: tomVozRubi
        },
        ia: {
          gemini_api_key: geminiApiKey.trim(),
          google_search_api_key: googleSearchApiKey.trim(),
          google_search_cx: googleSearchCx.trim(),
          serpapi_key: serpApiKey.trim() || undefined
        }
      };

      const { error } = await supabase
        .from('lojas')
        .update({
          nome_fantasia: nomeLoja,
          razao_social: razaoSocial,
          numero_documento: documento,
          tipo_documento: documento.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF',
          telefone,
          whatsapp,
          email,
          instagram,
          sobre_loja: sobreLoja,
          url_logo: urlLogo,
          endereco_logradouro: enderecoLogradouro,
          endereco_numero: enderecoNumero,
          endereco_bairro: enderecoBairro,
          endereco_complemento: enderecoComplemento,
          endereco_cep: enderecoCep,
          endereco_cidade: enderecoCidade,
          endereco_estado: enderecoEstado,
          serpapi_key: serpApiKey.trim() || null,
          retirada_loja_ativa: Boolean(trabalhoComRetirada),
          frete_gratis_ativo: Boolean(freteGratisAtivo),
          frete_gratis_valor_minimo: typeof freteGratisValorMinimo === 'number'
            ? freteGratisValorMinimo
            : (parseFloat(String(freteGratisValorMinimo).replace(',', '.')) || 0.00),
          tipos_venda: {
            varejo: tipoVendaVarejo,
            atacado: tipoVendaAtacado,
            distribuidor: tipoVendaDistribuidor
          },
          configuracoes_extras: novasExtras
        })
        .eq('id', loja.id);

      if (error) {
        if (error.code === '42703' || error.message?.includes('tipos_venda')) {
          const { error: erroFallback } = await supabase
            .from('lojas')
            .update({
              nome_fantasia: nomeLoja,
              razao_social: razaoSocial,
              numero_documento: documento,
              tipo_documento: documento.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF',
              telefone,
              whatsapp,
              email,
              instagram,
              sobre_loja: sobreLoja,
              url_logo: urlLogo,
              endereco_logradouro: enderecoLogradouro,
              endereco_numero: enderecoNumero,
              endereco_bairro: enderecoBairro,
              endereco_complemento: enderecoComplemento,
              endereco_cep: enderecoCep,
              endereco_cidade: enderecoCidade,
              endereco_estado: enderecoEstado,
              serpapi_key: serpApiKey.trim() || null,
              retirada_loja_ativa: Boolean(trabalhoComRetirada),
              frete_gratis_ativo: Boolean(freteGratisAtivo),
              frete_gratis_valor_minimo: typeof freteGratisValorMinimo === 'number'
                ? freteGratisValorMinimo
                : (parseFloat(String(freteGratisValorMinimo).replace(',', '.')) || 0.00),
              configuracoes_extras: novasExtras
            })
            .eq('id', loja.id);
          if (erroFallback) throw erroFallback;
        } else {
          throw error;
        }
      }

      const valorMinimoNum = typeof freteGratisValorMinimo === 'number'
        ? freteGratisValorMinimo
        : (parseFloat(String(freteGratisValorMinimo).replace(',', '.')) || 0.00);

      // Inclusão obrigatória no Payload do UPDATE para loja_shipping_configs
      const payloadShipping = {
        retirada_balcao_ativa: Boolean(trabalhoComRetirada),
        retirada_loja_ativa: Boolean(trabalhoComRetirada),
        permite_retirada_loja: Boolean(trabalhoComRetirada),
        frete_gratis_ativo: Boolean(freteGratisAtivo),
        frete_gratis_valor_minimo: Number(valorMinimoNum) || 0.00,
        atualizado_em: new Date().toISOString(),
      };

      const { error: erroShipping } = await supabase
        .from('loja_shipping_configs')
        .update(payloadShipping)
        .eq('loja_id', loja.id);

      if (erroShipping) {
        console.error('Erro ao atualizar loja_shipping_configs:', erroShipping);
        alert('Erro ao salvar configurações no Supabase: ' + erroShipping.message);
        throw erroShipping;
      }

      await salvarSerpApiKey(serpApiKey.trim(), loja.id, loja);
      setGoogleSearchConfig(googleSearchApiKey.trim(), googleSearchCx.trim());
      salvouRecenteRef.current = true;
      setSnapshotInicial(snapshotAtual);
      setTemAlteracoesNaoSalvas(false);
      await recarregarDadosLoja();
      mostrarToast('Configurações salvas com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      mostrarErro(err.message || 'Tente novamente.', 'Erro ao salvar configurações');
    } finally {
      setSalvando(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !loja?.id) return;
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `logos/${loja.id}_${Date.now()}.${ext}`;

      let bucketEscolhido = 'produtos';
      let uploadRes = await supabase.storage.from(bucketEscolhido).upload(fileName, file, { upsert: true });

      if (uploadRes.error) {
        bucketEscolhido = 'fotos';
        uploadRes = await supabase.storage.from(bucketEscolhido).upload(fileName, file, { upsert: true });
      }

      if (!uploadRes.error) {
        const { data } = supabase.storage.from(bucketEscolhido).getPublicUrl(fileName);
        if (data?.publicUrl) {
          setUrlLogo(data.publicUrl);
          return;
        }
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') setUrlLogo(reader.result);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Erro no upload logo:', err);
    }
  };

  const handleExportarRelatorios = async () => {
    if (!loja?.id) return;
    try {
      setSalvando(true);
      if (exportarVendas) {
        const { data: vendas } = await supabase
          .from('pedidos')
          .select('*, cliente:clientes(*), forma_pagamento:formas_pagamento(*), itens:itens_pedido(*, produto:produtos(*))')
          .eq('loja_id', loja.id)
          .gte('data_venda', `${dataInicioExport}T00:00:00`)
          .lte('data_venda', `${dataFimExport}T23:59:59`);
        if (vendas) feedExportService.exportarCsvRelatorio('vendas', vendas, dataInicioExport, dataFimExport);
      }

      if (exportarProdutos) {
        const { data: prods } = await supabase
          .from('produtos')
          .select('*, categoria:categorias(*)')
          .eq('loja_id', loja.id);
        if (prods) feedExportService.exportarCsvRelatorio('produtos', prods, dataInicioExport, dataFimExport);
      }

      if (exportarClientes) {
        const { data: clients } = await supabase
          .from('clientes')
          .select('*')
          .eq('loja_id', loja.id);
        if (clients) feedExportService.exportarCsvRelatorio('clientes', clients, dataInicioExport, dataFimExport);
      }

      setModalExportConcluido(true);
    } catch (err: any) {
      mostrarErro(err.message, 'Erro na exportação');
    } finally {
      setSalvando(false);
    }
  };

  const snapshotAtual = useMemo(() => {
    return gerarSnapshotConfig({
      moeda,
      casasDecimais,
      controlarEstoque,
      transacoesCanceladas,
      ordenarProdutosPdv,
      segmentoNegocio,
      especialidadeNegocio,
      tomVozRubi,
      geminiApiKey,
      nomeLoja,
      urlLogo,
      telefone,
      whatsapp,
      email,
      instagram,
      sobreLoja,
      enderecoLogradouro,
      enderecoNumero,
      enderecoBairro,
      enderecoComplemento,
      enderecoCep,
      enderecoCidade,
      enderecoEstado,
      documento,
      razaoSocial,
      reciboAdicionarCliente,
      reciboExibirCodigo,
      reciboCabecalho,
      reciboRodape,
      tipoImpressaoPadrao,
      provedorDigital,
      mpPublicKey,
      mpAccessToken,
      mpTaxaCredito,
      mpTaxaPix,
      mpPrazoDias,
      mpMaxParcelas,
      pagseguroEmail,
      pagseguroToken,
      pagseguroPublicKey,
      googlePayMerchantId,
      asaasApiKey,
      asaasAmbiente,
      stripePublishableKey,
      stripeSecretKey,
      picpayToken,
      picpaySellerToken,
      pixAtivo,
      pixChave,
      pixOrientacoes,
      dinheiroAtivo,
      dinheiroDescricao,
      debitoAtivo,
      debitoDescricao,
      creditoAtivo,
      creditoDescricao,
      outrosAtivo,
      outrosDescricao,
      permitirFiado,
      maqCreditoAtivo,
      maqCreditoDias,
      maqCreditoTaxa,
      maqDebitoAtivo,
      maqDebitoDias,
      maqDebitoTaxa,
      usarTaxaVenda,
      nomeTaxaVenda,
      valorTaxaVenda,
      tipoTaxaVenda,
      aplicarTaxaVenda,
      taxaVendaOpcional,
      usarTaxaCatalogo,
      nomeTaxaCatalogo,
      valorTaxaCatalogo,
      tipoTaxaCatalogo,
      aplicarTaxaCatalogo,
      taxaCatalogoSomenteEntrega,
      statusEmSeparacao,
      statusEmExpedicao,
      statusAguardandoEnvio,
      statusEnviado,
      statusEntregue,
      statusProntoRetirar,
      trabalhoComEntregas,
      descricaoEntregas,
      trabalhoComRetirada,
      descricaoRetirada,
      freteGratisAtivo,
      freteGratisValorMinimo,
      facebookPixelId,
      tiktokPixelId,
      tipoVendaVarejo,
      tipoVendaAtacado,
      tipoVendaDistribuidor
    });
  }, [
    moeda,
    casasDecimais,
    controlarEstoque,
    transacoesCanceladas,
    ordenarProdutosPdv,
    segmentoNegocio,
    especialidadeNegocio,
    tomVozRubi,
    geminiApiKey,
    nomeLoja,
    urlLogo,
    telefone,
    whatsapp,
    email,
    instagram,
    sobreLoja,
    enderecoLogradouro,
    enderecoNumero,
    enderecoBairro,
    enderecoComplemento,
    enderecoCep,
    enderecoCidade,
    enderecoEstado,
    documento,
    razaoSocial,
    reciboAdicionarCliente,
    reciboExibirCodigo,
    reciboCabecalho,
    reciboRodape,
    tipoImpressaoPadrao,
    provedorDigital,
    mpPublicKey,
    mpAccessToken,
    mpTaxaCredito,
    mpTaxaPix,
    mpPrazoDias,
    mpMaxParcelas,
    pagseguroEmail,
    pagseguroToken,
    pagseguroPublicKey,
    googlePayMerchantId,
    asaasApiKey,
    asaasAmbiente,
    stripePublishableKey,
    stripeSecretKey,
    picpayToken,
    picpaySellerToken,
    pixAtivo,
    pixChave,
    pixOrientacoes,
    dinheiroAtivo,
    dinheiroDescricao,
    debitoAtivo,
    debitoDescricao,
    creditoAtivo,
    creditoDescricao,
    outrosAtivo,
    outrosDescricao,
    permitirFiado,
    maqCreditoAtivo,
    maqCreditoDias,
    maqCreditoTaxa,
    maqDebitoAtivo,
    maqDebitoDias,
    maqDebitoTaxa,
    usarTaxaVenda,
    nomeTaxaVenda,
    valorTaxaVenda,
    tipoTaxaVenda,
    aplicarTaxaVenda,
    taxaVendaOpcional,
    usarTaxaCatalogo,
    nomeTaxaCatalogo,
    valorTaxaCatalogo,
    tipoTaxaCatalogo,
    aplicarTaxaCatalogo,
    taxaCatalogoSomenteEntrega,
    statusEmSeparacao,
    statusEmExpedicao,
    statusAguardandoEnvio,
    statusEnviado,
    statusEntregue,
    statusProntoRetirar,
    trabalhoComEntregas,
    descricaoEntregas,
    trabalhoComRetirada,
    descricaoRetirada,
    freteGratisAtivo,
    freteGratisValorMinimo,
    facebookPixelId,
    tiktokPixelId,
    tipoVendaVarejo,
    tipoVendaAtacado,
    tipoVendaDistribuidor
  ]);

  const isDirty = Boolean(snapshotInicial && snapshotAtual !== snapshotInicial);

  useEffect(() => {
    setTemAlteracoesNaoSalvas(isDirty);
    return () => {
      setTemAlteracoesNaoSalvas(false);
    };
  }, [isDirty, setTemAlteracoesNaoSalvas]);

  // Itens do Menu Principal de Configurações em Botões
  const podeGerenciarMetas = permissions.ehOwner || permissions.ehAdmin || permissions.ehGerente || permissions.podeAcessarConfig;

  const itensMenu: { id: string; label: string; icon: any }[] = [
    { id: 'geral', label: 'Geral', icon: Settings },
    { id: 'tipos-venda', label: 'Tipos de Venda', icon: Tag },
    ...(podeGerenciarMetas ? [{ id: 'metas', label: 'Metas da Loja', icon: Target }] : []),
    { id: 'pagamentos', label: 'Opções de Pagamento', icon: CreditCard },
    { id: 'importar-exportar', label: 'Importar / Exportar', icon: FileSpreadsheet },
    { id: 'dados-loja', label: 'Dados da Loja', icon: Store },
    { id: 'catalogo', label: 'Catálogo Online', icon: Globe },
    { id: 'recibo', label: 'Meu Recibo', icon: Receipt },
    { id: 'pedidos-vendas', label: 'Pedidos e Vendas', icon: Percent },
    { id: 'entrega', label: 'Opções de Entrega', icon: Truck },
    { id: 'exportar', label: 'Exportar Relatórios', icon: Download },
    { id: 'parceiros', label: 'Integrar com Parceiros', icon: Share2 }
  ];

  return (
    <div className="h-full w-full overflow-hidden select-none">
      {/* 1. VISÃO MOBILE EXCLUSIVA (TEMA CLARO PADRÃO PEDIDOS/PRODUTOS) */}
      <div className="block md:hidden h-full flex flex-col overflow-y-auto bg-slate-50 text-slate-900 font-sans">
        {/* Header Superior Mobile */}
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            {subTela === 'menu' ? (
              <>
                <button
                  type="button"
                  onClick={() => verificarSaidaComConfirmacao(() => navigate(-1))}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                  title="Voltar"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => verificarSaidaComConfirmacao(() => setDrawerMenuAberto(true))}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                  title="Menu Principal"
                >
                  <div className="space-y-1">
                    <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
                    <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
                    <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
                  </div>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => verificarSaidaComConfirmacao(() => setSubTela('menu'))}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                title="Voltar ao menu de configurações"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="font-bold text-base text-slate-800">
              {subTela === 'menu' && 'Configurações'}
              {subTela === 'geral' && 'Geral'}
              {subTela === 'tipos-venda' && 'Tipos de Venda'}
              {subTela === 'metas' && 'Metas da Loja'}
              {subTela === 'pagamentos' && 'Opções de Pagamento'}
              {subTela === 'dados-loja' && 'Dados da Loja'}
              {subTela === 'recibo' && 'Meu Recibo'}
              {subTela === 'pedidos-vendas' && 'Pedidos e Vendas'}
              {subTela === 'entrega' && 'Opções de Entrega'}
              {subTela === 'exportar' && 'Exportar Relatórios'}
              {(subTela === 'importar-exportar' || subTela === 'importar-exportar-produtos') && 'Importar / Exportar'}
              {subTela === 'parceiros' && 'Integrações'}
            </h1>
          </div>

          {isDirty && (
            <button
              type="button"
              onClick={handleSalvarTodasConfiguracoes}
              disabled={salvando}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white text-xs shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>

        {/* Conteúdo Mobile */}
        <div className="p-4 space-y-4 flex-1">
          {/* MENU EM GRADE MOBILE */}
          {subTela === 'menu' && (
            <div className="grid grid-cols-2 gap-3">
              {itensMenu.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'catalogo') {
                      navigate('/catalog-config');
                    } else if (item.id === 'produtos') {
                      navigate('/auxiliares');
                    } else {
                      setSubTela(item.id as SubTelaConfig);
                    }
                  }}
                  className="p-4 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 flex flex-col items-center justify-center text-center gap-2.5 transition shadow-xs cursor-pointer"
                >
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-2xs">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-xs text-slate-800 leading-tight">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* SUBTELA GERAL MOBILE */}
          {subTela === 'geral' && (
            <div className="space-y-3">
              {/* Controlar Estoque */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                <div className="space-y-0.5 max-w-[75%]">
                  <span className="font-bold text-xs text-slate-800 block">Controlar estoque</span>
                  <span className="text-[11px] text-slate-500 block leading-tight">
                    Quando ligado, bloqueia vendas que excedam o estoque disponível no PDV e Catálogo.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={controlarEstoque}
                    onChange={(e) => setControlarEstoque(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Transações Canceladas */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
                <span className="text-xs font-bold text-slate-700 block">Transações canceladas</span>
                <div className="space-y-2">
                  {[
                    { id: 'riscadas', label: 'Exibir riscada' },
                    { id: 'ocultar', label: 'Ocultar' }
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                        transacoesCanceladas === opt.id
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs">{opt.label}</span>
                      <input
                        type="radio"
                        name="transacoesCanceladasMobile"
                        checked={transacoesCanceladas === opt.id}
                        onChange={() => setTransacoesCanceladas(opt.id as any)}
                        className="text-emerald-500 focus:ring-emerald-500 bg-white border-slate-300"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Ordenar produtos em Vender por */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
                <span className="text-xs font-bold text-slate-700 block">Ordenar produtos em Vender por</span>
                <div className="space-y-2">
                  {[
                    { id: 'cadastro', label: 'Data do cadastro' },
                    { id: 'alfabetica', label: 'Ordem alfabética A-Z' }
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                        ordenarProdutosPdv === opt.id
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs">{opt.label}</span>
                      <input
                        type="radio"
                        name="ordenarProdutosPdvMobile"
                        checked={ordenarProdutosPdv === opt.id}
                        onChange={() => setOrdenarProdutosPdv(opt.id as any)}
                        className="text-emerald-500 focus:ring-emerald-500 bg-white border-slate-300"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SUBTELA DADOS DA LOJA MOBILE */}
          {subTela === 'dados-loja' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Identificação</span>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nome Fantasia da Loja</label>
                <input
                  type="text"
                  value={nomeLoja}
                  onChange={(e) => setNomeLoja(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-bold focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">WhatsApp da Loja</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">CPF ou CNPJ</label>
                <input
                  type="text"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-mono focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Razão Social</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-tight bg-slate-100/70 p-2.5 rounded-xl border border-slate-200">
                Estes dados não serão exibidos no catálogo público. O CPF ou CNPJ é utilizado para emissão fiscal e integrações de logística.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Endereço da Loja</label>
                <input
                  type="text"
                  value={enderecoLogradouro}
                  onChange={(e) => setEnderecoLogradouro(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:bg-white"
                />
              </div>
            </div>
          )}

          {/* SUBTELA MEU RECIBO MOBILE */}
          {subTela === 'recibo' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Cabeçalho do Recibo</label>
                <textarea
                  rows={2}
                  value={reciboCabecalho}
                  onChange={(e) => setReciboCabecalho(e.target.value)}
                  placeholder="Ex: Agradecemos a preferência!"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Rodapé do Recibo</label>
                <textarea
                  rows={2}
                  value={reciboRodape}
                  onChange={(e) => setReciboRodape(e.target.value)}
                  placeholder="Ex: Volte sempre!"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <button
                type="button"
                onClick={() => setModalPreviewRecibo(true)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>Visualizar Preview do Recibo</span>
              </button>
            </div>
          )}

          {/* SUBTELA EXPORTAR RELATÓRIOS MOBILE */}
          {subTela === 'exportar' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Relatórios e Feeds</span>
              <p className="text-xs text-slate-600">
                Exporte produtos e relatórios de vendas para planilhas ou integre com o catálogo do Facebook / Google Shopping.
              </p>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/c/${loja?.slug_catalogo || ''}`);
                  setMensagemToast('Link do catálogo copiado!');
                  setTimeout(() => setMensagemToast(''), 3000);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 flex items-center justify-center gap-2 transition"
              >
                <Share2 className="w-4 h-4" />
                <span>Copiar Link do Catálogo Público</span>
              </button>
            </div>
          )}

          {/* SUBTELA IMPORTAR E EXPORTAR MOBILE */}
          {(subTela === 'importar-exportar' || subTela === 'importar-exportar-produtos') && (
            <CentralImportarExportar onVoltar={() => setSubTela('menu')} />
          )}

          {/* SUBTELA PAGAMENTOS MOBILE */}
          {subTela === 'pagamentos' && (
            <div className="space-y-4">
              {/* Integração Digital / Provedores */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Integração de Pagamento Digital
                </span>

                <div
                  onClick={() => setModalProvedor(true)}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 flex items-center justify-between cursor-pointer transition"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                        provedorDigital === 'mercado_pago'
                          ? 'bg-sky-50 text-sky-600 border border-sky-200'
                          : provedorDigital === 'pagseguro'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          : provedorDigital === 'asaas'
                          ? 'bg-purple-50 text-purple-600 border border-purple-200'
                          : provedorDigital === 'stripe'
                          ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                          : provedorDigital === 'picpay'
                          ? 'bg-teal-50 text-teal-600 border border-teal-200'
                          : provedorDigital === 'google_pay'
                          ? 'bg-amber-50 text-amber-600 border border-amber-200'
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                      }`}
                    >
                      {provedorDigital === 'mercado_pago' && 'MP'}
                      {provedorDigital === 'pagseguro' && 'PAG'}
                      {provedorDigital === 'asaas' && 'AS'}
                      {provedorDigital === 'stripe' && 'ST'}
                      {provedorDigital === 'picpay' && 'PIC'}
                      {provedorDigital === 'google_pay' && 'GP'}
                      {provedorDigital === 'nenhum' && <Lock className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-800">Provedor Ativo</span>
                        {provedorDigital !== 'nenhum' ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                            ATIVO
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            DESATIVADO
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-sky-600 block mt-0.5">
                        {provedorDigital === 'mercado_pago' && 'Mercado Pago'}
                        {provedorDigital === 'pagseguro' && 'PagBank (PagSeguro)'}
                        {provedorDigital === 'asaas' && 'Asaas'}
                        {provedorDigital === 'stripe' && 'Stripe'}
                        {provedorDigital === 'picpay' && 'PicPay E-commerce'}
                        {provedorDigital === 'google_pay' && 'Google Pay'}
                        {provedorDigital === 'nenhum' && 'Toque para escolher o provedor'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>

                {/* Mercado Pago */}
                {provedorDigital === 'mercado_pago' && (
                  <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-sky-700">Credenciais Mercado Pago</span>
                      <button
                        type="button"
                        onClick={() => setProvedorDigital('nenhum')}
                        className="text-[11px] text-rose-500 font-bold hover:underline cursor-pointer"
                      >
                        Desativar
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">Ambiente</label>
                      <select
                        value={mpAmbiente}
                        onChange={(e) => setMpAmbiente(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:bg-white font-semibold"
                      >
                        <option value="sandbox">Ambiente de Teste (Sandbox)</option>
                        <option value="producao">Ambiente Real (Produção)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">
                        Access Token {mpAmbiente === 'sandbox' ? '(Credenciais de Teste)' : '(Produção)'}
                      </label>
                      <input
                        type="password"
                        value={mpAccessToken}
                        onChange={(e) => setMpAccessToken(e.target.value)}
                        placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">Public Key</label>
                      <input
                        type="text"
                        value={mpPublicKey}
                        onChange={(e) => setMpPublicKey(e.target.value)}
                        placeholder="APP_USR-xxxxxxxx"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:border-sky-500 focus:bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 block">Taxa Pix (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={mpTaxaPix}
                          onChange={(e) => setMpTaxaPix(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 block">Taxa Crédito (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={mpTaxaCredito}
                          onChange={(e) => setMpTaxaCredito(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:border-sky-500 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* PagBank / PagSeguro */}
                {provedorDigital === 'pagseguro' && (
                  <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-emerald-700">Credenciais PagBank</span>
                      <button
                        type="button"
                        onClick={() => setProvedorDigital('nenhum')}
                        className="text-[11px] text-rose-500 font-bold hover:underline cursor-pointer"
                      >
                        Desativar
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">E-mail da Conta</label>
                      <input
                        type="email"
                        value={pagseguroEmail}
                        onChange={(e) => setPagseguroEmail(e.target.value)}
                        placeholder="seu-email@pagseguro.com.br"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">Token</label>
                      <input
                        type="password"
                        value={pagseguroToken}
                        onChange={(e) => setPagseguroToken(e.target.value)}
                        placeholder="Token gerado no painel"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Asaas */}
                {provedorDigital === 'asaas' && (
                  <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-purple-700">Credenciais Asaas</span>
                      <button
                        type="button"
                        onClick={() => setProvedorDigital('nenhum')}
                        className="text-[11px] text-rose-500 font-bold hover:underline cursor-pointer"
                      >
                        Desativar
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">API Key ($aact_...)</label>
                      <input
                        type="password"
                        value={asaasApiKey}
                        onChange={(e) => setAsaasApiKey(e.target.value)}
                        placeholder="$aact_..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Stripe */}
                {provedorDigital === 'stripe' && (
                  <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-indigo-700">Credenciais Stripe</span>
                      <button
                        type="button"
                        onClick={() => setProvedorDigital('nenhum')}
                        className="text-[11px] text-rose-500 font-bold hover:underline cursor-pointer"
                      >
                        Desativar
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">Publishable Key</label>
                      <input
                        type="text"
                        value={stripePublishableKey}
                        onChange={(e) => setStripePublishableKey(e.target.value)}
                        placeholder="pk_live_..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Meios Presenciais / Balcão */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Meios de Pagamento Aceitos
                </span>
                <div className="space-y-2">
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                    <span className="text-xs font-bold text-slate-700">Pix (Manual / Chave)</span>
                    <input
                      type="checkbox"
                      checked={pixAtivo}
                      onChange={(e) => setPixAtivo(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                  {pixAtivo && (
                    <input
                      type="text"
                      value={pixChave}
                      onChange={(e) => setPixChave(e.target.value)}
                      placeholder="Chave Pix (CNPJ, E-mail, Celular, etc.)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
                    />
                  )}
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                    <span className="text-xs font-bold text-slate-700">Dinheiro</span>
                    <input
                      type="checkbox"
                      checked={dinheiroAtivo}
                      onChange={(e) => setDinheiroAtivo(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                    <span className="text-xs font-bold text-slate-700">Cartão de Débito</span>
                    <input
                      type="checkbox"
                      checked={debitoAtivo}
                      onChange={(e) => setDebitoAtivo(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                    <span className="text-xs font-bold text-slate-700">Cartão de Crédito</span>
                    <input
                      type="checkbox"
                      checked={creditoAtivo}
                      onChange={(e) => setCreditoAtivo(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* SUBTELA METAS MOBILE */}
          {subTela === 'metas' && (
            <ConfiguracoesMetas
              lojaId={loja?.id}
              onVoltar={() => setSubTela('menu')}
            />
          )}

          {/* SUBTELA TIPOS DE VENDA MOBILE */}
          {subTela === 'tipos-venda' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
                <span className="font-bold text-sm text-slate-800 block">Modalidades de Venda da Loja</span>
                <span className="text-xs text-slate-500 block leading-relaxed">
                  Defina quais modalidades de preço estão ativas na sua operação. Pelo menos uma deve permanecer habilitada.
                </span>
              </div>

              {carregandoTiposVenda && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs flex items-center gap-2 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                  <span>Sincronizando dados com o Supabase...</span>
                </div>
              )}

              {erroTiposVenda && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>{erroTiposVenda}</span>
                </div>
              )}

              <div className="space-y-3">
                {/* Varejo */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                  <div className="space-y-0.5 max-w-[75%]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-800">Varejo</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Padrão</span>
                    </div>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Venda unitária padrão no PDV e catálogo virtual.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={tipoVendaVarejo}
                      onChange={() => handleToggleTipoVenda('varejo')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Atacado */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                  <div className="space-y-0.5 max-w-[75%]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-800">Atacado</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Volume</span>
                    </div>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Preço reduzido por quantidade mínima ou valor mínimo atingido.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={tipoVendaAtacado}
                      onChange={() => handleToggleTipoVenda('atacado')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Distribuidor */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                  <div className="space-y-0.5 max-w-[75%]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-800">Distribuidor</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Lotes/Fardos</span>
                    </div>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Preço especial para caixas fechadas, lotes e fardos.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={tipoVendaDistribuidor}
                      onChange={() => handleToggleTipoVenda('distribuidor')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleSalvarTiposVenda}
                  disabled={salvandoTiposVenda || (!tipoVendaVarejo && !tipoVendaAtacado && !tipoVendaDistribuidor)}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {salvandoTiposVenda ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando no Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Salvar Tipos de Venda</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSubTela('menu')}
                  className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition"
                >
                  Voltar ao Menu
                </button>
              </div>
            </div>
          )}

          {/* DEMAIS SUBTELAS */}
          {subTela !== 'menu' && subTela !== 'geral' && subTela !== 'tipos-venda' && subTela !== 'dados-loja' && subTela !== 'recibo' && subTela !== 'exportar' && subTela !== 'pagamentos' && subTela !== 'metas' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-800">Configurações desta seção</h3>
              <p className="text-xs text-slate-500">
                Para configurações avançadas desta categoria, você também pode acessar pelo computador.
              </p>
              <button
                type="button"
                onClick={() => setSubTela('menu')}
                className="w-full py-2.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200"
              >
                Voltar ao Menu
              </button>
            </div>
          )}
        </div>

        {/* Menu Gaveta Lateral */}
        <MobileMenuDrawer
          aberto={drawerMenuAberto}
          onFechar={() => setDrawerMenuAberto(false)}
        />
      </div>

      {/* 2. VISÃO DESKTOP (RESPONSIVA: MODO CLARO & ESCURO) */}
      <div className="hidden md:flex flex-col flex-1 h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-y-auto">
        {/* HEADER DA PÁGINA */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              verificarSaidaComConfirmacao(() => {
                if (subTela !== 'menu') {
                  setSubTela('menu');
                } else {
                  navigate(-1);
                }
              });
            }}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-500" />
              <span>Configurações</span>
            </h1>
          </div>
        </div>

        {isDirty && (
          <button
            type="button"
            onClick={handleSalvarTodasConfiguracoes}
            disabled={salvando}
            className="px-4 py-2 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 animate-in fade-in"
          >
            <Save className="w-4 h-4" />
            <span>{salvando ? 'Salvando...' : 'Salvar'}</span>
          </button>
        )}
      </div>

      {/* TOAST FEEDBACK */}
      {mensagemToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-4 h-4" />
          <span>{mensagemToast}</span>
        </div>
      )}

      {/* CONTAINER PRINCIPAL */}
      <div className="max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">

        {/* ========================================================================= */}
        {/* MENU PRINCIPAL (GRID DE BOTÕES DE CONFIGURAÇÃO) */}
        {/* ========================================================================= */}
        {subTela === 'menu' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 animate-in fade-in duration-150">
            {itensMenu.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'catalogo') {
                    navigate('/catalog-config');
                  } else if (item.id === 'produtos') {
                    navigate('/auxiliares');
                  } else {
                    setSubTela(item.id as SubTelaConfig);
                  }
                }}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-slate-50 dark:hover:bg-slate-850 hover:shadow-md hover:shadow-emerald-500/5 flex flex-col items-center justify-center text-center gap-3 transition-all duration-200 cursor-pointer group relative shadow-xs"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-slate-950 border border-emerald-200 dark:border-slate-800 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-500/10 group-hover:border-emerald-300 dark:group-hover:border-emerald-500/30 text-emerald-800 dark:text-emerald-400 flex items-center justify-center transition-all group-hover:scale-110">
                  <item.icon className="w-6 h-6" />
                </div>
                <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition leading-tight">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: GERAL */}
        {/* ========================================================================= */}
        {subTela === 'geral' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Geral</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Preferências gerais de funcionamento da loja</p>
            </div>

            {/* Controlar Estoque */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="space-y-0.5 max-w-[80%]">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">Controlar estoque</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight">
                  Quando ligado, bloqueia vendas que excedam o estoque disponível no PDV e Catálogo. Quando desligado, permite vendas livres.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={controlarEstoque}
                  onChange={(e) => setControlarEstoque(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Transações Canceladas */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-300 block">Transações canceladas</span>
              <div className="space-y-2">
                {[
                  { id: 'riscadas', label: 'Exibir riscada' },
                  { id: 'ocultar', label: 'Ocultar' }
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer ${
                      transacoesCanceladas === opt.id
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-900 dark:text-slate-100 font-bold'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span className="font-bold text-xs">{opt.label}</span>
                    <input
                      type="radio"
                      name="transacoesCanceladas"
                      checked={transacoesCanceladas === opt.id}
                      onChange={() => setTransacoesCanceladas(opt.id as any)}
                      className="text-emerald-500 focus:ring-emerald-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Ordenar produtos em Vender */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-300 block">Ordenar produtos em Vender por</span>
              <div className="space-y-2">
                {[
                  { id: 'cadastro', label: 'Data do cadastro' },
                  { id: 'alfabetica', label: 'Ordem alfabética A-Z' }
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer ${
                      ordenarProdutosPdv === opt.id
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-900 dark:text-slate-100 font-bold'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span className="font-bold text-xs">{opt.label}</span>
                    <input
                      type="radio"
                      name="ordenarProdutosPdv"
                      checked={ordenarProdutosPdv === opt.id}
                      onChange={() => setOrdenarProdutosPdv(opt.id as any)}
                      className="text-emerald-500 focus:ring-emerald-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: TIPOS DE VENDA (PARAMETRIZAÇÃO FLEXÍVEL NO PDV) */}
        {/* ========================================================================= */}
        {subTela === 'tipos-venda' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-emerald-500" />
                  Tipos de Venda
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure quais modalidades comerciais e tabelas de preço estão ativas na loja e no PDV.
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSubTela('menu')}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleSalvarTiposVenda}
                  disabled={salvandoTiposVenda || (!tipoVendaVarejo && !tipoVendaAtacado && !tipoVendaDistribuidor)}
                  className="px-4 py-2 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {salvandoTiposVenda ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {carregandoTiposVenda && (
              <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex items-center gap-2.5 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                <span>Buscando configurações reais de tipos de venda no Supabase...</span>
              </div>
            )}

            {erroTiposVenda && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                <span>{erroTiposVenda}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card Varejo */}
              <div className={`p-5 rounded-2xl border transition-all ${
                tipoVendaVarejo
                  ? 'bg-white dark:bg-slate-950/80 border-blue-500/40 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800 opacity-60'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs">
                      1
                    </span>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Varejo</h3>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">Venda padrão unitária</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={tipoVendaVarejo}
                      onChange={() => handleToggleTipoVenda('varejo')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                  </label>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Modalidade essencial para vendas unitárias no PDV e visualização de preços regulares no Catálogo Online.
                </p>
              </div>

              {/* Card Atacado */}
              <div className={`p-5 rounded-2xl border transition-all ${
                tipoVendaAtacado
                  ? 'bg-white dark:bg-slate-950/80 border-emerald-500/40 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800 opacity-60'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xs">
                      2
                    </span>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Atacado</h3>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Desconto por volume</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={tipoVendaAtacado}
                      onChange={() => handleToggleTipoVenda('atacado')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Permite aplicar automaticamente o preço de atacado quando o carrinho atingir a quantidade mínima de itens ou valor configurado.
                </p>
              </div>

              {/* Card Distribuidor */}
              <div className={`p-5 rounded-2xl border transition-all ${
                tipoVendaDistribuidor
                  ? 'bg-white dark:bg-slate-950/80 border-purple-500/40 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800 opacity-60'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-xs">
                      3
                    </span>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Distribuidor</h3>
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">Lotes / Fardos</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={tipoVendaDistribuidor}
                      onChange={() => handleToggleTipoVenda('distribuidor')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Modalidade voltada para caixas fechadas, revendedores e grandes fardos com preço diferenciado por lote.
                </p>
              </div>
            </div>

            {/* Informações de Comportamento Dinâmico */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-300 block flex items-center gap-1.5">
                <Info className="w-4 h-4 text-emerald-500" />
                Comportamento Dinâmico no PDV e Precificação
              </span>
              <ul className="text-xs text-slate-800 dark:text-slate-300 space-y-1 list-disc list-inside">
                <li><strong className="text-slate-900 dark:text-white">Apenas 1 modalidade ativa:</strong> O seletor manual de tipo de venda no cabeçalho do carrinho e os termômetros de progressão de atacado/distribuidor são automaticamente ocultados.</li>
                <li><strong className="text-slate-900 dark:text-white">2 ou mais modalidades ativas:</strong> O operador do PDV visualiza apenas os botões das modalidades habilitadas e os termômetros calculam o próximo nível aplicável.</li>
                <li><strong className="text-slate-900 dark:text-white">Regras de Precificação:</strong> As regras de Atacado ou Distribuidor desativadas aqui são sinalizadas e protegidas em <em>Cadastros &amp; Tabelas &gt; Regras de Precificação</em>.</li>
              </ul>
            </div>

            {/* Rodapé com Ação de Salvar */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-700 dark:text-slate-400 font-medium">
                As alterações gravadas são refletidas imediatamente no PDV Desktop, PDV Mobile e no Catálogo.
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSubTela('menu')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-300 hover:text-black dark:hover:text-white transition cursor-pointer"
                >
                  Voltar ao Menu
                </button>
                <button
                  type="button"
                  onClick={handleSalvarTiposVenda}
                  disabled={salvandoTiposVenda || (!tipoVendaVarejo && !tipoVendaAtacado && !tipoVendaDistribuidor)}
                  className="px-6 py-2.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {salvandoTiposVenda ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando no Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Salvar Tipos de Venda</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: DADOS DA LOJA */}
        {/* ========================================================================= */}
        {subTela === 'dados-loja' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Dados da Loja</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Nome, logo, telefone, WhatsApp e endereço</p>
            </div>

            {/* Logo */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              {urlLogo ? (
                <div className="relative group w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <img src={urlLogo} alt="Logo" className="w-full h-full object-contain p-2" />
                  <label className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-[10px] font-bold text-white cursor-pointer">
                    <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
                    Trocar Logo
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer space-y-2">
                  <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
                  <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Upload de sua marca</span>
                </label>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Nome da Loja</label>
                <input
                  type="text"
                  value={nomeLoja}
                  onChange={(e) => setNomeLoja(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 font-bold focus:border-emerald-500 outline-hidden transition"
                  placeholder="Nome Fantasia da sua loja"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">WhatsApp (Principal)</label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    placeholder="5585986072144"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Telefone/Celular (Opcional)</label>
                  <input
                    type="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    placeholder="Telefone adicional"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">CPF ou CNPJ</label>
                  <input
                    type="text"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    placeholder="00.000.000/0001-00"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Razão Social</label>
                  <input
                    type="text"
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 uppercase focus:border-emerald-500 outline-hidden transition"
                    placeholder="NOME DA EMPRESA LTDA"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Estes dados não serão exibidos no catálogo público. O CPF ou CNPJ é utilizado para emissão fiscal e integrações de logística.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Endereço (Rua, Número)</label>
                <input
                  type="text"
                  value={enderecoLogradouro}
                  onChange={(e) => setEnderecoLogradouro(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                  placeholder="Ex: Rua Bélgica, 945"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Complemento</label>
                  <input
                    type="text"
                    value={enderecoComplemento}
                    onChange={(e) => setEnderecoComplemento(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    placeholder="Apto, Sala, Bloco..."
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Cidade</label>
                  <input
                    type="text"
                    value={enderecoCidade}
                    onChange={(e) => setEnderecoCidade(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    placeholder="Cidade"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">CEP</label>
                  <input
                    type="text"
                    value={enderecoCep}
                    onChange={(e) => setEnderecoCep(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    placeholder="60000-000"
                  />
                </div>
              </div>

              {/* SEÇÃO: SEGMENTO DO NEGÓCIO & ESPECIALIZAÇÃO DA RUBI IA */}
              <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" />
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                        Segmento de Atuação & Especialização da Rubi IA
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Direcione o comportamento, vocabulário e papel de vendedora da IA para o nicho da sua empresa no Catálogo Online!
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                    Especialização IA
                  </span>
                </div>

                {/* Grade de Segmentos */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-400 block mb-2">
                    Selecione o Ramo do seu Negócio:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {SEGMENTOS_NEGOCIO.map((seg) => {
                      const isSelected = segmentoNegocio === seg.id;
                      return (
                        <button
                          key={seg.id}
                          type="button"
                          onClick={() => setSegmentoNegocio(seg.id)}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between relative group ${
                            isSelected
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                              : 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className={`text-xl shrink-0 p-1.5 rounded-xl border ${
                              isSelected
                                ? 'bg-emerald-100 dark:bg-slate-900 border-emerald-200 dark:border-slate-800'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            }`}>
                              {seg.icone}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className={`font-semibold text-xs truncate ${isSelected ? 'text-emerald-950 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-200'}`}>
                                  {seg.nome}
                                </span>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 ml-1" />
                                )}
                              </div>
                              <span className={`text-[10px] block mt-0.5 font-medium leading-tight ${isSelected ? 'text-emerald-900 dark:text-slate-300' : 'text-slate-800 dark:text-slate-400'}`}>
                                {seg.papel}
                              </span>
                            </div>
                          </div>
                          <span className={`text-[10px] line-clamp-2 mt-2 leading-relaxed ${isSelected ? 'text-emerald-950 dark:text-slate-400' : 'text-slate-700 dark:text-slate-400 font-medium'}`}>
                            {seg.descricao}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Especialidade ou Foco da Empresa */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-400 block mb-1">
                    Especialidade ou Foco Principal da Loja (Opcional):
                  </label>
                  <input
                    type="text"
                    value={especialidadeNegocio}
                    onChange={(e) => setEspecialidadeNegocio(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-emerald-500 outline-hidden transition"
                    placeholder="Ex: Especializados em vestidos de festa femininos / Peças originais Honda e Yamaha / Pizzas artesanais..."
                  />
                  <span className="text-[10px] text-slate-700 dark:text-slate-400 mt-1 block font-medium">
                    A Rubi usará essa descrição para destacar seus produtos favoritos e diferenciais exclusivos nas conversas.
                  </span>
                </div>

                {/* Tom de Voz da IA & Prévia */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-400 block mb-1">
                      Estilo e Tom de Voz da Rubi:
                    </label>
                    <select
                      value={tomVozRubi}
                      onChange={(e) => setTomVozRubi(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer focus:border-emerald-500 outline-hidden"
                    >
                      <option value="consultivo">🤝 Consultivo & Atencioso (Recomendado)</option>
                      <option value="tecnico">🔧 Técnico & Especialista (Foco em compatibilidade e precisão)</option>
                      <option value="amigavel">✨ Amigável & Descontraído (Linguagem leve e calorosa)</option>
                      <option value="formal">👔 Formal & Elegante (Atendimento requintado e polido)</option>
                    </select>
                  </div>

                  {/* Prévia da Abordagem */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" /> Exemplo de Saudação da Rubi
                    </span>
                    <p className="text-[11px] text-slate-900 dark:text-slate-200 font-medium italic mt-1 leading-snug">
                      "{SEGMENTOS_NEGOCIO.find(s => s.id === segmentoNegocio)?.exemploFala || SEGMENTOS_NEGOCIO[0].exemploFala}"
                    </p>
                  </div>
                </div>

                {/* Chave de API Google Gemini (Opcional) */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-900 dark:text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Chave de API do Google Gemini (Opcional - Inteligência Avançada)</span>
                    </label>
                    <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      Recomendado para Vendedora IA
                    </span>
                  </div>
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-emerald-500 outline-hidden transition font-mono"
                  />
                  <p className="text-[10px] text-slate-800 dark:text-slate-400 mt-1 leading-relaxed">
                    Insira sua chave gratuita do <strong>Google AI Studio</strong> para que a Rubi tenha poder total de conversação natural, conheça os produtos a fundo e responda aos clientes com empatia e consultoria humana no Catálogo Online. Se não configurada, a Rubi continuará atendendo normalmente através do motor inteligente local.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* ========================================================================= */}
        {/* SUB-TELA: MEU RECIBO */}
        {/* ========================================================================= */}
        {subTela === 'recibo' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Meu Recibo</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Cabeçalho, rodapé e formato de impressão</p>
              </div>
              <button
                type="button"
                onClick={() => setModalPreviewRecibo(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 text-slate-900 dark:text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Receipt className="w-4 h-4" />
                <span>Ver meu recibo</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* Adicionar dados do cliente */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">Adicionar dados do cliente</span>
                  <span className="text-[11px] text-slate-700 dark:text-slate-400 font-medium">Nome, Endereço e Telefone no corpo do recibo</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reciboAdicionarCliente}
                    onChange={(e) => setReciboAdicionarCliente(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Cabeçalho */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Texto do cabeçalho (opcional)</label>
                <textarea
                  rows={2}
                  value={reciboCabecalho}
                  onChange={(e) => setReciboCabecalho(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                  placeholder="Ex: Sejam muito bem-vindos à nossa loja!"
                />
              </div>

              {/* Rodapé */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Texto do rodapé (opcional)</label>
                <textarea
                  rows={2}
                  value={reciboRodape}
                  onChange={(e) => setReciboRodape(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                  placeholder="Ex: Trocas em até 7 dias com esta via. Volte sempre!"
                />
              </div>

              {/* Impressora Padrão */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Formato de Impressão Padrão</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'termica_80mm', label: 'Térmica 80mm' },
                    { id: 'termica_58mm', label: 'Térmica 58mm' },
                    { id: 'a4', label: 'Folha A4' }
                  ].map((imp) => (
                    <button
                      key={imp.id}
                      type="button"
                      onClick={() => setTipoImpressaoPadrao(imp.id as any)}
                      className={`p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        tipoImpressaoPadrao === imp.id
                          ? 'bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 text-slate-900 dark:text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 hover:text-black dark:hover:text-white font-medium'
                      }`}
                    >
                      {imp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: OPÇÕES DE PAGAMENTO & GATEWAYS */}
        {/* ========================================================================= */}
        {subTela === 'pagamentos' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Opções de Pagamento</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mercado Pago, PagBank, Asaas, Pix e Maquininhas</p>
            </div>

            {/* INTEGRAÇÕES DIGITAIS (AUTOMÁTICAS) */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                INTEGRAÇÃO DE PAGAMENTO DIGITAL
              </span>

              {/* SELETOR PRINCIPAL DO PROVEDOR COM SETA > */}
              <div
                onClick={() => setModalProvedor(true)}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 flex items-center justify-between cursor-pointer transition group shadow-xs"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-xs transition ${
                      provedorDigital === 'mercado_pago'
                        ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400'
                        : provedorDigital === 'pagseguro'
                        ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : provedorDigital === 'asaas'
                        ? 'bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                        : provedorDigital === 'stripe'
                        ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                        : provedorDigital === 'picpay'
                        ? 'bg-teal-50 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400'
                        : provedorDigital === 'google_pay'
                        ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-400'
                    }`}
                  >
                    {provedorDigital === 'mercado_pago' && 'MP'}
                    {provedorDigital === 'pagseguro' && 'PAG'}
                    {provedorDigital === 'asaas' && 'AS'}
                    {provedorDigital === 'stripe' && 'ST'}
                    {provedorDigital === 'picpay' && 'PIC'}
                    {provedorDigital === 'google_pay' && 'GP'}
                    {provedorDigital === 'nenhum' && <Lock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Provedor Selecionado</span>
                      {provedorDigital !== 'nenhum' ? (
                        <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                          ATIVO
                        </span>
                      ) : (
                        <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          DESATIVADO
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-extrabold block mt-0.5 text-emerald-600 dark:text-emerald-400">
                      {provedorDigital === 'mercado_pago' && 'Mercado Pago'}
                      {provedorDigital === 'pagseguro' && 'PagBank (PagSeguro)'}
                      {provedorDigital === 'asaas' && 'Asaas'}
                      {provedorDigital === 'stripe' && 'Stripe'}
                      {provedorDigital === 'picpay' && 'PicPay E-commerce'}
                      {provedorDigital === 'google_pay' && 'Google Pay & Carteiras'}
                      {provedorDigital === 'nenhum' && 'Nenhum selecionado (Toque para escolher)'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition" />
              </div>

              {/* CAMPOS CONTEXTUAIS CONFORME O PROVEDOR SELECIONADO */}
              {provedorDigital === 'mercado_pago' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-sky-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-xs text-sky-600 dark:text-sky-400">Credenciais Mercado Pago</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-500 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Ambiente</label>
                    <select
                      value={mpAmbiente}
                      onChange={(e) => setMpAmbiente(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:border-emerald-500 outline-hidden transition"
                    >
                      <option value="sandbox">Ambiente de Teste (Sandbox)</option>
                      <option value="producao">Ambiente Real (Produção)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Access Token {mpAmbiente === 'sandbox' ? '(Credenciais de Teste)' : '(Produção)'}
                    </label>
                    <input
                      type="password"
                      value={mpAccessToken}
                      onChange={(e) => setMpAccessToken(e.target.value)}
                      placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Public Key</label>
                    <input
                      type="text"
                      value={mpPublicKey}
                      onChange={(e) => setMpPublicKey(e.target.value)}
                      placeholder="APP_USR-xxxxxxxx"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                </div>
              )}

              {provedorDigital === 'pagseguro' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-emerald-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">Credenciais PagBank (PagSeguro)</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-500 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">E-mail da Conta PagBank</label>
                    <input
                      type="email"
                      value={pagseguroEmail}
                      onChange={(e) => setPagseguroEmail(e.target.value)}
                      placeholder="seu-email@pagseguro.com.br"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Token de Integração</label>
                    <input
                      type="password"
                      value={pagseguroToken}
                      onChange={(e) => setPagseguroToken(e.target.value)}
                      placeholder="Token gerado no painel PagBank"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Chave Pública (Public Key)</label>
                    <input
                      type="text"
                      value={pagseguroPublicKey}
                      onChange={(e) => setPagseguroPublicKey(e.target.value)}
                      placeholder="Public Key PagBank"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                </div>
              )}

              {provedorDigital === 'asaas' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-purple-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-xs text-purple-600 dark:text-purple-400">Credenciais Asaas</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-500 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">API Key ($aact_...)</label>
                    <input
                      type="password"
                      value={asaasApiKey}
                      onChange={(e) => setAsaasApiKey(e.target.value)}
                      placeholder="$aact_YTU5YTE0M2M6N2Z..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Ambiente</label>
                    <select
                      value={asaasAmbiente}
                      onChange={(e) => setAsaasAmbiente(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    >
                      <option value="producao">Produção (Real)</option>
                      <option value="sandbox">Sandbox (Testes)</option>
                    </select>
                  </div>
                </div>
              )}

              {provedorDigital === 'stripe' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-indigo-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400">Credenciais Stripe</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-500 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Publishable Key (pk_live_...)</label>
                    <input
                      type="text"
                      value={stripePublishableKey}
                      onChange={(e) => setStripePublishableKey(e.target.value)}
                      placeholder="pk_live_..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Secret Key (sk_live_...)</label>
                    <input
                      type="password"
                      value={stripeSecretKey}
                      onChange={(e) => setStripeSecretKey(e.target.value)}
                      placeholder="sk_live_..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                </div>
              )}

              {provedorDigital === 'picpay' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-teal-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-xs text-teal-600 dark:text-teal-400">Credenciais PicPay E-commerce</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-500 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">PicPay Token</label>
                    <input
                      type="password"
                      value={picpayToken}
                      onChange={(e) => setPicpayToken(e.target.value)}
                      placeholder="Token PicPay E-commerce"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Seller Token</label>
                    <input
                      type="password"
                      value={picpaySellerToken}
                      onChange={(e) => setPicpaySellerToken(e.target.value)}
                      placeholder="Seller Token PicPay"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                </div>
              )}

              {provedorDigital === 'google_pay' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-amber-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-xs text-amber-600 dark:text-amber-400">Google Pay & Carteiras Digitais</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-500 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Google Merchant ID</label>
                    <input
                      type="text"
                      value={googlePayMerchantId}
                      onChange={(e) => setGooglePayMerchantId(e.target.value)}
                      placeholder="BCR2DN6TZ6XXXXXX"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                </div>
              )}

              {/* Botão de Atalho para Prazos e Taxas */}
              <div
                onClick={() => setSubTela('prazos-taxas')}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 flex items-center justify-between cursor-pointer transition shadow-xs"
              >
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-200 block">Prazos e taxas das Maquininhas</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Configure os prazos de recebimento para previsão no financeiro</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* OPÇÕES DE PAGAMENTO PRESENCIAIS / MANUAIS */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                OPÇÕES DE PAGAMENTO (CATÁLOGO E PDV)
              </span>

              {/* PIX */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-emerald-500" />
                    <div>
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">Pix Manual / Chave</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Chave Pix para transferências diretas</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pixAtivo}
                      onChange={(e) => setPixAtivo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
                {pixAtivo && (
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      value={pixChave}
                      onChange={(e) => setPixChave(e.target.value)}
                      placeholder="Sua chave Pix (CPF, CNPJ, E-mail ou Telefone)"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    />
                    <input
                      type="text"
                      value={pixOrientacoes}
                      onChange={(e) => setPixOrientacoes(e.target.value)}
                      placeholder="Orientações adicionais (ex: Enviar comprovante no WhatsApp)"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                    />
                  </div>
                )}
              </div>

              {/* DINHEIRO */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Dinheiro</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dinheiroAtivo}
                    onChange={(e) => setDinheiroAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* CARTÃO DE DÉBITO */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-indigo-500" />
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Cartão de Débito</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={debitoAtivo}
                    onChange={(e) => setDebitoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* CARTÃO DE CRÉDITO */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-amber-500" />
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Cartão de Crédito</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creditoAtivo}
                    onChange={(e) => setCreditoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* FIADO */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-rose-500" />
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">Fiado / Venda a Prazo</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Controle de saldo pendente por cliente</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permitirFiado}
                    onChange={(e) => setPermitirFiado(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: PRAZOS E TAXAS (MAQUININHAS) */}
        {/* ========================================================================= */}
        {subTela === 'prazos-taxas' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Prazos e taxas das Maquininhas</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Prazos de recebimento e taxas para previsão no financeiro</p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-600 dark:text-slate-400 flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <p>
                Configure os prazos e taxas da sua maquininha para calcular os valores líquidos exatos e acompanhar a previsão de entradas no módulo financeiro.
              </p>
            </div>

            {/* Crédito */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Cartões de crédito</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={maqCreditoAtivo}
                    onChange={(e) => setMaqCreditoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {maqCreditoAtivo && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Prazo de Recebimento</label>
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs">
                      <input
                        type="number"
                        value={maqCreditoDias}
                        onChange={(e) => setMaqCreditoDias(Number(e.target.value))}
                        className="bg-transparent text-slate-900 dark:text-slate-100 font-bold outline-none w-16"
                      />
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">dias corridos</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Taxa da Maquininha (%)</label>
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs">
                      <input
                        type="number"
                        step="0.01"
                        value={maqCreditoTaxa}
                        onChange={(e) => setMaqCreditoTaxa(Number(e.target.value))}
                        className="bg-transparent text-slate-900 dark:text-slate-100 font-bold outline-none w-16"
                      />
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Débito */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100">Cartões de débito</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={maqDebitoAtivo}
                    onChange={(e) => setMaqDebitoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {maqDebitoAtivo && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Prazo de Recebimento</label>
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs">
                      <input
                        type="number"
                        value={maqDebitoDias}
                        onChange={(e) => setMaqDebitoDias(Number(e.target.value))}
                        className="bg-transparent text-slate-900 dark:text-slate-100 font-bold outline-none w-16"
                      />
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">dias corridos</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Taxa da Maquininha (%)</label>
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs">
                      <input
                        type="number"
                        step="0.01"
                        value={maqDebitoTaxa}
                        onChange={(e) => setMaqDebitoTaxa(Number(e.target.value))}
                        className="bg-transparent text-slate-900 dark:text-slate-100 font-bold outline-none w-16"
                      />
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: PEDIDOS E VENDAS (TAXAS & STATUS) */}
        {/* ========================================================================= */}
        {subTela === 'pedidos-vendas' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Pedidos e Vendas</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Status de pedidos e taxas de venda adicionais</p>
            </div>

            {/* Atalho para Status de Pedidos */}
            <div
              onClick={() => setSubTela('status-pedidos')}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 flex items-center justify-between cursor-pointer transition shadow-xs"
            >
              <div>
                <span className="font-bold text-xs text-slate-900 dark:text-slate-200 block">Status de Pedidos</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Ative ou crie novas etapas do fluxo operacional</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>

            {/* TAXA DE VENDA PDV */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">Usar taxa de vendas no PDV</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Taxa de serviço ou acréscimo automático</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usarTaxaVenda}
                    onChange={(e) => setUsarTaxaVenda(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {usarTaxaVenda && (
                <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Nome da Taxa</label>
                      <input
                        type="text"
                        value={nomeTaxaVenda}
                        onChange={(e) => setNomeTaxaVenda(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                        placeholder="Ex: Taxa de Serviço"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Valor da Taxa</label>
                      <input
                        type="number"
                        value={valorTaxaVenda}
                        onChange={(e) => setValorTaxaVenda(Number(e.target.value))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Taxa opcional (removível no PDV)</span>
                    <input
                      type="checkbox"
                      checked={taxaVendaOpcional}
                      onChange={(e) => setTaxaVendaOpcional(e.target.checked)}
                      className="rounded text-emerald-500 focus:ring-emerald-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 w-4 h-4"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: STATUS DE PEDIDOS */}
        {/* ========================================================================= */}
        {subTela === 'status-pedidos' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Status de Pedidos</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ative ou crie novas etapas do fluxo operacional</p>
            </div>

            <div className="space-y-3">
              {/* Status Fixos Obrigatórios (Badge PADRÃO, sempre ativos, sem switch) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Pendente</span>
                    <span className="text-[10px] text-slate-500">Pedido recém-criado que aguarda confirmação comercial</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800">PADRÃO</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Confirmado</span>
                    <span className="text-[10px] text-slate-500">Pedido aceito e validado pela loja</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800">PADRÃO</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <X className="w-4 h-4 text-rose-500" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Cancelado</span>
                    <span className="text-[10px] text-slate-500">Interrupção do fluxo com cancelamento operacional</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800">PADRÃO</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-500" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Concluído</span>
                    <span className="text-[10px] text-slate-500">Pedido finalizado, pago e entregue</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800">PADRÃO</span>
              </div>

              {/* Status Operacionais Opcionais (Cada um com Checkbox / Switch individual) */}
              <div className="pt-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">
                  Status Operacionais Opcionais
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Em separação</span>
                    <span className="text-[10px] text-slate-500">Separação de itens no estoque</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={statusEmSeparacao}
                  onChange={(e) => setStatusEmSeparacao(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Em expedição</span>
                    <span className="text-[10px] text-slate-500">Conferência interna e embalagem</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={statusEmExpedicao}
                  onChange={(e) => setStatusEmExpedicao(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Aguardando envio</span>
                    <span className="text-[10px] text-slate-500">Etapa intermediária de coleta/espera</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={statusAguardandoEnvio}
                  onChange={(e) => setStatusAguardandoEnvio(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Enviado</span>
                    <span className="text-[10px] text-slate-500">Mercadoria despachada em trânsito com transportadora, Correios ou motoboy</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={statusEnviado}
                  onChange={(e) => setStatusEnviado(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-500"></div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Entregue</span>
                    <span className="text-[10px] text-slate-500">Mercadoria entregue ao cliente final</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={statusEntregue}
                  onChange={(e) => setStatusEntregue(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-400"></div>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">Pronto para retirar</span>
                    <span className="text-[10px] text-slate-500">Pacote disponível no balcão da loja física para retirada presencial</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={statusProntoRetirar}
                  onChange={(e) => setStatusProntoRetirar(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: OPÇÕES DE ENTREGA & RETIRADA */}
        {/* ========================================================================= */}
        {subTela === 'entrega' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Opções de Entrega & Retirada</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Configure entregas via motoboy e retirada no balcão</p>
            </div>

            {/* Banner Módulo Avançado de Frete & Logística */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-slate-50 to-indigo-50 dark:from-emerald-950/50 dark:via-slate-950 dark:to-indigo-950/50 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Gestão Avançada de Frete & Logística</span>
                    <span className="text-[10px] uppercase font-black bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40">Novo</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Configure integrações com <strong>Uber Direct</strong> (motoboy flash), <strong>Melhor Envio</strong> (Correios/Jadlog) e regras de cotação em tempo real.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/configuracoes/frete')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all shrink-0 cursor-pointer"
              >
                <span>Configurar Frete Avançado</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: EXPORTAR RELATÓRIOS */}
        {/* ========================================================================= */}
        {subTela === 'exportar' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Exportar Relatórios</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Download CSV de vendas, produtos e clientes</p>
            </div>

            {/* Período */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-300 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-500" />
                <span>Informe o período</span>
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-600 dark:text-slate-400 block mb-1">Data Inicial</label>
                  <input
                    type="date"
                    value={dataInicioExport}
                    onChange={(e) => setDataInicioExport(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 dark:text-slate-400 block mb-1">Data Final</label>
                  <input
                    type="date"
                    value={dataFimExport}
                    onChange={(e) => setDataFimExport(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-hidden transition"
                  />
                </div>
              </div>
            </div>

            {/* Seleção de Relatórios */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-300 block">Quais relatórios deseja exportar?</span>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer shadow-xs">
                  <input
                    type="checkbox"
                    checked={exportarVendas}
                    onChange={(e) => setExportarVendas(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Vendas</span>
                </label>
                <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer shadow-xs">
                  <input
                    type="checkbox"
                    checked={exportarProdutos}
                    onChange={(e) => setExportarProdutos(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Produtos</span>
                </label>
                <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer shadow-xs">
                  <input
                    type="checkbox"
                    checked={exportarClientes}
                    onChange={(e) => setExportarClientes(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Clientes</span>
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportarRelatorios}
              disabled={salvando || (!exportarVendas && !exportarProdutos && !exportarClientes)}
              className="w-full py-4 rounded-2xl bg-emerald-200 hover:bg-emerald-300 border border-emerald-300/60 text-slate-900 font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:border-emerald-500 dark:text-white text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-40"
            >
              <Download className="w-5 h-5" />
              <span>{salvando ? 'Gerando arquivo...' : 'Exportar Arquivos (CSV / Excel)'}</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: IMPORTAR E EXPORTAR DADOS (CLIENTES, PRODUTOS E PEDIDOS) */}
        {/* ========================================================================= */}
        {(subTela === 'importar-exportar' || subTela === 'importar-exportar-produtos') && (
          <CentralImportarExportar onVoltar={() => setSubTela('menu')} />
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: INTEGRAR COM PARCEIROS (INSTAGRAM, FACEBOOK, GOOGLE, TIKTOK) */}
        {/* ========================================================================= */}
        {subTela === 'parceiros' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Integrar com Parceiros</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Instagram Shopping, Facebook Pixel, Google Merchant e TikTok</p>
            </div>

            {/* FACEBOOK & INSTAGRAM */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase">
                <Share2 className="w-4 h-4 text-pink-500" /> Facebook & Instagram
              </span>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">Instagram Shopping & Loja do Facebook</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Feed de produtos para etiquetar itens nos posts e stories</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiarTexto(`${window.location.origin}/feed/facebook/${loja?.slug_catalogo || loja?.id}`, 'fb_feed')}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiadoTexto === 'fb_feed' ? 'Copiado!' : 'Copiar Link XML'}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">Facebook Pixel</span>
                <input
                  type="text"
                  value={facebookPixelId}
                  onChange={(e) => setFacebookPixelId(e.target.value)}
                  placeholder="ID do Pixel (Ex: 123456789012345)"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                />
              </div>
            </div>

            {/* GOOGLE SHOPPING */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase">
                <Globe className="w-4 h-4 text-sky-500" /> Google Shopping (Merchant Center)
              </span>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">Feed Google Merchant Center</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Alcance clientes nas pesquisas do Google Shopping</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiarTexto(`${window.location.origin}/feed/google/${loja?.slug_catalogo || loja?.id}`, 'google_feed')}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiadoTexto === 'google_feed' ? 'Copiado!' : 'Copiar Link XML'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* TIKTOK BUSINESS */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase">
                <Smartphone className="w-4 h-4 text-rose-500" /> TikTok Business
              </span>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">TikTok Pixel ID</span>
                <input
                  type="text"
                  value={tiktokPixelId}
                  onChange={(e) => setTiktokPixelId(e.target.value)}
                  placeholder="ID do TikTok Pixel"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono focus:border-emerald-500 outline-hidden transition"
                />
              </div>
            </div>

            {/* BUSCA AUTOMÁTICA DE FOTOS (SERPAPI - GOOGLE IMAGES ENGINE) */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800/80">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase">
                <Sparkles className="w-4 h-4 text-teal-500" /> Busca Automática de Fotos (SerpApi - Google Images)
              </span>

              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">Motor de Imagens Google via SerpApi (BYOK)</h4>
                      {serpApiKey ? (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Conectada (250 buscas/mês)
                        </span>
                      ) : (
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 px-2.5 py-0.5 rounded-full font-bold">
                          Não Configurada
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      Permite ao HUBI trazer fotografias oficiais de produtos pesquisadas no Google diretamente para a tela de cadastro sem abrir abas extras. Cota gratuita renovável de 250 buscas mensais sem custo para a loja.
                    </p>
                  </div>

                  <a
                    href="https://serpapi.com/users/sign_up"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs"
                  >
                    <span>Obter Chave Gratuita</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Área da Chave */}
                <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-teal-500" />
                      <span>Chave de API SerpApi (API Key):</span>
                    </label>
                    {serpApiKey && !editandoSerpApiKey && (
                      <button
                        type="button"
                        onClick={() => setEditandoSerpApiKey(true)}
                        className="text-[11px] text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-bold transition cursor-pointer flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Editar / Trocar Chave</span>
                      </button>
                    )}
                  </div>

                  {editandoSerpApiKey || !serpApiKey ? (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="password"
                          value={serpApiKey}
                          onChange={(e) => {
                            setSerpApiKey(e.target.value);
                            setResultadoTesteSerpApi(null);
                          }}
                          placeholder="Cole sua chave aqui (Ex: 7a8b9c0d1e2f3a4b5c6d...)"
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-teal-500 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 font-mono outline-hidden transition"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await salvarSerpApiKey(serpApiKey.trim(), loja?.id, loja);
                              setEditandoSerpApiKey(false);
                              mostrarToast('Chave SerpApi salva com sucesso!');
                            } catch (e: any) {
                              mostrarErro(e.message, 'Erro ao salvar chave');
                            }
                          }}
                          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-black text-xs transition cursor-pointer shrink-0 shadow-sm"
                        >
                          Salvar Chave
                        </button>
                        {serpApiKey && (
                          <button
                            type="button"
                            onClick={() => setEditandoSerpApiKey(false)}
                            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition cursor-pointer shrink-0"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Acesse sua conta no painel da SerpApi, copie o código em <strong>API Key</strong> e salve aqui para ativar a busca automática no cadastro de produtos.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-teal-500 shrink-0" />
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300 tracking-wider">
                          {`••••••••••••••••${serpApiKey.trim().slice(-4)}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={testandoSerpApi}
                          onClick={async () => {
                            setTestandoSerpApi(true);
                            setResultadoTesteSerpApi(null);
                            const res = await testarConexaoSerpApi(serpApiKey);
                            setResultadoTesteSerpApi(res);
                            setTestandoSerpApi(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                        >
                          {testandoSerpApi ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />
                              <span>Testando...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 text-teal-500" />
                              <span>Testar Conexão</span>
                            </>
                          )}
                        </button>
                        <a
                          href="https://serpapi.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition"
                          title="Acessar painel SerpApi"
                        >
                          <span>Painel</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Feedback do Teste de Conexão */}
                  {resultadoTesteSerpApi && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in ${
                        resultadoTesteSerpApi.sucesso
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                      }`}
                    >
                      {resultadoTesteSerpApi.sucesso ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                      )}
                      <div>
                        <p className="font-bold">{resultadoTesteSerpApi.mensagem}</p>
                        {resultadoTesteSerpApi.plano && (
                          <p className="text-[11px] opacity-85 mt-0.5">
                            Plano ativo: <strong>{resultadoTesteSerpApi.plano}</strong>
                            {resultadoTesteSerpApi.buscasRestantes !== undefined && (
                              <span> • Buscas restantes este mês: <strong>{resultadoTesteSerpApi.buscasRestantes}</strong></span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBTELA: METAS DA LOJA (COCKPIT F1) */}
        {/* ========================================================================= */}
        {subTela === 'metas' && (
          <ConfiguracoesMetas
            lojaId={loja?.id}
            onVoltar={() => setSubTela('menu')}
          />
        )}

      </div>
      </div>


      {/* ========================================================================= */}
      {/* MODAL: PREVIEW DO RECIBO */}
      {/* ========================================================================= */}
      {modalPreviewRecibo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Recibo da Loja (Preview)</h3>
              <button onClick={() => setModalPreviewRecibo(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white text-slate-900 rounded-2xl p-4 font-mono text-xs shadow-inner space-y-3 border border-slate-200">
              {urlLogo && (
                <img src={urlLogo} alt="Logo" className="w-16 h-16 object-contain mx-auto" />
              )}
              <div className="text-center">
                <h4 className="font-extrabold text-sm">{nomeLoja || 'SUA LOJA'}</h4>
                <p className="text-[10px] text-slate-600">{enderecoLogradouro} • {whatsapp}</p>
              </div>

              {reciboCabecalho && (
                <p className="text-center italic text-[11px] border-b pb-2">{reciboCabecalho}</p>
              )}

              <div className="border-b pb-2 text-[10px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Vendedor:</span>
                  <span className="font-bold text-slate-800">Catálogo Online / Vendedor</span>
                </div>
                {reciboAdicionarCliente && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Cliente:</span>
                    <span className="font-bold text-slate-800">Cliente Exemplo</span>
                  </div>
                )}
              </div>

              <div className="border-t border-b py-2 space-y-1">
                <div className="flex justify-between font-bold">
                  <span>1x Camiseta Exemplo</span>
                  <span>R$ 89,90</span>
                </div>
              </div>

              <div className="flex justify-between font-black text-sm pt-1">
                <span>TOTAL:</span>
                <span>R$ 89,90</span>
              </div>

              <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-[10px] space-y-1">
                <div className="flex justify-between items-center pb-1 border-b border-dashed border-emerald-200">
                  <span className="font-bold text-slate-700">STATUS:</span>
                  <span className="font-black text-emerald-800 bg-emerald-100 px-1 rounded">✓ PAGO</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Pix (Mercado Pago)</span>
                  <span className="font-bold text-slate-900">R$ 89,90</span>
                </div>
                <div className="flex justify-between font-extrabold text-emerald-900 pt-1 border-t border-emerald-200">
                  <span>Valor Pago:</span>
                  <span>R$ 89,90</span>
                </div>
              </div>

              {reciboRodape && (
                <p className="text-center italic text-[10px] pt-2 text-slate-600">{reciboRodape}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                type="button"
                onClick={() => PrintService.printReceipt(
                  {
                    id: 'preview',
                    loja_id: loja?.id || '',
                    numero_pedido: 1,
                    valor_total: 89.9,
                    subtotal: 89.9,
                    status: 'concluido',
                    itens: [{ nome_produto: 'Camiseta Exemplo', quantidade: 1, preco_venda_unitario: 89.9, subtotal: 89.9 }]
                  } as any,
                  {
                    nome_fantasia: nomeLoja,
                    whatsapp,
                    endereco_logradouro: enderecoLogradouro,
                    url_logo: urlLogo,
                    configuracoes_extras: {
                      recibo: {
                        cabecalho: reciboCabecalho,
                        rodape: reciboRodape,
                        adicionar_cliente: reciboAdicionarCliente
                      }
                    }
                  } as any,
                  '80mm'
                )}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>

              <button
                type="button"
                onClick={() => PrintService.printReceipt(
                  {
                    id: 'preview',
                    loja_id: loja?.id || '',
                    numero_pedido: 1,
                    valor_total: 89.9,
                    subtotal: 89.9,
                    status: 'concluido',
                    itens: [{ nome_produto: 'Camiseta Exemplo', quantidade: 1, preco_venda_unitario: 89.9, subtotal: 89.9 }]
                  } as any,
                  {
                    nome_fantasia: nomeLoja,
                    whatsapp,
                    endereco_logradouro: enderecoLogradouro,
                    url_logo: urlLogo,
                    configuracoes_extras: {
                      recibo: {
                        cabecalho: reciboCabecalho,
                        rodape: reciboRodape,
                        adicionar_cliente: reciboAdicionarCliente
                      }
                    }
                  } as any,
                  'a4'
                )}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Folha A4</span>
              </button>

              <button
                type="button"
                onClick={() => setModalPreviewRecibo(false)}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center cursor-pointer shadow-sm transition"
              >
                <span>Fechar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EXPORTAÇÃO CONCLUÍDA */}
      {/* ========================================================================= */}
      {modalExportConcluido && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <Download className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Seus relatórios estão prontos! 🎉</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">O download do arquivo CSV/Excel foi iniciado no seu dispositivo.</p>
            </div>
            <button
              type="button"
              onClick={() => setModalExportConcluido(false)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-sm transition"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SELECIONAR PROVEDOR DIGITAL */}
      {/* ========================================================================= */}
      {modalProvedor && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Provedor de Pagamento Digital</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Selecione o provedor para integração automática</p>
              </div>
              <button
                type="button"
                onClick={() => setModalProvedor(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
              {[
                {
                  id: 'nenhum',
                  nome: 'Nenhum (Desativado)',
                  desc: 'Não utilizar integração automática online',
                  cor: 'text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-800/40',
                  badge: 'OFF'
                },
                {
                  id: 'mercado_pago',
                  nome: 'Mercado Pago',
                  desc: 'Pix dinâmico com QR Code, link de pagamento e cartão',
                  cor: 'text-sky-600 bg-sky-50 dark:text-sky-400 dark:bg-sky-500/20',
                  badge: 'MP'
                },
                {
                  id: 'pagseguro',
                  nome: 'PagBank (PagSeguro)',
                  desc: 'Checkout transparente, Pix e cartão de crédito',
                  cor: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/20',
                  badge: 'PAG'
                },
                {
                  id: 'asaas',
                  nome: 'Asaas',
                  desc: 'Pix dinâmico com webhook, boleto bancário e cartão',
                  cor: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-500/20',
                  badge: 'AS'
                },
                {
                  id: 'stripe',
                  nome: 'Stripe',
                  desc: 'Cartões nacionais e internacionais, Apple Pay',
                  cor: 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/20',
                  badge: 'ST'
                },
                {
                  id: 'picpay',
                  nome: 'PicPay E-commerce',
                  desc: 'Pagamento via aplicativo PicPay e QR Code',
                  cor: 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-500/20',
                  badge: 'PIC'
                },
                {
                  id: 'google_pay',
                  nome: 'Google Pay & Carteiras',
                  desc: 'Pagamento com 1 clique em dispositivos Android/Chrome',
                  cor: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/20',
                  badge: 'GP'
                }
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setProvedorDigital(item.id as any);
                    setModalProvedor(false);
                  }}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer ${
                    provedorDigital === item.id
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-slate-900 dark:text-slate-100 font-bold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-[11px] shrink-0 ${item.cor}`}
                    >
                      {item.badge}
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">{item.nome}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">{item.desc}</span>
                    </div>
                  </div>
                  {provedorDigital === item.id && (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
