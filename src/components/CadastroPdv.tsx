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
  Sparkles
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Domínios rápidos para preenchimento de e-mail (como no Kyte)
const QUICK_DOMAINS = ['@GMAIL.COM', '@HOTMAIL.COM', '@OUTLOOK.COM', '@ICLOUD.COM', '@UOL.COM.BR'];

type AuthScreen = 'welcome' | 'signup_email' | 'signin' | 'signin_email';

export const CadastroPdv: React.FC = () => {
  const { cadastrarMinimalista, entrarComEmail, entrarComGoogle, selecionarLoja, lojasDisponiveis } = useAuth();

  const [screen, setScreen] = useState<AuthScreen>('welcome');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
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

  // Adicionar domínio rápido ao e-mail
  const handleAddDomain = (domain: string) => {
    const domainLower = domain.toLowerCase();
    if (email.includes('@')) {
      const prefix = email.split('@')[0];
      setEmail(`${prefix}${domainLower}`);
    } else {
      setEmail(`${email}${domainLower}`);
    }
  };

  // Submissão do Cadastro Minimalista
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setErroMsg('Por favor, informe seu nome ou o nome do seu negócio.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErroMsg('Por favor, informe um e-mail válido.');
      return;
    }

    try {
      setSalvando(true);
      setErroMsg(null);
      await cadastrarMinimalista({ nome, email, senha });
    } catch (err: any) {
      setErroMsg(err.message || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  // Submissão do Login com E-mail
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErroMsg('Por favor, informe seu e-mail cadastrado.');
      return;
    }

    try {
      setSalvando(true);
      setErroMsg(null);
      await entrarComEmail(email, senha);
    } catch (err: any) {
      setErroMsg(err.message || 'Conta não localizada. Cadastre-se em segundos!');
    } finally {
      setSalvando(false);
    }
  };

  // Login com Google Oficial via Supabase OAuth (Abre tela para escolher conta do Google)
  const handleGoogleAuth = async () => {
    try {
      setSalvando(true);
      setErroMsg(null);
      await entrarComGoogle();
    } catch (err: any) {
      console.warn('Erro ao conectar com Google:', err);
      if (err.message && (err.message.includes('provider is not enabled') || err.message.includes('Unsupported provider'))) {
        setErroMsg('O login OAuth do Google precisa ser ativado no painel do Supabase (Authentication > Providers > Google). Enquanto isso, você pode entrar ou criar conta digitando seu e-mail do Google!');
        setScreen('signup_email');
      } else {
        setErroMsg(err.message || 'Erro ao abrir janela de autenticação do Google.');
      }
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

            {/* Mensagem de Erro */}
            {erroMsg && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="flex-1">{erroMsg}</span>
              </div>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* TELA 1: BOAS-VINDAS / OPÇÕES DE CADASTRO                              */}
            {/* --------------------------------------------------------------------- */}
            {screen === 'welcome' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="text-center space-y-1">
                  <h1 className="text-2xl font-bold text-slate-100">Boas-vindas!</h1>
                  <p className="text-xs text-slate-400">Como você gostaria de criar sua conta?</p>
                </div>

                <div className="space-y-3">
                  {/* Google */}
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={handleGoogleAuth}
                    className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-3 transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span>Criar com Google</span>
                  </button>

                  {/* E-mail */}
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('signup_email');
                      setErroMsg(null);
                    }}
                    className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-3 transition shadow-sm cursor-pointer"
                  >
                    <Mail className="w-4 h-4 text-emerald-400" />
                    <span>Criar com E-mail</span>
                  </button>

                  {/* Apple */}
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={handleGoogleAuth}
                    className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-3 transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 fill-current text-white" viewBox="0 0 170 170">
                      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-5.14.23-10.05-1.9-14.74-6.39-3.26-3.04-7.14-7.79-11.64-14.23-6.53-9.37-11.75-20.2-15.66-32.48-3.9-12.28-5.87-24.16-5.87-35.63 0-14.8 3.7-27.27 11.09-37.42 7.4-10.15 17.07-15.36 29.02-15.65 4.36 0 9.4 1.15 15.13 3.44 5.73 2.29 9.4 3.48 11.01 3.56 1.83-.23 5.75-1.49 11.75-3.79 6-2.3 11.09-3.32 15.26-3.06 13.97.83 24.64 5.92 32.02 15.27-12.16 7.4-18.15 17.51-17.97 30.34.19 10.02 4.09 18.49 11.7 25.43 7.62 6.94 16.71 10.95 27.29 12.03-2.36 7.15-5.59 14.86-9.69 23.13zM119.22 31.84c0-7.39 2.66-14.37 7.98-20.94 5.32-6.57 11.83-10.6 19.53-12.09.28 1.16.42 2.26.42 3.3 0 7.39-2.82 14.61-8.47 21.66-5.64 7.04-12.35 11.08-20.12 12.11-.2-.84-.34-2.18-.34-4.04z" />
                    </svg>
                    <span>Criar com Apple</span>
                  </button>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('signin');
                      setErroMsg(null);
                    }}
                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    Já tenho conta
                  </button>
                </div>

                <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                  Ao criar sua conta você concorda com os{' '}
                  <span className="text-emerald-400 hover:underline cursor-pointer">Termos de uso</span> e{' '}
                  <span className="text-emerald-400 hover:underline cursor-pointer">Política de privacidade</span>
                </p>
              </div>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* TELA 2: FORMULÁRIO DE CRIAR CONTA COM E-MAIL (ESTILO KYTE MINIMAL)    */}
            {/* --------------------------------------------------------------------- */}
            {screen === 'signup_email' && (
              <form onSubmit={handleSignUp} className="space-y-4 animate-in fade-in">
                <div className="text-center space-y-1">
                  <h1 className="text-xl font-bold text-slate-100">Criar conta com email</h1>
                </div>

                <div className="space-y-3">
                  {/* Nome */}
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* E-mail com Chips Rápidos de Domínio */}
                  <div className="space-y-2">
                    <input
                      type="email"
                      required
                      placeholder="E-mail"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />

                    {/* Chips de Domínio */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {QUICK_DOMAINS.map((domain) => (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => handleAddDomain(domain)}
                          className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 border border-slate-700/80 transition"
                        >
                          {domain}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Senha */}
                  <div className="space-y-1">
                    <div className="relative">
                      <input
                        type={mostrarSenha ? 'text' : 'password'}
                        placeholder="Senha"
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
                    <span>Criar nova conta</span>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('signin');
                      setErroMsg(null);
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-emerald-400 transition"
                  >
                    Já tenho conta
                  </button>
                </div>
              </form>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* TELA 3: ENTRAR / OPÇÕES DE LOGIN                                      */}
            {/* --------------------------------------------------------------------- */}
            {screen === 'signin' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="text-center space-y-1">
                  <h1 className="text-2xl font-bold text-slate-100">Entrar</h1>
                  <p className="text-xs text-slate-400">Como deseja acessar sua conta?</p>
                </div>

                <div className="space-y-2.5">
                  {/* Google */}
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={handleGoogleAuth}
                    className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-3 transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span>Entrar com Google</span>
                  </button>

                  {/* E-mail */}
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('signin_email');
                      setErroMsg(null);
                    }}
                    className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-3 transition shadow-sm cursor-pointer"
                  >
                    <Mail className="w-4 h-4 text-emerald-400" />
                    <span>Entrar com E-mail</span>
                  </button>

                  {/* Apple */}
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={handleGoogleAuth}
                    className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-3 transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 fill-current text-white" viewBox="0 0 170 170">
                      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-5.14.23-10.05-1.9-14.74-6.39-3.26-3.04-7.14-7.79-11.64-14.23-6.53-9.37-11.75-20.2-15.66-32.48-3.9-12.28-5.87-24.16-5.87-35.63 0-14.8 3.7-27.27 11.09-37.42 7.4-10.15 17.07-15.36 29.02-15.65 4.36 0 9.4 1.15 15.13 3.44 5.73 2.29 9.4 3.48 11.01 3.56 1.83-.23 5.75-1.49 11.75-3.79 6-2.3 11.09-3.32 15.26-3.06 13.97.83 24.64 5.92 32.02 15.27-12.16 7.4-18.15 17.51-17.97 30.34.19 10.02 4.09 18.49 11.7 25.43 7.62 6.94 16.71 10.95 27.29 12.03-2.36 7.15-5.59 14.86-9.69 23.13zM119.22 31.84c0-7.39 2.66-14.37 7.98-20.94 5.32-6.57 11.83-10.6 19.53-12.09.28 1.16.42 2.26.42 3.3 0 7.39-2.82 14.61-8.47 21.66-5.64 7.04-12.35 11.08-20.12 12.11-.2-.84-.34-2.18-.34-4.04z" />
                    </svg>
                    <span>Entrar com Apple</span>
                  </button>

                  {/* Facebook */}
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={handleGoogleAuth}
                    className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-3 transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 fill-[#1877F2]" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    <span>Entrar com Facebook</span>
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

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('welcome');
                      setErroMsg(null);
                    }}
                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    Criar nova conta
                  </button>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------------- */}
            {/* TELA 4: ENTRAR COM E-MAIL                                             */}
            {/* --------------------------------------------------------------------- */}
            {screen === 'signin_email' && (
              <form onSubmit={handleSignIn} className="space-y-4 animate-in fade-in">
                <div className="text-center space-y-1">
                  <h1 className="text-xl font-bold text-slate-100">Entrar com e-mail</h1>
                  <p className="text-xs text-slate-400">Digite seu e-mail para abrir seu PDV</p>
                </div>

                <div className="space-y-3">
                  {/* E-mail */}
                  <div className="space-y-2">
                    <input
                      type="email"
                      required
                      placeholder="E-mail"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />

                    {/* Chips de Domínio */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {QUICK_DOMAINS.map((domain) => (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => handleAddDomain(domain)}
                          className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 border border-slate-700/80 transition"
                        >
                          {domain}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Senha */}
                  <div className="relative">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      placeholder="Senha (opcional)"
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

                <div className="flex items-center justify-between text-xs pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('signin');
                      setErroMsg(null);
                    }}
                    className="text-slate-400 hover:text-slate-300"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScreen('signup_email');
                      setErroMsg(null);
                    }}
                    className="font-bold text-emerald-400 hover:text-emerald-300"
                  >
                    Criar nova conta
                  </button>
                </div>
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
