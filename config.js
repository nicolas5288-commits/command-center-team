// Supabase 連線設定。
// publishable key 受資料庫 RLS 保護，公開在前端沒有風險（未登入的請求會被拒絕）。
// ⚠️ 絕對不要把 secret key（sb_secret_...）放這裡。
//
// 兩個值留空字串 = 單人 localStorage 模式（本機開發、還沒設定 Supabase 時用）。
// 填入後 = 團隊雲端模式（開站要登入、成員狀態跨裝置即時同步）。
window.CC_SUPABASE_URL = "https://mptdxnndaezfruvsgedn.supabase.co";
window.CC_SUPABASE_ANON_KEY = "sb_publishable_TIiX8yuZTTI03VqR-nuZ8A_Hq68nHYJ";
