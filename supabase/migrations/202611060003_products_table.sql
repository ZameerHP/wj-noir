-- Migration: Add products catalog table and update create_order to support dynamic products
-- Migration file: 202611060003_products_table.sql

create table if not exists public.products (
  id text primary key,
  title text not null,
  upper text not null,
  category text not null default 'FOR HIM',
  tagline text not null default '',
  intro text not null default '',
  description text not null default '',
  story text not null default '',
  image text not null,
  alt_image text not null default '',
  gallery jsonb not null default '[]'::jsonb,
  price numeric(10, 2) not null check (price > 0),
  show_price boolean not null default true,
  tones jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  number text not null default '04',
  created_at timestamptz not null default now()
);

-- Seed existing products
insert into public.products (id, title, upper, category, tagline, intro, description, story, image, alt_image, gallery, price, show_price, tones, notes, number)
values
  ('the-office', 'The Office', 'THE OFFICE', 'FOR HIM', 'Command the moment.', 'Focus. Confidence. All day.', 'A confident blend of bright bergamot, aromatic lavender and a lasting woody finish.', 'Composed for those who know their presence speaks before they do.', 'assets/wj-noir-the-office.png', 'the-office-poster.jpg', '["wj-noir-the-office.jpg","wj-noir-the-office-studio.jpg","wj-noir-the-office-water.jpg","wj-noir-the-office-box.jpg"]'::jsonb, 2999, true, '["BERGAMOT", "LAVENDER", "WOODY"]'::jsonb, '[{"type":"TOP NOTE","note":"Bergamot","description":"Citrus & fresh"},{"type":"HEART NOTE","note":"Lavender","description":"Floral & aromatic"},{"type":"BASE NOTE","note":"Woody","description":"Warm & masculine"}]'::jsonb, '01'),
  ('ice-desire', 'Ice Desire', 'ICE DESIRE', 'FOR HIM', 'A cooler kind of confidence.', 'The allure of the unexpected.', 'A rush of crystalline freshness, cool mountain air and quiet confidence.', 'For the moment everything stands still, and only your presence remains.', 'assets/wj-noir-ice-desire.png', 'dark-collection-alt.webp', '["wj-noir-ice-desire.jpg","wj-noir-ice-desire-water.jpg","wj-noir-ice-desire-studio.jpg","wj-noir-ice-desire-box.jpg"]'::jsonb, 2499, true, '["FRESH", "COOL", "REFINED"]'::jsonb, '[{"type":"CHARACTER","note":"Icy freshness","description":"Cool & invigorating"},{"type":"FEELING","note":"Crystal clarity","description":"Clean & luminous"},{"type":"IMPRESSION","note":"Modern elegance","description":"Distinct & refined"}]'::jsonb, '02'),
  ('levoria', 'Lévoria', 'LÉVORIA', 'FOR HER', 'A softer form of power.', 'Elegance is unforgettable.', 'Golden vanilla, luminous fruits and warm woods in a graceful, lasting signature.', 'A fragrance that feels like the first golden light of evening.', 'assets/wj-noir-levoria.png', 'dark-collection.webp', '["wj-noir-levoria-studio.jpg","wj-noir-levoria-box.jpg","wj-noir-levoria-model.jpg","wj-noir-levoria.jpg"]'::jsonb, 2499, true, '["VANILLA", "FRUITY", "WOODY"]'::jsonb, '[{"type":"TOP NOTE","note":"Vanilla","description":"Sweet & gourmand"},{"type":"HEART NOTE","note":"Fruity","description":"Juicy & elegant"},{"type":"BASE NOTE","note":"Woody","description":"Warm & lasting"}]'::jsonb, '03')
on conflict (id) do nothing;

alter table public.products enable row level security;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists "Anyone can read products" on public.products;
create policy "Anyone can read products" on public.products for select using (true);

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products" on public.products for all to authenticated using (public.is_order_admin()) with check (public.is_order_admin());

-- Update create_order to read from public.products table
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
  v_sale public.sale_settings;
  v_sale_active boolean := false;
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
    or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'Please select valid products.';
  end if;

  select count(*), count(distinct requested.product_id)
  into v_item_count, v_distinct_count
  from jsonb_to_recordset(p_items) as requested(product_id text, quantity integer);

  if v_item_count <> v_distinct_count then
    raise exception 'Duplicate products are not allowed.';
  end if;

  select * into v_sale from public.sale_settings where id = 'active' limit 1;
  if found and v_sale.is_active then
    if (v_sale.start_date is null or now() >= v_sale.start_date)
       and (v_sale.end_date is null or now() <= v_sale.end_date) then
      v_sale_active := true;
    end if;
  end if;

  with catalog(product_id, product_name, product_image, category, original_price) as (
    select id, title, image, category, price
    from public.products
    union all
    select 'the-office', 'The Office', 'assets/wj-noir-the-office.png', 'FOR HIM', 2999::numeric
    where not exists (select 1 from public.products where id = 'the-office')
    union all
    select 'ice-desire', 'Ice Desire', 'assets/wj-noir-ice-desire.png', 'FOR HIM', 2499::numeric
    where not exists (select 1 from public.products where id = 'ice-desire')
    union all
    select 'levoria', 'Lévoria', 'assets/wj-noir-levoria.png', 'FOR HER', 2499::numeric
    where not exists (select 1 from public.products where id = 'levoria')
  ),
  priced_catalog as (
    select
      cat.product_id,
      cat.product_name,
      cat.product_image,
      case
        when v_sale_active
          and (v_sale.custom_prices ? cat.product_id)
          and (v_sale.custom_prices ->> cat.product_id)::numeric > 0
        then (v_sale.custom_prices ->> cat.product_id)::numeric
        when v_sale_active and (
          v_sale.target_type = 'all'
          or (v_sale.target_type = 'category' and cat.category = v_sale.target_category)
          or (v_sale.target_type = 'custom' and v_sale.target_product_ids ? cat.product_id)
        ) and v_sale.discount_percentage > 0
        then round(cat.original_price * (1.0 - (v_sale.discount_percentage / 100.0)))
        else cat.original_price
      end as unit_price
    from catalog cat
  )
  select count(*), sum(pc.unit_price * requested.quantity)
  into v_valid_count, v_total
  from jsonb_to_recordset(p_items) as requested(product_id text, quantity integer)
  join priced_catalog pc on pc.product_id = requested.product_id
  where requested.quantity between 1 and 99;

  if v_valid_count <> v_item_count then
    raise exception 'One or more products or quantities are invalid.';
  end if;

  insert into public.orders (
    customer_name, email, phone, address, city, state, postal_code, country,
    notes, payment_method, total_amount, status
  ) values (
    trim(p_customer_name), lower(trim(p_email)), trim(p_phone), trim(p_address),
    trim(p_city), trim(p_state), trim(p_postal_code), trim(p_country),
    trim(coalesce(p_notes, '')), 'Cash on Delivery', v_total, 'pending'
  )
  returning * into v_order;

  with catalog(product_id, product_name, product_image, category, original_price) as (
    select id, title, image, category, price
    from public.products
    union all
    select 'the-office', 'The Office', 'assets/wj-noir-the-office.png', 'FOR HIM', 2999::numeric
    where not exists (select 1 from public.products where id = 'the-office')
    union all
    select 'ice-desire', 'Ice Desire', 'assets/wj-noir-ice-desire.png', 'FOR HIM', 2499::numeric
    where not exists (select 1 from public.products where id = 'ice-desire')
    union all
    select 'levoria', 'Lévoria', 'assets/wj-noir-levoria.png', 'FOR HER', 2499::numeric
    where not exists (select 1 from public.products where id = 'levoria')
  ),
  priced_catalog as (
    select
      cat.product_id,
      cat.product_name,
      cat.product_image,
      case
        when v_sale_active
          and (v_sale.custom_prices ? cat.product_id)
          and (v_sale.custom_prices ->> cat.product_id)::numeric > 0
        then (v_sale.custom_prices ->> cat.product_id)::numeric
        when v_sale_active and (
          v_sale.target_type = 'all'
          or (v_sale.target_type = 'category' and cat.category = v_sale.target_category)
          or (v_sale.target_type = 'custom' and v_sale.target_product_ids ? cat.product_id)
        ) and v_sale.discount_percentage > 0
        then round(cat.original_price * (1.0 - (v_sale.discount_percentage / 100.0)))
        else cat.original_price
      end as unit_price
    from catalog cat
  )
  insert into public.order_items (order_id, product_name, product_image, size_ml, quantity, unit_price)
  select v_order.id, pc.product_name, pc.product_image, 50, requested.quantity, pc.unit_price
  from jsonb_to_recordset(p_items) as requested(product_id text, quantity integer)
  join priced_catalog pc on pc.product_id = requested.product_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'total_amount', v_order.total_amount
  );
end;
$$;

revoke all on function public.create_order(text, text, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_order(text, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
