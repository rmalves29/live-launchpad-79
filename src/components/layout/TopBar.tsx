import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { HelpCircle } from 'lucide-react';
import { getHelpPageMeta } from '@/lib/help-page-key';

export function TopBar() {
  const { user, profile } = useAuth();
  const { tenant } = useTenant();
  const location = useLocation();

  if (!user) return null;

  const initials =
    (profile?.full_name || user?.email || '?')
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  const isSuperAdmin = profile?.role === 'super_admin';
  const helpMeta = getHelpPageMeta(location.pathname);

  const getSubscriptionInfo = () => {
    if (!tenant?.subscription_ends_at) return null;
    
    const end = new Date(tenant.subscription_ends_at);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return null;

    let textColor = 'text-[#9ca3af]';
    if (diffDays <= 5) {
      textColor = 'text-red-600 font-bold';
    } else if (diffDays <= 10) {
      textColor = 'text-yellow-500 font-bold';
    }

    return {
      days: diffDays,
      colorClass: textColor
    };
  };

  const subInfo = getSubscriptionInfo();

  return (
    <div className="hidden lg:flex sticky top-0 z-30 bg-white border-b border-[#e5e7eb] h-14 items-center justify-end gap-3 px-6">
      {isSuperAdmin && (
        <Link
          to={`/ajuda?page=${encodeURIComponent(helpMeta.key)}`}
          className="flex items-center gap-1.5 text-[12px] font-medium text-[#4f46e5] hover:text-[#3730a3] hover:underline"
          title={`Ver tutoriais de ${helpMeta.label}`}
        >
          <HelpCircle className="h-4 w-4" />
          Tutoriais
        </Link>
      )}
      
      {subInfo && (
        <div className="flex items-center px-3 border-l border-[#e5e7eb] h-8">
          <p className="text-[11px] leading-tight text-[#6b7280]">
            Faltam <span className={subInfo.colorClass}>{subInfo.days} {subInfo.days === 1 ? 'dia' : 'dias'}</span> para o plano expirar
          </p>
        </div>
      )}

      <TenantSwitcher />
      <div className="flex items-center gap-2 pl-3 border-l border-[#e5e7eb]">
        <div className="text-right">
          <p className="text-[12px] font-semibold text-[#374151] leading-tight truncate max-w-[200px]">
            {profile?.full_name || tenant?.name || 'Usuário'}
          </p>
          <p className="text-[11px] text-[#9ca3af] leading-tight truncate max-w-[200px]">{user.email}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-[#e0e7ff] flex items-center justify-center text-[12px] font-bold text-[#4f46e5] shrink-0">
          {initials}
        </div>
      </div>
    </div>
  );
}

export default TopBar;
