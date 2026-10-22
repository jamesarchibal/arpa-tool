-- The file itself, attached to a deliverable.
--
-- This reverses what `20261022_arpa_ios_v9_sharepoint.sql` said, so it is worth
-- writing down why rather than leaving two migrations that contradict each
-- other. That one argued the file should live only in SharePoint, and the
-- argument still holds: ARPA already has the permissions, the versioning and
-- the search there, and a copy in two places means two versions.
--
-- What it missed is that SharePoint is not reachable yet. The Microsoft app
-- registration in ARPA's tenant is step 1 of `docs/entrega-arpa.md` and it does
-- not exist, so "the file lives in SharePoint" currently means "there is no way
-- to attach a file at all". A pasted URL only works for a document that is
-- already somewhere, which is exactly not the case for the QSS somebody just
-- wrote. So the files land here, in a private Supabase bucket, until Graph can
-- take over.
--
-- Three columns, not a table. A deliverable has at most one file: a second
-- version of the QSS is a new `ios_documents` row at version 2, which is how
-- their model already works and what the gate reads (latest non-Superseded per
-- type). A separate attachments table would let one row hold two files and make
-- "which one did the partner approve?" unanswerable.
--
--   storage_path  key inside the `ios-documentos` bucket, `<project>/<doc>/<n>-<name>`.
--   file_name     what the person actually picked, for the link text and the download.
--   file_size     bytes, so the list can say 2,4 MB without a round trip to storage.
--
-- `url` is untouched and still means something different: a link to the paper
-- wherever it already lives. A document can have both, and when the tenant
-- arrives the migration is to upload each `storage_path` to the project folder
-- and write the resulting link into `url`. No schema change on that day.
--
-- The bucket is PRIVATE. Nothing is read by public URL. Reads go through
-- `app/v2/documentos/[id]/descargar`, which checks the session middleware
-- already enforced and then signs a 60-second URL. A public bucket would make
-- an LOI readable by anyone who guessed the path, and these are deal papers.

alter table ios_documents
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists file_size bigint;

comment on column ios_documents.storage_path is
  'Key inside the private `ios-documentos` Supabase bucket. Null when the deliverable has no file attached. Temporary home: once the Microsoft app registration exists the file moves to the project''s SharePoint folder and `url` points at it.';

comment on column ios_documents.file_name is
  'Original file name as picked by the person. Shown as the link text and sent as the download name.';

comment on column ios_documents.file_size is
  'Size in bytes, cached so the list does not have to ask storage to render a row.';
