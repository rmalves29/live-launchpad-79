import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className="h-10 w-10 p-0 rounded-xl border border-border/30 hover:border-primary/40 hover:bg-primary/5"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export default ThemeToggle;
