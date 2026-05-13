import { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex w-full bg-[#f9fafb]">
      <AppSidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export default AppShell;
