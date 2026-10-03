-- ═══════════════════════════════════════════════════════════════════════════
-- ShepherdAI — Supabase Şeması (Güvenli Kimlik Doğrulama + Sahiplik Bazlı RLS)
-- ═══════════════════════════════════════════════════════════════════════════
-- Bu betik Supabase Dashboard > SQL Editor'da TEK SEFERDE çalıştırılır.
-- İdempotenttir: hem sıfır kurulumda hem de eski (v0.06) şemanın üzerinde güvenle çalışır.
--
-- Eski şemadan farklar:
--   1. "Allow anon full access" politikası KALDIRILDI. Anonim anahtar artık hiçbir satırı okuyamaz/yazamaz.
--   2. Her satırın bir sahibi var (owner_id = auth.users.id). Kullanıcı yalnızca kendi satırına erişir.
--   3. Kiracı anahtarı 'shepherd_data_<auth.uid()>' biçimine zorlanır.
--   4. Düz metin şifreler içeren 'shepherd_global_users_registry' satırı SİLİNİR. Şifreler,
--      istemcinin erişemediği legacy_users tablosuna bcrypt hash olarak taşınır ve yalnızca
--      claim_legacy_farm() fonksiyonu ile, eski şifre doğrulanarak bir kez kullanılabilir.
--
-- Ön koşul: Authentication > Providers > Email etkin olmalı.
-- (İsteğe bağlı) Authentication > Sign In / Providers > "Confirm email" kapalıysa kayıt sonrası
-- kullanıcı hemen giriş yapar; açıksa e-posta doğrulaması sonrası giriş yapar.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── 1. Çiftlik verisi tablosu ──
create table if not exists public.farms_data (
    id uuid primary key default gen_random_uuid(),
    tenant_key text unique not null,
    farm_payload jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);

alter table public.farms_data
    add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_farms_data_tenant_key on public.farms_data (tenant_key);
create index if not exists idx_farms_data_owner_id on public.farms_data (owner_id);

-- ── 2. Eski kullanıcı kayıtlarını güvenli tabloya taşı (yalnızca göç için) ──
create table if not exists public.legacy_users (
    email text primary key,
    password_hash text not null,
    storage_key text not null,
    farm_name text,
    owner_name text,
    role text default 'owner'
);

-- RLS açık + hiç politika yok = istemciden (anon/authenticated) erişim tamamen kapalı
alter table public.legacy_users enable row level security;

insert into public.legacy_users (email, password_hash, storage_key, farm_name, owner_name, role)
select lower(u->>'email'),
       extensions.crypt(u->>'password', extensions.gen_salt('bf')),
       u->>'storageKey',
       u->>'farmName',
       u->>'ownerName',
       coalesce(u->>'role', 'owner')
from (
    select farm_payload
    from public.farms_data
    where tenant_key = 'shepherd_global_users_registry'
      and jsonb_typeof(farm_payload) = 'array'
) f
cross join lateral jsonb_array_elements(f.farm_payload) as u
where coalesce(u->>'email', '') like '%@%'
  and coalesce(u->>'password', '') <> ''
  and coalesce(u->>'storageKey', '') <> ''
  and coalesce((u->>'isDemo')::boolean, false) = false
on conflict (email) do nothing;

-- Düz metin şifre içeren eski kullanıcı listesi ve herkese açık demo verisi silinir
delete from public.farms_data
where tenant_key in ('shepherd_global_users_registry', 'shepherd_data_demo');

-- ── 3. Row Level Security: yalnızca sahibine erişim ──
alter table public.farms_data enable row level security;

drop policy if exists "Allow anon full access" on public.farms_data;
drop policy if exists "farms_select_own" on public.farms_data;
drop policy if exists "farms_insert_own" on public.farms_data;
drop policy if exists "farms_update_own" on public.farms_data;
drop policy if exists "farms_delete_own" on public.farms_data;

create policy "farms_select_own" on public.farms_data
    for select to authenticated
    using (owner_id = auth.uid());

create policy "farms_insert_own" on public.farms_data
    for insert to authenticated
    with check (owner_id = auth.uid() and tenant_key = 'shepherd_data_' || auth.uid()::text);

create policy "farms_update_own" on public.farms_data
    for update to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid() and tenant_key = 'shepherd_data_' || auth.uid()::text);

create policy "farms_delete_own" on public.farms_data
    for delete to authenticated
    using (owner_id = auth.uid());

-- ── 4. updated_at otomatik güncelleme tetikleyicisi ──
create or replace function public.update_farms_data_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_farms_data_updated_at on public.farms_data;
create trigger trg_update_farms_data_updated_at
    before update on public.farms_data
    for each row
    execute function public.update_farms_data_updated_at();

-- ── 5. Eski çiftlik verisini yeni hesaba bağlama (tek seferlik, şifre doğrulamalı) ──
-- Kullanıcı yeni sistemde eski e-postasıyla giriş/kayıt olduğunda istemci bu fonksiyonu
-- eski şifresiyle çağırır. Şifre eşleşirse eski satır yeni hesaba devredilir ve legacy kaydı silinir.
create or replace function public.claim_legacy_farm(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_uid uuid := auth.uid();
    v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_legacy public.legacy_users%rowtype;
    v_new_key text;
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    select * into v_legacy from public.legacy_users where email = v_email;
    if not found then
        return jsonb_build_object('claimed', false);
    end if;

    if v_legacy.password_hash <> extensions.crypt(p_password, v_legacy.password_hash) then
        return jsonb_build_object('claimed', false);
    end if;

    v_new_key := 'shepherd_data_' || v_uid::text;

    if not exists (select 1 from public.farms_data where tenant_key = v_new_key) then
        update public.farms_data
           set tenant_key = v_new_key,
               owner_id = v_uid
         where tenant_key = v_legacy.storage_key
           and owner_id is null;
    end if;

    delete from public.legacy_users where email = v_email;

    return jsonb_build_object(
        'claimed', true,
        'farmName', v_legacy.farm_name,
        'ownerName', v_legacy.owner_name,
        'role', v_legacy.role,
        'legacyStorageKey', v_legacy.storage_key
    );
end;
$$;

revoke all on function public.claim_legacy_farm(text) from public, anon;
grant execute on function public.claim_legacy_farm(text) to authenticated;
