const supabaseUrl = "https://eqgyfkxiecozflnbypkl.supabase.co";
const supabaseKey = "sb_publishable_3MQXaPuO9U3O_zub0LPoGg_N2pIYkIJ";

// 変数名「supabase」を使わずに、直接 window に入れる
window.supabaseConnection = window.supabase.createClient(supabaseUrl, supabaseKey);

console.log("Supabaseの初期化に成功しました");