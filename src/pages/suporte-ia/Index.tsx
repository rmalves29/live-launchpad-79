import { SupportKnowledgeManager } from '@/components/support/SupportKnowledgeManager';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function SuporteIAPage() {
  usePageTitle();
  
  return (
    <div className="container mx-auto px-3 md:px-4 py-4 md:py-6 max-w-6xl">
      <SupportKnowledgeManager />
    </div>
  );
}
