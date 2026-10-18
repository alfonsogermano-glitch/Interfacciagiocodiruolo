import { useEffect, useMemo } from 'react';
import { registerBeforeSignOut, useAuth } from '../auth/AuthContext';
import { clearCampaignPresence, useCampaignChannel } from '../../services/realtime/campaignChannel';

interface CampaignPresenceCoordinatorProps {
  campaignId: string | null;
  isOwner: boolean;
}

export function CampaignPresenceCoordinator({ campaignId, isOwner }: CampaignPresenceCoordinatorProps) {
  const { user } = useAuth();
  const profileId = user?.id;
  const presence = useMemo(() => campaignId && profileId ? {
    profileId,
    role: isOwner ? 'gm' : 'player',
    entered_at: new Date().toISOString(),
  } : null, [campaignId, profileId, isOwner]);

  const { isReady, send } = useCampaignChannel(campaignId, {
    presence,
  });

  useEffect(() => {
    if (!isReady || !profileId) return;
    void send('presence_status', { profileId, online: true });
  }, [isReady, profileId, send]);

  useEffect(() => {
    if (!campaignId) return;
    return registerBeforeSignOut(async () => {
      if (profileId) await send('presence_status', { profileId, online: false });
      await clearCampaignPresence(campaignId);
    });
  }, [campaignId, profileId, send]);

  return null;
}
