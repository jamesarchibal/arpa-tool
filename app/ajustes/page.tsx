import { getIndustries, getThemes } from '@/lib/arpa/db';
import TopNav from '../_topnav';
import ClearExamples from './_clear-examples';
import Industries from './_industries';
import Themes from './_themes';

export const dynamic = 'force-dynamic';

export default async function AjustesPage() {
  const [themes, industries] = await Promise.all([getThemes(), getIndustries()]);
  const examples = themes.filter((t) => t.is_example).length + industries.filter((i) => i.is_example).length;

  return (
    <div className="space-y-6">
      <TopNav active="settings" />

      <div>
        <h1 className="text-2xl font-bold text-ink">⚙️ ARPA · Ajustes</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-mute">
          Las dos listas maestras. Casi nunca cambian, y de ellas depende todo lo demás: un proyecto es
          una empresa, una <strong className="font-semibold text-ink-soft">temática</strong> y una{' '}
          <strong className="font-semibold text-ink-soft">industria</strong>. Son vuestras, no nuestras,
          así que se escriben aquí.
        </p>
      </div>

      <ClearExamples count={examples} />

      <Themes themes={themes} />
      <Industries industries={industries} />
    </div>
  );
}
