import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/AuthContext';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { CreateTenantForm } from '@/features/auth/components/CreateTenantForm';
import { signupAccountSchema } from '@/features/auth/schemas';

type Step = 'account' | 'company' | 'confirm-email';

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAccountSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = signupAccountSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    setIsSubmitting(true);
    const result = await signUp(parsed.data.email, parsed.data.password);
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setStep(result.needsEmailConfirmation ? 'confirm-email' : 'company');
  }

  if (step === 'confirm-email') {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <MailCheck className="h-5 w-5 text-brand dark:text-brand-dark" />
          </div>
          <p className="text-sm text-muted-foreground">
            Enviamos um link de confirmação para <strong className="text-foreground">{email}</strong>. Confirme seu
            e-mail e depois faça login para criar sua empresa.
          </p>
          <Button asChild variant="brand" className="w-full">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (step === 'company') {
    return (
      <AuthLayout title="Sua empresa" description="Falta pouco: conte um pouco sobre sua empresa.">
        <CreateTenantForm onSuccess={() => navigate('/', { replace: true })} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      description="Crie sua conta para começar."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Já tem uma conta?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline dark:text-brand-dark">
            Entrar
          </Link>
        </p>
      }
    >
      <form onSubmit={handleAccountSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@empresa.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mínimo de 6 caracteres"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar senha</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repita a senha"
          />
        </div>
        <FormError message={error} />
        <Button type="submit" variant="brand" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Criando conta...' : 'Continuar'}
        </Button>
      </form>
    </AuthLayout>
  );
}
