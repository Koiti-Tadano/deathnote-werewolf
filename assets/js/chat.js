// assets/js/chat.js
const db = firebase.database();
const messagesRef = db.ref("messages");

const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const messagesList = document.getElementById("messages");

// メッセージ送信
sendBtn.addEventListener("click", () => {
  const text = msgInput.value;
  if (text.trim() !== "") {
    messagesRef.push({
      text: text,
      time: Date.now()
    });
    msgInput.value = "";
  }
});

// メッセージ受信
messagesRef.on("child_added", (snapshot) => {
  const msg = snapshot.val();
  const li = document.createElement("li");
  li.textContent = msg.text;
  messagesList.appendChild(li);
});
