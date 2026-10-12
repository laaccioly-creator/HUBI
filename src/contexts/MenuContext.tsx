import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface MenuContextType {
  mobileMenuOpen: boolean;
  abrirMenuMobile: () => void;
  fecharMenuMobile: () => void;
  alternarMenuMobile: () => void;
  setMobileMenuOpen: (aberto: boolean) => void;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

export const MenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const abrirMenuMobile = useCallback(() => {
    setMobileMenuOpen(true);
  }, []);

  const fecharMenuMobile = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const alternarMenuMobile = useCallback(() => {
    setMobileMenuOpen(prev => !prev);
  }, []);

  const value = useMemo(() => ({
    mobileMenuOpen,
    abrirMenuMobile,
    fecharMenuMobile,
    alternarMenuMobile,
    setMobileMenuOpen
  }), [mobileMenuOpen, abrirMenuMobile, fecharMenuMobile, alternarMenuMobile]);

  return (
    <MenuContext.Provider value={value}>
      {children}
    </MenuContext.Provider>
  );
};

export const useMenu = (): MenuContextType => {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error('useMenu deve ser utilizado dentro de um MenuProvider');
  }
  return context;
};
