export interface OverlayItem {
  id: string;
  onClose: () => void;
  tipo?: 'modal' | 'drawer' | 'popover' | 'submenu';
}

class OverlayStackService {
  private stack: OverlayItem[] = [];
  private isHandlingPopstate = false;
  private ignorePopstateCount = 0;
  private pendingRemoval: { id: string } | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;

  public push(item: OverlayItem) {
    this.stack = this.stack.filter(s => s.id !== item.id);
    this.stack.push(item);

    if (typeof window !== 'undefined' && window.history && !this.isHandlingPopstate) {
      // Se houver uma remoção pendente de overlay no mesmo ciclo (ex: modal desdobramento -> drawer analítico),
      // realiza a substituição atômica no histórico (replaceState) em vez de disparar back() ou empilhar estado duplicado
      if (this.pendingRemoval) {
        if (this.syncTimeout) {
          clearTimeout(this.syncTimeout);
          this.syncTimeout = null;
        }
        this.pendingRemoval = null;
        window.history.replaceState({ hubiOverlayId: item.id }, '');
        return;
      }

      window.history.pushState({ hubiOverlayId: item.id }, '');
    }
  }

  public remove(id: string) {
    const idx = this.stack.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.stack.splice(idx, 1);
    }

    if (!this.isHandlingPopstate && typeof window !== 'undefined' && window.history) {
      if (window.history.state?.hubiOverlayId === id) {
        // Agenda a sincronização do histórico para o final do ciclo de renderização do React (micro-turn)
        // permitindo que transições atômicas entre overlays substituam o estado sem disparar back() indesejado
        if (this.syncTimeout) {
          clearTimeout(this.syncTimeout);
        }
        this.pendingRemoval = { id };

        this.syncTimeout = setTimeout(() => {
          this.syncTimeout = null;
          if (this.pendingRemoval?.id === id) {
            this.pendingRemoval = null;
            if (this.stack.length === 0) {
              if (window.history.state?.hubiOverlayId === id) {
                this.ignorePopstateCount++;
                window.history.back();
              }
            } else {
              const topItem = this.getTop();
              if (topItem) {
                window.history.replaceState({ hubiOverlayId: topItem.id }, '');
              }
            }
          }
        }, 0);
      }
    }
  }

  public getCount(): number {
    return this.stack.length;
  }

  public getTop(): OverlayItem | undefined {
    return this.stack[this.stack.length - 1];
  }

  public handlePopstate(): boolean {
    if (this.ignorePopstateCount > 0) {
      this.ignorePopstateCount--;
      return true;
    }

    if (this.stack.length > 0) {
      this.isHandlingPopstate = true;
      const top = this.stack.pop();
      try {
        top?.onClose();
      } finally {
        this.isHandlingPopstate = false;
      }
      return true;
    }
    return false;
  }

  public handleEscape(): boolean {
    if (this.stack.length > 0) {
      const top = this.stack.pop();
      if (top) {
        if (typeof window !== 'undefined' && window.history && window.history.state?.hubiOverlayId === top.id) {
          this.ignorePopstateCount++;
          window.history.back();
        }
        top.onClose();
        return true;
      }
    }
    return false;
  }
}

export const overlayStackService = new OverlayStackService();
