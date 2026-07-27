/** Tradução 1:1 de `EspelhoFooter.jsx`. */
export function EspelhoFooter() {
  return (
    <footer className="bg-espelho-navy-dark px-6 py-8 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-espelho-sand">
            <span className="font-bold text-sm text-espelho-navy-dark" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
              V
            </span>
          </div>
          <span className="text-lg font-semibold text-espelho-sand" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
            vivlar
          </span>
        </div>

        <div className="text-center sm:text-right">
          <p className="text-xs text-espelho-sand/50">© {new Date().getFullYear()} Vivlar Construtora. Todos os direitos reservados.</p>
          <p className="mt-0.5 text-xs text-espelho-sand/30">
            Imagens meramente ilustrativas. Consulte o corretor para condições atualizadas.
          </p>
        </div>
      </div>
    </footer>
  );
}
