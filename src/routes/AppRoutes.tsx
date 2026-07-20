import { Route, Routes } from 'react-router-dom';

function Placeholder() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-brand">Vivlar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Scaffold pronto — próximo módulo: autenticação.</p>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder />} />
    </Routes>
  );
}
