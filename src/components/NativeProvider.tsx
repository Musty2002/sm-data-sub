import { ReactNode, createContext, useContext } from 'react';
import { useNativeFeatures } from '@/hooks/useNativeFeatures';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useKeepAlive } from '@/hooks/useKeepAlive';
import { useInstallReferrer } from '@/hooks/useInstallReferrer';

interface NativeContextType {
  isNative: boolean;
  networkStatus: { connected: boolean; connectionType: string };
  deviceInfo: any;
  hapticLight: () => Promise<void>;
  hapticMedium: () => Promise<void>;
  hapticHeavy: () => Promise<void>;
  share: (options: { title?: string; text?: string; url?: string }) => Promise<boolean>;
  copyToClipboard: (text: string) => Promise<boolean>;
  readFromClipboard: () => Promise<string | null>;
  openBrowser: (url: string) => Promise<void>;
  getAppInfo: () => Promise<any>;
  pushToken: string | null;
  isRegistered: boolean;
  isNotificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  sendLocalNotification: (options: { title: string; body: string; id?: number; schedule?: { at: Date } }) => Promise<void>;
  cancelNotification: (id: number) => Promise<void>;
  cancelAllNotifications: () => Promise<void>;
}

const NativeContext = createContext<NativeContextType | null>(null);

export function NativeProvider({ children }: { children: ReactNode }) {
  const nativeFeatures = useNativeFeatures();
  const pushNotifications = usePushNotifications();
  
  // Keep the backend alive to prevent Cloud sleep
  useKeepAlive();

  // Capture the Play Store install referrer (auto-applies referral codes)
  useInstallReferrer();

  const value: NativeContextType = {
    ...nativeFeatures,
    pushToken: pushNotifications.pushToken,
    isRegistered: pushNotifications.isRegistered,
    isNotificationsEnabled: pushNotifications.isEnabled,
    setNotificationsEnabled: pushNotifications.setNotificationsEnabled,
    sendLocalNotification: pushNotifications.sendLocalNotification as any,
    cancelNotification: pushNotifications.cancelNotification,
    cancelAllNotifications: pushNotifications.cancelAllNotifications
  };

  return (
    <NativeContext.Provider value={value}>
      {children}
    </NativeContext.Provider>
  );
}

export function useNative() {
  const context = useContext(NativeContext);
  if (!context) {
    throw new Error('useNative must be used within a NativeProvider');
  }
  return context;
}
