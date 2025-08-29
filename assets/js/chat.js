const db = firebase.database();

// プレイヤー情報を取得
const playerName = localStorage.getItem("playerName") || "名無し";
const roomId = localStorage.getItem("roomId") || "未設定";

// ルームIDを表示
document.getElementById("roomInfo").textContent = "ルームID: " + roomId;

// メッセージ参照（ルームごとに分ける）
const messagesRef = db.ref("rooms/" + roomId + "/messages");

const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const messagesList = document.getElementById("messages");

// メッセージ送信
sendBtn.addEventListener("click", () => {
  const text = msgInput.value;
  if (text.trim() !== "") {
    messagesRef.push({
      text: text,
      name: playerName,
      time: Date.now()
    });
    msgInput.value = "";
  }
});

// メッセージ受信
messagesRef.on("child_added", (snapshot) => {
  const msg = snapshot.val();

  const li = document.createElement("li");

  // アイコン（頭文字を丸で表示する例）
  const icon = document.createElement("div");
  icon.className = "message-icon";
  icon.textContent = msg.name ? msg.name.charAt(0) : "?";

  icon.addEventListener("click", () => {
  const confirmChat = confirm(`${msg.name} と個別チャットしますか？`);
  if (confirmChat) {
    // 個別ルームIDを生成して移動
    const myName = localStorage.getItem("playerName");
    const targetName = msg.name;

    // 2人の名前から一意なIDを生成（順番関係なし）
    const sorted = [myName, targetName].sort();
    const privateRoomId = roomId + "_" + sorted.join("_");

    window.open(`chat.html?room=${privateRoomId}&private=1`, "_blank");
  }
});

  // 名前
  const nameSpan = document.createElement("span");
  nameSpan.className = "message-name";
  nameSpan.textContent = msg.name || "名無し";

  // 本文
  const textSpan = document.createElement("span");
  textSpan.textContent = msg.text;

  li.appendChild(icon);
  li.appendChild(nameSpan);
  li.appendChild(textSpan);
  messagesList.appendChild(li);
});

// モーダル要素
const modal = document.getElementById("rulesModal");
const openBtn = document.getElementById("openRules");
const closeBtn = document.getElementById("closeRules");

// 「ルールを参照」をクリック
openBtn.addEventListener("click", () => {
  modal.style.display = "block";
});

// 「×」をクリック
closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
});

// 背景クリックでも閉じる
window.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
  }
});





