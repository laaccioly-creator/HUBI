import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { overlayStackService } from '../services/overlayStackService';
import { useFeedbackModal } from '../contexts/FeedbackContext';

interface UseGlobalNavigationOptions {
  fallbackPath?: string;
  onBeforeVoltar?: () => boolean | void;
}

export function useGlobalNavigation(options: UseGlobalNavigationOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { verificarSaidaComConfirmacao } = useFeedbackModal();
  const fallbackPath = options.fallbackPath || '/pos';

  const voltar = useCallback(() => {
    if (options.onBeforeVoltar) {
      const impediu = options.onBeforeVoltar();
      if (impediu === false) return;
    }

    // Nível 1: Se houver overlay registrado (modal/drawer/popover), fecha o overlay do topo
    const fechouOverlay = overlayStackService.handleEscape();
    if (fechouOverlay) {
      return;
    }

    // Nível 2: Se não houver overlay, retrocede no histórico com confirmação se necessário
    verificarSaidaComConfirmacao(() => {
      if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
        navigate(-1);
      } else {
        navigate(fallbackPath);
      }
    });
  }, [navigate, fallbackPath, options, verificarSaidaComConfirmacao]);

  return {
    voltar,
    location,
    navigate
  };
}
