import { ReactNode, useState } from 'react';
import { AppSidebar, SidebarContent } from './AppSidebar';
import { TopBar } from './TopBar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import cartzyLogo from '@/assets/cartzy-logo.png';
import { NavLink } from 'react-router-dom';
import { AnnouncementPopup } from '@/components/AnnouncementPopup';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row w-full bg-[#f9fafb]">
      {/* Mobile top bar — full width, above everything */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-[#e5e7eb] flex items-center justify-between px-3 h-14 w-full">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[280px]">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <NavLink to="/" className="flex items-center">
          <img src={cartzyLogo} alt="Cartzy" className="h-10 w-auto object-contain" />
        </NavLink>
        <div className="w-9" />
      </div>

      {/* Desktop sidebar */}
      <AppSidebar />

      <main className="flex-1 min-w-0 max-w-full flex flex-col">
        <TopBar />
        <div className="flex-1 min-w-0 max-w-full">{children}</div>
      </main>
      <AnnouncementPopup />
    </div>
  );
}

export default AppShell;
