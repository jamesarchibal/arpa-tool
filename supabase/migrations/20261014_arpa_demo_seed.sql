-- Demo content for the IOS v0.0.0 walkthrough.
--
-- Why this exists: with one company and one project in the database every
-- screen is correct and every screen looks broken. A card opens onto empty
-- panels, the board has one lane filled, and Contactos is a blank page. James
-- chose "semilla marcada como ejemplo", so the rows go in but they carry a flag
-- and one button removes them.
--
-- Three rules this file follows:
--   1. Every row gets is_example = true. No exceptions, or the clear button
--      leaves debris behind.
--   2. The ids are hand-written and obviously synthetic (1111..., 2222...), so
--      a demo row is recognisable in any query, not just by its flag.
--   3. No scores here. Scores are produced by running ARPA's own scoring engine
--      over these financials (scripts/seed-demo-scores.ts), because a score
--      typed by hand is a number nobody computed.
--
-- The companies, people and figures are invented. The subsectors, stages,
-- decision values and kill criteria are ARPA's own.

begin;

/* ───────────────────────── the flag, on every table ───────────────────────── */

alter table public.arpa_companies         add column if not exists is_example boolean not null default false;
alter table public.arpa_projects          add column if not exists is_example boolean not null default false;
alter table public.arpa_project_companies add column if not exists is_example boolean not null default false;
alter table public.arpa_stakeholders      add column if not exists is_example boolean not null default false;
alter table public.arpa_stakeholder_links add column if not exists is_example boolean not null default false;
alter table public.arpa_interactions      add column if not exists is_example boolean not null default false;
alter table public.arpa_documents         add column if not exists is_example boolean not null default false;
alter table public.arpa_scores            add column if not exists is_example boolean not null default false;

/* ──────────────────────────────── companies ───────────────────────────────── */

insert into public.arpa_companies
  (id, legal_name, trade_name, cif, website, country, region, city, taxonomy_id,
   taxonomy_fit, cnae, employees, founded_year, ownership_type, admin_since,
   notes, enrich_source, enriched_at, enriched_by, intake_batch, is_example)
values
  ('11111111-1111-4111-8111-000000000001', 'Mecanizados Altube, S.L.', 'Altube Precision', 'B01234567',
   'https://www.altube-demo.es', 'ES', 'País Vasco', 'Amurrio', 11, 'in', '2562', 42, 1987,
   'Founder-owned', 1994,
   'Mecanizado de precisión para automoción y bienes de equipo. El fundador tiene 68 años y dos hijos fuera del negocio.',
   'SABI', now() - interval '21 days', 'Marc', 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000002', 'Valvulería Famen, S.A.', 'Famen Valves', 'A09876543',
   'https://www.famen-demo.es', 'ES', 'Comunidad Valenciana', 'Alcoi', 12, 'in', '2813', 78, 1971,
   'Family-owned', 1998,
   'Válvulas industriales para agua y proceso. Tercera generación, dos ramas familiares con intereses distintos.',
   'SABI', now() - interval '18 days', 'Marc', 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000003', 'Riegos del Segura, S.L.', 'Riegos Segura', 'B11223344',
   'https://www.riegossegura-demo.es', 'ES', 'Región de Murcia', 'Molina de Segura', 5, 'in', '2893', 61, 1992,
   'Family-owned', 2001,
   'Riego por goteo y cabezales de filtrado. Exporta el 34% a Marruecos y Perú.',
   'SABI', now() - interval '14 days', 'Marc', 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000004', 'Bioinputs Mediterráneo, S.L.', 'Biomed Inputs', 'B55667788',
   null, 'ES', 'Andalucía', 'El Ejido', 4, 'in', '2015', 24, 2011,
   'Founder-owned', 2011,
   'Bioestimulantes y control biológico. Identificada en el camino temático, todavía sin contactar.',
   null, null, null, 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000005', 'Envases Técnicos del Ebro, S.A.', 'Envatec', 'A44556677',
   'https://www.envatec-demo.es', 'ES', 'Aragón', 'Zaragoza', 15, 'in', '2222', 115, 1979,
   'Family-owned', 1996,
   'Envase industrial rígido. Cliente final agroalimentario y químico. Planta ampliada en 2023.',
   'SABI', now() - interval '40 days', 'Marc', 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000006', 'Filtración Industrial Vallesana, S.L.', 'Vallfiltra', 'B77889900',
   null, 'ES', 'Cataluña', 'Granollers', 19, 'in', '2825', 33, 2004,
   'Founder-owned', 2004,
   'Filtración y tratamiento de residuos industriales. Descartada por precio: el vendedor pedía 11 M€.',
   'SABI', now() - interval '52 days', 'Marc', 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000007', 'Mecanizados Oria, S.L.', 'Oria Mec', 'B22334455',
   null, 'ES', 'País Vasco', 'Lasarte-Oria', 11, 'in', '2562', 18, 1996,
   'Family-owned', 1996,
   'Plataforma propuesta para la consolidación de mecanizado en el norte. Dueño abierto a vender con continuidad.',
   'SABI', now() - interval '30 days', 'Marc', 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000008', 'Talleres Mendibil, S.A.', 'Mendibil', 'A33445566',
   null, 'ES', 'País Vasco', 'Basauri', 13, 'in', '2550', 27, 1983,
   'Family-owned', 1991,
   'Transformación metálica y estampación. Add-on del proyecto de consolidación norte.',
   'SABI', now() - interval '28 days', 'Marc', 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000009', 'Utillajes Zubiri, S.L.', 'Zubiri Tooling', 'B66778899',
   null, 'ES', 'Navarra', 'Pamplona', 11, 'in', '2573', 21, 1990,
   'Founder-owned', 1990,
   'Utillaje y matricería. Segundo add-on del proyecto de consolidación norte.',
   'SABI', now() - interval '26 days', 'Marc', 'demo-ios', true),

  ('11111111-1111-4111-8111-000000000010', 'Maquinaria Alimentaria Ponent, S.L.', 'Ponent Maq', 'B99001122',
   null, 'ES', 'Cataluña', 'Lleida', 17, 'in', '2893', 54, 1988,
   'Family-owned', 1995,
   'Maquinaria para línea de fruta. Facturación en caída tres años y el dueño retiró la operación.',
   'SABI', now() - interval '70 days', 'Marc', 'demo-ios', true)
on conflict (id) do nothing;

/* ───────────────────────────────── projects ───────────────────────────────── */
-- Money is millions of EUR, the same unit the scoring engine expects.

insert into public.arpa_projects
  (id, company_id, code, stage, decision_status, pass_reason, source, owner,
   revenue_y1, revenue_y2, revenue_y3, ebitda_y1, ebitda_y2, ebitda_y3, ebitda_norm,
   capex, working_capital, net_debt, recurring_pct, customer_conc, seller_motiv,
   data_confidence, financials_src, entry_multiple, seller_exp_ev,
   theme_id, taxonomy_id, intake_batch, is_example)
values
  -- Screening: the 15 minute look. One page out.
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001',
   'ARPA-26-001', 'Screening', 'Proceed', null, 'SABI export', 'Marc',
   7.8, 8.6, 9.2, 1.10, 1.30, 1.45, 1.55, 0.45, 0.20, 1.10, 35, 'mid', 4,
   'Medium', 'Cuentas depositadas 2022-2024', 5.5, 9.5, 1, 11, 'demo-ios', true),

  -- Assessment: the opportunity memo, 3-4 pages.
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000002',
   'ARPA-26-002', 'Assessment', 'Continue', null, 'Verdegí (infomemo)', 'Marc',
   12.4, 13.1, 14.0, 2.00, 2.20, 2.50, 2.40, 0.60, 0.35, 2.20, 55, 'low', 3,
   'Medium', 'Infomemo del asesor + SABI', 6.0, 16.0, 2, 12, 'demo-ios', true),

  -- Preliminary Financial Review: the deeper financial assessment.
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000003',
   'ARPA-26-003', 'Preliminary Financial Review', 'Continue', null, 'Contacto directo', 'Marc',
   9.6, 10.8, 12.2, 1.60, 1.90, 2.20, 2.10, 0.30, 0.40, 0.90, 45, 'mid', 5,
   'High', 'Cuentas de gestión entregadas por el vendedor', 6.5, 13.0, 1, 5, 'demo-ios', true),

  -- Sourcing: found in the thematic path, nothing asked of it yet.
  ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000004',
   'ARPA-26-004', 'Sourcing', null, null, 'Camino temático · subsector', 'Ignasi',
   null, null, 3.2, null, null, null, null, null, null, null, null, null, null,
   'Low', null, null, null, 2, 4, 'demo-ios', true),

  -- Investment Case: the one that is working.
  ('22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000005',
   'ARPA-26-005', 'Investment Case', 'Build Investment Case', null, 'Verdegí (infomemo)', 'Marc',
   24.0, 26.0, 28.0, 3.40, 3.80, 4.20, 4.00, 1.10, 0.60, 3.50, 65, 'low', 4,
   'High', 'Data room fase 1', 6.5, 26.0, 3, 15, 'demo-ios', true),

  -- LOI: one deal, three companies. Ignasi's buy-and-build.
  ('22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-000000000007',
   'ARPA-26-006', 'LOI & Exclusivity', 'Proceed', null, 'Camino temático · subsector', 'Ignasi',
   14.0, 15.5, 17.0, 1.90, 2.20, 2.60, 2.80, 0.70, 0.50, 1.60, 40, 'mid', 4,
   'Medium', 'Cuentas de las tres sociedades, agregadas', 6.0, 16.5, 3, 11, 'demo-ios', true),

  -- Closed on price. The gap is real and the engine will say so.
  ('22222222-2222-4222-8222-000000000007', '11111111-1111-4111-8111-000000000006',
   'ARPA-26-007', 'Closed', 'Pass', 'Price gap', 'Broker', 'Marc',
   5.4, 5.9, 6.3, 0.80, 0.90, 1.00, 0.95, 0.25, 0.15, 0.50, 30, 'high', 2,
   'Low', 'Solo cuentas depositadas', 5.0, 11.0, 2, 19, 'demo-ios', true),

  -- Closed because the seller pulled out. Carries a human veto.
  ('22222222-2222-4222-8222-000000000008', '11111111-1111-4111-8111-000000000010',
   'ARPA-26-008', 'Closed', 'Pass', 'Seller not ready', 'SABI export', 'Marc',
   11.0, 10.4, 9.8, 1.40, 1.10, 0.90, 0.85, 0.50, 0.30, 2.90, 25, 'high', 1,
   'Low', 'Cuentas depositadas 2022-2024', 5.0, 12.0, 1, 17, 'demo-ios', true)
on conflict (id) do nothing;

/* ──────────────────────── a project can hold several companies ─────────────── */
-- Every project gets its primary row. ARPA-26-006 gets two more, which is the
-- whole point of the many-to-many: "podries tenir un deal que sigui de tres
-- companyies".

insert into public.arpa_project_companies (id, project_id, company_id, role, is_primary, note, is_example)
select
  ('77777777-7777-4777-8777-' || lpad((row_number() over (order by p.code))::text, 12, '0'))::uuid,
  p.id, p.company_id, 'Target', true, null, true
from public.arpa_projects p
where p.is_example
  and not exists (select 1 from public.arpa_project_companies pc where pc.project_id = p.id)
on conflict do nothing;

update public.arpa_project_companies
   set role = 'Platform'
 where project_id = '22222222-2222-4222-8222-000000000006' and is_primary;

insert into public.arpa_project_companies (id, project_id, company_id, role, is_primary, note, is_example)
values
  ('77777777-7777-4777-8777-000000000101', '22222222-2222-4222-8222-000000000006',
   '11111111-1111-4111-8111-000000000008', 'Add-on', false,
   'Estampación. Cubre el proceso que Oria subcontrata hoy.', true),
  ('77777777-7777-4777-8777-000000000102', '22222222-2222-4222-8222-000000000006',
   '11111111-1111-4111-8111-000000000009', 'Add-on', false,
   'Matricería. Entra en la segunda fase, carta de intenciones aparte.', true)
on conflict do nothing;

/* ──────────────────────────────── the people ──────────────────────────────── */

insert into public.arpa_stakeholders
  (id, full_name, email, phone, linkedin, org, kind, city, notes, import_source, is_example)
values
  ('33333333-3333-4333-8333-000000000001', 'Iñaki Altube Zubizarreta', 'inaki@altube-demo.es', '+34 945 11 22 33',
   null, 'Mecanizados Altube', 'Owner', 'Amurrio',
   '68 años, fundador. Quiere vender con continuidad para la plantilla.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000002', 'Marta Altube', 'marta@altube-demo.es', null, null,
   'Mecanizados Altube', 'Family member', 'Bilbao',
   'Hija. Trabaja fuera del negocio y no quiere entrar. Es ella quien empuja la venta.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000003', 'Josep Verdegí Mora', 'jverdegi@verdegi-demo.com', '+34 963 44 55 66',
   null, 'Verdegí Corporate Finance', 'Intermediary', 'Valencia',
   'Asesor que nos manda infomemos. Dos de los proyectos abiertos vienen de él.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000004', 'Vicent Famen Llopis', 'vfamen@famen-demo.es', '+34 965 22 33 44',
   null, 'Valvulería Famen', 'Owner', 'Alcoi',
   'Presidente, tercera generación. La otra rama familiar no está alineada.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000005', 'Carles Puig Benavent', 'cpuig@famen-demo.es', null, null,
   'Valvulería Famen', 'Management', 'Alcoi',
   'Director financiero. Es quien prepara los números que pedimos.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000006', 'Encarna Soler Pérez', 'esoler@riegossegura-demo.es', '+34 968 55 66 77',
   null, 'Riegos del Segura', 'Owner', 'Molina de Segura',
   'Socia mayoritaria. Motivación alta: quiere salir en 12 meses.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000007', 'Ramón Beltrán Casas', 'rbeltran@nordicabanca-demo.com', null, null,
   'Nórdica Banca de Empresas', 'Lender', 'Madrid',
   'Contacto de deuda. Ha mirado la estructura de Envatec de forma informal.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000008', 'Aitor Mendibil Garate', 'aitor@mendibil-demo.es', '+34 944 77 88 99',
   null, 'Talleres Mendibil', 'Owner', 'Basauri',
   'Dueño del primer add-on. Acepta vender si la plataforma la compra ARPA.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000009', 'Lluís Ponent Farré', 'lponent@ponent-demo.es', null, null,
   'Maquinaria Alimentaria Ponent', 'Owner', 'Lleida',
   'Retiró la operación en octubre. Dijo que volvería en dos años.', 'demo-ios', true),
  ('33333333-3333-4333-8333-000000000010', 'Eva Carbonell Ribó', 'eva@carbonell-demo.com', null, null,
   'Carbonell & Asociados', 'Lawyer', 'Barcelona',
   'Abogada de ARPA en las cartas de intenciones.', 'demo-ios', true)
on conflict (id) do nothing;

-- Links. A person can sit on the project, on the company, or on both. The deal
-- detail reads links by project OR by the project's company, so both shapes
-- have to appear in the demo for that to be visible.
insert into public.arpa_stakeholder_links (id, stakeholder_id, company_id, project_id, role, is_primary, is_example)
values
  ('44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000001',
   '11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000001', 'Fundador y administrador', true, true),
  ('44444444-4444-4444-8444-000000000002', '33333333-3333-4333-8333-000000000002',
   '11111111-1111-4111-8111-000000000001', null, 'Segunda generación', false, true),
  ('44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000003',
   null, '22222222-2222-4222-8222-000000000002', 'Asesor del vendedor', true, true),
  ('44444444-4444-4444-8444-000000000004', '33333333-3333-4333-8333-000000000004',
   '11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000002', 'Presidente', false, true),
  ('44444444-4444-4444-8444-000000000005', '33333333-3333-4333-8333-000000000005',
   '11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000002', 'Director financiero', false, true),
  ('44444444-4444-4444-8444-000000000006', '33333333-3333-4333-8333-000000000006',
   '11111111-1111-4111-8111-000000000003', '22222222-2222-4222-8222-000000000003', 'Socia mayoritaria', true, true),
  ('44444444-4444-4444-8444-000000000007', '33333333-3333-4333-8333-000000000003',
   null, '22222222-2222-4222-8222-000000000005', 'Asesor del vendedor', true, true),
  ('44444444-4444-4444-8444-000000000008', '33333333-3333-4333-8333-000000000007',
   null, '22222222-2222-4222-8222-000000000005', 'Financiación', false, true),
  ('44444444-4444-4444-8444-000000000009', '33333333-3333-4333-8333-000000000008',
   '11111111-1111-4111-8111-000000000008', '22222222-2222-4222-8222-000000000006', 'Dueño del add-on', false, true),
  ('44444444-4444-4444-8444-000000000010', '33333333-3333-4333-8333-000000000010',
   null, '22222222-2222-4222-8222-000000000006', 'Abogada de la LOI', false, true),
  ('44444444-4444-4444-8444-000000000011', '33333333-3333-4333-8333-000000000009',
   '11111111-1111-4111-8111-000000000010', '22222222-2222-4222-8222-000000000008', 'Dueño', true, true)
on conflict (id) do nothing;

/* ────────────────────────────── interactions ──────────────────────────────── */

insert into public.arpa_interactions
  (id, project_id, company_id, stakeholder_id, kind, direction, happened_at,
   summary, next_step, next_step_due, logged_by, is_example)
values
  ('55555555-5555-4555-8555-000000000001', '22222222-2222-4222-8222-000000000001',
   '11111111-1111-4111-8111-000000000001', '33333333-3333-4333-8333-000000000001',
   'Call', 'outbound', now() - interval '19 days',
   'Primera llamada en frío. Reconoce que no tiene sucesión y que ha hablado con dos interesados este año.',
   'Mandar una nota de una página con el rango de valoración', (now() + interval '3 days')::date, 'Marc', true),
  ('55555555-5555-4555-8555-000000000002', '22222222-2222-4222-8222-000000000001',
   '11111111-1111-4111-8111-000000000001', '33333333-3333-4333-8333-000000000002',
   'Call', 'inbound', now() - interval '12 days',
   'La hija llama para entender el proceso. Es el canal real de la operación.',
   null, null, 'Marc', true),
  ('55555555-5555-4555-8555-000000000003', '22222222-2222-4222-8222-000000000002',
   null, '33333333-3333-4333-8333-000000000003',
   'Email', 'inbound', now() - interval '26 days',
   'Verdegí manda el infomemo de Famen. 14 M€ de facturación, EBITDA 2,5 M€, expectativa 16 M€.',
   null, null, 'Marc', true),
  ('55555555-5555-4555-8555-000000000004', '22222222-2222-4222-8222-000000000002',
   '11111111-1111-4111-8111-000000000002', '33333333-3333-4333-8333-000000000004',
   'Meeting', 'outbound', now() - interval '15 days',
   'Visita a planta en Alcoi. Instalación ordenada. La rama familiar que no vende es el riesgo principal.',
   'Pedir el detalle de la estructura accionarial', (now() - interval '2 days')::date, 'Marc', true),
  ('55555555-5555-4555-8555-000000000005', '22222222-2222-4222-8222-000000000002',
   '11111111-1111-4111-8111-000000000002', '33333333-3333-4333-8333-000000000005',
   'Email', 'inbound', now() - interval '6 days',
   'El CFO manda las cuentas de gestión a septiembre. Margen estable.',
   null, null, 'Marc', true),
  ('55555555-5555-4555-8555-000000000006', '22222222-2222-4222-8222-000000000003',
   '11111111-1111-4111-8111-000000000003', '33333333-3333-4333-8333-000000000006',
   'Meeting', 'outbound', now() - interval '9 days',
   'Reunión en Murcia. Quiere cerrar en 12 meses por motivos personales. Acepta earn-out parcial.',
   'Arrancar la revisión financiera preliminar', (now() + interval '6 days')::date, 'Marc', true),
  ('55555555-5555-4555-8555-000000000007', '22222222-2222-4222-8222-000000000003',
   '11111111-1111-4111-8111-000000000003', null,
   'Note', null, now() - interval '4 days',
   'La exportación a Marruecos y Perú es el 34% de las ventas y está concentrada en dos distribuidores.',
   null, null, 'Ignasi', true),
  ('55555555-5555-4555-8555-000000000008', '22222222-2222-4222-8222-000000000005',
   '11111111-1111-4111-8111-000000000005', '33333333-3333-4333-8333-000000000003',
   'Call', 'inbound', now() - interval '35 days',
   'Verdegí presenta Envatec. Proceso con tres interesados, calendario de seis semanas.',
   null, null, 'Marc', true),
  ('55555555-5555-4555-8555-000000000009', '22222222-2222-4222-8222-000000000005',
   '11111111-1111-4111-8111-000000000005', '33333333-3333-4333-8333-000000000007',
   'Call', 'outbound', now() - interval '8 days',
   'Sondeo de deuda. Cómodo hasta 3,0x sobre EBITDA normalizado, sin compromiso.',
   'Pedir term sheet indicativo', (now() + interval '10 days')::date, 'Marc', true),
  ('55555555-5555-4555-8555-000000000010', '22222222-2222-4222-8222-000000000006',
   '11111111-1111-4111-8111-000000000007', null,
   'Site visit', null, now() - interval '22 days',
   'Visita a Oria y Mendibil el mismo día. Los dos talleres son complementarios, no solapan cliente.',
   null, null, 'Ignasi', true),
  ('55555555-5555-4555-8555-000000000011', '22222222-2222-4222-8222-000000000006',
   '11111111-1111-4111-8111-000000000008', '33333333-3333-4333-8333-000000000008',
   'Meeting', 'outbound', now() - interval '5 days',
   'Mendibil acepta entrar como add-on si ARPA compra Oria primero. Condición escrita en la LOI.',
   'Firmar la LOI de Oria', (now() + interval '4 days')::date, 'Ignasi', true),
  ('55555555-5555-4555-8555-000000000012', '22222222-2222-4222-8222-000000000008',
   '11111111-1111-4111-8111-000000000010', '33333333-3333-4333-8333-000000000009',
   'Call', 'inbound', now() - interval '31 days',
   'El dueño retira la operación. Dice que quiere ver dos ejercicios mejores antes de volver a sentarse.',
   null, null, 'Marc', true),
  ('55555555-5555-4555-8555-000000000013', '22222222-2222-4222-8222-000000000007',
   '11111111-1111-4111-8111-000000000006', null,
   'Note', null, now() - interval '48 days',
   'Pedía 11 M€ sobre un EBITDA de 0,95 M€. Sin solape posible, cerrado por precio.',
   null, null, 'Marc', true)
on conflict (id) do nothing;

/* ──────────────────────────────── documents ───────────────────────────────── */
-- storage_path, not external_url, on purpose: an invented link that 404s is
-- worse than a filename. The UI only renders a link when external_url is set.

insert into public.arpa_documents
  (id, project_id, company_id, title, doc_type, storage_path, period, uploaded_by, created_at, is_example)
values
  ('66666666-6666-4666-8666-000000000001', '22222222-2222-4222-8222-000000000001',
   '11111111-1111-4111-8111-000000000001', 'Cuentas anuales 2024 · Altube', 'Annual accounts',
   'demo/altube/cuentas-2024.pdf', '2024', 'Marc', now() - interval '20 days', true),
  ('66666666-6666-4666-8666-000000000002', '22222222-2222-4222-8222-000000000001',
   '11111111-1111-4111-8111-000000000001', 'Quick Snapshot · Altube', 'Report',
   'demo/altube/quick-snapshot.pdf', null, 'Marc', now() - interval '11 days', true),
  ('66666666-6666-4666-8666-000000000003', '22222222-2222-4222-8222-000000000002',
   '11111111-1111-4111-8111-000000000002', 'Infomemo Famen · Verdegí', 'Info memo',
   'demo/famen/infomemo-verdegi.pdf', null, 'Marc', now() - interval '26 days', true),
  ('66666666-6666-4666-8666-000000000004', '22222222-2222-4222-8222-000000000002',
   '11111111-1111-4111-8111-000000000002', 'NDA firmado · Famen', 'NDA',
   'demo/famen/nda-firmado.pdf', null, 'Marc', now() - interval '24 days', true),
  ('66666666-6666-4666-8666-000000000005', '22222222-2222-4222-8222-000000000002',
   '11111111-1111-4111-8111-000000000002', 'Opportunity Memo · Famen', 'Report',
   'demo/famen/opportunity-memo.pdf', null, 'Marc', now() - interval '7 days', true),
  ('66666666-6666-4666-8666-000000000006', '22222222-2222-4222-8222-000000000003',
   '11111111-1111-4111-8111-000000000003', 'Cuentas de gestión ene-sep · Riegos Segura', 'Management accounts',
   'demo/riegos-segura/gestion-ene-sep.xlsx', '2026-09', 'Marc', now() - interval '5 days', true),
  ('66666666-6666-4666-8666-000000000007', '22222222-2222-4222-8222-000000000005',
   '11111111-1111-4111-8111-000000000005', 'Valoración preliminar · Envatec', 'Valuation',
   'demo/envatec/valoracion-preliminar.xlsx', null, 'Marc', now() - interval '12 days', true),
  ('66666666-6666-4666-8666-000000000008', '22222222-2222-4222-8222-000000000006',
   '11111111-1111-4111-8111-000000000007', 'Carta de intenciones · Oria', 'LOI',
   'demo/oria/loi-borrador-v3.docx', null, 'Ignasi', now() - interval '3 days', true),
  ('66666666-6666-4666-8666-000000000009', '22222222-2222-4222-8222-000000000007',
   '11111111-1111-4111-8111-000000000006', 'Teaser · Vallfiltra', 'Teaser',
   'demo/vallfiltra/teaser.pdf', null, 'Marc', now() - interval '52 days', true)
on conflict (id) do nothing;

/* ─────────────────────────────── a human veto ─────────────────────────────── */
-- k7, "motivación del vendedor poco convincente". Ticked by a person, which is
-- what makes it a veto rather than advice, and it is why ARPA-26-008 is closed.

insert into public.arpa_kill_flags (project_id, kill_id, flagged, flagged_by, flagged_at, note)
values
  ('22222222-2222-4222-8222-000000000008', 'k7', true, 'Marc', now() - interval '30 days',
   'El vendedor retiró la operación por teléfono el 13 de septiembre.')
on conflict (project_id, kill_id) do nothing;

commit;
