import { getProjectDetail } from '@/lib/arpa/db';
import { projectFilename, projectWorkbook } from '@/lib/arpa/project-xlsx';

// Reads live data on every request, so it must not be cached or prerendered.
export const dynamic = 'force-dynamic';

/**
 * One deal as an .xlsx workbook.
 *
 * Separate from `/export`, which emits CSV for the three list screens. A real
 * workbook here because a project needs six sheets, and because ARPA asked for
 * the Excel per project by name: it is the file that leaves the tool and goes
 * into a meeting.
 *
 * Covered by middleware.ts like every other route, so no auth check here.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return new Response('falta el parámetro id', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const detail = await getProjectDetail(id);
  if (!detail) {
    return new Response('proyecto no encontrado', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const name = projectFilename(detail);

  return new Response(projectWorkbook(detail), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Both forms: the plain one for old clients, the RFC 5987 one so accents
      // in a razón social survive instead of arriving as mojibake.
      'content-disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'no-store',
    },
  });
}
