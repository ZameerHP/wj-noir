create sequence if not exists public.wj_order_number_seq start with 1001;

create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(email))
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('ORD-' || nextval('public.wj_order_number_seq')::text),
  customer_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null,
  notes text not null default '',
  payment_method text not null default 'Cash on Delivery',
  total_amount numeric(10, 2) not null check (total_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_name text not null,
  product_image text not null,
  size_ml integer not null default 50 check (size_ml > 0),
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(10, 2) not null check (unit_price > 0)
);

insert into public.admin_allowlist (email)
values (lower('wjnoir@gmail.com'))
on conflict (email) do nothing;

alter table public.admin_allowlist enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.admin_allowlist, public.orders, public.order_items from anon, authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

create or replace function public.is_order_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_allowlist allowed
    where allowed.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_order_admin() from public, anon;
grant execute on function public.is_order_admin() to authenticated;

drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders"
  on public.orders for select to authenticated
  using (public.is_order_admin());

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
  on public.orders for update to authenticated
  using (public.is_order_admin())
  with check (public.is_order_admin());

drop policy if exists "Admins can read order items" on public.order_items;
create policy "Admins can read order items"
  on public.order_items for select to authenticated
  using (public.is_order_admin());

create or replace function public.create_order(
  p_customer_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_notes text,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_item_count integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_total numeric(10, 2);
begin
  if length(trim(coalesce(p_customer_name, ''))) not between 1 and 120
    or length(trim(coalesce(p_email, ''))) > 254
    or trim(coalesce(p_email, '')) !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    or length(trim(coalesce(p_phone, ''))) > 30
    or trim(coalesce(p_phone, '')) !~ '^[+0-9 ().-]+$'
    or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10
    or length(trim(coalesce(p_address, ''))) not between 1 and 300
    or length(trim(coalesce(p_city, ''))) not between 1 and 100
    or length(trim(coalesce(p_state, ''))) not between 1 and 100
    or length(trim(coalesce(p_postal_code, ''))) not between 1 and 20
    or length(trim(coalesce(p_country, ''))) not between 1 and 100
    or length(coalesce(p_notes, '')) > 1000
    or coalesce(p_payment_method, '') <> 'Cash on Delivery' then
    raise exception 'Please provide valid customer and delivery details.';
  end if;

  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 3 then
    raise exception 'Please select one to three valid products.';
  end if;

  select count(*), count(distinct requested.product_id)
  into v_item_count, v_distinct_count
  from jsonb_to_recordset(p_items) as requested(product_id text, quantity integer);

  if v_item_count <> v_distinct_count then
    raise exception 'Duplicate products are not allowed.';
  end if;

  with catalog(product_id, product_name, product_image, unit_price) as (
    values
      ('the-office', 'The Office', 'assets/wj-noir-the-office.png', 2999::numeric),
      ('ice-desire', 'Ice Desire', 'assets/wj-noir-ice-desire.png', 2499::numeric),
      ('levoria', 'Lévoria', 'assets/wj-noir-levoria.png', 2499::numeric)
  )
  select count(*), sum(catalog.unit_price * requested.quantity)
  into v_valid_count, v_total
  from jsonb_to_recordset(p_items) as requested(product_id text, quantity integer)
  join catalog on catalog.product_id = requested.product_id
  where requested.quantity between 1 and 99;

  if v_valid_count <> v_item_count then
    raise exception 'One or more products or quantities are invalid.';
  end if;

  insert into public.orders (
    customer_name, email, phone, address, city, state, postal_code, country,
    notes, payment_method, total_amount
  ) values (
    trim(p_customer_name), lower(trim(p_email)), trim(p_phone), trim(p_address),
    trim(p_city), trim(p_state), trim(p_postal_code), trim(p_country),
    trim(coalesce(p_notes, '')), 'Cash on Delivery', v_total
  )
  returning * into v_order;

  with catalog(product_id, product_name, product_image, unit_price) as (
    values
      ('the-office', 'The Office', 'assets/wj-noir-the-office.png', 2999::numeric),
      ('ice-desire', 'Ice Desire', 'assets/wj-noir-ice-desire.png', 2499::numeric),
      ('levoria', 'Lévoria', 'assets/wj-noir-levoria.png', 2499::numeric)
  )
  insert into public.order_items (order_id, product_name, product_image, size_ml, quantity, unit_price)
  select v_order.id, catalog.product_name, catalog.product_image, 50, requested.quantity, catalog.unit_price
  from jsonb_to_recordset(p_items) as requested(product_id text, quantity integer)
  join catalog on catalog.product_id = requested.product_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'total_amount', v_order.total_amount
  );
end;
$$;

revoke all on function public.create_order(text, text, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_order(text, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_function_url text;
  v_service_role_key text;
begin
  select decrypted_secret into v_function_url
  from vault.decrypted_secrets
  where name = 'order_email_function_url'
  limit 1;

  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'order_email_service_role_key'
  limit 1;

  if coalesce(v_function_url, '') = '' or coalesce(v_service_role_key, '') = '' then
    raise warning 'Order email secrets are not configured; order % was saved without sending email.', new.order_number;
    return new;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object('record', jsonb_build_object('id', new.id, 'order_number', new.order_number))
  );
  return new;
exception when others then
  raise warning 'Could not queue order email for %: %', new.order_number, sqlerrm;
  return new;
end;
$$;

drop trigger if exists send_order_email_after_insert on public.orders;
create trigger send_order_email_after_insert
  after insert on public.orders
  for each row execute function public.notify_new_order();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.orders';
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;
