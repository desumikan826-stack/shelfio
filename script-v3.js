// 💡 一番安全な初期化方法（これなら絶対に二重宣言エラーになりません）
if (!window.globalSupabase) {
    const supabaseUrl = "https://eqgyfkxiecozflnbypkl.supabase.co";
    const supabaseKey = "sb_publishable_3MQXaPuO9U3O_zub0LPoGg_N2pIYkIJ";
    window.globalSupabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}

const supabase = window.globalSupabase;
let currentUser = null;


// 💡 XSS対策：ユーザー入力や外部APIの値をinnerHTMLに入れる前に必ず通す
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));
}

async function signUp(email,password){

    const {error} = await supabase.auth.signUp({
        email,
        password
    });

    if(error) throw error;
}

async function signIn(email,password){

    const {error} = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if(error) throw error;
}

async function signOut(){

    const {error} = await supabase.auth.signOut();

    if(error) throw error;
}

supabase.auth.onAuthStateChange((event, session) => {

    currentUser = session?.user ?? null;

    console.log(event, currentUser);

    updateUI();

});

async function updateUI() {

    const {
        data: { session }
    } = await supabase.auth.getSession();

    currentUser = session?.user ?? null;

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

        if (nav) nav.style.display = "none";

        if (message) {
            message.innerHTML = `
            ログインしてください。<br><br>
            <a href="login.html">ログイン / 新規登録</a>
            `;
        }

    }
}

updateUI();

let books = []; // 所有/購入済みの本（books テーブル）
let wishlists = []; // ほしい本（wishlists テーブル）
// 検索結果のページング用
let allSearchResults = [];
let currentSearchPage = 1;
const RESULTS_PER_PAGE = 10;
let currentTab = 'all'; // 💡 今どのタブが選ばれているかを保存（all, want, read）
let detailBookId = null; // 💡 タップして詳細表示している本のID（nullなら一覧表示）

console.log("最新版script.js 読み込み成功");


// 💡 各所で繰り返されるユーザー取得処理をまとめたヘルパー
async function getCurrentUser() {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user;
}

async function loadBooks() {

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

    books = booksData || [];

    // ほしい本（wishlists）が存在すれば取得（テーブルが無ければ空配列）
    try {
        const { data: wishlistData, error: wishlistError } = await supabase
            .from("wishlists")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true });

        if (wishlistError) {
            console.warn("wishlists 読み込みエラー:", wishlistError);
            wishlists = [];
        } else {
            wishlists = wishlistData || [];
        }
    } catch (e) {
        console.warn("wishlists 読み込み例外:", e?.message || e);
        wishlists = [];
    }

    displayBooks();
    renderSchedulePage();
}

loadBooks();

const WEEKDAYS = [
    { value: "0", label: "日曜日" },
    { value: "1", label: "月曜日" },
    { value: "2", label: "火曜日" },
    { value: "3", label: "水曜日" },
    { value: "4", label: "木曜日" },
    { value: "5", label: "金曜日" },
    { value: "6", label: "土曜日" },
];

function getScheduleStorageKey(userId) {
    return `shelfio-schedule-${userId}`;
}

async function getScheduleItems() {
    const user = await getCurrentUser();
    if (!user) return [];
    const raw = window.localStorage.getItem(getScheduleStorageKey(user.id));
    try {
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveScheduleItems(items) {
    const user = await getCurrentUser();
    if (!user) return;
    window.localStorage.setItem(getScheduleStorageKey(user.id), JSON.stringify(items));
}

function getWeekdayLabel(weekday) {
    return WEEKDAYS.find((item) => item.value === String(weekday))?.label || "未設定";
}

function getDateOfWeekday(reference, weekday) {
    const date = new Date(reference);
    const diff = Number(weekday) - date.getDay();
    date.setDate(date.getDate() + diff);
    return date;
}

function getBiweeklyStartDate(item) {
    if (item.startDate) {
        const parsed = new Date(item.startDate);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const today = new Date();
    const target = getDateOfWeekday(today, item.weekday);
    if (target > today) {
        target.setDate(target.getDate() - 7);
    }
    return target;
}

function isItemUpdatingToday(item) {
    const today = new Date();
    if (String(item.weekday) !== String(today.getDay())) return false;
    if (item.frequency === "weekly") return true;

    const startDate = getBiweeklyStartDate(item);
    const diffDays = Math.floor((today.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
    const weekDelta = Math.floor(diffDays / 7);
    return weekDelta % 2 === 0;
}

function getWeekStartDate(reference) {
    const date = new Date(reference);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay());
    return date;
}

function getBiweeklyStartDateForDate(item, referenceDate) {
    if (item.startDate) {
        const parsed = new Date(item.startDate);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const date = new Date(referenceDate);
    const target = getDateOfWeekday(date, item.weekday);
    if (target > date) {
        target.setDate(target.getDate() - 7);
    }
    return target;
}

function isItemUpdatingOnDate(item, date) {
    if (String(item.weekday) !== String(date.getDay())) return false;
    if (item.frequency === "weekly") return true;

    const startDate = getBiweeklyStartDateForDate(item, date);
    const diffDays = Math.floor((date.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
    const weekDelta = Math.floor(diffDays / 7);
    return weekDelta % 2 === 0;
}

function renderReadingCalendar(items) {
    const calendarContainer = document.getElementById("readingCalendar");
    if (!calendarContainer) return;

    const weekStart = getWeekStartDate(new Date());
    const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + index);
        const dayItems = items.filter((item) => isItemUpdatingOnDate(item, new Date(date)));
        return {
            date,
            items: dayItems,
        };
    });

    calendarContainer.innerHTML = `
        <div class="calendar-grid">
            ${days
                .map((day) => {
                    const todayClass = day.date.toDateString() === new Date().toDateString() ? " today" : "";
                    return `
                        <div class="calendar-day${todayClass}">
                            <div class="calendar-day-label">
                                ${escapeHTML(getWeekdayLabel(day.date.getDay()))} ${escapeHTML(
                        `${day.date.getMonth() + 1}/${day.date.getDate()}`
                    )}
                            </div>
                            ${day.items.length
                                ? day.items
                                      .map(
                                          (item) => `
                                    <div class="calendar-item">
                                        <strong>${escapeHTML(item.title)}</strong>
                                        <div>${escapeHTML(item.frequency === "weekly" ? "週刊" : "隔週")}</div>
                                    </div>`
                                      )
                                      .join("")
                                : `<div class="calendar-item empty">更新なし</div>`}
                        </div>`;
                })
                .join("")}
        </div>`;
}

function formatDateToJp(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "未設定";
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function getNextUpdateLabel(item) {
    const today = new Date();
    if (isItemUpdatingToday(item)) {
        return "今日更新です";
    }

    let nextDate = getDateOfWeekday(today, item.weekday);
    if (nextDate < today) {
        nextDate.setDate(nextDate.getDate() + 7);
    }

    if (item.frequency === "biweekly") {
        const startDate = getBiweeklyStartDate(item);
        const diffDays = Math.floor((nextDate.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
        const weekDelta = Math.floor(diffDays / 7);
        if (weekDelta % 2 !== 0) {
            nextDate.setDate(nextDate.getDate() + 7);
        }
    }

    return formatDateToJp(nextDate);
}

async function renderSchedulePage() {
    const scheduleList = document.getElementById("scheduleList");
    const todayUpdates = document.getElementById("todayUpdates");
    const existingBookSelect = document.getElementById("existingBook");
    const startDateInput = document.getElementById("scheduleStartDate");
    const frequencySelect = document.getElementById("scheduleFrequency");

    if (!scheduleList && !todayUpdates && !existingBookSelect) return;

    if (existingBookSelect) {
        existingBookSelect.innerHTML = "<option value=''>手動で入力</option>";
        books.forEach((book) => {
            const option = document.createElement("option");
            option.value = book.id;
            option.textContent = `${book.title} / ${book.author}`;
            existingBookSelect.appendChild(option);
        });
    }

    if (frequencySelect && startDateInput) {
        startDateInput.closest("label").style.display = frequencySelect.value === "biweekly" ? "block" : "none";
    }

    const items = await getScheduleItems();
    const todayItems = items.filter(isItemUpdatingToday);

    renderReadingCalendar(items);

    if (todayUpdates) {
        todayUpdates.innerHTML = todayItems.length
            ? todayItems.map((item) => `
                <div class="schedule-card">
                    <strong>${escapeHTML(item.title)}</strong>
                    <p>${escapeHTML(item.author)}</p>
                    <p>${getWeekdayLabel(item.weekday)}・${item.frequency === "weekly" ? "週刊" : "隔週"}</p>
                    ${item.link ? `<p><a href="${escapeHTML(item.link)}" target="_blank" rel="noopener">作品ページに移動</a></p>` : ""}
                </div>
            `).join("")
            : "<p>今日更新の作品はまだありません。</p>";
    }

    if (scheduleList) {
        if (!items.length) {
            scheduleList.innerHTML = "<p>まだ更新スケジュールが登録されていません。</p>";
            return;
        }

        scheduleList.innerHTML = items.map((item) => `
            <div class="schedule-card">
                <div class="schedule-card-header">
                    <strong>${escapeHTML(item.title)}</strong>
                    <button class="small-button" onclick="deleteScheduleItem('${item.id}')">削除</button>
                </div>
                <p>${escapeHTML(item.author)}</p>
                <p>更新頻度：${item.frequency === "weekly" ? "週刊" : "隔週"}</p>
                <p>更新曜日：${getWeekdayLabel(item.weekday)}</p>
                ${item.frequency === "biweekly" ? `<p>隔週スタート：${formatDateToJp(item.startDate)}</p>` : ""}
                <p>次回更新：${getNextUpdateLabel(item)}</p>
                ${item.link ? `<p><a href="${escapeHTML(item.link)}" target="_blank" rel="noopener">作品ページへ</a></p>` : ""}
            </div>
        `).join("");
    }
}

async function addScheduleItem() {
    const title = document.getElementById("scheduleTitle")?.value.trim();
    const author = document.getElementById("scheduleAuthor")?.value.trim();
    const link = document.getElementById("scheduleLink")?.value.trim();
    const frequency = document.getElementById("scheduleFrequency")?.value;
    const weekday = document.getElementById("scheduleWeekday")?.value;
    const startDate = document.getElementById("scheduleStartDate")?.value;
    const existingBook = document.getElementById("existingBook")?.value;

    if (!title || !weekday) {
        alert("タイトルと更新曜日を設定してください。");
        return;
    }

    const item = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        author,
        link,
        frequency,
        weekday,
        startDate: frequency === "biweekly" ? (startDate || getDateOfWeekday(new Date(), weekday).toISOString().slice(0, 10)) : "",
        bookId: existingBook || null,
    };

    const items = await getScheduleItems();
    items.push(item);
    await saveScheduleItems(items);
    renderSchedulePage();
    alert("更新スケジュールを登録しました。");
}

async function deleteScheduleItem(itemId) {
    const items = await getScheduleItems();
    const updated = items.filter((item) => item.id !== itemId);
    await saveScheduleItems(updated);
    renderSchedulePage();
}

function handleExistingBookChange() {
    const bookId = document.getElementById("existingBook")?.value;
    const titleInput = document.getElementById("scheduleTitle");
    const authorInput = document.getElementById("scheduleAuthor");
    if (!titleInput || !authorInput) return;
    if (!bookId) {
        titleInput.value = "";
        authorInput.value = "";
        return;
    }
    const book = [...books, ...wishlists].find((item) => String(item.id) === String(bookId));
    if (book) {
        titleInput.value = book.title;
        authorInput.value = book.author;
    }
}

function handleFrequencyChange() {
    const frequencySelect = document.getElementById("scheduleFrequency");
    const startDateLabel = document.getElementById("scheduleStartDate")?.closest("label");
    if (frequencySelect && startDateLabel) {
        startDateLabel.style.display = frequencySelect.value === "biweekly" ? "block" : "none";
    }
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

// 💡 今月の積読増減：
// 増加＝今月登録されて今も未読のままの本
// 減少＝先月以前から未読だったが、今月中に未読以外へ変わった本
function getMonthlyTsundokuChange(bookList) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const addedThisMonth = bookList.filter((book) => {
        if (book.status !== "unread" || !book.created_at) return false;
        return new Date(book.created_at) >= startOfMonth;
    }).length;

    const resolvedThisMonth = bookList.filter((book) => {
        if (book.status === "unread" || !book.created_at || !book.updated_at) return false;
        const created = new Date(book.created_at);
        const updated = new Date(book.updated_at);
        return created < startOfMonth && updated >= startOfMonth;
    }).length;

    return addedThisMonth - resolvedThisMonth;
}

let currentRating = 0;

function setRating(rating) {
    currentRating = rating;
    const stars = document.querySelectorAll("#rating span");
    stars.forEach((star, index) => {
        star.textContent = index < rating ? "★" : "☆";
    });
}

async function addBook() {
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

    currentRating = 0;
    setRating(0);
}

async function addRakutenBook(info) {

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

async function addWishlistItem({ title, author, image = "", isbn = "", publisher = "", publish_date = "", pages = 0, price = 0, rating = 0 }) {
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

async function deleteWishlistItem(wishId) {
    const { error } = await supabase.from("wishlists").delete().eq("id", wishId);
    if (error) {
        console.error(error);
        alert("ほしい本の削除に失敗しました。もう一度お試しください。");
        return;
    }
    await loadBooks();
}

async function purchaseWishlistItem(wishId) {
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

function displayBooks() {
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

    // 本の統計を表示（所有 + ほしい本）
    if (stats) {
        const totalOwned = books.length;
        const totalWish = wishlists.length;
        const total = totalOwned + totalWish;
        const unread = books.filter(book => book.status === "unread").length;
        const reading = books.filter(book => book.status === "reading").length;
        const finished = books.filter(book => book.status === "finished").length;

        const rate = totalOwned === 0 ? 0 : Math.round(finished / totalOwned * 100);
        const monthlyChange = getMonthlyTsundokuChange(books);
        const monthlyChangeLabel = monthlyChange > 0 ? `+${monthlyChange}` : `${monthlyChange}`;

        stats.innerHTML = `
        📚 総数（所有＋ほしい）：${total}冊　（所有：${totalOwned} / ほしい：${totalWish}）
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

    // まず「ほしい本」を表示（タブが all か want のとき）
    if (currentTab === "all" || currentTab === "want") {
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
                            <button onclick="purchaseWishlistItem('${w.id}')">購入済みにする</button>
                            <button onclick="deleteWishlistItem('${w.id}')">削除</button>
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

        htmlParts.push(`
            <div class="book">
                <img src="${escapeHTML(book.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">

                <div class="book-info">
                    <h3 class="book-title-link" onclick="showBookDetail('${book.id}')">${escapeHTML(book.title)}</h3>
                    <p>著者：${escapeHTML(book.author)}</p>
                    <p>出版社：${escapeHTML(book.publisher || "不明")}</p>
                    <p>ISBN：${escapeHTML(book.isbn || "なし")}</p>
                    ${book.price ? `<p>価格：${escapeHTML(book.price)}円</p>` : ""}
                    ${risk ? `<p><span class="risk-dot ${risk.color}" title="登録から${risk.days}日"></span>積読${risk.days}日目</p>` : ""}

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
                        <button onclick="togglePurchased('${book.id}')">
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

                    <button onclick="deleteBook('${book.id}')">削除</button>
                </div>
            </div>
        `);
    });

    list.innerHTML = htmlParts.join("");
}

function showBookDetail(bookId) {
    detailBookId = bookId;
    displayBooks();
}
window.showBookDetail = showBookDetail;

function backToList() {
    detailBookId = null;
    displayBooks();
}
window.backToList = backToList;

// 💡 ISBNで楽天ブックスAPIを1件だけ検索し、あらすじ(itemCaption)を取得する
async function fetchRakutenBookByIsbn(isbn) {
    const { data, error } = await supabase.functions.invoke("rakuten-search", {
        body: { keyword: isbn, searchType: "isbn", page: 1 },
    });

    if (error) {
        console.error(error);
        return null;
    }

    const item = (data.Items || [])[0]?.Item;
    if (!item) return null;

    return {
        itemCaption: item.itemCaption || "",
        itemPrice: item.itemPrice || "",
    };
}

async function renderBookDetailView() {
    const list = document.getElementById("bookList");
    const book = books.find((b) => String(b.id) === String(detailBookId));

    if (!list) return;

    if (!book) {
        detailBookId = null;
        displayBooks();
        return;
    }

    const risk = getTsundokuRisk(book);

    list.innerHTML = `
        <div class="book-detail">
            <button class="small-button" onclick="backToList()">← 一覧に戻る</button>
            <div class="book">
                <img src="${escapeHTML(book.image || "")}" alt="表紙" class="book-image" onerror="this.style.display='none'">
                <div class="book-info">
                    <h3>${escapeHTML(book.title)}</h3>
                    <p>著者：${escapeHTML(book.author)}</p>
                    <p>出版社：${escapeHTML(book.publisher || "不明")}</p>
                    <p>ISBN：${escapeHTML(book.isbn || "なし")}</p>
                    ${book.price ? `<p>価格：${escapeHTML(book.price)}円</p>` : ""}
                    ${risk ? `<p><span class="risk-dot ${risk.color}" title="登録から${risk.days}日"></span>積読${risk.days}日目</p>` : ""}
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

async function changeRating(bookId, rating) {
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

async function deleteBook(bookId) {
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

async function togglePurchased(bookId) {
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


async function changeStatus(bookId, status) {
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

function toggleStatusMenu(bookId) {
    const menu = document.getElementById(`statusMenu-${bookId}`);
    if (!menu) return;
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
}
window.toggleStatusMenu = toggleStatusMenu;

async function searchBook() {
    const input = document.getElementById("bookSearch");
    if (!input) return;

    const keyword = input.value;
    const searchType = document.getElementById("searchType").value;
    if (keyword === "") return;

    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.disabled = true;

    try {
        const items = await fetchRakutenResults(keyword, searchType);
        displaySearchResult(items);

    } catch (e) {
        console.error(e);
        alert("検索に失敗しました。少し時間を置いてもう一度お試しください。");
    } finally {
        if (searchBtn) searchBtn.disabled = false;
    }
}

// 楽天ブックスAPIの結果を、共通の形（title, author, isbnなど）に揃えて返す
async function fetchRakutenResults(keyword, searchType) {
    const allItems = [];
    const MAX_PAGES = 4; // 30件 × 4ページ = 最大120件取得(100件で切る)

    for (let page = 1; page <= MAX_PAGES; page++) {
        const { data, error } = await supabase.functions.invoke("rakuten-search", {
            body: { keyword, searchType, page },
        });

        if (error) {
            console.error(error);
            break;
        }

        const items = (data.Items || []).map((item) => {
            const info = item.Item;
            return {
                title: info.title,
                author: info.author,
                publisherName: info.publisherName || "",
                salesDate: info.salesDate || "",
                itemPrice: info.itemPrice || "",
                largeImageUrl: info.largeImageUrl || "",
                isbn: (info.isbn || "").replace(/-/g, ""),
                source: "rakuten"
            };
        });

        allItems.push(...items);

        // その回の結果が30件未満なら、もうページが無いので終了
        if (items.length < 30) break;

        // 100件集まったら十分なので終了
        if (allItems.length >= 100) break;

        // 楽天APIのレート制限に配慮して少し間隔を空ける
        if (page < MAX_PAGES) {
            await new Promise((resolve) => setTimeout(resolve, 1100));
        }
    }

    return allItems.slice(0, 100);
}

function displaySearchResult(items) {
    allSearchResults = items;
    currentSearchPage = 1;
    renderSearchPage();
}

function renderSearchPage() {
    const result = document.getElementById("searchResult");
    if (!result) return;

    result.innerHTML = "";

    const start = (currentSearchPage - 1) * RESULTS_PER_PAGE;
    const pageItems = allSearchResults.slice(start, start + RESULTS_PER_PAGE);

    pageItems.forEach((info) => {
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
            <img src="${escapeHTML(info.largeImageUrl || "")}" onerror="this.style.display='none'">
            <h3>${escapeHTML(info.title)}</h3>
            <p>著者：${escapeHTML(info.author)}</p>
            ${info.salesDate ? `<p>発売日：${escapeHTML(info.salesDate)}</p>` : ""}
            ${info.itemPrice ? `<p>価格：${escapeHTML(info.itemPrice)}円</p>` : ""}
        `;

        const button = document.createElement("button");
        button.textContent = "登録";
        button.onclick = () => addRakutenBook(info);

        div.appendChild(button);
        result.appendChild(div);
    });

    renderPagination();
}

function renderPagination() {
    const result = document.getElementById("searchResult");
    const totalPages = Math.max(1, Math.ceil(allSearchResults.length / RESULTS_PER_PAGE));

    const pagerDiv = document.createElement("div");
    pagerDiv.className = "pagination";

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "← 前へ";
    prevBtn.disabled = currentSearchPage === 1;
    prevBtn.onclick = () => {
        currentSearchPage--;
        renderSearchPage();
    };

    const pageLabel = document.createElement("span");
    pageLabel.textContent = `${currentSearchPage} / ${totalPages} ページ`;

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "次へ →";
    nextBtn.disabled = currentSearchPage === totalPages;
    nextBtn.onclick = () => {
        currentSearchPage++;
        renderSearchPage();
    };

    pagerDiv.appendChild(prevBtn);
    pagerDiv.appendChild(pageLabel);
    pagerDiv.appendChild(nextBtn);

    result.appendChild(pagerDiv);
}

function switchTab(tabName) {
    currentTab = tabName; // タブの状態を更新
    detailBookId = null; // タブを切り替えたら詳細表示は解除する

    // すべてのタブボタンから active クラスを一度消す
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    // クリックされたボタンだけに active クラスをつける
    document.getElementById(`tab-${tabName}`)?.classList.add("active");

    // 画面を再表示してフィルターをかける
    displayBooks();
}

const signinBtn=document.getElementById("signinBtn");

if(signinBtn){

    signinBtn.addEventListener("click",async()=>{

        const email=document.getElementById("email").value;
        const password=document.getElementById("password").value;
        try{

            await signIn(email,password);

            location.href="index.html";

        }
        catch(e){
            console.error(e);
            alert(e.message);
            document.getElementById("auth-message").textContent = e.message;
        }

    });

}

const signupBtn=document.getElementById("signupBtn");

if(signupBtn){

    signupBtn.addEventListener("click",async()=>{

        const email=document.getElementById("email").value;
        const password=document.getElementById("password").value;
        try{

            await signUp(email,password);

            document.getElementById("auth-message").textContent=
            "確認メールを送信しました。";
        }catch(e){

            document.getElementById("auth-message").textContent=e.message;

        }

    });

}

(async () => {
    const user = await getCurrentUser();

    const page = location.pathname.split("/").pop();

    if (
        !user &&
        (
            page === "list.html" ||
            page === "search.html" ||
            page === "wishlist.html" ||
            page === "updates.html"
        )
    ) {
        location.href = "login.html";
    }
})();

const searchBtn = document.getElementById("searchBtn");
if (searchBtn) searchBtn.addEventListener("click", searchBook);

window.switchTab = switchTab; // HTMLから呼べるように公開
window.searchBook = searchBook;
window.addBook = addBook;
window.deleteBook = deleteBook;
window.changeRating = changeRating;
window.togglePurchased = togglePurchased;
window.changeStatus = changeStatus;
window.displayBooks = displayBooks;
window.addScheduleItem = addScheduleItem;
window.deleteScheduleItem = deleteScheduleItem;
window.handleExistingBookChange = handleExistingBookChange;
window.handleFrequencyChange = handleFrequencyChange;
window.renderSchedulePage = renderSchedulePage;
// Wishlists 外部公開
window.purchaseWishlistItem = purchaseWishlistItem;
window.deleteWishlistItem = deleteWishlistItem;
window.addWishlistItem = addWishlistItem;

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        await signOut();
        location.href = "login.html";
    });
}