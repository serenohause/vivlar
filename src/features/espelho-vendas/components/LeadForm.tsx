import { type FormEvent, useState } from 'react';

import { useCreatePublicLead, useCreatePublicReservation } from '@/features/espelho-vendas/hooks';
import { formatLeadFormErrors, leadFormSchema, normalizarTelefone, type LeadFormErrors } from '@/features/espelho-vendas/schemas';
import type { PublicLeadIntent, PublicProject, PublicUnit } from '@/features/espelho-vendas/types';

export type LeadFormSuccessResult =
  | { intent: 'interesse' }
  | { intent: 'lista_espera' }
  | { intent: 'reserva'; reserva_horas: number; updatedUnit: PublicUnit };

interface LeadFormProps {
  intent: PublicLeadIntent;
  unit: PublicUnit;
  project: PublicProject;
  onBack: () => void;
  onSuccess: (result: LeadFormSuccessResult) => void;
}

const TITLES: Record<PublicLeadIntent, string> = {
  reserva: 'Reserva por 24 horas',
  interesse: 'Quero saber mais',
  lista_espera: 'Lista de interesse',
};

const SUBTITLES: Record<PublicLeadIntent, string> = {
  reserva: 'Preencha os dados abaixo para travar a unidade em seu nome. Um corretor entrará em contato para dar continuidade.',
  interesse: 'Deixe seus dados e um corretor da Vivlar entrará em contato em breve.',
  lista_espera: 'Cadastre-se para ser avisado quando esta unidade voltar a ficar disponível.',
};

const inputClassName = (hasError: boolean) =>
  `w-full rounded-xl px-4 py-3 text-sm text-espelho-navy outline-none transition focus:border-espelho-navy ${
    hasError ? 'border-[1.5px] border-espelho-orange' : 'border-[1.5px] border-transparent'
  } bg-espelho-sand`;

/**
 * Tradução de `LeadForm.jsx`. Diferente do original (que faz 3-5 chamadas
 * sequenciais direto às entidades), aqui cada intent chama uma única RPC
 * atômica (`create_public_lead` para interesse/lista_espera,
 * `create_public_reservation` para reserva, ver `hooks.ts`) — a criação de
 * `Notification` que o original fazia depois de cada `PublicLead.create`
 * não existe neste schema/módulo ainda (fora de escopo, não inventado
 * aqui).
 */
export function LeadForm({ intent, unit, project, onBack, onSuccess }: LeadFormProps) {
  const [form, setForm] = useState({ nome: '', telefone: '', email: '', cpf: '' });
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createLead = useCreatePublicLead();
  const createReservation = useCreatePublicReservation();
  const loading = createLead.isPending || createReservation.isPending;

  function set<K extends keyof typeof form>(field: K, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = leadFormSchema(intent).safeParse(form);
    if (!parsed.success) {
      setErrors(formatLeadFormErrors(parsed.error));
      return;
    }

    setSubmitError(null);
    const tel = normalizarTelefone(form.telefone);

    try {
      if (intent === 'reserva') {
        const result = await createReservation.mutateAsync({
          projectId: project.id,
          unitId: unit.id,
          nome: form.nome.trim(),
          telefone: tel,
          cpf: form.cpf.trim(),
          email: form.email.trim() || undefined,
        });
        onSuccess({
          intent: 'reserva',
          reserva_horas: result.reserva_horas,
          updatedUnit: { ...unit, status: 'reservada' },
        });
      } else {
        await createLead.mutateAsync({
          projectId: project.id,
          intent,
          nome: form.nome.trim(),
          telefone: tel,
          unitId: unit.id,
          email: form.email.trim() || undefined,
        });
        onSuccess({ intent });
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao enviar. Tente novamente.');
    }
  }

  const isSubmittable = Boolean(form.nome.trim() && form.telefone.trim() && (intent !== 'reserva' || form.cpf.trim()));

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-espelho-navy/50 transition hover:text-espelho-navy">
        ← Voltar
      </button>

      <h3 className="mb-1 text-2xl font-light text-espelho-navy" style={{ fontFamily: 'var(--font-espelho-serif)' }}>
        {TITLES[intent]}
      </h3>
      <p className="mb-6 text-sm text-espelho-navy/60">{SUBTITLES[intent]}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold tracking-wider text-espelho-navy/70 uppercase">Nome completo *</label>
          <input
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            placeholder="João da Silva"
            className={inputClassName(Boolean(errors.nome))}
          />
          {errors.nome && <p className="mt-1 text-xs text-espelho-orange">{errors.nome}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold tracking-wider text-espelho-navy/70 uppercase">WhatsApp *</label>
          <input
            value={form.telefone}
            onChange={(e) => set('telefone', e.target.value)}
            placeholder="(85) 99999-9999"
            type="tel"
            className={inputClassName(Boolean(errors.telefone))}
          />
          {errors.telefone && <p className="mt-1 text-xs text-espelho-orange">{errors.telefone}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold tracking-wider text-espelho-navy/70 uppercase">
            E-mail <span className="text-xs font-normal text-espelho-navy/40 normal-case">(opcional)</span>
          </label>
          <input
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="seu@email.com"
            type="email"
            className={inputClassName(Boolean(errors.email))}
          />
          {errors.email && <p className="mt-1 text-xs text-espelho-orange">{errors.email}</p>}
        </div>

        {intent === 'reserva' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-espelho-navy/70 uppercase">CPF *</label>
            <input
              value={form.cpf}
              onChange={(e) => set('cpf', e.target.value)}
              placeholder="000.000.000-00"
              className={inputClassName(Boolean(errors.cpf))}
            />
            {errors.cpf && <p className="mt-1 text-xs text-espelho-orange">{errors.cpf}</p>}
          </div>
        )}

        <p className="text-xs text-espelho-navy/40">
          Seus dados são tratados conforme a LGPD e utilizados exclusivamente para contato sobre este imóvel.
        </p>

        {submitError && (
          <div className="rounded-xl bg-espelho-error-bg p-4 text-sm font-medium text-espelho-error-text">{submitError}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-full border-2 border-espelho-navy py-3.5 text-sm font-semibold text-espelho-navy transition hover:bg-espelho-navy/5"
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={loading || !isSubmittable}
            className="flex-1 rounded-full bg-espelho-orange py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Enviando...' : intent === 'reserva' ? 'Confirmar reserva' : intent === 'interesse' ? 'Solicitar contato' : 'Cadastrar interesse'}
          </button>
        </div>
      </form>
    </div>
  );
}
