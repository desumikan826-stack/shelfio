import { supabase, escapeHTML } from './supabaseClient.js';

export let currentUser = null;

export async function signUp(email, password) {

    const { error } = await supabase.auth.signUp({
        email,
        password
    });

    if (error) throw error;
}

export async function signIn(email, password) {

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
}

export async function signOut() {

    const { error } = await supabase.auth.signOut();

    if (error) throw error;
}

// 💡 ログインしたら固有ID(auth.uid())だけを持つ行をprofilesテーブルに自動作成する。
//    既にプロフィールが存在する場合は何もしない（name/genderを上書きしない）
async function ensureProfileRow(user) {
    if (!user) return;
    const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });

    if (error) {
        console.warn("固有IDの自動保存に失敗しました:", error.message);
    }
}

supabase.auth.onAuthStateChange((event, session) => {

    currentUser = session?.user ?? null;
    window.currentUser = currentUser;

    console.log(event, currentUser);

    if (currentUser) ensureProfileRow(currentUser);

    updateUI();

});

export async function updateUI() {

    const {
        data: { session }
    } = await supabase.auth.getSession();

    currentUser = session?.user ?? null;
    window.currentUser = currentUser;

    const nav = document.querySelector("nav");
    const message = document.getElementById("welcome-message");

    if (currentUser) {

        if (nav) nav.style.display = "flex";

        const page = location.pathname.split("/").pop();
        if (message) {
            if (page === "index.html" || page === "") {
                message.innerHTML = "";
            } else {
                message.innerHTML = `
                ようこそ、${escapeHTML(currentUser.email)} さん！<br><br>
                上のメニューから機能を選択してください。
                `;
            }
        }

    } else {

        const page = location.pathname.split("/").pop();
        // 💡 検索ページはログイン不要で使えるので、未ログインでもヘッダーメニューは隠さない
        if (nav) nav.style.display = (page === "search.html") ? "flex" : "none";

        if (message) {
            message.innerHTML = `
            ログインしてください。<br><br>
            <a href="login.html">ログイン / 新規登録</a>
            `;
        }

    }
}

// 💡 login.html のログイン/新規登録ボタンにイベントを紐づける
export function initAuthForm() {
    const signinBtn = document.getElementById("signinBtn");

    if (signinBtn) {

        signinBtn.addEventListener("click", async () => {

            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            try {

                await signIn(email, password);

                location.href = "index.html";

            }
            catch (e) {
                console.error(e);
                alert(e.message);
                document.getElementById("auth-message").textContent = e.message;
            }

        });

    }

    const signupBtn = document.getElementById("signupBtn");

    if (signupBtn) {

        signupBtn.addEventListener("click", async () => {

            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;
            try {

                await signUp(email, password);

                document.getElementById("auth-message").textContent =
                    "確認メールを送信しました。";
            } catch (e) {

                document.getElementById("auth-message").textContent = e.message;

            }

        });

    }
}

// 💡 未ログイン時、保護対象ページからログインページへリダイレクトする
export async function guardProtectedPages(getCurrentUserFn) {
    const user = await getCurrentUserFn();

    const page = location.pathname.split("/").pop();

    if (
        !user &&
        (
            page === "list.html" ||
            page === "wishlist.html" ||
            page === "updates.html" ||
            page === "stats.html" ||
            page === "profile.html" ||
            page === "friends.html" ||
            page === "friend-books.html"
        )
    ) {
        location.href = "login.html";
    }
}

// 💡 ログアウトボタンにイベントを紐づける
export function initLogout() {
    const logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (!confirm("ログアウトしますか？")) return;
            await signOut();
            location.href = "login.html";
        });
    }
}