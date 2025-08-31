const msgInput = document.getElementById("msgInput");
const sendBtn  = document.getElementById("sendBtn");
const messagesList = document.getElementById("messages");

const db = firebase.database();
const messagesRef = db.ref("rooms/" + roomId + "/messages");
// URLパラメータ取得
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room") || localStorage.getItem("roomId") || "defaultRoom";
const playerName = params.get("name") || localStorage.getItem("playerName") || "名無し";
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
//const messagesRef = db.ref("rooms/" + roomId + "/messages");

// 入力欄とボタンを取得
//const msgInput = document.getElementById("msgInput");
//const sendBtn = document.getElementById("sendBtn");
//const messagesList = document.getElementById("messages");

// メッセージ送信
sendBtn.addEventListener("click", () => {
  const text = msgInput.value;
  if (text.trim() === "") return;

  messagesRef.push({
    text: text,
    name: playerName,
    time: Date.now()
  });

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
  const selfName = playerName; // local
  const targetName = msg.name;
  const currentPhase = window.currentPhase || "day";
  const myRole = getMyRole(); // ルームの players/{myId}/role を先に取得しておく

  // メニューを作る
  const menu = document.createElement("div");
  menu.className = 'action-menu';

  // 1: 個別チャット（いつでも）
  const btnDM = document.createElement('button'); btnDM.textContent = 'この人と個別チャット';
  btnDM.onclick = () => { openPrivateChat(targetName); removeMenu(menu); };
  menu.appendChild(btnDM);

  // 2: キル（夜かつ自分が人狼で生存時）
  const btnKill = document.createElement('button'); btnKill.textContent = 'キル';
  btnKill.onclick = () => {
    if (currentPhase !== 'night') { alert('夜にしかキルできません'); return; }
    if (myRole !== 'werewolf') { alert('あなたは人狼ではありません'); return; }
    promptKillTarget(targetName);
    removeMenu(menu);
  };
  menu.appendChild(btnKill);

  // 3: 死神の目（人狼のみ、一度のみ）
  const btnEyes = document.createElement('button'); btnEyes.textContent = '死神の目';
  btnEyes.onclick = () => {
    if (currentPhase !== 'night') { alert('夜にしか使えません'); return; }
    if (myRole !== 'werewolf') { alert('あなたは人狼ではありません'); return; }
    useEyesOn(targetName);
    removeMenu(menu);
  };
  menu.appendChild(btnEyes);

  // 4: 投票（夕方のみ）
  const btnVote = document.createElement('button'); btnVote.textContent = '投票';
  btnVote.onclick = () => {
    if (currentPhase !== 'evening') { alert('投票は夕方にのみ行えます'); return; }
    prepareVoteFor(targetName);
    removeMenu(menu);
  };
  menu.appendChild(btnVote);

  // attach
  icon.parentElement.appendChild(menu);

  function removeMenu(el) { if (el && el.parentElement) el.parentElement.removeChild(el); }
});

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

// --- フェーズ管理 ----------------
const stateRef = firebase.database().ref(`rooms/${roomId}/state`);
let localPhaseTimer = null;

// フェーズのデフォルト長（秒）
const PHASE_LENGTHS = {
  morning: 0,   // ただ発表のみ
  day: 6*60,    // 6分
  evening: 2*60,// 2分
  night: 2*60   // 2分
};

// フェーズ順序
const PHASE_ORDER = ["morning", "day", "evening", "night"];

// ホストだけがフェーズ開始をトリガー（作成者が host）
async function startNextPhaseAsHost() {
  const snap = await stateRef.once('value');
  const s = snap.val() || {};
  const day = s.day || 1;
  const currentPhase = s.phase || "morning";
  const idx = PHASE_ORDER.indexOf(currentPhase);
  const nextIdx = (idx + 1) % PHASE_ORDER.length;
  let nextPhase = PHASE_ORDER[nextIdx];
  let nextDay = day;
  if (nextPhase === "morning" && currentPhase === "night") nextDay = day + 1;

  const length = PHASE_LENGTHS[nextPhase] || 60;
  const endsAt = Date.now() + length * 1000;

  await stateRef.update({ phase: nextPhase, day: nextDay, phaseEndsAt: endsAt });
}

// クライアント側でフェーズの変更を監視してUIを切り替え
stateRef.on('value', snap => {
  const s = snap.val() || {};
  const phase = s.phase || "day";
  const day = s.day || 1;
  const endsAt = s.phaseEndsAt || 0;
  onPhaseChanged(phase, day, endsAt);
});

// UI 切替とカウントダウン
function onPhaseChanged(phase, day, endsAt) {
  // 表示: 何日目 昼/夜 など
  const phaseLabel = { morning: "朝", day: `日中 (昼)`, evening: "夕方", night: "夜" }[phase] || phase;
  document.getElementById('phaseInfo').textContent = `Day ${day} — ${phaseLabel}`;

  // タイマー表示
  if (localPhaseTimer) { clearInterval(localPhaseTimer); localPhaseTimer = null; }
  function updateTimer() {
    const left = Math.max(0, Math.floor((endsAt - Date.now())/1000));
    document.getElementById('phaseTimer').textContent = `残り ${left}s`;
    if (left <= 0) {
      clearInterval(localPhaseTimer);
      localPhaseTimer = null;
      // 自動で次フェーズをホストが進めるトリガーは別途処理（下）
    }
  }
  updateTimer();
  localPhaseTimer = setInterval(updateTimer, 500);

  // UI制御: アイコン操作や投票ボタンの表示/非表示
  updateUIForPhase(phase);
}

// ホスト判定（ローカル playerId と state.host を比較）
let myPlayerId = null; // これを players/{id} の key と一致させておく（例: nameから生成）
firebase.database().ref(`rooms/${roomId}/state/host`).once('value').then(snap => {
  const hostId = snap.val();
  // ホストなら定期的にフェーズ終了を見て startNextPhaseAsHost を呼ぶ
  if (hostId === myPlayerId) {
    // ループでstateを監視して phaseEndsAtに到達したら startNextPhaseAsHost()
    function hostLoop() {
      stateRef.once('value').then(snap => {
        const st = snap.val() || {};
        const endsAt = st.phaseEndsAt || 0;
        if (endsAt && Date.now() > endsAt + 500) {
          startNextPhaseAsHost();
        }
        setTimeout(hostLoop, 1000);
      });
    }
    hostLoop();
  }
}

// UI update stub
function updateUIForPhase(phase) {
  // 例: ボタンの有効化
  // day -> 投票非表示、 night -> 投票非表示
  // 夜にだけ「キル」などが表示されるように、アイコンクリック時の挙動は phaseチェックを行う
  window.currentPhase = phase;
}

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





