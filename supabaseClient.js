// 💡 一番安全な初期化方法（これなら絶対に二重宣言エラーになりません）
if (!window.globalSupabase) {
    const supabaseUrl = "https://eqgyfkxiecozflnbypkl.supabase.co";
    const supabaseKey = "sb_publishable_3MQXaPuO9U3O_zub0LPoGg_N2pIYkIJ";
    window.globalSupabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: {
            // 💡 ログイン状態をブラウザに保存し、閉じて開き直してもログインしたままにする
            persistSession: true,
            storage: window.localStorage,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    });
}

export const supabase = window.globalSupabase;

// 💡 XSS対策：ユーザー入力や外部APIの値をinnerHTMLに入れる前に必ず通す
export function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));
}
window.escapeHTML = escapeHTML;

// 💡 各所で繰り返されるユーザー取得処理をまとめたヘルパー
export async function getCurrentUser() {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}