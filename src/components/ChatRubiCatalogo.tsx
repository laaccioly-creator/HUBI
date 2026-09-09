import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  X,
  Bot,
  User,
  Loader2,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ShoppingBag,
  Plus,
  Check,
  CheckCircle2
} from 'lucide-react';
import {
  responderPerguntaClienteCatalogo,
  ContextoLojaCatalogo,
  PERSONAS_SEGMENTO
} from '../services/rubiCatalogoService';
import { Produto, VariacaoProduto } from '../types';

interface MensagemChat {
  id: string;
  remetente: 'user' | 'rubi';
  texto: string;
  data: Date;
  produtosSugeridos?: Produto[];
  adicionadoPorVoz?: boolean;
}

interface ChatRubiCatalogoProps {
  contexto: ContextoLojaCatalogo;
  onAdicionarAoCarrinho?: (produto: Produto, variacao?: VariacaoProduto | null, quantidade?: number) => void;
  onAbrirModalVariacao?: (produto: Produto) => void;
  onClienteAtualizado?: (clienteData: { nome?: string; telefone?: string; endereco?: string }) => void;
  corTema?: string;
}

export const ChatRubiCatalogo: React.FC<ChatRubiCatalogoProps> = ({
  contexto,
  onAdicionarAoCarrinho,
  onAbrirModalVariacao,
  onClienteAtualizado,
  corTema = '#10b981'
}) => {
  const [aberto, setAberto] = useState<boolean>(false);
  const [telaCheia, setTelaCheia] = useState<boolean>(false);
  const [inputTexto, setInputTexto] = useState<string>('');
  const [pensando, setPensando] = useState<boolean>(false);
  const [ultimoProdutoSugerido, setUltimoProdutoSugerido] = useState<Produto | null>(null);

  // Nome do cliente e identificação
  const [nomeCliente, setNomeCliente] = useState<string>(
    contexto.nomeClienteAtual || contexto.clienteAtual?.nome || ''
  );

  // Controle de Voz (Speech-to-Text - Microfone)
  const [escutandoVoz, setEscutandoVoz] = useState<boolean>(false);
  const [suporteVozSTT, setSuporteVozSTT] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Refs para controle resiliente de fala (evita corte abrupto e aguarda término da frase)
  const deveContinuarOuvindoRef = useRef<boolean>(false);
  const silencioTimerRef = useRef<any>(null);
  const textoCapturadoRef = useRef<string>('');

  // Manter textoCapturadoRef sincronizado
  useEffect(() => {
    textoCapturadoRef.current = inputTexto;
  }, [inputTexto]);

  // Controle de Áudio (Text-to-Speech - Rubi falando)
  const [audioAtivo, setAudioAtivo] = useState<boolean>(true);
  const [rubiFalando, setRubiFalando] = useState<boolean>(false);

  // Notificação / Toast visual dentro do chat
  const [toastNotificacao, setToastNotificacao] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  const nomeLoja = contexto.loja.nome_fantasia || 'nossa loja';
  const perfilNegocio = contexto.loja.configuracoes_extras?.perfil_negocio || {};
  const segmento = perfilNegocio.segmento || 'geral';
  const personaInfo = PERSONAS_SEGMENTO[segmento] || PERSONAS_SEGMENTO.geral;

  // Mensagem inicial acolhedora personalizada
  const [mensagens, setMensagens] = useState<MensagemChat[]>(() => {
    const nomeInicial = contexto.nomeClienteAtual || contexto.clienteAtual?.nome || '';
    if (nomeInicial) {
      return [
        {
          id: '1',
          remetente: 'rubi',
          texto: `Olá, **${nomeInicial}**! Que alegria ter você aqui na **${nomeLoja}**! ✨\n\nSou a **Rubi**, sua ${personaInfo.papel.toLowerCase()}. O que você gostaria de ver hoje? Pode me pedir produtos, novidades ou tirar qualquer dúvida por texto ou por voz!`,
          data: new Date()
        }
      ];
    }
    return [
      {
        id: '1',
        remetente: 'rubi',
        texto: `Olá! Seja muito bem-vindo(a) à **${nomeLoja}**! ✨\n\nSou a **Rubi**, sua ${personaInfo.papel.toLowerCase()}. Antes de começarmos, **como posso te chamar? Me diz o seu nome!** 😊\n\n*(Você pode falar tocando no microfone ou digitar aqui embaixo!)*`,
        data: new Date()
      }
    ];
  });

  // Atualizar nome se contexto mudar
  useEffect(() => {
    if (contexto.nomeClienteAtual && contexto.nomeClienteAtual !== nomeCliente) {
      setNomeCliente(contexto.nomeClienteAtual);
    }
  }, [contexto.nomeClienteAtual]);

  const pararGravacaoVoz = (enviarSeTiverTexto: boolean = false) => {
    deveContinuarOuvindoRef.current = false;
    if (silencioTimerRef.current) {
      clearTimeout(silencioTimerRef.current);
      silencioTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setEscutandoVoz(false);

    if (enviarSeTiverTexto && textoCapturadoRef.current.trim()) {
      enviarMensagem(textoCapturadoRef.current.trim());
    }
  };

  // Inicializar Web Speech Recognition (Microfone Contínuo e Sem Cortes)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSuporteVozSTT(true);
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true; // ESSENCIAL: Mantém escuta contínua, sem cortar nas pausas naturais da fala
        recognition.interimResults = true; // Transcreve em tempo real

        recognition.onstart = () => {
          setEscutandoVoz(true);
        };

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = 0; i < event.results.length; i++) {
            const item = event.results[i];
            if (item.isFinal) {
              finalTranscript += (finalTranscript && !finalTranscript.endsWith(' ') ? ' ' : '') + item[0].transcript.trim();
            } else {
              interimTranscript += (interimTranscript && !interimTranscript.endsWith(' ') ? ' ' : '') + item[0].transcript.trim();
            }
          }

          const textoCompleto = [finalTranscript, interimTranscript].filter(Boolean).join(' ').trim();

          if (textoCompleto) {
            textoCapturadoRef.current = textoCompleto;
            setInputTexto(textoCompleto);

            // Reiniciar timer de silêncio: concede 3 segundos inteiros de silêncio para terminar a frase com calma
            if (silencioTimerRef.current) {
              clearTimeout(silencioTimerRef.current);
            }
            silencioTimerRef.current = setTimeout(() => {
              if (deveContinuarOuvindoRef.current && textoCapturadoRef.current.trim()) {
                pararGravacaoVoz(true);
              }
            }, 3000); // 3 segundos de tolerância de silêncio
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Aviso no microfone Rubi IA:', event.error);
          if (event.error === 'no-speech') {
            // Silêncio comum enquanto o usuário pensa; não cancela se deveContinuarOuvindoRef for true
            return;
          }
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            deveContinuarOuvindoRef.current = false;
            setEscutandoVoz(false);
            mostrarToastFeedback('Permissão de microfone negada. Ative o microfone nas permissões do navegador.');
            return;
          }
        };

        recognition.onend = () => {
          // Se o navegador desligar temporariamente a conexão mas o usuário ainda está no modo de fala
          if (deveContinuarOuvindoRef.current) {
            try {
              recognition.start();
            } catch {
              // Conexão em reinício
            }
          } else {
            setEscutandoVoz(false);
          }
        };

        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Falha ao instanciar SpeechRecognition:', err);
      }
    }
  }, []);

  const alternarGravacaoVoz = () => {
    if (!recognitionRef.current) {
      mostrarToastFeedback('Reconhecimento de voz não suportado neste navegador. Digite sua mensagem!');
      return;
    }

    if (escutandoVoz) {
      // Se já estava gravando e o usuário tocou no microfone, conclui e envia se tiver texto
      pararGravacaoVoz(true);
    } else {
      pararFalaRubi();
      deveContinuarOuvindoRef.current = true;
      textoCapturadoRef.current = '';
      setInputTexto('');
      setEscutandoVoz(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Erro ao acionar microfone:', e);
      }
    }
  };

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [vozesDisponiveis, setVozesDisponiveis] = useState<SpeechSynthesisVoice[]>([]);

  // Carregar e monitorar vozes do sistema (SpeechSynthesis)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const carregarVozes = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        setVozesDisponiveis(v);
      }
    };

    carregarVozes();
    window.speechSynthesis.onvoiceschanged = carregarVozes;

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Seleciona preferencialmente vozes femininas em português para a persona Rubi
  const selecionarMelhorVozFeminina = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
    if (!voices || voices.length === 0) return null;

    // Filtra vozes em português (Brasil preferencialmente)
    const vozesPtBr = voices.filter(v => v.lang === 'pt-BR' || v.lang === 'pt_BR');
    const vozesPt = vozesPtBr.length > 0 ? vozesPtBr : voices.filter(v => v.lang.startsWith('pt'));

    if (vozesPt.length === 0) return null;

    // Nomes femininos conhecidos nos motores de TTS (Windows/Edge, Google/Android, Apple/iOS)
    const nomesFemininos = [
      'francisca', // Microsoft Francisca (Natural) - excelente voz feminina no Edge/Windows
      'maria',     // Microsoft Maria (Windows)
      'leticia',   // Microsoft Leticia
      'luciana',   // iOS / macOS / Safari / Siri
      'fernanda',
      'vitória',
      'vitoria',
      'heloisa',
      'camila',
      'yara',
      'brenda',
      'raquel',
      'joana',
      'female',
      'feminina',
      'mulher',
      'zira'
    ];

    const nomesMasculinos = [
      'antonio', 'antônio', 'daniel', 'felipe', 'thiago', 'tiago',
      'ricardo', 'helio', 'hélio', 'male', 'masculino', 'homem', 'julio', 'júlio', 'yuri', 'hector'
    ];

    // 1ª Tentativa: Voz em português com nome explicitamente feminino
    for (const pista of nomesFemininos) {
      const voz = vozesPt.find(v => {
        const n = v.name.toLowerCase();
        return n.includes(pista) && !nomesMasculinos.some(m => n.includes(m));
      });
      if (voz) return voz;
    }

    // 2ª Tentativa: Voz em português que NÃO contenha nomes masculinos (ex: Google português do Brasil)
    const vozNaoMasculina = vozesPt.find(v => {
      const n = v.name.toLowerCase();
      return !nomesMasculinos.some(m => n.includes(m));
    });
    if (vozNaoMasculina) return vozNaoMasculina;

    // 3ª Tentativa: Qualquer voz em português disponível
    return vozesPt[0];
  };

  // Síntese de Voz (Rubi falando verbalmente com proteção contra corte e sleep no Chromium)
  const limparTextoParaAudio = (texto: string): string => {
    return texto
      .replace(/\[PRODUTOS(?:_RECOMENDADOS)?:\s*[^\]]+\]/gi, '') // Remove tags de produtos
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove negrito
      .replace(/\*([^*]+)\*/g, '$1') // Remove itálico
      .replace(/###/g, '')
      .replace(/•/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis
      .replace(/\n\s*\n/g, '. ')
      .replace(/\n/g, ', ')
      .trim();
  };

  const falarTexto = (texto: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const textoLimpo = limparTextoParaAudio(texto);
      if (!textoLimpo) return;

      const utterance = new SpeechSynthesisUtterance(textoLimpo);
      currentUtteranceRef.current = utterance; // Evita Garbage Collection no Chromium
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0; // Velocidade natural, calma e compreensível
      utterance.pitch = 1.1; // Tom feminino, acolhedor e suave

      const voices = vozesDisponiveis.length > 0 ? vozesDisponiveis : window.speechSynthesis.getVoices();
      const ptVoice = selecionarMelhorVozFeminina(voices);
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      utterance.onstart = () => setRubiFalando(true);
      utterance.onend = () => {
        setRubiFalando(false);
        currentUtteranceRef.current = null;
      };
      utterance.onerror = () => {
        setRubiFalando(false);
        currentUtteranceRef.current = null;
      };

      // Pequeno timeout de 50ms para desengasgar o cancel() prévio em navegadores Chromium
      setTimeout(() => {
        try {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('Erro ao reproduzir voz:', e);
        }
      }, 50);
    } catch (err) {
      console.warn('Falha na síntese de voz da Rubi:', err);
      setRubiFalando(false);
    }
  };

  const pararFalaRubi = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setRubiFalando(false);
      currentUtteranceRef.current = null;
    }
  };

  // Parar fala ao fechar chat
  useEffect(() => {
    if (!aberto) {
      pararFalaRubi();
      pararGravacaoVoz(false);
    }
  }, [aberto]);

  const mostrarToastFeedback = (msg: string) => {
    setToastNotificacao(msg);
    setTimeout(() => {
      setToastNotificacao(null);
    }, 3500);
  };

  useEffect(() => {
    if (aberto) {
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [mensagens, aberto, pensando]);

  // Envio de mensagem (por clique ou voz)
  const enviarMensagem = async (textoPersonalizado?: string) => {
    const texto = (textoPersonalizado || inputTexto).trim();
    if (!texto || pensando) return;

    pararFalaRubi();
    pararGravacaoVoz(false);

    const msgUsuario: MensagemChat = {
      id: Date.now().toString(),
      remetente: 'user',
      texto,
      data: new Date()
    };

    setMensagens(prev => [...prev, msgUsuario]);
    setInputTexto('');
    setPensando(true);

    try {
      const contextoAtualizado: ContextoLojaCatalogo = {
        ...contexto,
        nomeClienteAtual: nomeCliente,
        ultimoProdutoSugerido,
        historicoMensagens: mensagens.slice(-6).map(m => ({
          autor: m.remetente === 'user' ? 'cliente' : 'rubi',
          texto: m.texto
        })),
        produtosJaSugeridosIds: Array.from(
          new Set(
            mensagens
              .flatMap(m => m.produtosSugeridos?.map(p => p.id) || [])
              .filter(Boolean) as string[]
          )
        )
      };

      const respostaRubi = await responderPerguntaClienteCatalogo(texto, contextoAtualizado);

      // Se comando de adicionar à sacola foi detectado
      if (respostaRubi.comandoSacola) {
        const { produto, quantidade } = respostaRubi.comandoSacola;
        if (onAdicionarAoCarrinho) {
          onAdicionarAoCarrinho(produto, null, quantidade);
          mostrarToastFeedback(`"${produto.nome}" adicionado à sacola! 🛍️`);
        }
      }

      // Se novos dados de cadastro foram detectados
      if (respostaRubi.dadosCadastroDetectados) {
        if (respostaRubi.dadosCadastroDetectados.nome) {
          setNomeCliente(respostaRubi.dadosCadastroDetectados.nome);
        }
        if (onClienteAtualizado) {
          onClienteAtualizado(respostaRubi.dadosCadastroDetectados);
        }
      }

      // Se produtos foram sugeridos, guardar o primeiro como referência
      if (respostaRubi.produtosSugeridos && respostaRubi.produtosSugeridos.length > 0) {
        setUltimoProdutoSugerido(respostaRubi.produtosSugeridos[0]);
      }

      const msgRubi: MensagemChat = {
        id: (Date.now() + 1).toString(),
        remetente: 'rubi',
        texto: respostaRubi.texto,
        produtosSugeridos: respostaRubi.produtosSugeridos,
        adicionadoPorVoz: Boolean(respostaRubi.comandoSacola),
        data: new Date()
      };

      setMensagens(prev => [...prev, msgRubi]);

      // Falar a resposta se o áudio estiver ativado
      falarTexto(respostaRubi.texto);
    } catch (e) {
      console.error('Erro Rubi Catálogo:', e);
      const erroTexto = 'Tive um pequeno contratempo, mas estou aqui! Pode me perguntar sobre nossos produtos, atacado, entregas e como fechar o seu pedido.';
      setMensagens(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          remetente: 'rubi',
          texto: erroTexto,
          data: new Date()
        }
      ]);
      falarTexto(erroTexto);
    } finally {
      setPensando(false);
    }
  };

  const handleAdicionarProdutoClick = (produto: Produto) => {
    if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
      if (onAbrirModalVariacao) {
        onAbrirModalVariacao(produto);
        mostrarToastFeedback(`Selecione a opção desejada para "${produto.nome}"!`);
      }
    } else {
      if (onAdicionarAoCarrinho) {
        onAdicionarAoCarrinho(produto, null, 1);
        mostrarToastFeedback(`"${produto.nome}" adicionado à sacola! 🛍️`);
        falarTexto(`Adicionei ${produto.nome} na sua sacola de compras!`);
      }
    }
  };

  // Perguntas Rápidas (Organizadas em 2 Linhas Fixas, sem scroll horizontal)
  const duvidasRapidas =
    segmento === 'sexshop'
      ? [
          'A embalagem é discreta?',
          'Quais os produtos mais vendidos?',
          'Como funciona a entrega?',
          'Quais as formas de pagamento?'
        ]
      : [
          'Como funciona o atacado?',
          'Quais as formas de pagamento?',
          'Como funciona a entrega?',
          'Como usar cupom de desconto?'
        ];

  return (
    <>
      {/* BOTÃO FLUTUANTE DA RUBI IA */}
      <div className="fixed bottom-20 sm:bottom-6 left-4 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-white font-bold p-3 sm:px-4 sm:py-3 rounded-full shadow-2xl flex items-center gap-2.5 transition-all duration-300 transform hover:scale-105 group border border-white/20 cursor-pointer"
          title="Fale com a Rubi IA por Voz ou Chat"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 animate-pulse text-amber-200" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-100"></span>
            </span>
          </div>
          <span className="hidden sm:inline text-xs font-black tracking-wide drop-shadow-sm">
            Fale com a Rubi ✨
          </span>
        </button>

        {/* Botão de Microfone Direto no Flutuante */}
        <button
          type="button"
          onClick={() => {
            setAberto(true);
            setTimeout(() => {
              alternarGravacaoVoz();
            }, 300);
          }}
          className="bg-slate-900/90 hover:bg-emerald-600 text-emerald-400 hover:text-white p-3 rounded-full shadow-xl border border-slate-700 transition transform hover:scale-105 cursor-pointer"
          title="Falar agora com a Rubi"
        >
          <Mic className="w-4 h-4" />
        </button>
      </div>

      {/* MODAL / DRAWER DE CHAT (JANELA OU TELA CHEIA) */}
      {aberto && (
        <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-start ${telaCheia ? 'p-0' : 'sm:pl-6 bg-black/60 backdrop-blur-xs p-0 sm:p-4'} animate-in fade-in`}>
          <div
            className={`bg-slate-900 border border-slate-700 w-full shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
              telaCheia
                ? 'fixed inset-0 z-50 h-full max-w-none rounded-none'
                : 'sm:max-w-md h-[85vh] sm:h-[650px] rounded-t-3xl sm:rounded-3xl animate-in slide-in-from-bottom-6'
            }`}
          >
            {/* Header */}
            <div className="p-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950/60 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                    <Bot className="w-5 h-5" />
                  </div>
                  {rubiFalando && (
                    <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-slate-100">Rubi IA</span>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/30">
                      {rubiFalando ? 'FALANDO...' : 'ONLINE'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 block truncate max-w-[200px]">
                    {personaInfo.papel} • {nomeLoja}
                  </span>
                </div>
              </div>

              {/* Botões de Ação no Header (Áudio, Tela Cheia, Fechar) */}
              <div className="flex items-center gap-1">
                {/* Botão de Ativar/Desativar Voz (TTS) */}
                <button
                  type="button"
                  onClick={() => {
                    if (audioAtivo) {
                      pararFalaRubi();
                      setAudioAtivo(false);
                      mostrarToastFeedback('Áudio da Rubi desativado.');
                    } else {
                      setAudioAtivo(true);
                      mostrarToastFeedback('Áudio ativado! Falando no seu fone.');
                      falarTexto('Áudio ativado! Estou pronta para falar com você.');
                    }
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer ${
                    audioAtivo
                      ? 'text-emerald-400 hover:bg-emerald-500/10'
                      : 'text-slate-500 hover:bg-slate-800'
                  }`}
                  title={audioAtivo ? 'Áudio Ativado (Rubi responde falando). Clique para mutar.' : 'Áudio Mudo. Clique para ativar voz da Rubi.'}
                >
                  {audioAtivo ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                {/* Botão Tela Cheia / Restaurar */}
                <button
                  type="button"
                  onClick={() => setTelaCheia(!telaCheia)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
                  title={telaCheia ? 'Restaurar Janela' : 'Abrir em Tela Cheia'}
                >
                  {telaCheia ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Fechar */}
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Toast de Notificação interno */}
            {toastNotificacao && (
              <div className="bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 flex items-center justify-center gap-1.5 shadow-md animate-in slide-in-from-top-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{toastNotificacao}</span>
              </div>
            )}

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {mensagens.map(msg => (
                <div key={msg.id} className="space-y-2.5">
                  <div className={`flex gap-2.5 ${msg.remetente === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.remetente === 'rubi' && (
                      <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <div className="flex flex-col items-start gap-1 max-w-[85%]">
                      <div
                        className={`rounded-2xl p-3.5 leading-relaxed whitespace-pre-wrap ${
                          msg.remetente === 'user'
                            ? 'bg-emerald-600 text-white rounded-br-xs shadow-md ml-auto'
                            : 'bg-slate-800 text-slate-200 rounded-bl-xs border border-slate-700/80 shadow-xs'
                        }`}
                      >
                        {msg.texto}
                      </div>

                      {msg.remetente === 'rubi' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!audioAtivo) setAudioAtivo(true);
                            falarTexto(msg.texto);
                          }}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 bg-slate-950/70 hover:bg-slate-950 px-2.5 py-1 rounded-full border border-emerald-500/30 transition cursor-pointer select-none"
                          title="Tocar áudio desta resposta no seu fone"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>🔊 Ouvir no fone</span>
                        </button>
                      )}
                    </div>

                    {msg.remetente === 'user' && (
                      <div className="w-7 h-7 rounded-xl bg-emerald-700 text-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  {/* CARDS INTERATIVOS DE PRODUTOS SUGERIDOS */}
                  {msg.produtosSugeridos && msg.produtosSugeridos.length > 0 && (
                    <div className="pl-9 pr-2 space-y-2 animate-in fade-in">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Produtos Recomendados:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.produtosSugeridos.map(prod => {
                          const precoEfetivo = Number(prod.preco_promocional || prod.preco_venda_varejo || 0);
                          const temAtacado = Number(prod.preco_venda_atacado || 0) > 0;
                          const fotoUrl = prod.fotos_urls && prod.fotos_urls.length > 0 ? prod.fotos_urls[0] : null;
                          return (
                            <div
                              key={prod.id}
                              className="bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-2.5 flex items-center justify-between gap-3 shadow-md group transition"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {fotoUrl ? (
                                  <img
                                    src={fotoUrl}
                                    alt={prod.nome}
                                    className="w-12 h-12 object-cover rounded-xl shrink-0 bg-slate-900 border border-slate-800"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                                    <ShoppingBag className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <span className="font-bold text-xs text-slate-100 block truncate group-hover:text-emerald-300 transition">
                                    {prod.nome}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-xs font-black text-emerald-400">
                                      R$ {precoEfetivo.toFixed(2)}
                                    </span>
                                    {temAtacado && (
                                      <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.2 rounded-md border border-amber-500/30">
                                        Atacado R$ {Number(prod.preco_venda_atacado).toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleAdicionarProdutoClick(prod)}
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 transition shrink-0 cursor-pointer shadow-sm hover:scale-105"
                                title="Adicionar este produto à sacola"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Adicionar</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {pensando && (
                <div className="flex gap-2.5 items-center text-slate-400 italic">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl px-3.5 py-2 text-[11px]">
                    Rubi está pensando na melhor recomendação...
                  </div>
                </div>
              )}

              {/* Indicador visual de escuta por voz ativa */}
              {escutandoVoz && (
                <div className="flex items-center gap-2 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-semibold animate-pulse">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                  <span>Escutando sua voz... Pode falar agora!</span>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Dúvidas Rápidas (Organizadas em 2 Linhas Fixas, SEM scroll horizontal) */}
            <div className="p-2.5 bg-slate-950/80 border-t border-slate-800/80 grid grid-cols-2 gap-1.5 shrink-0">
              {duvidasRapidas.map((duvida, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => enviarMensagem(duvida)}
                  disabled={pensando}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-300 hover:text-emerald-300 text-[11px] font-medium border border-slate-700/80 transition text-center truncate cursor-pointer disabled:opacity-50"
                  title={duvida}
                >
                  {duvida}
                </button>
              ))}
            </div>

            {/* Indicador de Escuta com Tolerância Confortável de Pausa */}
            {escutandoVoz && (
              <div className="px-3.5 py-2 bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-950 border-t border-rose-500/40 flex items-center justify-between text-xs text-rose-200 animate-in fade-in shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-2.5 w-2.5 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                  <span className="truncate font-medium text-[11px]">
                    {inputTexto.trim()
                      ? 'Ouvindo... Pode falar no seu ritmo (pausa de 3s envia)'
                      : 'Gravando... Fale a sua frase com calma, estou te ouvindo!'}
                  </span>
                </div>
                {inputTexto.trim() && (
                  <button
                    type="button"
                    onClick={() => pararGravacaoVoz(true)}
                    className="ml-2 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shrink-0 transition shadow-sm cursor-pointer"
                  >
                    Enviar Agora
                  </button>
                )}
              </div>
            )}

            {/* Formulário de Envio com Microfone Integrado */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviarMensagem();
              }}
              className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0"
            >
              {/* Botão de Microfone para falar */}
              <button
                type="button"
                onClick={alternarGravacaoVoz}
                className={`p-2.5 rounded-xl border transition cursor-pointer shrink-0 ${
                  escutandoVoz
                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse shadow-lg shadow-rose-600/30'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50'
                }`}
                title={escutandoVoz ? 'Concluir gravação e enviar' : 'Falar com a Rubi por microfone'}
              >
                {escutandoVoz ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                placeholder={escutandoVoz ? 'Ouvindo... fale à vontade no seu ritmo' : 'Fale ou pergunte sobre produtos, preços, entrega...'}
                value={inputTexto}
                onChange={(e) => setInputTexto(e.target.value)}
                disabled={pensando}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />

              <button
                type="submit"
                disabled={!inputTexto.trim() || pensando}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-40 cursor-pointer shrink-0"
                title="Enviar mensagem"
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

