-- The SharePoint folder of a project.
--
-- Their own design has this field (`SharePoint Folder URL` on Projects, written
-- by automation A22) and V2 did not. The file itself is NOT stored here and
-- should not be: the original lives in SharePoint, where ARPA already has the
-- permissions, the versioning and the search. A copy in two places means two
-- versions, and the good one is always the other one. `ios_documents.url`
-- already points at the file; this column points at the folder that holds them
-- all, so somebody can get to the project's papers in one click instead of
-- opening a document row to find a link.
--
-- Today a person pastes it. When the Microsoft app registration exists, Graph
-- can create the folder when the project is created and fill this in, which is
-- step 5 of `docs/entrega-arpa.md`. The column is the same either way, so that
-- step adds a writer and changes no schema.
--
-- No CHECK on the shape of the URL. A folder link can be a SharePoint path, a
-- Teams channel files tab or a shared OneDrive link, and a regex that guesses
-- wrong blocks a real folder for no gain. The input is capped at 1000 chars in
-- the action, which is the only limit that is actually about correctness.

alter table ios_projects
  add column if not exists sharepoint_folder_url text;

comment on column ios_projects.sharepoint_folder_url is
  'Folder holding the project''s papers, their `SharePoint Folder URL`. Typed by hand today, written by Microsoft Graph once the app registration exists. The files live there, never here.';
