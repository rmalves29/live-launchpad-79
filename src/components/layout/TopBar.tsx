import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { TenantSwitcher } from '@/components/TenantSwitcher';

export function TopBar() {
  const { user, profile } = useAuth();
  const { tenant } = useTenant();

  if (!user) return null;

  const initials =
    (profile?.full_name || user?.email || '?')
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  return (
    <div className="hidden lg:flex sticky top-0 z-30 bg-white border-b border-[#e5e7eb] h-14 items-center justify-end gap-3 px-6">
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
