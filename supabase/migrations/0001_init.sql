-- SANAD Family Relay — initial schema (Supabase / Postgres)
-- Run in the Supabase SQL editor, or `supabase db push`.
--
-- Access model: the Flask backend (Render) connects with the database role
-- from DATABASE_URL, which bypasses RLS. RLS is ENABLED on every table with NO
-- policies, so the public Supabase REST API (anon / authenticated keys) can
-- read and write nothing. Never put the service-role key in the frontend.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------ reference data (synthetic)
create table if not exists public.residents (
  mrn               text primary key,
  name              text not null,
  name_ar           text not null,
  sex               text not null check (sex in ('F', 'M')),
  age               int  not null check (age between 0 and 120),
  cancer_type       text not null check (cancer_type in ('breast', 'colorectal')),
  area              text not null,
  lang              text not null check (lang in ('ar', 'en')),
  phone             text,
  family_history    boolean not null default false,
  genetic_flag      boolean not null default false,
  obesity           boolean not null default false,
  diabetes          boolean not null default false,
  screening_overdue boolean not null default false,
  evidence          jsonb not null default '{}'::jsonb,   -- per-risk-factor source + verified flag
  relatives         jsonb not null default '[]'::jsonb,
  history           jsonb not null default '[]'::jsonb    -- past screening tests
);

create table if not exists public.medical_records (
  mrn    text primary key references public.residents (mrn) on delete cascade,
  record jsonb not null                                   -- conditions, medications, allergies, labs, events
);

create table if not exists public.doctors (
  id        text primary key,
  name      text not null,
  name_ar   text not null,
  sex       text not null check (sex in ('F', 'M')),
  specialty text not null,
  clinic    text not null,
  langs     text[] not null default '{}',
  cancer    text not null check (cancer in ('breast', 'colorectal'))
);

-- ------------------------------------------------------------ live programme state
create table if not exists public.invitations (
  mrn      text primary key references public.residents (mrn) on delete cascade,
  sent_at  date not null,
  doctors  text[] not null default '{}',
  status   text not null check (status in ('notified', 'snoozed', 'declined', 'booked', 'completed')),
  channels text[] not null default '{app}'
);

create table if not exists public.appointments (
  id        text primary key,                              -- e.g. A1003
  mrn       text not null references public.residents (mrn) on delete cascade,
  doctor_id text not null references public.doctors (id),
  date      date not null,
  time      text not null,
  status    text not null check (status in ('booked', 'completed')),
  confirmed boolean not null default false,
  booked_at timestamp not null,
  outcome   jsonb                                          -- {result, notes, at}
);
create index if not exists appointments_mrn_idx    on public.appointments (mrn);
create index if not exists appointments_doctor_idx on public.appointments (doctor_id, date, time);
-- a doctor slot can only be held by one booked appointment
create unique index if not exists appointments_slot_uq
  on public.appointments (doctor_id, date, time) where status = 'booked';

-- ------------------------------------------------------------ auth, audit
create table if not exists public.sessions (
  token_hash text primary key,                             -- sha256 of the bearer token
  role       text not null check (role in ('doh', 'resident', 'doctor')),
  user_id    text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_expires_idx on public.sessions (expires_at);

-- every clinical-detail view by programme staff
create table if not exists public.access_log (
  id        bigint generated always as identity primary key,
  mrn       text not null,
  by_user   text not null,
  at        timestamptz not null default now()
);

-- every SANAD Assist (Claude) call
create table if not exists public.ai_audit (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  user_id       text not null,
  kind          text not null,
  subject       text,
  model         text,
  request_id    text,
  input_tokens  int,
  output_tokens int,
  statements    int,
  verified      int,
  removed       int,
  figures_flagged int
);
create index if not exists ai_audit_at_idx on public.ai_audit (at desc);

-- ------------------------------------------------------------ lock down the public API
alter table public.residents       enable row level security;
alter table public.medical_records enable row level security;
alter table public.doctors         enable row level security;
alter table public.invitations     enable row level security;
alter table public.appointments    enable row level security;
alter table public.sessions        enable row level security;
alter table public.access_log      enable row level security;
alter table public.ai_audit        enable row level security;
