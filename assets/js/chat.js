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
  const playersListRef = db.ref(`rooms/${roomId}/players`);

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

  // --- GM 用 ---
  const isGm = localStorage.getItem("isGm") === "true";

  if (isGm) {
    document.getElementById("gmControls").style.display = "block";

    document.getElementById("startGameBtn").addEventListener("click", async () => {
      const snap = await playersListRef.once("value");
      const players = snap.val() || {};
      const playerCount = Object.keys(players).length;

      if (playerCount < 8) {
        alert("8人揃っていません");
        return;
      }

      // 役職を割り当て
      assignRoles(roomId);

      // フェーズを morning に初期化
      startPhaseInDB("morning", 1, PHASE_LENGTHS.morning);
    });
  }

  // --- アクションメニュー（略、あなたのコードそのまま） ---
  function openActionMenu(anchorEl, msg) {
    // ...（省略: 個別チャット/キル/死神の目/投票/探偵）
  }

  // ======================================================
  // Firebase ベースのフェーズ管理 & 人数制御
  // ======================================================
  const PHASE_ORDER = ["morning", "day", "evening", "night"];
  const PHASE_LENGTHS = {
    morning: 60, day: 6 * 60, evening: 2 * 60, night: 2 * 60
  };
  const REQUIRED_PLAYERS = 8;

  let localTimerInterval = null;
  let prevPlayerKeys = [];

  // フェーズ開始（DBに保存）
  function startPhaseInDB(phase, day, durationSec) {
    const endAt = Date.now() + durationSec * 1000;
    actionsRef.set({});
    return stateRef.update({
      phase, day,
      phaseEndAt: endAt,
      phasePaused: false,
      pausedRemaining: null
    });
  }

  async function nextPhaseInDB(currentPhase, currentDay) {
    const idx = PHASE_ORDER.indexOf(currentPhase);
    const nextIdx = (idx + 1) % PHASE_ORDER.length;
    const nextPhase = PHASE_ORDER[nextIdx];
    const nextDay = (nextIdx === 0) ? currentDay + 1 : currentDay;
    await startPhaseInDB(nextPhase, nextDay, PHASE_LENGTHS[nextPhase]);
    messagesRef.push({ text: `-- ${nextDay}日目 ${nextPhase} 開始 --`, name: "システム", time: Date.now() });
  }

  // state監視
  stateRef.on("value", (snap) => {
    const s = snap.val() || {};
    const phase = s.phase || "day";
    const day = s.day || 1;
    const phaseEndAt = s.phaseEndAt || null;
    const phasePaused = s.phasePaused || false;
    const pausedRemaining = s.pausedRemaining || null;

    const phaseLabel = { morning: "朝", day: "昼", evening: "夕方", night: "夜" }[phase] || phase;
    if (phaseInfoEl) phaseInfoEl.textContent = `Day ${day} — ${phaseLabel}`;

    if (localTimerInterval) clearInterval(localTimerInterval);
    if (phasePaused) {
      if (phaseTimerEl) phaseTimerEl.textContent = "一時停止中（人数不足）";
      return;
    }
    if (!phaseEndAt) {
      if (phaseTimerEl) phaseTimerEl.textContent = "残り --";
      return;
    }

    function updateLocalTimer() {
      const left = Math.max(0, Math.floor((phaseEndAt - Date.now()) / 1000));
      if (phaseTimerEl) phaseTimerEl.textContent = `残り ${left}s`;
      if (left <= 0) {
        clearInterval(localTimerInterval);
        if (isGm) {
          stateRef.once("value").then(stSnap => {
            const st = stSnap.val() || {};
            if (!st.phasePaused && st.phaseEndAt && Date.now() >= st.phaseEndAt) {
              nextPhaseInDB(st.phase, st.day);
            }
          });
        }
      }
    }
    updateLocalTimer();
    localTimerInterval = setInterval(updateLocalTimer, 500);
  });

  // プレイヤー人数監視
  playersListRef.on("value", (snap) => {
    const obj = snap.val() || {};
    const keys = Object.keys(obj);
    const count = keys.length;

    // 入退室ログ
    const left = prevPlayerKeys.filter(k => !keys.includes(k));
    const joined = keys.filter(k => !prevPlayerKeys.includes(k));
    prevPlayerKeys = keys.slice();
    left.forEach(name => messagesRef.push({ text: `${name} が退室しました。`, name: "システム", time: Date.now() }));
    joined.forEach(name => messagesRef.push({ text: `${name} が入室しました。`, name: "システム", time: Date.now() }));

    // 人数不足チェック
    stateRef.once("value").then(stSnap => {
      const st = stSnap.val() || {};
      if (count < REQUIRED_PLAYERS) {
        if (!st.phasePaused) {
          const endAt = st.phaseEndAt || null;
          let remaining = null;
          if (endAt) remaining = Math.max(0, Math.floor((endAt - Date.now()) / 1000));
          stateRef.update({ phasePaused: true, pausedRemaining: remaining, phaseEndAt: null });
          messagesRef.push({ text: `人数が ${count} 人になったため一時停止。`, name: "システム", time: Date.now() });
        }
      } else {
        if (st.phasePaused && isGm) {
          const rem = st.pausedRemaining;
          const resume = (rem != null) ? rem : PHASE_LENGTHS[st.phase];
          const newEndAt = Date.now() + resume * 1000;
          stateRef.update({ phasePaused: false, phaseEndAt: newEndAt, pausedRemaining: null });
          messagesRef.push({ text: `人数が揃いました。ゲームを再開します。`, name: "システム", time: Date.now() });
        }
      }
    });
  });

  // --- 行動完了ボタン ---
  actionBtn.addEventListener("click", () => {
    actionsRef.child(playerName).set(true);
    actionBtn.style.display = "none";
    actionStatus.style.display = "block";
  });

  // --- 全員の行動完了を監視 ---
  actionsRef.on("value", async (snap) => {
    const actions = snap.val() || {};
    const playersSnap = await playersListRef.once("value");
    const players = playersSnap.val() || {};
    const total = Object.keys(players).length;
    const done  = Object.keys(actions).length;
    if (total > 0 && done >= total && isGm) {
      const st = (await stateRef.once("value")).val() || {};
      nextPhaseInDB(st.phase, st.day);
    }
  });

}); // DOMContentLoaded end
