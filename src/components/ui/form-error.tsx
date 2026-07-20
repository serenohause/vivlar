interface FormErrorProps {
  message?: string | null;
}

/**
 * Mensagem de erro amigável para formulários — genérica o suficiente para
 * qualquer feature, sem depender de Radix (não é um componente interativo).
 */
export function FormError({ message }: FormErrorProps) {
  if (!message) return null;

  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
