import { login } from './actions';

export const metadata = { title: 'ARPA · Acceso' };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={login} className="w-full max-w-sm rounded-lg border border-border bg-bg-card p-6">
        <h1 className="text-lg font-semibold text-white">ARPA Partners</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Herramienta de screening. Introduce la contraseña para continuar.
        </p>

        <input type="hidden" name="next" value={searchParams.next ?? '/'} />

        <label className="mt-5 block text-[11px] uppercase tracking-wider text-zinc-500" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-brand"
        />

        {searchParams.error ? (
          <p className="mt-2 text-xs text-rose-400">Contraseña incorrecta.</p>
        ) : null}

        <button
          type="submit"
          className="mt-4 w-full rounded bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
