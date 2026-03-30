import { useMemo, useState } from 'react';
import { User } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface InstagramProfileAvatarProps {
  tenantId: string;
  username?: string | null;
  profilePictureUrl?: string | null;
}

export default function InstagramProfileAvatar({
  tenantId,
  username,
  profilePictureUrl,
}: InstagramProfileAvatarProps) {
  const [hasError, setHasError] = useState(false);

  // Priority: 1) DB-stored profile_picture_url, 2) Edge function proxy
  const imageSrc = useMemo(() => {
    if (profilePictureUrl) return profilePictureUrl;
    if (!tenantId) return null;
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      if (!base) return null;
      return `${base}/functions/v1/instagram-profile-avatar?tenant_id=${encodeURIComponent(tenantId)}&t=${Date.now()}`;
    } catch {
      return null;
    }
  }, [tenantId, profilePictureUrl]);

  return (
    <Avatar className="h-12 w-12 border-2 border-border shadow-sm">
      <AvatarImage
        src={!hasError && imageSrc ? imageSrc : undefined}
        alt={username ? `Foto do perfil de @${username}` : 'Instagram profile'}
        className="object-cover"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        onLoad={() => setHasError(false)}
      />
      <AvatarFallback className="bg-muted text-muted-foreground">
        <User className="h-6 w-6" />
      </AvatarFallback>
    </Avatar>
  );
}
