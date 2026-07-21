import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Edit2, Eye, Plus, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useBrokers } from '@/features/brokers/hooks';
import { RealEstateAgencyEditDialog } from '@/features/real-estate-agencies/components/RealEstateAgencyEditDialog';
import { AGENCY_STATUS_LABELS } from '@/features/real-estate-agencies/constants';
import { useRealEstateAgencies } from '@/features/real-estate-agencies/hooks';
import type { RealEstateAgency } from '@/features/real-estate-agencies/types';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/RealEstateAgencies.jsx`: cadastro
 * vira página própria (`/real-estate-agencies/novo`, mesma convenção já
 * usada no resto do sistema), edição continua em dialog
 * (`RealEstateAgencyEditDialog`). Colunas "Deals"/"Vendas"/"Volume Total"
 * do original NÃO estão aqui — dependem de cruzar `brokers` com `deals` em
 * dois níveis (imobiliária -> corretores -> negócios), o que passa de uma
 * contagem simples; sinalizado como fora do escopo desta leva. A coluna
 * "Corretores" (contagem simples, um único filtro em `brokers`) foi
 * mantida.
 */
export function RealEstateAgenciesListPage() {
  const { data: agencies, isLoading, isError, refetch } = useRealEstateAgencies();
  const { data: brokers } = useBrokers();

  const [search, setSearch] = useState('');
  const [editingAgency, setEditingAgency] = useState<RealEstateAgency | null>(null);

  const all = agencies ?? [];
  const allBrokers = brokers ?? [];

  function getBrokersCount(agencyId: string): number {
    return allBrokers.filter((b) => b.real_estate_agency_id === agencyId).length;
  }

  const filteredAgencies = all.filter((agency) => {
    const term = search.toLowerCase();
    return agency.name?.toLowerCase().includes(term) || agency.cnpj?.includes(search);
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Imobiliárias"
        subtitle={`${all.length} imobiliárias cadastradas`}
        actions={
          <Link to={`${pageUrl('RealEstateAgencies')}/novo`}>
            <Button variant="brand">
              <Plus className="mr-2 h-4 w-4" />
              Nova Imobiliária
            </Button>
          </Link>
        }
      />

      <Input
        placeholder="Buscar por nome ou CNPJ..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full md:max-w-md"
      />

      {isLoading ? (
        <LoadingInline />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredAgencies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhuma imobiliária cadastrada"
          description="Comece adicionando a primeira imobiliária parceira"
        />
      ) : (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imobiliária</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-center">Corretores</TableHead>
                  <TableHead className="text-center">Comissão</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgencies.map((agency) => (
                  <TableRow key={agency.id}>
                    <TableCell>
                      <p className="font-medium">{agency.name}</p>
                      {agency.cnpj && <p className="text-sm text-muted-foreground">{agency.cnpj}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {agency.contact_person && <p className="font-medium">{agency.contact_person}</p>}
                        {agency.phone && <p className="text-muted-foreground">{agency.phone}</p>}
                        {!agency.contact_person && !agency.phone && '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        <Users className="mr-1 h-3 w-3" />
                        {getBrokersCount(agency.id)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{agency.commission_percentage}%</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={agency.status === 'ativa' ? 'default' : 'secondary'}>
                        {AGENCY_STATUS_LABELS[agency.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`${pageUrl('RealEstateAgencies')}/${agency.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => setEditingAgency(agency)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {editingAgency && (
        <RealEstateAgencyEditDialog
          agency={editingAgency}
          open={Boolean(editingAgency)}
          onOpenChange={(open) => !open && setEditingAgency(null)}
        />
      )}
    </div>
  );
}
