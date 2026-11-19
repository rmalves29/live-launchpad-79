// Substitui o `serve` do Deno: guarda o handler da edge function para o teste chamar.
export function serve(handler) {
  globalThis.__edgeHandler = handler;
}
