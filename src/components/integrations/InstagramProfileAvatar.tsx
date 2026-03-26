import { useEffect, useRef, useState } from 'react';
import { Instagram } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface InstagramProfileAvatarProps {
  accessToken?: string | null;
  accountId?: string | null;
  username?: string | null;
}

export default function InstagramProfileAvatar({
  accessToken,
  accountId,
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

    const resolveProfileImage = async () => {
      revokeObjectUrl();
      setImageSrc(null);

      if (!accountId || !accessToken) {
        return;
      }

      try {
        const imageResponse = await fetch(
          `https://graph.facebook.com/v21.0/${accountId}/picture?type=normal&access_token=${encodeURIComponent(accessToken)}`
        );

        if (imageResponse.ok) {
          const imageBlob = await imageResponse.blob();

          if (!isCancelled && imageBlob.size > 0) {
            const objectUrl = URL.createObjectURL(imageBlob);
            objectUrlRef.current = objectUrl;
            setImageSrc(objectUrl);
            return;
          }
        }
      } catch (error) {
        console.warn('[Instagram] Failed to fetch profile image blob:', error);
      }

      try {
        const profileResponse = await fetch(
          `https://graph.facebook.com/v21.0/${accountId}?fields=profile_picture_url&access_token=${encodeURIComponent(accessToken)}`
        );
        const profileData = await profileResponse.json().catch(() => null);

        if (!isCancelled && profileData?.profile_picture_url) {
          setImageSrc(profileData.profile_picture_url);
        }
      } catch (error) {
        console.warn('[Instagram] Failed to fetch profile image URL:', error);
      }
    };

    void resolveProfileImage();

    return () => {
      isCancelled = true;
      revokeObjectUrl();
    };
  }, [accountId, accessToken]);

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