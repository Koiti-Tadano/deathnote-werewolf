// assets/js/chat.js
const db = firebase.database();
const roomId = new URLSearchParams(window.location.search).get("room");
const messagesRef = db.ref("rooms/" + roomId + "/messages");

document.getElementById("sendBtn").addEventListener("click", () => {
  const text = document.getElementById("msgInput").value;
  if (text.trim()) {
    messagesRef.push({
      user: localStorage.getItem("playerName") || "名無し",
      text: text,
      time: Date.now()
    });
    document.getElementById("msgInput").value = "";
  }
});

messagesRef.on("child_added", (snapshot) => {
  const msg = snapshot.val();
  const li = document.createElement("li");
  li.textContent = `[${msg.user}] ${msg.text}`;
  document.getElementById("messages").appendChild(li);
});
