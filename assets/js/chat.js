// assets/js/chat.js
document.addEventListener("DOMContentLoaded", () => {
  // --- URL / localStorage から情報取得 ---
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room") || localStorage.getItem("roomId") || "defaultRoom";
  const playerName = params.get("name") || localStorage.getItem("playerName") || "名無し";

  localStorage.setItem("roomId", roomId);
  localStorage.setItem("playerName", playerName);

  // --- Firebase 初期化確認 ---
  if (typeof firebase === "undefined") {
    alert("Firebase が読み込まれていません！");
    return;
  }
  const db = firebase.database();

  // --- DB 参照 ---
  const messagesRef = db.ref(`rooms/${roomId}/messages`);
  const stateRef    = db.ref(`rooms/${roomId}/state`);
  const actionsRef  = db.ref(`rooms/${roomId}/actions`);
  const playersRef  = db.ref(`rooms/${roomId}/players/${playerName}`);

  // --- プレイヤー参加を記録 ---
  playersRef.set({ joinedAt: Date.now() });
  playersRef.onDisconnect().remove();

  // --- DOM 要素 ---
  const msgInput     = document.getElementById("msgInput");
  const sendBtn      = document.getElementById("sendBtn");
  const messagesList = document.getElementById("messages");
  const phaseInfoEl  = document.getElementById("phaseInfo");
  const phaseTimerEl = document.getElementById("phaseTimer");
  const actionBtn    = document.getElementById("actionDoneBtn");
  const actionStatus = document.getElementById("actionStatus");
  const roomInfoEl   = document.getElementById("roomInfo");
  const playerInfoEl = document.getElementById("playerInfo");

  if (roomInfoEl) roomInfoEl.textContent = `ルームID: ${roomId}`;
  if (playerInfoEl) playerInfoEl.textContent = `あなた: ${playerName}`;

  // --- メッセージ送信 ---
  sendBtn.addEventListener("click", () => {
    const text = msgInput.value.trim();
    if (!text) return;
    messagesRef.push({
      text,
      name: playerName,
      time: Date.now()
    }).then(() => {
      msgInput.value = "";
    }).catch(err => {
      console.error("送信エラー:", err);
    });
  });

  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // --- メッセージ受信 ---
  messagesRef.on("child_added", (snap) => {
    const msg = snap.val();
    const li = document.createElement("li");
    li.className = "message-item";

    const icon = document.createElement("div");
    icon.className = "message-icon";
    icon.textContent = msg.name ? msg.name.charAt(0) : "?";

    icon.addEventListener("click", () => {
      openActionMenu(icon, msg);
    });

    const nameSpan = document.createElement("span");
    nameSpan.className = "message-name";
    nameSpan.textContent = msg.name || "名無し";

    const textSpan = document.createElement("span");
    textSpan.className = "message-text";
    textSpan.textContent = msg.text;

    li.appendChild(icon);
    li.appendChild(nameSpan);
    li.appendChild(textSpan);
    messagesList.appendChild(li);

    messagesList.scrollTop = messagesList.scrollHeight;
  });

  // --- アクションメニュー ---
  function openActionMenu(anchorEl, msg) {
    const prev = document.querySelector(".action-menu");
    if (prev) prev.remove();

    const menu = document.createElement("div");
    menu.className = "action-menu";

    // 個別チャット（例）
    const btnDM = document.createElement("button");
    btnDM.textContent = "個別チャット";
    btnDM.onclick = () => {
      const ids = [playerName, msg.name].sort();
      const privateRoomId = `${roomId}-dm-${ids[0]}-${ids[1]}`;
      window.open(`chat.html?room=${privateRoomId}&name=${encodeURIComponent(playerName)}`, "_blank");
      menu.remove();
    };
    menu.appendChild(btnDM);

    anchorEl.parentElement.appendChild(menu);
  }

  // --- フェーズ管理 ---
  const PHASE_ORDER = ["morning", "day", "evening", "night"];
  const PHASE_LENGTHS = {
    morning: 60,       // 1分
    day: 6 * 60,       // 6分
    evening: 2 * 60,   // 2分
    night: 2 * 60      // 2分
  };

  let currentPhaseIndex = 0;
  let currentDay = 1;
  let phaseTimer = null;

  function startPhase(phase, day) {
    const length = PHASE_LENGTHS[phase];
    const phaseLabel = { morning:"朝", day:"昼", evening:"夕方", night:"夜" }[phase];

    if (phaseInfoEl) phaseInfoEl.textContent = `Day ${day} — ${phaseLabel}`;

    // システムメッセージ
    if (phase === "morning") {
      messagesRef.push({ text:`--- ${day}日目が始まりました ---`, name:"システム", time:Date.now() });
      if (day === 1) {
        messagesRef.push({ text:"初日はルール説明＆自己紹介をしてください。", name:"システム", time:Date.now() });
      }
    }

    // 行動完了ボタンを表示
    actionBtn.style.display = "inline-block";
    actionStatus.style.display = "none";
    actionBtn.disabled = false;
    actionBtn.textContent = (phase === "morning") ? "◯日目を始める" : "行動完了";

    // タイマー
    if (phaseTimer) clearInterval(phaseTimer);
    if (length > 0) {
      let endTime = Date.now() + length * 1000;
      function updateTimer() {
        const left = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        if (phaseTimerEl) phaseTimerEl.textContent = `残り ${left}s`;
        if (left <= 0) {
          clearInterval(phaseTimer);
          nextPhase();
        }
      }
      updateTimer();
      phaseTimer = setInterval(updateTimer, 500);
    } else {
      if (phaseTimerEl) phaseTimerEl.textContent = "残り 0s";
      nextPhase();
    }

    // 行動状況リセット
    actionsRef.set({});
  }

  function nextPhase() {
    currentPhaseIndex = (currentPhaseIndex + 1) % PHASE_ORDER.length;
    if (currentPhaseIndex === 0) currentDay++;
    startPhase(PHASE_ORDER[currentPhaseIndex], currentDay);
  }

  startPhase(PHASE_ORDER[currentPhaseIndex], currentDay);

  // --- 行動完了ボタン ---
  actionBtn.addEventListener("click", () => {
    actionsRef.child(playerName).set(true);
    actionBtn.style.display = "none";
    actionStatus.style.display = "block";
  });

  // --- 全員の行動完了を監視 ---
  actionsRef.on("value", async (snap) => {
    const actions = snap.val() || {};
    const playersSnap = await db.ref(`rooms/${roomId}/players`).once("value");
    const players = playersSnap.val() || {};
    const total = Object.keys(players).length;
    const done  = Object.keys(actions).length;
    if (total > 0 && done >= total) {
      nextPhase();
    }
  });

}); // DOMContentLoaded end
