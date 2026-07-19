/* テスト */ /* %は割り算のあまり**はべき乗 */
alert('Hellow World!');
const foo1 = 1 + 1;/* constは定数(再代入できない)、letは変数を入れるもの */
console.log(foo1);

const colorDark = "#000"
/* if(new Data().getHours() >= 0)
{
    document.body.style.backgroundColor = colorDark;
}

if(user.setting.darkMode == true)
{
    document.body.style.backgroundColor = colorDark;
} */

const array = [1, "Hellow", 3];/* jsでは変数や文字列を一緒に入れることもできる。 */
console.log(array[2]);

console.log( "Hellow" + "World" );/* HellowWorldと表示される */
console.log("1" + "1");/* この場合1が文字列として認識されるので11と表示される */

/* if(isLogin = true)
{

}
もしisLoginがtrueならば実行する */

let errorMessage =null;/* nullは開発者が意図的に定義したもの、undefinedは開発者が意図せず設定しなかった場合にも自動で設定される */
console.log(errorMessage);

const questions = [
    "現在の日本の総理大臣の名前は",
    "令和7年は西暦で言うと何年？",
    "最も人口が多い国はどこ"
]

for(let index = 0; index < questions.length; index++)/* questions.lengthは配列questionsの要素数 */
{
    console.log(questions[index]);
}


let isLogin = false;
if(isLogin === false)/* !isLogin=falseでも良い */
{
    alert("ログインしてください");
}

let condition = 1;
if(condition === 1)
{
    console.log("この値は1です");
}
else
{
    console.log("この値は1ではないです");
}

const userType = "member";/* userTypeが社員か、部長か、社長かで表示を変える */
if(userType === "member")
{
    alert("ログインできません");
}
else if(userType === "admin")
{
    alert("10分間だけ利用できます");
}
else
{
    console.log("アクセスできます");
}

function changeDarkMode(time, color)/* function 関数名(引数) */
{
    if(new Date().getHours() > time)
    {
        document.body.style.backgroundColor = color
    }
}
changeDarkMode(20, "#333");

function changeDarkMode(time = 20, color = "#333")/* function 関数名(引数) *//* 引数にはデフォルト値を設定しておくことでエラーを防ぐことができる */
{
    if(new Date().getHours() > time)new Date().getHours()/* で今の時間を入手する */
    {
        document.body.style.backgroundColor = color
    }
}
changeDarkMode();/* time=20とcolor=#333のデフォルト値が適応される */

changeDarkMode({
    time: 20,
    color: "#333"
})/* 関数にはオブジェクト形式で引数を渡すことができる。この場合、引数の順番気にしなくて良くなる */

function foo2(callback)
{
    console.log("Hi,Tom!");
    callback();
}

function bar()
{
    console.log("Hi,Ken!");
}
foo2(bar);

function getSeason()
{
    const month = new Date().getMonth() + 1;
    if(month >= 3 && month <= 5)
    {
        return "spring";
    }
    else if(month >= 3 && month <= 5)
    {
        return "summer";
    }
    else if(month >= 6 && month <= 8)
    {
        return "autumn";
    }
    else (month >= 9 && month <= 11)
    {
        return "winter";
    }
}

const season = getSeason();
console.log(season);

const bar1 = 1;
function foo()
{
    const bar2 = 2;
    console.log(bar2);
}
console.log(bar1);
/* console.log(bar2); *//* bar1はグローバル変数、bar2はローカルへんすうなのでconsole.log(bar2);はエラーになる */

function attack(Damage)
{
    if(Math.random() <= 0.3)/* Math.random()は0.0から1.0の間でランダムに数字を生成する */
    {
        return Damage;
    }
    else
    {
        return 0
    }
}
console.log(attack(20));

/* const オブジェクト名 = {
    プロパティ名: 値
} *//* オブジェクトとはデータを纏めて管理するための箱のようなもの、この箱には様々な値や機能を詰め込むことができる。 */

const Userinfo = {
    id: 1,
    userName: "taro",
    gender: "male",
    like: function(){
        console.log("like");
    },
    post: function(){
        //ここに処理を書く
    },
    followers: ["Yamada", "Suzuki", "Tanaka"],
    post: function(contents){
        return contents + "を投稿しました by " + this.userName;
    }
}

console.log(Userinfo.id);
console.log(Userinfo.post("プログラミングなう。"));

/* 標準組み込み関数、標準組み込みオブジェクト */

parseInt("2");/* parsIntは引数に文字列を渡すと数値に変換してくれる関数 */
console.log(parseInt("2"));
console.log(Math.PI);/* Math.Piは円周率を求めるプロパティ */

const ABC = ["A", "B", "C"];
ABC.push("D");/* pushは配列に新しい値を入れるプロパティ */
console.log(ABC);
console.log(ABC.length);

const XYZ = ["X", "Y", "Z"]
console.log(ABC.concat(XYZ));/* concatを使うと2つの配列を1つにまとめることができる */

window.alert()/* 大抵のプロパティでwindowの入力を省略できる */

console.log(window.document);/* このプログラムはWebページのHTML,CSSの情報を持っている。またdocumentオブジェクトを使うことでHTMLやCSSの操作を行うことができる。windowは省略できる */

/* document.querySelector().innerHTML; */ /* document.querySelectorは特定のHTML要素を取得できる。.innerHTMLはHTMLタグ内のテキスト要素を取得したり、変更するプロパティ */

/* document.querySelector().style; */ /* styleはHTMLタグのCSSを取得したり変更するプロパティ */
document.querySelector("#oppai").innerText = "おっぱい";
document.querySelector("#oppai").style.backgroundColor = "#aaa";

setTimeout(function(){
    alert("Hellow");
},5000);/* setTimeoutは引数を2つ持っている。1つ目には関数、2つ目には時間を入れ、入れた時間後に実行する。5000の場合、5000ミリ秒で5秒になる */

const timer = setTimeout(function(){
    alert("tired");
},10000);

clearTimeout(timer);/* clearTimeoutはsetTimeoutで設定したタイマーを解除する */

console.log(document.querySelector("#foo"))
document.querySelectorAll(".bar")


document.getElementById("foo")
document.getElementsByClassName("bar")
/* この4つのdocumentのメゾットやプロパティで上2つはHTML要素に操作を加えたい場合に使い、下2つはHTMLの要素を取得できる */
/* 1つ目と3つ目のコードでidは1つしか存在してはいけないルールが有るので1つの変数としてカウントされる。
しかし2つ目と4つ目のclassは複数あることが前提なので配列になる。したがって一つの要素を指定したい場合はdocument.querySelectorAll(".bar")[0]のようにする */

const DOMAIN = "https://test.com";/* 定数で値を変えない予定なら名前を大文字にするとわかりやすい */

const isget = false;/* trueかfalseで状態を表す系の変数はisXXXとつける */

const pokemonName = "pikachu";/* 英単語をつなげて書く場合、後の単語の頭文字を大文字でつなげることをキャメルケースという。pythonだとスネークケース、JSだとキャメルケースをよく使う */

const $post = document.createElement("article");/* createElementはHTMLタグを1個生成する */
$post.setAttribute("class", "post");/* setAttributeは2つの引数を持っていて、1つ目にセレクタ名、2つ目にそのセレクタの値を入れる */
$post.innerText = "お腹がすいた～ら";

const $timeline = document.querySelectorAll(".timeline")[0];
$timeline.appendChild($post);/* appendChildとは取得したHTML要素に対して使うと引数に入れた別のHTMLを挿入することができる */

// イベント
window.addEventListener("load", function(){
    alert("読み込み完了");
});/* addEventListenerは引数を2つ持つ。1つ目にイベントのタイプ、2つ目にイベント時に実行する関数 */
/* windowオブジェクトに対するaddEventListenerのイベントはWebページ全体に対するイベント、documentオブジェクトに対するaddEventListenerはボタンや画像などの個々のHTML要素に関するイベントを設定する */