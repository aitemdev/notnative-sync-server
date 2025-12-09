import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import MainLayout from './components/layout/MainLayout';
import QuickNote from './components/quicknote/QuickNote';
import { ThemeProvider } from './components/common/ThemeProvider';
import { SettingsModal } from './components/common/SettingsModal';
import { LoginScreen } from './components/sync/LoginScreen';
import { useAppStore } from './stores/app-store';

function App() {
  const showLoginScreen = useAppStore((state) => state.showLoginScreen);
  const setShowLoginScreen = useAppStore((state) => state.setShowLoginScreen);

  useEffect(() => {
    // Listen for sync errors (like 401 unauthorized)
    const unsubscribe = window.electron.sync.onError((data) => {
      if (data.error.includes('401') || data.error.includes('Unauthorized')) {
        setShowLoginScreen(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setShowLoginScreen]);

  const handleLoginSuccess = () => {
    setShowLoginScreen(false);
  };

  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<MainLayout />} />
        <Route path="/quicknote" element={<QuickNote />} />
      </Routes>
      <SettingsModal />
      {showLoginScreen && (
        <LoginScreen onLoginSuccess={handleLoginSuccess} onClose={() => setShowLoginScreen(false)} />
      )}
    </ThemeProvider>
  );
}

export default App;
