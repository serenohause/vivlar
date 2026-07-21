/**
 * Spinner para área de conteúdo (dentro de uma tela já carregada pelo
 * shell), em vez de tela cheia — mesma linguagem visual de
 * `loading-screen.tsx`, só sem `min-h-screen`. Usado no estado "carregando"
 * de telas de lista/detalhe (convenção de três estados do CLAUDE.md).
 */
export function LoadingInline() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-brand dark:border-t-brand-dark" />
    </div>
  );
}
