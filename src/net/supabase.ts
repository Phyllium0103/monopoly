import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 連線：網址與公開金鑰來自建置時的環境變數（VITE_ 開頭，見 .env.example）。
 * 只使用 publishable / anon key；service role 金鑰只存在 Edge Function 的伺服器環境。
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

let client: SupabaseClient | null = null;

/** 沒有設定環境變數時回傳 null（多人模式停用，單人照常） */
export function supabase(): SupabaseClient | null {
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'xiantu-auth' },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}

export const multiplayerAvailable = () => !!url && !!key;
