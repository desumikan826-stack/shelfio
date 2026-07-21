// Rakuten Books API を代理で呼び出すEdge Function
// APIキーはこの関数の環境変数(secret)にのみ保存され、ブラウザには一切渡らない

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // 本番では自分のドメインに限定推奨
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // プリフライトリクエスト対応
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { keyword, searchType } = await req.json();

    if (!keyword || !searchType) {
      return new Response(
        JSON.stringify({ error: "keyword と searchType は必須です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // secretはSupabaseダッシュボード、またはCLIで設定する（コードには書かない）
    const APPLICATION_ID = Deno.env.get("RAKUTEN_APPLICATION_ID");
    const ACCESS_KEY = Deno.env.get("RAKUTEN_ACCESS_KEY");

    if (!APPLICATION_ID || !ACCESS_KEY) {
      return new Response(
        JSON.stringify({ error: "サーバー側の設定が不足しています" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 許可されたWebサイトとして登録したドメイン（楽天アプリ設定と一致させる必要がある）
    const SITE_ORIGIN = "https://desumikan826-stack.github.io";

    const url =
      "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404" +
      "?applicationId=" + encodeURIComponent(APPLICATION_ID) +
      "&accessKey=" + encodeURIComponent(ACCESS_KEY) +
      "&" + encodeURIComponent(searchType) + "=" + encodeURIComponent(keyword) +
      "&format=json";

    const rakutenRes = await fetch(url, {
      headers: {
        accessKey: ACCESS_KEY,
        Origin: SITE_ORIGIN,
        Referer: SITE_ORIGIN,
      },
    });

    if (!rakutenRes.ok) {
      const rakutenErrorBody = await rakutenRes.text();
      return new Response(
        JSON.stringify({
          error: "Rakuten APIの呼び出しに失敗しました",
          rakutenStatus: rakutenRes.status,
          rakutenBody: rakutenErrorBody,
        }),
        { status: rakutenRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await rakutenRes.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});