import { supabase, getCurrentUser } from './supabaseClient.js';

// 💡 profile.html にある入力欄に、Supabaseの profiles テーブルから
//    読み込んだ「名前」「性別」と、ログインユーザーの固有ID(auth.uid())を反映する
export async function renderProfilePage() {
    const idInput = document.getElementById("profileId");
    const nameInput = document.getElementById("profileName");
    const genderSelect = document.getElementById("profileGender");
    const visibilitySelect = document.getElementById("profileVisibility");

    // profile.html以外では何もしない
    if (!idInput && !nameInput && !genderSelect && !visibilitySelect) return;

    const user = await getCurrentUser();
    if (!user) return;

    if (idInput) idInput.value = user.id;

    // 💡 固有IDの行はログイン時(auth.js の ensureProfileRow)に自動作成されている前提。
    //    念のため見つからない場合はここでも作成しておく
    let { data, error } = await supabase
        .from("profiles")
        .select("name, gender, bookshelf_visibility")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        console.warn("プロフィールの読み込みに失敗しました:", error.message);
        return;
    }

    if (!data) {
        const { error: insertError } = await supabase
            .from("profiles")
            .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
        if (insertError) {
            console.warn("固有IDの自動保存に失敗しました:", insertError.message);
        }
        data = { name: "", gender: "", bookshelf_visibility: "friends" };
    }

    if (nameInput) nameInput.value = data.name || "";
    if (genderSelect) genderSelect.value = data.gender || "";
    if (visibilitySelect) visibilitySelect.value = data.bookshelf_visibility || "friends";
}

// 💡 名前・性別・本棚の公開設定を profiles テーブルに保存する（未登録なら新規作成、登録済みなら更新）
export async function saveProfile() {
    const user = await getCurrentUser();
    if (!user) {
        alert("ログインしてください。");
        return;
    }

    const name = document.getElementById("profileName")?.value.trim() || "";
    const gender = document.getElementById("profileGender")?.value || "";
    const bookshelfVisibility = document.getElementById("profileVisibility")?.value || "friends";

    const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        name,
        gender,
        bookshelf_visibility: bookshelfVisibility,
        updated_at: new Date().toISOString(),
    });

    if (error) {
        console.error("プロフィール保存エラー:", error);
        alert("保存に失敗しました：" + error.message);
        return;
    }

    alert("プロフィールを保存しました。");
}

// 💡 固有IDをクリップボードにコピーする（フレンド申請で相手に伝える用）
export async function copyProfileId() {
    const idInput = document.getElementById("profileId");
    if (!idInput?.value) return;
    try {
        await navigator.clipboard.writeText(idInput.value);
        alert("固有IDをコピーしました。フレンドに伝えてください。");
    } catch (e) {
        console.warn("クリップボードへのコピーに失敗しました:", e);
        idInput.select();
    }
<<<<<<< HEAD
}
=======
}
>>>>>>> 9a1debf629ff70390b075800d63679f567226d18
