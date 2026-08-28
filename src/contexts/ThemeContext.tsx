import React, { createContext, useContext, useState, useEffect } from 'react';

export type ModoTema = 'dark' | 'light';

interface ThemeContextType {
  tema: ModoTema;
  setTema: (novoTema: ModoTema) => void;
  alternarTema: () => void;
}

const ThemeContext = createContext<ThemeContextType>({} as ThemeContextType);

const STORAGE_KEY = 'hubi_theme_preference';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTemaState] = useState<ModoTema>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY) as ModoTema;
      if (salvo && ['dark', 'light'].includes(salvo)) {
        return salvo;
      }
    } catch {}
    return 'dark'; // Padrão Hubi
  });

  useEffect(() => {
    const root = document.documentElement;
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

  const setTema = (novoTema: ModoTema) => {
    setTemaState(novoTema);
    try {
      localStorage.setItem(STORAGE_KEY, novoTema);
    } catch {}
  };

  const alternarTema = () => {
    setTema(tema === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ tema, setTema, alternarTema }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
