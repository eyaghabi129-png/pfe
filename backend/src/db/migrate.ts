import { getDb, initDb } from './client.js';

async function migrate() {
  await initDb();
  const db = getDb();

  await db.query(`
    create extension if not exists pg_trgm;
    create extension if not exists unaccent;

    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      password_hash text not null,
      full_name text not null,
      role text not null check (role in ('admin','manager','user')),
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );

    alter table users add column if not exists is_active boolean not null default true;

    create table if not exists document_categories (
      id uuid primary key default gen_random_uuid(),
      name text unique not null
    );

    create table if not exists documents (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid not null references users(id) on delete cascade,
      title text not null,
      description text,
      category_id uuid references document_categories(id) on delete set null,
      tags text[] not null default '{}',
      original_filename text not null,
      content_type text not null,
      size_bytes bigint not null,
      storage_key text not null,
      sha256 text,
      status text not null default 'ready' check (status in ('processing','ready','failed')),

      ocr_text text,
      summary text,
      ai_label text,
      ai_confidence real,

      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_documents_owner on documents(owner_user_id);
    create index if not exists idx_documents_category on documents(category_id);
    create index if not exists idx_documents_tags on documents using gin(tags);

    -- Full-text search
    alter table documents
      add column if not exists tsv tsvector;

    create or replace function documents_tsv_trigger() returns trigger as $$
    begin
      new.tsv :=
        setweight(to_tsvector('simple', unaccent(coalesce(new.title,''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(new.description,''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce(new.ocr_text,''))), 'C');
      return new;
    end
    $$ language plpgsql;

    drop trigger if exists trg_documents_tsv on documents;
    create trigger trg_documents_tsv
      before insert or update of title, description, ocr_text
      on documents
      for each row execute function documents_tsv_trigger();

    create index if not exists idx_documents_tsv on documents using gin(tsv);

    create table if not exists document_similarities (
      document_id uuid not null references documents(id) on delete cascade,
      similar_document_id uuid not null references documents(id) on delete cascade,
      score real not null,
      created_at timestamptz not null default now(),
      primary key (document_id, similar_document_id)
    );

    create table if not exists audit_events (
      id bigserial primary key,
      actor_user_id uuid references users(id) on delete set null,
      action text not null,
      entity_type text not null,
      entity_id uuid,
      meta jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.end();
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
