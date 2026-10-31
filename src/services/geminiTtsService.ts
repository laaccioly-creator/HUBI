/**
 * HUBI Gemini Studio Voice Engine
 * Serviço centralizado de síntese de voz (TTS) utilizando o modelo Gemini 3.8 Flash TTS
 * com entonação humana ultra-realista em Português do Brasil.
 *
 * Características:
 * - Modelo primário: gemini-3.8-flash-tts (Google AI Studio)
 * - Vozes prebuilt naturais: Aoede (melodiosa/acolhedora), Puck, Charon
 * - Fallback resiliente automático: gemini-2.0-flash / gemini-2.5-flash-preview -> Web Speech API
 * - Cache em memória (Map texto -> blob URL) para confirmações rápidas e economia de cota
 * - Suporte a conversão nativa de PCM/WAV/MP3 em navegadores desktop e mobile
 * - Blindagem contra vazamento de credenciais (PII/BYOK)
 */

import { getGeminiApiKey, obterOuBuscarGeminiApiKey } from './geminiService';

export interface GeminiTtsConfig {
  apiKey?: string;
  loja?: any;
  voiceName?: 'Aoede' | 'Puck' | 'Charon' | 'Fenrir' | 'Kore' | string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (erro: any) => void;
  forcarWebSpeech?: boolean;
}

// Modelos prioritários para TTS no Google AI Studio
const MODELO_PRIMARIO = 'gemini-3.8-flash-tts';
const MODELOS_FALLBACK = ['gemini-2.0-flash', 'gemini-2.5-flash-preview'];

// Cache em memória: chave (voice + texto sanitizado) -> Blob URL
const cacheAudioUrls = new Map<string, string>();
const LIMITE_MAX_CACHE = 80;

// Estado global de reprodução
let audioAtivo: HTMLAudioElement | null = null;
let abortControllerAtivo: AbortController | null = null;
let falandoAtualmente = false;

/**
 * Sanitiza e humaniza o texto para leitura em áudio:
 * Converte moedas (R$ 10,50 -> 10 reais e 50 centavos), remove marcações markdown e emojis.
 */
export const limparTextoParaAudio = (texto: string): string => {
  if (!texto) return '';

  return texto
    .replace(/\[PRODUTOS(?:_RECOMENDADOS)?:\s*[^\]]+\]/gi, '') // Remove tags internas de produtos
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [Texto do link](url) -> Texto do link
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove negrito
    .replace(/\*([^*]+)\*/g, '$1') // Remove itálico
    .replace(/#{1,6}\s*/g, '') // Remove títulos markdown
    .replace(/•|\*|-/g, '') // Remove bullets
    .replace(/R\$\s*(\d+)[.,](\d{2})/g, (_m, reais, centavos) => {
      const cent = parseInt(centavos, 10);
      if (cent === 0) return `${reais} reais`;
      return `${reais} reais e ${centavos} centavos`;
    })
    .replace(/R\$\s*(\d+)/g, '$1 reais')
    .replace(/\bWhatsApp\b/gi, 'WhatsApp')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis
    .replace(/\n\s*\n/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

/**
 * Constrói um cabeçalho RIFF WAV (44 bytes) para amostras brutas de PCM 16-bit mono
 */
export const pcmToWavBlob = (
  pcmBytes: Uint8Array,
  sampleRate: number = 24000,
  numChannels: number = 1
): Blob => {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const buffer = new ArrayBuffer(44 + pcmBytes.length);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 para PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, pcmBytes.length, true);

  new Uint8Array(buffer, 44).set(pcmBytes);

  return new Blob([buffer], { type: 'audio/wav' });
};

/**
 * Converte áudio Base64 retornado pelo Gemini para Blob URL navegável
 */
export const base64AudioToBlobUrl = (base64Data: string, mimeType: string = 'audio/wav'): string => {
  const cleanBase64 = base64Data.replace(/\s+/g, '');
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  let blob: Blob;
  if (mimeType.toLowerCase().includes('pcm')) {
    let rate = 24000;
    const match = mimeType.match(/rate=(\d+)/i);
    if (match && match[1]) {
      rate = parseInt(match[1], 10);
    }
    blob = pcmToWavBlob(bytes, rate);
  } else {
    blob = new Blob([bytes], { type: mimeType });
  }

  return URL.createObjectURL(blob);
};

/**
 * Executa síntese de contingência via Web Speech API
 */
const executarFallbackWebSpeech = (texto: string, config?: GeminiTtsConfig) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    falandoAtualmente = false;
    config?.onEnd?.();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.02;
    utterance.pitch = 1.08;

    const vozes = window.speechSynthesis.getVoices();
    const vozPt =
      vozes.find(v => (v.lang === 'pt-BR' || v.lang === 'pt_BR') && /francisca|maria|leticia|luciana|fernanda|vitória|vitoria/i.test(v.name)) ||
      vozes.find(v => v.lang === 'pt-BR' || v.lang === 'pt_BR') ||
      vozes.find(v => v.lang.startsWith('pt'));

    if (vozPt) {
      utterance.voice = vozPt;
    }

    utterance.onstart = () => {
      falandoAtualmente = true;
      config?.onStart?.();
    };

    utterance.onend = () => {
      falandoAtualmente = false;
      config?.onEnd?.();
    };

    utterance.onerror = (e) => {
      falandoAtualmente = false;
      config?.onError?.(e);
      config?.onEnd?.();
    };

    setTimeout(() => {
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch {
        falandoAtualmente = false;
        config?.onEnd?.();
      }
    }, 40);
  } catch (err) {
    falandoAtualmente = false;
    config?.onError?.(err);
    config?.onEnd?.();
  }
};

/**
 * Reproduz um Blob URL de áudio em HTMLAudioElement
 */
const reproduzirBlobAudio = async (
  blobUrl: string,
  config?: GeminiTtsConfig
): Promise<void> => {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(blobUrl);
      audioAtivo = audio;

      audio.onplay = () => {
        falandoAtualmente = true;
        config?.onStart?.();
      };

      audio.onended = () => {
        falandoAtualmente = false;
        audioAtivo = null;
        config?.onEnd?.();
        resolve();
      };

      audio.onerror = (e) => {
        falandoAtualmente = false;
        audioAtivo = null;
        config?.onError?.(e);
        config?.onEnd?.();
        resolve();
      };

      audio.play().catch((playErr) => {
        console.warn('[GeminiTTS] Autoplay bloqueado ou erro no elemento de áudio:', playErr);
        falandoAtualmente = false;
        audioAtivo = null;
        config?.onEnd?.();
        resolve();
      });
    } catch (e) {
      falandoAtualmente = false;
      audioAtivo = null;
      config?.onError?.(e);
      config?.onEnd?.();
      resolve();
    }
  });
};

/**
 * Interrompe imediatamente qualquer reprodução ou requisição de áudio em andamento
 */
export const pararGeminiTTS = (): void => {
  if (abortControllerAtivo) {
    try {
      abortControllerAtivo.abort();
    } catch {}
    abortControllerAtivo = null;
  }

  if (audioAtivo) {
    try {
      audioAtivo.pause();
      audioAtivo.currentTime = 0;
    } catch {}
    audioAtivo = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }

  falandoAtualmente = false;
};

/**
 * Retorna se o sintetizador de voz está ativo no momento
 */
export const isGeminiTTSFalando = (): boolean => falandoAtualmente;

/**
 * Limpa o cache de URLs de áudio em memória
 */
export const limparCacheGeminiTTS = (): void => {
  cacheAudioUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
  cacheAudioUrls.clear();
};

/**
 * Dispara uma requisição de áudio para o Google AI Studio (Gemini 3.8 Flash TTS)
 */
const requisitarAudioGemini = async (
  modelo: string,
  texto: string,
  voiceName: string,
  apiKey: string,
  signal: AbortSignal
): Promise<{ base64Data: string; mimeType: string } | null> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: texto }]
      }
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  const partComAudio = json?.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData && p.inlineData.data
  );

  if (!partComAudio?.inlineData?.data) {
    return null;
  }

  return {
    base64Data: partComAudio.inlineData.data,
    mimeType: partComAudio.inlineData.mimeType || 'audio/wav'
  };
};

/**
 * Função Principal: Síntese de Voz Humana com Gemini 3.8 Flash TTS
 *
 * @param texto Texto a ser falado
 * @param config Configurações opcionais de voz, callbacks e contexto de loja
 */
export const falarComGeminiTTS = async (
  texto: string,
  config?: GeminiTtsConfig
): Promise<void> => {
  const textoLimpo = limparTextoParaAudio(texto);
  if (!textoLimpo) return;

  // Interrompe qualquer áudio prévio antes de começar novo playback
  pararGeminiTTS();

  const voiceName = config?.voiceName || 'Aoede'; // Aoede: voz acolhedora e natural em Português
  const cacheKey = `${voiceName}:${textoLimpo}`;

  // Se o usuário optou por forçar Web Speech API diretamente
  if (config?.forcarWebSpeech) {
    executarFallbackWebSpeech(textoLimpo, config);
    return;
  }

  // 1. Verificação de Cache em Memória
  if (cacheAudioUrls.has(cacheKey)) {
    const cachedUrl = cacheAudioUrls.get(cacheKey)!;
    await reproduzirBlobAudio(cachedUrl, config);
    return;
  }

  // 2. Resolução da Chave da API do Google AI Studio
  let chaveApi = (config?.apiKey || '').trim();
  if (!chaveApi) {
    chaveApi = getGeminiApiKey(config?.loja);
  }
  if (!chaveApi && config?.loja?.id) {
    chaveApi = await obterOuBuscarGeminiApiKey(config?.loja);
  }

  // Se não houver chave configurada, realiza fallback transparente para Web Speech API
  if (!chaveApi) {
    executarFallbackWebSpeech(textoLimpo, config);
    return;
  }

  // 3. Chamada à API com Gemini 3.8 Flash TTS e Auto-Recuperação
  const abortController = new AbortController();
  abortControllerAtivo = abortController;

  const modelosParaTentar = [MODELO_PRIMARIO, ...MODELOS_FALLBACK];
  let audioData: { base64Data: string; mimeType: string } | null = null;

  for (const modelo of modelosParaTentar) {
    if (abortController.signal.aborted) break;

    try {
      audioData = await requisitarAudioGemini(
        modelo,
        textoLimpo,
        voiceName,
        chaveApi,
        abortController.signal
      );
      if (audioData) break;
    } catch (err: any) {
      if (abortController.signal.aborted) return;
      // Se for 404 (modelo não suportado pelo endpoint atual), tenta próximo modelo na lista
      const is404 = String(err?.message || '').includes('404');
      if (!is404) {
        console.warn(`[GeminiTTS] Falha temporária com modelo ${modelo}:`, err?.message || err);
      }
    }
  }

  // 4. Se obteve o áudio com sucesso, converte para Blob e reproduz
  if (audioData && !abortController.signal.aborted) {
    try {
      const blobUrl = base64AudioToBlobUrl(audioData.base64Data, audioData.mimeType);

      // Armazena no cache para frases repetidas
      if (cacheAudioUrls.size >= LIMITE_MAX_CACHE) {
        const primeiraChave = cacheAudioUrls.keys().next().value;
        if (primeiraChave) {
          const urlAntiga = cacheAudioUrls.get(primeiraChave);
          if (urlAntiga) {
            try {
              URL.revokeObjectURL(urlAntiga);
            } catch {}
          }
          cacheAudioUrls.delete(primeiraChave);
        }
      }
      cacheAudioUrls.set(cacheKey, blobUrl);

      await reproduzirBlobAudio(blobUrl, config);
      return;
    } catch (blobErr) {
      console.warn('[GeminiTTS] Erro ao decodificar dados de áudio Base64:', blobErr);
    }
  }

  // 5. Fallback silencioso para Web Speech API em caso de erro na API do Gemini
  if (!abortController.signal.aborted) {
    executarFallbackWebSpeech(textoLimpo, config);
  }
};
