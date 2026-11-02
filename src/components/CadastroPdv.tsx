import React, { useState, useEffect } from 'react';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Globe,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Store,
  Share2,
  Receipt,
  PieChart,
  ShoppingBag,
  Sparkles,
  Smartphone,
  Phone
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatarTelefoneInput } from '../utils/formatters';

type AuthScreen = 'welcome' | 'signup_email' | 'signin_email';

export const CadastroPdv: React.FC = () => {
  const { cadastrarMinimalista, entrarComEmail, selecionarLoja, lojasDisponiveis } = useAuth();

  const [screen, setScreen] = useState<AuthScreen>('signin_email');
  const [nome, setNome] = useState('');
  const [nomeLoja, setNomeLoja] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // Carousel State
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    {
      id: 0,
      title: 'Catálogo em um link, receba pedidos online',
      subtitle:
        'Chega de mandar fotos de produtos no WhatsApp! Agora seus produtos ficam num catálogo bonito, organizado e fácil de compartilhar. Seu negócio ainda mais profissional.',
      type: 'catalog'
    },
    {
      id: 1,
      title: 'Venda sem enrolação, direto no celular',
      subtitle:
        'Chega de anotar tudo no caderno! Registre suas vendas em segundos. Tenha seus produtos, valores, clientes, formas de pagamento e recibo, tudo salvo!',
      type: 'pos'
    },
    {
      id: 2,
      title: 'Seu estoque se atualiza sozinho, zero dor de cabeça',
      subtitle:
        'A cada venda, seu estoque é atualizado automaticamente, mostrando o que ainda tem disponível e o que está acabando. Menos preocupação e mais produtividade.',
      type: 'stock'
    },
    {
      id: 3,
      title: 'Controle de Fiado & Cobrança Automática',
      subtitle:
        'Chega de calote! Controle o limite de crédito de cada cliente, acompanhe o saldo devedor e envie o resumo da conta no WhatsApp com 1 clique.',
      type: 'fiado'
    }
  ];

  // Auto-play do Carousel a cada 6 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [slides.length]);

  // Limpeza total de credenciais e formulário ao desconectar / trocar de PDV
  useEffect(() => {
    const handleLimparFormulario = () => {
      setWhatsapp('');
      setSenha('');
      setNome('');
      setNomeLoja('');
      setErroMsg(null);
      setMostrarSenha(false);
      setScreen('signin_email');
    };

    window.addEventListener('hubi_logout_limpar_formulario', handleLimparFormulario);
    return () => {
      window.removeEventListener('hubi_logout_limpar_formulario', handleLimparFormulario);
    };
  }, []);

  // Submissão do Cadastro com WhatsApp
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setErroMsg('Por favor, informe seu nome.');
      return;
    }
    if (!nomeLoja.trim()) {
      setErroMsg('Por favor, informe o nome do seu negócio ou loja.');
      return;
    }
    const digitosWhats = whatsapp.replace(/\D/g, '');
    if (digitosWhats.length < 10) {
      setErroMsg('Por favor, informe um WhatsApp válido com DDD (ex: 85 99999-9999).');
      return;
    }
    if (senha.length < 6) {
      setErroMsg('Sua senha precisa ter no mínimo 6 caracteres.');
      return;
    }

    try {
      setSalvando(true);
      setErroMsg(null);
      await cadastrarMinimalista({ nome, nomeLoja, whatsapp, senha });
    } catch (err: any) {
      setErroMsg(err.message || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  // Submissão do Login com WhatsApp ou E-mail
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsapp.trim()) {
      setErroMsg('Por favor, informe seu número de WhatsApp cadastrado.');
      return;
    }
    if (!senha.trim()) {
      setErroMsg('Por favor, digite sua senha de acesso.');
      return;
    }

    try {
      setSalvando(true);
      setErroMsg(null);
      await entrarComEmail(whatsapp, senha);
    } catch (err: any) {
      console.warn('Falha na autenticação do operador:', err);
      setErroMsg(err?.message || 'WhatsApp ou senha incorretos. Por favor, verifique suas credenciais.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-0 sm:p-4 md:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-6xl min-h-[90vh] bg-slate-900 border border-slate-800/80 rounded-none sm:rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* ========================================================================= */}
        {/* COLUNA ESQUERDA: FORMULÁRIO MINIMALISTA DE AUTENTICAÇÃO (ESTILO KYTE)     */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 bg-slate-900 p-6 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 z-10">
          <div className="space-y-6 max-w-sm mx-auto w-full">
            {/* Logo Marca HUBI (Estilo Box do Kyte) */}
            <div className="flex items-center justify-center pt-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-emerald-500/25 tracking-wider">
                HUBI
              </div>
            </div>

            {/* Mensagem de Erro (telas gerais) */}
            {erroMsg && screen !== 'signin_email' && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="flex-1">{erroMsg}</span>
              </div>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* TELA 1: FORMULÁRIO DE CRIAR CONTA COM WHATSAPP (SEM E-MAIL)           */}
            {/* --------------------------------------------------------------------- */}
            {(screen === 'signup_email' || screen === 'welcome') && (
              <form onSubmit={handleSignUp} className="space-y-4 animate-in fade-in">
                <div className="text-center space-y-1">
                  <h1 className="text-xl font-bold text-slate-100">Criar conta com WhatsApp</h1>
                  <p className="text-xs text-slate-400">Preencha os dados do seu negócio para iniciar</p>
                </div>

                <div className="space-y-3">
                  {/* Nome Completo */}
                  <div>
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      placeholder="Seu Nome Completo"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Nome da Loja / Negócio */}
                  <div>
                    <input
                      type="text"
                      required
                      autoComplete="organization"
                      placeholder="Nome da sua Loja ou Negócio"
                      value={nomeLoja}
                      onChange={(e) => setNomeLoja(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* WhatsApp com Máscara Dinâmica */}
                  <div>
                    <input
                      type="tel"
                      required
                      autoComplete="tel"
                      placeholder="WhatsApp (ex: 85 99999-9999)"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(formatarTelefoneInput(e.target.value))}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Senha */}
                  <div className="space-y-1">
                    <div className="relative">
                      <input
                        type={mostrarSenha ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Senha de acesso"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha(!mostrarSenha)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 block px-1">
                      Sua senha precisa ter no mínimo 6 caracteres.
                    </span>
                  </div>
                </div>

                {/* Botão Criar nova conta */}
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer mt-2"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Criando sua conta...</span>
                    </>
                  ) : (
                    <span>Criar nova conta HUBI</span>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('signin_email');
                      setErroMsg(null);
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-emerald-400 transition"
                  >
                    Já tenho conta? Entrar
                  </button>
                </div>
              </form>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* TELA 2: ENTRAR COM WHATSAPP                                           */}
            {/* --------------------------------------------------------------------- */}
            {screen === 'signin_email' && (
              <form onSubmit={handleSignIn} className="space-y-4 animate-in fade-in">
                <div className="text-center space-y-1">
                  <h1 className="text-xl font-bold text-slate-100">Entrar com WhatsApp</h1>
                  <p className="text-xs text-slate-400">Digite seu WhatsApp e senha para acessar seu PDV</p>
                </div>

                {/* Alerta Visual de Erro na Tela de Login */}
                {erroMsg && (
                  <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl flex items-center gap-2.5 text-xs text-rose-200 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="flex-1 font-medium leading-relaxed">{erroMsg}</span>
                  </div>
                )}

                <div className="space-y-3">
                  {/* WhatsApp ou E-mail */}
                  <div>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      placeholder="WhatsApp (ex: 85 99999-9999)"
                      value={whatsapp}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Se for e-mail clássico (com @), mantém livre; se for número, formata
                        if (val.includes('@')) {
                          setWhatsapp(val);
                        } else {
                          setWhatsapp(formatarTelefoneInput(val));
                        }
                        if (erroMsg) setErroMsg(null);
                      }}
                      className={`w-full bg-slate-800/80 border ${erroMsg ? 'border-rose-500/50' : 'border-slate-700'} rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition`}
                    />
                  </div>

                  {/* Senha */}
                  <div className="relative">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Senha de acesso"
                      value={senha}
                      onChange={(e) => {
                        setSenha(e.target.value);
                        if (erroMsg) setErroMsg(null);
                      }}
                      className={`w-full bg-slate-800/80 border ${erroMsg ? 'border-rose-500/50' : 'border-slate-700'} rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 pr-10 transition`}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Botão Entrar */}
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer mt-2"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Entrando...</span>
                    </>
                  ) : (
                    <span>Entrar no HUBI</span>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('signup_email');
                      setErroMsg(null);
                    }}
                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    Não tem uma conta? Criar conta com WhatsApp
                  </button>
                </div>

                {/* Se houver lojas disponíveis cadastradas */}
                {lojasDisponiveis.length > 0 && (
                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-[11px] text-slate-400 block mb-2 font-medium text-center">
                      Ou acesse direto seu PDV salvo:
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {lojasDisponiveis.slice(0, 3).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => selecionarLoja(l.id)}
                          className="w-full p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-left flex items-center justify-between text-xs text-slate-200 transition"
                        >
                          <span className="font-bold truncate">{l.nome_fantasia}</span>
                          <span className="text-[10px] text-emerald-400 font-bold shrink-0">Acessar →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Footer Idioma */}
          <div className="pt-6 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>PT</span>
            </span>
            <span>HUBI v2.0</span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* COLUNA DIREITA: CAROUSEL VISUAL INTERATIVO (EXATAMENTE COMO NAS IMAGENS)  */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 bg-slate-950 p-6 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          {/* Header do Slide */}
          <div className="space-y-2 text-center max-w-xl mx-auto z-10">
            <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight transition-all duration-300">
              {slides[activeSlide].title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto transition-all duration-300">
              {slides[activeSlide].subtitle}
            </p>

            {/* Dots Indicadores de Paginação */}
            <div className="flex items-center justify-center gap-2 pt-3">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSlide(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    activeSlide === idx ? 'w-8 bg-emerald-400' : 'w-2 bg-slate-700 hover:bg-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* ÁREA CENTRAL: MOCKUPS VISUAIS DE CADA SLIDE */}
          <div className="my-auto py-6 flex items-center justify-center relative min-h-[360px] z-10">
            {/* SLIDE 0: CATÁLOGO ONLINE & WHATSAPP (SCREENSHOT 1) */}
            {activeSlide === 0 && (
              <div className="relative w-full max-w-md flex flex-col items-center animate-in zoom-in-95 duration-500">
                {/* Balão WhatsApp Fundo */}
                <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-2 shadow-xl backdrop-blur">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Conversa no WhatsApp</span>
                  </div>
                  <div className="bg-slate-800/80 rounded-2xl p-3 text-xs text-slate-300 max-w-[85%]">
                    Me manda as fotos dos seus produtos, por favor? ✨
                  </div>
                  <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-2xl p-3 text-xs text-emerald-300 ml-auto max-w-[90%] space-y-1">
                    <p>Claro, tudo organizado aqui! Acesse o nosso catálogo online:</p>
                    <span className="text-emerald-400 font-bold underline block">
                      https://hubi.site/catalogo-online
                    </span>
                  </div>
                </div>

                {/* Card de Produto Flutuante em Destaque */}
                <div className="absolute -bottom-4 right-4 sm:right-6 bg-slate-900 border border-emerald-500/50 rounded-2xl p-3.5 shadow-2xl w-60 space-y-2.5 animate-in slide-in-from-bottom-3 duration-300">
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950">
                    <img
                      src="https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&auto=format&fit=crop&q=60"
                      alt="Colar Jóia"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1.5 right-1.5 bg-emerald-500 text-slate-950 font-bold text-[9px] px-2 py-0.5 rounded-full shadow">
                      3 opções &gt;
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-100">Colar Prata Pedra Turmalina</h4>
                    <span className="text-sm font-black text-emerald-400 block mt-0.5">R$ 229,90</span>
                  </div>
                </div>
              </div>
            )}

            {/* SLIDE 1: PDV & RECIBO NA TELA (SCREENSHOT 2) */}
            {activeSlide === 1 && (
              <div className="relative w-full max-w-md flex items-center justify-center animate-in zoom-in-95 duration-500">
                {/* Recibo Térmico Fundo */}
                <div className="bg-white text-slate-900 rounded-2xl p-5 shadow-2xl w-64 space-y-3 font-mono text-[11px] rotate-[-2deg]">
                  <div className="text-center border-b border-dashed border-slate-300 pb-2">
                    <span className="font-black text-xs block">RECIBO #01-2374</span>
                    <span className="text-[10px] text-slate-500">CAFÉ & DOCERIA HUBI</span>
                  </div>
                  <div className="space-y-1 text-[10px] border-b border-dashed border-slate-300 pb-2">
                    <div className="flex justify-between font-bold">
                      <span>2x Donuts Morango</span>
                      <span>R$ 16,00</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>1x Iced Latte</span>
                      <span>R$ 18,00</span>
                    </div>
                  </div>
                  <div className="space-y-0.5 text-[11px] font-bold">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span>R$ 34,00</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Taxa entrega:</span>
                      <span>R$ 8,00</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 text-sm font-black pt-1">
                      <span>TOTAL:</span>
                      <span>R$ 42,00</span>
                    </div>
                  </div>
                </div>

                {/* Badge Flutuante "Total em Pedidos" */}
                <div className="absolute -bottom-2 left-2 sm:left-4 bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 shadow-2xl space-y-0.5">
                  <span className="text-[10px] text-slate-400 block font-medium">Total em vendas hoje</span>
                  <span className="text-base font-black text-emerald-400">R$ 1.670,00 em 128 pedidos</span>
                </div>
              </div>
            )}

            {/* SLIDE 2: ESTOQUE AUTOMÁTICO & GRÁFICO (SCREENSHOT 3) */}
            {activeSlide === 2 && (
              <div className="relative w-full max-w-md flex flex-col items-center animate-in zoom-in-95 duration-500">
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl w-full max-w-sm space-y-4 backdrop-blur">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-bold text-slate-200">Itens em Estoque (87)</span>
                    <button
                      type="button"
                      className="text-[10px] bg-emerald-500/15 text-emerald-300 font-bold px-2 py-1 rounded-lg border border-emerald-500/30"
                    >
                      Visualizar Estoque
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                      <span>Disponíveis (72)</span>
                    </div>
                    <div className="flex items-center gap-2 text-amber-400 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                      <span>Acabando (11)</span>
                    </div>
                    <div className="flex items-center gap-2 text-rose-400 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                      <span>Acabou (4)</span>
                    </div>
                    <div className="flex items-center gap-2 text-sky-400 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                      <span>Grade Variada</span>
                    </div>
                  </div>
                </div>

                {/* Badge Flutuante "Valor em Estoque" */}
                <div className="mt-3 bg-slate-900 border border-emerald-500/50 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">VALOR TOTAL EM ESTOQUE</span>
                    <span className="text-lg font-black text-emerald-400">R$ 3.976,20</span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    ✓
                  </div>
                </div>
              </div>
            )}

            {/* SLIDE 3: FIADO & COBRANÇA */}
            {activeSlide === 3 && (
              <div className="relative w-full max-w-md flex flex-col items-center animate-in zoom-in-95 duration-500">
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl w-full max-w-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-100">Maria Fernandes</h4>
                      <span className="text-[10px] text-slate-400">Cliente Fiado Habilitado</span>
                    </div>
                    <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                      Saldo Devedor
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 block">Total a Pagar</span>
                    <span className="text-xl font-black text-amber-400">R$ 380,00</span>
                  </div>

                  <button
                    type="button"
                    className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Cobrar no WhatsApp com Chave Pix</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navegação Manual com Setas */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 z-10">
            <button
              type="button"
              onClick={() => setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length)}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
              title="Slide Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <span className="text-xs text-slate-500">
              {activeSlide + 1} de {slides.length}
            </span>

            <button
              type="button"
              onClick={() => setActiveSlide((prev) => (prev + 1) % slides.length)}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
              title="Próximo Slide"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
