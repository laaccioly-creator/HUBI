import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Globe,
  ExternalLink,
  Copy,
  Check,
  Palette,
  Store,
  Phone,
  MapPin,
  Instagram,
  ShoppingBag,
  MessageCircle,
  Smartphone,
  LayoutGrid,
  List,
  Eye,
  Image as ImageIcon,
  Upload,
  AlertCircle,
  ChevronRight,
  CreditCard,
  Truck,
  Share2,
  Percent,
  Edit2,
  X,
  HelpCircle,
  CheckCircle2,
  Save,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Loja, ModoExibicaoCatalogo, ComportamentoSemEstoque } from '../types';
import { ConfiguracaoCatalogoMobile } from './ConfiguracaoCatalogoMobile';
import { useTheme } from '../contexts/ThemeContext';

const CORES_PALETA = [
  { hex: '#F59E0B', nome: 'Amarelo Ouro' },
  { hex: '#F97316', nome: 'Laranja Vibrante' },
  { hex: '#EF4444', nome: 'Coral / Vermelho' },
  { hex: '#EC4899', nome: 'Rosa / Magenta' },
  { hex: '#38BDF8', nome: 'Azul Celeste' },
  { hex: '#1E3A8A', nome: 'Azul Marinho' },
  { hex: '#334155', nome: 'Grafite Slate' },
  { hex: '#0F172A', nome: 'Preto / Carvão' },
  { hex: '#10B981', nome: 'Verde Esmeralda' }
];

export const ConfiguracaoCatalogo: React.FC = () => {
  const { loja, usuario } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  // Estados do Catálogo
  const [salvando, setSalvando] = useState<boolean>(false);
  const [copiado, setCopiado] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string>('');
  const [snapshotInicial, setSnapshotInicial] = useState<string>('');

  // Configurações
  const [publicarCatalogo, setPublicarCatalogo] = useState<boolean>(true);
  const [slugCatalogo, setSlugCatalogo] = useState<string>('');
  const [modalEditarSlug, setModalEditarSlug] = useState<boolean>(false);
  const [novoSlug, setNovoSlug] = useState<string>('');
  const [erroSlug, setErroSlug] = useState<string>('');

  const [corPrimaria, setCorPrimaria] = useState<string>('#10B981');
  const [corPersonalizada, setCorPersonalizada] = useState<string>('#10B981');

  const [aceitaPedidosOnline, setAceitaPedidosOnline] = useState<boolean>(true);
  const [resumoWhatsapp, setResumoWhatsapp] = useState<boolean>(true);
  const [exigirPesagemPreviaPagamento, setExigirPesagemPreviaPagamento] = useState<boolean>(false);
  const [instrucoesPosPedido, setInstrucoesPosPedido] = useState<string>(
    'Em breve entraremos em contato para confirmar os detalhes da sua compra.\nAgradecemos pela preferência!'
  );

  const [modoExibicao, setModoExibicao] = useState<ModoExibicaoCatalogo>('grade');
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [exibirBanner, setExibirBanner] = useState<boolean>(false);
  const [uploadingBanner, setUploadingBanner] = useState<boolean>(false);

  const [comportamentoSemEstoque, setComportamentoSemEstoque] = useState<ComportamentoSemEstoque>('exibir');
  const [exibirProdutosSemFoto, setExibirProdutosSemFoto] = useState<boolean>(false);

  // Inicializar com dados da loja
  useEffect(() => {
    if (loja) {
      const extras = loja.configuracoes_extras || {};
      const catConfig = extras.catalogo || {};

      const pub = catConfig.publicar_catalogo ?? true;
      const slug = loja.slug_catalogo || loja.id;
      const cor = loja.cor_primaria || '#10B981';
      const pedOnline = loja.aceita_pedidos_online ?? true;
      const zap = loja.resumo_whatsapp ?? true;
      const instr = loja.instrucoes_pos_pedido !== undefined && loja.instrucoes_pos_pedido !== null
        ? loja.instrucoes_pos_pedido
        : 'Em breve entraremos em contato para confirmar os detalhes da sua compra.\nAgradecemos pela preferência!';
      const modo = catConfig.modo_exibicao || 'grade';
      const banUrl = loja.url_banner || '';
      const exBan = catConfig.exibir_banner ?? Boolean(loja.url_banner);
      const semEst = catConfig.produtos_sem_estoque || 'exibir';
      const semFoto = catConfig.exibir_produtos_sem_foto ?? false;

      setPublicarCatalogo(pub);
      setSlugCatalogo(slug);
      setNovoSlug(slug);
      setCorPrimaria(cor);
      setCorPersonalizada(cor);
      setAceitaPedidosOnline(pedOnline);
      setResumoWhatsapp(zap);
      setExigirPesagemPreviaPagamento(Boolean(loja.exigir_pesagem_previa_pagamento));
      setInstrucoesPosPedido(instr);
      setModoExibicao(modo);
      setExibirBanner(exBan);
      setBannerUrl(banUrl);
      setComportamentoSemEstoque(semEst);
      setExibirProdutosSemFoto(semFoto);

      setSnapshotInicial(
        JSON.stringify({
          publicarCatalogo: pub,
          corPrimaria: cor,
          aceitaPedidosOnline: pedOnline,
          resumoWhatsapp: zap,
          exigirPesagemPreviaPagamento: Boolean(loja.exigir_pesagem_previa_pagamento),
          instrucoesPosPedido: instr,
          modoExibicao: modo,
          exibirBanner: exBan,
          bannerUrl: banUrl,
          comportamentoSemEstoque: semEst,
          exibirProdutosSemFoto: semFoto
        })
      );
    }
  }, [loja]);

  // URL pública do catálogo
  const catalogoUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/catalog/${slugCatalogo || loja?.id || ''}`
    : `https://hubi.app/catalog/${slugCatalogo || ''}`;

  const handleCopiarLink = async () => {
    try {
      await navigator.clipboard.writeText(catalogoUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (err) {
      console.error('Falha ao copiar link', err);
    }
  };

  const handleSalvarSlug = async () => {
    if (!novoSlug.trim()) {
      setErroSlug('O link não pode ficar vazio.');
      return;
    }

    const slugFormatado = novoSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-');

    try {
      setSalvando(true);
      setErroSlug('');

      const { error } = await supabase
        .from('lojas')
        .update({ slug_catalogo: slugFormatado })
        .eq('id', loja?.id);

      if (error) throw error;

      setSlugCatalogo(slugFormatado);
      setModalEditarSlug(false);
      mostrarFeedback('Link do catálogo atualizado com sucesso!');
    } catch (err: unknown) {
      console.error(err);
      setErroSlug('Erro ao salvar ou este link já está em uso.');
    } finally {
      setSalvando(false);
    }
  };

  const mostrarFeedback = (msg: string) => {
    setMensagemSucesso(msg);
    setTimeout(() => setMensagemSucesso(''), 3500);
  };

  // Salvar alterações gerais no Supabase
  const handleSalvarConfiguracoes = async () => {
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
          produtos_sem_estoque: comportamentoSemEstoque,
          exibir_produtos_sem_foto: exibirProdutosSemFoto,
          exibir_banner: exibirBanner
        }
      };

      const { error } = await supabase
        .from('lojas')
        .update({
          cor_primaria: corPrimaria,
          aceita_pedidos_online: aceitaPedidosOnline,
          resumo_whatsapp: resumoWhatsapp,
          exigir_pesagem_previa_pagamento: exigirPesagemPreviaPagamento,
          instrucoes_pos_pedido: instrucoesPosPedido,
          url_banner: bannerUrl,
          configuracoes_extras: novasExtras
        })
        .eq('id', loja.id);

      if (error) throw error;

      setSnapshotInicial(snapshotAtual);
      mostrarFeedback('Configurações do Catálogo salvas com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar catálogo:', err);
      alert('Houve um erro ao salvar as configurações do catálogo.');
    } finally {
      setSalvando(false);
    }
  };

  const handleUploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !loja?.id) return;

    try {
      setUploadingBanner(true);
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `banners/${loja.id}_${Date.now()}.${ext}`;

      // Tenta upload no bucket 'produtos' (ou 'fotos')
      let bucketEscolhido = 'produtos';
      let uploadRes = await supabase.storage.from(bucketEscolhido).upload(fileName, file, { upsert: true });

      if (uploadRes.error) {
        bucketEscolhido = 'fotos';
        uploadRes = await supabase.storage.from(bucketEscolhido).upload(fileName, file, { upsert: true });
      }

      if (!uploadRes.error) {
        const { data: publicData } = supabase.storage
          .from(bucketEscolhido)
          .getPublicUrl(fileName);

        if (publicData?.publicUrl) {
          setBannerUrl(publicData.publicUrl);
          setExibirBanner(true);
          return;
        }
      }

      // Fallback para Base64 se storage não tiver políticas liberadas
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setBannerUrl(reader.result);
          setExibirBanner(true);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Erro no upload:', err);
    } finally {
      setUploadingBanner(false);
    }
  };

  const snapshotAtual = useMemo(() => {
    return JSON.stringify({
      publicarCatalogo,
      corPrimaria,
      aceitaPedidosOnline,
      resumoWhatsapp,
      exigirPesagemPreviaPagamento,
      instrucoesPosPedido,
      modoExibicao,
      exibirBanner,
      bannerUrl,
      comportamentoSemEstoque,
      exibirProdutosSemFoto
    });
  }, [
    publicarCatalogo,
    corPrimaria,
    aceitaPedidosOnline,
    resumoWhatsapp,
    instrucoesPosPedido,
    modoExibicao,
    exibirBanner,
    bannerUrl,
    comportamentoSemEstoque,
    exibirProdutosSemFoto
  ]);

  const isDirty = Boolean(snapshotInicial && snapshotAtual !== snapshotInicial);

  // Tecla ESC para voltar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalEditarSlug) {
          setModalEditarSlug(false);
          return;
        }
        navigate(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalEditarSlug, navigate]);

  // Checklist de Perfil da Loja
  const checklist = [
    { label: 'NOME DA LOJA', preenchido: Boolean(loja?.nome_fantasia) },
    { label: 'LOGO', preenchido: Boolean(loja?.url_logo) },
    { label: 'TELEFONE', preenchido: Boolean(loja?.telefone) },
    { label: 'WHATSAPP', preenchido: Boolean(loja?.whatsapp) },
    { label: 'ENDEREÇO', preenchido: Boolean(loja?.endereco_cidade || loja?.endereco_logradouro) },
    { label: 'REDES SOCIAIS', preenchido: Boolean(loja?.instagram) },
    { label: 'SOBRE A LOJA', preenchido: Boolean(loja?.sobre_loja) }
  ];

  return (
    <>
      {/* 1. VISUALIZAÇÃO MOBILE DEDICADA */}
      <div className="block md:hidden h-full w-full">
        <ConfiguracaoCatalogoMobile />
      </div>

      {/* 2. VISUALIZAÇÃO DESKTOP COM SUPORTE DUAL-TEMA */}
      <div className={`hidden md:flex flex-1 flex-col h-full overflow-y-auto font-sans ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
        {/* HEADER DA PÁGINA */}
        <div className={`sticky top-0 z-20 backdrop-blur-md border-b px-4 sm:px-8 py-4 flex items-center justify-between ${
          isDark ? 'bg-[#08131A]/95 border-slate-800 text-white' : 'bg-slate-100/95 border-slate-300 text-black'
        }`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800' : 'bg-white border-2 border-slate-300 text-slate-700 hover:text-black hover:bg-slate-100'
              }`}
              title="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
              isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h1 className={`text-lg sm:text-xl font-black flex items-center gap-2 ${isDark ? 'text-white' : 'text-black'}`}>
                Catálogo Online
              </h1>
              <p className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Configure sua vitrine online, identidade visual e regras de pedidos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isDirty && (
              <button
                type="button"
                onClick={handleSalvarConfiguracoes}
                disabled={salvando}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-2 transition cursor-pointer disabled:opacity-50 animate-in fade-in shadow-md shadow-emerald-500/20 border border-emerald-500"
              >
                <Save className="w-4 h-4" />
                <span>{salvando ? 'Salvando...' : 'Salvar Alterações'}</span>
              </button>
            )}
          </div>
        </div>

        {/* FEEDBACK TOAST */}
        {mensagemSucesso && (
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in slide-in-from-bottom-4">
            <CheckCircle2 className="w-4 h-4" />
            <span>{mensagemSucesso}</span>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL (LAYOUT EM DUAS COLUNAS CONFORME TELAS KYTE) */}
        <div className="max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
          
          {/* CARD DO LINK DO CATÁLOGO (TOPO) */}
          <div className={`rounded-3xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 border ${
            isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <div className="space-y-1">
              <span className={`text-xs font-black flex items-center gap-1.5 uppercase tracking-wider ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}>
                <Globe className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> Link do catálogo
              </span>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-sm sm:text-base font-bold break-all select-all font-mono ${
                  isDark ? 'text-white' : 'text-black'
                }`}>
                  {catalogoUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopiarLink}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border transition cursor-pointer ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800' : 'bg-slate-100 border-2 border-slate-300 text-slate-700 hover:text-black hover:bg-slate-200'
                  }`}
                >
                  {copiado ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiado ? 'Link Copiado!' : 'Copiar link'}</span>
                </button>
              </div>
            </div>

            <a
              href={catalogoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shrink-0 shadow-md shadow-emerald-500/20 border border-emerald-500"
            >
              <span>Ver em outra aba</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* GRID DE DUAS COLUNAS PRINCIPAIS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* COLUNA ESQUERDA (7 colunas) */}
            <div className="lg:col-span-7 space-y-6">

              {/* 1. PUBLICAR CATÁLOGO ONLINE */}
              <div className={`rounded-3xl p-6 shadow-xs space-y-3 border ${
                isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Publicar Catálogo Online</h3>
                    <p className={`text-xs flex items-center gap-2 mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      <span className="font-mono font-bold">/catalog/{slugCatalogo}</span>
                      <button
                        type="button"
                        onClick={() => setModalEditarSlug(true)}
                        className="text-emerald-500 hover:text-emerald-400 font-bold hover:underline cursor-pointer text-xs"
                      >
                        Editar link
                      </button>
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={publicarCatalogo}
                      onChange={(e) => setPublicarCatalogo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                      isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                    }`}></div>
                  </label>
                </div>
              </div>



            {/* 3. MODO DE EXIBIÇÃO PRINCIPAL */}
            <div className={`rounded-3xl p-6 shadow-xs space-y-4 border ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div>
                <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Modo de exibição principal</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Como seus clientes visualizarão a listagem de produtos no catálogo online.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {/* Opção 1: Modo Lista */}
                <div
                  onClick={() => setModoExibicao('lista')}
                  className={`p-4 rounded-2xl border transition cursor-pointer space-y-2.5 flex flex-col justify-between ${
                    modoExibicao === 'lista'
                      ? isDark
                        ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20 text-white'
                        : 'bg-emerald-50 border-2 border-emerald-500 ring-2 ring-emerald-500/20 text-black'
                      : isDark
                      ? 'bg-[#08131A] border-slate-700 hover:border-slate-600 text-slate-300'
                      : 'bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <List className={`w-5 h-5 ${modoExibicao === 'lista' ? 'text-emerald-500' : 'text-slate-400'}`} />
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      modoExibicao === 'lista' ? 'border-emerald-500 bg-emerald-500' : isDark ? 'border-slate-600' : 'border-slate-400'
                    }`}>
                      {modoExibicao === 'lista' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className={`font-black text-sm ${modoExibicao === 'lista' ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-white' : 'text-black')}`}>Modo Lista</h4>
                    <p className={`text-xs leading-normal mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Navegação mais rápida, ideal para grandes quantidades de produtos.
                    </p>
                  </div>
                </div>

                {/* Opção 2: Modo Grade */}
                <div
                  onClick={() => setModoExibicao('grade')}
                  className={`p-4 rounded-2xl border transition cursor-pointer space-y-2.5 flex flex-col justify-between ${
                    modoExibicao === 'grade'
                      ? isDark
                        ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20 text-white'
                        : 'bg-emerald-50 border-2 border-emerald-500 ring-2 ring-emerald-500/20 text-black'
                      : isDark
                      ? 'bg-[#08131A] border-slate-700 hover:border-slate-600 text-slate-300'
                      : 'bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <LayoutGrid className={`w-5 h-5 ${modoExibicao === 'grade' ? 'text-emerald-500' : 'text-slate-400'}`} />
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      modoExibicao === 'grade' ? 'border-emerald-500 bg-emerald-500' : isDark ? 'border-slate-600' : 'border-slate-400'
                    }`}>
                      {modoExibicao === 'grade' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className={`font-black text-sm ${modoExibicao === 'grade' ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-white' : 'text-black')}`}>Modo Grade</h4>
                    <p className={`text-xs leading-normal mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Ideal para ver vários produtos com fotos e destaques visuais ao mesmo tempo.
                    </p>
                  </div>
                </div>

                {/* Opção 3: Modo Instaview */}
                <div
                  onClick={() => setModoExibicao('instaview')}
                  className={`p-4 rounded-2xl border transition cursor-pointer space-y-2.5 flex flex-col justify-between ${
                    modoExibicao === 'instaview'
                      ? isDark
                        ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20 text-white'
                        : 'bg-emerald-50 border-2 border-emerald-500 ring-2 ring-emerald-500/20 text-black'
                      : isDark
                      ? 'bg-[#08131A] border-slate-700 hover:border-slate-600 text-slate-300'
                      : 'bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Smartphone className={`w-5 h-5 ${modoExibicao === 'instaview' ? 'text-emerald-500' : 'text-slate-400'}`} />
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      modoExibicao === 'instaview' ? 'border-emerald-500 bg-emerald-500' : isDark ? 'border-slate-600' : 'border-slate-400'
                    }`}>
                      {modoExibicao === 'instaview' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className={`font-black text-sm ${modoExibicao === 'instaview' ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-white' : 'text-black')}`}>Modo Instaview</h4>
                    <p className={`text-xs leading-normal mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Estilo feed de fotos com imagens grandes e imersão total para moda e lifestyle.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. BANNER DA LOJA */}
            <div className={`rounded-3xl p-6 shadow-xs space-y-4 border ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Banner da loja</h3>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Ocultar ou exibir o banner da loja no topo do catálogo online.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exibirBanner}
                    onChange={(e) => setExibirBanner(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                    isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                  }`}></div>
                </label>
              </div>

              {exibirBanner && (
                <div className="space-y-3 pt-2">
                  {bannerUrl ? (
                    <div className={`relative aspect-[21/9] sm:aspect-[4/1] w-full rounded-2xl overflow-hidden border group ${
                      isDark ? 'border-slate-700 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
                    }`}>
                      <img src={bannerUrl} alt="Banner da loja" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                        <label className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer transition border border-emerald-500 shadow-sm">
                          <input type="file" accept="image/*" onChange={handleUploadBanner} className="hidden" />
                          Trocar Imagem
                        </label>
                        <button
                          type="button"
                          onClick={() => setBannerUrl('')}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition cursor-pointer"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition space-y-2 ${
                      isDark ? 'border-slate-700 hover:border-emerald-500 bg-[#08131A]' : 'border-slate-300 hover:border-emerald-500 bg-slate-50'
                    }`}>
                      <input type="file" accept="image/*" onChange={handleUploadBanner} className="hidden" />
                      <ImageIcon className={`w-8 h-8 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                      <div className="text-xs">
                        <span className="font-bold text-emerald-500">Clique para enviar imagem</span> ou arraste até aqui
                      </div>
                      <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Recomendado: 1200x300px (JPG ou PNG)</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* 5. PRODUTOS SEM ESTOQUE */}
            <div className={`rounded-3xl p-6 shadow-xs space-y-4 border ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div>
                <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Produtos sem estoque</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Defina o comportamento do catálogo para produtos que zeraram no estoque físico.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                {[
                  {
                    id: 'ocultar',
                    title: 'Não exibir no catálogo',
                    desc: 'Oculta automaticamente os produtos com estoque zerado.'
                  },
                  {
                    id: 'indisponivel',
                    title: 'Exibir como indisponível',
                    desc: 'Mostra o produto com o selo "Esgotado" e desabilita o botão de compra.'
                  },
                  {
                    id: 'exibir',
                    title: 'Exibir normalmente',
                    desc: 'Permite que os clientes continuem fazendo pedidos mesmo sem estoque cadastrado.'
                  }
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border transition cursor-pointer ${
                      comportamentoSemEstoque === opt.id
                        ? isDark
                          ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-xs'
                          : 'bg-emerald-50 border-2 border-emerald-500 text-black shadow-xs'
                        : isDark
                        ? 'bg-[#08131A] border-slate-700 text-slate-300 hover:bg-slate-900 shadow-xs'
                        : 'bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 shadow-xs'
                    }`}
                  >
                    <input
                      type="radio"
                      name="comportamentoSemEstoque"
                      value={opt.id}
                      checked={comportamentoSemEstoque === opt.id}
                      onChange={() => setComportamentoSemEstoque(opt.id as ComportamentoSemEstoque)}
                      className="mt-1 accent-emerald-600"
                    />
                    <div>
                      <span className={`font-bold text-sm block ${comportamentoSemEstoque === opt.id ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-white' : 'text-black')}`}>{opt.title}</span>
                      <span className={`text-xs font-medium block mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 6. PRODUTOS SEM FOTO */}
            <div className={`rounded-3xl p-6 shadow-xs space-y-4 border ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Exibir produtos sem foto</h3>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Defina se produtos que ainda não possuem imagens cadastradas devem aparecer no catálogo online.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exibirProdutosSemFoto}
                    onChange={(e) => setExibirProdutosSemFoto(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                    isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                  }`}></div>
                </label>
              </div>

              <div className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2.5 ${
                isDark ? 'bg-[#08131A] border-slate-700 text-slate-300' : 'bg-slate-100 border-2 border-slate-300 text-slate-700'
              }`}>
                <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  {exibirProdutosSemFoto
                    ? 'Produtos sem foto estão VISÍVEIS no catálogo online com uma imagem padrão.'
                    : 'Apenas produtos COM FOTO cadastrada aparecem no catálogo online (Padrão e Recomendado).'}
                </span>
              </div>
            </div>

          </div>

          {/* COLUNA DIREITA (5 colunas) */}
          <div className="lg:col-span-5 space-y-6">

            {/* 6. DADOS DA LOJA (CHECKLIST DE PERFIL) */}
            <div className={`rounded-3xl p-6 shadow-xs space-y-4 border ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div>
                <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Dados da Loja</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Complete as informações da sua loja e deixe seu catálogo profissional!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      item.preenchido ? 'bg-emerald-500/20 text-emerald-500 dark:text-emerald-400' : isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-200 text-slate-400'
                    }`}>
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className={`font-semibold text-[11px] ${item.preenchido ? (isDark ? 'text-white' : 'text-black') : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                to="/config?tab=dados-loja"
                className={`w-full py-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer pt-2 ${
                  isDark ? 'bg-[#08131A] border-slate-700 text-white hover:bg-slate-900' : 'bg-slate-100 border-2 border-slate-300 text-black hover:bg-slate-200'
                }`}
              >
                <span>Editar dados da loja</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* 7. PEDIDOS ONLINE & WHATSAPP */}
            <div className={`rounded-3xl p-6 shadow-xs space-y-5 border ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Pedidos</h3>

              {/* Switch Aceitar Pedidos */}
              <div className={`flex items-start justify-between gap-4 pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <div className="space-y-0.5">
                  <span className={`font-bold text-xs block ${isDark ? 'text-white' : 'text-black'}`}>Aceitar pedidos online</span>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Seus pedidos virão como <strong>Pendente</strong> até que você os aceite como Confirmado.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={aceitaPedidosOnline}
                    onChange={(e) => setAceitaPedidosOnline(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                    isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                  }`}></div>
                </label>
              </div>

              {/* Switch Exigir Pesagem Prévia */}
              <div className={`flex items-start justify-between gap-4 pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <div className="space-y-0.5">
                  <span className={`font-bold text-xs block ${isDark ? 'text-white' : 'text-black'}`}>Exigir pesagem prévia para itens vendidos por quilo</span>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Quando ativado, pedidos no catálogo com produtos vendidos por quilo (kg) terão o pagamento bloqueado inicialmente e só serão liberados após o lojista informar o peso real aferido na balança. Quando desativado, o pagamento é liberado imediatamente com o valor estimado.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={exigirPesagemPreviaPagamento}
                    onChange={(e) => setExigirPesagemPreviaPagamento(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                    isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                  }`}></div>
                </label>
              </div>

              {/* Switch Resumo WhatsApp */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <span className={`font-bold text-xs block ${isDark ? 'text-white' : 'text-black'}`}>Receber resumo do pedido pelo WhatsApp</span>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Além de ter seu pedido criado no HUBI, seus clientes serão direcionados para enviar o resumo do pedido para seu WhatsApp cadastrado.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={resumoWhatsapp}
                    onChange={(e) => setResumoWhatsapp(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                    isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                  }`}></div>
                </label>
              </div>
            </div>

            {/* 8. ORIENTAÇÕES PÓS-PEDIDO */}
            <div className={`rounded-3xl p-6 shadow-xs space-y-4 border ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div>
                <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Orientações pós-pedido</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Personalize a mensagem que seus clientes verão após concluírem o pedido. Agradeça pela compra, informe sobre prazos de entrega e retirada ou formas de pagamento.
                </p>
              </div>

              {/* Mockup do Celular com a Mensagem */}
              <div className={`p-4 rounded-2xl border flex flex-col items-center shadow-inner space-y-3 ${
                isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-50 border-2 border-slate-300'
              }`}>
                <div className={`w-full max-w-[200px] rounded-2xl p-4 text-center space-y-2 shadow-lg border ${
                  isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}>
                  <div className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center ${
                    isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    <Check className="w-5 h-5 stroke-[3]" />
                  </div>
                  <h5 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-black'}`}>Pedido enviado!</h5>
                  <p className={`text-[10px] line-clamp-3 leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {instrucoesPosPedido || 'Agradecemos pela preferência!'}
                  </p>
                </div>
              </div>

              {/* Textarea de Edição */}
              <div className="space-y-1">
                <textarea
                  rows={3}
                  maxLength={200}
                  value={instrucoesPosPedido}
                  onChange={(e) => setInstrucoesPosPedido(e.target.value)}
                  placeholder="Ex: Em breve entraremos em contato para confirmar os detalhes da sua compra. Agradecemos pela preferência!"
                  className={`w-full p-3 rounded-2xl text-xs focus:border-emerald-500 outline-none resize-none transition ${
                    isDark
                      ? 'bg-[#08131A] border border-slate-700 text-white placeholder:text-slate-500'
                      : 'bg-slate-50 border-2 border-slate-300 text-black placeholder:text-slate-400'
                  }`}
                />
                <div className={`text-right text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {instrucoesPosPedido.length}/200
                </div>
              </div>
            </div>

            {/* 9. OUTRAS CONFIGURAÇÕES / ATALHOS */}
            <div className={`rounded-3xl p-6 shadow-xs space-y-3 border ${
              isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Outras configurações</h3>

              <div className="space-y-2">
                <Link
                  to="/config?tab=pagamentos"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs font-bold transition shadow-xs ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-white hover:bg-slate-900' : 'bg-slate-50 border-2 border-slate-300 text-black hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <span className={`block font-bold ${isDark ? 'text-white' : 'text-black'}`}>Opções de pagamento</span>
                      <span className={`text-[11px] font-normal ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Personalize as formas de pagamento da sua loja</span>
                    </div>
                  </div>
                  <ExternalLink className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                </Link>

                <Link
                  to="/config?tab=entrega"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs font-bold transition shadow-xs ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-white hover:bg-slate-900' : 'bg-slate-50 border-2 border-slate-300 text-black hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className={`block font-bold ${isDark ? 'text-white' : 'text-black'}`}>Entrega e retirada</span>
                      <span className={`text-[11px] font-normal ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Configure as opções de delivery e retirada</span>
                    </div>
                  </div>
                  <ExternalLink className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                </Link>

                <Link
                  to="/config?tab=parceiros"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs font-bold transition shadow-xs ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-white hover:bg-slate-900' : 'bg-slate-50 border-2 border-slate-300 text-black hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      <Share2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className={`block font-bold ${isDark ? 'text-white' : 'text-black'}`}>Canais de Venda</span>
                      <span className={`text-[11px] font-normal ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Integre com Instagram, Facebook e WhatsApp</span>
                    </div>
                  </div>
                  <ExternalLink className={`w-3.5 h-3.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                </Link>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* MODAL DE EDIÇÃO DE SLUG / LINK DO CATÁLOGO */}
      {modalEditarSlug && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className={`border rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 ${
            isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-black'}`}>Editar Link do Catálogo</h3>
              <button
                type="button"
                onClick={() => setModalEditarSlug(false)}
                className={`p-1 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Escolha um endereço fácil de lembrar para compartilhar com seus clientes nas redes sociais.
            </p>

            <div className="space-y-1.5">
              <label className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Endereço do Catálogo
              </label>
              <div className={`flex items-center border rounded-xl px-3 py-2 text-xs font-mono ${
                isDark ? 'bg-[#08131A] border-slate-700 text-white' : 'bg-slate-50 border-2 border-slate-300 text-black'
              }`}>
                <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>{window.location.origin}/catalog/</span>
                <input
                  type="text"
                  value={novoSlug}
                  onChange={(e) => setNovoSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="minha-loja"
                  className="bg-transparent text-emerald-500 font-bold outline-none flex-1 font-mono"
                />
              </div>
              {erroSlug && (
                <p className="text-[11px] text-rose-500 font-semibold">{erroSlug}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalEditarSlug(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  isDark ? 'bg-[#08131A] border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800' : 'bg-slate-100 border-2 border-slate-300 text-slate-700 hover:text-black hover:bg-slate-200'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarSlug}
                disabled={salvando}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 shadow-md shadow-emerald-500/20 text-xs font-black cursor-pointer disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar Novo Link'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
};
