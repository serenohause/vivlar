import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Lock, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { Label } from '@/components/ui/label';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TerrainEditDialog } from '@/features/terrains/components/TerrainEditDialog';
import { TerrainLocationCard } from '@/features/terrains/components/TerrainLocationCard';
import { TerrainStatusBadge } from '@/features/terrains/components/TerrainStatusBadge';
import { formatCurrency } from '@/features/terrains/constants';
import { useTerrain } from '@/features/terrains/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/TerrainDetail.jsx`, sem o mapa
 * interativo (ver `TerrainLocationCard`) e sem o fluxo real de "Transformar
 * em Projeto" (cria um `Project` novo — módulo de Projetos ainda não tem
 * UI; botão fica desabilitado com aviso "Em breve", ver relatório final).
 */
export function TerrainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: terrain, isLoading, isError, refetch } = useTerrain(id);

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!terrain) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Terreno não encontrado</p>
        <Button onClick={() => navigate(pageUrl('Terrains'))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const isTransformed = terrain.status === 'transformado_projeto';
  const totalCosts =
    (terrain.custos_itbi ?? 0) +
    (terrain.custos_cartorio ?? 0) +
    (terrain.custos_estudos ?? 0) +
    (terrain.custos_corretagem ?? 0) +
    (terrain.custos_outros ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(pageUrl('Terrains'))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{terrain.code}</h1>
            <p className="text-muted-foreground">{terrain.name}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <TerrainStatusBadge status={terrain.status} />
          {!isTransformed && (
            <Button variant="outline" onClick={() => setShowEditDialog(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}
        </div>
      </div>

      {/* Status Transformed */}
      {isTransformed && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium text-purple-900">Terreno Transformado</p>
                <p className="text-sm text-purple-700">
                  Este terreno foi transformado em projeto e está em modo somente leitura.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identification */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Código</Label>
              <p className="font-medium">{terrain.code}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <p className="font-medium">{terrain.name}</p>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Endereço</Label>
            <p className="font-medium">{terrain.address || '—'}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Cidade</Label>
              <p className="font-medium">{terrain.city || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Estado</Label>
              <p className="font-medium">{terrain.state || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Área (m²)</Label>
              <p className="font-medium">
                {terrain.area_m2?.toLocaleString('pt-BR')}
                {terrain.area_m2 >= 10000 && (
                  <span className="ml-2 text-sm text-muted-foreground">({(terrain.area_m2 / 10000).toFixed(2)} ha)</span>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <TerrainLocationCard terrain={terrain} isTransformed={isTransformed} />

      {/* Legal Data */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Dados Jurídicos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Matrícula</Label>
              <p className="font-medium">{terrain.matricula || '—'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Proprietário Atual</Label>
              <p className="font-medium">{terrain.proprietario_atual || '—'}</p>
            </div>
          </div>
          {terrain.observacoes_legais && (
            <div>
              <Label className="text-xs text-muted-foreground">Observações Legais</Label>
              <p className="text-sm font-medium">{terrain.observacoes_legais}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial Data */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Dados Financeiros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted p-4">
              <Label className="mb-1 block text-xs text-muted-foreground">Valor de Aquisição</Label>
              <p className="text-xl font-bold text-foreground">{formatCurrency(terrain.valor_aquisicao)}</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <Label className="mb-1 block text-xs text-muted-foreground">Forma de Aquisição</Label>
              <p className="font-medium">{terrain.forma_aquisicao || '—'}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <Label className="mb-3 block text-sm font-semibold">Custos</Label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-muted-foreground">ITBI</p>
                <p className="font-semibold text-blue-900">{formatCurrency(terrain.custos_itbi)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-muted-foreground">Cartório</p>
                <p className="font-semibold text-blue-900">{formatCurrency(terrain.custos_cartorio)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-muted-foreground">Estudos</p>
                <p className="font-semibold text-blue-900">{formatCurrency(terrain.custos_estudos)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-muted-foreground">Corretagem</p>
                <p className="font-semibold text-blue-900">{formatCurrency(terrain.custos_corretagem)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-muted-foreground">Outros</p>
                <p className="font-semibold text-blue-900">{formatCurrency(terrain.custos_outros)}</p>
              </div>
              <div className="rounded-lg border-2 border-green-200 bg-green-50 p-3">
                <p className="text-xs text-muted-foreground">Total Custos</p>
                <p className="font-bold text-green-900">{formatCurrency(totalCosts)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transformar em Projeto — depende do módulo de Projetos, ainda sem UI
          (ver relatório final). Fica desabilitado com aviso em vez de um
          fluxo de criação simplificado inventado à parte. */}
      {!isTransformed && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block">
                <Button className="h-12 w-full text-base" variant="brand" disabled>
                  <Plus className="mr-2 h-5 w-5" />
                  Transformar em Projeto
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Em breve — depende do módulo de Projetos, ainda não implementado.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Notes */}
      {terrain.notas && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground">{terrain.notas}</p>
          </CardContent>
        </Card>
      )}

      <TerrainEditDialog terrain={terrain} open={showEditDialog} onOpenChange={setShowEditDialog} />
    </div>
  );
}
