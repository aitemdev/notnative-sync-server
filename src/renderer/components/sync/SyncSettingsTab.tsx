import React, { useState, useEffect } from 'react';
import { Cloud, LogOut, RefreshCw, Trash2, Smartphone } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  lastSync: string;
  isCurrent: boolean;
}

export function SyncSettingsTab() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadSyncStatus = async () => {
      try {
        const result = await window.electron.sync.status();
        const configResult = await window.electron.sync.getConfig();
        
        console.log('[SyncSettingsTab] status result:', result);
        console.log('[SyncSettingsTab] config result:', configResult);
        
        if (result.success && result.status) {
          const status = result.status;
          setIsLoggedIn(status.isLoggedIn);
          
          if (configResult.success && configResult.config) {
            console.log('[SyncSettingsTab] Setting serverUrl:', configResult.config.serverUrl, 'userEmail:', configResult.config.userEmail);
            setServerUrl(configResult.config.serverUrl || '');
            setUserEmail(configResult.config.userEmail || '');
          }

          // TODO: Load devices from server
          // For now, mock data
          if (status.isLoggedIn) {
            setDevices([
              {
                id: '1',
                name: 'Este dispositivo',
                lastSync: status.lastSync ? new Date(status.lastSync).toISOString() : new Date().toISOString(),
                isCurrent: true,
              },
            ]);
          }
        }
      } catch (error) {
        console.error('Failed to load sync status:', error);
      }
    };

    void loadSyncStatus();
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await window.electron.sync.logout();
      setIsLoggedIn(false);
      setServerUrl('');
      setUserEmail('');
      setDevices([]);
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setLoading(true);
    try {
      await window.electron.sync.manual();
    } catch (error) {
      console.error('Manual sync failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-surface0">
          <Cloud className="text-subtext0" size={24} />
          <div>
            <h3 className="font-medium text-text">Sincronización desactivada</h3>
            <p className="text-sm text-subtext1">
              Inicia sesión desde el indicador de sincronización en la barra de estado para sincronizar tus notas con el servidor.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account info */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text uppercase tracking-wide">Cuenta</h3>
        <div className="space-y-2 p-4 rounded-lg bg-surface0">
          <div className="flex justify-between items-center">
            <span className="text-sm text-subtext1">Email:</span>
            <span className="text-sm text-text font-medium">{userEmail}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-subtext1">Servidor:</span>
            <span className="text-sm text-text font-mono">{serverUrl}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text uppercase tracking-wide">Acciones</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleManualSync}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-lavender/20 hover:bg-lavender/30 text-lavender transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="text-sm font-medium">Sincronizar ahora</span>
          </button>
          
          <button
            onClick={handleLogout}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red/20 hover:bg-red/30 text-red transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogOut size={16} />
            <span className="text-sm font-medium">Cerrar sesión</span>
          </button>
        </div>
      </div>

      {/* Devices */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text uppercase tracking-wide">Dispositivos</h3>
        <div className="space-y-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between p-3 rounded-lg bg-surface0"
            >
              <div className="flex items-center gap-3">
                <Smartphone size={20} className="text-lavender" />
                <div>
                  <p className="text-sm font-medium text-text">
                    {device.name}
                    {device.isCurrent && (
                      <span className="ml-2 text-xs text-lavender">(Actual)</span>
                    )}
                  </p>
                  <p className="text-xs text-subtext1">
                    Última sincronización: {new Date(device.lastSync).toLocaleString()}
                  </p>
                </div>
              </div>
              {!device.isCurrent && (
                <button
                  className="p-2 rounded-lg hover:bg-surface1 text-red transition-colors"
                  title="Eliminar dispositivo"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 rounded-lg bg-yellow/10 border border-yellow/20">
        <p className="text-sm text-yellow">
          <strong>Nota:</strong> La sincronización automática se realiza cada 3 minutos cuando hay conexión con el servidor.
        </p>
      </div>
    </div>
  );
}
