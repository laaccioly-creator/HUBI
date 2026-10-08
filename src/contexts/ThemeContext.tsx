import React, { createContext, useContext, useState, useEffect } from 'react';

export type ModoTema = 'dark' | 'light';

interface ThemeContextType {
  tema: ModoTema;
  isDark: boolean;
  setTema: (novoTema: ModoTema) => void;
  alternarTema: () => void;
}

const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

const STORAGE_KEY = 'theme-preference';
const LEGACY_STORAGE_KEY = 'hubi_theme_preference';

const detectarEhMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth < 768 ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTemaState] = useState<ModoTema>(() => {
    try {
      const salvo = (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)) as ModoTema;
      if (salvo && (salvo === 'dark' || salvo === 'light')) {
        return salvo;
      }
    } catch {}

    // Padrão inicial do Mobile: Definir o tema Claro (light) como padrão (default) caso não haja preferência salva
    if (detectarEhMobile()) {
      return 'light';
    }

    // Padrão Desktop caso não haja preferência salva
    return 'dark';
  });

  useEffect(() => {
    const pathname = typeof window !== 'undefined' ? (window.location.pathname || '') : '';
    const isReciboRoute = pathname.includes('/recibo/') || pathname.includes('/recibo-publico/');
    const root = document.documentElement;

    if (isReciboRoute) {
      root.classList.remove('dark');
      root.classList.add('light');
      root.style.colorScheme = 'light';
      return;
    }

    if (tema === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [tema]);

  // Sincronizar preferências entre abas do navegador
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if ((e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) && e.newValue) {
        if (e.newValue === 'dark' || e.newValue === 'light') {
          setTemaState(e.newValue as ModoTema);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const setTema = (novoTema: ModoTema) => {
    setTemaState(novoTema);
    try {
      localStorage.setItem(STORAGE_KEY, novoTema);
      localStorage.setItem(LEGACY_STORAGE_KEY, novoTema);
    } catch {}
  };

  const alternarTema = () => {
    setTema(tema === 'dark' ? 'light' : 'dark');
  };

  const isDark = tema === 'dark';

  return (
    <ThemeContext.Provider value={{ tema, isDark, setTema, alternarTema }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
