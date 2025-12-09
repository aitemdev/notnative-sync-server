import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertCircle, Check } from 'lucide-react';
import type { SyncStatus } from '../../../preload';
import { useAppStore } from '../../stores/app-store';

export function SyncIndicator() {
  const setShowLoginScreen = useAppStore((state) => state.setShowLoginScreen);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Load initial status and check authentication
    loadStatus();
    checkAuth();

    // Listen to status changes
    const unsubStatusChanged = window.electron.sync.onStatusChanged((data) => {
      setIsSyncing(data.isSyncing);
    });

    const unsubCompleted = window.electron.sync.onCompleted(() => {
      setLastError(null);
      loadStatus(); // Refresh status after sync
      checkAuth(); // Recheck auth
    });

    const unsubError = window.electron.sync.onError((data) => {
      setLastError(data.error);
      loadStatus();
      // If error is 401, user is not authenticated
      if (data.error?.includes('401') || data.error?.includes('Unauthorized')) {
        setIsAuthenticated(false);
      }
    });

    const unsubAuthSuccess = window.electron.sync.onAuthSuccess(() => {
      // Auth succeeded, update state immediately
      checkAuth();
      loadStatus();
    });

    return () => {
      unsubStatusChanged();
      unsubCompleted();
      unsubError();
      unsubAuthSuccess();
    };
  }, []);

  const checkAuth = async () => {
    try {
      const result = await window.electron.sync.getConfig();
      console.log('[SyncIndicator] checkAuth result:', result);
      if (result.success && result.config) {
        const isAuth = !!(result.config.serverUrl && result.config.userEmail);
        console.log('[SyncIndicator] isAuthenticated:', isAuth, 'serverUrl:', result.config.serverUrl, 'userEmail:', result.config.userEmail);
        setIsAuthenticated(isAuth);
      } else {
        console.log('[SyncIndicator] No config or not success');
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('[SyncIndicator] checkAuth error:', error);
      setIsAuthenticated(false);
    }
  };

  const loadStatus = async () => {
    try {
      const result = await window.electron.sync.status();
      console.log('[SyncIndicator] loadStatus result:', result);
      if (result.success && result.status) {
        setStatus(result.status);
        setIsAuthenticated(result.status.isLoggedIn);
      }
    } catch (error) {
      console.error('[SyncIndicator] loadStatus error:', error);
    }
  };

  const handleManualSync = async () => {
    if (!isAuthenticated) {
      setShowLoginScreen(true);
      return;
    }

    if (isSyncing) return;

    setLastError(null);
    const result = await window.electron.sync.manual();
    
    if (!result.success) {
      setLastError(result.error || 'Sync failed');
    }
  };

  // Determine indicator state
  const getIndicatorState = () => {
    if (!isAuthenticated) {
      return {
        icon: CloudOff,
        color: 'text-gray-400',
        bgColor: 'bg-gray-100 dark:bg-gray-700',
        tooltip: 'Not logged in - Click to sign in',
      };
    }

    if (isSyncing) {
      return {
        icon: RefreshCw,
        color: 'text-blue-500',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        tooltip: 'Syncing...',
        animate: true,
      };
    }

    if (lastError) {
      return {
        icon: AlertCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        tooltip: `Error: ${lastError}`,
      };
    }

    if (status && status.pendingChanges > 0) {
      return {
        icon: Cloud,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        tooltip: `${status.pendingChanges} change${status.pendingChanges > 1 ? 's' : ''} pending`,
        badge: status.pendingChanges,
      };
    }

    return {
      icon: Check,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      tooltip: 'Synced',
    };
  };

  const state = getIndicatorState();
  const Icon = state.icon;

  const formatLastSync = () => {
    if (!status?.lastSync) return 'Never';
    
    const diff = Date.now() - status.lastSync;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <div className="relative">
      <button
        onClick={handleManualSync}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={isSyncing}
        className={`
          relative p-2 rounded-lg transition-all
          ${state.bgColor}
          hover:opacity-80
          disabled:cursor-not-allowed
        `}
        title={state.tooltip}
      >
        <Icon 
          className={`
            w-4 h-4 ${state.color}
            ${state.animate ? 'animate-spin' : ''}
          `}
        />
        
        {/* Badge for pending changes */}
        {state.badge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 text-white 
                         text-[10px] font-bold rounded-full flex items-center justify-center">
            {state.badge > 9 ? '9+' : state.badge}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && status && (
        <div className="absolute top-full right-0 mt-2 w-48 p-3 bg-gray-900 dark:bg-gray-800 
                      text-white text-xs rounded-lg shadow-lg z-50">
          <div className="space-y-1">
            <div className="font-semibold">{state.tooltip}</div>
            {status.isLoggedIn && (
              <>
                <div className="text-gray-300 dark:text-gray-400">
                  Last sync: {formatLastSync()}
                </div>
                <div className="text-gray-300 dark:text-gray-400">
                  Click to sync now
                </div>
              </>
            )}
          </div>
          {/* Arrow */}
          <div className="absolute -top-1 right-3 w-2 h-2 bg-gray-900 dark:bg-gray-800 
                        transform rotate-45"></div>
        </div>
      )}
    </div>
  );
}
