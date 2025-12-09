import { createClient } from '@supabase/supabase-js'

// 1) 우선 Vite 환경변수에서 읽어보고
const envUrl = import.meta.env.VITE_SUPABASE_URL
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 2) 없으면 하드코딩 값으로 fallback
const supabaseUrl = envUrl || 'https://dwwtdmlxxhyadcsyuuhw.supabase.co'
const supabaseKey = envKey || 'sb_publishable_mFYwplt-2cF3DMj9dzluCA_Qt7gz6j1'

export const supabase = createClient(supabaseUrl, supabaseKey)
