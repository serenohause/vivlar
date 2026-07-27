/** Tradução 1:1 de `EspelhoSkeleton.jsx` — estado "carregando" da `EspelhoVendasPage`. */
export function EspelhoSkeleton() {
  return (
    <div className="min-h-screen animate-pulse bg-espelho-bg">
      <div className="h-16 border-b border-espelho-navy/8 bg-white" />

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:px-10">
        <div className="flex flex-col gap-4">
          <div className="h-4 w-48 rounded-full bg-espelho-navy/10" />
          <div className="h-12 w-3/4 rounded-xl bg-espelho-navy/10" />
          <div className="h-12 w-1/2 rounded-xl bg-espelho-navy/10" />
          <div className="h-4 w-5/6 rounded-full bg-espelho-navy/8" />
          <div className="h-4 w-4/6 rounded-full bg-espelho-navy/8" />
          <div className="mt-4 h-12 w-40 rounded-full bg-espelho-orange/20" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 h-28 rounded-2xl bg-espelho-navy/10" />
          <div className="h-24 rounded-2xl bg-espelho-navy/8" />
          <div className="h-24 rounded-2xl bg-espelho-navy/8" />
          <div className="col-span-2 h-20 rounded-2xl bg-espelho-sand/60" />
        </div>
      </div>

      <div className="bg-espelho-sand px-6 py-20 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 h-5 w-40 rounded-full bg-espelho-navy/15" />
          <div className="mb-10 h-12 w-64 rounded-xl bg-espelho-navy/15" />
          <div className="h-96 rounded-2xl bg-espelho-navy/20" />
        </div>
      </div>
    </div>
  );
}
