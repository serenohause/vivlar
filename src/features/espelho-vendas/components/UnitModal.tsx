import { useState } from 'react';

import { formatCurrency, STATUS_BG_CLASS, STATUS_LABELS } from '@/features/espelho-vendas/constants';
import { LeadForm, type LeadFormSuccessResult } from '@/features/espelho-vendas/components/LeadForm';
import type { PublicLeadIntent, PublicProject, PublicUnit } from '@/features/espelho-vendas/types';

interface UnitModalProps {
  unit: PublicUnit;
  project: PublicProject;
  onClose: () => void;
  onUnitUpdated: (unit: PublicUnit) => void;
}

/**
 * Tradução de `UnitModal.jsx` — SEM o prop `broker` do original: confirmado
 * por grep que o componente recebe `broker` mas nunca lê nenhum campo dele
 * (fetch morto no original, ver `0059_rls_espelho_vendas.sql` e
 * `WhatsAppFAB.tsx`), então nem propagamos a busca até aqui.
 */
export function UnitModal({ unit, project, onClose, onUnitUpdated }: UnitModalProps) {
  const [intent, setIntent] = useState<PublicLeadIntent | null>(null);
  const [success, setSuccess] = useState<LeadFormSuccessResult | null>(null);

  const waText = encodeURIComponent(`Olá! Tenho interesse na unidade ${unit.sku} (${formatCurrency(unit.list_price)}) do ${project.name}.`);
  const waLink = project.whatsapp_principal ? `https://wa.me/${project.whatsapp_principal}?text=${waText}` : null;

  function handleSuccess(result: LeadFormSuccessResult) {
    setSuccess(result);
    if (result.intent === 'reserva') onUnitUpdated(result.updatedUnit);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-espelho-navy/70 backdrop-blur-md md:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ fontFamily: 'var(--font-espelho-sans)' }}
    >
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-espelho-bg md:max-w-lg md:rounded-2xl">
        {/* HEADER */}
        <div className="flex flex-col gap-2 bg-espelho-navy px-6 pt-6 pb-5">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20 md:hidden" />

          <div className="flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${STATUS_BG_CLASS[unit.status]}`} />
                <span className="text-xs font-semibold tracking-widest text-white/70 uppercase">{STATUS_LABELS[unit.status]}</span>
              </div>

              <h2 className="text-2xl font-light text-white" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
                {unit.tipologia === 'Casa' ? 'Casa' : unit.tipologia === 'Apartamento' ? 'Apto.' : 'Unidade'}{' '}
                <span className="font-medium text-espelho-orange">{unit.sku}</span>
              </h2>
              <p className="text-sm text-white/60">
                {unit.tipologia}
                {unit.area_m2 ? ` · ${unit.area_m2} m²` : ''}
                {unit.area_lote_m2 ? ` · Lote ${unit.area_lote_m2} m²` : ''}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
              {unit.list_price != null && (
                <div className="text-right">
                  <p className="text-xs text-white/50">Valor</p>
                  <p className="text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
                    {formatCurrency(unit.list_price)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
          {success && <SuccessScreen success={success} unit={unit} onClose={onClose} />}

          {!success && intent && (
            <LeadForm intent={intent} unit={unit} project={project} onBack={() => setIntent(null)} onSuccess={handleSuccess} />
          )}

          {!success && !intent && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {unit.quartos != null && <SpecCard label="Quartos" value={unit.quartos} icon="🛏" />}
                {unit.vagas != null && <SpecCard label="Vagas" value={unit.vagas} icon="🚗" />}
                {unit.suites != null && <SpecCard label="Suítes" value={unit.suites} icon="🛁" />}
                {unit.area_lote_m2 != null && <SpecCard label="Lote" value={`${unit.area_lote_m2} m²`} icon="📐" />}
                {unit.pavimentos != null && <SpecCard label="Pavimentos" value={unit.pavimentos} icon="🏠" />}
                {unit.posicao_solar && <SpecCard label="Solar" value={unit.posicao_solar} icon="☀️" />}
              </div>

              <div className="overflow-hidden rounded-2xl border border-espelho-navy/10">
                <div className="flex items-center gap-3 bg-espelho-navy px-5 py-3">
                  <div className="rounded-full bg-espelho-orange px-3 py-1 text-xs font-bold text-white">CAIXA</div>
                  <p className="text-sm font-semibold text-white">Simulação MCMV</p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-espelho-navy/10 bg-white">
                  <SimCard label="Entrada" value={formatCurrency(unit.entrada_minima ?? project.entrada_min)} />
                  <SimCard label="Subsídio" value={formatCurrency(unit.subsidio_simulado ?? project.subsidio_aprox)} highlight />
                  <SimCard label="Parcela" value={formatCurrency(unit.parcela_simulada ?? project.parcela_aprox)} sub="/mês" />
                </div>
                <p className="bg-white px-5 py-3 text-xs text-espelho-navy/40">
                  *Valores aproximados. Análise e aprovação finais pela CAIXA mediante documentação.
                </p>
              </div>

              {unit.observacoes_publica && (
                <div className="rounded-xl bg-espelho-sand p-4">
                  <p className="text-sm text-espelho-navy/80">{unit.observacoes_publica}</p>
                </div>
              )}

              {unit.status === 'disponivel' && (
                <>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setIntent('reserva')}
                      className="flex-1 rounded-full bg-espelho-orange py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Reservar por 24h
                    </button>
                    <button
                      onClick={() => setIntent('interesse')}
                      className="flex-1 rounded-full border-2 border-espelho-navy py-3.5 text-sm font-semibold text-espelho-navy transition hover:bg-espelho-navy/5"
                    >
                      Quero saber mais
                    </button>
                  </div>
                  <p className="-mt-2 text-center text-xs text-espelho-navy/40">
                    trava a unidade em seu nome por {project.reserva_horas || 24} horas
                  </p>
                  {waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-center text-sm text-espelho-navy/50 transition hover:text-espelho-navy"
                    >
                      ou falar direto no WhatsApp →
                    </a>
                  )}
                </>
              )}

              {unit.status === 'reservada' && (
                <div className="rounded-2xl bg-espelho-sand p-6 text-center">
                  <p className="mb-2 font-semibold text-espelho-navy">Esta unidade está reservada.</p>
                  <p className="mb-4 text-sm text-espelho-navy/60">Quer ser avisado se voltar a ficar disponível?</p>
                  <button
                    onClick={() => setIntent('lista_espera')}
                    className="rounded-full bg-espelho-navy px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Entrar na lista de interesse
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SpecCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-espelho-navy/8 bg-white p-4">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-xs text-espelho-navy/50">{label}</p>
        <p className="text-sm font-semibold text-espelho-navy">{value}</p>
      </div>
    </div>
  );
}

function SimCard({ label, value, highlight, sub }: { label: string; value: string; highlight?: boolean; sub?: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-4">
      <p className="mb-1 text-xs text-espelho-navy/50">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-espelho-orange' : 'text-espelho-navy'}`} style={{ fontFamily: 'var(--font-espelho-serif)' }}>
        {value || '—'}
      </p>
      {sub && <p className="text-xs text-espelho-navy/40">{sub}</p>}
    </div>
  );
}

function SuccessScreen({ success, unit, onClose }: { success: LeadFormSuccessResult; unit: PublicUnit; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-espelho-orange text-3xl text-white">✓</div>
      <h3 className="text-2xl font-light text-espelho-navy" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
        {success.intent === 'reserva' ? 'Reservado!' : success.intent === 'lista_espera' ? 'Cadastrado!' : 'Recebido!'}
      </h3>
      {success.intent === 'reserva' && (
        <p className="max-w-xs text-sm text-espelho-navy/70">
          A unidade <strong>{unit.sku}</strong> está reservada em seu nome por {success.reserva_horas || 24} horas. Um corretor entrará em
          contato pelo WhatsApp informado.
        </p>
      )}
      {success.intent === 'interesse' && (
        <p className="max-w-xs text-sm text-espelho-navy/70">Recebemos seu interesse! Um corretor da Vivlar entrará em contato em breve.</p>
      )}
      {success.intent === 'lista_espera' && (
        <p className="max-w-xs text-sm text-espelho-navy/70">
          Te avisaremos assim que a unidade <strong>{unit.sku}</strong> ficar disponível novamente.
        </p>
      )}
      <button
        onClick={onClose}
        className="mt-4 rounded-full border-2 border-espelho-navy px-6 py-3 text-sm font-semibold text-espelho-navy transition hover:bg-espelho-navy/5"
      >
        Voltar ao empreendimento
      </button>
    </div>
  );
}
