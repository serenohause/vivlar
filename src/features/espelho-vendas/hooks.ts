import { useEffect } from 'react';
import { useQuery, useMutation, type UseMutationResult } from '@tanstack/react-query';

import type {
  CreatePublicLeadResult,
  CreatePublicReservationResult,
  PublicLeadIntent,
  PublicProject,
  PublicUnit,
} from '@/features/espelho-vendas/types';
import { supabase } from '@/lib/supabase';

/**
 * Todo acesso a dado deste módulo passa pelas 4 RPCs `security definer` de
 * `0059_rls_espelho_vendas.sql` — NUNCA `supabase.from('projects'|'units')`
 * direto (`anon` não tem grant nenhum nessas tabelas, ver comentário de
 * topo daquela migration). Mesmo padrão do resto do app (nenhuma chamada ao
 * Supabase dentro de componente), só que aqui é a única feature onde quem
 * chama pode não ter sessão nenhuma (`anon`) — por isso não depende de
 * `useAuth()`/`tenantId` em lugar nenhum deste arquivo.
 */

const PUBLIC_PROJECT_QUERY_KEY = (slug: string) => ['public-project', slug] as const;
const PUBLIC_UNITS_QUERY_KEY = (projectId: string) => ['public-units', projectId] as const;

/**
 * Projeto público pelo slug (`get_public_project`). `null` cobre slug
 * inexistente, projeto privado e deletado — os 3 casos, sem diferenciar
 * motivo (ver comentário da função no banco). `EspelhoVendasPage` trata
 * `null` como "não encontrado" (mesmo 404 genérico do original), nunca
 * tenta distinguir a causa.
 *
 * DÉBITO DE SCHEMA JÁ SINALIZADO (não resolvido aqui, ver
 * `0059_rls_espelho_vendas.sql`): `projects.slug` só é único por
 * `(tenant_id, slug)`, não globalmente. Hoje só existe 1 tenant real, então
 * não é um problema visível na prática — mas dois tenants futuros com o
 * mesmo slug fariam esta rota devolver um projeto "errado" de forma
 * determinística (o `order by created_at limit 1` do RPC), não um erro.
 */
export function usePublicProject(slug: string | undefined) {
  return useQuery({
    queryKey: PUBLIC_PROJECT_QUERY_KEY(slug ?? ''),
    queryFn: async (): Promise<PublicProject | null> => {
      const { data, error } = await supabase.rpc('get_public_project', { p_slug: slug as string });
      if (error) throw error;
      return data as PublicProject | null;
    },
    enabled: Boolean(slug),
    retry: false,
  });
}

/** Unidades públicas de um projeto (`get_public_units`) — `[]` (nunca erro) se o projeto não existir/não for público. */
export function usePublicUnits(projectId: string | undefined) {
  return useQuery({
    queryKey: PUBLIC_UNITS_QUERY_KEY(projectId ?? ''),
    queryFn: async (): Promise<PublicUnit[]> => {
      const { data, error } = await supabase.rpc('get_public_units', { p_project_id: projectId as string });
      if (error) throw error;
      return (data as PublicUnit[]) ?? [];
    },
    enabled: Boolean(projectId),
  });
}

/** UTMs capturados da querystring no primeiro carregamento da página, persistidos em `sessionStorage` — tradução 1:1 do efeito de `EspelhoVendas.jsx`. */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
type UtmKey = (typeof UTM_KEYS)[number];

export function useCaptureUtms(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    UTM_KEYS.forEach((key) => {
      const val = params.get(key);
      if (val) sessionStorage.setItem(key, val);
    });
  }, []);
}

function getStoredUtms(): Partial<Record<UtmKey, string>> {
  const utms: Partial<Record<UtmKey, string>> = {};
  UTM_KEYS.forEach((key) => {
    const stored = sessionStorage.getItem(key);
    if (stored) utms[key] = stored;
  });
  return utms;
}

interface CreatePublicLeadInput {
  projectId: string;
  intent: Exclude<PublicLeadIntent, 'reserva'>;
  nome: string;
  telefone: string;
  unitId?: string;
  email?: string;
  mensagem?: string;
}

/** Intents `interesse`/`lista_espera` (`create_public_lead`). RESERVA usa `useCreatePublicReservation` abaixo — a função no banco rejeita `p_intent = 'reserva'` de propósito. */
export function useCreatePublicLead(): UseMutationResult<CreatePublicLeadResult, Error, CreatePublicLeadInput> {
  return useMutation({
    mutationFn: async (input: CreatePublicLeadInput): Promise<CreatePublicLeadResult> => {
      const utms = getStoredUtms();
      const { data, error } = await supabase.rpc('create_public_lead', {
        p_project_id: input.projectId,
        p_intent: input.intent,
        p_nome: input.nome,
        p_telefone: input.telefone,
        p_unit_id: input.unitId ?? null,
        p_email: input.email ?? null,
        p_utm_source: utms.utm_source ?? null,
        p_utm_medium: utms.utm_medium ?? null,
        p_utm_campaign: utms.utm_campaign ?? null,
        p_user_agent: navigator.userAgent,
        p_mensagem: input.mensagem ?? null,
      });

      if (error) throw new Error(error.message);
      return data as CreatePublicLeadResult;
    },
  });
}

interface CreatePublicReservationInput {
  projectId: string;
  unitId: string;
  nome: string;
  telefone: string;
  cpf: string;
  email?: string;
}

/**
 * Intent `reserva` (`create_public_reservation`) — peça crítica e atômica
 * do banco (`select ... for update` na unidade). Se a unidade acabou de ser
 * reservada por outra pessoa, a função levanta uma exceção com mensagem
 * amigável em português; propagamos `error.message` direto para a UI,
 * mesmo padrão do `catch` original em `LeadForm.jsx`.
 */
export function useCreatePublicReservation(): UseMutationResult<
  CreatePublicReservationResult,
  Error,
  CreatePublicReservationInput
> {
  return useMutation({
    mutationFn: async (input: CreatePublicReservationInput): Promise<CreatePublicReservationResult> => {
      const utms = getStoredUtms();
      const { data, error } = await supabase.rpc('create_public_reservation', {
        p_project_id: input.projectId,
        p_unit_id: input.unitId,
        p_nome: input.nome,
        p_telefone: input.telefone,
        p_cpf: input.cpf,
        p_email: input.email ?? null,
        p_utm_source: utms.utm_source ?? null,
        p_utm_medium: utms.utm_medium ?? null,
        p_utm_campaign: utms.utm_campaign ?? null,
        p_user_agent: navigator.userAgent,
      });

      if (error) throw new Error(error.message);
      return data as CreatePublicReservationResult;
    },
  });
}

/**
 * Carrega as Google Fonts (Fraunces + Manrope) usadas só nesta rota pública
 * — tradução do `<link href="https://fonts.googleapis.com/..." />` inline
 * que o original renderiza dentro do JSX de `EspelhoVendas.jsx` (funciona
 * porque um `<link rel="stylesheet">` é processado pelo navegador em
 * qualquer lugar do DOM, não só `<head>`). Aqui via `useEffect` que injeta
 * em `document.head` no mount e remove no unmount, para não vazar a fonte
 * pro resto do app quando o visitante navegar para outra rota.
 */
const ESPELHO_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=Manrope:wght@300;400;500;600;700&display=swap";

export function useEspelhoFonts(): void {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ESPELHO_FONTS_HREF;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);
}

/**
 * SEO dinâmico (título + meta description/og:*) — tradução de
 * `setOrUpdateMeta`/`document.title` em `EspelhoVendas.jsx`. Restaura o
 * título anterior (`Vivlar`, ver `index.html`) no unmount.
 */
export function useEspelhoSeo(project: PublicProject | null | undefined): void {
  useEffect(() => {
    if (!project) return;

    const previousTitle = document.title;
    document.title = `${project.name} | Vivlar Construtora`;

    const metas: Array<{ attr: 'name' | 'property'; key: string; content: string }> = [
      { attr: 'name', key: 'description', content: project.description_public ?? '' },
      { attr: 'property', key: 'og:title', content: project.name },
      { attr: 'property', key: 'og:description', content: project.description_public ?? '' },
    ];

    const createdElements: HTMLMetaElement[] = [];

    metas.forEach(({ attr, key, content }) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
        createdElements.push(el);
      }
      el.setAttribute('content', content);
    });

    return () => {
      document.title = previousTitle;
      createdElements.forEach((el) => el.remove());
    };
  }, [project]);
}
