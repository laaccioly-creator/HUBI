export interface OverlayItem {
  id: string;
  onClose: () => void;
  tipo?: 'modal' | 'drawer' | 'popover' | 'submenu';
}

class OverlayStackService {
  private stack: OverlayItem[] = [];
  private isHandlingPopstate = false;

  public push(item: OverlayItem) {
    this.stack = this.stack.filter(s => s.id !== item.id);
    this.stack.push(item);

    if (typeof window !== 'undefined' && window.history && !this.isHandlingPopstate) {
      window.history.pushState({ hubiOverlayId: item.id }, '');
    }
  }

  public remove(id: string) {
    const idx = this.stack.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.stack.splice(idx, 1);
      if (!this.isHandlingPopstate && typeof window !== 'undefined' && window.history) {
        if (window.history.state?.hubiOverlayId === id) {
          window.history.back();
        }
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
          this.isHandlingPopstate = true;
          window.history.back();
          this.isHandlingPopstate = false;
        }
        top.onClose();
        return true;
      }
    }
    return false;
  }
}

export const overlayStackService = new OverlayStackService();
