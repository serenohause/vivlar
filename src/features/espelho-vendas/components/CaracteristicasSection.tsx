/** Tradução 1:1 de `CaracteristicasSection.jsx`. `null` quando `project.caracteristicas` está vazio (mesma condição de exibição do original, decidida em `EspelhoVendasPage`). */
export function CaracteristicasSection({ caracteristicas }: { caracteristicas: string[] }) {
  if (caracteristicas.length === 0) return null;

  return (
    <section className="bg-espelho-bg px-6 py-20 md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-xs font-semibold text-espelho-navy/50 uppercase" style={{ letterSpacing: '0.25em' }}>
          — 02 · O condomínio
        </p>
        <h2
          className="mb-12 text-4xl font-light text-espelho-navy md:text-5xl"
          style={{ fontFamily: 'var(--font-espelho-serif)', letterSpacing: '-0.02em' }}
        >
          Pensado para morar bem.
        </h2>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {caracteristicas.map((item, idx) => (
            <div
              key={idx}
              className="cursor-default rounded-2xl border border-espelho-navy/8 bg-espelho-sand-light p-5 transition hover:-translate-y-0.5"
            >
              <p className="mb-3 text-3xl font-light text-espelho-orange" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
                {String(idx + 1).padStart(2, '0')}
              </p>
              <p className="text-sm leading-snug font-medium text-espelho-navy">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
