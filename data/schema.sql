-- ShepherdAI — Çoklu Cihaz Senkronizasyonu Tablo Şeması
-- Bu SQL kodunu Supabase Dashboard > SQL Editor alanında çalıştırın.

-- 1. Tablo Oluşturma
CREATE TABLE IF NOT EXISTS public.farms_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_key TEXT UNIQUE NOT NULL,
    farm_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Performance Index (tenant_key ile hızlı sorgulama için)
CREATE INDEX IF NOT EXISTS idx_farms_data_tenant_key ON public.farms_data (tenant_key);

-- 3. Row Level Security (RLS) & Anonim İzinler
ALTER TABLE public.farms_data ENABLE ROW LEVEL SECURITY;

-- Anonim/İstemci erişim politikaları (Tüm okuma, ekleme ve güncelleme işlemlerine izin verir)
DROP POLICY IF EXISTS "Allow anon full access" ON public.farms_data;
CREATE POLICY "Allow anon full access" ON public.farms_data
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Otomatik updated_at güncelleme tetikleyicisi
CREATE OR REPLACE FUNCTION update_farms_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_farms_data_updated_at ON public.farms_data;
CREATE TRIGGER trg_update_farms_data_updated_at
    BEFORE UPDATE ON public.farms_data
    FOR EACH ROW
    EXECUTE FUNCTION update_farms_data_updated_at();
