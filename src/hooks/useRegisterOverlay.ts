import { useEffect, useRef } from 'react';
import { overlayStackService } from '../services/overlayStackService';

export function useRegisterOverlay(
  isOpen: boolean,
  onClose: () => void,
  id: string,
  tipo?: 'modal' | 'drawer' | 'popover' | 'submenu'
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    overlayStackService.push({
      id,
      onClose: () => onCloseRef.current(),
      tipo
    });

    return () => {
      overlayStackService.remove(id);
    };
  }, [isOpen, id, tipo]);
}
