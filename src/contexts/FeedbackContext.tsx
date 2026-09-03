import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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
      titulo: titulo || 'Erro',
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

  // Interceptação global de window.alert para garantir que nenhuma mensagem nativa do navegador seja exibida
  useEffect(() => {
    const originalAlert = window.alert;

    window.alert = (msg?: any) => {
      const texto = String(msg ?? '');
      const textoLower = texto.toLowerCase();

      if (
        textoLower.includes('sucesso') ||
        textoLower.includes('aberto com sucesso') ||
        textoLower.includes('salvo com sucesso') ||
        textoLower.includes('salva com sucesso') ||
        textoLower.includes('atualizado com sucesso') ||
        textoLower.includes('atualizada com sucesso') ||
        textoLower.includes('cadastrado com sucesso') ||
        textoLower.includes('excluído com sucesso') ||
        textoLower.includes('excluido com sucesso') ||
        textoLower.includes('registrado com sucesso') ||
        textoLower.includes('registrada com sucesso') ||
        textoLower.includes('ajustado com sucesso') ||
        textoLower.includes('concluído com sucesso') ||
        textoLower.includes('concluido com sucesso')
      ) {
        mostrarSucesso(texto);
      } else if (
        textoLower.includes('erro') ||
        textoLower.includes('falha') ||
        textoLower.includes('não foi possível') ||
        textoLower.includes('nao foi possivel') ||
        textoLower.includes('não é possível') ||
        textoLower.includes('nao e possivel')
      ) {
        mostrarErro(texto);
      } else if (
        textoLower.includes('atenção') ||
        textoLower.includes('atencao') ||
        textoLower.includes('aviso') ||
        textoLower.includes('restrita') ||
        textoLower.includes('permissão') ||
        textoLower.includes('permissao') ||
        textoLower.includes('informe') ||
        textoLower.includes('preencha') ||
        textoLower.includes('obrigatório') ||
        textoLower.includes('obrigatorio') ||
        textoLower.includes('insuficiente') ||
        textoLower.includes('excede') ||
        textoLower.includes('não encontrado') ||
        textoLower.includes('nao encontrado') ||
        textoLower.includes('não suportada') ||
        textoLower.includes('nao suportada')
      ) {
        mostrarAviso(texto);
      } else {
        mostrarAlerta({
          tipo: 'info',
          titulo: 'Mensagem do Sistema',
          mensagem: texto,
          textoBotaoConfirmar: 'Entendido'
        });
      }
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [mostrarAlerta, mostrarSucesso, mostrarErro, mostrarAviso]);

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
