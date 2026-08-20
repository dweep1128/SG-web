-- Run this once in Supabase Dashboard → SQL Editor. Never expose a service-role key to the browser.
create extension if not exists pgcrypto;

create type public.app_role as enum ('customer', 'staff', 'admin');
create type public.stock_status as enum ('in_stock', 'limited', 'out_of_stock');
create type public.quote_status as enum ('new', 'contacted', 'quoted', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  business_name text,
  phone text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.scooter_models (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  model_year text,
  unique (brand, model, model_year)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  sku text not null unique,
  short_description text,
  description text,
  voltage text,
  connector_type text,
  warranty text,
  product_type text default 'aftermarket',
  moq integer not null default 1 check (moq > 0),
  stock public.stock_status not null default 'in_stock',
  available_quantity integer check (available_quantity >= 0),
  dispatch_time text default '2–4 working days',
  price_from numeric(12,2),
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0
);

create table public.product_compatibility (
  product_id uuid not null references public.products(id) on delete cascade,
  scooter_model_id uuid not null references public.scooter_models(id) on delete cascade,
  primary key (product_id, scooter_model_id)
);

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  phone text not null,
  business_name text,
  city text,
  gst_number text,
  message text,
  status public.quote_status not null default 'new',
  created_at timestamptz not null default now()
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0)
);

create index products_search_idx on public.products using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(short_description, '')));
create index products_category_idx on public.products(category_id) where is_active;
create index compatibility_model_idx on public.product_compatibility(scooter_model_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('staff', 'admin') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.create_quote_request(
  customer_name text, customer_phone text, customer_business text, customer_city text,
  customer_gst text, customer_message text, items jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare quote_id uuid; item jsonb; matched_product public.products%rowtype;
begin
  if char_length(trim(customer_name)) < 2 or char_length(trim(customer_phone)) < 8 then raise exception 'Name and a valid phone number are required'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'At least one product is required'; end if;
  insert into public.quote_requests(user_id, full_name, phone, business_name, city, gst_number, message)
  values (auth.uid(), trim(customer_name), trim(customer_phone), nullif(trim(customer_business), ''), nullif(trim(customer_city), ''), nullif(trim(customer_gst), ''), nullif(trim(customer_message), '')) returning id into quote_id;
  for item in select * from jsonb_array_elements(items) loop
    select * into matched_product from public.products where id = (item->>'product_id')::uuid and is_active;
    if not found then raise exception 'One of the selected products is unavailable'; end if;
    insert into public.quote_items(quote_request_id, product_id, product_name, sku, quantity)
    values (quote_id, matched_product.id, matched_product.name, matched_product.sku, greatest(1, (item->>'quantity')::integer));
  end loop;
  return quote_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.scooter_models enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_compatibility enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_items enable row level security;

create policy "public reads active categories" on public.categories for select using (true);
create policy "public reads models" on public.scooter_models for select using (true);
create policy "public reads active products" on public.products for select using (is_active or public.is_staff());
create policy "public reads product images" on public.product_images for select using (true);
create policy "public reads compatibility" on public.product_compatibility for select using (true);
create policy "users read own profile" on public.profiles for select using (auth.uid() = id or public.is_staff());
create policy "users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "staff manage categories" on public.categories for all using (public.is_staff()) with check (public.is_staff());
create policy "staff manage models" on public.scooter_models for all using (public.is_staff()) with check (public.is_staff());
create policy "staff manage products" on public.products for all using (public.is_staff()) with check (public.is_staff());
create policy "staff manage product images" on public.product_images for all using (public.is_staff()) with check (public.is_staff());
create policy "staff manage compatibility" on public.product_compatibility for all using (public.is_staff()) with check (public.is_staff());
create policy "staff read quotes" on public.quote_requests for select using (public.is_staff());
create policy "staff update quotes" on public.quote_requests for update using (public.is_staff()) with check (public.is_staff());
create policy "staff read quote items" on public.quote_items for select using (public.is_staff());

insert into public.categories(name, slug, description, sort_order) values
 ('Electricals', 'electricals', 'Controllers, chargers, BMS and wiring', 1),
 ('Motor & Performance', 'motor-performance', 'Motors, throttles and sensors', 2),
 ('Body & Fittings', 'body-fittings', 'Mirrors, footrests and body panels', 3),
 ('Brakes & Suspension', 'brakes-suspension', 'Brake parts, cables and shockers', 4)
on conflict (slug) do nothing;

insert into public.scooter_models(brand, model) values
 ('Ola', 'S1 Pro'), ('Ola', 'S1 Air'), ('Ather', '450X'), ('TVS', 'iQube'), ('Bajaj', 'Chetak'), ('Universal', 'Universal fit')
on conflict do nothing;

insert into public.products(category_id, name, slug, sku, short_description, description, voltage, connector_type, warranty, product_type, moq, stock, available_quantity, dispatch_time, price_from, is_featured)
select c.id, d.name, d.slug, d.sku, d.short_description, d.description, d.voltage, d.connector_type, d.warranty, 'aftermarket', d.moq, d.stock::public.stock_status, d.available_quantity, '2–4 working days', d.price_from, true
from (values
 ('electricals','Voltup Lithium Charger 60V 6A','voltup-lithium-charger-60v-6a','SK-CH-601','Lithium battery charger with aluminium body.','60V 6A lithium charger for compatible EV scooter battery systems. Confirm the connector and cut-off voltage before ordering.','60V / 6A','Standard 3-pin','3 months',3,'in_stock',36,2190.00),
 ('electricals','Voltup Lead Charger 48V 4A','voltup-lead-charger-48v-4a','SK-CH-484','48V lead-acid scooter battery charger.','Durable 48V / 4A charger suited to compatible lead-acid EV scooter battery packs.','48V / 4A','Standard 3-pin','3 months',5,'in_stock',52,1290.00),
 ('electricals','Voltup Lithium Charger 71.4V Cut-off','voltup-lithium-charger-714v','SK-CH-714','High-voltage lithium charger for select models.','60V 6A lithium charger with a 71.4V cut-off. Confirm compatibility with the sales team before purchase.','71.4V cut-off / 6A','Standard 3-pin','3 months',3,'limited',8,2450.00),
 ('body-fittings','EV Plain Number Plate — Set of 10','ev-plain-number-plate','SK-BD-010','Plain number plate mounting set.','Replacement EV number plate set for workshop and dealer orders.','Universal','Universal mounting','No warranty',10,'in_stock',120,120.00),
 ('brakes-suspension','Ladies Footrest Iron','ladies-footrest-iron','SK-BF-177','Heavy-duty iron footrest.','Iron ladies footrest replacement part for compatible electric scooters.','Universal','Standard mounting','No warranty',10,'in_stock',64,177.00),
 ('motor-performance','Hub Motor Assembly 48V 1000W','hub-motor-48v-1000w','SK-MT-100','Hub motor assembly for compatible scooters.','48V 1000W hub motor assembly for dealer and workshop replacement orders. Confirm wheel size and connector before purchase.','48V / 1000W','Phase wire + hall sensor','3 months',2,'limited',6,6900.00)
) as d(category_slug,name,slug,sku,short_description,description,voltage,connector_type,warranty,moq,stock,available_quantity,price_from)
join public.categories c on c.slug = d.category_slug
on conflict (slug) do nothing;

insert into public.product_images(product_id,image_url,alt_text,sort_order)
select p.id, d.image_url, p.name, 1 from (values
 ('voltup-lithium-charger-60v-6a','https://careevindia.com/wp-content/uploads/2026/05/1000534336-2-300x300.png'),
 ('voltup-lead-charger-48v-4a','https://careevindia.com/wp-content/uploads/2026/06/ChatGPT-Image-Jun-10-2026-04_31_20-PM-300x300.webp'),
 ('voltup-lithium-charger-714v','https://careevindia.com/wp-content/uploads/2026/08/1000534317-1-300x300.png')
) as d(product_slug,image_url) join public.products p on p.slug = d.product_slug
on conflict do nothing;

insert into public.product_compatibility(product_id,scooter_model_id)
select p.id,m.id from (values
 ('voltup-lithium-charger-60v-6a','Ola','S1 Pro'),('voltup-lithium-charger-60v-6a','Universal','Universal fit'),
 ('voltup-lead-charger-48v-4a','TVS','iQube'),('voltup-lead-charger-48v-4a','Universal','Universal fit'),
 ('voltup-lithium-charger-714v','Ather','450X'),('hub-motor-48v-1000w','Universal','Universal fit'),
 ('ladies-footrest-iron','Universal','Universal fit'),('ev-plain-number-plate','Universal','Universal fit')
) as d(product_slug,brand,model) join public.products p on p.slug=d.product_slug join public.scooter_models m on m.brand=d.brand and m.model=d.model
on conflict do nothing;

-- Create the first administrator after registering that account:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
