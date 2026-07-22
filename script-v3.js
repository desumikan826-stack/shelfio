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

        if (message) {
            message.innerHTML = `
            ようこそ、${escapeHTML(currentUser.email)} さん！<br><br>
            上のメニューから機能を選択してください。
            `;
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

let books = [];
let currentTab = 'all'; // 💡 今どのタブが選ばれているかを保存（all, want, read）

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

    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", user.id);

    if (error) {
        console.error(error);
        alert("本の一覧の取得に失敗しました。もう一度お試しください。");
        return;
    }

    books = data || [];
    displayBooks();
}

loadBooks();

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

    if (title === "") return;

    const user = await getCurrentUser();

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
        rating: currentRating,
        purchased: purchased,
        status: status
    });

    if (error) {
        console.error(error);
        alert("本の登録に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();

    alert("登録しました");

    document.getElementById("title").value = "";
    document.getElementById("author").value = "";
    document.getElementById("purchased").checked = false;
    document.getElementById("status").value = "unread";

    currentRating = 0;
    setRating(0);
}

async function addRakutenBook(info) {

    const user = await getCurrentUser();

    const { data, error } = await supabase
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
        rating: 0,
        purchased: false,
        status: "unread"
    });

    if (error) {
        console.error(error);
        alert("本の登録に失敗しました。もう一度お試しください。");
        return;
    }

    await loadBooks();

    alert("登録しました");
}

function displayBooks() {
    const list = document.getElementById("bookList");
    const search = document.getElementById("search");
    const stats = document.getElementById("bookStats");

    if (!list || !search) return;

    const keyword = search.value.toLowerCase();
    const sortType = document.getElementById("sortType")?.value || "none";

    // 本の統計を表示
    if (stats) {
        const total = books.length;
        const unread = books.filter(book => book.status === "unread").length;
        const reading = books.filter(book => book.status === "reading").length;
        const finished = books.filter(book => book.status === "finished").length;

        const rate = total === 0 ? 0 : Math.round(finished / total * 100);

        stats.innerHTML = `
        📚 総数：${total}冊　
        📖 未読：${unread}冊　
        📘 読書中：${reading}冊　
        ✅ 読了：${finished}冊　
        📊 読了率：${rate}%
        `;
    }

    list.innerHTML = "";

    let sortedBooks = [...books];

    if (sortType === "rating") {
        sortedBooks.sort((a, b) => b.rating - a.rating);
    }

    if (sortType === "title") {
        sortedBooks.sort((a, b) => a.title.localeCompare(b.title, "ja"));
    }

    // 💡 ループ中に何度もinnerHTML+=すると描画のたびに再計算が走るため、
    // 一旦配列にHTML文字列をためて最後にまとめて書き込む
    const htmlParts = [];

    sortedBooks.forEach((book) => {

    const matchesKeyword =
        book.title.toLowerCase().includes(keyword) ||
        book.author.toLowerCase().includes(keyword);

    const matchesTab =
        currentTab === "all" || book.status === currentTab;

    if (matchesKeyword && matchesTab) {

        htmlParts.push(`
            <div class="book">
                <img src="${escapeHTML(book.image || "")}" alt="表紙" class="book-image">

                <div class="book-info">
                    <h3>${escapeHTML(book.title)}</h3>
                    <p>著者：${escapeHTML(book.author)}</p>
                    <p>出版社：${escapeHTML(book.publisher || "不明")}</p>
                    <p>ページ数：${escapeHTML(book.pages || 0)}ページ</p>
                    <p>ISBN：${escapeHTML(book.isbn || "なし")}</p>

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

                    <p>
                        読書状況：
                        <select onchange="changeStatus('${book.id}', this.value)">
                            <option value="unread" ${book.status === "unread" ? "selected" : ""}>未読</option>
                            <option value="reading" ${book.status === "reading" ? "selected" : ""}>読書中</option>
                            <option value="finished" ${book.status === "finished" ? "selected" : ""}>読了済み</option>
                        </select>
                    </p>

                    <button onclick="deleteBook('${book.id}')">削除</button>
                </div>
            </div>
        `);

    }

});

    list.innerHTML = htmlParts.join("");
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
        .update({ status })
        .eq("id", bookId);

    if (error) {
        console.error(error);
        alert("読書状態の更新に失敗しました");
        return;
    }

    await loadBooks();
}


function openSettings() {
    document.getElementById("settingsModal").style.display = "block";
}

function closeSettings() {
    document.getElementById("settingsModal").style.display = "none";
}

displayBooks();

async function searchBook() {
    const input = document.getElementById("bookSearch");
    if (!input) return;

    const keyword = input.value;
    const searchType = document.getElementById("searchType").value;
    const apiType = document.getElementById("apiType").value;
    if (keyword === "") return;

    try {
        if (apiType === "rakuten") {

            // APIキーはクライアントに置かず、Supabase Edge Function経由でRakutenを呼び出す
            const { data, error } = await supabase.functions.invoke("rakuten-search", {
                body: { keyword, searchType },
            });

            if (error) {
                console.error(error);
                alert("検索に失敗しました。もう一度お試しください。");
                return;
            }

            displaySearchResult(data.Items);

        } else {

            await searchSRU(keyword, searchType);

        }
    } catch (e) {
        console.error(e);
    }
}

async function searchSRU(keyword, searchType) {

    const indexMap = {
        title: "title",
        author: "creator",
        publisherName: "publisher",
        isbn: "isbn"
    };

    const index = indexMap[searchType];

    const url =
        `https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve` +
        `&version=1.2` +
        `&query=${index}="${encodeURIComponent(keyword)}"` +
        `&maximumRecords=10`;

    const response = await fetch(url);

    const xml = await response.text();


    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, "text/xml");

    const records = xmlDoc.getElementsByTagName("record");

    const result = document.getElementById("searchResult");
    result.innerHTML = "";

    for (const record of records) {

    const data = record.getElementsByTagName("recordData")[0];

    const doc = parser.parseFromString(data.textContent, "text/xml");

    const title =
        doc.getElementsByTagName("dc:title")[0]?.textContent || "";

    const author =
        doc.getElementsByTagName("dc:creator")[0]?.textContent || "";

    const publisher =
        doc.getElementsByTagName("dc:publisher")[0]?.textContent || "";

    const div = document.createElement("div");
    div.className = "book";

    div.innerHTML = `
        <h3>${escapeHTML(title)}</h3>
        <p>著者：${escapeHTML(author)}</p>
        <p>出版社：${escapeHTML(publisher)}</p>
    `;

    const button = document.createElement("button");
    button.textContent = "登録";

    div.appendChild(button);

    result.appendChild(div);
    }
}

function displaySearchResult(items) {
    const result = document.getElementById("searchResult");
    if (!result) return;

    result.innerHTML = "";

    items.forEach((item) => {
        const info = item.Item;
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
            <img src="${escapeHTML(info.largeImageUrl || "")}">
            <h3>${escapeHTML(info.title)}</h3>
            <p>著者：${escapeHTML(info.author)}</p>
            <p>発売日：${escapeHTML(info.salesDate)}</p>
            <p>価格：${escapeHTML(info.itemPrice)}円</p>
        `;

        const button = document.createElement("button");
        button.textContent = "登録";
        button.onclick = () => addRakutenBook(info);

        div.appendChild(button);
        result.appendChild(div);
    });
}

function switchTab(tabName) {
    currentTab = tabName; // タブの状態を更新

    // すべてのボタンから active クラスを一度消す
    document.getElementById("tab-all")?.classList.remove("active");
    document.getElementById("tab-unread")?.classList.remove("active");
    document.getElementById("tab-reading")?.classList.remove("active");
    document.getElementById("tab-finished")?.classList.remove("active");


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
            page === "settings.html"
        )
    ) {
        location.href = "login.html";
    }
})();

window.switchTab = switchTab; // HTMLから呼べるように公開

const searchBtn = document.getElementById("searchBtn");
if (searchBtn) searchBtn.addEventListener("click", searchBook);

window.searchBook = searchBook;
window.addBook = addBook;
window.deleteBook = deleteBook;
window.changeRating = changeRating;
window.togglePurchased = togglePurchased;
window.changeStatus = changeStatus;
window.displayBooks = displayBooks;

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {

        await signOut();

        location.href = "login.html";

    });
}