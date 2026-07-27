import type { PublicProject } from '@/features/espelho-vendas/types';

/** Tradução 1:1 de `CTASection.jsx`. */
export function CTASection({ project, onScrollToImplantacao }: { project: PublicProject; onScrollToImplantacao: () => void }) {
  const waLink = project.whatsapp_principal
    ? `https://wa.me/${project.whatsapp_principal}?text=${encodeURIComponent(`Olá! Tenho interesse em ${project.name}.`)}`
    : '#';

  return (
    <section className="bg-espelho-navy px-6 py-24 text-center md:px-10">
      <div className="mx-auto max-w-2xl">
        <p className="mb-6 text-xs font-semibold text-white/40 uppercase" style={{ letterSpacing: '0.25em' }}>
          — 03 · Próximo passo
        </p>
        <h2
          className="mb-4 text-4xl font-light text-white md:text-5xl"
          style={{ fontFamily: 'var(--font-espelho-serif)', letterSpacing: '-0.02em' }}
        >
          Sua nova casa está <em>esperando.</em>
        </h2>
        <p className="mx-auto mb-10 max-w-md text-base text-white/60">
          Unidades com entrada acessível e parcelas pelo MCMV. Fale com um corretor ou escolha sua unidade agora.
        </p>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <button
            onClick={onScrollToImplantacao}
            className="rounded-full bg-espelho-orange px-8 py-4 font-semibold text-white transition hover:opacity-90"
          >
            Ver unidades disponíveis
          </button>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-2 border-espelho-sand px-8 py-4 font-semibold text-espelho-sand transition hover:bg-white/10"
          >
            WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
