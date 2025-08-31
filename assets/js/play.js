document.addEventListener("DOMContentLoaded", () => {
  const db = firebase.database();

  const nameInput = document.getElementById("playerNameInput");
  const joinBtn = document.getElementById("joinBtn");
  const joinAsGmBtn = document.getElementById("joinAsGmBtn");
  const createRoomBtn = document.getElementById("createRoomBtn");
  const joinRoomBtn = document.getElementById("joinRoomBtn");
  const roomIdDisplay = document.getElementById("roomIdDisplay");
  const copyRoomIdBtn = document.getElementById("copyRoomIdBtn");
  const joinRoomInput = document.getElementById("joinRoomInput");
  const playerListEl = document.getElementById("playerList");

  let currentRoomId = null; // ★ここに現在のルームIDを保持

  // --- ランダムなルームID生成 ---
  function generateRoomId(length = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < length; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  // --- ルーム作成 ---
  createRoomBtn.addEventListener("click", () => {
    const playerName = nameInput.value.trim();
    if (!playerName) {
      alert("プレイヤー名を入力してください！");
      return;
    }

    localStorage.setItem("playerName", playerName);
    currentRoomId = generateRoomId();

    db.ref("rooms/" + currentRoomId).set({
      createdAt: Date.now()
    });

    roomIdDisplay.textContent = currentRoomId;
    copyRoomIdBtn.style.display = "inline-block";

    // 作った本人を自動でチャットに入れる
    window.location.href = `chat.html?room=${currentRoomId}&name=${encodeURIComponent(playerName)}`;
  });

  // --- ルーム参加 ---
  joinRoomBtn.addEventListener("click", () => {
    const playerName = nameInput.value.trim();
    const roomId = joinRoomInput.value.trim();

    if (!playerName || !roomId) {
      alert("名前とルームIDを入力してください！");
      return;
    }

    localStorage.setItem("playerName", playerName);
    currentRoomId = roomId;

    window.location.href = `chat.html?room=${roomId}&name=${encodeURIComponent(playerName)}`;
  });

  // --- GMとして参加 ---
  joinAsGmBtn.addEventListener("click", async () => {
    const roomId = joinRoomInput.value.trim() || currentRoomId;
    if (!roomId) {
      alert("先にルームIDを入力するか作成してください");
      return;
    }

    const gmSnap = await db.ref(`rooms/${roomId}/gm`).once("value");
    if (gmSnap.exists()) {
      alert("すでにGMが参加しています");
      return;
    }

    await db.ref(`rooms/${roomId}/gm`).set({ id: "GM" });
    localStorage.setItem("playerName", "GM");
    localStorage.setItem("isGm", "true");
    currentRoomId = roomId;

    window.location.href = `chat.html?room=${roomId}&name=GM`;
  });

  // --- コピー機能 ---
  copyRoomIdBtn.addEventListener("click", () => {
    if (currentRoomId) {
      navigator.clipboard.writeText(currentRoomId).then(() => {
        alert("ルームIDをコピーしました: " + currentRoomId);
      });
    }
  });

  // --- プレイヤーリストの更新表示 ---
  // （currentRoomId が確定したら呼び出すようにするのが理想）
});
