// === chat.js ===
import {
  db,
  ref,
  push,
  set,
  onValue,
  child,
  get
} from "./firebase.js";

import {
  showSpectatorUI,
  renderMyPanels,
  updateRoleDisplay,
  updatePhaseUI
} from "./ui.js";

import {
  openActionMenu,
  sendTradeRequest
} from "./actions.js";

import { 
  toKatakana,
  assignRolesAndProfiles,
  startPhaseInDB,
  PHASE_LENGTHS
} from "./game.js";

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const rawRoomId = params.get("room") || localStorage.getItem("roomId") || "defaultRoom";
  const playerName = params.get("name") || localStorage.getItem("playerName") || "名無し";
  const isDm = rawRoomId.includes("-dm-");
  const mainRoomId = isDm ? rawRoomId.split("-dm-")[0] : rawRoomId;
  const chatRoomId = rawRoomId;
  // ===== 自分の状態監視 =====
  let me = {};
  let currentPhase = "day";
  onValue(playersRef, (snap) => {
    me = snap.val() || {};
    if (me.role === "gm" || me.alive === false) {
      if (sendBtn) sendBtn.disabled = true;
      showSpectatorUI();
    } else {
      if (sendBtn) sendBtn.disabled = false;
    }
    renderMyPanels(me, sendTradeRequest, toKatakana);
    updateRoleDisplay(me.role);
  });
});
  
  // ===== Firebase Refs =====
  const messagesRef    = ref(db, `rooms/${chatRoomId}/messages`);
  const playersListRef = ref(db, `rooms/${mainRoomId}/players`);
  const playersRef     = ref(db, `rooms/${mainRoomId}/players/${playerName}`);
  const stateRef       = ref(db, `rooms/${mainRoomId}/state`);
  const actionsRef     = ref(db, `rooms/${mainRoomId}/actions`);

  // ===== DOM =====
  const msgInput     = document.getElementById("msgInput");
  const sendBtn      = document.getElementById("sendBtn");
  const messagesList = document.getElementById("messages");
  const chatBox      = document.getElementById("chatBox");
  const actionBtn    = document.getElementById("actionDoneBtn");
  const actionStatus = document.getElementById("actionStatus");

  // ===== フェーズ表示 / タイマー =====
  onValue(stateRef, (snap) => {
    const state = snap.val() || {};
    const { phase, day, phaseEndAt, phasePaused } = state;
    let timeLeft = null;
    if (phaseEndAt) {
      timeLeft = Math.max(0, Math.floor((phaseEndAt - Date.now()) / 1000));
    }
    updatePhaseUI(phase, day, timeLeft, phasePaused);
  });


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

      if (msg.name === "システム") {
        li.className = "system-message";
        li.textContent = msg.text;
        messagesList.appendChild(li);
        return;
      }

      const isSelf = msg.name === playerName;
      li.className = `msg-row ${isSelf ? "self" : "other"}`;

      const icon = document.createElement("div");
      icon.className = "icon";
      icon.textContent = msg.name ? msg.name.charAt(0) : "?";

      icon.addEventListener("click", () => {
        openActionMenu(icon, msg, {
          playerName,
          myRole: me.role,   // ← 下の onValue(playersRef) で更新
          currentPhase,      // ← stateRef 監視で更新して渡す
          mainRoomId,
          playersListRef,
          usedShinigamiEye: { value: false }
        });
      });

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

    requestAnimationFrame(() => {
      const container = chatBox || messagesList;
      container.scrollTop = container.scrollHeight;
    });
  });

  // ===== 自分の状態監視 =====
  let me = {};
  let currentPhase = "day";
  onValue(playersRef, (snap) => {
    me = snap.val() || {};
    if (me.role === "gm" || me.alive === false) {
      if (sendBtn) sendBtn.disabled = true;
      showSpectatorUI();
    } else {
      if (sendBtn) sendBtn.disabled = false;
    }
    renderMyPanels(me, sendTradeRequest, toKatakana);
    updateRoleDisplay(me.role);
  });
});

  // GM のときだけ GM 操作用ボタンを表示
  const gmControls = document.getElementById("gmControls");
  if (me.role === "gm") {
    gmControls.style.display = "block";
  } else {
    gmControls.style.display = "none";
  }

  // GM の開始ボタン処理
  const startBtn = document.getElementById("startGameBtn");
  if (startBtn) {
    startBtn.onclick = async () => {
      try {
        await assignRolesAndProfiles(mainRoomId);
        await startPhaseInDB("morning", 1, PHASE_LENGTHS.morning, mainRoomId);
        alert("ゲームを開始しました！");
      } catch (e) {
        console.error("ゲーム開始エラー:", e);
        alert("ゲーム開始に失敗しました");
      }
    };
  }

  // GMや死亡時は発言禁止
  if (me.role === "gm" || me.alive === false) {
    if (sendBtn) sendBtn.disabled = true;
    showSpectatorUI();
  } else {
    if (sendBtn) sendBtn.disabled = false;
  }

  // UI更新
  renderMyPanels(me, sendTradeRequest, toKatakana);
  updateRoleDisplay(me.role);
});
