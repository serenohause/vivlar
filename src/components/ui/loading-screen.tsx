/**
 * Tela de carregamento em página inteira — usada enquanto o estado de auth
 * ainda não resolveu, para evitar "piscar" login/conteúdo protegido.
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand dark:border-slate-700 dark:border-t-brand-dark" />
    </div>
  );
}
