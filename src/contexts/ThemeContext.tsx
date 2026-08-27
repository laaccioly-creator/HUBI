import React, { createContext, useContext, useState, useEffect } from 'react';

export type ModoTema = 'dark' | 'light' | 'system';

interface ThemeContextType {
  tema: ModoTema;
  temaEfetivo: 'dark' | 'light';
  setTema: (novoTema: ModoTema) => void;
  alternarTema: () => void;
}

const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

const STORAGE_KEY = 'hubi_theme_preference';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTemaState] = useState<ModoTema>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY) as ModoTema;
      if (salvo && ['dark', 'light', 'system'].includes(salvo)) {
        return salvo;
      }
    } catch {}
    return 'dark'; // Padrão Hubi
  });

  const [temaEfetivo, setTemaEfetivo] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const aplicarTema = () => {
      let efetivo: 'dark' | 'light' = 'dark';

      if (tema === 'system') {
        const prefereDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        efetivo = prefereDark ? 'dark' : 'light';
      } else {
        efetivo = tema;
      }

      setTemaEfetivo(efetivo);

      const root = document.documentElement;
      if (efetivo === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    aplicarTema();

    // Ouvir alterações do sistema operacional quando em modo system
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (tema === 'system') {
        aplicarTema();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [tema]);

  const setTema = (novoTema: ModoTema) => {
    setTemaState(novoTema);
    try {
      localStorage.setItem(STORAGE_KEY, novoTema);
    } catch {}
  };

  const alternarTema = () => {
    if (tema === 'dark') setTema('light');
    else if (tema === 'light') setTema('system');
    else setTema('dark');
  };

  return (
    <ThemeContext.Provider value={{ tema, temaEfetivo, setTema, alternarTema }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
