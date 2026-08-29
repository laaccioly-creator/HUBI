import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Send,
  Sparkles,
  Bot,
  User,
  TrendingUp,
  Package,
  DollarSign,
  Mic,
  MicOff,
  ExternalLink
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { processarPerguntaRubiIA, DadosLojaRubi } from '../services/tutoriaisHubiService';

interface MensagemChat {
  id: string;
  remetente: 'usuario' | 'ia';
  texto: string;
  data: Date;
}

export const ChatAjudaIA: React.FC = () => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();
  const [aberto, setAberto] = useState<boolean>(false);

  // Chat com IA
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [inputMensagem, setInputMensagem] = useState<string>('');
  const [enviando, setEnviando] = useState<boolean>(false);
  const [alturaTeclado, setAlturaTeclado] = useState<number>(0);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Monitora redimensionamento de viewport móvel e teclado virtual
  useEffect(() => {
    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        const offset = window.innerHeight - window.visualViewport.height;
        setAlturaTeclado(offset > 50 ? offset : 0);
        setTimeout(() => {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      }
    };

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
      }
    };
  }, []);

  // Reconhecimento de Voz (Microfone)
  const [escutandoVoz, setEscutandoVoz] = useState<boolean>(false);
  const [suporteVoz, setSuporteVoz] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

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
    if (!recognitionRef.current) return;

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

  // Mensagem inicial de boas-vindas idêntica ao Assistente Rubi
  useEffect(() => {
    if (mensagens.length === 0) {
      setMensagens([
        {
          id: 'welcome-1',
          remetente: 'ia',
          texto: `Olá! Sou a **Rubi**, sua assistente inteligente no **HUBI**. 🚀\n\nPosso te ajudar com perguntas sobre suas vendas de hoje, estoque baixo, produtos mais vendidos ou calcular seu fluxo de caixa.\n\nComo posso ajudar o seu negócio hoje?`,
          data: new Date()
        }
      ]);
    }
  }, [mensagens.length]);

  useEffect(() => {
    if (aberto) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens, aberto]);

  // Inteligência Unificada idêntica ao Assistente Rubi do Desktop
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

    try {
      if (!loja?.id) throw new Error('Loja não identificada');

      const pLower = texto.toLowerCase();

      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('status', 'confirmado');

      const { data: produtos } = await supabase
        .from('produtos')
        .select('*, variacoes:variacoes_produto(*)')
        .eq('loja_id', loja.id)
        .eq('ativo', true);

      const { data: clientes } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id);

      const getEstoqueReal = (p: any) => {
        if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
          return p.variacoes.reduce((acc: number, v: any) => acc + Number(v.quantidade_estoque || 0), 0);
        }
        return Number(p.quantidade_estoque || 0);
      };

      const faturamento = pedidos?.reduce((acc, p) => acc + Number(p.valor_total || 0), 0) || 0;
      const totalPedidos = pedidos?.length || 0;
      const produtosAlerta = produtos?.filter((p) => getEstoqueReal(p) <= Number(p.estoque_minimo_alerta)) || [];
      const totalFiado = clientes?.reduce((acc, c) => acc + Number(c.saldo_devedor_fiado || 0), 0) || 0;

      const dadosLoja: DadosLojaRubi = {
        faturamento,
        totalPedidos,
        produtosAlerta,
        totalFiado,
        produtosTotal: produtos?.length || 0,
        clientesTotal: clientes?.length || 0
      };

      const resposta = await processarPerguntaRubiIA(texto, usuario, loja, dadosLoja);

      setMensagens((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          remetente: 'ia',
          texto: resposta,
          data: new Date()
        }
      ]);
    } catch (err) {
      setMensagens((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          remetente: 'ia',
          texto: 'Desculpe, tive uma instabilidade momentânea ao consultar os dados da loja. Por favor, tente novamente.',
          data: new Date()
        }
      ]);
    } finally {
      setEnviando(false);
    }
  };

  // Posição arrastável da bolinha da Rubi IA (Drag and Drop)
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

      if (Math.hypot(deltaX, deltaY) > 6) houveArrastoRef.current = true;

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
      setPosicao((pos) => {
        if (pos) localStorage.setItem('hubi_rubi_ia_pos', JSON.stringify(pos));
        return pos;
      });
    };

    window.addEventListener('mousemove', emMovimento);
    window.addEventListener('mouseup', finalizarArrasto);
    window.addEventListener('touchmove', emMovimento, { passive: true });
    window.addEventListener('touchend', finalizarArrasto);
  };

  const handleClickBotao = () => {
    if (!houveArrastoRef.current) setAberto((prev) => !prev);
  };

  return (
    <>
      <div
        style={posicao ? { left: `${posicao.x}px`, top: `${posicao.y}px`, bottom: 'auto', right: 'auto' } : {}}
        className={`${posicao ? 'fixed' : 'fixed bottom-5 right-4 md:bottom-6 md:right-6'} z-40 animate-in fade-in duration-200 select-none`}
      >
        <button
          type="button"
          onMouseDown={iniciarArrasto}
          onTouchStart={iniciarArrasto}
          onClick={handleClickBotao}
          className="relative w-13 h-13 md:w-14 md:h-14 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 text-white shadow-xl shadow-indigo-600/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing border-2 border-white/40 ring-2 ring-indigo-500/20"
          title="Assistente Rubi IA • Clique para abrir ou arraste pela tela"
        >
          {aberto ? (
            <X className="w-6 h-6 pointer-events-none" />
          ) : (
            <div className="relative pointer-events-none">
              <Sparkles className="w-6 h-6 text-white animate-pulse" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-indigo-900" />
            </div>
          )}
        </button>
      </div>

      {aberto && (
        <div
          style={{
            bottom: isMobile && alturaTeclado > 0 ? `${alturaTeclado}px` : undefined,
            maxHeight: isMobile && alturaTeclado > 0 ? `calc(100dvh - ${alturaTeclado}px)` : undefined
          }}
          className="fixed bottom-0 md:bottom-24 right-0 md:right-6 z-50 w-full md:w-[420px] max-w-full h-[100dvh] md:h-[620px] max-h-[100dvh] md:max-h-[92vh] bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 md:zoom-in-95 duration-200 select-none text-slate-800 md:text-slate-100"
        >
          <div className="p-3.5 bg-white md:bg-slate-900/90 border-b border-slate-200 md:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 md:text-slate-100 flex items-center gap-1.5">
                  <span>Rubi - Assistente IA</span>
                  <span className="bg-indigo-50 md:bg-indigo-500/20 text-indigo-700 md:text-indigo-300 text-[10px] font-bold px-1.5 py-0.2 rounded border border-indigo-200 md:border-indigo-500/30">
                    HUBI AI
                  </span>
                </h3>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Online • Inteligência de Vendas e Gestão</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAberto(false);
                  navigate('/smart-assistant');
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 md:hover:bg-slate-800 text-slate-500 md:text-slate-400 transition cursor-pointer"
                title="Abrir em tela cheia"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 md:hover:bg-slate-800 text-slate-500 md:text-slate-400 transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60 md:bg-slate-950/40">
            {mensagens.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${msg.remetente === 'usuario' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.remetente === 'ia' && (
                  <div className="w-7 h-7 rounded-xl bg-indigo-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                    msg.remetente === 'usuario'
                      ? 'bg-emerald-600 text-white rounded-br-none shadow-xs font-medium'
                      : 'bg-white md:bg-slate-800 border border-slate-200 md:border-slate-700 text-slate-800 md:text-slate-100 rounded-bl-none shadow-xs whitespace-pre-line'
                  }`}
                >
                  {msg.texto}
                </div>
                {msg.remetente === 'usuario' && (
                  <div className="w-7 h-7 rounded-xl bg-slate-200 md:bg-slate-800 flex items-center justify-center text-slate-700 md:text-slate-300 shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            {enviando && (
              <div className="flex items-center gap-2 text-indigo-600 md:text-indigo-400 text-xs p-2.5 bg-indigo-50 md:bg-indigo-950/30 rounded-xl border border-indigo-100 md:border-indigo-800/40">
                <Sparkles className="w-4 h-4 animate-spin text-indigo-500" />
                <span className="font-semibold">Rubi está analisando os dados da sua loja...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div
            style={{
              paddingBottom: isMobile && alturaTeclado > 0 ? `${alturaTeclado + 8}px` : '12px'
            }}
            className="p-3 bg-white md:bg-slate-900 border-t border-slate-200 md:border-slate-800 space-y-2 shrink-0 transition-all duration-150"
          >
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
              <button
                type="button"
                onClick={() => handleEnviarMensagem('Como estão as vendas e o faturamento?')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 md:bg-slate-800 hover:bg-slate-200 md:hover:bg-slate-700 text-slate-800 md:text-slate-300 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-300 md:border-slate-700 font-semibold text-[11px] cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                <span>Resumo de Vendas</span>
              </button>
              <button
                type="button"
                onClick={() => handleEnviarMensagem('Quais produtos estão com estoque baixo?')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 md:bg-slate-800 hover:bg-slate-200 md:hover:bg-slate-700 text-slate-800 md:text-slate-300 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-300 md:border-slate-700 font-semibold text-[11px] cursor-pointer"
              >
                <Package className="w-3.5 h-3.5 text-amber-500" />
                <span>Alerta de Estoque</span>
              </button>
              <button
                type="button"
                onClick={() => handleEnviarMensagem('Quanto tenho a receber em fiado?')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 md:bg-slate-800 hover:bg-slate-200 md:hover:bg-slate-700 text-slate-800 md:text-slate-300 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-300 md:border-slate-700 font-semibold text-[11px] cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5 text-indigo-500" />
                <span>Total em Fiado</span>
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleEnviarMensagem();
              }}
              className="flex items-center gap-1.5"
            >
              <div className="flex-1 flex items-center bg-white md:bg-slate-800 border-2 border-slate-400 md:border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-emerald-600 md:focus-within:border-indigo-500 shadow-sm transition">
                <input
                  type="text"
                  placeholder={escutandoVoz ? 'Ouvindo sua voz...' : 'Digite uma pergunta para a Rubi...'}
                  value={inputMensagem}
                  onChange={(e) => setInputMensagem(e.target.value)}
                  onFocus={(e) => {
                    setTimeout(() => {
                      e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }, 200);
                  }}
                  style={
                    isMobile
                      ? {
                          color: '#000000',
                          WebkitTextFillColor: '#000000',
                          fontWeight: 700,
                          caretColor: '#000000'
                        }
                      : {
                          color: '#ffffff',
                          WebkitTextFillColor: '#ffffff',
                          caretColor: '#ffffff'
                        }
                  }
                  className={`flex-1 bg-transparent text-xs ${
                    isMobile
                      ? 'rubi-input-mobile text-black !text-black font-bold placeholder:text-slate-500 placeholder:font-medium'
                      : 'rubi-input-desktop text-white !text-white font-normal placeholder:text-slate-400 placeholder:font-normal'
                  } focus:outline-none`}
                />
                {suporteVoz && (
                  <button
                    type="button"
                    onClick={alternarGravacaoVoz}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      escutandoVoz ? 'bg-rose-600 text-white animate-bounce shadow-md' : 'text-slate-400 hover:text-indigo-600 md:hover:text-indigo-400'
                    }`}
                    title={escutandoVoz ? 'Parar gravação' : 'Falar por voz'}
                  >
                    {escutandoVoz ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!inputMensagem.trim() || enviando}
                className="p-2.5 rounded-xl bg-emerald-600 md:bg-indigo-600 hover:bg-emerald-700 md:hover:bg-indigo-500 disabled:opacity-40 text-white shadow-md shadow-emerald-600/20 md:shadow-indigo-500/20 transition cursor-pointer shrink-0"
                title="Enviar pergunta"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
