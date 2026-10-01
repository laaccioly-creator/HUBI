import React, { useState } from 'react';
import {
  X,
  Smartphone,
  MapPin,
  Lock,
  User,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Navigation,
  ExternalLink,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ShoppingBag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Cliente } from '../types';
import { ClienteCatalogoService, DadosCadastroIdentificacao, DadosCadastroEndereco } from '../services/clienteCatalogoService';

interface ModalOnboardingClienteProps {
  isOpen: boolean;
  onClose?: () => void;
  lojaId: string;
  nomeLoja?: string;
  corTema?: string;
  onSucesso: (cliente: Cliente) => void;
  motivoAbertura?: 'carrinho' | 'pedidos' | 'favoritos' | 'geral';
  bloqueioObrigatorio?: boolean;
}

type ModoOnboarding = 'boas_vindas' | 'passo1_identificacao' | 'passo2_endereco' | 'login';

export const ModalOnboardingCliente: React.FC<ModalOnboardingClienteProps> = ({
  isOpen,
  onClose,
  lojaId,
  nomeLoja = 'HUBI',
  corTema = '#10B981',
  onSucesso,
  motivoAbertura = 'geral',
  bloqueioObrigatorio = false
}) => {
  const [modo, setModo] = useState<ModoOnboarding>('boas_vindas');

  // Dados do Passo 1
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Dados do Passo 2 (Endereço Principal)
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();

  // Dados de Login
  const [loginTelefone, setLoginTelefone] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  const [mostrarLoginSenha, setMostrarLoginSenha] = useState(false);

  // Estados de Carregamento & Erro
  const [carregando, setCarregando] = useState(false);
  const [carregandoCep, setCarregandoCep] = useState(false);
  const [carregandoGeoloc, setCarregandoGeoloc] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!isOpen) return null;

  // Formatação dinâmica do Celular / WhatsApp: (00) 00000-0000
  const formatarTelefone = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 11);
    if (limpo.length <= 2) return limpo;
    if (limpo.length <= 6) return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
    if (limpo.length <= 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
  };

  // Formatação de CEP: 00000-000
  const formatarCep = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 8);
    if (limpo.length <= 5) return limpo;
    return `${limpo.slice(0, 5)}-${limpo.slice(5, 8)}`;
  };

  // Consulta automática de CEP via ViaCEP
  const buscarCep = async (cepParaBuscar: string) => {
    const limpo = cepParaBuscar.replace(/\D/g, '');
    if (limpo.length !== 8) return;

    try {
      setCarregandoCep(true);
      setErro(null);
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();

      if (data.erro) {
        setErro('CEP não encontrado nos Correios. Preencha o endereço manualmente.');
        return;
      }

      if (data.logradouro) setLogradouro(data.logradouro);
      if (data.bairro) setBairro(data.bairro);
      if (data.localidade) setCidade(data.localidade);
      if (data.uf) setUf(data.uf.toUpperCase());
    } catch {
      setErro('Não foi possível consultar o CEP automaticamente. Você pode preencher manualmente.');
    } finally {
      setCarregandoCep(false);
    }
  };

  // Obter localização atual via GPS
  const usarLocalizacaoAtual = () => {
    if (!navigator.geolocation) {
      setErro('Geolocalização não suportada pelo seu dispositivo.');
      return;
    }

    setCarregandoGeoloc(true);
    setErro(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const latitude = pos.coords.latitude;
          const longitude = pos.coords.longitude;
          setLat(latitude);
          setLng(longitude);

          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
            {
              headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' }
            }
          );
          const data = await res.json();

          if (data && data.address) {
            const addr = data.address;
            const logr = addr.road || addr.street || addr.pedestrian || addr.footway || '';
            const num = addr.house_number || '';
            const b = addr.suburb || addr.neighbourhood || addr.city_district || '';
            const cid = addr.city || addr.town || addr.municipality || addr.village || '';
            const est = addr['ISO3166-2-lvl4']?.split('-')[1] || addr.state_code || addr.state || '';
            const rawCep = (addr.postcode || '').replace(/\D/g, '').slice(0, 8);

            if (logr) setLogradouro(logr);
            if (num) setNumero(num);
            if (b) setBairro(b);
            if (cid) setCidade(cid);
            if (est) setUf(est.toUpperCase());
            if (rawCep && rawCep.length === 8) {
              setCep(formatarCep(rawCep));
            }
          }
        } catch {
          setErro('Não foi possível identificar o endereço pelo GPS.');
        } finally {
          setCarregandoGeoloc(false);
        }
      },
      () => {
        setErro('Permissão de GPS negada ou indisponível.');
        setCarregandoGeoloc(false);
      },
      { timeout: 12000, enableHighAccuracy: true }
    );
  };

  // Login com Google via Supabase OAuth
  const handleLoginGoogle = async () => {
    try {
      setCarregando(true);
      setErro(null);
      const redirectToUrl = `${window.location.origin}${window.location.pathname}`;
      const { error: authErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectToUrl
        }
      });
      if (authErr) throw authErr;
    } catch (e: any) {
      setErro(e.message || 'Erro ao conectar com Google.');
      setCarregando(false);
    }
  };

  // Login com Apple via Supabase OAuth
  const handleLoginApple = async () => {
    try {
      setCarregando(true);
      setErro(null);
      const redirectToUrl = `${window.location.origin}${window.location.pathname}`;
      const { error: authErr } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectToUrl
        }
      });
      if (authErr) throw authErr;
    } catch (e: any) {
      setErro(e.message || 'Erro ao conectar com Apple.');
      setCarregando(false);
    }
  };

  // Avançar do Passo 1 para o Passo 2
  const handleAvancarPasso1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!nome.trim()) {
      setErro('Por favor, informe seu nome completo.');
      return;
    }
    const telDigitos = telefone.replace(/\D/g, '');
    if (telDigitos.length < 10) {
      setErro('Informe um celular válido com DDD (mínimo 10 dígitos).');
      return;
    }
    if (!senha || senha.length < 6) {
      setErro('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    setModo('passo2_endereco');
  };

  // Submeter cadastro completo (Passo 2)
  const handleSubmeterCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      setErro('Informe um CEP válido com 8 dígitos.');
      return;
    }
    if (!logradouro.trim() || !numero.trim() || !bairro.trim() || !cidade.trim() || !uf.trim()) {
      setErro('Preencha todos os campos obrigatórios do endereço de entrega.');
      return;
    }

    try {
      setCarregando(true);
      const dadosIdentificacao: DadosCadastroIdentificacao = {
        nome: nome.trim(),
        telefone: telefone.replace(/\D/g, ''),
        senha: senha.trim()
      };

      const dadosEndereco: DadosCadastroEndereco = {
        cep: cepLimpo,
        logradouro: logradouro.trim(),
        numero: numero.trim(),
        complemento: complemento.trim() || undefined,
        bairro: bairro.trim(),
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        latitude: lat,
        longitude: lng
      };

      const res = await ClienteCatalogoService.cadastrarCliente(lojaId, dadosIdentificacao, dadosEndereco);

      if (!res.sucesso || !res.cliente) {
        setErro(res.erro || 'Falha ao registrar cadastro.');
        return;
      }

      onSucesso(res.cliente);
      onClose?.();
    } catch (err: any) {
      setErro(err.message || 'Erro inesperado ao registrar cadastro.');
    } finally {
      setCarregando(false);
    }
  };

  // Submeter Login com Telefone + Senha
  const handleSubmeterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const telLimpo = loginTelefone.replace(/\D/g, '');
    if (telLimpo.length < 10) {
      setErro('Informe seu número de celular com DDD.');
      return;
    }
    if (!loginSenha) {
      setErro('Informe sua senha.');
      return;
    }

    try {
      setCarregando(true);
      const res = await ClienteCatalogoService.autenticarPorTelefone(lojaId, telLimpo, loginSenha);

      if (!res.sucesso || !res.cliente) {
        setErro(res.erro || 'Telefone ou senha inválidos.');
        return;
      }

      onSucesso(res.cliente);
      onClose?.();
    } catch (err: any) {
      setErro(err.message || 'Erro ao realizar login.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in ${
      bloqueioObrigatorio ? 'bg-slate-950' : 'bg-black/80 backdrop-blur-sm'
    }`}>
      <div className="bg-slate-900 border-2 border-slate-700/80 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95">
        {/* Cabeçalho do Modal */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            {modo !== 'boas_vindas' && (
              <button
                type="button"
                onClick={() => {
                  setErro(null);
                  if (modo === 'passo2_endereco') setModo('passo1_identificacao');
                  else setModo('boas_vindas');
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Voltar"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="font-extrabold text-sm sm:text-base text-slate-100 flex items-center gap-2">
                {modo === 'boas_vindas' && 'Área do Cliente'}
                {modo === 'login' && 'Entrar na Minha Conta'}
                {modo === 'passo1_identificacao' && 'Criar Conta • Identificação'}
                {modo === 'passo2_endereco' && 'Criar Conta • Endereço'}
              </h2>
              <p className="text-[11px] text-slate-400 truncate max-w-[240px] sm:max-w-xs">
                {nomeLoja}
              </p>
            </div>
          </div>

          {!bloqueioObrigatorio && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Mensagem de contextualização para o usuário */}
        {motivoAbertura !== 'geral' && modo === 'boas_vindas' && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-xs text-emerald-300 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>
              {motivoAbertura === 'carrinho' && 'Entre ou cadastre-se para concluir seu pedido com segurança!'}
              {motivoAbertura === 'favoritos' && 'Entre ou crie sua conta para salvar seus produtos favoritos!'}
              {motivoAbertura === 'pedidos' && 'Entre para visualizar seu histórico e rastreamento de pedidos!'}
            </span>
          </div>
        )}

        {/* Mensagem de Erro Geral */}
        {erro && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        {/* CORPO DO MODAL */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* ============================================================ */}
          {/* TELA DE BOAS-VINDAS (OPÇÕES DE CRIAÇÃO / LOGIN)              */}
          {/* ============================================================ */}
          {modo === 'boas_vindas' && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <div
                  className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white mb-3 shadow-lg"
                  style={{ backgroundColor: corTema }}
                >
                  <Smartphone className="w-7 h-7" />
                </div>
                <h3 className="font-extrabold text-slate-100 text-lg">Bem-vindo(a)!</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Acesse sua conta para favoritar produtos, acompanhar entregas e agilizar seus pedidos.
                </p>
              </div>

              {/* Botão de Destaque: Criar com Celular */}
              <button
                type="button"
                onClick={() => {
                  setErro(null);
                  setModo('passo1_identificacao');
                }}
                className="w-full py-3.5 px-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-3 shadow-lg transition hover:brightness-110 active:scale-[0.99] cursor-pointer"
                style={{ backgroundColor: corTema }}
              >
                <Smartphone className="w-5 h-5 shrink-0" />
                <span>Criar com Celular</span>
              </button>

              {/* Divisor Visual */}
              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-slate-800 w-full"></div>
                <span className="bg-slate-900 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  ou continue com
                </span>
              </div>

              {/* Botão Google */}
              <button
                type="button"
                onClick={handleLoginGoogle}
                disabled={carregando}
                className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700/80 font-bold text-xs sm:text-sm flex items-center justify-center gap-3 transition cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Criar com Google</span>
              </button>

              {/* Botão Apple */}
              <button
                type="button"
                onClick={handleLoginApple}
                disabled={carregando}
                className="w-full py-3 px-4 rounded-2xl bg-black hover:bg-neutral-900 text-white border border-neutral-700/80 font-bold text-xs sm:text-sm flex items-center justify-center gap-3 transition cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 170 170">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.69-7.85-12.01-14.42-6.53-9.9-11.66-21.33-15.39-34.29-3.73-12.96-5.6-25.29-5.6-36.99 0-15.39 3.86-28.09 11.59-38.1 7.72-10.02 17.51-15.18 29.36-15.48 4.9 0 10.23 1.25 16 3.75 5.77 2.5 9.77 3.86 12.01 4.1 1.74-.24 5.86-1.66 12.37-4.24 6.51-2.58 11.75-3.75 15.72-3.51 12.39.63 22.45 5.17 30.18 13.62-10.88 6.53-16.2 15.54-15.96 27.02.24 9.14 3.79 16.89 10.65 23.26 6.86 6.37 14.86 10.12 24 11.24-2.18 6.74-4.85 13.27-8.01 19.59zM119.22 33.15c0-7.39 2.67-14.37 8-20.93 5.34-6.56 12-10.87 19.98-12.92.54 1.74.82 3.42.82 5.05 0 7.39-2.73 14.42-8.19 21.09-5.46 6.67-12.28 10.88-20.46 12.63-.07-1.54-.15-3.18-.15-4.92z" />
                </svg>
                <span>Criar com Apple</span>
              </button>

              {/* Link de Entrada: Já tenho conta */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setErro(null);
                    setModo('login');
                  }}
                  className="text-xs text-slate-300 hover:text-emerald-400 font-semibold underline underline-offset-4 transition cursor-pointer"
                >
                  Já tenho conta? Fazer login
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TELA DE LOGIN (TELEFONE + SENHA)                              */}
          {/* ============================================================ */}
          {modo === 'login' && (
            <form onSubmit={handleSubmeterLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Celular / WhatsApp
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    required
                    placeholder="(00) 00000-0000"
                    value={loginTelefone}
                    onChange={(e) => setLoginTelefone(formatarTelefone(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Sua Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={mostrarLoginSenha ? 'text' : 'password'}
                    required
                    placeholder="Digite sua senha"
                    value={loginSenha}
                    onChange={(e) => setLoginSenha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarLoginSenha(!mostrarLoginSenha)}
                    className="p-1 text-slate-400 hover:text-slate-200 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {mostrarLoginSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="w-full py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition hover:brightness-110 active:scale-[0.99] cursor-pointer"
                style={{ backgroundColor: corTema }}
              >
                {carregando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <span>Acessar Minha Conta</span>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setErro(null);
                    setModo('boas_vindas');
                  }}
                  className="text-xs text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                >
                  Ainda não tem conta? <strong className="text-emerald-400 font-bold">Cadastre-se</strong>
                </button>
              </div>
            </form>
          )}

          {/* ============================================================ */}
          {/* PASSO 1: IDENTIFICAÇÃO (NOME, CELULAR, SENHA)                */}
          {/* ============================================================ */}
          {modo === 'passo1_identificacao' && (
            <form onSubmit={handleAvancarPasso1} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nome Completo <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="Como você prefere ser chamado(a)?"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Celular / WhatsApp <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    required
                    placeholder="(00) 00000-0000"
                    value={telefone}
                    onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Usado para atualizações do seu pedido e entrega.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Crie sua Senha <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Mínimo de 6 caracteres"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    className="p-1 text-slate-400 hover:text-slate-200 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition hover:brightness-110 active:scale-[0.99] cursor-pointer mt-2"
                style={{ backgroundColor: corTema }}
              >
                <span>Avançar para Endereço</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ============================================================ */}
          {/* PASSO 2: ENDEREÇO PRINCIPAL MANDATÓRIO                       */}
          {/* ============================================================ */}
          {modo === 'passo2_endereco' && (
            <form onSubmit={handleSubmeterCadastro} className="space-y-3.5">
              {/* CEP com Botões de Apoio */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    CEP de Entrega <span className="text-rose-400">*</span>
                  </label>
                  <a
                    href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                  >
                    <span>Não sei meu CEP</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      placeholder="00000-000"
                      value={cep}
                      onChange={(e) => {
                        const formatado = formatarCep(e.target.value);
                        setCep(formatado);
                        if (formatado.replace(/\D/g, '').length === 8) {
                          buscarCep(formatado);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                    />
                    {carregandoCep && (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={usarLocalizacaoAtual}
                    disabled={carregandoGeoloc}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    title="Preencher com GPS atual"
                  >
                    {carregandoGeoloc ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    ) : (
                      <Navigation className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="hidden sm:inline">GPS</span>
                  </button>
                </div>
              </div>

              {/* Logradouro (Rua / Avenida) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Logradouro (Rua, Av.) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Av. Paulista"
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Número e Complemento */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Número <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="123 ou S/N"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Complemento <span className="text-slate-500">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Apto, Bloco..."
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>

              {/* Bairro, Cidade e UF */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Bairro <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Bairro"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Cidade <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Cidade"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    UF <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="UF"
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium text-center uppercase"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setModo('passo1_identificacao')}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs transition cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={carregando}
                  className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition hover:brightness-110 active:scale-[0.99] cursor-pointer"
                  style={{ backgroundColor: corTema }}
                >
                  {carregando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando Cadastro...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Concluir Cadastro</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
