-- supabase/schema.sql

-- =========================================================
-- EXTENSIONS
-- =========================================================

create extension if not exists "pgcrypto";


-- =========================================================
-- PROFILES
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);


-- =========================================================
-- CATEGORIES
-- =========================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null,

  type text not null
    check (type in ('expense', 'income')),

  created_at timestamptz not null default now(),

  unique (user_id, name, type)
);


-- =========================================================
-- MERCHANTS
-- =========================================================

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null,

  created_at timestamptz not null default now(),

  unique (user_id, name)
);


-- =========================================================
-- TRANSACTIONS
-- =========================================================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  type text not null
    check (type in ('expense', 'income')),

  amount numeric(12, 2) not null
    check (amount > 0),

  date date not null,

  merchant text,

  income_source text,

  category_id uuid
    references public.categories(id)
    on delete set null,

  comment text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);


-- =========================================================
-- TRANSACTION ITEMS
-- =========================================================

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),

  transaction_id uuid not null
    references public.transactions(id)
    on delete cascade,

  name text not null,

  amount numeric(12, 2) not null
    check (amount > 0),

  category_id uuid
    references public.categories(id)
    on delete set null,

  created_at timestamptz not null default now()
);


-- =========================================================
-- BUDGETS
-- =========================================================

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  month text not null
    check (month ~ '^[0-9]{4}-[0-9]{2}$'),

  category_id uuid not null
    references public.categories(id)
    on delete cascade,

  amount numeric(12, 2) not null
    check (amount > 0),

  created_at timestamptz not null default now(),

  unique (user_id, month, category_id)
);


-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists transactions_user_date_idx
on public.transactions(user_id, date desc);

create index if not exists transactions_user_type_idx
on public.transactions(user_id, type);

create index if not exists transaction_items_transaction_idx
on public.transaction_items(transaction_id);

create index if not exists transaction_items_category_idx
on public.transaction_items(category_id);

create index if not exists budgets_user_month_idx
on public.budgets(user_id, month);

create index if not exists categories_user_idx
on public.categories(user_id);

create index if not exists merchants_user_idx
on public.merchants(user_id);


-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


drop trigger if exists transactions_updated_at
on public.transactions;

create trigger transactions_updated_at
before update on public.transactions
for each row
execute function public.set_updated_at();


-- =========================================================
-- NEW USER DEFAULT DATA
-- =========================================================

create or replace function public.create_default_finance_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$

begin

  insert into public.profiles (
    id,
    email
  )
  values (
    new.id,
    new.email
  )
  on conflict (id)
  do update set email = excluded.email;


  insert into public.categories (
    user_id,
    name,
    type
  )
  values
    (new.id, 'Продукты', 'expense'),
    (new.id, 'Кафе и рестораны', 'expense'),
    (new.id, 'Транспорт', 'expense'),
    (new.id, 'Жильё', 'expense'),
    (new.id, 'Здоровье', 'expense'),
    (new.id, 'Одежда', 'expense'),
    (new.id, 'Развлечения', 'expense'),
    (new.id, 'Подписки', 'expense'),
    (new.id, 'Быт', 'expense'),
    (new.id, 'Прочее', 'expense'),
    (new.id, 'Зарплата', 'income'),
    (new.id, 'Фриланс', 'income'),
    (new.id, 'Прочий доход', 'income')
  on conflict (user_id, name, type)
  do nothing;


  return new;

end;
$$;


drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.create_default_finance_data();


-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.merchants enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.budgets enable row level security;


-- =========================================================
-- PROFILES POLICIES
-- =========================================================

drop policy if exists "profiles_select_own"
on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);


drop policy if exists "profiles_insert_own"
on public.profiles;

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
);


drop policy if exists "profiles_update_own"
on public.profiles;

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);


-- =========================================================
-- CATEGORIES POLICIES
-- =========================================================

drop policy if exists "categories_select_own"
on public.categories;

create policy "categories_select_own"
on public.categories
for select
to authenticated
using (
  user_id = auth.uid()
);


drop policy if exists "categories_insert_own"
on public.categories;

create policy "categories_insert_own"
on public.categories
for insert
to authenticated
with check (
  user_id = auth.uid()
);


drop policy if exists "categories_update_own"
on public.categories;

create policy "categories_update_own"
on public.categories
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


drop policy if exists "categories_delete_own"
on public.categories;

create policy "categories_delete_own"
on public.categories
for delete
to authenticated
using (
  user_id = auth.uid()
);


-- =========================================================
-- MERCHANTS POLICIES
-- =========================================================

drop policy if exists "merchants_select_own"
on public.merchants;

create policy "merchants_select_own"
on public.merchants
for select
to authenticated
using (
  user_id = auth.uid()
);


drop policy if exists "merchants_insert_own"
on public.merchants;

create policy "merchants_insert_own"
on public.merchants
for insert
to authenticated
with check (
  user_id = auth.uid()
);


drop policy if exists "merchants_update_own"
on public.merchants;

create policy "merchants_update_own"
on public.merchants
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


drop policy if exists "merchants_delete_own"
on public.merchants;

create policy "merchants_delete_own"
on public.merchants
for delete
to authenticated
using (
  user_id = auth.uid()
);


-- =========================================================
-- TRANSACTIONS POLICIES
-- =========================================================

drop policy if exists "transactions_select_own"
on public.transactions;

create policy "transactions_select_own"
on public.transactions
for select
to authenticated
using (
  user_id = auth.uid()
);


drop policy if exists "transactions_insert_own"
on public.transactions;

create policy "transactions_insert_own"
on public.transactions
for insert
to authenticated
with check (
  user_id = auth.uid()
);


drop policy if exists "transactions_update_own"
on public.transactions;

create policy "transactions_update_own"
on public.transactions
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


drop policy if exists "transactions_delete_own"
on public.transactions;

create policy "transactions_delete_own"
on public.transactions
for delete
to authenticated
using (
  user_id = auth.uid()
);


-- =========================================================
-- TRANSACTION ITEMS POLICIES
-- =========================================================

drop policy if exists "items_select_own"
on public.transaction_items;

create policy "items_select_own"
on public.transaction_items
for select
to authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_items.transaction_id
      and t.user_id = auth.uid()
  )
);


drop policy if exists "items_insert_own"
on public.transaction_items;

create policy "items_insert_own"
on public.transaction_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_items.transaction_id
      and t.user_id = auth.uid()
  )
);


drop policy if exists "items_update_own"
on public.transaction_items;

create policy "items_update_own"
on public.transaction_items
for update
to authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_items.transaction_id
      and t.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_items.transaction_id
      and t.user_id = auth.uid()
  )
);


drop policy if exists "items_delete_own"
on public.transaction_items;

create policy "items_delete_own"
on public.transaction_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_items.transaction_id
      and t.user_id = auth.uid()
  )
);


-- =========================================================
-- BUDGET POLICIES
-- =========================================================

drop policy if exists "budgets_select_own"
on public.budgets;

create policy "budgets_select_own"
on public.budgets
for select
to authenticated
using (
  user_id = auth.uid()
);


drop policy if exists "budgets_insert_own"
on public.budgets;

create policy "budgets_insert_own"
on public.budgets
for insert
to authenticated
with check (
  user_id = auth.uid()
);


drop policy if exists "budgets_update_own"
on public.budgets;

create policy "budgets_update_own"
on public.budgets
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


drop policy if exists "budgets_delete_own"
on public.budgets;

create policy "budgets_delete_own"
on public.budgets
for delete
to authenticated
using (
  user_id = auth.uid()
);


-- =========================================================
-- GRANTS
-- =========================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete
on public.profiles
to authenticated;

grant select, insert, update, delete
on public.categories
to authenticated;

grant select, insert, update, delete
on public.merchants
to authenticated;

grant select, insert, update, delete
on public.transactions
to authenticated;

grant select, insert, update, delete
on public.transaction_items
to authenticated;

grant select, insert, update, delete
on public.budgets
to authenticated;


create or replace function public.set_user_id()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.user_id = auth.uid();
  return new;
end;
$$;


drop trigger if exists categories_set_user_id
on public.categories;

create trigger categories_set_user_id
before insert on public.categories
for each row
execute function public.set_user_id();


drop trigger if exists merchants_set_user_id
on public.merchants;

create trigger merchants_set_user_id
before insert on public.merchants
for each row
execute function public.set_user_id();


drop trigger if exists transactions_set_user_id
on public.transactions;

create trigger transactions_set_user_id
before insert on public.transactions
for each row
execute function public.set_user_id();


drop trigger if exists budgets_set_user_id
on public.budgets;

create trigger budgets_set_user_id
before insert on public.budgets
for each row
execute function public.set_user_id();