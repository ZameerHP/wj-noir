-- Migration: Add separate custom product prices support to sale_settings
-- Migration file: 202611060002_custom_prices.sql

-- 1. Add custom_prices jsonb column to public.sale_settings
alter table public.sale_settings
add column if not exists custom_prices jsonb not null default '{"the-office": 2499, "ice-desire": 2082, "levoria": 1999}'::jsonb;

-- 2. Update active sale record with default custom prices (Levoria = 1999)
update public.sale_settings
set custom_prices = '{"the-office": 2499, "ice-desire": 2082, "levoria": 1999}'::jsonb
where id = 'active' and (custom_prices is null or custom_prices = '{}'::jsonb or custom_prices = '{"the-office": 2499, "ice-desire": 2082, "levoria": 1999}'::jsonb);

-- 3. Update create_order to prioritize custom_prices over global discount percentage
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
    or jsonb_array_length(p_items) not between 1 and 3 then
    raise exception 'Please select one to three valid products.';
  end if;

  select count(*), count(distinct requested.product_id)
  into v_item_count, v_distinct_count
  from jsonb_to_recordset(p_items) as requested(product_id text, quantity integer);

  if v_item_count <> v_distinct_count then
    raise exception 'Duplicate products are not allowed.';
  end if;

  -- Check if sale is active and within schedule
  select * into v_sale from public.sale_settings where id = 'active' limit 1;
  if found and v_sale.is_active then
    if (v_sale.start_date is null or now() >= v_sale.start_date)
       and (v_sale.end_date is null or now() <= v_sale.end_date) then
      v_sale_active := true;
    end if;
  end if;

  with catalog(product_id, product_name, product_image, category, original_price) as (
    values
      ('the-office', 'The Office', 'assets/wj-noir-the-office.png', 'FOR HIM', 2999::numeric),
      ('ice-desire', 'Ice Desire', 'assets/wj-noir-ice-desire.png', 'FOR HIM', 2499::numeric),
      ('levoria', 'Lévoria', 'assets/wj-noir-levoria.png', 'FOR HER', 2499::numeric)
  ),
  priced_catalog as (
    select
      cat.product_id,
      cat.product_name,
      cat.product_image,
      case
        -- 1. Explicit separate product sale price
        when v_sale_active
          and (v_sale.custom_prices ? cat.product_id)
          and (v_sale.custom_prices ->> cat.product_id)::numeric > 0
        then (v_sale.custom_prices ->> cat.product_id)::numeric

        -- 2. Scoped percentage discount
        when v_sale_active and (
          v_sale.target_type = 'all'
          or (v_sale.target_type = 'category' and cat.category = v_sale.target_category)
          or (v_sale.target_type = 'custom' and v_sale.target_product_ids ? cat.product_id)
        )
        then round(cat.original_price * (1.0 - (v_sale.discount_percentage / 100.0)))

        -- 3. Standard original catalog price
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
    values
      ('the-office', 'The Office', 'assets/wj-noir-the-office.png', 'FOR HIM', 2999::numeric),
      ('ice-desire', 'Ice Desire', 'assets/wj-noir-ice-desire.png', 'FOR HIM', 2499::numeric),
      ('levoria', 'Lévoria', 'assets/wj-noir-levoria.png', 'FOR HER', 2499::numeric)
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
        )
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
