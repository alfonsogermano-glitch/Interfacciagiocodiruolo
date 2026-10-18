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

  useCampaignChannel(campaignId, {
    presence,
  });

  useEffect(() => {
    if (!campaignId) return;
    return registerBeforeSignOut(() => clearCampaignPresence(campaignId));
  }, [campaignId]);

  return null;
}
