import { Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import QuickNote from './components/quicknote/QuickNote';
import { ThemeProvider } from './components/common/ThemeProvider';
import { SettingsModal } from './components/common/SettingsModal';

function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<MainLayout />} />
        <Route path="/quicknote" element={<QuickNote />} />
      </Routes>
      <SettingsModal />
    </ThemeProvider>
  );
}

export default App;
