// === chat.js ===
import {
  db,
  ref,
  push,
  onValue
} from "./firebase.js";

import {
  showSpectatorUI,
  renderMyPanels
} from "./ui.js";

import {
  openActionMenu
} from "./actions.js";

import { renderMyPanels } from "./ui.js";
import { sendTradeRequest } from "./actions.js";

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const rawRoomId = params.get("room") || localStorage.getItem("roomId") || "defaultRoom";
  const playerName = params.get("name") || localStorage.getItem("playerName") || "名無し";
  const isDm = rawRoomId.includes("-dm-");
  const mainRoomId = isDm ? rawRoomId.split("-dm-")[0] : rawRoomId;
  const chatRoomId = rawRoomId;

  // ===== Firebase Refs =====
  const messagesRef    = ref(db, `rooms/${chatRoomId}/messages`);
  const playersListRef = ref(db, `rooms/${mainRoomId}/players`);
  const playersRef     = ref(playersListRef, playerName);

  // ===== DOM =====
  const msgInput     = document.getElementById("msgInput");
  const sendBtn      = document.getElementById("sendBtn");
  const messagesList = document.getElementById("messages");
  const chatBox      = document.getElementById("chatBox");

  // ===== メッセージ送信 =====
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      if (!msgInput) return;
      const text = msgInput.value.trim();
      if (!text) return;
      push(messagesRef, { text, name: playerName, time: Date.now() })
        .then(() => { msgInput.value = ""; })
        .catch(err => console.error("送信エラー:", err));
    });
  }
  if (msgInput) {
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (sendBtn) sendBtn.click();
      }
    });
  }

  // ===== メッセージ受信（LINE風表示）=====
  onValue(messagesRef, (snapshot) => {
    messagesList.innerHTML = ""; // 最新状態に同期
    const msgs = snapshot.val() || {};
    Object.values(msgs).forEach(msg => {
      const li = document.createElement("li");

      // システムメッセージ
      if (msg.name === "システム") {
        li.className = "system-message";
        li.textContent = msg.text;
        messagesList.appendChild(li);
        return;
      }

      // row 本体（self / other）
      const isSelf = msg.name === playerName;
      li.className = `msg-row ${isSelf ? "self" : "other"}`;

      // アイコン
      const icon = document.createElement("div");
      icon.className = "icon";
      icon.textContent = msg.name ? msg.name.charAt(0) : "?";
      icon.addEventListener("click", () => {
        openActionMenu(icon, msg);
      });

      // 名前＋吹き出しをまとめるコンテナ
      const msgContent = document.createElement("div");
      msgContent.className = "msg-content";

      const nameDiv = document.createElement("div");
      nameDiv.className = "msg-name";
      nameDiv.textContent = msg.name || "名無し";

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = msg.text;

      msgContent.appendChild(nameDiv);
      msgContent.appendChild(bubble);

      if (isSelf) {
        li.appendChild(msgContent);
        li.appendChild(icon);
      } else {
        li.appendChild(icon);
        li.appendChild(msgContent);
      }
      messagesList.appendChild(li);
    });

    // スクロールを一番下に
    requestAnimationFrame(() => {
      const container = chatBox || messagesList;
      container.scrollTop = container.scrollHeight;
    });
  });

  // ===== 自分の状態監視 =====
  onValue(playersRef, (snap) => {
    const me = snap.val() || {};
renderMyPanels(me, sendTradeRequest, toKatakana);
    // GMや死亡時は発言禁止
    if (me.role === "gm" || me.alive === false) {
      if (sendBtn) sendBtn.disabled = true;
      showSpectatorUI();
    } else {
      if (sendBtn) sendBtn.disabled = false;
    }

    // UI更新（役職表示やプロフィールパネル）
    renderMyPanels(me);
  });
});
