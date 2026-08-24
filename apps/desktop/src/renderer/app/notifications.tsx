import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface Notification { id: string; tone?: 'info' | 'success' | 'warning' | 'error'; message: string; }
interface NotificationContextValue { notifications: Notification[]; notify: (message: string, tone?: Notification['tone']) => void; dismiss: (id: string) => void; }
const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const value = useMemo(() => ({ notifications, notify: (message: string, tone: Notification['tone'] = 'info') => setNotifications((items) => [...items, { id: `${Date.now()}-${Math.random()}`, message, tone }]), dismiss: (id: string) => setNotifications((items) => items.filter((item) => item.id !== id)) }), [notifications]);
  return <NotificationContext.Provider value={value}>{children}<div className="notifications" aria-live="polite">{notifications.map((item) => <div key={item.id} role="status" data-tone={item.tone}>{item.message}<button type="button" aria-label={`关闭通知：${item.message}`} onClick={() => value.dismiss(item.id)}>×</button></div>)}</div></NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue { const value = useContext(NotificationContext); if (!value) throw new Error('useNotifications must be used inside NotificationProvider'); return value; }
