import { Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import QuickNote from './components/quicknote/QuickNote';
import { useEffect } from 'react';
import { useAppStore } from './stores/app-store';

function App() {
  const setTheme = useAppStore(state => state.setTheme);

  useEffect(() => {
    // Get initial theme
    window.electron.app.getTheme().then(theme => {
      setTheme(theme);
      
      // Apply theme class
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const currentTheme = useAppStore.getState().theme;
      if (currentTheme === 'system') {
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [setTheme]);

  return (
    <Routes>
      <Route path="/" element={<MainLayout />} />
      <Route path="/quicknote" element={<QuickNote />} />
    </Routes>
  );
}

export default App;
