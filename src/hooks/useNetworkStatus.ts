// Hook para monitoramento de conexão e disparo de sincronização offline

import { useState, useEffect, useCallback } from 'react';
import { SyncService } from '../services/syncService';

export const useNetworkStatus = (lojaId?: string) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendentesCount, setPendentesCount] = useState<number>(0);
  const [sincronizando, setSincronizando] = useState<boolean>(false);
  const [ultimoSyncMsg, setUltimoSyncMsg] = useState<string | null>(null);

  const atualizarContadorPendentes = useCallback(async () => {
    try {
      const count = await SyncService.obterQuantidadePendentes();
      setPendentesCount(count);
    } catch {
      // Ignora erro
    }
  }, []);

  const sincronizarAgora = useCallback(async () => {
    if (!lojaId || !navigator.onLine) return;
    try {
      setSincronizando(true);
      const res = await SyncService.sincronizarFilaComNuvem(lojaId);
      setPendentesCount(res.pendentesRestantes);
      if (res.sucessoCount > 0) {
        setUltimoSyncMsg(`✨ ${res.sucessoCount} venda(s) sincronizada(s) com a nuvem!`);
        setTimeout(() => setUltimoSyncMsg(null), 4000);
      }
    } catch (err: any) {
      console.error('Erro na sincronização manual:', err);
    } finally {
      setSincronizando(false);
    }
  }, [lojaId]);

  useEffect(() => {
    atualizarContadorPendentes();

    const handleOnline = () => {
      setIsOnline(true);
      if (lojaId) {
        sincronizarAgora();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      atualizarContadorPendentes();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Intervalo suave a cada 15 segundos para conferir fila pendente
    const interval = setInterval(() => {
      atualizarContadorPendentes();
      if (navigator.onLine && lojaId && pendentesCount > 0) {
        sincronizarAgora();
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [lojaId, sincronizarAgora, atualizarContadorPendentes, pendentesCount]);

  return {
    isOnline,
    pendentesCount,
    sincronizando,
    ultimoSyncMsg,
    atualizarContadorPendentes,
    sincronizarAgora
  };
};
