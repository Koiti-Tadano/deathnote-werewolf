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

const isGm = localStorage.getItem("isGm") === "true";

// GM専用UIを表示
if (isGm) {
  document.getElementById("gmControls").style.display = "block";

  // ゲーム開始ボタン
  document.getElementById("startGameBtn").addEventListener("click", async () => {
    // プレイヤー数チェック
    const snap = await db.ref(`rooms/${roomId}/players`).once("value");
    const players = snap.val() || {};
    const playerCount = Object.keys(players).length;

    if (playerCount + 1 < 8) { // +1 はGM
      alert("8人揃っていません");
      return;
    }

    // 役職を割り当て
    assignRoles(roomId);

    // フェーズを morning に初期化
    db.ref(`rooms/${roomId}/state`).set({
      currentPhase: "morning",
      currentDay: 1,
      phaseStart: Date.now()
    });
  });
}
  
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
if (role === "wolf" && currentPhase === "night") {
  const btnKill = document.createElement("button");
  btnKill.textContent = "キル";
  btnKill.onclick = () => {
    const target = msg.name;
    const input = prompt(`${target}のフルネームを入力してください`);
    if (input === target) {
      db.ref(`rooms/${roomId}/kills/${playerName}`).set(target);
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

const btnDetective = document.createElement("button");
btnDetective.textContent = "探偵";
btnDetective.onclick = () => {
  const gmRoomId = `${roomId}-gm-${playerName}`;
  window.open(`chat.html?room=${gmRoomId}&name=${encodeURIComponent(playerName)}`, "_blank");
  menu.remove();
};
menu.appendChild(btnDetective);
    anchorEl.parentElement.appendChild(menu);
  }

// -----------------------------
// Firebaseベースのフェーズ管理 & 人数制御
// -----------------------------

// 必要な参照（既に db, messagesRef がある前提）
const stateRef = db.ref(`rooms/${roomId}/state`);
const actionsRef = db.ref(`rooms/${roomId}/actions`);
const playersListRef = db.ref(`rooms/${roomId}/players`);

// 設定
const REQUIRED_PLAYERS = 8; // GM含めて8人必要（変更可）
const PHASE_ORDER = ["morning", "day", "evening", "night"];
const PHASE_LENGTHS = { morning: 60, day: 6 * 60, evening: 2 * 60, night: 2 * 60 };

// ローカル用タイマーID
let localTimerInterval = null;

// ヘルパー：GM 判定（ローカルストレージベース）
const isGm = localStorage.getItem("isGm") === "true";

// --- フェーズ開始をDBに保存する関数（GMが呼ぶ） ---
function startPhaseInDB(phase, day, durationSec) {
  const endAt = Date.now() + durationSec * 1000;
  return stateRef.update({
    phase: phase,
    day: day,
    phaseEndAt: endAt,
    phasePaused: false,
    pausedRemaining: null
  });
}

// --- 次フェーズ（GMが呼ぶ） ---
async function nextPhaseInDB(currentPhase, currentDay) {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  const nextIdx = (idx + 1) % PHASE_ORDER.length;
  const nextPhase = PHASE_ORDER[nextIdx];
  const nextDay = (nextIdx === 0) ? (currentDay + 1) : currentDay;
  const duration = PHASE_LENGTHS[nextPhase] || 60;
  await startPhaseInDB(nextPhase, nextDay, duration);
  // システムメッセージ（任意）
  messagesRef.push({ text: `-- ${nextDay}日目 ${nextPhase} が始まりました --`, name: "システム", time: Date.now() });
}

// --- state の監視（全クライアント） ---
// state: { phase, day, phaseEndAt, phasePaused, pausedRemaining }
stateRef.on("value", (snap) => {
  const s = snap.val() || {};
  const phase = s.phase || "day";
  const day = s.day || 1;
  const phaseEndAt = s.phaseEndAt || null;
  const phasePaused = s.phasePaused || false;
  const pausedRemaining = s.pausedRemaining || null;

  // UI 更新
  const phaseLabel = { morning: "朝", day: "昼", evening: "夕方", night: "夜" }[phase] || phase;
  if (phaseInfoEl) phaseInfoEl.textContent = `Day ${day} — ${phaseLabel}`;

  // タイマー更新処理
  if (localTimerInterval) {
    clearInterval(localTimerInterval);
    localTimerInterval = null;
  }

  if (phasePaused) {
    if (phaseTimerEl) phaseTimerEl.textContent = "一時停止中（人数不足）";
    return;
  }

  if (!phaseEndAt) {
    if (phaseTimerEl) phaseTimerEl.textContent = "残り --";
    return;
  }

  // カウントダウン開始（ローカルで描画）
  function updateLocalTimer() {
    const left = Math.max(0, Math.floor((phaseEndAt - Date.now()) / 1000));
    if (phaseTimerEl) phaseTimerEl.textContent = `残り ${left}s`;
    if (left <= 0) {
      clearInterval(localTimerInterval);
      localTimerInterval = null;
      // フェーズ切替は GM のみが DB に書き込む
      if (isGm) {
        // 防止のため少しだけ待って DB の最終状態を確認してから次へ
        stateRef.once("value").then(stateSnap => {
          const st = stateSnap.val() || {};
          // まだ終了していない場合だけ次へ
          const endAtNow = st.phaseEndAt || 0;
          if (!st.phasePaused && endAtNow && Date.now() >= endAtNow) {
            nextPhaseInDB(st.phase || phase, st.day || day);
          }
        });
      } else {
        // 非GMは待機表示
        if (phaseTimerEl) phaseTimerEl.textContent = "フェーズ終了待ち（GMが進行）";
      }
    }
  }

  updateLocalTimer();
  localTimerInterval = setInterval(updateLocalTimer, 500);
});

// --- プレイヤー人数監視（全クライアント） ---
// 目的：人数が足りなくなったら一時停止、復帰は GM が再開
let prevPlayerKeys = [];

playersListRef.on("value", (snap) => {
  const obj = snap.val() || {};
  const keys = Object.keys(obj);
  const count = keys.length;

  // 入退室ログの生成（差分）
  const left = prevPlayerKeys.filter(k => !keys.includes(k));
  const joined = keys.filter(k => !prevPlayerKeys.includes(k));
  prevPlayerKeys = keys.slice(); // 保存

  // 退室ログ
  left.forEach(name => {
    messagesRef.push({ text: `${name} が退室しました。`, name: "システム", time: Date.now() });
  });
  // 入室ログ（あれば）
  joined.forEach(name => {
    messagesRef.push({ text: `${name} が入室しました。`, name: "システム", time: Date.now() });
  });

  // 人数チェック
  stateRef.once("value").then(stSnap => {
    const st = stSnap.val() || {};
    // 少ないので一時停止する（まだ paused でなければ）
    if (count < REQUIRED_PLAYERS) {
      if (!st.phasePaused) {
        // compute remaining seconds if we have phaseEndAt
        const endAt = st.phaseEndAt || null;
        let remaining = null;
        if (endAt) remaining = Math.max(0, Math.floor((endAt - Date.now()) / 1000));
        stateRef.update({ phasePaused: true, pausedRemaining: remaining, phaseEndAt: null });
        messagesRef.push({ text: `人数が ${count} 人になったためゲームを一時停止します。`, name: "システム", time: Date.now() });
      }
    } else {
      // 人数が揃っている -> 再開処理（GMのみ行う）
      if (st.phasePaused) {
        if (isGm) {
          // 再開：もし pausedRemaining があればそれを使う、無ければ既定長を使う
          const pausedRem = st.pausedRemaining;
          const phaseName = st.phase || "day";
          const resumeDuration = (pausedRem != null) ? pausedRem : (PHASE_LENGTHS[phaseName] || 60);
          const newEndAt = Date.now() + resumeDuration * 1000;
          stateRef.update({ phasePaused: false, phaseEndAt: newEndAt, pausedRemaining: null });
          messagesRef.push({ text: `人数が揃いました。ゲームを再開します。`, name: "システム", time: Date.now() });
        } else {
          // 非GMは再開待ち（GM が操作するまで何もしない）
        }
      }
    }
  });

});
  // DOMContentLoaded end
