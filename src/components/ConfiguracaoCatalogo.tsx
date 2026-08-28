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
  const [instrucoesPosPedido, setInstrucoesPosPedido] = useState<string>(
    'Em breve entraremos em contato para confirmar os detalhes da sua compra.\nAgradecemos pela preferência!'
  );

  const [modoExibicao, setModoExibicao] = useState<ModoExibicaoCatalogo>('grade');
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [exibirBanner, setExibirBanner] = useState<boolean>(false);
  const [uploadingBanner, setUploadingBanner] = useState<boolean>(false);

  const [comportamentoSemEstoque, setComportamentoSemEstoque] = useState<ComportamentoSemEstoque>('exibir');

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

      setPublicarCatalogo(pub);
      setSlugCatalogo(slug);
      setNovoSlug(slug);
      setCorPrimaria(cor);
      setCorPersonalizada(cor);
      setAceitaPedidosOnline(pedOnline);
      setResumoWhatsapp(zap);
      setInstrucoesPosPedido(instr);
      setModoExibicao(modo);
      setExibirBanner(exBan);
      setBannerUrl(banUrl);
      setComportamentoSemEstoque(semEst);

      setSnapshotInicial(
        JSON.stringify({
          publicarCatalogo: pub,
          corPrimaria: cor,
          aceitaPedidosOnline: pedOnline,
          resumoWhatsapp: zap,
          instrucoesPosPedido: instr,
          modoExibicao: modo,
          exibirBanner: exBan,
          bannerUrl: banUrl,
          comportamentoSemEstoque: semEst
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
          exibir_banner: exibirBanner
        }
      };

      const { error } = await supabase
        .from('lojas')
        .update({
          cor_primaria: corPrimaria,
          aceita_pedidos_online: aceitaPedidosOnline,
          resumo_whatsapp: resumoWhatsapp,
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
      instrucoesPosPedido,
      modoExibicao,
      exibirBanner,
      bannerUrl,
      comportamentoSemEstoque
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
    comportamentoSemEstoque
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

      {/* 2. VISUALIZAÇÃO DESKTOP */}
      <div className="hidden md:flex flex-1 flex-col h-full bg-slate-950 overflow-y-auto">
        {/* HEADER DA PÁGINA */}
      <div className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shadow-inner">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-100 flex items-center gap-2">
              Catálogo Online
            </h1>
            <p className="text-xs text-slate-400">Configure sua vitrine online, identidade visual e regras de pedidos</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              type="button"
              onClick={handleSalvarConfiguracoes}
              disabled={salvando}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 animate-in fade-in"
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
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5 text-emerald-400" /> Link do catálogo
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm sm:text-base font-semibold text-slate-200 break-all select-all font-mono">
                {catalogoUrl}
              </span>
              <button
                type="button"
                onClick={handleCopiarLink}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
              >
                {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiado ? 'Link Copiado!' : 'Copiar link'}</span>
              </button>
            </div>
          </div>

          <a
            href={catalogoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer shrink-0"
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
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Publicar Catálogo Online</h3>
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-slate-300">/catalog/{slugCatalogo}</span>
                    <button
                      type="button"
                      onClick={() => setModalEditarSlug(true)}
                      className="text-emerald-400 hover:text-emerald-300 font-bold hover:underline cursor-pointer text-xs"
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
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            {/* 2. COR PRINCIPAL / TEMA DE CORES */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Cor principal</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Escolha o tema de cores que mais combina com a sua marca!
                </p>
              </div>

              {/* Seletor de Cores da Paleta */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {CORES_PALETA.map((c) => {
                  const isSelected = corPrimaria.toUpperCase() === c.hex.toUpperCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => {
                        setCorPrimaria(c.hex);
                        setCorPersonalizada(c.hex);
                      }}
                      className={`w-9 h-9 rounded-xl transition cursor-pointer flex items-center justify-center shadow-md relative ${
                        isSelected ? 'ring-3 ring-white scale-110' : 'hover:scale-105 opacity-90 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.nome}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white drop-shadow-md stroke-[3]" />}
                    </button>
                  );
                })}

                {/* Seletor de Cor Customizada (+) */}
                <label
                  className={`w-9 h-9 rounded-xl border border-slate-700 bg-slate-800 transition cursor-pointer flex items-center justify-center relative hover:bg-slate-700 ${
                    !CORES_PALETA.some(c => c.hex.toUpperCase() === corPrimaria.toUpperCase()) ? 'ring-3 ring-emerald-400' : ''
                  }`}
                  title="Cor personalizada (Hexadecimal)"
                >
                  <input
                    type="color"
                    value={corPersonalizada}
                    onChange={(e) => {
                      setCorPersonalizada(e.target.value);
                      setCorPrimaria(e.target.value);
                    }}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  />
                  <Palette className="w-4 h-4 text-slate-300" />
                </label>
              </div>

              {/* CARD DE PREVIEW INTERATIVO DA COR */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col items-center max-w-sm mx-auto shadow-inner space-y-3">
                <div className="w-full flex items-center justify-between px-2 text-slate-500">
                  <div className="w-4 h-4 rounded-full bg-slate-800"></div>
                  <div className="w-16 h-2 rounded-full bg-slate-800"></div>
                  <div className="w-4 h-4 rounded-full bg-slate-800"></div>
                </div>

                {/* Mockup do Produto */}
                <div className="w-full bg-slate-900 rounded-2xl p-3 border border-slate-800 space-y-3">
                  <div className="relative aspect-video w-full bg-slate-800 rounded-xl flex items-center justify-center overflow-hidden">
                    <span className="absolute top-2 left-2 bg-slate-950 text-white font-bold text-[10px] px-2 py-0.5 rounded-md">
                      -10%
                    </span>
                    <ImageIcon className="w-8 h-8 text-slate-600" />
                  </div>

                  <div className="w-3/4 h-3 bg-slate-800 rounded-full"></div>
                  <div className="w-1/2 h-2 bg-slate-800/60 rounded-full"></div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-black text-slate-100">R$ 89,90</span>
                    <button
                      type="button"
                      className="px-3.5 py-1.5 rounded-xl text-white text-xs font-bold shadow-md transition flex items-center gap-1"
                      style={{ backgroundColor: corPrimaria }}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. MODO DE EXIBIÇÃO PRINCIPAL */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Modo de exibição principal</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Como seus clientes visualizarão a listagem de produtos no catálogo online.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {/* Opção 1: Modo Lista */}
                <div
                  onClick={() => setModoExibicao('lista')}
                  className={`p-4 rounded-2xl border transition cursor-pointer space-y-2.5 flex flex-col justify-between ${
                    modoExibicao === 'lista'
                      ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <List className={`w-5 h-5 ${modoExibicao === 'lista' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      modoExibicao === 'lista' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600'
                    }`}>
                      {modoExibicao === 'lista' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-200">Modo Lista</h4>
                    <p className="text-[11px] text-slate-400 leading-tight mt-1">
                      Navegação mais rápida, ideal para grandes quantidades de produtos.
                    </p>
                  </div>
                </div>

                {/* Opção 2: Modo Grade */}
                <div
                  onClick={() => setModoExibicao('grade')}
                  className={`p-4 rounded-2xl border transition cursor-pointer space-y-2.5 flex flex-col justify-between ${
                    modoExibicao === 'grade'
                      ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <LayoutGrid className={`w-5 h-5 ${modoExibicao === 'grade' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      modoExibicao === 'grade' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600'
                    }`}>
                      {modoExibicao === 'grade' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-200">Modo Grade</h4>
                    <p className="text-[11px] text-slate-400 leading-tight mt-1">
                      Ideal para ver vários produtos com fotos e destaques visuais ao mesmo tempo.
                    </p>
                  </div>
                </div>

                {/* Opção 3: Modo Instaview */}
                <div
                  onClick={() => setModoExibicao('instaview')}
                  className={`p-4 rounded-2xl border transition cursor-pointer space-y-2.5 flex flex-col justify-between ${
                    modoExibicao === 'instaview'
                      ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Smartphone className={`w-5 h-5 ${modoExibicao === 'instaview' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      modoExibicao === 'instaview' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600'
                    }`}>
                      {modoExibicao === 'instaview' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-200">Modo Instaview</h4>
                    <p className="text-[11px] text-slate-400 leading-tight mt-1">
                      Estilo feed de fotos com imagens grandes e imersão total para moda e lifestyle.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. BANNER DA LOJA */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Banner da loja</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
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
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {exibirBanner && (
                <div className="space-y-3 pt-2">
                  {bannerUrl ? (
                    <div className="relative aspect-[21/9] sm:aspect-[4/1] w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 group">
                      <img src={bannerUrl} alt="Banner da loja" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                        <label className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition">
                          <input type="file" accept="image/*" onChange={handleUploadBanner} className="hidden" />
                          Trocar Imagem
                        </label>
                        <button
                          type="button"
                          onClick={() => setBannerUrl('')}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition bg-slate-950/50 space-y-2">
                      <input type="file" accept="image/*" onChange={handleUploadBanner} className="hidden" />
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                      <div className="text-xs">
                        <span className="font-bold text-emerald-400">Clique para enviar imagem</span> ou arraste até aqui
                      </div>
                      <span className="text-[10px] text-slate-500">Recomendado: 1200x300px (JPG ou PNG)</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* 5. PRODUTOS SEM ESTOQUE */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Produtos sem estoque</h3>
                <p className="text-xs text-slate-400 mt-0.5">
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
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100'
                        : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-950'
                    }`}
                  >
                    <input
                      type="radio"
                      name="comportamentoSemEstoque"
                      value={opt.id}
                      checked={comportamentoSemEstoque === opt.id}
                      onChange={() => setComportamentoSemEstoque(opt.id as ComportamentoSemEstoque)}
                      className="mt-1 text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-100 block">{opt.title}</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

          </div>

          {/* COLUNA DIREITA (5 colunas) */}
          <div className="lg:col-span-5 space-y-6">

            {/* 6. DADOS DA LOJA (CHECKLIST DE PERFIL) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Dados da Loja</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete as informações da sua loja e deixe seu catálogo profissional!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      item.preenchido ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'
                    }`}>
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                    <span className={`font-semibold text-[11px] ${item.preenchido ? 'text-slate-300' : 'text-slate-500'}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                to="/config?tab=dados-loja"
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer pt-2"
              >
                <span>Editar dados da loja</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* 7. PEDIDOS ONLINE & WHATSAPP */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
              <h3 className="font-bold text-slate-100 text-base">Pedidos</h3>

              {/* Switch Aceitar Pedidos */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-slate-100 block">Aceitar pedidos online</span>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Switch Resumo WhatsApp */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-slate-100 block">Receber resumo do pedido pelo WhatsApp</span>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            {/* 8. ORIENTAÇÕES PÓS-PEDIDO */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Orientações pós-pedido</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Personalize a mensagem que seus clientes verão após concluírem o pedido. Agradeça pela compra, informe sobre prazos de entrega e retirada ou formas de pagamento.
                </p>
              </div>

              {/* Mockup do Celular com a Mensagem */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col items-center shadow-inner space-y-3">
                <div className="w-full max-w-[200px] bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center space-y-2 shadow-lg">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                    <Check className="w-5 h-5 stroke-[3]" />
                  </div>
                  <h5 className="font-bold text-xs text-slate-100">Pedido enviado!</h5>
                  <p className="text-[10px] text-slate-400 line-clamp-3 leading-tight">
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
                  className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
                <div className="text-right text-[10px] text-slate-500">
                  {instrucoesPosPedido.length}/200
                </div>
              </div>
            </div>

            {/* 9. OUTRAS CONFIGURAÇÕES / ATALHOS */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-3">
              <h3 className="font-bold text-slate-100 text-base">Outras configurações</h3>

              <div className="space-y-2">
                <Link
                  to="/config?tab=pagamentos"
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-300 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                    <div>
                      <span className="block font-bold text-slate-200">Opções de pagamento</span>
                      <span className="text-[10px] text-slate-500 font-normal">Personalize as formas de pagamento da sua loja</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </Link>

                <Link
                  to="/config?tab=entrega"
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-300 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="block font-bold text-slate-200">Entrega e retirada</span>
                      <span className="text-[10px] text-slate-500 font-normal">Configure as opções de delivery e retirada</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </Link>

                <Link
                  to="/config?tab=parceiros"
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-300 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Share2 className="w-4 h-4 text-pink-400" />
                    <div>
                      <span className="block font-bold text-slate-200">Canais de Venda</span>
                      <span className="text-[10px] text-slate-500 font-normal">Integre com Instagram, Facebook e WhatsApp</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </Link>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* MODAL DE EDIÇÃO DE SLUG / LINK DO CATÁLOGO */}
      {modalEditarSlug && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-100">Editar Link do Catálogo</h3>
              <button
                type="button"
                onClick={() => setModalEditarSlug(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Escolha um endereço fácil de lembrar para compartilhar com seus clientes nas redes sociais.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Endereço do Catálogo
              </label>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300">
                <span className="text-slate-500">{window.location.origin}/catalog/</span>
                <input
                  type="text"
                  value={novoSlug}
                  onChange={(e) => setNovoSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="minha-loja"
                  className="bg-transparent text-emerald-400 font-bold outline-none flex-1 font-mono"
                />
              </div>
              {erroSlug && (
                <p className="text-[11px] text-rose-400 font-semibold">{erroSlug}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalEditarSlug(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarSlug}
                disabled={salvando}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
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
