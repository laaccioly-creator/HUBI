import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import {
  obterDataOperacao,
  obterDataOperacaoISO,
  obterDataOperacaoYMD,
  obterDataSimuladaSalva,
  obterHoraSimuladaSalva,
  isModoSimulacaoAtivo,
  definirDataOperacao,
  limparDataOperacao,
  isServidorSincronizado,
  sincronizarHorarioServidor,
  EVENTO_DATA_OPERACAO_ALTERADA
} from '../utils/dataOperacao';

interface DataOperacaoContextType {
  dataSimulada: string | null;
  horaSimulada: string | null;
  modoSimulacaoAtivo: boolean;
  ehOwner: boolean;
  servidorSincronizado: boolean;
  modalAberto: boolean;
  abrirModal: () => void;
  fecharModal: () => void;
  definirData: (dataYMD: string, horaHM?: string | null) => void;
  restaurarParaHoje: () => void;
  obterDataAtual: () => Date;
  obterDataAtualISO: () => string;
  dataOperacaoYMD: string;
  dataOperacaoFormatada: string;
}

const DataOperacaoContext = createContext<DataOperacaoContextType | undefined>(undefined);

export const DataOperacaoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { usuario } = useAuth();
  const ehOwner = usuario?.perfil === 'owner';

  const [dataSimulada, setDataSimulada] = useState<string | null>(() => obterDataSimuladaSalva());
  const [horaSimulada, setHoraSimulada] = useState<string | null>(() => obterHoraSimuladaSalva());
  const [modoAtivo, setModoAtivo] = useState<boolean>(() => isModoSimulacaoAtivo());
  const [modalAberto, setModalAberto] = useState<boolean>(false);
  const [sincronizado, setSincronizado] = useState<boolean>(() => isServidorSincronizado());

  // Garante que se o usuário deslogar ou não for Owner, a simulação é limpa
  useEffect(() => {
    if (usuario && !ehOwner && isModoSimulacaoAtivo()) {
      limparDataOperacao();
      setDataSimulada(null);
      setHoraSimulada(null);
      setModoAtivo(false);
    }
  }, [usuario, ehOwner]);

  // Sincroniza com servidor Supabase
  useEffect(() => {
    sincronizarHorarioServidor().then(() => {
      setSincronizado(true);
    });
  }, []);

  // Ouve eventos de alteração de data
  const sincronizarEstadosLocais = useCallback(() => {
    const ativa = isModoSimulacaoAtivo();
    const dataSalva = obterDataSimuladaSalva();
    const horaSalva = obterHoraSimuladaSalva();

    // Regra estrita: se não for Owner, nunca ativa simulação
    if (!ehOwner) {
      setModoAtivo(false);
      setDataSimulada(null);
      setHoraSimulada(null);
      return;
    }

    setModoAtivo(ativa);
    setDataSimulada(dataSalva);
    setHoraSimulada(horaSalva);
  }, [ehOwner]);

  useEffect(() => {
    sincronizarEstadosLocais();

    const handleMudanca = () => {
      sincronizarEstadosLocais();
    };

    window.addEventListener(EVENTO_DATA_OPERACAO_ALTERADA, handleMudanca);
    window.addEventListener('storage', handleMudanca);

    return () => {
      window.removeEventListener(EVENTO_DATA_OPERACAO_ALTERADA, handleMudanca);
      window.removeEventListener('storage', handleMudanca);
    };
  }, [sincronizarEstadosLocais]);

  const abrirModal = useCallback(() => {
    if (!ehOwner) return;
    setModalAberto(true);
  }, [ehOwner]);

  const fecharModal = useCallback(() => {
    setModalAberto(false);
  }, []);

  const definirData = useCallback((dataYMD: string, horaHM?: string | null) => {
    if (!ehOwner) return;
    definirDataOperacao(dataYMD, horaHM);
    setDataSimulada(dataYMD);
    setHoraSimulada(horaHM || null);
    setModoAtivo(true);
    setModalAberto(false);
  }, [ehOwner]);

  const restaurarParaHoje = useCallback(() => {
    limparDataOperacao();
    setDataSimulada(null);
    setHoraSimulada(null);
    setModoAtivo(false);
    setModalAberto(false);
  }, []);

  const dataOperacaoYMD = useMemo(() => {
    return obterDataOperacaoYMD();
  }, [dataSimulada, modoAtivo, sincronizado]);

  const dataOperacaoFormatada = useMemo(() => {
    const d = obterDataOperacao();
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }, [dataSimulada, modoAtivo, sincronizado]);

  return (
    <DataOperacaoContext.Provider
      value={{
        dataSimulada,
        horaSimulada,
        modoSimulacaoAtivo: ehOwner && modoAtivo,
        ehOwner,
        servidorSincronizado: sincronizado,
        modalAberto,
        abrirModal,
        fecharModal,
        definirData,
        restaurarParaHoje,
        obterDataAtual: obterDataOperacao,
        obterDataAtualISO: obterDataOperacaoISO,
        dataOperacaoYMD,
        dataOperacaoFormatada
      }}
    >
      {children}
    </DataOperacaoContext.Provider>
  );
};

export const useDataOperacao = (): DataOperacaoContextType => {
  const context = useContext(DataOperacaoContext);
  if (!context) {
    throw new Error('useDataOperacao deve ser utilizado dentro de um DataOperacaoProvider');
  }
  return context;
};
