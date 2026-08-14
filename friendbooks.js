import { supabase, escapeHTML, getCurrentUser } from './supabaseClient.js';

const STATUS_LABEL = {
    unread: "未読",
    reading: "読書中",
    finished: "読了済み",
};


// 💡 URLの?id=固有ID から、フレンドの本棚を読み取り専用で表示する
//    公開設定(bookshelf_visibility)とフレンド関係は、RLS(Supabase側)でも二重にチェックされている
export async function renderFriendBooksPage() {
    const container = document.getElementById("friendBookList");
    const titleEl = document.getElementById("friendBooksTitle");

    // friend-books.html以外では何もしない
    if (!container && !titleEl) return;

    const user = await getCurrentUser();
    if (!user) return;

    const params = new URLSearchParams(location.search);
    const targetId = params.get("id");

    if (!targetId) {
        if (container) container.innerHTML = `<div class="empty-state">🔍 <p>フレンド一覧の「📚 本棚を見る」からアクセスしてください。</p></div>`;
        return;
    }

    if (targetId === user.id) {
        location.href = "list.html";
        return;
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("name, bookshelf_visibility")
        .eq("id", targetId)
        .maybeSingle();

    if (!profile) {
        if (titleEl) titleEl.textContent = "本棚";
        if (container) container.innerHTML = `<div class="empty-state">🔒 <p>このユーザーの本棚は見られません（フレンドでないか、存在しないIDです）。</p></div>`;
        return;
    }

    const displayName = profile.name || "名前未設定のフレンド";
    if (titleEl) titleEl.textContent = `${displayName} さんの本棚`;

    if (profile.bookshelf_visibility === "private") {
        if (container) container.innerHTML = `<div class="empty-state">🔒 <p>${escapeHTML(displayName)} さんは本棚を非公開に設定しています。</p></div>`;
        return;
    }

    const { data: books, error } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", targetId)
        .order("created_at", { ascending: false });

    if (error) {
        console.warn("本棚の読み込みに失敗しました:", error.message);
        if (container) container.innerHTML = `<div class="empty-state">🔒 <p>この本棚を見る権限がありません。</p></div>`;
        return;
    }

    if (!container) return;

    if (!books.length) {
        container.innerHTML = `<div class="empty-state">📚 <p>登録されている本がまだありません。</p></div>`;
        return;
    }

    container.innerHTML = books.map((book) => {
        const status = book.status || "unread";
        const statusLabel = STATUS_LABEL[status] || "未読";
        const stars = [1, 2, 3, 4, 5].map((star) => (star <= (book.rating || 0) ? "★" : "☆")).join("");

        return `
            <div class="book status-${escapeHTML(status)}">
                <img src="${escapeHTML(book.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">
                <div class="book-info">
                    <h3>${escapeHTML(book.title)}</h3>
                    <p>著者：${escapeHTML(book.author || "不明")}</p>
                    <p>出版社：${escapeHTML(book.publisher || "不明")}</p>
                    ${book.price ? `<p>価格：${escapeHTML(book.price)}円</p>` : ""}
                    <p>評価：${book.rating ? stars : "<span class='no-rating'>未評価</span>"}</p>
                    <p>読書状況：${escapeHTML(statusLabel)}</p>
                    <p>購入：${book.purchased ? "購入済み" : "未購入"}</p>
                </div>
            </div>
        `;
    }).join("");
}