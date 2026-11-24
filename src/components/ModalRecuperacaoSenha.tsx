import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Smartphone,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { formatarTelefoneInput, normalizarTelefoneComDDI } from '../utils/formatters';
import {
  solicitarTokenRecuperacao,
  validarTokenRecuperacao,
  redefinirSenhaComToken,
} from '../services/recuperacaoSenhaService';

export interface ModalRecuperacaoSenhaProps {
  isOpen: boolean;
  telefoneInicial?: string;
  onClose: () => void;
  onSucesso: (telefoneNormalizado: string) => void;
}

type PassoRecuperacao = 1 | 2 | 3;

function formatarTelefoneParaInput(valor?: string): string {
  if (!valor) return '';
  const texto = valor.trim();
  if (texto.includes('@') && !/@hubi\.(app|internal)$/i.test(texto)) {
    return '';
  }
  const base = texto.includes('@') ? texto.split('@')[0] : texto;
  let digitos = base.replace(/\D/g, '');
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }
  return formatarTelefoneInput(digitos);
}

export const ModalRecuperacaoSenha: React.FC<ModalRecuperacaoSenhaProps> = ({
  isOpen,
  telefoneInicial,
  onClose,
  onSucesso,
}) => {
  const [passo, setPasso] = useState<PassoRecuperacao>(1);
  const [telefone, setTelefone] = useState('');
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [segundosReenvio, setSegundosReenvio] = useState(0);

  const telefoneInputRef = useRef<HTMLInputElement | null>(null);
  const enviarBtnRef = useRef<HTMLButtonElement | null>(null);
  const codigoInputRef = useRef<HTMLInputElement | null>(null);
  const novaSenhaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const preenchido = formatarTelefoneParaInput(telefoneInicial);
    const digitos = preenchido.replace(/\D/g, '');

    setPasso(1);
    setTelefone(preenchido);
    setCodigo('');
    setNovaSenha('');
    setConfirmarSenha('');
    setMostrarNovaSenha(false);
    setMostrarConfirmarSenha(false);
    setCarregando(false);
    setErro(null);
    setInfo(null);
    setSegundosReenvio(0);

    const timer = window.setTimeout(() => {
      if (digitos.length >= 10) {
        enviarBtnRef.current?.focus();
      } else {
        telefoneInputRef.current?.focus();
      }
    }, 30);

    return () => window.clearTimeout(timer);
  }, [isOpen, telefoneInicial]);

  useEffect(() => {
    if (!isOpen || passo !== 2 || segundosReenvio <= 0) return;

    const interval = window.setInterval(() => {
      setSegundosReenvio((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isOpen, passo, segundosReenvio]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !carregando) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, carregando, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      if (passo === 2) {
        codigoInputRef.current?.focus();
      } else if (passo === 3) {
        novaSenhaInputRef.current?.focus();
      }
    }, 30);
    return () => window.clearTimeout(timer);
  }, [isOpen, passo]);

  if (!isOpen) return null;

  const obterTelefoneNormalizadoValido = (): string => {
    const norm = normalizarTelefoneComDDI(telefone);
    if (norm.length < 12 || norm.length > 13 || !norm.startsWith('55')) {
      return '';
    }
    return norm;
  };

  const handleEnviarCodigo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const telNorm = obterTelefoneNormalizadoValido();
    if (!telNorm) {
      setErro('Informe um número de WhatsApp válido com DDD (ex: 85 99999-9999).');
      telefoneInputRef.current?.focus();
      return;
    }

    try {
      setCarregando(true);
      setErro(null);
      setInfo(null);

      const resposta = await solicitarTokenRecuperacao(telNorm);
      if (!resposta.sucesso) {
        setErro(resposta.erro || 'Não foi possível enviar o código no momento.');
        return;
      }

      setInfo(
        resposta.mensagem ||
          'Código de 6 dígitos enviado para o seu WhatsApp! Ele é válido por 10 minutos.'
      );
      setCodigo('');
      setSegundosReenvio(60);
      setPasso(2);
    } finally {
      setCarregando(false);
    }
  };

  const handleReenviarCodigo = async () => {
    if (segundosReenvio > 0 || carregando) return;
    await handleEnviarCodigo();
  };

  const handleValidarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();

    const telNorm = obterTelefoneNormalizadoValido();
    if (!telNorm) {
      setErro('Número de WhatsApp inválido. Volte e verifique o número.');
      return;
    }

    const codigoLimpo = codigo.replace(/\D/g, '');
    if (codigoLimpo.length !== 6) {
      setErro('Digite o código numérico de 6 dígitos recebido no seu WhatsApp.');
      codigoInputRef.current?.focus();
      return;
    }

    try {
      setCarregando(true);
      setErro(null);
      setInfo(null);

      const resposta = await validarTokenRecuperacao(telNorm, codigoLimpo);
      if (!resposta.sucesso) {
        setErro(resposta.erro || 'Código inválido ou expirado. Verifique e tente novamente.');
        return;
      }

      setErro(null);
      setInfo('Código confirmado! Agora defina sua nova senha de acesso.');
      setPasso(3);
    } finally {
      setCarregando(false);
    }
  };

  const handleSalvarNovaSenha = async (e: React.FormEvent) => {
    e.preventDefault();

    const telNorm = obterTelefoneNormalizadoValido();
    if (!telNorm) {
      setErro('Número de WhatsApp inválido.');
      return;
    }

    const codigoLimpo = codigo.replace(/\D/g, '');
    const senhaLimpa = novaSenha.trim();
    const confirmacaoLimpa = confirmarSenha.trim();

    if (senhaLimpa.length < 6) {
      setErro('Sua nova senha precisa ter no mínimo 6 caracteres.');
      novaSenhaInputRef.current?.focus();
      return;
    }

    if (senhaLimpa !== confirmacaoLimpa) {
      setErro('As senhas digitadas não conferem. Verifique e tente novamente.');
      return;
    }

    try {
      setCarregando(true);
      setErro(null);

      const resposta = await redefinirSenhaComToken(telNorm, codigoLimpo, senhaLimpa);
      if (!resposta.sucesso) {
        setErro(resposta.erro || 'Não foi possível redefinir a senha. Tente novamente.');
        return;
      }

      onSucesso(telNorm);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-recuperacao-senha"
    >
      <div className="relative w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 bg-white border-2 border-slate-300 text-black animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          disabled={carregando}
          aria-label="Fechar"
          title="Fechar"
          className="absolute top-4 right-4 p-2 rounded-xl border border-slate-300 bg-slate-100 text-black hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho do Modal */}
        <div className="flex items-start gap-3 pr-8">
          <div className="w-11 h-11 rounded-2xl border border-emerald-400 bg-emerald-100 text-black flex items-center justify-center shrink-0">
            {passo === 1 && <Smartphone className="w-5 h-5" />}
            {passo === 2 && <ShieldCheck className="w-5 h-5" />}
            {passo === 3 && <Lock className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h3 id="titulo-recuperacao-senha" className="text-base font-black leading-snug text-black">
              Recuperar senha via WhatsApp
            </h3>
            <p className="text-xs mt-1 font-semibold text-slate-700">
              {passo === 1 && 'Passo 1 de 3 — Confirme o WhatsApp cadastrado'}
              {passo === 2 && 'Passo 2 de 3 — Digite o código de 6 dígitos'}
              {passo === 3 && 'Passo 3 de 3 — Crie uma nova senha'}
            </p>
          </div>
        </div>

        {/* Alertas de Erro / Sucesso */}
        {erro && (
          <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl flex items-start gap-2.5 text-xs text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="flex-1 font-semibold leading-relaxed">{erro}</span>
          </div>
        )}

        {info && !erro && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-2.5 text-xs text-black">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span className="flex-1 font-semibold leading-relaxed">{info}</span>
          </div>
        )}

        {/* PASSO 1: CONFIRMAR WHATSAPP */}
        {passo === 1 && (
          <form onSubmit={handleEnviarCodigo} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="recuperacao-whatsapp" className="block text-xs font-bold text-black">
                Número do WhatsApp com DDD
              </label>
              <input
                ref={telefoneInputRef}
                id="recuperacao-whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(85) 99999-9999"
                value={telefone}
                onChange={(e) => {
                  setTelefone(formatarTelefoneInput(e.target.value));
                  if (erro) setErro(null);
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-semibold text-black placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition"
              />
              <p className="text-[11px] font-medium text-slate-600">
                Enviaremos um código numérico de 6 dígitos diretamente no seu WhatsApp.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                ref={enviarBtnRef}
                type="submit"
                disabled={carregando}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 border border-emerald-400 text-black font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {carregando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enviando código...</span>
                  </>
                ) : (
                  <span>Enviar código via WhatsApp</span>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={carregando}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black font-bold text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* PASSO 2: DIGITAR TOKEN DE 6 DÍGITOS */}
        {passo === 2 && (
          <form onSubmit={handleValidarCodigo} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="recuperacao-codigo" className="block text-xs font-bold text-black">
                Código de 6 dígitos enviado para {telefone}
              </label>
              <input
                ref={codigoInputRef}
                id="recuperacao-codigo"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={codigo}
                onChange={(e) => {
                  const apenasDigitos = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCodigo(apenasDigitos);
                  if (erro) setErro(null);
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-center text-xl font-black tracking-[0.45em] text-black placeholder:text-slate-300 placeholder:tracking-[0.35em] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition"
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setErro(null);
                  setInfo(null);
                  setPasso(1);
                }}
                disabled={carregando}
                className="font-bold text-slate-700 hover:text-black underline underline-offset-2 cursor-pointer disabled:opacity-50"
              >
                Alterar número
              </button>

              <button
                type="button"
                onClick={handleReenviarCodigo}
                disabled={segundosReenvio > 0 || carregando}
                className={`inline-flex items-center gap-1.5 font-bold transition ${
                  segundosReenvio > 0 || carregando
                    ? 'text-slate-500 cursor-not-allowed'
                    : 'text-black hover:underline cursor-pointer'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {segundosReenvio > 0
                    ? `Reenviar código (${segundosReenvio}s)`
                    : 'Reenviar código'}
                </span>
              </button>
            </div>

            <button
              type="submit"
              disabled={carregando || codigo.length !== 6}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 border border-emerald-400 text-black font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {carregando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando código...</span>
                </>
              ) : (
                <span>Validar código</span>
              )}
            </button>
          </form>
        )}

        {/* PASSO 3: REDEFINIR SENHA */}
        {passo === 3 && (
          <form onSubmit={handleSalvarNovaSenha} className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="recuperacao-nova-senha" className="block text-xs font-bold text-black">
                  Nova senha
                </label>
                <div className="relative">
                  <input
                    ref={novaSenhaInputRef}
                    id="recuperacao-nova-senha"
                    type={mostrarNovaSenha ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    value={novaSenha}
                    onChange={(e) => {
                      setNovaSenha(e.target.value);
                      if (erro) setErro(null);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 pr-10 text-sm font-semibold text-black placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarNovaSenha((prev) => !prev)}
                    aria-label={mostrarNovaSenha ? 'Ocultar nova senha' : 'Exibir nova senha'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-black cursor-pointer"
                  >
                    {mostrarNovaSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="recuperacao-confirmar-senha"
                  className="block text-xs font-bold text-black"
                >
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <input
                    id="recuperacao-confirmar-senha"
                    type={mostrarConfirmarSenha ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Repita a nova senha"
                    value={confirmarSenha}
                    onChange={(e) => {
                      setConfirmarSenha(e.target.value);
                      if (erro) setErro(null);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 pr-10 text-sm font-semibold text-black placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarConfirmarSenha((prev) => !prev)}
                    aria-label={
                      mostrarConfirmarSenha
                        ? 'Ocultar confirmação de senha'
                        : 'Exibir confirmação de senha'
                    }
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-black cursor-pointer"
                  >
                    {mostrarConfirmarSenha ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 border border-emerald-400 text-black font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {carregando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando nova senha...</span>
                </>
              ) : (
                <span>Salvar nova senha</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
