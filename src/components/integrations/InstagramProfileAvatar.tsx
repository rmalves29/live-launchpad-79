import { useEffect, useRef, useState } from 'react';
import { Instagram } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';

interface InstagramProfileAvatarProps {
  tenantId: string;
  username?: string | null;
}

export default function InstagramProfileAvatar({
  tenantId,
  username,
}: InstagramProfileAvatarProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    const loadAvatar = async () => {
      revokeObjectUrl();
      setImageSrc(null);

      if (!tenantId) return;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-profile-avatar`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              ...(session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {}),
            },
            body: JSON.stringify({ tenant_id: tenantId }),
          }
        );

        if (!response.ok) {
          console.warn('[InstagramProfileAvatar] Request failed:', await response.text());
          return;
        }

        const blob = await response.blob();
        if (!blob.size || !blob.type.startsWith('image/')) {
          console.warn('[InstagramProfileAvatar] Invalid image response');
          return;
        }

        if (!isCancelled) {
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setImageSrc(url);
        }
      } catch (err) {
        console.warn('[InstagramProfileAvatar] Failed:', err);
      }
    };

    void loadAvatar();

    return () => {
      isCancelled = true;
      revokeObjectUrl();
    };
  }, [tenantId]);

  return (
    <Avatar className="h-12 w-12 border-2 border-border shadow-sm">
      <AvatarImage
        src={imageSrc || undefined}
        alt={username ? `Foto do perfil de @${username}` : 'Instagram profile'}
        className="object-cover"
        referrerPolicy="no-referrer"
      />
      <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs">
        {username?.charAt(0)?.toUpperCase() || <Instagram className="h-5 w-5" />}
      </AvatarFallback>
    </Avatar>
  );
}
