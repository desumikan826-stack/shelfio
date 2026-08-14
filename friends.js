import { supabase, escapeHTML, getCurrentUser } from './supabaseClient.js';

// 💡 friends.html の各セクション（自分のID／受け取った申請／送った申請／フレンド一覧）を描画する
export async function renderFriendsPage() {
    const myIdDisplay = document.getElementById("friendsMyId");
    const incomingList = document.getElementById("incomingRequestList");
    const outgoingList = document.getElementById("outgoingRequestList");
    const friendList = document.getElementById("friendList");

    // friends.html以外では何もしない
    if (!myIdDisplay && !incomingList && !outgoingList && !friendList) return;

    const user = await getCurrentUser();
    if (!user) return;

    if (myIdDisplay) myIdDisplay.textContent = user.id;

    const { data: rows, error } = await supabase
        .from("friend_requests")
        .select("id, requester_id, target_id, status")
        .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`);

    if (error) {
        console.warn("フレンド情報の読み込みに失敗しました:", error.message);
        return;
    }

    const incoming = rows.filter((r) => r.status === "pending" && r.target_id === user.id);
    const outgoing = rows.filter((r) => r.status === "pending" && r.requester_id === user.id);
    const accepted = rows.filter((r) => r.status === "accepted");

    // 💡 相手の名前をまとめて取得（RLSで、申請でつながっている相手のprofilesだけ見える設定にしてある）
    const otherIds = [
        ...incoming.map((r) => r.requester_id),
        ...outgoing.map((r) => r.target_id),
        ...accepted.map((r) => (r.requester_id === user.id ? r.target_id : r.requester_id)),
    ];
    const uniqueIds = [...new Set(otherIds)];

    const nameMap = {};
    if (uniqueIds.length) {
        const { data: profiles } = await supabase
            .from("profiles")
            .select("id, name")
            .in("id", uniqueIds);
        (profiles || []).forEach((p) => {
            nameMap[p.id] = p.name;
        });
    }

    const displayName = (id) => {
        const name = nameMap[id];
        return name ? escapeHTML(name) : `<span class="no-rating">(名前未設定) ${escapeHTML(id)}</span>`;
    };

    if (incomingList) {
        incomingList.innerHTML = incoming.length
            ? incoming.map((r) => `
                <div class="schedule-card">
                    <strong>${displayName(r.requester_id)}</strong> さんから申請が届いています
                    <div class="book-actions">
                        <button class="btn btn-primary small-button" onclick="acceptFriendRequest('${r.id}')">承認</button>
                        <button class="btn btn-danger small-button" onclick="rejectFriendRequest('${r.id}')">拒否</button>
                    </div>
                </div>
            `).join("")
            : "<p>受け取った申請はありません。</p>";
    }

    if (outgoingList) {
        outgoingList.innerHTML = outgoing.length
            ? outgoing.map((r) => `
                <div class="schedule-card">
                    <strong>${displayName(r.target_id)}</strong> さんへ申請中
                    <div class="book-actions">
                        <button class="btn btn-danger small-button" onclick="cancelFriendRequest('${r.id}')">取り消す</button>
                    </div>
                </div>
            `).join("")
            : "<p>送った申請はありません。</p>";
    }

    if (friendList) {
        friendList.innerHTML = accepted.length
            ? accepted.map((r) => {
                const otherId = r.requester_id === user.id ? r.target_id : r.requester_id;
                return `
                    <div class="schedule-card">
                        <strong>${displayName(otherId)}</strong>
                        <div class="book-actions">
                            <button class="btn btn-danger small-button" onclick="removeFriend('${r.id}')">フレンド解除</button>
                        </div>
                    </div>
                `;
            }).join("")
            : "<p>まだフレンドがいません。プロフィールページの固有IDを交換してみましょう。</p>";
    }
}

// 💡 入力された固有IDへフレンド申請を送る。
//    相手からすでに申請が届いていた場合は、その場で承認してフレンド成立させる
export async function sendFriendRequest() {
    const input = document.getElementById("friendTargetId");
    const targetId = input?.value.trim();

    if (!targetId) {
        alert("相手の固有IDを入力してください。");
        return;
    }

    const user = await getCurrentUser();
    if (!user) return;

    if (targetId === user.id) {
        alert("自分自身にはフレンド申請を送れません。");
        return;
    }

    const { data: existing, error: findError } = await supabase
        .from("friend_requests")
        .select("id, requester_id, status")
        .or(`and(requester_id.eq.${user.id},target_id.eq.${targetId}),and(requester_id.eq.${targetId},target_id.eq.${user.id})`)
        .maybeSingle();

    if (findError) {
        console.warn("フレンド関係の確認に失敗しました:", findError.message);
    }

    if (existing) {
        if (existing.status === "accepted") {
            alert("すでにフレンドです。");
        } else if (existing.requester_id === user.id) {
            alert("すでに申請中です。相手の承認をお待ちください。");
        } else {
            // 💡 相手から届いていた申請をそのまま承認扱いにする
            const { error } = await supabase
                .from("friend_requests")
                .update({ status: "accepted", updated_at: new Date().toISOString() })
                .eq("id", existing.id);
            if (error) {
                alert("承認に失敗しました：" + error.message);
            } else {
                alert("相手からの申請が届いていたので、フレンドになりました。");
            }
        }
        renderFriendsPage();
        return;
    }

    const { error } = await supabase
        .from("friend_requests")
        .insert({ requester_id: user.id, target_id: targetId });

    if (error) {
        if (error.code === "23503") {
            alert("そのIDのユーザーは見つかりませんでした。IDを確認してください。");
        } else {
            console.error(error);
            alert("申請に失敗しました：" + error.message);
        }
        return;
    }

    if (input) input.value = "";
    alert("フレンド申請を送りました。");
    renderFriendsPage();
}

export async function acceptFriendRequest(requestId) {
    const { error } = await supabase
        .from("friend_requests")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", requestId);

    if (error) {
        alert("承認に失敗しました：" + error.message);
        return;
    }
    renderFriendsPage();
}

export async function rejectFriendRequest(requestId) {
    const { error } = await supabase.from("friend_requests").delete().eq("id", requestId);
    if (error) {
        alert("拒否に失敗しました：" + error.message);
        return;
    }
    renderFriendsPage();
}

export async function cancelFriendRequest(requestId) {
    const { error } = await supabase.from("friend_requests").delete().eq("id", requestId);
    if (error) {
        alert("取り消しに失敗しました：" + error.message);
        return;
    }
    renderFriendsPage();
}

export async function removeFriend(requestId) {
    if (!confirm("フレンドを解除しますか？")) return;
    const { error } = await supabase.from("friend_requests").delete().eq("id", requestId);
    if (error) {
        alert("解除に失敗しました：" + error.message);
        return;
    }
    renderFriendsPage();
}