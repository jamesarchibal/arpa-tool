'use client';

import { Fragment, useState, useTransition } from 'react';

import type { IosIndustry } from '@/lib/ios/db';
import { INDUSTRY_CRITERIA } from '@/lib/ios/industries';
import { RATING_LMH, RESEARCH_STATUS } from '@/lib/ios/lists';
import { Rating, TierPill } from '../_ui';
import { saveIosIndustry } from '../actions';

/**
 * The 100 subsectors, each one re-ratable in place.
 *
 * Until now this library was read-only and the only way to change a rating was
 * to edit their Excel and re-run `scripts/ios-seed.ts`. That is wrong for the
 * part of the library that is live research: the ratings are opinions, and an
 * opinion that cannot be revised without an engineer stops being revised.
 *
 * The editor opens as a row underneath instead of turning the cells into
 * inputs, because the eight ratings need their full Spanish labels to be
 * answerable and the header only has room for the first word of each.
 *
 * The score and the tier are NOT fields here. They are recomputed on the next
 * read from the eight ratings, so saving a 4 where there was a 3 moves the
 * score and can move the tier, and there is no stored copy to disagree.
 */
export default function IndustryRows({ rows }: { rows: IosIndustry[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(r: IosIndustry, form: FormData) {
    start(async () => {
      const result = await saveIosIndustry({
        id: r.id,
        market_growth: String(form.get('market_growth') ?? ''),
        fragmentation_addons: String(form.get('fragmentation_addons') ?? ''),
        target_density: String(form.get('target_density') ?? ''),
        margin_profile: String(form.get('margin_profile') ?? ''),
        recurring_revenue: String(form.get('recurring_revenue') ?? ''),
        barriers: String(form.get('barriers') ?? ''),
        succession: String(form.get('succession') ?? ''),
        risk_low_is_5: String(form.get('risk_low_is_5') ?? ''),
        growth_attractiveness: String(form.get('growth_attractiveness') ?? ''),
        fragmentation: String(form.get('fragmentation') ?? ''),
        consolidation_potential: String(form.get('consolidation_potential') ?? ''),
        research_status: String(form.get('research_status') ?? ''),
        investment_thesis: String(form.get('investment_thesis') ?? ''),
        key_risks: String(form.get('key_risks') ?? ''),
        spanish_clusters: String(form.get('spanish_clusters') ?? ''),
        notes: String(form.get('notes') ?? ''),
      });
      setMessage(result.message);
      if (result.ok) setOpen(null);
    });
  }

  const field =
    'rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';

  return (
    <tbody>
      {rows.map((r) => (
        <Fragment key={r.id}>
          <tr className="border-b border-border last:border-0 hover:bg-bg-elevated">
            <td className="px-3 py-2">
              <div className="font-medium text-ink">{r.subsector}</div>
              {r.spanish_clusters ? (
                <div className="text-[11px] text-ink-faint">{r.spanish_clusters}</div>
              ) : null}
            </td>
            <td className="px-3 py-2 text-xs text-ink-mute">{r.sector}</td>
            <td className="px-3 py-2 text-right font-mono font-semibold text-ink">
              {r.score.toFixed(2)}
            </td>
            <td className="px-3 py-2">
              <TierPill tier={r.tier} />
            </td>
            {INDUSTRY_CRITERIA.map((c) => (
              <td key={c.key} className="px-3 py-2">
                <Rating value={r[c.key]} />
              </td>
            ))}
            <td className="px-3 py-2 text-right">
              <button
                type="button"
                onClick={() => setOpen((v) => (v === r.id ? null : r.id))}
                className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:border-strong"
              >
                {open === r.id ? 'Cerrar' : 'Editar'}
              </button>
            </td>
          </tr>

          {open === r.id ? (
            <tr className="border-b border-border bg-bg-elevated">
              <td colSpan={13} className="px-3 py-3">
                <form action={(form) => save(r, form)} className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-4">
                    {INDUSTRY_CRITERIA.map((c) => (
                      <label key={c.key} className="block">
                        <span className="block text-[11px] text-ink-faint">
                          {c.label} · peso {c.weight}
                        </span>
                        <select
                          name={c.key}
                          defaultValue={String(r[c.key])}
                          className={`${field} mt-0.5 w-full`}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4">
                    {(
                      [
                        ['growth_attractiveness', 'Atractivo de crecimiento', r.growth_attractiveness],
                        ['fragmentation', 'Fragmentación', r.fragmentation],
                        ['consolidation_potential', 'Potencial de consolidación', r.consolidation_potential],
                      ] as const
                    ).map(([name, label, value]) => (
                      <label key={name} className="block">
                        <span className="block text-[11px] text-ink-faint">{label}</span>
                        <select
                          name={name}
                          defaultValue={value ?? ''}
                          className={`${field} mt-0.5 w-full`}
                        >
                          <option value="">sin valor</option>
                          {RATING_LMH.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <label className="block">
                      <span className="block text-[11px] text-ink-faint">Estado del research</span>
                      <select
                        name="research_status"
                        defaultValue={r.research_status}
                        className={`${field} mt-0.5 w-full`}
                      >
                        {RESEARCH_STATUS.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="block text-[11px] text-ink-faint">Tesis de inversión</span>
                      <textarea
                        name="investment_thesis"
                        rows={3}
                        defaultValue={r.investment_thesis ?? ''}
                        className={`${field} mt-0.5 w-full`}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-ink-faint">Riesgos clave</span>
                      <textarea
                        name="key_risks"
                        rows={3}
                        defaultValue={r.key_risks ?? ''}
                        className={`${field} mt-0.5 w-full`}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-ink-faint">Clústeres en España</span>
                      <input
                        name="spanish_clusters"
                        defaultValue={r.spanish_clusters ?? ''}
                        className={`${field} mt-0.5 w-full`}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] text-ink-faint">Notas</span>
                      <input
                        name="notes"
                        defaultValue={r.notes ?? ''}
                        className={`${field} mt-0.5 w-full`}
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <span className="text-[11px] text-ink-faint">
                      El subsector, la industria y el sector no se editan: son la clave con la que
                      se recarga su Excel.
                    </span>
                  </div>
                </form>
              </td>
            </tr>
          ) : null}
        </Fragment>
      ))}

      {rows.length === 0 ? (
        <tr>
          <td colSpan={13} className="px-3 py-6 text-center text-sm text-ink-faint">
            Ningún subsector con esos filtros.
          </td>
        </tr>
      ) : null}

      {message ? (
        <tr>
          <td colSpan={13} className="px-3 py-2 text-xs text-ink-soft">
            {message}
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
