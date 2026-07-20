// latest version script.js loaded successfully
console.log("最新版(Auth)script.js 読み込み成功");

// ==========================================
// 1. 初期化とグローバル変数
// ==========================================

// 💡 認証オプション付きで初期化
const supabaseUrl = "https://eqgyfkxiecozflnbypkl.supabase.co";
const supabaseKey = "sb_publishable_3MQXaPuO9U3O_zub0LPoGg_N2pIYkIJ"; 

const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true, // セッションを保存
    autoRefreshToken: true, // トークンを自動更新
  }
});

// アプリケーションの状態を保持
let books = []; // 書籍リスト
let currentTab = 'all'; // 現在のタブ（all, want, read）
let currentUser = null; // ログインユーザー情報
let currentRating = 0; // 追加フォームでの星評価


// ==========================================
// 2. 認証 (Supabase Auth) 関連の関数
// ==========================================

// 2-1. サインアップ (新規登録)
async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });
  if (error) throw error;
  return data;
}

// 2-2. サインイン (ログイン)
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });
  if (error) throw error;
  return data;
}

// 2-3. サインアウト (ログアウト)
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// 💡 ログイン状態を監視するリスナー
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth State Changed:", event, session);
  
  if (session) {
    // ログインしている
    currentUser = session.user;
    console.log("Logged in as:", currentUser.email);
    updateUIForLoggedIn(currentUser); // UI切り替え
    loadBooks(); // ログイン後に読み込む
  } else {
    // ログアウトしている
    currentUser = null;
    console.log("Logged out");
    updateUIForLoggedOut(); // UI切り替え
    books = []; // リストを空にする
    // index.html以外ならログイン画面へ移動
    if (window.location.pathname.includes('list.html') || window.location.pathname.includes('search.html')) {
        window.location.href = "login.html";
    }
  }
});


// ==========================================
// 3. UI切り替え用の関数 (ログイン/ログアウト時)
// ==========================================

// 3-1. ログイン後のUI調整
function updateUIForLoggedIn(user) {
    const nav = document.querySelector("header nav");
    if (nav) {
        nav.style.display = "flex"; // ナビゲーションを表示
        // ログアウトボタンを追加
        if (!document.getElementById("signoutNav")) {
            const signoutNav = document.createElement("a");
            signoutNav.id = "signoutNav";
            signoutNav.href = "#";
            signoutNav.textContent = `👋 ${user.email} (ログアウト)`;
            signoutNav.onclick = signOut;
            nav.appendChild(signoutNav);
        }
    }

    // index.htmlのメッセージ
    const welcomeMsg = document.getElementById("welcome-message");
    if (welcomeMsg) {
      welcomeMsg.innerHTML = `ようこそ、${user.email}さん！<br>上のメニューから機能を選択してください。`;
    }
}

// 3-2. ログアウト後のUI調整
function updateUIForLoggedOut() {
    const nav = document.querySelector("header nav");
    if (nav) {
        nav.style.display = "none"; // ナビゲーションを隠す
    }
    // index.htmlのメッセージ
    const welcomeMsg = document.getElementById("welcome-message");
    if (welcomeMsg) {
        welcomeMsg.innerHTML = `最初に <a href="login.html">ログイン / 新規登録</a> してください。<br>ログインすると、プライベートなリストを管理できます。`;
    }
}


// ==========================================
// 4. データ操作 (Supabase DB) 関連の関数
// ==========================================

// ✅ loadBooks: ログインユーザーの本だけを読み込む
async function loadBooks() {
    if (!currentUser) {
        books = [];
        displayBooks();
        return;
    }

    const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq('user_id', currentUser.id); // 💡 user_id でフィルター

    if (error) {
        console.error(error);
        return;
    }

    books = data;
    displayBooks();
}

// ✅ saveBooks: localStorageへの保存は削除 (DBに保存されるため)
function saveBooks() {
    // 削除
}


// ==========================================
// 5. 書籍管理用の関数 (追加、削除、変更)
// ==========================================

// 5-1. setRating: 追加フォームでの星評価の設定
function setRating(rating) {
    currentRating = rating;
    const stars = document.querySelectorAll("#rating span");
    stars.forEach((star, index) => {
        star.textContent = index < rating ? "★" : "☆";
    });
}

// ✅ 5-2. addBook: user_idを追加して新規登録
async function addBook() {
    if (!currentUser) return; // ログインしていなければ登録しない

    const titleInput = document.getElementById("title");
    const authorInput = document.getElementById("author");
    const purchasedInput = document.getElementById("purchased");
    const readInput = document.getElementById("read");

    const title = titleInput.value;
    const author = authorInput.value;
    const purchased = purchasedInput.checked;
    const read = readInput.checked;

    if (title === "") return;

    await supabase
    .from("books")
    .insert({
        title: title,
        author: author,
        image: "",
        rating: currentRating,
        purchased: purchased,
        read: read,
        user_id: currentUser.id // 💡 ログインユーザーのIDを追加
    });

    await loadBooks();

    // フォームをクリア
    titleInput.value = "";
    authorInput.value = "";
    purchasedInput.checked = false;
    readInput.checked = false;
    currentRating = 0;
    setRating(0);
}

// ✅ 5-3. addRakutenBook: 楽天API検索結果からuser_idを追加して登録
async function addRakutenBook(info) {
    if (!currentUser) return;

    await supabase
    .from("books")
    .insert({
        title: info.title,
        author: info.author,
        image: info.largeImageUrl,
        rating: 0,
        purchased: false,
        read: false,
        user_id: currentUser.id // 💡 user_idを追加
    });

    await loadBooks();
}

// 5-4. changeRating, 5-5. deleteBook... (中身は適宜実装)

// displayBooks, switchTab, openSettings... (中身は適宜実装)


// ==========================================
// 7. 外部サービス連携 (楽天 Books API) - 以前のコードから持ってくる！
// ==========================================

// ✅ 7-1. searchBook: 楽天 Books 検索
async function searchBook() {
    const input = document.getElementById("bookSearch");
    if (!input) return;

    const keyword = input.value;
    if (keyword === "") return;

    try {
        // 💡 あなたの楽天APIのアプリケーションIDを設定してください
        const APPLICATION_ID = "YOUR_RAKUTEN_APP_ID"; 

        const url =
            "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404" +
            "?applicationId=" + encodeURIComponent(APPLICATION_ID) +
            "&title=" + encodeURIComponent(keyword) +
            "&format=json";

        const response = await fetch(url);
        
        const data = await response.json();

        if (!response.ok) {
            return;
        }

        displaySearchResult(data.Items);
    } catch (e) {
        console.error(e);
    }
}

// ✅ 7-2. displaySearchResult: 楽天APIの検索結果を画面に表示
function displaySearchResult(items) {
    const result = document.getElementById("searchResult");
    if (!result) return;

    result.innerHTML = ""; // 検索結果エリアをクリア

    items.forEach((item) => {
        const info = item.Item;
        
        result.innerHTML += `
            <div class="book">
                <img src="${info.largeImageUrl || info.mediumImageUrl || "noimage.png"}" class="book-image">
                <div class="book-info">
                    <h3>${info.title}</h3>
                    <p>著者：${info.author}</p>
                    <p>価格：${info.itemPrice}円</p>
                    <button onclick="addRakutenBook({title: '${info.title.replace(/'/g, "\\'")}', author: '${info.author.replace(/'/g, "\\'")}', largeImageUrl: '${info.largeImageUrl}'})" class="add-btn">リストに追加</button>
                </div>
            </div>
        `;
    });
}


// ==========================================
// 8. イベントリスナーとwindowへの公開
// ==========================================

// index.htmlのログイン/登録ページへの遷移
if (window.location.pathname.includes('index.html')) {
    updateUIForLoggedOut(); // 💡 初期状態は未ログインのUIを表示
}

// login.htmlのイベントリスナー
if (document.getElementById("signinBtn")) {
    document.getElementById("signinBtn").addEventListener("click", async () => {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const msg = document.getElementById("auth-message");
        try {
            await signIn(email, password);
            window.location.href = "index.html"; // サインイン成功でトップへリダイレクト
        } catch (e) {
            msg.textContent = "ログインに失敗しました。: " + e.message;
        }
    });
}

if (document.getElementById("signupBtn")) {
    document.getElementById("signupBtn").addEventListener("click", async () => {
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const msg = document.getElementById("auth-message");
        try {
            await signUp(email, password);
            msg.textContent = "確認メールを送信しました。メールを確認してください。";
            msg.style.color = "green";
        } catch (e) {
            msg.textContent = "新規登録に失敗しました。: " + e.message;
            msg.style.color = "red";
        }
    });
}

// 💡 以前定義されていたイベントリスナー（searchBtn）があればここに
const searchBtn = document.getElementById("searchBtn");
if (searchBtn) searchBtn.addEventListener("click", searchBook);

// 💡 以前定義されていたイベントリスナー（search, onkeyup）があればここに
const searchInput = document.getElementById("search");
if (searchInput) searchInput.addEventListener("keyup", displayBooks);


// window.xxx への公開 (これでエラーが消える！)
window.searchBook = searchBook;
window.addBook = addBook;
window.addRakutenBook = addRakutenBook; // 👈 忘れずに！
window.deleteBook = deleteBook;
window.changeRating = changeRating;
window.setRating = setRating;
window.togglePurchased = togglePurchased;
window.toggleRead = toggleRead;
window.switchTab = switchTab; 
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.displayBooks = displayBooks;
window.signOut = signOut; // 💡 公開