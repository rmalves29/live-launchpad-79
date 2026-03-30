import { useMemo, useState } from 'react';
import { Instagram } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface InstagramProfileAvatarProps {
  tenantId: string;
  username?: string | null;
}

export default function InstagramProfileAvatar({
  tenantId,
  username,
}: InstagramProfileAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const imageSrc = useMemo(() => {
    if (!tenantId) return null;

    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-profile-avatar`);
    url.searchParams.set('tenant_id', tenantId);
    url.searchParams.set('t', tenantId);
    return url.toString();
  }, [tenantId]);

  return (
    <Avatar className="h-12 w-12 border-2 border-border shadow-sm">
      <AvatarImage
        src={!hasError ? imageSrc || undefined : undefined}
        alt={username ? `Foto do perfil de @${username}` : 'Instagram profile'}
        className="object-cover"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setHasError(true)}
        onLoad={() => setHasError(false)}
      />
      <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs">
        {username?.charAt(0)?.toUpperCase() || <Instagram className="h-5 w-5" />}
      </AvatarFallback>
    </Avatar>
  );
}
