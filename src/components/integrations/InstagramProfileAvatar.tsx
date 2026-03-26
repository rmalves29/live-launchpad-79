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
        const { data, error } = await supabase.functions.invoke(
          'instagram-profile-avatar',
          { body: { tenant_id: tenantId } }
        );

        if (error || !data) return;

        // data comes as Blob when responseType is not set
        if (data instanceof Blob && data.size > 0) {
          if (!isCancelled) {
            const url = URL.createObjectURL(data);
            objectUrlRef.current = url;
            setImageSrc(url);
          }
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
