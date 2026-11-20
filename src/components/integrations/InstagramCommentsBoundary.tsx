import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props { children: ReactNode }
interface State { error: Error | null }

// Evita que um erro de renderização na lista de comentários derrube a página inteira (tela branca).
export default class InstagramCommentsBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[InstagramComments] erro de renderização:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-foreground">Não foi possível exibir os comentários.</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{this.state.error.message}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => this.setState({ error: null })}>
          Tentar de novo
        </Button>
      </div>
    );
  }
}
