import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Signs a fresh URL per request, so nothing here may be cached.
export const dynamic = 'force-dynamic';

/**
 * Download one attached file.
 *
 * The bucket is private and stays private: these are LOIs, financial models and
 * due diligence summaries, and a public bucket makes every one of them readable
 * by anyone who guesses a path. So the link in the table points here instead of
 * at storage, this handler looks the row up and then signs a URL that dies in
 * sixty seconds.
 *
 * Access control is `middleware.ts`, which already gates every `/v2/*` path on
 * the shared session cookie. This route sits under `/v2`, so an unauthenticated
 * request never reaches the code below. That is the same bargain the rest of the
 * app makes (one shared password, no Supabase users) and it is written down here
 * because a download route is exactly where someone would expect a second check
 * and be surprised not to find one.
 *
 * It redirects rather than streaming the bytes through Vercel. A streamed
 * response would pay for the file twice, once out of storage and once out of the
 * function, and a 40 MB data room document would sit against the function's
 * execution limit for no gain.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('ios_documents')
    .select('storage_path, file_name')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return new NextResponse(error.message, { status: 500 });
  if (!data?.storage_path) return new NextResponse('Sin fichero', { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from('ios-documentos')
    .createSignedUrl(data.storage_path as string, 60, {
      // Sends it as the name the person uploaded, not as the sanitised key.
      download: (data.file_name as string | null) ?? undefined,
    });

  if (signError || !signed) {
    return new NextResponse(signError?.message ?? 'No he podido firmar la descarga', {
      status: 500,
    });
  }

  return NextResponse.redirect(signed.signedUrl);
}
