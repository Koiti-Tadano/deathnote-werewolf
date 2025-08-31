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
  const messagesRef    = db.ref(`rooms/${roomId}/messages`);
  const stateRef       = db.ref(`rooms/${roomId}/state`);
  const actionsRef     = db.ref(`rooms/${roomId}/actions`);
  const playersRef     = db.ref(`rooms/${roomId}/players/${playerName}`);
  const playersListRef = db.ref(`rooms/${roomId}/players`);

  // --- プレイヤー参加を記録 ---
  playersRef.set({ joinedAt: Date.now(), alive: true });
  playersRef.onDisconnect().remove();
  
// --- 自分の状態監視（alive判定） ---
playersRef.on("value", (snap) => {
  const me = snap.val();
  if (me && me.alive === false) {
    // 発言禁止
    if (sendBtn) sendBtn.disabled = true;
    if (actionBtn) actionBtn.disabled = true;

    // 観戦モード表示
    const spectateEl = document.getElementById("spectateArea") || document.createElement("div");
    spectateEl.id = "spectateArea";
    spectateEl.innerHTML = "<h3>会話を覗き見る</h3>";

    // 全てのルームを一覧表示
    db.ref(`rooms/${roomId}`).once("value").then((roomSnap) => {
      const roomData = roomSnap.val() || {};
      const links = [];

      // 全体チャット
      links.push(roomId);

      // 個別チャットなど（roomIdで始まる全ルームを抽出）
      Object.keys(roomData).forEach(key => {
        if (key.startsWith(roomId + "-")) {
          links.push(key);
        }
      });

      spectateEl.innerHTML += links.map(id =>
        `<div><a href="chat.html?room=${id}&name=${encodeURIComponent(playerName)}" target="_blank">${id}</a></div>`
      ).join("");

      document.body.appendChild(spectateEl);
    });
  }
});
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
      // const snap = await playersListRef.once("value");
      // const players = snap.val() || {};
      // const playerCount = Object.keys(players).length;

      // if (playerCount < 8) {
      //   alert("8人揃っていません");
      //   return;
      // }

      // 役職を割り当て
      await assignRoles(roomId);

      // フェーズを morning に初期化
      startPhaseInDB("morning", 1, PHASE_LENGTHS.morning);
    });
  }

  // --- 役職割り当て関数 ---
  async function assignRoles(roomId) {
    const roles = [
      "wolf",       // 人狼1
      "madman",     // 狂人1
      "detective",  // 探偵1
      "villager", "villager", "villager", "villager" // 村人4
    ];

    const snap = await firebase.database().ref(`rooms/${roomId}/players`).once("value");
    const players = snap.val() || {};
    const playerNames = Object.keys(players);

    // if (playerNames.length !== roles.length) {
    //   alert(`役職の数(${roles.length})とプレイヤー数(${playerNames.length})が一致しません`);
    //   return;
    // }

    // シャッフル
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    playerNames.forEach((name, idx) => {
      firebase.database().ref(`rooms/${roomId}/players/${name}/role`).set(roles[idx] || "villager");
    });

    firebase.database().ref(`rooms/${roomId}/messages`).push({
      text: "役職が割り当てられました。",
      name: "システム",
      time: Date.now()
    });
  }

  // --- アクションメニュー ---
  let role = null;
  let currentPhase = "day";
  let usedShinigamiEye = false;

  function openActionMenu(anchorEl, msg) {
    const prev = document.querySelector(".action-menu");
    if (prev) prev.remove();

    const menu = document.createElement("div");
    menu.className = "action-menu";

    // 個別チャット
    const btnDM = document.createElement("button");
    btnDM.textContent = "個別チャット";
    btnDM.onclick = () => {
      const ids = [playerName, msg.name].sort();
      const privateRoomId = `${roomId}-dm-${ids[0]}-${ids[1]}`;
      window.open(`chat.html?room=${privateRoomId}&name=${encodeURIComponent(playerName)}`, "_blank");
      menu.remove();
    };
    menu.appendChild(btnDM);

    if (role === "wolf" && currentPhase === "night") {
      const btnKill = document.createElement("button");
      btnKill.textContent = "キル";
      btnKill.onclick = () => {
        const target = msg.name;
        const input = prompt(`${target}のフルネームを入力してください`);
        if (input === target) {
          db.ref(`rooms/${roomId}/players/${target}`).update({ alive: false });
          alert("キル成功！");
        } else {
          alert("キル失敗（名前が一致しません）");
        }
        menu.remove();
      };
      menu.appendChild(btnKill);
    }

    if (role === "wolf" && currentPhase === "night" && !usedShinigamiEye) {
      const btnEye = document.createElement("button");
      btnEye.textContent = "死神の目";
      btnEye.onclick = () => {
        db.ref(`rooms/${roomId}/shinigami/${playerName}`).set(msg.name);
        alert(`${msg.name} のフルネームは: ${msg.name}`);
        usedShinigamiEye = true;
        menu.remove();
      };
      menu.appendChild(btnEye);
    }

    if (currentPhase === "evening") {
      const btnVote = document.createElement("button");
      btnVote.textContent = "投票する";
      btnVote.onclick = () => {
        db.ref(`rooms/${roomId}/votes/${playerName}`).set(msg.name);
        alert(`あなたは ${msg.name} に投票しました`);
        menu.remove();
      };
      menu.appendChild(btnVote);
    }

if (role === "detective" && currentPhase === "night") {
  const btnDetective = document.createElement("button");
  btnDetective.textContent = "探偵";
  btnDetective.onclick = () => {
    const gmRoomId = `${roomId}-gm-${playerName}`;
    window.open(`chat.html?room=${gmRoomId}&name=${encodeURIComponent(playerName)}`, "_blank");
    menu.remove();
  };
  menu.appendChild(btnDetective);
}
  // ======================================================
  // Firebase ベースのフェーズ管理
  // ======================================================
  const PHASE_ORDER = ["morning", "day", "evening", "night"];
  const PHASE_LENGTHS = { morning: 60, day: 6 * 60, evening: 2 * 60, night: 2 * 60 };
  // const REQUIRED_PLAYERS = 8;

  let localTimerInterval = null;
  let prevPlayerKeys = [];

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

  stateRef.on("value", (snap) => {
    const s = snap.val() || {};
    const phase = s.phase || "day";
    const day = s.day || 1;
    const phaseEndAt = s.phaseEndAt || null;
    const phasePaused = s.phasePaused || false;
    const pausedRemaining = s.pausedRemaining || null;

    currentPhase = phase;

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

  // --- 行動完了ボタン ---
  actionBtn.addEventListener("click", () => {
    actionsRef.child(playerName).set(true);
    actionBtn.style.display = "none";
    actionStatus.style.display = "block";
  });

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
