import React, { createContext, useContext, useState, useCallback } from 'react';
import { ModalAlertaFeedback, TipoFeedback } from '../components/ModalAlertaFeedback';

interface AlertaOpcoes {
  tipo?: TipoFeedback;
  titulo?: string;
  mensagem: string;
  detalhes?: string;
  textoBotaoConfirmar?: string;
  onConfirmar?: () => void;
  mostrarBotaoCancelar?: boolean;
  textoBotaoCancelar?: string;
  onCancelar?: () => void;
}

interface ConfirmarOpcoes {
  titulo?: string;
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  onConfirmar: () => void;
  onCancelar?: () => void;
}

interface FeedbackContextData {
  mostrarAlerta: (opcoes: AlertaOpcoes) => void;
  mostrarSucesso: (mensagem: string, titulo?: string) => void;
  mostrarErro: (mensagem: string, titulo?: string) => void;
  mostrarAviso: (mensagem: string, titulo?: string) => void;
  confirmar: (opcoes: ConfirmarOpcoes) => void;
  temAlteracoesNaoSalvas: boolean;
  setTemAlteracoesNaoSalvas: (valor: boolean) => void;
  verificarSaidaComConfirmacao: (onProsseguir: () => void) => void;
}

const FeedbackContext = createContext<FeedbackContextData>({} as FeedbackContextData);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalConfig, setModalConfig] = useState<AlertaOpcoes | null>(null);
  const [aberto, setAberto] = useState<boolean>(false);
  const [temAlteracoesNaoSalvas, setTemAlteracoesNaoSalvas] = useState<boolean>(false);

  const fecharModal = useCallback(() => {
    setAberto(false);
    setTimeout(() => {
      setModalConfig(null);
    }, 200);
  }, []);

  const mostrarAlerta = useCallback((opcoes: AlertaOpcoes) => {
    setModalConfig(opcoes);
    setAberto(true);
  }, []);

  const mostrarSucesso = useCallback((mensagem: string, titulo?: string) => {
    mostrarAlerta({
      tipo: 'sucesso',
      titulo: titulo || 'Sucesso!',
      mensagem,
      textoBotaoConfirmar: 'Entendido'
    });
  }, [mostrarAlerta]);

  const mostrarErro = useCallback((mensagem: string, titulo?: string) => {
    mostrarAlerta({
      tipo: 'erro',
      titulo: titulo || 'Atenção',
      mensagem,
      textoBotaoConfirmar: 'Fechar'
    });
  }, [mostrarAlerta]);

  const mostrarAviso = useCallback((mensagem: string, titulo?: string) => {
    mostrarAlerta({
      tipo: 'aviso',
      titulo: titulo || 'Aviso',
      mensagem,
      textoBotaoConfirmar: 'OK'
    });
  }, [mostrarAlerta]);

  const confirmar = useCallback((opcoes: ConfirmarOpcoes) => {
    mostrarAlerta({
      tipo: 'aviso',
      titulo: opcoes.titulo || 'Confirmar Ação',
      mensagem: opcoes.mensagem,
      textoBotaoConfirmar: opcoes.textoConfirmar || 'Sim, confirmar',
      mostrarBotaoCancelar: true,
      textoBotaoCancelar: opcoes.textoCancelar || 'Não, cancelar',
      onConfirmar: () => {
        fecharModal();
        opcoes.onConfirmar();
      },
      onCancelar: () => {
        fecharModal();
        if (opcoes.onCancelar) opcoes.onCancelar();
      }
    });
  }, [mostrarAlerta, fecharModal]);

  const verificarSaidaComConfirmacao = useCallback((onProsseguir: () => void) => {
    if (temAlteracoesNaoSalvas) {
      confirmar({
        titulo: 'Alterações Não Salvas',
        mensagem: 'Você fez alterações que ainda não foram salvas. Se sair agora, as alterações serão perdidas.',
        textoConfirmar: 'Sair sem salvar',
        textoCancelar: 'Continuar editando',
        onConfirmar: () => {
          setTemAlteracoesNaoSalvas(false);
          onProsseguir();
        }
      });
    } else {
      onProsseguir();
    }
  }, [temAlteracoesNaoSalvas, confirmar]);

  return (
    <FeedbackContext.Provider
      value={{
        mostrarAlerta,
        mostrarSucesso,
        mostrarErro,
        mostrarAviso,
        confirmar,
        temAlteracoesNaoSalvas,
        setTemAlteracoesNaoSalvas,
        verificarSaidaComConfirmacao
      }}
    >
      {children}

      {modalConfig && (
        <ModalAlertaFeedback
          aberto={aberto}
          onClose={fecharModal}
          tipo={modalConfig.tipo}
          titulo={modalConfig.titulo}
          mensagem={modalConfig.mensagem}
          detalhes={modalConfig.detalhes}
          textoBotaoConfirmar={modalConfig.textoBotaoConfirmar}
          onConfirmar={() => {
            if (modalConfig.onConfirmar) {
              modalConfig.onConfirmar();
            }
            fecharModal();
          }}
          mostrarBotaoCancelar={modalConfig.mostrarBotaoCancelar}
          textoBotaoCancelar={modalConfig.textoBotaoCancelar}
          onCancelar={() => {
            if (modalConfig.onCancelar) {
              modalConfig.onCancelar();
            }
            fecharModal();
          }}
        />
      )}
    </FeedbackContext.Provider>
  );
};

export const useFeedbackModal = () => useContext(FeedbackContext);
