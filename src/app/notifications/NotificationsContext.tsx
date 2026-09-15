import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { projectId } from '/utils/supabase/info';
import { useRealtimeChannel } from '../../services/realtime/campaignChannel';
import { useAuth } from '../auth/AuthContext';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

export type NotificationRow = {
  id: string;
  type: string;
  data: Record<string, any>;
  read: boolean;
  created_at: string;
};

type NotificationsContextValue = {
  notifications: NotificationRow[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  respondToInvite: (id: string, action: 'accept' | 'decline') => Promise<{ campaignId?: string }>;
  refresh: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function buildHeaders(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

function mergeNotification(list: NotificationRow[], incoming: NotificationRow): NotificationRow[] {
  const exists = list.some(n => n.id === incoming.id);
  const next = exists
    ? list.map(n => (n.id === incoming.id ? incoming : n))
    : [incoming, ...list];
  return next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!session?.access_token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${SERVER_BASE}/notifications`, {
        headers: buildHeaders(session.access_token),
      });
      if (!res.ok) {
        console.log('Errore fetch notifiche:', await res.text());
        return;
      }
      const { notifications: fetched } = await res.json();
      setNotifications(fetched ?? []);
    } catch (err) {
      console.log('Errore di rete fetch notifiche:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useRealtimeChannel(user?.id ? `profile:${user.id}` : null, {
    onBroadcast: {
      notification: (msg) => {
        const notification = msg?.payload?.notification;
        if (!notification) return;
        setNotifications(prev => mergeNotification(prev, notification));
      },
    },
  });

  const markAsRead = useCallback(async (id: string) => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${SERVER_BASE}/notifications/${id}/read`, {
        method: 'POST',
        headers: buildHeaders(session.access_token),
      });
      if (!res.ok) return;
      const { notification } = await res.json();
      if (notification) setNotifications(prev => mergeNotification(prev, notification));
    } catch (err) {
      console.log('Errore mark-as-read notifica:', err);
    }
  }, [session?.access_token]);

  const markAllAsRead = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${SERVER_BASE}/notifications/read-all`, {
        method: 'POST',
        headers: buildHeaders(session.access_token),
      });
      if (!res.ok) return;
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.log('Errore mark-all-as-read notifiche:', err);
    }
  }, [session?.access_token]);

  const respondToInvite = useCallback(async (id: string, action: 'accept' | 'decline'): Promise<{ campaignId?: string }> => {
    if (!session?.access_token) return {};
    const res = await fetch(`${SERVER_BASE}/notifications/${id}/respond`, {
      method: 'POST',
      headers: buildHeaders(session.access_token),
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? 'Errore durante la risposta all\'invito');
    await fetchNotifications();
    return { campaignId: body?.campaignId };
  }, [session?.access_token, fetchNotifications]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    respondToInvite,
    refresh: fetchNotifications,
  }), [notifications, unreadCount, isLoading, markAsRead, markAllAsRead, respondToInvite, fetchNotifications]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications deve essere usato dentro NotificationsProvider');
  return ctx;
}
