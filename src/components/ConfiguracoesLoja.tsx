import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Settings,
  Store,
  FileText,
  Receipt,
  CreditCard,
  Truck,
  Zap,
  Lock,
  HelpCircle,
  Upload,
  X,
  MapPin,
  ExternalLink,
  Check,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Smartphone,
  Globe,
  Share2,
  Trash2,
  Edit2,
  Package,
  Layers,
  BarChart3,
  Mail,
  Printer,
  Download,
  Copy,
  Info,
  Calendar,
  Save,
  Search,
  ArrowLeft,
  ShoppingBag,
  Sliders,
  ChevronDown,
  Percent
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
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

type SubTelaConfig =
  | 'menu'
  | 'geral'
  | 'dados-loja'
  | 'identificacao'
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
  | 'parceiros';

export const ConfiguracoesLoja: React.FC = () => {
  const { loja, recarregarDadosLoja } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!permissions.podeAcessarConfig) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarConfig, navigate]);

  const [subTela, setSubTela] = useState<SubTelaConfig>('menu');
  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagemToast, setMensagemToast] = useState<string>('');
  const [copiadoTexto, setCopiadoTexto] = useState<string>('');

  // 1. GERAL
  const [telaInicialPadrao, setTelaInicialPadrao] = useState<string>('inicio');
  const [modalTelaInicial, setModalTelaInicial] = useState<boolean>(false);
  const [moeda, setMoeda] = useState<string>('BR - R$');
  const [casasDecimais, setCasasDecimais] = useState<boolean>(true);
  const [transacoesCanceladas, setTransacoesCanceladas] = useState<'riscadas' | 'ocultar'>('riscadas');
  const [ordenarProdutosPdv, setOrdenarProdutosPdv] = useState<'cadastro' | 'alfabetica'>('cadastro');

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

  // Status de Pedidos
  const [statusEmProducao, setStatusEmProducao] = useState<boolean>(true);
  const [statusEmExpedicao, setStatusEmExpedicao] = useState<boolean>(true);
  const [statusSaiuEntrega, setStatusSaiuEntrega] = useState<boolean>(true);
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

  // Inicialização com dados da Loja
  useEffect(() => {
    if (loja) {
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

      // Geral
      setTelaInicialPadrao(geral.tela_inicial_padrao || 'inicio');
      setMoeda(geral.moeda || 'BR - R$');
      setCasasDecimais(geral.casas_decimais ?? extras.preferencias_gerais?.casas_decimais ?? true);
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

      // Status
      setStatusEmProducao(statusAtivos.em_producao ?? true);
      setStatusEmExpedicao(statusAtivos.em_expedicao ?? true);
      setStatusSaiuEntrega(statusAtivos.saiu_para_entrega ?? true);
      setStatusProntoRetirar(statusAtivos.pronto_para_retirar ?? true);
      setStatusCustomizados(statusAtivos.status_personalizados || []);

      // Entrega / Retirada
      setTrabalhoComEntregas(entregaRet.trabalho_com_entregas ?? true);
      setDescricaoEntregas(entregaRet.descricao_entregas || '');
      setTrabalhoComRetirada(entregaRet.trabalho_com_retirada ?? false);
      setDescricaoRetirada(entregaRet.descricao_retirada || '');

      // Parceiros
      setFacebookPixelId(parceiros.facebook_pixel_id || '');
      setTiktokPixelId(parceiros.tiktok_pixel_id || '');

      carregarFormasEntrega();
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
        geral: {
          tela_inicial_padrao: telaInicialPadrao,
          moeda,
          casas_decimais: casasDecimais,
          transacoes_canceladas: transacoesCanceladas,
          ordenar_produtos_pdv: ordenarProdutosPdv
        },
        preferencias_gerais: {
          casas_decimais: casasDecimais,
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
          em_producao: statusEmProducao,
          em_expedicao: statusEmExpedicao,
          saiu_para_entrega: statusSaiuEntrega,
          pronto_para_retirar: statusProntoRetirar,
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
          configuracoes_extras: novasExtras
        })
        .eq('id', loja.id);

      if (error) throw error;

      await recarregarDadosLoja();
      mostrarToast('Configurações salvas com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert(`Erro ao salvar: ${err.message || 'Tente novamente.'}`);
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
      alert(`Erro na exportação: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  // Itens do Menu Principal de Configurações em Botões
  const itensMenu = [
    { id: 'geral', label: 'Geral', icon: Settings },
    { id: 'dados-loja', label: 'Dados da Loja', icon: Store },
    { id: 'identificacao', label: 'Identificação Fiscal', icon: Lock },
    { id: 'produtos', label: 'Produtos & Variações', icon: Package, badge: 'NOVO' },
    { id: 'catalogo', label: 'Catálogo Online', icon: Globe },
    { id: 'recibo', label: 'Meu Recibo', icon: Receipt },
    { id: 'pagamentos', label: 'Opções de Pagamento', icon: CreditCard },
    { id: 'pedidos-vendas', label: 'Pedidos e Vendas', icon: Percent },
    { id: 'entrega', label: 'Opções de Entrega', icon: Truck },
    { id: 'exportar', label: 'Exportar Relatórios', icon: Download },
    { id: 'parceiros', label: 'Integrar com Parceiros', icon: Share2 }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* HEADER DA PÁGINA */}
      <div className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {subTela !== 'menu' && (
            <button
              type="button"
              onClick={() => setSubTela('menu')}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-100 flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-400" />
              <span>Configurações</span>
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSalvarTodasConfiguracoes}
          disabled={salvando}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{salvando ? 'Salvando...' : 'Salvar'}</span>
        </button>
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
                className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 hover:shadow-lg hover:shadow-emerald-500/5 flex flex-col items-center justify-center text-center gap-3 transition-all duration-200 cursor-pointer group relative"
              >
                {item.badge && (
                  <span className="absolute top-2.5 right-2.5 bg-emerald-500 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded-full shadow-sm">
                    {item.badge}
                  </span>
                )}
                <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30 text-emerald-400 flex items-center justify-center transition-all group-hover:scale-110">
                  <item.icon className="w-6 h-6" />
                </div>
                <span className="font-bold text-xs sm:text-sm text-slate-200 group-hover:text-emerald-400 transition leading-tight">
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Geral</h2>
              <p className="text-xs text-slate-400 mt-0.5">Moeda, casas decimais e tela inicial padrão</p>
            </div>

            {/* Tela Inicial */}
            <div
              onClick={() => setModalTelaInicial(true)}
              className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition cursor-pointer"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-200">Tela inicial</span>
                  <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full">NOVO</span>
                </div>
                <span className="text-xs text-emerald-400 uppercase font-extrabold block mt-0.5">
                  {telaInicialPadrao}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>

            {/* Moeda */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Moeda</span>
              <div className="text-sm font-bold text-slate-100">{moeda}</div>
            </div>

            {/* Casas Decimais */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <span className="font-bold text-xs text-slate-100 block">Casas decimais</span>
                <span className="text-[11px] text-slate-400">Exibir centavos em valores monetários (ex: R$ 10,00)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={casasDecimais}
                  onChange={(e) => setCasasDecimais(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Transações Canceladas */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block">Transações canceladas</span>
              <div className="space-y-2">
                {[
                  { id: 'riscadas', label: 'Exibir riscada' },
                  { id: 'ocultar', label: 'Ocultar' }
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer ${
                      transacoesCanceladas === opt.id
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <span className="font-bold text-xs">{opt.label}</span>
                    <input
                      type="radio"
                      name="transacoesCanceladas"
                      checked={transacoesCanceladas === opt.id}
                      onChange={() => setTransacoesCanceladas(opt.id as any)}
                      className="text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Ordenar produtos em Vender */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block">Ordenar produtos em Vender por</span>
              <div className="space-y-2">
                {[
                  { id: 'cadastro', label: 'Data do cadastro' },
                  { id: 'alfabetica', label: 'Ordem alfabética A-Z' }
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer ${
                      ordenarProdutosPdv === opt.id
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <span className="font-bold text-xs">{opt.label}</span>
                    <input
                      type="radio"
                      name="ordenarProdutosPdv"
                      checked={ordenarProdutosPdv === opt.id}
                      onChange={() => setOrdenarProdutosPdv(opt.id as any)}
                      className="text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: DADOS DA LOJA */}
        {/* ========================================================================= */}
        {subTela === 'dados-loja' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Dados da Loja</h2>
              <p className="text-xs text-slate-400 mt-0.5">Nome, logo, telefone, WhatsApp e endereço</p>
            </div>

            {/* Logo */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              {urlLogo ? (
                <div className="relative group w-24 h-24 rounded-2xl overflow-hidden border border-slate-700 bg-slate-900">
                  <img src={urlLogo} alt="Logo" className="w-full h-full object-contain p-2" />
                  <label className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-[10px] font-bold text-white cursor-pointer">
                    <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
                    Trocar Logo
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer space-y-2">
                  <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-emerald-400">Upload de sua marca</span>
                </label>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Nome da Loja</label>
                <input
                  type="text"
                  value={nomeLoja}
                  onChange={(e) => setNomeLoja(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-bold"
                  placeholder="Nome Fantasia da sua loja"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">WhatsApp (Principal)</label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                    placeholder="5585986072144"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Telefone/Celular (Opcional)</label>
                  <input
                    type="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                    placeholder="Telefone adicional"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Endereço (Rua, Número)</label>
                <input
                  type="text"
                  value={enderecoLogradouro}
                  onChange={(e) => setEnderecoLogradouro(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                  placeholder="Ex: Rua Bélgica, 945"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Complemento</label>
                  <input
                    type="text"
                    value={enderecoComplemento}
                    onChange={(e) => setEnderecoComplemento(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                    placeholder="Apto, Sala, Bloco..."
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Cidade</label>
                  <input
                    type="text"
                    value={enderecoCidade}
                    onChange={(e) => setEnderecoCidade(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                    placeholder="Cidade"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">CEP</label>
                  <input
                    type="text"
                    value={enderecoCep}
                    onChange={(e) => setEnderecoCep(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                    placeholder="60000-000"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: IDENTIFICAÇÃO FISCAL */}
        {/* ========================================================================= */}
        {subTela === 'identificacao' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Identificação Fiscal</h2>
              <p className="text-xs text-slate-400 mt-0.5">CPF, CNPJ e Razão Social da empresa</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">CPF ou CNPJ</label>
                <input
                  type="text"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono"
                  placeholder="00.000.000/0001-00"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Razão Social</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 uppercase"
                  placeholder="NOME DA EMPRESA LTDA"
                />
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  <strong>Estes dados não serão exibidos no catálogo.</strong><br />
                  Informar o CPF ou CNPJ é uma medida para validar a sua conta e preservar sua privacidade.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: MEU RECIBO */}
        {/* ========================================================================= */}
        {subTela === 'recibo' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-base text-slate-100">Meu Recibo</h2>
                <p className="text-xs text-slate-400 mt-0.5">Cabeçalho, rodapé e formato de impressão</p>
              </div>
              <button
                type="button"
                onClick={() => setModalPreviewRecibo(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>Ver meu recibo</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* Adicionar dados do cliente */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <span className="font-bold text-xs text-slate-100 block">Adicionar dados do cliente</span>
                  <span className="text-[11px] text-slate-400">Nome, Endereço e Telefone no corpo do recibo</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reciboAdicionarCliente}
                    onChange={(e) => setReciboAdicionarCliente(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Cabeçalho */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Texto do cabeçalho (opcional)</label>
                <textarea
                  rows={2}
                  value={reciboCabecalho}
                  onChange={(e) => setReciboCabecalho(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                  placeholder="Ex: Sejam muito bem-vindos à nossa loja!"
                />
              </div>

              {/* Rodapé */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Texto do rodapé (opcional)</label>
                <textarea
                  rows={2}
                  value={reciboRodape}
                  onChange={(e) => setReciboRodape(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                  placeholder="Ex: Trocas em até 7 dias com esta via. Volte sempre!"
                />
              </div>

              {/* Impressora Padrão */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-200 block">Formato de Impressão Padrão</span>
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
                      className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        tipoImpressaoPadrao === imp.id
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Opções de Pagamento</h2>
              <p className="text-xs text-slate-400 mt-0.5">Mercado Pago, PagBank, Asaas, Pix e Maquininhas</p>
            </div>

            {/* INTEGRAÇÕES DIGITAIS (AUTOMÁTICAS) */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                INTEGRAÇÃO DE PAGAMENTO DIGITAL
              </span>

              {/* SELETOR PRINCIPAL DO PROVEDOR COM SETA > */}
              <div
                onClick={() => setModalProvedor(true)}
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition group"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-xs transition ${
                      provedorDigital === 'mercado_pago'
                        ? 'bg-sky-500/20 text-sky-400'
                        : provedorDigital === 'pagseguro'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : provedorDigital === 'asaas'
                        ? 'bg-purple-500/20 text-purple-400'
                        : provedorDigital === 'stripe'
                        ? 'bg-indigo-500/20 text-indigo-400'
                        : provedorDigital === 'picpay'
                        ? 'bg-teal-500/20 text-teal-400'
                        : provedorDigital === 'google_pay'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-slate-900 text-slate-500'
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
                      <span className="font-bold text-xs text-slate-100">Provedor Selecionado</span>
                      {provedorDigital !== 'nenhum' ? (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                          ATIVO
                        </span>
                      ) : (
                        <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          DESATIVADO
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-extrabold block mt-0.5 text-emerald-400">
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
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition" />
              </div>

              {/* CAMPOS CONTEXTUAIS CONFORME O PROVEDOR SELECIONADO */}
              {provedorDigital === 'mercado_pago' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-sky-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-sky-400">Credenciais Mercado Pago</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Access Token de Produção</label>
                    <input
                      type="password"
                      value={mpAccessToken}
                      onChange={(e) => setMpAccessToken(e.target.value)}
                      placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Public Key</label>
                    <input
                      type="text"
                      value={mpPublicKey}
                      onChange={(e) => setMpPublicKey(e.target.value)}
                      placeholder="APP_USR-xxxxxxxx"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>
              )}

              {provedorDigital === 'pagseguro' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-emerald-400">Credenciais PagBank (PagSeguro)</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">E-mail da Conta PagBank</label>
                    <input
                      type="email"
                      value={pagseguroEmail}
                      onChange={(e) => setPagseguroEmail(e.target.value)}
                      placeholder="seu-email@pagseguro.com.br"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Token de Integração</label>
                    <input
                      type="password"
                      value={pagseguroToken}
                      onChange={(e) => setPagseguroToken(e.target.value)}
                      placeholder="Token gerado no painel PagBank"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Chave Pública (Public Key)</label>
                    <input
                      type="text"
                      value={pagseguroPublicKey}
                      onChange={(e) => setPagseguroPublicKey(e.target.value)}
                      placeholder="Public Key PagBank"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>
              )}

              {provedorDigital === 'asaas' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-purple-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-purple-400">Credenciais Asaas</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">API Key ($aact_...)</label>
                    <input
                      type="password"
                      value={asaasApiKey}
                      onChange={(e) => setAsaasApiKey(e.target.value)}
                      placeholder="$aact_YTU5YTE0M2M6N2Z..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Ambiente</label>
                    <select
                      value={asaasAmbiente}
                      onChange={(e) => setAsaasAmbiente(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                    >
                      <option value="producao">Produção (Real)</option>
                      <option value="sandbox">Sandbox (Testes)</option>
                    </select>
                  </div>
                </div>
              )}

              {provedorDigital === 'stripe' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-indigo-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-indigo-400">Credenciais Stripe</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Publishable Key (pk_live_...)</label>
                    <input
                      type="text"
                      value={stripePublishableKey}
                      onChange={(e) => setStripePublishableKey(e.target.value)}
                      placeholder="pk_live_..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Secret Key (sk_live_...)</label>
                    <input
                      type="password"
                      value={stripeSecretKey}
                      onChange={(e) => setStripeSecretKey(e.target.value)}
                      placeholder="sk_live_..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>
              )}

              {provedorDigital === 'picpay' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-teal-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-teal-400">Credenciais PicPay E-commerce</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">PicPay Token</label>
                    <input
                      type="password"
                      value={picpayToken}
                      onChange={(e) => setPicpayToken(e.target.value)}
                      placeholder="Token PicPay E-commerce"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Seller Token</label>
                    <input
                      type="password"
                      value={picpaySellerToken}
                      onChange={(e) => setPicpaySellerToken(e.target.value)}
                      placeholder="Seller Token PicPay"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>
              )}

              {provedorDigital === 'google_pay' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-amber-400">Google Pay & Carteiras Digitais</span>
                    <button
                      type="button"
                      onClick={() => setProvedorDigital('nenhum')}
                      className="text-[11px] text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Desativar
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Google Merchant ID</label>
                    <input
                      type="text"
                      value={googlePayMerchantId}
                      onChange={(e) => setGooglePayMerchantId(e.target.value)}
                      placeholder="BCR2DN6TZ6XXXXXX"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Botão de Atalho para Prazos e Taxas */}
              <div
                onClick={() => setSubTela('prazos-taxas')}
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition"
              >
                <div>
                  <span className="font-bold text-xs text-slate-200 block">Prazos e taxas das Maquininhas</span>
                  <span className="text-[11px] text-slate-400">Configure os prazos de recebimento para previsão no financeiro</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            </div>

            {/* OPÇÕES DE PAGAMENTO PRESENCIAIS / MANUAIS */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                OPÇÕES DE PAGAMENTO (CATÁLOGO E PDV)
              </span>

              {/* PIX */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-emerald-400" />
                    <div>
                      <span className="font-bold text-xs text-slate-100 block">Pix Manual / Chave</span>
                      <span className="text-[11px] text-slate-400">Chave Pix para transferências diretas</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pixAtivo}
                      onChange={(e) => setPixAtivo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
                {pixAtivo && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <input
                      type="text"
                      value={pixChave}
                      onChange={(e) => setPixChave(e.target.value)}
                      placeholder="Sua chave Pix (CPF, CNPJ, E-mail ou Telefone)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                    />
                    <input
                      type="text"
                      value={pixOrientacoes}
                      onChange={(e) => setPixOrientacoes(e.target.value)}
                      placeholder="Orientações adicionais (ex: Enviar comprovante no WhatsApp)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                    />
                  </div>
                )}
              </div>

              {/* DINHEIRO */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-xs text-slate-100">Dinheiro</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dinheiroAtivo}
                    onChange={(e) => setDinheiroAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* CARTÃO DE DÉBITO */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  <span className="font-bold text-xs text-slate-100">Cartão de Débito</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={debitoAtivo}
                    onChange={(e) => setDebitoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* CARTÃO DE CRÉDITO */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-xs text-slate-100">Cartão de Crédito</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creditoAtivo}
                    onChange={(e) => setCreditoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* FIADO */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-rose-400" />
                  <div>
                    <span className="font-bold text-xs text-slate-100 block">Fiado / Venda a Prazo</span>
                    <span className="text-[11px] text-slate-400">Controle de saldo pendente por cliente</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permitirFiado}
                    onChange={(e) => setPermitirFiado(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: PRAZOS E TAXAS (MAQUININHAS) */}
        {/* ========================================================================= */}
        {subTela === 'prazos-taxas' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Prazos e taxas das Maquininhas</h2>
              <p className="text-xs text-slate-400 mt-0.5">Prazos de recebimento e taxas para previsão no financeiro</p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-400 flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <p>
                Configure os prazos e taxas da sua maquininha para calcular os valores líquidos exatos e acompanhar a previsão de entradas no módulo financeiro.
              </p>
            </div>

            {/* Crédito */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-100">Cartões de crédito</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={maqCreditoAtivo}
                    onChange={(e) => setMaqCreditoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {maqCreditoAtivo && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Prazo de Recebimento</label>
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs">
                      <input
                        type="number"
                        value={maqCreditoDias}
                        onChange={(e) => setMaqCreditoDias(Number(e.target.value))}
                        className="bg-transparent text-slate-100 font-bold outline-none w-16"
                      />
                      <span className="text-slate-400 text-[11px]">dias corridos</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Taxa da Maquininha (%)</label>
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs">
                      <input
                        type="number"
                        step="0.01"
                        value={maqCreditoTaxa}
                        onChange={(e) => setMaqCreditoTaxa(Number(e.target.value))}
                        className="bg-transparent text-slate-100 font-bold outline-none w-16"
                      />
                      <span className="text-slate-400 text-[11px]">%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Débito */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-100">Cartões de débito</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={maqDebitoAtivo}
                    onChange={(e) => setMaqDebitoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {maqDebitoAtivo && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Prazo de Recebimento</label>
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs">
                      <input
                        type="number"
                        value={maqDebitoDias}
                        onChange={(e) => setMaqDebitoDias(Number(e.target.value))}
                        className="bg-transparent text-slate-100 font-bold outline-none w-16"
                      />
                      <span className="text-slate-400 text-[11px]">dias corridos</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Taxa da Maquininha (%)</label>
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs">
                      <input
                        type="number"
                        step="0.01"
                        value={maqDebitoTaxa}
                        onChange={(e) => setMaqDebitoTaxa(Number(e.target.value))}
                        className="bg-transparent text-slate-100 font-bold outline-none w-16"
                      />
                      <span className="text-slate-400 text-[11px]">%</span>
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Pedidos e Vendas</h2>
              <p className="text-xs text-slate-400 mt-0.5">Status de pedidos e taxas de venda adicionais</p>
            </div>

            {/* Atalho para Status de Pedidos */}
            <div
              onClick={() => setSubTela('status-pedidos')}
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition"
            >
              <div>
                <span className="font-bold text-xs text-slate-200 block">Status de Pedidos</span>
                <span className="text-[11px] text-slate-400">Ative ou crie novas etapas do fluxo operacional</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>

            {/* TAXA DE VENDA PDV */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-slate-100 block">Usar taxa de vendas no PDV</span>
                  <span className="text-[11px] text-slate-400">Taxa de serviço ou acréscimo automático</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usarTaxaVenda}
                    onChange={(e) => setUsarTaxaVenda(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {usarTaxaVenda && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Nome da Taxa</label>
                      <input
                        type="text"
                        value={nomeTaxaVenda}
                        onChange={(e) => setNomeTaxaVenda(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                        placeholder="Ex: Taxa de Serviço"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Valor da Taxa</label>
                      <input
                        type="number"
                        value={valorTaxaVenda}
                        onChange={(e) => setValorTaxaVenda(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-300 font-semibold">Taxa opcional (removível no PDV)</span>
                    <input
                      type="checkbox"
                      checked={taxaVendaOpcional}
                      onChange={(e) => setTaxaVendaOpcional(e.target.checked)}
                      className="rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700 w-4 h-4"
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Status de Pedidos</h2>
              <p className="text-xs text-slate-400 mt-0.5">Ative ou crie novas etapas do fluxo operacional</p>
            </div>

            <div className="space-y-3">
              {/* Fixos */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <div>
                    <span className="font-bold text-slate-200 block">Pendente</span>
                    <span className="text-[10px] text-slate-500">Aparece quando o cliente faz o pedido (Não baixa estoque)</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 font-bold">PADRÃO</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="font-bold text-slate-200 block">Confirmado</span>
                    <span className="text-[10px] text-slate-500">Vendedor confirma o pedido (Movimenta estoque)</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 font-bold">PADRÃO</span>
              </div>

              {/* Toggles Customizáveis */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                  <span className="font-bold text-slate-200">Em produção</span>
                </div>
                <input
                  type="checkbox"
                  checked={statusEmProducao}
                  onChange={(e) => setStatusEmProducao(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-slate-900 border-slate-700"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="font-bold text-slate-200">Em expedição</span>
                </div>
                <input
                  type="checkbox"
                  checked={statusEmExpedicao}
                  onChange={(e) => setStatusEmExpedicao(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-slate-900 border-slate-700"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  <span className="font-bold text-slate-200">Saiu para entrega</span>
                </div>
                <input
                  type="checkbox"
                  checked={statusSaiuEntrega}
                  onChange={(e) => setStatusSaiuEntrega(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-slate-900 border-slate-700"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-sky-400"></div>
                  <span className="font-bold text-slate-200">Pronto para retirar</span>
                </div>
                <input
                  type="checkbox"
                  checked={statusProntoRetirar}
                  onChange={(e) => setStatusProntoRetirar(e.target.checked)}
                  className="rounded text-emerald-500 w-4 h-4 bg-slate-900 border-slate-700"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: OPÇÕES DE ENTREGA & RETIRADA */}
        {/* ========================================================================= */}
        {subTela === 'entrega' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Opções de Entrega & Retirada</h2>
              <p className="text-xs text-slate-400 mt-0.5">Configure entregas via motoboy e retirada no balcão</p>
            </div>

            {/* Entregas */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5 text-emerald-400" />
                  <div>
                    <span className="font-bold text-xs text-slate-100 block">Trabalho com Entregas</span>
                    <span className="text-[11px] text-slate-400">Envio de pedidos para endereço do cliente</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trabalhoComEntregas}
                    onChange={(e) => setTrabalhoComEntregas(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {trabalhoComEntregas && (
                <div className="pt-2 border-t border-slate-800">
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Orientações de Entrega</label>
                  <textarea
                    rows={2}
                    value={descricaoEntregas}
                    onChange={(e) => setDescricaoEntregas(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                    placeholder="Ex: Entregas feitas via Motoboy / Uber Envios"
                  />
                </div>
              )}
            </div>

            {/* Retirada */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Store className="w-5 h-5 text-amber-400" />
                  <div>
                    <span className="font-bold text-xs text-slate-100 block">Retirada no Balcão</span>
                    <span className="text-[11px] text-slate-400">Cliente busca o pedido na sua loja</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trabalhoComRetirada}
                    onChange={(e) => setTrabalhoComRetirada(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {trabalhoComRetirada && (
                <div className="pt-2 border-t border-slate-800">
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Orientações de Retirada</label>
                  <textarea
                    rows={2}
                    value={descricaoRetirada}
                    onChange={(e) => setDescricaoRetirada(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                    placeholder="Ex: Disponível no balcão em horário comercial."
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: EXPORTAR RELATÓRIOS */}
        {/* ========================================================================= */}
        {subTela === 'exportar' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Exportar Relatórios</h2>
              <p className="text-xs text-slate-400 mt-0.5">Download CSV de vendas, produtos e clientes</p>
            </div>

            {/* Período */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Informe o período</span>
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Data Inicial</label>
                  <input
                    type="date"
                    value={dataInicioExport}
                    onChange={(e) => setDataInicioExport(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Data Final</label>
                  <input
                    type="date"
                    value={dataFimExport}
                    onChange={(e) => setDataFimExport(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Seleção de Relatórios */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-300 block">Quais relatórios deseja exportar?</span>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportarVendas}
                    onChange={(e) => setExportarVendas(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-200">Vendas</span>
                </label>
                <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportarProdutos}
                    onChange={(e) => setExportarProdutos(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-200">Produtos</span>
                </label>
                <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportarClientes}
                    onChange={(e) => setExportarClientes(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-200">Clientes</span>
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportarRelatorios}
              disabled={salvando || (!exportarVendas && !exportarProdutos && !exportarClientes)}
              className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-40"
            >
              <Download className="w-5 h-5" />
              <span>{salvando ? 'Gerando arquivo...' : 'Exportar Arquivos (CSV / Excel)'}</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-TELA: INTEGRAR COM PARCEIROS (INSTAGRAM, FACEBOOK, GOOGLE, TIKTOK) */}
        {/* ========================================================================= */}
        {subTela === 'parceiros' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 animate-in fade-in">
            <div>
              <h2 className="font-extrabold text-base text-slate-100">Integrar com Parceiros</h2>
              <p className="text-xs text-slate-400 mt-0.5">Instagram Shopping, Facebook Pixel, Google Merchant e TikTok</p>
            </div>

            {/* FACEBOOK & INSTAGRAM */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-2 uppercase">
                <Share2 className="w-4 h-4 text-pink-400" /> Facebook & Instagram
              </span>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-100">Instagram Shopping & Loja do Facebook</h4>
                    <p className="text-[11px] text-slate-400">Feed de produtos para etiquetar itens nos posts e stories</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiarTexto(`${window.location.origin}/feed/facebook/${loja?.slug_catalogo || loja?.id}`, 'fb_feed')}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-emerald-400 hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiadoTexto === 'fb_feed' ? 'Copiado!' : 'Copiar Link XML'}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-xs text-slate-100 block">Facebook Pixel</span>
                <input
                  type="text"
                  value={facebookPixelId}
                  onChange={(e) => setFacebookPixelId(e.target.value)}
                  placeholder="ID do Pixel (Ex: 123456789012345)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                />
              </div>
            </div>

            {/* GOOGLE SHOPPING */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-2 uppercase">
                <Globe className="w-4 h-4 text-sky-400" /> Google Shopping (Merchant Center)
              </span>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-100">Feed Google Merchant Center</h4>
                    <p className="text-[11px] text-slate-400">Alcance clientes nas pesquisas do Google Shopping</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiarTexto(`${window.location.origin}/feed/google/${loja?.slug_catalogo || loja?.id}`, 'google_feed')}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-emerald-400 hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiadoTexto === 'google_feed' ? 'Copiado!' : 'Copiar Link XML'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* TIKTOK BUSINESS */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-2 uppercase">
                <Smartphone className="w-4 h-4 text-rose-400" /> TikTok Business
              </span>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-xs text-slate-100 block">TikTok Pixel ID</span>
                <input
                  type="text"
                  value={tiktokPixelId}
                  onChange={(e) => setTiktokPixelId(e.target.value)}
                  placeholder="ID do TikTok Pixel"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL: SELETOR DE TELA INICIAL */}
      {/* ========================================================================= */}
      {modalTelaInicial && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-100">Tela inicial</h3>
              <button onClick={() => setModalTelaInicial(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { id: 'inicio', title: 'Início', desc: 'Resumo das informações mais importantes' },
                { id: 'pdv', title: 'Vender (PDV)', desc: 'Abertura direta na tela de vendas' },
                { id: 'pedidos', title: 'Pedidos em aberto', desc: 'Fluxo de pedidos operacionais' },
                { id: 'products', title: 'Produtos', desc: 'Estoque e catálogo de produtos' },
                { id: 'customers', title: 'Clientes', desc: 'Gestão de contatos e fiado' },
                { id: 'analytics', title: 'Estatísticas', desc: 'Relatórios de faturamento' }
              ].map((opt) => (
                <label
                  key={opt.id}
                  onClick={() => {
                    setTelaInicialPadrao(opt.id);
                    setModalTelaInicial(false);
                  }}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer ${
                    telaInicialPadrao === opt.id
                      ? 'bg-emerald-500/10 border-emerald-500 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div>
                    <span className="font-bold text-xs block">{opt.title}</span>
                    <span className="text-[10px] text-slate-500 block">{opt.desc}</span>
                  </div>
                  {telaInicialPadrao === opt.id && <Check className="w-4 h-4 text-emerald-400" />}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PREVIEW DO RECIBO */}
      {/* ========================================================================= */}
      {modalPreviewRecibo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-100">Recibo da Loja (Preview)</h3>
              <button onClick={() => setModalPreviewRecibo(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white text-slate-900 rounded-2xl p-4 font-mono text-xs shadow-inner space-y-3">
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
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Folha A4</span>
              </button>

              <button
                type="button"
                onClick={() => setModalPreviewRecibo(false)}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <Download className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Seus relatórios estão prontos! 🎉</h3>
              <p className="text-xs text-slate-400 mt-1">O download do arquivo CSV/Excel foi iniciado no seu dispositivo.</p>
            </div>
            <button
              type="button"
              onClick={() => setModalExportConcluido(false)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-100">Provedor de Pagamento Digital</h3>
                <p className="text-xs text-slate-400 mt-0.5">Selecione o provedor para integração automática</p>
              </div>
              <button
                type="button"
                onClick={() => setModalProvedor(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
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
                  cor: 'text-slate-400 bg-slate-800/40',
                  badge: 'OFF'
                },
                {
                  id: 'mercado_pago',
                  nome: 'Mercado Pago',
                  desc: 'Pix dinâmico com QR Code, link de pagamento e cartão',
                  cor: 'text-sky-400 bg-sky-500/20',
                  badge: 'MP'
                },
                {
                  id: 'pagseguro',
                  nome: 'PagBank (PagSeguro)',
                  desc: 'Checkout transparente, Pix e cartão de crédito',
                  cor: 'text-emerald-400 bg-emerald-500/20',
                  badge: 'PAG'
                },
                {
                  id: 'asaas',
                  nome: 'Asaas',
                  desc: 'Pix dinâmico com webhook, boleto bancário e cartão',
                  cor: 'text-purple-400 bg-purple-500/20',
                  badge: 'AS'
                },
                {
                  id: 'stripe',
                  nome: 'Stripe',
                  desc: 'Cartões nacionais e internacionais, Apple Pay',
                  cor: 'text-indigo-400 bg-indigo-500/20',
                  badge: 'ST'
                },
                {
                  id: 'picpay',
                  nome: 'PicPay E-commerce',
                  desc: 'Pagamento via aplicativo PicPay e QR Code',
                  cor: 'text-teal-400 bg-teal-500/20',
                  badge: 'PIC'
                },
                {
                  id: 'google_pay',
                  nome: 'Google Pay & Carteiras',
                  desc: 'Pagamento com 1 clique em dispositivos Android/Chrome',
                  cor: 'text-amber-400 bg-amber-500/20',
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
                      ? 'bg-emerald-500/10 border-emerald-500/60 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-[11px] shrink-0 ${item.cor}`}
                    >
                      {item.badge}
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-100 block">{item.nome}</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">{item.desc}</span>
                    </div>
                  </div>
                  {provedorDigital === item.id && (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
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
