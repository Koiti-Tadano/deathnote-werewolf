const db = firebase.database();

// URLパラメータ取得
const params   = new URLSearchParams(window.location.search);
const roomId   = params.get("room") || "defaultRoom";
const urlName  = params.get("name");

// プレイヤー名の決定（URL > localStorage > 既定値）
let playerName = urlName || localStorage.getItem("playerName") || "名無し";
// URLで来たら上書き保存（次回以降も反映されるように）
if (urlName) localStorage.setItem("playerName", urlName);

// 表示（chat.html に #roomInfo と #playerInfo を用意しておくと便利）
const roomInfoEl   = document.getElementById("roomInfo");
const playerInfoEl = document.getElementById("playerInfo");
if (roomInfoEl)   roomInfoEl.textContent   = "ルームID: " + roomId;
if (playerInfoEl) playerInfoEl.textContent = "あなた: " + playerName;

// メッセージ参照
const messagesRef = db.ref("rooms/" + roomId + "/messages");

// 送信
sendBtn.addEventListener("click", () => {
  const text = msgInput.value;
  if (text.trim() === "") return;
  messagesRef.push({ text, name: playerName, time: Date.now() });
  msgInput.value = "";
});

// 受信（省略部分そのままでOK）

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





