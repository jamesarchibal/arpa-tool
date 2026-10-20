import { redirect } from 'next/navigation';

/**
 * Pipeline is now the Tabla view of Proyectos.
 *
 * It was never a second screen: both read `arpa_pipeline` and listed the same
 * deals. This redirect stays because the tab existed for weeks and the URL is
 * in bookmarks and in links we sent out.
 */
export default function PipelineRedirect({ searchParams }: { searchParams: { stage?: string } }) {
  const stage = searchParams.stage;
  redirect(`/proyectos?v=tabla${stage ? `&stage=${encodeURIComponent(stage)}` : ''}`);
}
