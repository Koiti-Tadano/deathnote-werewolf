document.addEventListener("DOMContentLoaded", () => {
  const db = firebase.database();
  const roomId = "defaultRoom"; // 実際は動的に取得するならURLから取ってもOK

  const nameInput = document.getElementById("playerNameInput");
  const joinBtn = document.getElementById("joinBtn");
  const joinAsGmBtn = document.getElementById("joinAsGmBtn");
  const playerListEl = document.getElementById("playerList");



// ランダムなルームID生成
  function generateRoomId(length = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < length; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

// ルーム作成
document.getElementById("createRoomBtn").addEventListener("click", () => {
  const playerName = document.getElementById("playerNameInput").value.trim();
  if (!playerName) {
    alert("プレイヤー名を入力してください！");
    return;
  }

  localStorage.setItem("playerName", playerName);
　
  const newRoomId = generateRoomId();

  firebase.database().ref("rooms/" + newRoomId).set({
    createdAt: Date.now()
  });

  document.getElementById("roomIdDisplay").textContent = newRoomId;
  document.getElementById("copyRoomIdBtn").style.display = "inline-block";

  // 作った本人を自動でチャットに入れる
  window.location.href = `chat.html?room=${newRoomId}&name=${encodeURIComponent(playerName)}`;
});


// ルーム参加
document.getElementById("joinRoomBtn").addEventListener("click", () => {
  const playerName = document.getElementById("playerNameInput").value.trim();
  const roomId = document.getElementById("joinRoomInput").value.trim();

  if (!playerName || !roomId) {
    alert("名前とルームIDを入力してください！");
    return;
  }

  localStorage.setItem("playerName", playerName);
　  window.location.href = `chat.html?room=${roomId}&name=${encodeURIComponent(playerName)}`;
});

// GMとして参加
document.getElementById("joinAsGmBtn").addEventListener("click", async () => {
  const gmSnap = await db.ref(`rooms/${roomId}/gm`).once("value");
  if (gmSnap.exists()) {
    alert("すでにGMが参加しています");
    return;
  }

  // GM登録
  await db.ref(`rooms/${roomId}/gm`).set({ id: "GM" });
  localStorage.setItem("playerName", "GM");
  localStorage.setItem("isGm", "true");
  window.location.href = `chat.html?room=${roomId}&name=GM`;
});
  
// コピー機能
document.getElementById("copyRoomIdBtn").addEventListener("click", () => {
  const roomId = document.getElementById("roomIdDisplay").textContent;
  if (roomId) {
    navigator.clipboard.writeText(roomId).then(() => {
      alert("ルームIDをコピーしました: " + roomId);
    });
  }
});
// --- プレイヤーリストの更新表示 ---
  db.ref(`rooms/${roomId}/players`).on("value", (snap) => {
    const players = snap.val() || {};
    playerListEl.innerHTML = "<h2>参加者一覧</h2><ul>" +
      Object.keys(players).map(p => `<li>${p}</li>`).join("") +
      "</ul>";
  });

  db.ref(`rooms/${roomId}/gm`).on("value", (snap) => {
    if (snap.exists()) {
      playerListEl.innerHTML += `<p><strong>GM参加中</strong></p>`;
    }
  });
});
