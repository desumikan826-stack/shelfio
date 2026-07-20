// 💡 一番安全な初期化方法（これなら絶対に二重宣言エラーになりません）
if (!window.globalSupabase) {
    const supabaseUrl = "https://eqgyfkxiecozflnbypkl.supabase.co";
    const supabaseKey = "sb_publishable_3MQXaPuO9U3O_zub0LPoGg_N2pIYkIJ";
    window.globalSupabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}
const supabase = window.globalSupabase;
let currentUser = null;

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
            ようこそ、${currentUser.email} さん！<br><br>
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

async function loadBooks() {

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", user.id);

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
    const read = document.getElementById("read").checked;

    if (title === "") return;

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
        .from("books")
        .insert({
            user_id: user.id,
            title: title,
            author: author,
            image: "",
            rating: currentRating,
            purchased: purchased,
            read: read
        });

    if (error) {
        console.error(error);
        return;
    }

    await loadBooks();

    document.getElementById("title").value = "";
    document.getElementById("author").value = "";
    document.getElementById("purchased").checked = false;
    document.getElementById("read").checked = false;

    currentRating = 0;
    setRating(0);
}

async function addRakutenBook(info) {

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from("books")
        .insert({
            user_id: user.id,
            title: info.title,
            author: info.author,
            image: info.largeImageUrl || "",
            rating: 0,
            purchased: false,
            read: false
        });

    console.log(data);
    console.log(error);

    await loadBooks();
}

function displayBooks() {
    const list = document.getElementById("bookList");
    const search = document.getElementById("search");

    if (!list || !search) return;

    const keyword = search.value.toLowerCase();
    list.innerHTML = "";

    books.forEach((book, index) => {
        // 💡 1. まずキーワード検索にヒットするかチェック
        const matchesKeyword = book.title.toLowerCase().includes(keyword) || 
                             book.author.toLowerCase().includes(keyword);

        // 💡 2. 次に、現在のタブの条件に一致するかチェック
        let matchesTab = false;
        if (currentTab === 'all') {
            matchesTab = true; // 「すべて」なら無条件でOK
        } else if (currentTab === 'want') {
            matchesTab = !book.read; // 「欲しい本」なら、readがfalse（未読）のものだけ
        } else if (currentTab === 'read') {
            matchesTab = book.read; // 「読んだ本」なら、readがtrue（読了）のものだけ
        }

        // 💡 両方の条件をクリアした本だけを表示する
        if (matchesKeyword && matchesTab) {
            list.innerHTML += `
            <div class="book">
                <img src="${book.image || ""}" alt="表紙" class="book-image">
                <div class="book-info">
                    <h3>${book.title}</h3>
                    <p>著者：${book.author}</p>
                    <p>
                        評価：
                        ${book.rating === 0 ? "<span class='no-rating'>未評価</span>" : ""}
                        ${[1,2,3,4,5].map(star => `
                            <span onclick="changeRating(${index}, ${star})" class="star">
                            ${star <= book.rating ? "★" : "☆"}
                            </span>
                        `).join("")}
                    </p>
                    <p>
                        購入：${book.purchased ? "購入済み" : "未購入"}
                        <button onclick="togglePurchased(${index})">
                            ${book.purchased ? "未購入に戻す" : "購入済みにする"}
                        </button>
                    </p>
                    <p>
                        読書：${book.read ? "読了済み" : "未読"}
                        <button onclick="toggleRead(${index})">
                            ${book.read ? "未読に戻す" : "読了済みにする"}
                        </button>
                    </p>
                    <button onclick="deleteBook(${index})">削除</button>
                </div>
            </div>
            `;
        }
    });
}

async function changeRating(index, rating) {
    const book = books[index];

    const newRating = (book.rating === rating) ? 0 : rating;

    const { error } = await supabase
        .from("books")
        .update({ rating: newRating })
        .eq("id", book.id);

    if (error) {
        console.error(error);
        return;
    }

    await loadBooks();
}

async function deleteBook(index) {
    const book = books[index];

    const { error } = await supabase
        .from("books")
        .delete()
        .eq("id", book.id);

    if (error) {
        console.error(error);
        return;
    }

    await loadBooks();
}

async function togglePurchased(index) {
    const book = books[index];

    const { error } = await supabase
        .from("books")
        .update({
            purchased: !book.purchased
        })
        .eq("id", book.id);

    if (error) {
        console.error(error);
        return;
    }

    await loadBooks();
}

async function toggleRead(index) {
    const book = books[index];

    const { error } = await supabase
        .from("books")
        .update({
            read: !book.read
        })
        .eq("id", book.id);

    if (error) {
        console.error(error);
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
    if (keyword === "") return;

    try {
        const APPLICATION_ID = "246b99d2-5d3f-4cf5-8b60-2ac664b77f76";
        const ACCESS_KEY = "pk_Wg4VWiSclMvhhFtEZ244i6Rg6xuZWGY1X0HoxQRKe7d";

        const url =
            "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404" +
            "?applicationId=" + encodeURIComponent(APPLICATION_ID) +
            "&accessKey=" + encodeURIComponent(ACCESS_KEY) +
            "&title=" + encodeURIComponent(keyword) +
            "&format=json";

        const response = await fetch(url, {
            headers: { "accessKey": ACCESS_KEY }
        });
        
        const data = await response.json();

        if (!response.ok) {
            return;
        }

        displaySearchResult(data.Items);
    } catch (e) {
        console.error(e);
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
            <img src="${info.largeImageUrl || ""}">
            <h3>${info.title}</h3>
            <p>著者：${info.author}</p>
            <p>発売日：${info.salesDate}</p>
            <p>価格：${info.itemPrice}円</p>
        `;

        const button = document.createElement("button");
        button.textContent = "登録";
        button.onclick = () => addRakutenBook(info);

        div.appendChild(button);
        result.appendChild(div);
    });
}

async function testConnection(){
    const { data, error } = await supabase.from("books").select("*");
    console.log(data);
}


function switchTab(tabName) {
    currentTab = tabName; // タブの状態を更新

    // すべてのボタンから active クラスを一度消す
    document.getElementById("tab-all")?.classList.remove("active");
    document.getElementById("tab-want")?.classList.remove("active");
    document.getElementById("tab-read")?.classList.remove("active");

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

const {
    data: { user },
} = await supabase.auth.getUser();

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

window.switchTab = switchTab; // HTMLから呼べるように公開

const searchBtn = document.getElementById("searchBtn");
if (searchBtn) searchBtn.addEventListener("click", searchBook);

window.searchBook = searchBook;
window.addBook = addBook;
window.deleteBook = deleteBook;
window.changeRating = changeRating;
window.togglePurchased = togglePurchased;
window.toggleRead = toggleRead;
window.switchTab = switchTab; // 👈 これも忘れずに！
window.displayBooks = displayBooks;

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {

        await signOut();

        location.href = "login.html";

    });
}