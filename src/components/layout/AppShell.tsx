import { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex w-full bg-[#f9fafb]">
      <AppSidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <div className="flex-1 min-w-0">{children}</div>
      </main>
    </div>
  );
}

export default AppShell;
