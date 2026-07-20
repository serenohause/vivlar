/**
 * Tela de carregamento em página inteira — usada enquanto o estado de auth
 * ainda não resolveu, para evitar "piscar" login/conteúdo protegido.
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-brand dark:border-t-brand-dark" />
    </div>
  );
}
