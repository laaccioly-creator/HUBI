import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Search,
  Sparkles,
  HelpCircle,
  Newspaper,
  ChevronRight,
  ArrowLeft,
  Bot,
  User,
  Loader2,
  CheckCircle2,
  BookOpen,
  Printer,
  FileText,
  Users,
  CreditCard,
  ExternalLink,
  Gift,
  Mic,
  MicOff,
  Volume2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TUTORIAIS_HUBI, ArtigoTutorial, responderDuvidaSuporteIA } from '../services/tutoriaisHubiService';

type AbaChat = 'inicio' | 'mensagens' | 'ajuda' | 'noticias';

interface MensagemChat {
  id: string;
  remetente: 'usuario' | 'ia';
  texto: string;
  data: Date;
}

export const ChatAjudaIA: React.FC = () => {
  const { loja, usuario } = useAuth();
  const [aberto, setAberto] = useState<boolean>(false);
  const [abaAtiva, setAbaAtiva] = useState<AbaChat>('inicio');
  const [buscaAjuda, setBuscaAjuda] = useState<string>('');
  const [artigoSelecionado, setArtigoSelecionado] = useState<ArtigoTutorial | null>(null);

  // Chat com IA
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [inputMensagem, setInputMensagem] = useState<string>('');
  const [enviando, setEnviando] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reconhecimento de Voz (Microfone - Mobile & Desktop)
  const [escutandoVoz, setEscutandoVoz] = useState<boolean>(false);
  const [suporteVoz, setSuporteVoz] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  const primeiroNome = usuario?.nome_completo ? usuario.nome_completo.split(' ')[0] : 'Lojista';

  // Inicializar Web Speech API (Microfone)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSuporteVoz(true);
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
          setEscutandoVoz(true);
        };

        recognition.onresult = (event: any) => {
          let transcricao = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcricao += event.results[i][0].transcript;
          }
          if (transcricao.trim()) {
            setInputMensagem(transcricao);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Erro no reconhecimento de voz:', event.error);
          setEscutandoVoz(false);
        };

        recognition.onend = () => {
          setEscutandoVoz(false);
        };

        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Falha ao instanciar SpeechRecognition:', err);
      }
    }
  }, []);

  const alternarGravacaoVoz = () => {
    if (!recognitionRef.current) {
      alert('O reconhecimento de voz não é suportado pelo seu navegador atual. Você pode digitar sua pergunta normalmente.');
      return;
    }

    if (escutandoVoz) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setEscutandoVoz(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Erro ao iniciar escuta do microfone:', e);
      }
    }
  };

  // Mensagem inicial de boas-vindas
  useEffect(() => {
    if (mensagens.length === 0) {
      setMensagens([
        {
          id: 'welcome-1',
          remetente: 'ia',
          texto: `Olá, **${primeiroNome}**! 👋 Sou a **Rubi**, especialista em suporte do HUBI.\n\nVocê pode me fazer perguntas digitando ou **falando pelo microfone** 🎙️!\n\nPosso te orientar sobre impressoras térmicas, vendas, relatórios, fiado, estoque, pedidos ou qualquer funcionalidade do sistema.`,
          data: new Date()
        }
      ]);
    }
  }, [primeiroNome]);

  useEffect(() => {
    if (abaAtiva === 'mensagens') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens, abaAtiva]);

  const handleEnviarMensagem = async (textoDireto?: string) => {
    if (escutandoVoz && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setEscutandoVoz(false);
    }

    const texto = (textoDireto || inputMensagem).trim();
    if (!texto || enviando) return;

    const novaMsgUser: MensagemChat = {
      id: Date.now().toString(),
      remetente: 'usuario',
      texto,
      data: new Date()
    };

    setMensagens((prev) => [...prev, novaMsgUser]);
    setInputMensagem('');
    setEnviando(true);
    setAbaAtiva('mensagens');

    try {
      const respostaIA = await responderDuvidaSuporteIA(texto, usuario, loja);
      const novaMsgIA: MensagemChat = {
        id: (Date.now() + 1).toString(),
        remetente: 'ia',
        texto: respostaIA,
        data: new Date()
      };
      setMensagens((prev) => [...prev, novaMsgIA]);
    } catch (err) {
      setMensagens((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          remetente: 'ia',
          texto: 'Desculpe, tive uma instabilidade momentânea ao consultar a IA. Por favor, tente novamente ou confira os artigos na aba Ajuda.',
          data: new Date()
        }
      ]);
    } finally {
      setEnviando(false);
    }
  };

  const tutoriaisFiltrados = TUTORIAIS_HUBI.filter((t) => {
    if (!buscaAjuda) return true;
    const b = buscaAjuda.toLowerCase();
    return (
      t.titulo.toLowerCase().includes(b) ||
      t.resumo.toLowerCase().includes(b) ||
      t.tags.some((tag) => tag.toLowerCase().includes(b))
    );
  });

  // Posição arrastável do botão da Rubi IA (Drag and Drop)
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(() => {
    try {
      const salvo = localStorage.getItem('hubi_rubi_ia_pos');
      if (salvo) return JSON.parse(salvo);
    } catch {}
    return null;
  });

  const arrastandoRef = useRef<boolean>(false);
  const posInicialMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posInicialBtnRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const houveArrastoRef = useRef<boolean>(false);

  // Iniciar Arrastar (Mouse & Touch)
  const iniciarArrasto = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const btnEl = e.currentTarget as HTMLElement;
    const rect = btnEl.getBoundingClientRect();

    arrastandoRef.current = true;
    houveArrastoRef.current = false;
    posInicialMouseRef.current = { x: clientX, y: clientY };
    posInicialBtnRef.current = { x: rect.left, y: rect.top };

    const emMovimento = (moveEvent: MouseEvent | TouchEvent) => {
      if (!arrastandoRef.current) return;
      const curX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const curY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const deltaX = curX - posInicialMouseRef.current.x;
      const deltaY = curY - posInicialMouseRef.current.y;

      if (Math.hypot(deltaX, deltaY) > 6) {
        houveArrastoRef.current = true;
      }

      const novoX = Math.max(10, Math.min(window.innerWidth - 65, posInicialBtnRef.current.x + deltaX));
      const novoY = Math.max(10, Math.min(window.innerHeight - 65, posInicialBtnRef.current.y + deltaY));

      setPosicao({ x: novoX, y: novoY });
    };

    const finalizarArrasto = () => {
      arrastandoRef.current = false;
      window.removeEventListener('mousemove', emMovimento);
      window.removeEventListener('mouseup', finalizarArrasto);
      window.removeEventListener('touchmove', emMovimento);
      window.removeEventListener('touchend', finalizarArrasto);

      setPosicao((posAtual) => {
        if (posAtual) {
          try {
            localStorage.setItem('hubi_rubi_ia_pos', JSON.stringify(posAtual));
          } catch {}
        }
        return posAtual;
      });
    };

    window.addEventListener('mousemove', emMovimento);
    window.addEventListener('mouseup', finalizarArrasto);
    window.addEventListener('touchmove', emMovimento, { passive: true });
    window.addEventListener('touchend', finalizarArrasto);
  };

  const handleClickBotao = () => {
    if (!houveArrastoRef.current) {
      setAberto((prev) => !prev);
    }
  };

  return (
    <>
      {/* BOTÃO FLUTUANTE DE AJUDA COM IA - ARRASTÁVEL LIVREMENTE PELA TELA */}
      <div
        style={
          posicao
            ? { left: `${posicao.x}px`, top: `${posicao.y}px`, bottom: 'auto', right: 'auto' }
            : {}
        }
        className={`${
          posicao ? 'fixed' : 'fixed bottom-20 right-4 md:bottom-6 md:right-6'
        } z-40 animate-in fade-in duration-200 select-none`}
      >
        <button
          type="button"
          onMouseDown={iniciarArrasto}
          onTouchStart={iniciarArrasto}
          onClick={handleClickBotao}
          className="relative w-13 h-13 md:w-14 md:h-14 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing border-2 border-emerald-300/40"
          title="Rubi IA • Clique para abrir ou arraste para qualquer lugar da tela"
        >
          {aberto ? (
            <X className="w-6 h-6 pointer-events-none" />
          ) : (
            <div className="relative pointer-events-none">
              <MessageCircle className="w-7 h-7 fill-current text-white" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full animate-ping"></span>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-slate-900 flex items-center justify-center">
                <Sparkles className="w-2 h-2 text-slate-950" />
              </span>
            </div>
          )}
        </button>
      </div>

      {/* JANELA / WIDGET DE AJUDA & SUPORTE IA (RESPONSIVO PARA DESKTOP E MOBILE) */}
      {aberto && (
        <div className="fixed bottom-0 md:bottom-24 right-0 md:right-6 z-50 w-full md:w-[420px] max-w-full h-[90vh] md:h-[620px] max-h-[92vh] bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 md:zoom-in-95 duration-200 select-none text-slate-800 md:text-slate-100">
          {/* HEADER DO WIDGET */}
          <div className="p-4 bg-white md:bg-gradient-to-r md:from-slate-900 md:via-slate-800 md:to-slate-900 border-b border-slate-200 md:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 md:text-emerald-400 flex items-center justify-center font-black text-sm">
                HB
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 md:text-slate-100 flex items-center gap-1.5">
                  <span>Rubi IA • Suporte Oficial</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                </h3>
                <span className="text-[10px] text-slate-500 md:text-slate-400">Atendimento por Voz e Texto</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAberto(false)}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 md:hover:text-white hover:bg-slate-100 md:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* INDICADOR VISUAL DE GRAVAÇÃO DE VOZ QUANDO ATIVO */}
          {escutandoVoz && (
            <div className="bg-rose-950/80 border-b border-rose-500/30 px-4 py-2 flex items-center justify-between text-xs text-rose-300 animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                <span className="font-bold">Ouvindo você... Fale sua dúvida agora!</span>
              </div>
              <button
                type="button"
                onClick={alternarGravacaoVoz}
                className="text-[10px] underline font-bold text-rose-200"
              >
                Concluir fala
              </button>
            </div>
          )}

          {/* CONTEÚDO DA ABA SELECIONADA */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ABA 1: INÍCIO (TELA009) */}
            {abaAtiva === 'inicio' && (
              <div className="space-y-4 animate-in fade-in">
                {/* Saudação com Destaque */}
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-100 flex items-center gap-1.5">
                    <span>Olá {primeiroNome.toUpperCase()}</span>
                    <span>👋</span>
                  </h3>
                  <p className="text-base font-bold text-slate-200">Como podemos ajudar?</p>
                </div>

                {/* Card de Envio Rápido de Mensagem com Microfone */}
                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2 shadow-inner">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={escutandoVoz ? 'Ouvindo sua voz...' : 'Envie uma mensagem ou fale...'}
                      value={inputMensagem}
                      onChange={(e) => setInputMensagem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEnviarMensagem();
                      }}
                      className="flex-1 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                    />

                    {/* Botão de Microfone de Voz */}
                    {suporteVoz && (
                      <button
                        type="button"
                        onClick={alternarGravacaoVoz}
                        className={`p-2 rounded-xl transition cursor-pointer ${
                          escutandoVoz
                            ? 'bg-rose-600 text-white animate-bounce shadow-lg shadow-rose-600/40'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400'
                        }`}
                        title={escutandoVoz ? 'Parar de escutar' : 'Falar por voz pelo microfone'}
                      >
                        {escutandoVoz ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleEnviarMensagem()}
                      disabled={!inputMensagem.trim()}
                      className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Banner de Dica / Novidade */}
                <div className="p-3.5 bg-gradient-to-br from-indigo-950/40 via-purple-950/30 to-slate-950 rounded-2xl border border-indigo-500/20 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0">
                    <Gift className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <h4 className="text-xs font-bold text-slate-100">Atendimento Inteligente por Voz</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Toque no ícone do microfone para fazer qualquer pergunta sobre o sistema por voz enquanto atende no balcão.
                    </p>
                  </div>
                </div>

                {/* Seção "Qual é a sua dúvida?" com Tutoriais */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 block">Qual é a sua dúvida?</span>

                  <div className="space-y-1.5">
                    {TUTORIAIS_HUBI.slice(0, 5).map((tutorial) => (
                      <button
                        key={tutorial.id}
                        type="button"
                        onClick={() => {
                          setArtigoSelecionado(tutorial);
                          setAbaAtiva('ajuda');
                        }}
                        className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 flex items-center justify-between text-left transition group cursor-pointer"
                      >
                        <span className="text-xs text-slate-300 group-hover:text-emerald-400 font-medium truncate pr-2">
                          {tutorial.titulo}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2: MENSAGENS (CHAT COM IA RUBI) */}
            {abaAtiva === 'mensagens' && (
              <div className="flex flex-col h-full space-y-3 animate-in fade-in">
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {mensagens.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${msg.remetente === 'usuario' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.remetente === 'ia' && (
                        <div className="w-6 h-6 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div
                        className={`p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed whitespace-pre-wrap ${
                          msg.remetente === 'usuario'
                            ? 'bg-emerald-600 text-white rounded-br-none'
                            : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm'
                        }`}
                      >
                        {msg.texto}
                      </div>
                    </div>
                  ))}
                  {enviando && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 italic pl-8">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Rubi está pensando na resposta...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input de Mensagem com Microfone */}
                <div className="p-2 bg-slate-950 rounded-2xl border border-slate-800 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={escutandoVoz ? 'Ouvindo sua voz...' : 'Pergunte ou fale à IA...'}
                    value={inputMensagem}
                    onChange={(e) => setInputMensagem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEnviarMensagem();
                    }}
                    className="flex-1 bg-transparent px-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  />

                  {/* Microfone de Voz */}
                  {suporteVoz && (
                    <button
                      type="button"
                      onClick={alternarGravacaoVoz}
                      className={`p-2 rounded-xl transition cursor-pointer ${
                        escutandoVoz
                          ? 'bg-rose-600 text-white animate-bounce shadow-lg shadow-rose-600/40'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400'
                      }`}
                      title={escutandoVoz ? 'Parar gravação' : 'Perguntar por voz'}
                    >
                      {escutandoVoz ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleEnviarMensagem()}
                    disabled={!inputMensagem.trim() || enviando}
                    className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ABA 3: AJUDA / TUTORIAIS COMPLETOS */}
            {abaAtiva === 'ajuda' && (
              <div className="space-y-3 animate-in fade-in">
                {artigoSelecionado ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setArtigoSelecionado(null)}
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline font-bold"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar aos tutoriais</span>
                    </button>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                      <h4 className="text-sm font-bold text-slate-100">{artigoSelecionado.titulo}</h4>
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                        {artigoSelecionado.conteudo}
                      </p>

                      <div className="pt-2 border-t border-slate-800 space-y-1.5">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                          Passo a Passo
                        </span>
                        <ul className="space-y-1 text-xs text-slate-400 list-disc list-inside">
                          {artigoSelecionado.passos.map((p, idx) => (
                            <li key={idx} className="leading-tight">
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleEnviarMensagem(`Como funciona o tutorial: ${artigoSelecionado.titulo}?`)}
                        className="w-full py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Tirar dúvidas sobre este tópico com a IA</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Campo de Busca nos Tutoriais */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar dúvidas e tutoriais..."
                        value={buscaAjuda}
                        onChange={(e) => setBuscaAjuda(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-2">
                      {tutoriaisFiltrados.map((tutorial) => (
                        <button
                          key={tutorial.id}
                          type="button"
                          onClick={() => setArtigoSelecionado(tutorial)}
                          className="w-full p-3 rounded-2xl bg-slate-950/80 hover:bg-slate-800/90 border border-slate-800 flex flex-col text-left transition group cursor-pointer space-y-1"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400 truncate">
                              {tutorial.titulo}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {tutorial.resumo}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA 4: NOTÍCIAS / NOVIDADES */}
            {abaAtiva === 'noticias' && (
              <div className="space-y-3 animate-in fade-in">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                      Nova Versão
                    </span>
                    <span className="text-[10px] text-slate-500">Hoje</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-100">Suporte por Voz & Visão Detalhada de Pedidos</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Agora você pode conversar com a IA do HUBI por voz diretamente no celular ou computador, além de contar com a nova visão detalhada de pedidos e histórico de vendas!
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* BARRA DE NAVEGAÇÃO INFERIOR DO WIDGET (TELA009) */}
          <div className="p-2 border-t border-slate-200 md:border-slate-800 bg-white md:bg-slate-950 grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => {
                setAbaAtiva('inicio');
                setArtigoSelecionado(null);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
                abaAtiva === 'inicio' ? 'bg-emerald-50 md:bg-emerald-500/15 text-emerald-600 md:text-emerald-400 font-bold' : 'text-slate-500 md:text-slate-400 hover:text-slate-800 md:hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">Início</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAbaAtiva('mensagens');
                setArtigoSelecionado(null);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
                abaAtiva === 'mensagens' ? 'bg-emerald-50 md:bg-emerald-500/15 text-emerald-600 md:text-emerald-400 font-bold' : 'text-slate-500 md:text-slate-400 hover:text-slate-800 md:hover:text-slate-200'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">Mensagens</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAbaAtiva('ajuda');
                setArtigoSelecionado(null);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
                abaAtiva === 'ajuda' ? 'bg-emerald-50 md:bg-emerald-500/15 text-emerald-600 md:text-emerald-400 font-bold' : 'text-slate-500 md:text-slate-400 hover:text-slate-800 md:hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">Ajuda</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAbaAtiva('noticias');
                setArtigoSelecionado(null);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
                abaAtiva === 'noticias' ? 'bg-emerald-50 md:bg-emerald-500/15 text-emerald-600 md:text-emerald-400 font-bold' : 'text-slate-500 md:text-slate-400 hover:text-slate-800 md:hover:text-slate-200'
              }`}
            >
              <Newspaper className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">Notícias</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
