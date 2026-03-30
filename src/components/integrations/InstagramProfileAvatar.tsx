import { useEffect, useMemo, useState } from 'react';
import { User } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';

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
  const sources = useMemo(() => {
    const candidates: string[] = [];

    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      if (tenantId && base) {
        candidates.push(
          `${base}/functions/v1/instagram-profile-avatar?tenant_id=${encodeURIComponent(tenantId)}&t=${Date.now()}`
        );
      }
    } catch {
      // ignore
    }

    if (profilePictureUrl) {
      candidates.push(profilePictureUrl);
    }

    return Array.from(new Set(candidates.filter(Boolean)));
  }, [tenantId, profilePictureUrl]);

  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const currentSrc = sources[sourceIndex] ?? null;

  const showFallback = !currentSrc;

  return (
    <Avatar className="h-16 w-16 border-2 border-border shadow-sm">
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
          <User className="h-6 w-6" />
        </div>
      ) : (
        <img
          src={currentSrc}
          alt={username ? `Foto do perfil de @${username}` : 'Instagram profile'}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          loading="eager"
          onError={() => setSourceIndex((prev) => prev + 1)}
        />
      )}
    </Avatar>
  );
}
