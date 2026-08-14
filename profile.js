import { supabase, getCurrentUser } from './supabaseClient.js';

// 💡 profile.html にある入力欄に、Supabaseの profiles テーブルから
//    読み込んだ「名前」「性別」と、ログインユーザーの固有ID(auth.uid())を反映する
export async function renderProfilePage() {
    const idInput = document.getElementById("profileId");
    const nameInput = document.getElementById("profileName");
    const genderSelect = document.getElementById("profileGender");

    // profile.html以外では何もしない
    if (!idInput && !nameInput && !genderSelect) return;

    const user = await getCurrentUser();
    if (!user) return;

    if (idInput) idInput.value = user.id;

    const { data, error } = await supabase
        .from("profiles")
        .select("name, gender")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        // profilesテーブルが未作成の場合など。固有IDだけは表示できるようにしておく
        console.warn("プロフィールの読み込みに失敗しました:", error.message);
        return;
    }

    if (data) {
        if (nameInput) nameInput.value = data.name || "";
        if (genderSelect) genderSelect.value = data.gender || "";
    }
}

// 💡 名前・性別を profiles テーブルに保存する（未登録なら新規作成、登録済みなら更新）
export async function saveProfile() {
    const user = await getCurrentUser();
    if (!user) {
        alert("ログインしてください。");
        return;
    }

    const name = document.getElementById("profileName")?.value.trim() || "";
    const gender = document.getElementById("profileGender")?.value || "";

    const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        name,
        gender,
        updated_at: new Date().toISOString(),
    });

    if (error) {
        console.error("プロフィール保存エラー:", error);
        alert("保存に失敗しました：" + error.message);
        return;
    }

    alert("プロフィールを保存しました。");
}

window.saveProfile = saveProfile;