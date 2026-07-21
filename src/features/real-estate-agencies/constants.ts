import type { AgencyStatus } from '@/features/real-estate-agencies/types';

/** Tradução do `<Select>` de status de `RealEstateAgencies.jsx` original (`ATIVA`/`INATIVA`). */
export const AGENCY_STATUS_LABELS: Record<AgencyStatus, string> = {
  ativa: 'Ativa',
  inativa: 'Inativa',
};
