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
      created_at timestamptz not null default now()
    );

    create table if not exists document_categories (
      id uuid primary key default gen_random_uuid(),
      name text unique not null,
      description text
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

    -- Recherche intelligente (class diagram)
    create table if not exists recherches (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      mot_cle text not null,
      date_recherche timestamptz not null default now()
    );

    create index if not exists idx_recherches_user on recherches(user_id);

    -- Historique des recherches
    create table if not exists historique_recherche (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      mot_cle text not null,
      date_recherche timestamptz not null default now()
    );

    create index if not exists idx_historique_user on historique_recherche(user_id);

    -- Index IA pour les documents (mots-clés extraits par l'IA)
    create table if not exists index_ia (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references documents(id) on delete cascade,
      mots_cles text[] not null default '{}',
      score_pertinence real not null default 0.0,
      created_at timestamptz not null default now()
    );

    create unique index if not exists idx_index_ia_document on index_ia(document_id);

    -- Mots-clés de recherche associés aux résultats
    create table if not exists recherche_mot_cle (
      id uuid primary key default gen_random_uuid(),
      recherche_id uuid not null references recherches(id) on delete cascade,
      relevance_score real not null default 0.0
    );

    -- Résultats de recherche
    create table if not exists resultat_recherche (
      id uuid primary key default gen_random_uuid(),
      recherche_id uuid not null references recherches(id) on delete cascade,
      document_id uuid not null references documents(id) on delete cascade,
      score_pertinence real not null default 0.0,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_resultat_recherche on resultat_recherche(recherche_id);
  `);

  await db.end();
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
