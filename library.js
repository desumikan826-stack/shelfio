import { supabase, escapeHTML, getCurrentUser } from './supabaseClient.js';
import {
    books,
    wishlists,
    currentTab,
    detailBookId,
    detailWishlistId,
    currentRating,
    setBooks,
    setWishlists,
    setCurrentTab,
    setDetailBookId,
    setDetailWishlistId,
    setCurrentRating,
} from './state.js';
import { renderSchedulePage } from './schedule.js';
import { renderStatsPage, getMonthlyTsundokuChange } from './stats.js';
import { fetchRakutenBookByIsbn, fetchSeriesVolumes } from './rakutenSearch.js';

// 💡 シリーズ検索結果のキャッシュ（ページ内のみ有効・DBには保存しない）
// シリーズ名(trim済み) → Map<巻数, 楽天APIの本情報>
const seriesSearchCache = new Map();

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

// 💡 シリーズ管理：同じシリーズ名(series)が入力された本を集めて、
// 持っている巻/足りない巻を判定する。
// API検索済み（seriesSearchCacheにある）ならISBN一致で自動判定、
// 未検索ならこれまで通り手動入力(volume/series_total_volumes)で判定する
function getSeriesVolumeStatus(book) {
    const seriesName = (book.series || "").trim();
    if (!seriesName) return null;

    const seriesBooks = books.filter((b) => (b.series || "").trim() === seriesName);
    const ownedIsbns = new Set(
        seriesBooks.map((b) => (b.isbn || "").replace(/-/g, "")).filter(Boolean)
    );
    const ownedVolumesManual = new Set(
        seriesBooks
            .map((b) => Number(b.volume))
            .filter((v) => Number.isInteger(v) && v > 0)
    );

    const apiVolumes = seriesSearchCache.get(seriesName);

    if (apiVolumes && apiVolumes.size) {
        const volumeNumbers = [...apiVolumes.keys()].sort((a, b) => a - b);
        const ownedVolumes = [];
        const missingVolumes = [];

        volumeNumbers.forEach((v) => {
            const item = apiVolumes.get(v);
            const isbn = (item.isbn || "").replace(/-/g, "");
            const isOwned = (isbn && ownedIsbns.has(isbn)) || ownedVolumesManual.has(v);
            (isOwned ? ownedVolumes : missingVolumes).push(v);
        });

        return {
            seriesName,
            ownedVolumes,
            missingVolumes,
            totalVolumes: volumeNumbers.length ? volumeNumbers[volumeNumbers.length - 1] : 0,
            totalKnown: true,
            source: "api",
        };
    }

    const ownedVolumes = [...ownedVolumesManual].sort((a, b) => a - b);

    const totalVolumes = Math.max(
        Number(book.series_total_volumes) || 0,
        ownedVolumes.length ? ownedVolumes[ownedVolumes.length - 1] : 0
    );

    const missingVolumes = [];
    if (totalVolumes > 0) {
        const ownedSet = new Set(ownedVolumes);
        for (let v = 1; v <= totalVolumes; v++) {
            if (!ownedSet.has(v)) missingVolumes.push(v);
        }
    }

    return {
        seriesName,
        ownedVolumes,
        missingVolumes,
        totalVolumes,
        totalKnown: Number(book.series_total_volumes) > 0,
        source: "manual",
    };
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
        rating: 0
    });

    if (error) {
        console.error(error);
        alert("本の登録に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();

    alert("登録しました");
}

export async function addWishlistItem({ title, author, image = "", isbn = "", publisher = "", publish_date = "", pages = 0, price = 0, rating = 0 }) {
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

export function displayBooks() {
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
    }

    list.innerHTML = "";

    // 所有本はソート処理を行う（ほしい本は単純にタイトル順）
    let sortedBooks = [...books];

    if (sortType === "rating") {
        sortedBooks.sort((a, b) => b.rating - a.rating);
    }

    if (sortType === "title") {
        sortedBooks.sort((a, b) => a.title.localeCompare(b.title, "ja"));
    }

    const sortedWishlists = [...wishlists];
    if (sortType === "title") {
        sortedWishlists.sort((a, b) => a.title.localeCompare(b.title, "ja"));
    }

    const htmlParts = [];

    // 「ほしい本」を表示（タブが want のときだけ）
    if (currentTab === "want") {
        sortedWishlists.forEach((w) => {
            const matchesKeyword = (w.title || "").toLowerCase().includes(keyword) || (w.author || "").toLowerCase().includes(keyword);
            if (!matchesKeyword) return;

            htmlParts.push(`
                <div class="book wishlist">
                    <img src="${escapeHTML(w.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">
                    <div class="book-info">
                        <h3>${escapeHTML(w.title)}</h3>
                        <p>著者：${escapeHTML(w.author)}</p>
                        <p>出版社：${escapeHTML(w.publisher || "不明")}</p>
                        <p>ISBN：${escapeHTML(w.isbn || "なし")}</p>
                        ${w.price ? `<p>価格：${escapeHTML(w.price)}円</p>` : ""}

                        <p>
                            <button class="btn btn-success" onclick="purchaseWishlistItem('${w.id}')">購入済みにする</button>
                            <button class="btn btn-danger" onclick="deleteWishlistItem('${w.id}')">削除</button>
                        </p>
                    </div>
                </div>
            `);
        });
    }

    // 次に所有本を表示（タブが all または ステータスタブのとき）
    sortedBooks.forEach((book) => {
        const matchesKeyword =
            (book.title || "").toLowerCase().includes(keyword) ||
            (book.author || "").toLowerCase().includes(keyword);

        const matchesTab =
            currentTab === "all" || book.status === currentTab;

        if (!(matchesKeyword && matchesTab)) return;
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

    list.innerHTML = htmlParts.join("");
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
    const seriesStatus = getSeriesVolumeStatus(book);

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
                        <p class="reading-progress-title">シリーズ管理</p>
                        <p class="reading-progress-inputs">
                            <label>シリーズ名
                                <input type="text" id="seriesNameInput-${book.id}" placeholder="例：薬屋のひとりごと" value="${escapeHTML(book.series || "")}">
                            </label>
                            <button id="seriesSearchBtn-${book.id}" class="btn btn-primary" onclick="searchSeriesVolumes('${book.id}')">🔍 API検索で自動判定</button>
                        </p>
                        <p class="reading-progress-inputs">
                            <label>この本の巻数（手動、任意）
                                <input type="number" id="seriesVolumeInput-${book.id}" min="1" value="${book.volume || ""}">
                            </label>
                            <label>全巻数（手動、わかれば）
                                <input type="number" id="seriesTotalInput-${book.id}" min="1" value="${book.series_total_volumes || ""}">
                            </label>
                            <button class="btn btn-secondary" onclick="updateSeriesInfo('${book.id}')">手動情報を保存</button>
                        </p>
                        ${seriesStatus ? `
                            <p class="no-rating">${seriesStatus.source === "api" ? "🔍 API検索結果をもとに自動判定しています" : "✍️ 手動入力をもとに判定しています（API検索するとISBNで自動判定されます）"}</p>
                            <p>
                                持っている巻：${seriesStatus.ownedVolumes.length
                                    ? seriesStatus.ownedVolumes.map((v) => `<span class="volume-badge owned">${v}巻</span>`).join("")
                                    : "なし"}
                            </p>
                            ${seriesStatus.totalKnown ? `
                                <p>
                                    足りない巻：${seriesStatus.missingVolumes.length
                                        ? seriesStatus.missingVolumes.map((v) => `<span class="volume-badge missing">${v}巻</span>`).join("")
                                        : "ありません（コンプリート！）"}
                                </p>
                            ` : `<p class="no-rating">全巻数を入力すると、足りない巻がわかります。</p>`}
                        ` : `<p class="no-rating">シリーズ名を入力すると、持っている巻・足りない巻が表示されます。</p>`}
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

export async function searchSeriesVolumes(bookId) {
    const book = books.find((b) => String(b.id) === String(bookId));
    if (!book) return;

    const seriesInput = document.getElementById(`seriesNameInput-${bookId}`);
    const seriesName = (seriesInput?.value || book.series || "").trim();

    if (!seriesName) {
        alert("シリーズ名を入力してから検索してください。");
        return;
    }

    const searchBtn = document.getElementById(`seriesSearchBtn-${bookId}`);
    if (searchBtn) searchBtn.disabled = true;

    try {
        const volumeMap = await fetchSeriesVolumes(seriesName);

        if (!volumeMap.size) {
            alert("該当するシリーズが見つかりませんでした。シリーズ名を見直してもう一度お試しください。");
            return;
        }

        seriesSearchCache.set(seriesName, volumeMap);

        // シリーズ名を確定させる（未保存だった場合はここで保存する）
        if (seriesName !== (book.series || "").trim()) {
            await supabase.from("books").update({ series: seriesName }).eq("id", bookId);
            await loadBooks();
        } else {
            displayBooks();
        }
    } catch (e) {
        console.error(e);
        alert("シリーズの検索に失敗しました。もう一度お試しください。");
    } finally {
        if (searchBtn) searchBtn.disabled = false;
    }
}

export async function updateSeriesInfo(bookId) {
    const seriesInput = document.getElementById(`seriesNameInput-${bookId}`);
    const volumeInput = document.getElementById(`seriesVolumeInput-${bookId}`);
    const totalInput = document.getElementById(`seriesTotalInput-${bookId}`);

    const series = seriesInput?.value.trim() || null;
    const volumeRaw = volumeInput?.value;
    const totalRaw = totalInput?.value;

    const volume = volumeRaw ? Math.max(0, Number(volumeRaw) || 0) : null;
    const seriesTotalVolumes = totalRaw ? Math.max(0, Number(totalRaw) || 0) : null;

    const { error } = await supabase
        .from("books")
        .update({ series, volume, series_total_volumes: seriesTotalVolumes })
        .eq("id", bookId);

    if (error) {
        console.error(error);
        alert("シリーズ情報の更新に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();
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
    const { error } = await supabase
        .from("books")
        .update({ status, updated_at: new Date().toISOString() })
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
        list.innerHTML = "<p>ほしい本はまだありません。</p>";
        return;
    }

    const sorted = [...wishlists].sort((a, b) => a.title.localeCompare(b.title, "ja"));

    list.innerHTML = sorted.map((w) => `
        <div class="book wishlist">
            <img src="${escapeHTML(w.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">
            <div class="book-info">
                <h3 class="book-title-link" onclick="showWishlistDetail('${w.id}')">${escapeHTML(w.title)}</h3>
                <p>著者：${escapeHTML(w.author)}</p>
                <p>出版社：${escapeHTML(w.publisher || "不明")}</p>
                <p>ISBN：${escapeHTML(w.isbn || "なし")}</p>
                ${w.price ? `<p>価格：${escapeHTML(w.price)}円</p>` : ""}

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