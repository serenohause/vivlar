import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mapCreateTenantError } from '@/features/auth/errors';
import { useCreateTenant } from '@/features/auth/hooks';
import { createTenantSchema } from '@/features/auth/schemas';
import { slugify } from '@/lib/slug';

interface CreateTenantFormProps {
  onSuccess: () => void;
}

/**
 * Passo "criar empresa": usado tanto no passo 2 do signup (usuário recém
 * criado, sem tenant ainda) quanto em /onboarding (usuário autenticado sem
 * nenhum vínculo ativo). Chama a RPC create_tenant_with_admin via
 * useCreateTenant.
 */
export function CreateTenantForm({ onSuccess }: CreateTenantFormProps) {
  const createTenant = useCreateTenant();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = createTenantSchema.safeParse({ name, slug });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    try {
      await createTenant.mutateAsync(parsed.data);
      onSuccess();
    } catch (mutationError) {
      setError(mapCreateTenantError(mutationError));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tenant-name">Nome da empresa</Label>
        <Input
          id="tenant-name"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          placeholder="Minha Incorporadora"
          autoComplete="organization"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tenant-slug">Identificador</Label>
        <Input
          id="tenant-slug"
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          placeholder="minha-incorporadora"
        />
        <p className="text-xs text-muted-foreground">
          Usado internamente para identificar sua empresa. Apenas letras minúsculas, números e hífen.
        </p>
      </div>
      <FormError message={error} />
      <Button type="submit" variant="brand" className="w-full" disabled={createTenant.isPending}>
        {createTenant.isPending ? 'Criando empresa...' : 'Criar empresa'}
      </Button>
    </form>
  );
}
