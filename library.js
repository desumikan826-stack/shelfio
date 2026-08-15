import { supabase, escapeHTML, getCurrentUser, getAmazonSearchUrl } from './supabaseClient.js';
import {
    books,
    wishlists,
    currentTab,
    detailBookId,
    detailWishlistId,
    currentRating,
    currentCollectionFilter,
    setBooks,
    setWishlists,
    setCurrentTab,
    setDetailBookId,
    setDetailWishlistId,
    setCurrentRating,
    setCurrentCollectionFilter,
} from './state.js';
import { renderSchedulePage } from './schedule.js';
import { renderStatsPage, getMonthlyTsundokuChange } from './stats.js';
import { fetchRakutenBookByIsbn } from './rakutenSearch.js';

// 💡 二重登録チェック：ISBNが一致する本があればそれを返す。
// ISBNが無い（比較できない）場合はタイトル＋著者の一致で判定する
// 💡 タイトル比較：全角/半角の表記ゆれを統一し、数字は数値として比較する
// （これが無いと「タイトル 10」が「タイトル 2」より前に来てしまう）
function compareTitles(titleA, titleB) {
    const normalize = (s) => (s || "").normalize("NFKC").trim();
    return normalize(titleA).localeCompare(normalize(titleB), "ja", { numeric: true, sensitivity: "base" });
}

export function findDuplicateBook({ isbn, title, author }) {
    const normalizedIsbn = (isbn || "").replace(/-/g, "").trim();
    const normalizedTitle = (title || "").trim().toLowerCase();
    const normalizedAuthor = (author || "").trim().toLowerCase();

    const all = [...books, ...wishlists];

    return all.find((b) => {
        const bIsbn = (b.isbn || "").replace(/-/g, "").trim();
        if (normalizedIsbn && bIsbn) {
            return normalizedIsbn === bIsbn;
        }

        const bTitle = (b.title || "").trim().toLowerCase();
        if (!normalizedTitle || bTitle !== normalizedTitle) return false;
        if (!normalizedAuthor) return true;

        const bAuthor = (b.author || "").trim().toLowerCase();
        return bAuthor === normalizedAuthor;
    });
}

// 💡 読者レベル：読了済み(finished)の冊数から現在のレベルと次のレベルまでの進捗を計算する
// Lv1〜10：10冊ごとに+1 / Lv10〜20：50冊ごとに+1 / Lv20〜100：100冊ごとに+1（Lv100で打ち止め）
function getReaderLevelInfo(finishedCount) {
    let level = 1;
    let remaining = finishedCount;

    const stages = [
        { perLevel: 10, levelUps: 9 },  // Lv1 → Lv10
        { perLevel: 50, levelUps: 10 }, // Lv10 → Lv20
        { perLevel: 100, levelUps: 80 }, // Lv20 → Lv100
    ];

    for (const stage of stages) {
        for (let i = 0; i < stage.levelUps; i++) {
            if (level >= 100) break;
            if (remaining >= stage.perLevel) {
                remaining -= stage.perLevel;
                level++;
            } else {
                return { level, progress: remaining, needed: stage.perLevel, isMax: false };
            }
        }
    }

    return { level, progress: remaining, needed: null, isMax: true };
}


// 💡 積読危険度：未読ステータスの本について、登録からの経過日数で判定
// 10日以内→緑、10〜30日→黄、30日超→赤
function getTsundokuRisk(book) {
    if (book.status !== "unread" || !book.created_at) return null;

    const created = new Date(book.created_at);
    const days = Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000));

    let color = "green";
    if (days > 30) color = "red";
    else if (days > 10) color = "yellow";

    return { color, days };
}

// 💡 読書進捗：総ページ数(pages)が入力されていれば、現在のページ(current_page)との割合を計算する
function getReadingProgress(book) {
    const total = Number(book.pages) || 0;
    if (total <= 0) return null;

    const current = Number(book.current_page) || 0;
    const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));

    return { current, total, percent };
}

// ---- フォルダ（コレクション） ----
// 💡 本に付いているフォルダ名(collection)に加えて、
// まだどの本にも付いていない「作成だけ済ませたフォルダ」もlocalStorageに保存しておく
function getCollectionStorageKey(userId) {
    return `shelfio-collections-${userId}`;
}

function getDistinctCollections() {
    const set = new Set();
    books.forEach((b) => {
        const c = (b.collection || "").trim();
        if (c) set.add(c);
    });
    return set;
}

async function getKnownCollectionNames() {
    const fromBooks = getDistinctCollections();

    const user = await getCurrentUser();
    if (!user) return [...fromBooks].sort((a, b) => a.localeCompare(b, "ja"));

    let stored = [];
    try {
        const raw = window.localStorage.getItem(getCollectionStorageKey(user.id));
        stored = raw ? JSON.parse(raw) : [];
    } catch {
        stored = [];
    }

    const merged = new Set([...stored, ...fromBooks]);
    return [...merged].sort((a, b) => a.localeCompare(b, "ja"));
}

async function saveKnownCollectionNames(names) {
    const user = await getCurrentUser();
    if (!user) return;
    window.localStorage.setItem(getCollectionStorageKey(user.id), JSON.stringify(names));
}

// 💡 検索バーの右にあるフォルダ絞り込みセレクトを描画する（list.html の #collectionSelect のみで動作）
async function renderCollectionSelect() {
    const select = document.getElementById("collectionSelect");
    if (!select) return;

    const names = await getKnownCollectionNames();
    const hasUncategorized = books.some((b) => !(b.collection || "").trim());

    const options = [{ value: "", label: "📁 すべてのフォルダ" }];
    names.forEach((n) => options.push({ value: n, label: n }));
    if (hasUncategorized) options.push({ value: "__uncategorized__", label: "未分類" });

    select.innerHTML = options
        .map((opt) => `<option value="${escapeHTML(opt.value)}">${escapeHTML(opt.label)}</option>`)
        .join("");

    select.value = currentCollectionFilter || "";
}

// 💡 検索バー右の「＋新規フォルダ」ボタンから呼ばれる。名前を入力するだけでフォルダが作れる
export async function createCollection() {
    const name = window.prompt("新しいフォルダの名前を入力してください（例：ラノベ、漫画、技術書）");
    if (!name || !name.trim()) return;

    const trimmed = name.trim();
    const known = await getKnownCollectionNames();

    if (!known.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
        await saveKnownCollectionNames([...known, trimmed]);
    }

    setCurrentCollectionFilter(trimmed);
    await renderCollectionSelect();
    displayBooks();
}

// 💡 #collectionSelect の変更イベントを一度だけ紐づける（main.js から起動時に1回呼ぶ）
export function initCollectionFilter() {
    const select = document.getElementById("collectionSelect");
    if (!select) return;

    select.addEventListener("change", () => {
        setCurrentCollectionFilter(select.value || null);
        displayBooks();
    });
}

// 💡 本の詳細画面のフォルダ選択セレクトから呼ばれる（選択するだけで自動保存）
export async function updateCollection(bookId, value) {
    const collection = (value || "").trim() || null;

    const { error } = await supabase
        .from("books")
        .update({ collection })
        .eq("id", bookId);

    if (error) {
        console.error(error);
        alert("フォルダの更新に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
}

// ---- Wishlist / migration utilities ----
async function runOneTimeMigration() {
    const user = await getCurrentUser();
    if (!user) return;

    // 簡易チェック: wishlists テーブルに既にデータがあれば移行済みとみなす
    try {
        const { data: existing, error: existsError } = await supabase.from("wishlists").select("id").eq("user_id", user.id).limit(1);
        if (existsError) {
            // テーブルが存在しない等のエラーは無視して終了
            console.warn("wishlists チェックエラー: ", existsError.message || existsError);
            return;
        }
        if (existing && existing.length) return; // すでに何かあれば移行不要
    } catch (e) {
        console.warn("wishlists チェック例外: ", e?.message || e);
        return;
    }

    // 未購入の本を取得して wishlists に移動する
    try {
        const { data: unpurchased, error } = await supabase.from("books").select("*").eq("user_id", user.id).eq("purchased", false);
        if (error) {
            console.warn("未購入取得エラー:", error);
            return;
        }

        if (!unpurchased || !unpurchased.length) return;

        for (const item of unpurchased) {
            const insertObj = {
                user_id: user.id,
                title: item.title,
                author: item.author,
                image: item.image || "",
                isbn: item.isbn || "",
                publisher: item.publisher || "",
                publish_date: item.publish_date || "",
                pages: item.pages || 0,
                price: item.price || 0,
                rating: item.rating || 0,
                created_at: item.created_at || new Date().toISOString()
            };

            const { error: insertErr } = await supabase.from("wishlists").insert(insertObj);
            if (insertErr) {
                console.error("wishlists への挿入に失敗:", insertErr);
                continue;
            }

            const { error: delErr } = await supabase.from("books").delete().eq("id", item.id);
            if (delErr) console.error("books の削除に失敗:", delErr);
        }
    } catch (e) {
        console.error("移行処理で例外が発生しました:", e?.message || e);
    }
}

export async function loadBooks() {

    const user = await getCurrentUser();

    if (!user) return;

    // ワンタイム移行処理（未購入の本を books から wishlists に移動）
    try {
        await runOneTimeMigration();
    } catch (e) {
        // 移行に失敗しても続行する（wishlists テーブルが無い等）
        console.warn("runOneTimeMigration error:", e?.message || e);
    }

    // 所有/購入済みの本を取得
    const { data: booksData, error: booksError } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (booksError) {
        console.error(booksError);
        alert("本の一覧の取得に失敗しました。もう一度お試しください。");
        return;
    }

    setBooks(booksData || []);

    // ほしい本（wishlists）が存在すれば取得（テーブルが無ければ空配列）
    try {
        const { data: wishlistData, error: wishlistError } = await supabase
            .from("wishlists")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true });

        if (wishlistError) {
            console.warn("wishlists 読み込みエラー:", wishlistError);
            setWishlists([]);
        } else {
            setWishlists(wishlistData || []);
        }
    } catch (e) {
        console.warn("wishlists 読み込み例外:", e?.message || e);
        setWishlists([]);
    }

    displayBooks();
    await renderCollectionSelect();
    renderWishlistPage();
    renderSchedulePage();
    renderStatsPage();
}

export function setRating(rating) {
    setCurrentRating(rating);
    const stars = document.querySelectorAll("#rating span");
    stars.forEach((star, index) => {
        star.textContent = index < rating ? "★" : "☆";
    });
}

export async function addBook() {
    const title = document.getElementById("title").value;
    const author = document.getElementById("author").value;
    const purchased = document.getElementById("purchased").checked;
    const status = document.getElementById("status").value;
    const price = Number(document.getElementById("price")?.value) || 0;

    if (title === "") return;

    if (findDuplicateBook({ title, author })) {
        alert("その本は登録済みです。");
        return;
    }

    const user = await getCurrentUser();
    if (!user) return;

    if (purchased) {
        // 購入済みとして books テーブルに登録
        const { error } = await supabase
            .from("books")
            .insert({
                user_id: user.id,
                title: title,
                author: author,
                image: "",
                isbn: "",
                publisher: "publisher",
                publish_date: "",
                pages: 0,
                price: price,
                rating: currentRating,
                purchased: true,
                status: status
            });

        if (error) {
            console.error(error);
            alert("本の登録に失敗しました。もう一度お試しください。");
            return;
        }
    } else {
        // 未購入（ほしい本）は wishlists テーブルに登録
        const { error } = await supabase
            .from("wishlists")
            .insert({
                user_id: user.id,
                title: title,
                author: author,
                image: "",
                isbn: "",
                publisher: "publisher",
                publish_date: "",
                pages: 0,
                price: price,
                rating: currentRating
            });

        if (error) {
            console.error(error);
            alert("ほしい本の登録に失敗しました。もう一度お試しください。");
            return;
        }
    }

    await loadBooks();

    alert("登録しました");

    document.getElementById("title").value = "";
    document.getElementById("author").value = "";
    if (document.getElementById("price")) document.getElementById("price").value = "";
    document.getElementById("purchased").checked = false;
    document.getElementById("status").value = "unread";

    setRating(0);
}

export async function addRakutenBook(info) {

    if (findDuplicateBook({ isbn: info.isbn, title: info.title, author: info.author })) {
        alert("その本は登録済みです。");
        return;
    }

    const user = await getCurrentUser();

    const { data, error } = await supabase
        .from("wishlists")
        .insert({
        user_id: user.id,
        title: info.title,
        author: info.author,
        image: info.largeImageUrl || "",
        isbn: info.isbn || "",
        publisher: info.publisherName || "",
        publish_date: info.salesDate || "",
        pages: 0,
        price: Number(info.itemPrice) || 0,
        rating: 0,
        item_url: info.itemUrl || ""
    });

    if (error) {
        console.error(error);
        alert("本の登録に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();

    alert("ほしい本として登録しました");
    return true;
}

// 💡 検索結果を「購入済みの本」として本棚（books）に直接登録する
export async function addRakutenBookAsPurchased(info) {

    if (findDuplicateBook({ isbn: info.isbn, title: info.title, author: info.author })) {
        alert("その本は登録済みです。");
        return;
    }

    const user = await getCurrentUser();

    const { error } = await supabase
        .from("books")
        .insert({
        user_id: user.id,
        title: info.title,
        author: info.author,
        image: info.largeImageUrl || "",
        isbn: info.isbn || "",
        publisher: info.publisherName || "",
        publish_date: info.salesDate || "",
        pages: 0,
        price: Number(info.itemPrice) || 0,
        rating: 0,
        purchased: true,
        status: "unread"
    });

    if (error) {
        console.error(error);
        alert("本の登録に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();

    alert("購入済みの本として登録しました");
    return true;
}

export async function addWishlistItem({ title, author, image = "", isbn = "", publisher = "", publish_date = "", pages = 0, price = 0, rating = 0 }) {
    if (findDuplicateBook({ isbn, title, author })) {
        alert("その本は登録済みです。");
        return;
    }

    const user = await getCurrentUser();
    if (!user) return;

    const { error } = await supabase.from("wishlists").insert({
        user_id: user.id,
        title,
        author,
        image,
        isbn,
        publisher,
        publish_date,
        pages,
        price,
        rating
    });

    if (error) {
        console.error(error);
        alert("ほしい本の登録に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
    alert("ほしい本として登録しました");
}

// 💡 wishlist.html の手動追加フォームから呼ばれる
export async function addWishlistFromForm() {
    const titleInput = document.getElementById("w-title");
    const title = titleInput?.value.trim();

    if (!title) {
        alert("タイトルを入力してください");
        return;
    }

    const author = document.getElementById("w-author")?.value.trim() || "";
    const isbn = document.getElementById("w-isbn")?.value.trim() || "";
    const image = document.getElementById("w-image")?.value.trim() || "";
    const price = Number(document.getElementById("w-price")?.value) || 0;

    await addWishlistItem({ title, author, isbn, image, price });

    document.getElementById("wishlistForm")?.reset();
}

export async function deleteWishlistItem(wishId) {
    const { error } = await supabase.from("wishlists").delete().eq("id", wishId);
    if (error) {
        console.error(error);
        alert("ほしい本の削除に失敗しました。もう一度お試しください。");
        return;
    }
    await loadBooks();
}

export async function purchaseWishlistItem(wishId) {
    const item = wishlists.find(w => String(w.id) === String(wishId));
    if (!item) return;

    const user = await getCurrentUser();
    if (!user) return;

    const insertObj = {
        user_id: user.id,
        title: item.title,
        author: item.author,
        image: item.image || "",
        isbn: item.isbn || "",
        publisher: item.publisher || "",
        publish_date: item.publish_date || "",
        pages: item.pages || 0,
        price: item.price || 0,
        rating: item.rating || 0,
        purchased: true,
        status: "unread"
    };

    const { error: insertErr } = await supabase.from("books").insert(insertObj);
    if (insertErr) {
        console.error(insertErr);
        alert("購入済みにする操作に失敗しました。もう一度お試しください。");
        return;
    }

    const { error: delErr } = await supabase.from("wishlists").delete().eq("id", wishId);
    if (delErr) console.error("wishlists 削除エラー:", delErr);

    await loadBooks();
}

export async function displayBooks() {
    const list = document.getElementById("bookList");
    const search = document.getElementById("search");
    const stats = document.getElementById("bookStats");

    if (!list) return;

    if (detailBookId) {
        renderBookDetailView();
        return;
    }

    if (!search) return;

    const keyword = search.value.toLowerCase();
    const sortType = document.getElementById("sortType")?.value || "none";
    const knownCollections = await getKnownCollectionNames();

    // 本の統計を表示（所有本のみ）
    if (stats) {
        const unread = books.filter(book => book.status === "unread").length;
        const reading = books.filter(book => book.status === "reading").length;
        const finished = books.filter(book => book.status === "finished").length;

        const rate = books.length === 0 ? 0 : Math.round(finished / books.length * 100);
        const monthlyChange = getMonthlyTsundokuChange(books);
        const monthlyChangeLabel = monthlyChange > 0 ? `+${monthlyChange}` : `${monthlyChange}`;

        stats.innerHTML = `
        📖 未読（所有）：${unread}冊　
        📘 読書中（所有）：${reading}冊　
        ✅ 読了（所有）：${finished}冊　
        📊 読了率（所有）：${rate}%　
        📦 積読増減(今月)：${monthlyChangeLabel}冊
        `;

        const levelContainer = document.getElementById("readerLevel");
        if (levelContainer) {
            const levelInfo = getReaderLevelInfo(finished);
            const percent = levelInfo.isMax
                ? 100
                : Math.round((levelInfo.progress / levelInfo.needed) * 100);

            levelContainer.innerHTML = `
                <div class="reader-level-card">
                    <div class="reader-level-badge">🏅 Lv.${levelInfo.level}</div>
                    <div class="reader-level-detail">
                        ${levelInfo.isMax
                            ? `<p>最高レベルに到達しています！（読了 ${finished}冊）</p>`
                            : `
                                <div class="progress-bar-wrap">
                                    <div class="progress-bar-fill" style="width:${percent}%;"></div>
                                </div>
                                <p>次のレベルまであと ${levelInfo.needed - levelInfo.progress}冊（${levelInfo.progress}/${levelInfo.needed}）</p>
                            `}
                    </div>
                </div>
            `;
        }
    }

    list.innerHTML = "";

    // 所有本はソート処理を行う（ほしい本は単純にタイトル順）
    let sortedBooks = [...books];

    if (sortType === "rating") {
        sortedBooks.sort((a, b) => b.rating - a.rating);
    }

    if (sortType === "title") {
        sortedBooks.sort((a, b) => compareTitles(a.title, b.title));
    }

    const htmlParts = [];

    // 次に所有本を表示（タブが all または ステータスタブのとき）
    sortedBooks.forEach((book) => {
        const matchesKeyword =
            (book.title || "").toLowerCase().includes(keyword) ||
            (book.author || "").toLowerCase().includes(keyword);

        const matchesTab =
            currentTab === "all" || book.status === currentTab;

        const matchesCollection =
            !currentCollectionFilter ||
            (currentCollectionFilter === "__uncategorized__"
                ? !(book.collection || "").trim()
                : (book.collection || "").trim() === currentCollectionFilter);

        if (!(matchesKeyword && matchesTab && matchesCollection)) return;
        const risk = getTsundokuRisk(book);
        const progress = getReadingProgress(book);

        htmlParts.push(`
            <div class="book status-${book.status}">
                <img src="${escapeHTML(book.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">

                <div class="book-info">
                    <h3 class="book-title-link" onclick="showBookDetail('${book.id}')">${escapeHTML(book.title)}</h3>
                    <p>著者：${escapeHTML(book.author)}</p>
                    <p>出版社：${escapeHTML(book.publisher || "不明")}</p>
                    <p>ISBN：${escapeHTML(book.isbn || "なし")}</p>
                    ${book.price ? `<p>価格：${escapeHTML(book.price)}円</p>` : ""}
                    ${risk ? `<p><span class="risk-dot ${risk.color}" title="登録から${risk.days}日"></span>積読${risk.days}日目</p>` : ""}
                    ${book.status !== "finished" ? `
                        <div class="reading-progress reading-progress-compact">
                            <p class="reading-progress-inputs">
                                <label>総ページ数
                                    <input type="number" id="totalPagesInput-${book.id}" min="0" value="${book.pages || ""}">
                                </label>
                                <label>今読んだページ
                                    <input type="number" id="currentPageInput-${book.id}" min="0" value="${book.current_page || ""}">
                                </label>
                                <button class="btn btn-secondary" onclick="updateReadingProgress('${book.id}')">更新</button>
                            </p>
                            ${progress ? `
                                <div class="progress-bar-wrap">
                                    <div class="progress-bar-fill" style="width:${progress.percent}%;"></div>
                                </div>
                                <p>📖 ${progress.current} / ${progress.total} ページ（${progress.percent}%）</p>
                            ` : ""}
                        </div>
                    ` : ""}

                    <p class="meta-display">
                        <label class="folder-select-inline">📁
                            <select onchange="updateCollection('${book.id}', this.value)">
                                <option value="">未分類</option>
                                ${knownCollections.map((name) =>
                                    `<option value="${escapeHTML(name)}" ${name === (book.collection || "").trim() ? "selected" : ""}>${escapeHTML(name)}</option>`
                                ).join("")}
                            </select>
                        </label>
                    </p>

                    <p>
                        評価：
                        ${book.rating === 0 ? "<span class='no-rating'>未評価</span>" : ""}
                        ${[1,2,3,4,5].map(star => `
                            <span onclick="changeRating('${book.id}', ${star})" class="star">
                                ${star <= book.rating ? "★" : "☆"}
                            </span>
                        `).join("")}
                    </p>

                    <p>
                        購入：${book.purchased ? "購入済み" : "未購入"}
                        <button class="btn ${book.purchased ? "btn-secondary" : "btn-success"}" onclick="togglePurchased('${book.id}')">
                            ${book.purchased ? "未購入に戻す" : "購入済みにする"}
                        </button>
                    </p>

                    <p class="status-wrap">
                        読書状況：
                        <button class="status-current" onclick="toggleStatusMenu('${book.id}')">
                            ${book.status === "unread" ? "未読" : book.status === "reading" ? "読書中" : "読了済み"} ▾
                        </button>

                        <span id="statusMenu-${book.id}" class="status-menu" style="display:none;">
                            <button onclick="changeStatus('${book.id}', 'unread')">未読</button>
                            <button onclick="changeStatus('${book.id}', 'reading')">読書中</button>
                            <button onclick="changeStatus('${book.id}', 'finished')">読了済み</button>
                        </span>
                    </p>

                    <button class="btn btn-danger" onclick="deleteBook('${book.id}')">削除</button>
                </div>
            </div>
        `);
    });

    list.innerHTML = htmlParts.length
        ? htmlParts.join("")
        : `<div class="empty-state">📚 <p>該当する本が見つかりませんでした。</p></div>`;
}

export function showBookDetail(bookId) {
    setDetailBookId(bookId);
    displayBooks();
}

export function backToList() {
    setDetailBookId(null);
    displayBooks();
}

async function renderBookDetailView() {
    const list = document.getElementById("bookList");
    const book = books.find((b) => String(b.id) === String(detailBookId));

    if (!list) return;

    if (!book) {
        setDetailBookId(null);
        displayBooks();
        return;
    }

    const risk = getTsundokuRisk(book);
    const progress = getReadingProgress(book);

    const currentCollection = (book.collection || "").trim();
    const knownCollections = await getKnownCollectionNames();
    const collectionOptionsHtml = [
        `<option value="">未分類</option>`,
        ...knownCollections.map((name) =>
            `<option value="${escapeHTML(name)}" ${name === currentCollection ? "selected" : ""}>${escapeHTML(name)}</option>`
        ),
    ].join("");

    list.innerHTML = `
        <div class="book-detail">
            <button class="btn btn-secondary" onclick="backToList()">← 一覧に戻る</button>
            <div class="book status-${book.status}">
                <img src="${escapeHTML(book.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">
                <div class="book-info">
                    <h3>${escapeHTML(book.title)}</h3>
                    <p>著者：${escapeHTML(book.author)}</p>
                    <p>出版社：${escapeHTML(book.publisher || "不明")}</p>
                    <p>ISBN：${escapeHTML(book.isbn || "なし")}</p>
                    ${book.price ? `<p>価格：${escapeHTML(book.price)}円</p>` : ""}
                    ${risk ? `<p><span class="risk-dot ${risk.color}" title="登録から${risk.days}日"></span>積読${risk.days}日目</p>` : ""}

                    ${book.status !== "finished" ? `
                        <div class="reading-progress">
                            <p class="reading-progress-title">読書進捗</p>
                            <p class="reading-progress-inputs">
                                <label>総ページ数
                                    <input type="number" id="totalPagesInput-${book.id}" min="0" value="${book.pages || ""}">
                                </label>
                                <label>今読んだページ
                                    <input type="number" id="currentPageInput-${book.id}" min="0" value="${book.current_page || ""}">
                                </label>
                                <button class="btn btn-primary" onclick="updateReadingProgress('${book.id}')">更新</button>
                            </p>
                            ${progress ? `
                                <div class="progress-bar-wrap">
                                    <div class="progress-bar-fill" style="width:${progress.percent}%;"></div>
                                </div>
                                <p>${progress.current} / ${progress.total} ページ（${progress.percent}%）</p>
                            ` : `<p class="no-rating">総ページ数を入力すると進捗が表示されます。</p>`}
                        </div>
                    ` : ""}

                    <div class="reading-progress">
                        <p class="reading-progress-title">感想</p>
                        <textarea id="reviewInput-${book.id}" class="review-textarea" placeholder="読んだ感想を自由に書いてください">${escapeHTML(book.review || "")}</textarea>
                        <p class="reading-progress-inputs">
                            <button class="btn btn-primary" onclick="updateReview('${book.id}')">感想を保存</button>
                        </p>
                    </div>

                    <div class="reading-progress">
                        <p class="reading-progress-title">フォルダ</p>
                        <p class="reading-progress-inputs">
                            <label>📁 フォルダ
                                <select id="collectionSelect-${book.id}" onchange="updateCollection('${book.id}', this.value)">
                                    ${collectionOptionsHtml}
                                </select>
                            </label>
                        </p>
                    </div>

                    <div id="bookDetailDescription" class="book-detail-description">あらすじを読み込み中...</div>
                </div>
            </div>
        </div>
    `;

    const descriptionEl = document.getElementById("bookDetailDescription");

    if (!book.isbn) {
        descriptionEl.textContent = "ISBNが登録されていないため、あらすじを取得できませんでした。";
        return;
    }

    try {
        const detail = await fetchRakutenBookByIsbn(book.isbn);
        descriptionEl.textContent = detail?.itemCaption || "あらすじは見つかりませんでした。";
    } catch (e) {
        console.error(e);
        descriptionEl.textContent = "あらすじの取得に失敗しました。";
    }
}

export async function changeRating(bookId, rating) {
    const book = books.find(b => String(b.id) === String(bookId));
    if (!book) return;

    const newRating = (book.rating === rating) ? 0 : rating;

    const { error } = await supabase
        .from("books")
        .update({ rating: newRating })
        .eq("id", book.id);

    if (error) {
        console.error(error);
        alert("評価の更新に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
}

export async function deleteBook(bookId) {
    const book = books.find(b => String(b.id) === String(bookId));
    if (!book) return;

    const { error } = await supabase
        .from("books")
        .delete()
        .eq("id", book.id);

    if (error) {
        console.error(error);
        alert("本の削除に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
}

export async function updateReadingProgress(bookId) {
    const totalInput = document.getElementById(`totalPagesInput-${bookId}`);
    const currentInput = document.getElementById(`currentPageInput-${bookId}`);

    const totalPages = Math.max(0, Number(totalInput?.value) || 0);
    const currentPage = Math.max(0, Number(currentInput?.value) || 0);

    const { error } = await supabase
        .from("books")
        .update({ pages: totalPages, current_page: currentPage })
        .eq("id", bookId);

    if (error) {
        console.error(error);
        alert("読書進捗の更新に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
}

// 💡 本の詳細画面の「感想」欄から呼ばれる
export async function updateReview(bookId) {
    const textarea = document.getElementById(`reviewInput-${bookId}`);
    const review = (textarea?.value || "").trim() || null;

    const { error } = await supabase
        .from("books")
        .update({ review })
        .eq("id", bookId);

    if (error) {
        console.error(error);
        alert("感想の保存に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
    alert("感想を保存しました");
}

export async function togglePurchased(bookId) {
    const book = books.find(b => String(b.id) === String(bookId));
    if (!book) return;

    const { error } = await supabase
        .from("books")
        .update({
            purchased: !book.purchased
        })
        .eq("id", book.id);

    if (error) {
        console.error(error);
        alert("購入状態の更新に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
}

export async function changeStatus(bookId, status) {
    const updates = { status, updated_at: new Date().toISOString() };

    if (status === "reading") {
        updates.started_at = new Date().toISOString();
    }
    if (status === "finished") {
        updates.finished_at = new Date().toISOString();
    }

    const { error } = await supabase
        .from("books")
        .update(updates)
        .eq("id", bookId);

    if (error) {
        console.error(error);
        alert("読書状態の更新に失敗しました");
        return;
    }

    await loadBooks();
    document.getElementById(`statusMenu-${bookId}`)?.style.setProperty("display", "none");
}

export function toggleStatusMenu(bookId) {
    const menu = document.getElementById(`statusMenu-${bookId}`);
    if (!menu) return;
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
}

export function switchTab(tabName) {
    setCurrentTab(tabName); // タブの状態を更新
    setDetailBookId(null); // タブを切り替えたら詳細表示は解除する

    // すべてのタブボタンから active クラスを一度消す
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    // クリックされたボタンだけに active クラスをつける
    document.getElementById(`tab-${tabName}`)?.classList.add("active");

    // 画面を再表示してフィルターをかける
    displayBooks();
}

// ---- ほしい本ページ（wishlist.html）専用の一覧・詳細表示 ----
export function renderWishlistPage() {
    const list = document.getElementById("wishlistList");
    if (!list) return; // wishlist.html以外のページでは何もしない

    if (detailWishlistId) {
        renderWishlistDetailView();
        return;
    }

    if (!wishlists.length) {
        list.innerHTML = `<div class="empty-state">💖 <p>ほしい本はまだありません。</p></div>`;
        return;
    }

    const sorted = [...wishlists].sort((a, b) => compareTitles(a.title, b.title));

    list.innerHTML = sorted.map((w) => `
        <div class="book wishlist">
            <img src="${escapeHTML(w.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">
            <div class="book-info">
                <h3 class="book-title-link" onclick="showWishlistDetail('${w.id}')">${escapeHTML(w.title)}</h3>
                <p>著者：${escapeHTML(w.author)}</p>
                <p>出版社：${escapeHTML(w.publisher || "不明")}</p>
                <p>ISBN：${escapeHTML(w.isbn || "なし")}</p>
                ${w.price ? `<p>価格：${escapeHTML(w.price)}円</p>` : ""}
                ${w.item_url ? `<p><a class="btn btn-secondary rakuten-link" href="${escapeHTML(w.item_url)}" target="_blank" rel="noopener noreferrer">🛒 楽天ブックスで購入</a></p>` : ""}
                <p><a class="btn btn-secondary rakuten-link" href="${escapeHTML(getAmazonSearchUrl(w))}" target="_blank" rel="noopener noreferrer">🛒 Amazonで買う</a></p>

                <p>
                    <button class="btn btn-success" onclick="purchaseWishlistItem('${w.id}')">購入済みにする</button>
                    <button class="btn btn-danger" onclick="deleteWishlistItem('${w.id}')">削除</button>
                </p>
            </div>
        </div>
    `).join("");
}

export function showWishlistDetail(wishId) {
    setDetailWishlistId(wishId);
    renderWishlistPage();
}

export function backToWishlist() {
    setDetailWishlistId(null);
    renderWishlistPage();
}

async function renderWishlistDetailView() {
    const list = document.getElementById("wishlistList");
    const item = wishlists.find((w) => String(w.id) === String(detailWishlistId));

    if (!list) return;

    if (!item) {
        setDetailWishlistId(null);
        renderWishlistPage();
        return;
    }

    list.innerHTML = `
        <div class="book-detail">
            <button class="btn btn-secondary" onclick="backToWishlist()">← 一覧に戻る</button>
            <div class="book wishlist">
                <img src="${escapeHTML(item.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">
                <div class="book-info">
                    <h3>${escapeHTML(item.title)}</h3>
                    <p>著者：${escapeHTML(item.author)}</p>
                    <p>出版社：${escapeHTML(item.publisher || "不明")}</p>
                    <p>ISBN：${escapeHTML(item.isbn || "なし")}</p>
                    ${item.price ? `<p>価格：${escapeHTML(item.price)}円</p>` : ""}
                    ${item.item_url ? `<p><a class="btn btn-secondary rakuten-link" href="${escapeHTML(item.item_url)}" target="_blank" rel="noopener noreferrer">🛒 楽天ブックスで購入</a></p>` : ""}
                    <p><a class="btn btn-secondary rakuten-link" href="${escapeHTML(getAmazonSearchUrl(item))}" target="_blank" rel="noopener noreferrer">🛒 Amazonで買う</a></p>
                    <p>
                        <button class="btn btn-success" onclick="purchaseWishlistItem('${item.id}')">購入済みにする</button>
                        <button class="btn btn-danger" onclick="deleteWishlistItem('${item.id}')">削除</button>
                    </p>
                    <div id="wishlistDetailDescription" class="book-detail-description">あらすじを読み込み中...</div>
                </div>
            </div>
        </div>
    `;

    const descriptionEl = document.getElementById("wishlistDetailDescription");

    if (!item.isbn) {
        descriptionEl.textContent = "ISBNが登録されていないため、あらすじを取得できませんでした。";
        return;
    }

    try {
        const detail = await fetchRakutenBookByIsbn(item.isbn);
        descriptionEl.textContent = detail?.itemCaption || "あらすじは見つかりませんでした。";
    } catch (e) {
        console.error(e);
        descriptionEl.textContent = "あらすじの取得に失敗しました。";
    }
}