import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Share2,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  Users,
  DollarSign,
  Settings,
  LogOut,
  Image as ImageIcon,
  Upload,
  X,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  QrCode,
  Store,
  CreditCard,
  Plus,
  Trash2,
  Layers,
  Smartphone,
  Search,
  MessageCircle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ModoExibicaoCatalogo,
  ComportamentoSemEstoque,
  FormaEntrega
} from '../types';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import { MobileHeader } from './layout/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';

type SubTelaCatalogoMobile =
  | 'hub'                  // TELA001
  | 'dados-loja'           // TELA002
  | 'identificacao'        // TELA003
  | 'opcoes-exibicao'      // TELA004
  | 'pedidos'              // TELA005
  | 'redes-sociais'        // TELA006 / TELA016
  | 'cor-principal'        // TELA007
  | 'modo-exibicao'        // TELA008
  | 'produtos-sem-estoque' // TELA009
  | 'banner'               // TELA010
  | 'orientacoes'          // TELA011
  | 'entrega'              // TELA012
  | 'retirada'             // TELA013
  | 'taxa'                 // TELA014
  | 'meios-pagamento'      // TELA015
  | 'parceiros'            // TELA017
  | 'facebook-shopping'    // TELA018
  | 'pedidos-comida'       // TELA019
  | 'facebook-pixel'       // TELA020
  | 'google-shopping'      // TELA021
  | 'tiktok-business';     // TELA022

const CORES_PALETA_SUGESTOES = [
  { hex: '#10B981', nome: 'Verde Esmeralda' },
  { hex: '#059669', nome: 'Verde Floresta' },
  { hex: '#0D9488', nome: 'Teal Ciano' },
  { hex: '#3B82F6', nome: 'Azul Real' },
  { hex: '#1E3A8A', nome: 'Azul Noturno' },
  { hex: '#6366F1', nome: 'Índigo Vibrante' },
  { hex: '#8B5CF6', nome: 'Púrpura Violeta' },
  { hex: '#EC4899', nome: 'Rosa Shock' },
  { hex: '#EF4444', nome: 'Vermelho Intenso' },
  { hex: '#F97316', nome: 'Laranja Radiante' },
  { hex: '#F59E0B', nome: 'Amarelo Dourado' },
  { hex: '#1F2937', nome: 'Preto Grafite' }
];

export const ConfiguracaoCatalogoMobile: React.FC = () => {
  const { loja, recarregarDadosLoja, desconectarPdv } = useAuth();
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const navigate = useNavigate();

  // Tokens de Layout alinhados ao PDV
  const telaContainerClass = `flex flex-col h-full ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`;
  const headerSubtelaClass = `p-4 border-b flex items-center justify-between shrink-0 ${isDark ? 'bg-[#08131A] border-slate-800 text-white' : 'bg-slate-100 border-slate-300 text-black'}`;
  const headerBtnVoltarClass = `p-2 rounded-xl transition cursor-pointer ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'}`;
  const cardBoxClass = `rounded-2xl border p-4 shadow-xs ${isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`;
  const rodapeFixoClass = `p-4 border-t shrink-0 ${isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-100 border-slate-300'}`;
  const btnSalvarFixoClass = "w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-black shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 border border-emerald-500 transition cursor-pointer disabled:opacity-50";
  const btnSecundarioClass = `w-full py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${isDark ? 'border-slate-700 text-white bg-[#000000] hover:bg-slate-800' : 'border-slate-300 text-black bg-white hover:bg-slate-100'}`;

  // Pilha de Navegação Mobile
  const [subTela, setSubTela] = useState<SubTelaCatalogoMobile>('hub');
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagemToast, setMensagemToast] = useState<{ texto: string; tipo: 'sucesso' | 'erro' } | null>(null);

  // Modais de Apoio
  const [modalEditarSlug, setModalEditarSlug] = useState<boolean>(false);
  const [modalCompartilharAberto, setModalCompartilharAberto] = useState<boolean>(false);
  const [modalOpcaoEntregaAberto, setModalOpcaoEntregaAberto] = useState<boolean>(false);

  // -------------------------------------------------------------------------
  // ESTADOS DO CATÁLOGO (SINCRONIZADOS COM BANCO)
  // -------------------------------------------------------------------------
  
  // TELA001: HUB & GERAL
  const [publicarCatalogo, setPublicarCatalogo] = useState<boolean>(true);
  const [slugCatalogo, setSlugCatalogo] = useState<string>('');
  const [novoSlug, setNovoSlug] = useState<string>('');
  const [erroSlug, setErroSlug] = useState<string>('');

  // TELA002: DADOS DA LOJA
  const [nomeLoja, setNomeLoja] = useState<string>('');
  const [urlLogo, setUrlLogo] = useState<string>('');
  const [telefone, setTelefone] = useState<string>('');
  const [endereco, setEndereco] = useState<string>('');
  const [complemento, setComplemento] = useState<string>('');

  // TELA003: IDENTIFICAÇÃO
  const [cpfCnpj, setCpfCnpj] = useState<string>('');
  const [razaoSocial, setRazaoSocial] = useState<string>('');

  // TELA004 & SUBTELAS: OPÇÕES DE EXIBIÇÃO
  const [corPrimaria, setCorPrimaria] = useState<string>('#10B981');
  const [abaCor, setAbaCor] = useState<'sugestoes' | 'personalizada'>('personalizada');
  const [modoExibicao, setModoExibicao] = useState<ModoExibicaoCatalogo>('grade');
  const [produtosSemEstoque, setProdutosSemEstoque] = useState<ComportamentoSemEstoque>('exibir');
  const [exibirProdutosSemFoto, setExibirProdutosSemFoto] = useState<boolean>(false);
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [exibirBanner, setExibirBanner] = useState<boolean>(false);
  const [uploadingBanner, setUploadingBanner] = useState<boolean>(false);

  // TELA005 & SUBTELAS: PEDIDOS
  const [aceitarPedidosOnline, setAceitarPedidosOnline] = useState<boolean>(true);
  const [resumoWhatsapp, setResumoWhatsapp] = useState<boolean>(true);
  const [exigirPesagemPreviaPagamento, setExigirPesagemPreviaPagamento] = useState<boolean>(false);
  const [orientacoesPosPedido, setOrientacoesPosPedido] = useState<string>(
    'Em breve entraremos em contato para confirmar os detalhes da sua compra.\n\nAgradecemos pela preferência!'
  );

  // TELA012: ENTREGA
  const [trabalhoComEntregas, setTrabalhoComEntregas] = useState<boolean>(true);
  const [descricaoEntregas, setDescricaoEntregas] = useState<string>('Entregas rápidas via motoboy ou transportadora.');
  const [opcoesEntrega, setOpcoesEntrega] = useState<FormaEntrega[]>([]);
  const [novaOpcaoEntrega, setNovaOpcaoEntrega] = useState<{ nome: string; valor: string; prazo: string }>({
    nome: '',
    valor: '',
    prazo: ''
  });

  // TELA013: RETIRADA
  const [trabalhoComRetirada, setTrabalhoComRetirada] = useState<boolean>(true);

  // TELA014: TAXA DO CATÁLOGO
  const [usarTaxaCatalogo, setUsarTaxaCatalogo] = useState<boolean>(false);
  const [nomeTaxaCatalogo, setNomeTaxaCatalogo] = useState<string>('Taxa de Serviço');
  const [valorTaxaCatalogo, setValorTaxaCatalogo] = useState<string>('');
  const [tipoTaxaCatalogo, setTipoTaxaCatalogo] = useState<'percentual' | 'fixo'>('percentual');
  const [aplicarTaxaCatalogo, setAplicarTaxaCatalogo] = useState<'adicionar' | 'incluida'>('adicionar');
  const [taxaSomenteEntrega, setTaxaSomenteEntrega] = useState<boolean>(true);

  // TELA015: MEIOS DE PAGAMENTO
  const [pagamentoMercadoPagoAtivo, setPagamentoMercadoPagoAtivo] = useState<boolean>(false);
  const [pixAtivo, setPixAtivo] = useState<boolean>(true);
  const [dinheiroAtivo, setDinheiroAtivo] = useState<boolean>(true);
  const [debitoAtivo, setDebitoAtivo] = useState<boolean>(true);
  const [creditoAtivo, setCreditoAtivo] = useState<boolean>(true);
  const [outrosAtivo, setOutrosAtivo] = useState<boolean>(false);

  // TELA006 / TELA016: REDES SOCIAIS & OUTROS
  const [whatsappLoja, setWhatsappLoja] = useState<string>('');
  const [instagramLoja, setInstagramLoja] = useState<string>('');
  const [emailLoja, setEmailLoja] = useState<string>('');
  const [informacoesExtras, setInformacoesExtras] = useState<string>('');

  // TELA017 A TELA022: PARCEIROS & PIXELS
  const [facebookPixelId, setFacebookPixelId] = useState<string>('');
  const [tiktokPixelId, setTiktokPixelId] = useState<string>('');

  // -------------------------------------------------------------------------
  // CARREGAR DADOS DO SUPABASE
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (loja) {
      const extras = loja.configuracoes_extras || {};
      const catConfig = extras.catalogo || {};
      const entRet = extras.entrega_retirada || {};
      const taxas = extras.taxas_venda || {};
      const pags = extras.pagamentos || {};
      const pagsDig = extras.pagamentos_digitais || {};
      const parceiros = extras.integracoes_parceiros || {};

      setPublicarCatalogo(catConfig.publicar_catalogo ?? true);
      setSlugCatalogo(loja.slug_catalogo || loja.id || '');
      setNovoSlug(loja.slug_catalogo || loja.id || '');

      setNomeLoja(loja.nome_fantasia || '');
      setUrlLogo(loja.url_logo || '');
      setTelefone(loja.telefone || '');
      setEndereco(
        [loja.endereco_logradouro, loja.endereco_numero, loja.endereco_bairro, loja.endereco_cidade]
          .filter(Boolean)
          .join(', ')
      );
      setComplemento(loja.endereco_complemento || '');

      setCpfCnpj(loja.numero_documento || (loja as any).cpf_cnpj || '');
      setRazaoSocial(loja.razao_social || '');

      setCorPrimaria(loja.cor_primaria || '#10B981');
      setModoExibicao(catConfig.modo_exibicao || 'grade');
      setProdutosSemEstoque(catConfig.produtos_sem_estoque || 'exibir');
      setExibirProdutosSemFoto(catConfig.exibir_produtos_sem_foto ?? false);
      setBannerUrl(loja.url_banner || '');
      setExibirBanner(catConfig.exibir_banner ?? Boolean(loja.url_banner));

      setAceitarPedidosOnline(loja.aceita_pedidos_online ?? true);
      setResumoWhatsapp(loja.resumo_whatsapp ?? true);
      setExigirPesagemPreviaPagamento(Boolean(loja.exigir_pesagem_previa_pagamento));
      if (loja.instrucoes_pos_pedido !== undefined && loja.instrucoes_pos_pedido !== null) {
        setOrientacoesPosPedido(loja.instrucoes_pos_pedido);
      }

      setTrabalhoComEntregas(entRet.trabalho_com_entregas ?? true);
      setDescricaoEntregas(entRet.descricao_entregas || 'Entregas rápidas via motoboy ou transportadora.');
      setTrabalhoComRetirada(entRet.trabalho_com_retirada ?? true);

      setUsarTaxaCatalogo(taxas.usar_taxa_catalogo ?? false);
      setNomeTaxaCatalogo(taxas.nome_taxa_catalogo || 'Taxa de Serviço');
      setValorTaxaCatalogo(taxas.valor_taxa_catalogo !== undefined ? String(taxas.valor_taxa_catalogo) : '');
      setTipoTaxaCatalogo(taxas.tipo_taxa_catalogo || 'percentual');
      setAplicarTaxaCatalogo(taxas.aplicar_taxa_catalogo || 'adicionar');
      setTaxaSomenteEntrega(taxas.taxa_catalogo_somente_entrega ?? true);

      setPagamentoMercadoPagoAtivo(Boolean(pagsDig.mercado_pago?.ativo));
      setPixAtivo(pags.pix_ativo ?? true);
      setDinheiroAtivo(pags.dinheiro_ativo ?? true);
      setDebitoAtivo(pags.debito_ativo ?? true);
      setCreditoAtivo(pags.credito_ativo ?? true);
      setOutrosAtivo(pags.outros_ativo ?? false);

      setWhatsappLoja(loja.whatsapp || loja.telefone || '');
      setInstagramLoja(loja.instagram || '');
      setEmailLoja(loja.email || '');
      setInformacoesExtras(loja.sobre_loja || '');

      setFacebookPixelId(parceiros.facebook_pixel_id || '');
      setTiktokPixelId(parceiros.tiktok_pixel_id || '');

      // Carregar Formas de Entrega da Loja
      carregarFormasEntrega(loja.id);
    }
  }, [loja]);

  const carregarFormasEntrega = async (lojaId: string) => {
    try {
      const { data } = await supabase
        .from('formas_entrega')
        .select('*')
        .eq('loja_id', lojaId)
        .order('criado_em', { ascending: true });
      if (data) setOpcoesEntrega(data as FormaEntrega[]);
    } catch (e) {
      console.warn('Erro ao carregar formas de entrega:', e);
    }
  };

  const catalogoUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/catalog/${slugCatalogo || loja?.id || ''}`;
    }
    return `https://hubi.app/catalog/${slugCatalogo || ''}`;
  }, [slugCatalogo, loja?.id]);

  const feedInstagramUrl = `${catalogoUrl}/feed/instagram`;
  const feedGoogleUrl = `${catalogoUrl}/feed/google`;

  // -------------------------------------------------------------------------
  // FEEDBACK E TOASTS
  // -------------------------------------------------------------------------
  const mostrarToast = (texto: string, tipo: 'sucesso' | 'erro' = 'sucesso') => {
    setMensagemToast({ texto, tipo });
    setTimeout(() => setMensagemToast(null), 3000);
  };

  const copiarParaTransferencia = async (texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      mostrarToast(`${label} copiado com sucesso!`, 'sucesso');
    } catch {
      mostrarToast('Não foi possível copiar.', 'erro');
    }
  };

  // -------------------------------------------------------------------------
  // SALVAR ALTERAÇÕES GERAIS
  // -------------------------------------------------------------------------
  const salvarDadosGerais = async (mensagemSucesso: string = 'Salvo com sucesso!', voltarParaHub: boolean = false) => {
    if (!loja?.id) return;
    try {
      setSalvando(true);
      const extras = loja.configuracoes_extras || {};
      const novasExtras = {
        ...extras,
        catalogo: {
          ...extras.catalogo,
          publicar_catalogo: publicarCatalogo,
          modo_exibicao: modoExibicao,
          produtos_sem_estoque: produtosSemEstoque,
          exibir_produtos_sem_foto: exibirProdutosSemFoto,
          exibir_banner: exibirBanner
        },
        entrega_retirada: {
          ...extras.entrega_retirada,
          trabalho_com_entregas: trabalhoComEntregas,
          descricao_entregas: descricaoEntregas,
          trabalho_com_retirada: trabalhoComRetirada
        },
        taxas_venda: {
          ...extras.taxas_venda,
          usar_taxa_catalogo: usarTaxaCatalogo,
          nome_taxa_catalogo: nomeTaxaCatalogo,
          valor_taxa_catalogo: parseFloat(valorTaxaCatalogo.replace(',', '.')) || 0,
          tipo_taxa_catalogo: tipoTaxaCatalogo,
          aplicar_taxa_catalogo: aplicarTaxaCatalogo,
          taxa_catalogo_somente_entrega: taxaSomenteEntrega
        },
        pagamentos: {
          ...extras.pagamentos,
          pix_ativo: pixAtivo,
          dinheiro_ativo: dinheiroAtivo,
          debito_ativo: debitoAtivo,
          credito_ativo: creditoAtivo,
          outros_ativo: outrosAtivo
        },
        pagamentos_digitais: {
          ...extras.pagamentos_digitais,
          mercado_pago: {
            ...extras.pagamentos_digitais?.mercado_pago,
            ativo: pagamentoMercadoPagoAtivo
          }
        },
        integracoes_parceiros: {
          ...extras.integracoes_parceiros,
          facebook_pixel_id: facebookPixelId.trim(),
          tiktok_pixel_id: tiktokPixelId.trim()
        }
      };

      const { error } = await supabase
        .from('lojas')
        .update({
          nome_fantasia: nomeLoja.trim(),
          url_logo: urlLogo,
          telefone: telefone.trim(),
          endereco_complemento: complemento.trim(),
          numero_documento: cpfCnpj.trim(),
          razao_social: razaoSocial.trim(),
          cor_primaria: corPrimaria,
          aceita_pedidos_online: aceitarPedidosOnline,
          resumo_whatsapp: resumoWhatsapp,
          exigir_pesagem_previa_pagamento: exigirPesagemPreviaPagamento,
          instrucoes_pos_pedido: orientacoesPosPedido,
          url_banner: bannerUrl,
          whatsapp: whatsappLoja.trim(),
          instagram: instagramLoja.trim(),
          email: emailLoja.trim(),
          sobre_loja: informacoesExtras.trim(),
          configuracoes_extras: novasExtras
        })
        .eq('id', loja.id);

      if (error) throw error;

      await recarregarDadosLoja();
      mostrarToast(mensagemSucesso, 'sucesso');
      if (voltarParaHub) {
        setSubTela('hub');
      }
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      mostrarToast(err?.message || 'Erro ao salvar alterações.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  // -------------------------------------------------------------------------
  // SALVAR SLUG PERSONALIZADO
  // -------------------------------------------------------------------------
  const salvarSlugPersonalizado = async () => {
    if (!novoSlug.trim()) {
      setErroSlug('O link não pode ficar vazio.');
      return;
    }
    const formatado = novoSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-');

    try {
      setSalvando(true);
      setErroSlug('');
      const { error } = await supabase
        .from('lojas')
        .update({ slug_catalogo: formatado })
        .eq('id', loja?.id);

      if (error) throw error;

      setSlugCatalogo(formatado);
      setModalEditarSlug(false);
      mostrarToast('Link do catálogo atualizado!', 'sucesso');
      await recarregarDadosLoja();
    } catch (err: any) {
      setErroSlug('Link já em uso ou inválido.');
    } finally {
      setSalvando(false);
    }
  };

  // -------------------------------------------------------------------------
  // UPLOAD DE LOGO & BANNER
  // -------------------------------------------------------------------------
  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !loja?.id) return;
    try {
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `logos/${loja.id}_${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage.from('produtos').upload(fileName, file, { upsert: true });
      if (!error && data) {
        const { data: pData } = supabase.storage.from('produtos').getPublicUrl(fileName);
        if (pData?.publicUrl) {
          setUrlLogo(pData.publicUrl);
          return;
        }
      }

      // Fallback base64
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') setUrlLogo(reader.result);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.warn('Erro ao enviar logo:', err);
    }
  };

  const handleUploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !loja?.id) return;
    try {
      setUploadingBanner(true);
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `banners/${loja.id}_${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage.from('produtos').upload(fileName, file, { upsert: true });
      if (!error && data) {
        const { data: pData } = supabase.storage.from('produtos').getPublicUrl(fileName);
        if (pData?.publicUrl) {
          setBannerUrl(pData.publicUrl);
          setExibirBanner(true);
          return;
        }
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setBannerUrl(reader.result);
          setExibirBanner(true);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.warn('Erro ao enviar banner:', err);
    } finally {
      setUploadingBanner(false);
    }
  };

  // -------------------------------------------------------------------------
  // ADICIONAR OPÇÃO DE ENTREGA (TELA012)
  // -------------------------------------------------------------------------
  const adicionarOpcaoEntrega = async () => {
    if (!novaOpcaoEntrega.nome.trim() || !loja?.id) return;
    try {
      setSalvando(true);
      const { data, error } = await supabase
        .from('formas_entrega')
        .insert([{
          loja_id: loja.id,
          nome: novaOpcaoEntrega.nome.trim(),
          valor_taxa: parseFloat(novaOpcaoEntrega.valor.replace(',', '.')) || 0,
          valor_por_km: 0,
          tempo_estimado: novaOpcaoEntrega.prazo.trim(),
          tipo: 'taxa_fixa',
          ativo: true
        }])
        .select();

      if (error) throw error;
      if (data) {
        setOpcoesEntrega(prev => [...prev, ...data]);
      }
      setNovaOpcaoEntrega({ nome: '', valor: '', prazo: '' });
      setModalOpcaoEntregaAberto(false);
      mostrarToast('Opção de entrega adicionada!', 'sucesso');
    } catch (err: any) {
      mostrarToast(err?.message || 'Erro ao adicionar entrega', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const removerOpcaoEntrega = async (id: string) => {
    try {
      await supabase.from('formas_entrega').delete().eq('id', id);
      setOpcoesEntrega(prev => prev.filter(item => item.id !== id));
      mostrarToast('Opção removida', 'sucesso');
    } catch {
      mostrarToast('Erro ao remover', 'erro');
    }
  };

  // -------------------------------------------------------------------------
  // RENDERIZAÇÃO DAS TELAS
  // -------------------------------------------------------------------------

  return (
    <div className={`flex flex-col h-screen w-full overflow-hidden select-none font-sans ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
      
      {/* TOAST DE FEEDBACK FLUTUANTE */}
      {mensagemToast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-black text-white animate-in slide-in-from-top duration-200 ${
          mensagemToast.tipo === 'sucesso' ? 'bg-emerald-600 shadow-emerald-900/30' : 'bg-rose-600 shadow-rose-900/30'
        }`}>
          {mensagemToast.tipo === 'sucesso' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{mensagemToast.texto}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA001: HUB PRINCIPAL DO CATÁLOGO ONLINE                             */}
      {/* ===================================================================== */}
      {subTela === 'hub' && (
        <div className={telaContainerClass}>
          {/* Header Superior Mobile Unificado */}
          <MobileHeader
            titulo="Catálogo Online"
          />

          {/* Conteúdo com Scroll */}
          <div className={`flex-1 overflow-y-auto divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
            {/* Card Switch: Publicar Catálogo Online */}
            <div className={`p-4 flex items-center justify-between ${isDark ? 'bg-[#000000]/40' : 'bg-white'}`}>
              <div>
                <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>Publicar Catálogo Online</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{slugCatalogo || 'minhaloja'}.hubi.app</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNovoSlug(slugCatalogo);
                      setModalEditarSlug(true);
                    }}
                    className="text-xs font-black text-emerald-500 hover:text-emerald-400 hover:underline cursor-pointer"
                  >
                    editar
                  </button>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={publicarCatalogo}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setPublicarCatalogo(val);
                    salvarDadosGerais(val ? 'Catálogo publicado!' : 'Catálogo despublicado.');
                  }}
                  className="sr-only peer"
                />
                <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                  publicarCatalogo ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                }`}></div>
              </label>
            </div>

            {/* Menu de Subtelas (TELA002 a TELA006) */}
            <div className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
              <button
                type="button"
                onClick={() => setSubTela('dados-loja')}
                className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
                }`}
              >
                <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Dados da Loja</span>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>

              <button
                type="button"
                onClick={() => setSubTela('identificacao')}
                className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
                }`}
              >
                <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Identificação</span>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>

              <button
                type="button"
                onClick={() => setSubTela('opcoes-exibicao')}
                className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
                }`}
              >
                <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Opções de exibição</span>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>

              <button
                type="button"
                onClick={() => setSubTela('pedidos')}
                className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
                }`}
              >
                <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Pedidos</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-black uppercase ${
                    aceitarPedidosOnline ? 'text-emerald-500' : (isDark ? 'text-slate-600' : 'text-slate-400')
                  }`}>
                    {aceitarPedidosOnline ? 'LIGADO' : 'DESLIGADO'}
                  </span>
                  <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSubTela('redes-sociais')}
                className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
                }`}
              >
                <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Redes sociais & Outros</span>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>
            </div>
          </div>

          {/* Rodapé Fixo com Botões (TELA001) */}
          <div className={rodapeFixoClass}>
            <div className="space-y-2.5">
              <a
                href={catalogoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={btnSecundarioClass}
              >
                <span>Abrir catálogo</span>
              </a>

              <button
                type="button"
                onClick={() => setModalCompartilharAberto(true)}
                className={btnSalvarFixoClass}
              >
                <Share2 className="w-4 h-4" />
                <span>Compartilhar catálogo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA002: DADOS DA LOJA                                                */}
      {/* ===================================================================== */}
      {subTela === 'dados-loja' && (
        <div className={telaContainerClass}>
          {/* Header Superior */}
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Dados da Loja</h1>
            </div>
          </div>

          {/* Formulário Dados da Loja */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Logo da Loja com Preview e Remoção */}
            <div className="flex flex-col items-center justify-center pt-2">
              {urlLogo ? (
                <div className="relative group">
                  <div className={`w-36 h-20 rounded-2xl border overflow-hidden shadow-sm flex items-center justify-center p-2 ${
                    isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-slate-300'
                  }`}>
                    <img src={urlLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setUrlLogo('')}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-md transition cursor-pointer"
                    title="Remover Logo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className={`w-36 h-20 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition ${
                  isDark ? 'border-slate-700 hover:border-emerald-500 bg-[#000000]' : 'border-slate-300 hover:border-emerald-500 bg-white'
                }`}>
                  <Upload className={`w-6 h-6 mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Enviar Logo</span>
                  <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
                </label>
              )}
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Nome da Loja</label>
                <input
                  type="text"
                  value={nomeLoja}
                  onChange={(e) => setNomeLoja(e.target.value)}
                  placeholder="Nome do seu negócio"
                  className={`w-full py-2.5 px-3 rounded-xl text-sm font-semibold focus:outline-none transition ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Telefone/Celular (opcional)</label>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition ${
                  isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <div className="flex items-center gap-1 text-xs font-bold shrink-0">
                    <span>🇧🇷</span>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>+55</span>
                  </div>
                  <input
                    type="text"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(85) 98607-2144"
                    className={`flex-1 text-sm font-semibold bg-transparent focus:outline-none ${isDark ? 'text-white placeholder:text-slate-500' : 'text-black placeholder:text-slate-400'}`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Endereço (opcional)</label>
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-xl transition ${
                  isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <input
                    type="text"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Rua, número, bairro e cidade"
                    className={`flex-1 text-sm font-semibold bg-transparent focus:outline-none ${isDark ? 'text-white placeholder:text-slate-500' : 'text-black placeholder:text-slate-400'}`}
                  />
                  <ChevronRight className={`w-5 h-5 shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Complemento (opcional)</label>
                <input
                  type="text"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  placeholder="Complemento (opcional)"
                  className={`w-full py-2.5 px-3 rounded-xl text-sm font-semibold focus:outline-none transition ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Botão Salvar Fixo */}
          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Dados da loja salvos!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA003: IDENTIFICAÇÃO (CPF/CNPJ)                                     */}
      {/* ===================================================================== */}
      {subTela === 'identificacao' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Identificação</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>CPF ou CNPJ</label>
                <input
                  type="text"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className={`w-full py-2.5 px-3 rounded-xl text-sm font-semibold focus:outline-none transition ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Razão social</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Nome oficial da empresa"
                  className={`w-full py-2.5 px-3 rounded-xl text-sm font-semibold focus:outline-none transition ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>

            {/* Alerta de Privacidade da Identificação */}
            <div className={`p-4 rounded-2xl border space-y-2 ${
              isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
            }`}>
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>Estes dados não serão exibidos no catálogo.</span>
              </div>
              <p className={`text-[11px] leading-relaxed pl-7 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Informar o CPF ou CNPJ é uma medida para validar a sua conta, preservar sua privacidade e garantir a conformidade e qualidade de todos os catálogos do HUBI.
              </p>
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Identificação salva com sucesso!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA004: OPÇÕES DE EXIBIÇÃO (MENU)                                    */}
      {/* ===================================================================== */}
      {subTela === 'opcoes-exibicao' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Opções de exibição</h1>
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>

            <button
              type="button"
              onClick={() => setSubTela('modo-exibicao')}
              className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
              }`}
            >
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Modo de exibição principal</span>
              <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            </button>

            <button
              type="button"
              onClick={() => setSubTela('produtos-sem-estoque')}
              className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
              }`}
            >
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Produtos sem estoque</span>
              <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            </button>

            <button
              type="button"
              onClick={() => setSubTela('banner')}
              className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
              }`}
            >
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Banner</span>
              <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            </button>

            <div className={`w-full p-4 flex items-center justify-between ${isDark ? 'bg-[#000000]/40' : 'bg-white'}`}>
              <div>
                <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Exibir produtos sem foto</span>
                <span className={`text-xs block mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {exibirProdutosSemFoto ? 'Exibindo produtos sem imagem' : 'Apenas produtos com foto (Padrão)'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={exibirProdutosSemFoto}
                  onChange={async (e) => {
                    const novoVal = e.target.checked;
                    setExibirProdutosSemFoto(novoVal);
                    if (!loja?.id) return;
                    try {
                      const extras = loja.configuracoes_extras || {};
                      await supabase
                        .from('lojas')
                        .update({
                          configuracoes_extras: {
                            ...extras,
                            catalogo: {
                              ...(extras.catalogo || {}),
                              exibir_produtos_sem_foto: novoVal
                            }
                          }
                        })
                        .eq('id', loja.id);
                      recarregarDadosLoja?.();
                      mostrarToast('Preferência de fotos salva!', 'sucesso');
                    } catch {
                      mostrarToast('Erro ao salvar preferência.', 'erro');
                    }
                  }}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                  exibirProdutosSemFoto ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                }`}></div>
              </label>
            </div>
          </div>
        </div>
      )}



      {/* ===================================================================== */}
      {/* TELA008: MODO DE EXIBIÇÃO PRINCIPAL                                  */}
      {/* ===================================================================== */}
      {subTela === 'modo-exibicao' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('opcoes-exibicao')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Modo de exibição principal</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Ilustração Central */}
            <div className={`w-36 h-36 mx-auto rounded-full flex items-center justify-center p-4 border ${
              isDark ? 'bg-[#000000] border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}>
              <div className={`w-24 h-28 rounded-xl shadow-md border p-2 space-y-1.5 flex flex-col justify-center ${
                isDark ? 'bg-[#08131A] border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="h-2 w-8 rounded bg-emerald-500" />
                <div className={`h-1.5 w-full rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`h-1.5 w-3/4 rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className={`h-2 w-6 rounded pt-1 ${isDark ? 'bg-slate-700' : 'bg-slate-400'}`} />
              </div>
            </div>

            {/* Opções de Radio */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setModoExibicao('lista')}
                className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left transition cursor-pointer ${
                  modoExibicao === 'lista'
                    ? (isDark ? 'bg-emerald-950/20 border-emerald-500 text-white shadow-xs' : 'bg-emerald-50/70 border-2 border-emerald-500 text-black shadow-xs')
                    : (isDark ? 'bg-[#000000] border-slate-700 text-white hover:border-slate-600' : 'bg-white border-2 border-slate-300 text-black hover:border-slate-400')
                }`}
              >
                <div className="pr-3">
                  <h3 className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>Modo Lista</h3>
                  <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Navegação mais rápida, ideal para grandes quantidades de produtos.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  modoExibicao === 'lista' ? 'border-emerald-500 bg-emerald-500 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                }`}>
                  {modoExibicao === 'lista' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModoExibicao('grade')}
                className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left transition cursor-pointer ${
                  modoExibicao === 'grade'
                    ? (isDark ? 'bg-emerald-950/20 border-emerald-500 text-white shadow-xs' : 'bg-emerald-50/70 border-2 border-emerald-500 text-black shadow-xs')
                    : (isDark ? 'bg-[#000000] border-slate-700 text-white hover:border-slate-600' : 'bg-white border-2 border-slate-300 text-black hover:border-slate-400')
                }`}
              >
                <div className="pr-3">
                  <h3 className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>Modo Grade</h3>
                  <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Ideal para ver vários produtos com fotos ao mesmo tempo.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  modoExibicao === 'grade' ? 'border-emerald-500 bg-emerald-500 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                }`}>
                  {modoExibicao === 'grade' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModoExibicao('instaview')}
                className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left transition cursor-pointer ${
                  modoExibicao === 'instaview'
                    ? (isDark ? 'bg-emerald-950/20 border-emerald-500 text-white shadow-xs' : 'bg-emerald-50/70 border-2 border-emerald-500 text-black shadow-xs')
                    : (isDark ? 'bg-[#000000] border-slate-700 text-white hover:border-slate-600' : 'bg-white border-2 border-slate-300 text-black hover:border-slate-400')
                }`}
              >
                <div className="pr-3">
                  <h3 className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>Modo Instaview</h3>
                  <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Melhor para ver o produto, ideal para fotos bem produzidas no estilo rede social.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  modoExibicao === 'instaview' ? 'border-emerald-500 bg-emerald-500 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                }`}>
                  {modoExibicao === 'instaview' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Modo de exibição salvo!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA009: PRODUTOS SEM ESTOQUE                                         */}
      {/* ===================================================================== */}
      {subTela === 'produtos-sem-estoque' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('opcoes-exibicao')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Produtos sem estoque</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <button
              type="button"
              onClick={() => setProdutosSemEstoque('ocultar')}
              className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left transition cursor-pointer ${
                produtosSemEstoque === 'ocultar'
                  ? (isDark ? 'bg-emerald-950/20 border-emerald-500 text-white shadow-xs' : 'bg-emerald-50/70 border-2 border-emerald-500 text-black shadow-xs')
                  : (isDark ? 'bg-[#000000] border-slate-700 text-white hover:border-slate-600' : 'bg-white border-2 border-slate-300 text-black hover:border-slate-400')
              }`}
            >
              <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>Não exibir no catálogo</span>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                produtosSemEstoque === 'ocultar' ? 'border-emerald-500 bg-emerald-500 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
              }`}>
                {produtosSemEstoque === 'ocultar' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setProdutosSemEstoque('indisponivel')}
              className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left transition cursor-pointer ${
                produtosSemEstoque === 'indisponivel'
                  ? (isDark ? 'bg-emerald-950/20 border-emerald-500 text-white shadow-xs' : 'bg-emerald-50/70 border-2 border-emerald-500 text-black shadow-xs')
                  : (isDark ? 'bg-[#000000] border-slate-700 text-white hover:border-slate-600' : 'bg-white border-2 border-slate-300 text-black hover:border-slate-400')
              }`}
            >
              <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>Exibir como indisponível</span>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                produtosSemEstoque === 'indisponivel' ? 'border-emerald-500 bg-emerald-500 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
              }`}>
                {produtosSemEstoque === 'indisponivel' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setProdutosSemEstoque('exibir')}
              className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left transition cursor-pointer ${
                produtosSemEstoque === 'exibir'
                  ? (isDark ? 'bg-emerald-950/20 border-emerald-500 text-white shadow-xs' : 'bg-emerald-50/70 border-2 border-emerald-500 text-black shadow-xs')
                  : (isDark ? 'bg-[#000000] border-slate-700 text-white hover:border-slate-600' : 'bg-white border-2 border-slate-300 text-black hover:border-slate-400')
              }`}
            >
              <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>Exibir normalmente</span>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                produtosSemEstoque === 'exibir' ? 'border-emerald-500 bg-emerald-500 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
              }`}>
                {produtosSemEstoque === 'exibir' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Regra de estoque salva!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA010: BANNER                                                       */}
      {/* ===================================================================== */}
      {subTela === 'banner' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('opcoes-exibicao')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Banner</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Ilustração Circular no Topo */}
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-32 h-32 rounded-full flex items-center justify-center shadow-inner overflow-hidden border ${
                isDark ? 'bg-[#000000] border-slate-700' : 'bg-emerald-50 border-emerald-200'
              }`}>
                {bannerUrl ? (
                  <img src={bannerUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                ) : (
                  <Smartphone className="w-14 h-14 text-emerald-500" />
                )}
              </div>
              <h2 className={`text-sm font-black pt-2 ${isDark ? 'text-white' : 'text-black'}`}>Deixe o seu catálogo com a cara da sua marca</h2>
              <p className={`text-xs max-w-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                O banner ajuda a dar mais identidade e possibilidades de comunicação com seus clientes.
              </p>
            </div>

            {/* Recomendações Técnicas */}
            <div className="space-y-3">
              <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'}`}>
                <span className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-black'}`}>Orientação da imagem:</span>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Para que o banner tenha uma exibição otimizada, utilize imagens em formato <strong>Paisagem (horizontal)</strong>.
                </p>
              </div>

              <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'}`}>
                <span className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-black'}`}>Tamanho máximo:</span>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Recomendamos que você utilize imagens de até <strong>1136px de largura por 284px de altura</strong>.
                </p>
              </div>

              <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'}`}>
                <span className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-black'}`}>Formatos:</span>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Os formatos suportados são <strong>JPG</strong> ou <strong>PNG</strong>.
                </p>
              </div>
            </div>

            {/* Preview e Remoção se já existir */}
            {bannerUrl && (
              <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
              }`}>
                <div className="flex items-center gap-3">
                  <img src={bannerUrl} alt="Banner" className={`w-16 h-8 rounded-lg object-cover border ${
                    isDark ? 'border-slate-700' : 'border-slate-300'
                  }`} />
                  <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>Banner ativo</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBannerUrl('');
                    setExibirBanner(false);
                  }}
                  className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-xl cursor-pointer transition"
                  title="Remover Banner"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className={rodapeFixoClass}>
            <div className="space-y-2">
              <label className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-black shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 border border-emerald-500 cursor-pointer transition">
                <Upload className="w-4 h-4" />
                <span>{uploadingBanner ? 'Enviando banner...' : 'Fazer upload do banner'}</span>
                <input type="file" accept="image/*" onChange={handleUploadBanner} className="hidden" />
              </label>

              <button
                type="button"
                disabled={salvando}
                onClick={() => salvarDadosGerais('Banner salvo com sucesso!', true)}
                className={btnSecundarioClass}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA005: PEDIDOS (MENU)                                               */}
      {/* ===================================================================== */}
      {subTela === 'pedidos' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Pedidos</h1>
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
            {/* Switch: Aceitar pedidos online */}
            <div className={`p-4 flex items-center justify-between ${isDark ? 'bg-[#000000]/40' : 'bg-white'}`}>
              <div className="pr-3">
                <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>Aceitar pedidos online</span>
                <p className={`text-xs mt-0.5 leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Seus pedidos virão como <strong>Pendente</strong> até que você os aceite como <strong>Confirmado</strong>.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={aceitarPedidosOnline}
                  onChange={(e) => setAceitarPedidosOnline(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                  aceitarPedidosOnline ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                }`}></div>
              </label>
            </div>

            {/* Switch: Resumo via WhatsApp */}
            <div className={`p-4 flex items-center justify-between ${isDark ? 'bg-[#000000]/40' : 'bg-white'}`}>
              <div className="pr-3">
                <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>Resumo via WhatsApp</span>
                <p className={`text-xs mt-0.5 leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Além de ter seu pedido criado no HUBI, seus clientes serão direcionados para enviar o resumo do pedido para seu WhatsApp cadastrado.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={resumoWhatsapp}
                  onChange={(e) => setResumoWhatsapp(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                  resumoWhatsapp ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                }`}></div>
              </label>
            </div>

            {/* Switch: Exigir pesagem prévia para itens vendidos por quilo */}
            <div className={`p-4 flex items-center justify-between border-t ${isDark ? 'bg-[#000000]/40 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="pr-3">
                <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>Exigir pesagem prévia para itens vendidos por quilo</span>
                <p className={`text-xs mt-0.5 leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Quando ativado, pedidos no catálogo com produtos vendidos por quilo (kg) terão o pagamento bloqueado inicialmente e só serão liberados após o lojista informar o peso real aferido na balança. Quando desativado, o pagamento é liberado imediatamente com o valor estimado.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={exigirPesagemPreviaPagamento}
                  onChange={(e) => setExigirPesagemPreviaPagamento(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                  exigirPesagemPreviaPagamento ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                }`}></div>
              </label>
            </div>

            {/* Subitens Pedidos */}
            <button
              type="button"
              onClick={() => setSubTela('orientacoes')}
              className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
              }`}
            >
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Orientações pós-pedido</span>
              <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            </button>

            <button
              type="button"
              onClick={() => setSubTela('entrega')}
              className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
              }`}
            >
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Entrega</span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-black uppercase ${
                  trabalhoComEntregas ? 'text-emerald-500' : (isDark ? 'text-slate-600' : 'text-slate-400')
                }`}>
                  {trabalhoComEntregas ? 'LIGADO' : 'DESLIGADO'}
                </span>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSubTela('retirada')}
              className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
              }`}
            >
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Retirada</span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-black uppercase ${
                  trabalhoComRetirada ? 'text-emerald-500' : (isDark ? 'text-slate-600' : 'text-slate-400')
                }`}>
                  {trabalhoComRetirada ? 'LIGADO' : 'DESLIGADO'}
                </span>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSubTela('taxa')}
              className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
              }`}
            >
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Taxa</span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-black uppercase ${
                  usarTaxaCatalogo ? 'text-emerald-500' : (isDark ? 'text-slate-600' : 'text-slate-400')
                }`}>
                  {usarTaxaCatalogo ? 'LIGADO' : 'DESLIGADO'}
                </span>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSubTela('meios-pagamento')}
              className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                isDark ? 'hover:bg-slate-900/60 active:bg-slate-800' : 'hover:bg-slate-200/60 active:bg-slate-300'
              }`}
            >
              <div>
                <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Meios de pagamento</span>
                <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Configure pagamentos online ou presenciais.</span>
              </div>
              <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            </button>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Configurações de pedidos salvas!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA011: ORIENTAÇÕES PÓS-PEDIDO                                       */}
      {/* ===================================================================== */}
      {subTela === 'orientacoes' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('pedidos')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Orientações pós-pedido</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <p className={`text-xs font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Personalize a <strong>mensagem que seus clientes verão após concluírem o pedido</strong>. Agradeça pela compra, informe sobre prazos de entrega e retirada, formas de pagamento ou qualquer outra informação relevante.
            </p>

            {/* Ilustração Central */}
            <div className={`w-32 h-32 mx-auto rounded-full flex flex-col items-center justify-center p-3 text-center shadow-inner border ${
              isDark ? 'bg-[#000000] border-slate-700' : 'bg-emerald-50 border-emerald-200'
            }`}>
              <ShoppingCart className="w-8 h-8 text-emerald-500 mb-1" />
              <span className={`text-[10px] font-black uppercase ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>Pedido enviado!</span>
            </div>

            {/* Textarea com Contador de Caracteres */}
            <div className="space-y-1">
              <textarea
                rows={5}
                maxLength={200}
                value={orientacoesPosPedido}
                onChange={(e) => setOrientacoesPosPedido(e.target.value)}
                placeholder="Escreva as instruções para seu cliente..."
                className={`w-full p-3.5 rounded-2xl border text-xs sm:text-sm font-medium focus:outline-none resize-none leading-relaxed transition ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                }`}
              />
              <div className="text-right">
                <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {orientacoesPosPedido.length}/200
                </span>
              </div>
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Orientações salvas!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA012: ENTREGA                                                      */}
      {/* ===================================================================== */}
      {subTela === 'entrega' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('pedidos')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Entrega</h1>
            </div>
            <button
              type="button"
              onClick={() => alert('Informe como suas entregas são feitas e adicione taxas por região ou fixas.')}
              className={`p-2 rounded-xl transition cursor-pointer ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black'}`}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Descrição */}
            <div className="space-y-1.5">
              <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Descrição</label>
              <input
                type="text"
                value={descricaoEntregas}
                onChange={(e) => setDescricaoEntregas(e.target.value)}
                placeholder="Descreva resumidamente suas opções de entrega..."
                className={`w-full py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-semibold focus:outline-none transition ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                }`}
              />
              <span className={`text-[11px] block pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Descreva resumidamente suas opções de entrega.
              </span>
            </div>

            {/* Lista de Opções de Entrega Cadastradas */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Opções Cadastradas</span>
                <button
                  type="button"
                  onClick={() => setModalOpcaoEntregaAberto(true)}
                  className="text-xs font-black text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar opção de entrega</span>
                </button>
              </div>

              {opcoesEntrega.length === 0 ? (
                <div className={`p-4 rounded-2xl border text-center text-xs ${
                  isDark ? 'bg-[#000000] border-slate-700 text-slate-400' : 'bg-slate-50 border-2 border-slate-200 text-slate-500'
                }`}>
                  Nenhuma taxa específica adicionada. Você pode cadastrar frete fixo, motoboy ou correios.
                </div>
              ) : (
                <div className="space-y-2">
                  {opcoesEntrega.map((op) => (
                    <div key={op.id} className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                    }`}>
                      <div>
                        <span className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-black'}`}>{op.nome}</span>
                        <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {(op.valor_taxa || 0) > 0 ? `R$ ${(op.valor_taxa || 0).toFixed(2)}` : 'Grátis'} {op.tempo_estimado ? `• ${op.tempo_estimado}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removerOpcaoEntrega(op.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Opções de entrega salvas!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA013: RETIRADA                                                     */}
      {/* ===================================================================== */}
      {subTela === 'retirada' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('pedidos')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Retirada</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="pr-3">
                <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>Trabalho com retirada no local</span>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Seu endereço será informado durante o fechamento do pedido:
                </p>
                {endereco && (
                  <span className={`text-xs font-bold block mt-1.5 p-2.5 rounded-xl border ${
                    isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-black'
                  }`}>
                    📍 {endereco}
                  </span>
                )}
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={trabalhoComRetirada}
                  onChange={(e) => setTrabalhoComRetirada(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                  trabalhoComRetirada ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                }`}></div>
              </label>
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Opção de retirada salva!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA014: TAXA DO CATÁLOGO                                             */}
      {/* ===================================================================== */}
      {subTela === 'taxa' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('pedidos')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Taxa</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Switch Principal */}
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>Aplicar a taxa do catálogo online</span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={usarTaxaCatalogo}
                  onChange={(e) => setUsarTaxaCatalogo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                  usarTaxaCatalogo ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                }`}></div>
              </label>
            </div>

            {/* Campos de Taxa */}
            {usarTaxaCatalogo && (
              <div className="space-y-4 pt-1 animate-in fade-in">
                <div className="space-y-1.5">
                  <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Nome da taxa</label>
                  <input
                    type="text"
                    value={nomeTaxaCatalogo}
                    onChange={(e) => setNomeTaxaCatalogo(e.target.value)}
                    placeholder="Ex: Taxa de Serviço / Embalagem"
                    className={`w-full py-2.5 px-3 rounded-xl border text-sm font-semibold focus:outline-none transition ${
                      isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Valor da taxa</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={valorTaxaCatalogo}
                      onChange={(e) => setValorTaxaCatalogo(e.target.value)}
                      placeholder="10"
                      className={`flex-1 py-2.5 px-3 rounded-xl border text-sm font-semibold focus:outline-none transition ${
                        isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                      }`}
                    />
                    <div className={`flex rounded-xl p-1 gap-1 border ${
                      isDark ? 'bg-[#000000] border-slate-700' : 'bg-slate-200 border-slate-300'
                    }`}>
                      <button
                        type="button"
                        onClick={() => setTipoTaxaCatalogo('percentual')}
                        className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                          tipoTaxaCatalogo === 'percentual' ? 'bg-emerald-600 text-white shadow-xs' : (isDark ? 'text-slate-400' : 'text-slate-600')
                        }`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoTaxaCatalogo('fixo')}
                        className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                          tipoTaxaCatalogo === 'fixo' ? 'bg-emerald-600 text-white shadow-xs' : (isDark ? 'text-slate-400' : 'text-slate-600')
                        }`}
                      >
                        R$
                      </button>
                    </div>
                  </div>
                </div>

                {/* Opções de Aplicação da Taxa */}
                <div className={`space-y-3 pt-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => setTaxaSomenteEntrega(!taxaSomenteEntrega)}
                    className="w-full flex items-center justify-between text-left py-2 cursor-pointer"
                  >
                    <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Somente na entrega</span>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                      taxaSomenteEntrega ? 'bg-emerald-600 border-emerald-600 text-white' : (isDark ? 'border-slate-600' : 'border-slate-300')
                    }`}>
                      {taxaSomenteEntrega && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>

                  <div className={`space-y-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <span className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Comportamento da Taxa</span>
                    <button
                      type="button"
                      onClick={() => setAplicarTaxaCatalogo('adicionar')}
                      className={`w-full p-3 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                        aplicarTaxaCatalogo === 'adicionar'
                          ? (isDark ? 'border-emerald-500 bg-emerald-950/20 text-white' : 'border-2 border-emerald-500 bg-emerald-50/70 text-black')
                          : (isDark ? 'border-slate-700 bg-[#000000] text-slate-300' : 'border-2 border-slate-300 bg-white text-black')
                      }`}
                    >
                      <span>Adicionar ao valor da venda</span>
                      {aplicarTaxaCatalogo === 'adicionar' && <Check className="w-4 h-4 text-emerald-500" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setAplicarTaxaCatalogo('incluida')}
                      className={`w-full p-3 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                        aplicarTaxaCatalogo === 'incluida'
                          ? (isDark ? 'border-emerald-500 bg-emerald-950/20 text-white' : 'border-2 border-emerald-500 bg-emerald-50/70 text-black')
                          : (isDark ? 'border-slate-700 bg-[#000000] text-slate-300' : 'border-2 border-slate-300 bg-white text-black')
                      }`}
                    >
                      <span>Já está incluída no preço da venda</span>
                      {aplicarTaxaCatalogo === 'incluida' && <Check className="w-4 h-4 text-emerald-500" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Taxa do catálogo salva!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA015: MEIOS DE PAGAMENTO                                           */}
      {/* ===================================================================== */}
      {subTela === 'meios-pagamento' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('pedidos')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Meios de pagamento</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Seção 1: INTEGRAÇÕES */}
            <div className="space-y-3">
              <div>
                <h3 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>INTEGRAÇÕES</h3>
                <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Receba pagamentos diretamente em sua conta</p>
              </div>

              <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center text-white font-bold shadow-sm">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Pagamentos automáticos</span>
                    <span className="text-xs font-black text-sky-500">Mercado Pago</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={pagamentoMercadoPagoAtivo}
                    onChange={(e) => setPagamentoMercadoPagoAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                    pagamentoMercadoPagoAtivo ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                  }`}></div>
                </label>
              </div>
            </div>

            {/* Seção 2: OPÇÕES DE PAGAMENTO */}
            <div className="space-y-3 pt-2">
              <div>
                <h3 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>OPÇÕES DE PAGAMENTO</h3>
                <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Ative as opções que você quer mostrar para seus clientes no catálogo
                </p>
              </div>

              <div className={`divide-y border rounded-2xl overflow-hidden ${
                isDark ? 'divide-slate-800 border-slate-700 bg-[#000000] text-white' : 'divide-slate-200 border-2 border-slate-300 bg-white text-black'
              }`}>
                {/* Pix */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Pix</span>
                      <span className="text-[11px] text-emerald-500 font-bold">Chave cadastrada na loja</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={pixAtivo}
                      onChange={(e) => setPixAtivo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      pixAtivo ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                    }`}></div>
                  </label>
                </div>

                {/* Dinheiro */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Dinheiro</span>
                      <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Pagamento presencial</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={dinheiroAtivo}
                      onChange={(e) => setDinheiroAtivo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      dinheiroAtivo ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                    }`}></div>
                  </label>
                </div>

                {/* Cartão de Débito */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Cartão de Débito</span>
                      <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Maquininha na entrega/retirada</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={debitoAtivo}
                      onChange={(e) => setDebitoAtivo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      debitoAtivo ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                    }`}></div>
                  </label>
                </div>

                {/* Cartão de Crédito */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Cartão de Crédito</span>
                      <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Maquininha ou Link de pagamento</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={creditoAtivo}
                      onChange={(e) => setCreditoAtivo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      creditoAtivo ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                    }`}></div>
                  </label>
                </div>

                {/* Outros */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                      isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Outros</span>
                      <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vale, transferência, etc.</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={outrosAtivo}
                      onChange={(e) => setOutrosAtivo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-12 h-6 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      outrosAtivo ? 'bg-emerald-600' : (isDark ? 'bg-slate-800' : 'bg-slate-300')
                    }`}></div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Meios de pagamento salvos!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA006 / TELA016: REDES SOCIAIS & OUTROS                             */}
      {/* ===================================================================== */}
      {subTela === 'redes-sociais' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('hub')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Redes sociais & Outros</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>WhatsApp</label>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                  isDark ? 'bg-[#000000] border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}>
                  <div className="flex items-center gap-1 text-xs font-bold shrink-0">
                    <span>🇧🇷</span>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>+55</span>
                  </div>
                  <input
                    type="text"
                    value={whatsappLoja}
                    onChange={(e) => setWhatsappLoja(e.target.value)}
                    placeholder="(85) 98607-2144"
                    className={`flex-1 text-sm font-semibold bg-transparent focus:outline-none ${isDark ? 'text-white placeholder:text-slate-500' : 'text-black placeholder:text-slate-400'}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => copiarParaTransferencia(whatsappLoja, 'WhatsApp')}
                  className="text-xs font-black text-emerald-500 hover:text-emerald-400 hover:underline pt-1 block cursor-pointer"
                >
                  Copiar o número de telefone
                </button>
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Instagram (Opcional)</label>
                <input
                  type="text"
                  value={instagramLoja}
                  onChange={(e) => setInstagramLoja(e.target.value)}
                  placeholder="@sualojaoficial"
                  className={`w-full py-2.5 px-3 rounded-xl border text-sm font-semibold focus:outline-none transition ${
                    isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>E-mail (Opcional)</label>
                <input
                  type="email"
                  value={emailLoja}
                  onChange={(e) => setEmailLoja(e.target.value)}
                  placeholder="contato@sualoja.com"
                  className={`w-full py-2.5 px-3 rounded-xl border text-sm font-semibold focus:outline-none transition ${
                    isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Informações extras (Opcional)</label>
                  <HelpCircle className={`w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </div>
                <input
                  type="text"
                  value={informacoesExtras}
                  onChange={(e) => setInformacoesExtras(e.target.value)}
                  placeholder="Ex: Valor mínimo para compras é de R$ 50,00"
                  className={`w-full py-2.5 px-3 rounded-xl border text-sm font-semibold focus:outline-none transition ${
                    isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                  }`}
                />
                <span className={`text-[11px] block pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Neste campo você pode adicionar o endereço do seu negócio, horário de funcionamento e o que mais você precisar.
                </span>
              </div>
            </div>

            {/* Link para Integrar com Parceiros (TELA017) */}
            <div className={`pt-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setSubTela('parceiros')}
                className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left transition cursor-pointer ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-900/60' : 'bg-white border-2 border-slate-300 text-black hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-xs">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Integrar com parceiros</span>
                    <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Instagram, Facebook, Google Shopping e mais...</span>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Redes sociais e informações salvas!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA017: INTEGRAR COM PARCEIROS (HUB DE CANAIS)                       */}
      {/* ===================================================================== */}
      {subTela === 'parceiros' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('redes-sociais')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Integrar com parceiros</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Bloco 1: Facebook / Instagram */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Facebook / Instagram</span>
              </div>

              <div className={`divide-y border rounded-2xl overflow-hidden ${
                isDark ? 'divide-slate-800 border-slate-700 bg-[#000000] text-white' : 'divide-slate-200 border-2 border-slate-300 bg-white text-black'
              }`}>
                <button
                  type="button"
                  onClick={() => setSubTela('facebook-shopping')}
                  className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Shopping</span>
                    <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Conecte seu catálogo de produtos às lojas do Facebook e Instagram</span>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setSubTela('pedidos-comida')}
                  className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Pedidos de comida</span>
                    <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Receba pedidos no seu cardápio digital pelo Facebook e Instagram</span>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setSubTela('facebook-pixel')}
                  className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Facebook Pixel</span>
                    <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Saiba o impacto dos seus anúncios</span>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </button>
              </div>
            </div>

            {/* Bloco 2: Google */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Google</span>
              </div>

              <div className={`border rounded-2xl overflow-hidden ${
                isDark ? 'border-slate-700 bg-[#000000] text-white' : 'border-2 border-slate-300 bg-white text-black'
              }`}>
                <button
                  type="button"
                  onClick={() => setSubTela('google-shopping')}
                  className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Shopping</span>
                    <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Alcance clientes no Google Merchant</span>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </button>
              </div>
            </div>

            {/* Bloco 3: TikTok */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>TikTok</span>
              </div>

              <div className={`border rounded-2xl overflow-hidden ${
                isDark ? 'border-slate-700 bg-[#000000] text-white' : 'border-2 border-slate-300 bg-white text-black'
              }`}>
                <button
                  type="button"
                  onClick={() => setSubTela('tiktok-business')}
                  className={`w-full p-4 flex items-center justify-between text-left transition cursor-pointer ${
                    isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Business</span>
                    <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Divulgue seus produtos para o público do TikTok</span>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA018: FACEBOOK / INSTAGRAM SHOPPING                                */}
      {/* ===================================================================== */}
      {subTela === 'facebook-shopping' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('parceiros')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Facebook/Instagram Shopping</h1>
            </div>
            <HelpCircle className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col items-center justify-center text-center space-y-6">
            <div className={`w-36 h-36 rounded-full border flex items-center justify-center p-3 shadow-sm ${
              isDark ? 'bg-[#000000] border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}>
              <Globe className="w-16 h-16 text-emerald-500" />
            </div>

            <p className={`text-sm font-semibold max-w-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Copie o link de integração abaixo e insira no campo solicitado do <strong>Facebook Commerce Manager</strong>.
            </p>

            <div className={`p-3 rounded-2xl border w-full max-w-xs break-all font-mono text-xs ${
              isDark ? 'bg-[#000000] border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-300 text-black'
            }`}>
              {feedInstagramUrl}
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <div className="space-y-2">
              <a
                href="https://www.facebook.com/commerce_manager"
                target="_blank"
                rel="noopener noreferrer"
                className={btnSecundarioClass}
              >
                <span>Acessar tutorial completo</span>
              </a>

              <button
                type="button"
                onClick={() => copiarParaTransferencia(feedInstagramUrl, 'Link de integração do Facebook')}
                className={btnSalvarFixoClass}
              >
                <Copy className="w-4 h-4" />
                <span>Copiar link de integração</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA019: PEDIDOS DE COMIDA (CARDÁPIO DIGITAL)                         */}
      {/* ===================================================================== */}
      {subTela === 'pedidos-comida' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('parceiros')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Pedidos de comida</h1>
            </div>
            <HelpCircle className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col items-center justify-center text-center space-y-6">
            <h2 className={`text-base font-black leading-snug ${isDark ? 'text-white' : 'text-black'}`}>
              Você pode aceitar pedidos de comida via Facebook e Instagram
            </h2>

            <div className={`w-48 h-32 rounded-3xl p-4 text-white flex flex-col justify-between shadow-xl ${
              isDark ? 'bg-[#000000] border border-slate-700' : 'bg-slate-900'
            }`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center font-bold">
                  🍽️
                </div>
                <div className="text-left">
                  <span className="text-[11px] font-bold block">{nomeLoja || 'Seu Restaurante'}</span>
                  <span className="text-[9px] text-slate-400">Cardápio Digital</span>
                </div>
              </div>
              <button type="button" className="w-full py-1 rounded-lg bg-white text-slate-900 text-[10px] font-black cursor-pointer">
                Pedir refeição
              </button>
            </div>

            <p className={`text-xs font-semibold max-w-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Conecte seu cardápio digital diretamente aos botões de ação do seu perfil e stories!
            </p>
          </div>

          <div className={rodapeFixoClass}>
            <a
              href="https://business.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>Acessar sua conta Facebook</span>
            </a>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA020: FACEBOOK PIXEL                                               */}
      {/* ===================================================================== */}
      {subTela === 'facebook-pixel' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('parceiros')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Facebook Pixel</h1>
            </div>
            <HelpCircle className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="space-y-1.5">
              <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Facebook Pixel ID</label>
              <input
                type="text"
                value={facebookPixelId}
                onChange={(e) => setFacebookPixelId(e.target.value)}
                placeholder="Insira seu Facebook Pixel ID"
                className={`w-full py-2.5 px-3 rounded-xl border text-sm font-semibold focus:outline-none transition ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                }`}
              />
              <span className={`text-[11px] block pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Mínimo de 15 caracteres
              </span>
            </div>

            <a
              href="https://business.facebook.com/events_manager"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-black text-emerald-500 hover:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir Gerenciador do Facebook</span>
            </a>

            <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#000000] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-xs leading-relaxed font-medium text-center ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Insira seu <strong>Facebook Pixel ID</strong> para rastrear visualizações de página, produtos adicionados ao carrinho e compras concluídas no seu catálogo.
              </p>
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('Pixel do Facebook integrado!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Integrar com Facebook Pixel'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA021: GOOGLE SHOPPING (MERCHANT CENTER)                            */}
      {/* ===================================================================== */}
      {subTela === 'google-shopping' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('parceiros')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Google Shopping</h1>
            </div>
            <HelpCircle className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col items-center justify-center text-center space-y-6">
            <div className={`w-36 h-36 rounded-full border flex items-center justify-center p-3 shadow-sm ${
              isDark ? 'bg-[#000000] border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}>
              <Store className="w-16 h-16 text-emerald-500" />
            </div>

            <p className={`text-sm font-semibold max-w-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Copie o link de integração abaixo e insira no campo solicitado do <strong>Google Merchant Center</strong>.
            </p>

            <div className={`p-3 rounded-2xl border w-full max-w-xs break-all font-mono text-xs ${
              isDark ? 'bg-[#000000] border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-300 text-black'
            }`}>
              {feedGoogleUrl}
            </div>
          </div>

          <div className={rodapeFixoClass}>
            <div className="space-y-2">
              <a
                href="https://merchants.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className={btnSecundarioClass}
              >
                <span>Acessar tutorial completo</span>
              </a>

              <button
                type="button"
                onClick={() => copiarParaTransferencia(feedGoogleUrl, 'Link do Google Shopping')}
                className={btnSalvarFixoClass}
              >
                <Copy className="w-4 h-4" />
                <span>Copiar link de integração</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TELA022: TIKTOK BUSINESS                                              */}
      {/* ===================================================================== */}
      {subTela === 'tiktok-business' && (
        <div className={telaContainerClass}>
          <div className={headerSubtelaClass}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTela('parceiros')}
                className={headerBtnVoltarClass}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>TikTok Business</h1>
            </div>
            <HelpCircle className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col items-center justify-center text-center space-y-6">
            <h2 className={`text-sm font-black leading-snug ${isDark ? 'text-white' : 'text-black'}`}>
              Divulgue seus produtos em uma das redes sociais que mais cresceram nos últimos anos. 🚀
            </h2>

            <div className={`w-36 h-36 rounded-full flex items-center justify-center text-white shadow-xl ${
              isDark ? 'bg-[#000000] border border-slate-700' : 'bg-slate-900'
            }`}>
              <span className="text-3xl font-black">🎵 TikTok</span>
            </div>

            <div className="space-y-1.5 w-full max-w-xs">
              <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>TikTok Pixel ID</label>
              <input
                type="text"
                value={tiktokPixelId}
                onChange={(e) => setTiktokPixelId(e.target.value)}
                placeholder="Ex: C8XXXXXXXXXXXXX"
                className={`w-full py-2.5 px-3 rounded-xl border text-sm font-semibold focus:outline-none transition text-center ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                }`}
              />
            </div>

            <p className={`text-xs font-semibold max-w-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Conecte seu Catálogo Online diretamente à ferramenta de negócios do TikTok!
            </p>
          </div>

          <div className={rodapeFixoClass}>
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvarDadosGerais('TikTok Business integrado!', true)}
              className={btnSalvarFixoClass}
            >
              {salvando ? 'Salvando...' : 'Integrar com TikTok Business'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL EDITAR SLUG DO CATÁLOGO                                         */}
      {/* ===================================================================== */}
      {modalEditarSlug && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className={`w-full max-w-sm p-5 space-y-4 rounded-3xl shadow-2xl animate-in zoom-in-95 ${
            isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>Editar Link do Catálogo</h3>
              <button
                type="button"
                onClick={() => setModalEditarSlug(false)}
                className={`p-1 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-black hover:bg-slate-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>Novo Link Personalizado</label>
              <div className={`flex items-center gap-1.5 p-2.5 rounded-xl border ${
                isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-slate-300'
              }`}>
                <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>/catalog/</span>
                <input
                  type="text"
                  value={novoSlug}
                  onChange={(e) => setNovoSlug(e.target.value)}
                  placeholder="minha-loja"
                  className={`flex-1 text-xs font-bold bg-transparent focus:outline-none font-mono ${
                    isDark ? 'text-white placeholder:text-slate-500' : 'text-black placeholder:text-slate-400'
                  }`}
                />
              </div>
              {erroSlug && <span className="text-[11px] text-rose-500 font-bold block">{erroSlug}</span>}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalEditarSlug(false)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={salvarSlugPersonalizado}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-500/20 border border-emerald-500 transition disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL COMPARTILHAR CATÁLOGO COM QR CODE                               */}
      {/* ===================================================================== */}
      {modalCompartilharAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className={`w-full max-w-sm p-6 space-y-5 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 ${
            isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-emerald-500" />
                <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Compartilhar Catálogo</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalCompartilharAberto(false)}
                className={`p-1 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-black hover:bg-slate-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* QR Code */}
            <div className={`flex flex-col items-center justify-center p-5 rounded-2xl border ${
              isDark ? 'bg-white border-slate-700' : 'bg-white border-slate-300'
            }`}>
              <QRCodeSVG value={catalogoUrl} size={160} />
              <span className="text-[11px] font-bold text-slate-800 mt-2">Aponte a câmera para acessar</span>
            </div>

            {/* Link com Botão Copiar */}
            <div className="space-y-1">
              <div className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-slate-300'
              }`}>
                <span className={`font-mono truncate pr-2 font-bold ${isDark ? 'text-white' : 'text-black'}`}>{catalogoUrl}</span>
                <button
                  type="button"
                  onClick={() => copiarParaTransferencia(catalogoUrl, 'Link do Catálogo')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] shrink-0 border border-emerald-500 transition"
                >
                  Copiar
                </button>
              </div>
            </div>

            {/* Botão Compartilhar WhatsApp */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Confira o nosso catálogo online de produtos: ${catalogoUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 border border-emerald-500 transition"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Enviar pelo WhatsApp</span>
            </a>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL ADICIONAR OPÇÃO DE ENTREGA (TELA012)                            */}
      {/* ===================================================================== */}
      {modalOpcaoEntregaAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className={`w-full max-w-sm p-5 space-y-4 rounded-3xl shadow-2xl animate-in zoom-in-95 ${
            isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>Nova Opção de Entrega</h3>
              <button
                type="button"
                onClick={() => setModalOpcaoEntregaAberto(false)}
                className={`p-1 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-black hover:bg-slate-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>Nome da Entrega</label>
                <input
                  type="text"
                  value={novaOpcaoEntrega.nome}
                  onChange={(e) => setNovaOpcaoEntrega({ ...novaOpcaoEntrega, nome: e.target.value })}
                  placeholder="Ex: Motoboy Centro / Correios PAC"
                  className={`w-full p-2.5 rounded-xl border text-xs font-semibold focus:outline-none transition ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>Taxa (R$)</label>
                  <input
                    type="text"
                    value={novaOpcaoEntrega.valor}
                    onChange={(e) => setNovaOpcaoEntrega({ ...novaOpcaoEntrega, valor: e.target.value })}
                    placeholder="15,00"
                    className={`w-full p-2.5 rounded-xl border text-xs font-semibold focus:outline-none transition ${
                      isDark ? 'bg-[#08131A] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>Prazo Estimado</label>
                  <input
                    type="text"
                    value={novaOpcaoEntrega.prazo}
                    onChange={(e) => setNovaOpcaoEntrega({ ...novaOpcaoEntrega, prazo: e.target.value })}
                    placeholder="Ex: 1 a 2 horas"
                    className={`w-full p-2.5 rounded-xl border text-xs font-semibold focus:outline-none transition ${
                      isDark ? 'bg-[#08131A] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpcaoEntregaAberto(false)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvando || !novaOpcaoEntrega.nome.trim()}
                onClick={adicionarOpcaoEntrega}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-500/20 border border-emerald-500 transition disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* DRAWER MENU LATERAL MOBILE (☰)                                       */}
      {/* DRAWER MENU UNIFICADO MOBILE */}
      <MobileMenuDrawer
        aberto={drawerMenuAberto}
        onFechar={() => setDrawerMenuAberto(false)}
      />
    </div>
  );
};
export default ConfiguracaoCatalogoMobile;
