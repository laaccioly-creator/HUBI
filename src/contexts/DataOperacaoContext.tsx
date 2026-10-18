import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
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
  podeAlterarData: boolean;
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
  const { usuario, loja, recarregarDadosLoja } = useAuth();
  const ehOwner = usuario?.perfil === 'owner';
  const podeAlterarData = ehOwner || usuario?.perfil === 'admin';

  const [dataSimulada, setDataSimulada] = useState<string | null>(() => obterDataSimuladaSalva());
  const [horaSimulada, setHoraSimulada] = useState<string | null>(() => obterHoraSimuladaSalva());
  const [modoAtivo, setModoAtivo] = useState<boolean>(() => isModoSimulacaoAtivo());
  const [modalAberto, setModalAberto] = useState<boolean>(false);
  const [sincronizado, setSincronizado] = useState<boolean>(() => isServidorSincronizado());

  // Sincroniza a data operacional global diretamente do banco da loja ativa (100% dos operadores)
  useEffect(() => {
    const simLoja = loja?.configuracoes_extras?.simulacao_data_operacao;
    if (simLoja?.ativa && simLoja?.dataYMD) {
      definirDataOperacao(simLoja.dataYMD, simLoja.horaHM || null);
      setDataSimulada(simLoja.dataYMD);
      setHoraSimulada(simLoja.horaHM || null);
      setModoAtivo(true);
    } else if (loja && (!simLoja || !simLoja.ativa)) {
      if (isModoSimulacaoAtivo()) {
        limparDataOperacao();
        setDataSimulada(null);
        setHoraSimulada(null);
        setModoAtivo(false);
      }
    }
  }, [loja?.id, loja?.configuracoes_extras?.simulacao_data_operacao]);

  // Sincroniza com servidor Supabase
  useEffect(() => {
    sincronizarHorarioServidor().then(() => {
      setSincronizado(true);
    });
  }, []);

  // Ouve eventos de alteração de data
  const sincronizarEstadosLocais = useCallback(() => {
    const dataSalva = obterDataSimuladaSalva();
    const horaSalva = obterHoraSimuladaSalva();
    const ativo = isModoSimulacaoAtivo();

    setDataSimulada(dataSalva);
    setHoraSimulada(horaSalva);
    setModoAtivo(ativo);
  }, []);

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
    if (!podeAlterarData) return;
    setModalAberto(true);
  }, [podeAlterarData]);

  const fecharModal = useCallback(() => {
    setModalAberto(false);
  }, []);

  const definirData = useCallback(async (dataYMD: string, horaHM?: string | null) => {
    if (!podeAlterarData) return;
    definirDataOperacao(dataYMD, horaHM);
    setDataSimulada(dataYMD);
    setHoraSimulada(horaHM || null);
    setModoAtivo(true);
    setModalAberto(false);

    if (loja?.id) {
      const extras = { ...(loja.configuracoes_extras || {}) };
      extras.simulacao_data_operacao = {
        ativa: true,
        dataYMD,
        horaHM: horaHM || null
      };
      try {
        const { error } = await supabase.from('lojas').update({ configuracoes_extras: extras }).eq('id', loja.id);
        if (error) {
          console.error('Erro ao salvar data simulada na loja:', error);
        } else if (recarregarDadosLoja) {
          await recarregarDadosLoja();
        }
      } catch (e) {
        console.error('Erro ao atualizar simulacao_data_operacao:', e);
      }
    }
  }, [podeAlterarData, loja, recarregarDadosLoja]);

  const restaurarParaHoje = useCallback(async () => {
    if (!podeAlterarData) return;
    limparDataOperacao();
    setDataSimulada(null);
    setHoraSimulada(null);
    setModoAtivo(false);
    setModalAberto(false);

    if (loja?.id) {
      const extras = { ...(loja.configuracoes_extras || {}) };
      delete extras.simulacao_data_operacao;
      try {
        const { error } = await supabase.from('lojas').update({ configuracoes_extras: extras }).eq('id', loja.id);
        if (error) {
          console.error('Erro ao restaurar data simulada na loja:', error);
        } else if (recarregarDadosLoja) {
          await recarregarDadosLoja();
        }
      } catch (e) {
        console.error('Erro ao restaurar simulacao_data_operacao:', e);
      }
    }
  }, [podeAlterarData, loja, recarregarDadosLoja]);

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
        modoSimulacaoAtivo: modoAtivo,
        ehOwner,
        podeAlterarData,
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
