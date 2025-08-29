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





<script>
document.getElementById("sendBtn").addEventListener("click", async () => {
  const roomId = localStorage.getItem("roomId");
  const playerName = localStorage.getItem("playerName") || "名無し";
  const text = document.getElementById("msgInput").value.trim();

  if (!text) {
    alert("メッセージを入力してください");
    return;
  }

  const messagesRef = firebase.database().ref("rooms/" + roomId + "/messages");

  try {
    // Firebaseに書き込む
    await messagesRef.push({
      name: playerName,
      text: text,
      time: Date.now()
    });

    console.log("✅ Firebaseに書き込み成功！");

    // 書き込んだ内容をすぐに確認
    messagesRef.once('value').then(snapshot => {
      console.log("💬 ルームの現在のメッセージ一覧：", snapshot.val());
    });

    // 入力欄を空にする
    document.getElementById("msgInput").value = "";
  } catch (err) {
    console.error("❌ Firebase書き込みに失敗：", err);
    alert("書き込み失敗！コンソールを確認してください。");
  }
});
</script>
