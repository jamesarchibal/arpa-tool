/**
 * POST /arpa/app/api/intake
 *
 * The machine door into the pipeline. Marc opens his SABI export in HIS Claude,
 * Claude reads the messy sheet and posts clean rows here. No LLM call happens on
 * our side, which is the explicit requirement: the intelligence runs on his own
 * subscription, not on our API bill.
 *
 * Auth is a bearer token and NOT the browser session, because the caller is a
 * program with no cookie jar. `middleware.ts` therefore excludes `/api`, so this
 * file is the only thing standing in front of a service-role database client.
 * Keep the token check as the first statement and never add an unauthenticated
 * branch above it.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { constantTimeEqual } from '@/lib/auth';
import { intakeBatchSchema, runIntake } from '@/lib/arpa/intake';

export const dynamic = 'force-dynamic';
/** Hundreds of rows, each with its own reads and a scoring pass. */
export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const expected = process.env.ARPA_INTAKE_TOKEN;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!presented) return false;

  return constantTimeEqual(presented, expected);
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'body is not valid JSON' }, { status: 400 });
  }

  const parsed = intakeBatchSchema.safeParse(payload);
  if (!parsed.success) {
    // Return the field paths. The caller is an LLM, so a precise error is the
    // difference between it fixing the payload and it guessing.
    return NextResponse.json(
      {
        error: 'payload rejected',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const result = await runIntake(parsed.data, 'claude');
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
