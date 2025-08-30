const db = firebase.database();

// URLからroomIdを取得
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room") || "defaultRoom"; 

// プレイヤー情報
const playerName = localStorage.getItem("playerName") || "名無し";

// ルームIDを表示（chat.htmlに <div id="roomInfo"></div> を用意しておく）
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
　  const self = localStorage.getItem("playerName");
  const other = msg.name;

  // 名前順にソートして一意にする
  const ids = [self, other].sort();
  const privateRoomId = roomId + "-" + ids[0] + "-" + ids[1];

  window.open("chat.html?room=" + privateRoomId, "_blank");
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





