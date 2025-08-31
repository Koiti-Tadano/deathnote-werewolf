// assets/js/chat.js
// 安全な初期化 — DOM が準備できてから実行
document.addEventListener('DOMContentLoaded', () => {

  // --- URL / localStorage から情報取得 ---
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room') || localStorage.getItem('roomId') || 'defaultRoom';
  const playerName = params.get('name') || localStorage.getItem('playerName') || '名無し';

  // 保存（次回のため）
  localStorage.setItem('roomId', roomId);
  localStorage.setItem('playerName', playerName);

  // --- Firebase DB 初期参照 ---
  if (typeof firebase === 'undefined') {
    console.error('firebase が定義されていません。firebase-config.js を読み込んで初期化してください。');
    return;
  }
  const db = firebase.database();

  // --- DOM 要素 ---
  const roomInfoEl = document.getElementById('roomInfo');
  const playerInfoEl = document.getElementById('playerInfo');
  const msgInput = document.getElementById('msgInput');
  const sendBtn = document.getElementById('sendBtn');
  const messagesList = document.getElementById('messages');

  // 表示
  if (roomInfoEl) roomInfoEl.textContent = 'ルームID: ' + roomId;
  if (playerInfoEl) playerInfoEl.textContent = 'あなた: ' + playerName;

  // --- メッセージ参照 ---
  const messagesRef = db.ref('rooms/' + roomId + '/messages');

  // --- 送信処理 ---
  sendBtn.addEventListener('click', () => {
    const text = msgInput.value;
    if (!text || text.trim() === '') return;
    // push メッセージ
    messagesRef.push({
      text: text.trim(),
      name: playerName,
      time: Date.now()
    }).then(() => {
      msgInput.value = '';
    }).catch(err => {
      console.error('メッセージ送信エラー:', err);
      alert('メッセージ送信に失敗しました。');
    });
  });

  // Enter キーで送信（オプション）
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // --- 受信表示 ---
  messagesRef.on('child_added', (snapshot) => {
    const msg = snapshot.val();
    const li = document.createElement('li');
    li.className = 'message-item';

    // アイコン（頭文字）
    const icon = document.createElement('div');
    icon.className = 'message-icon';
    icon.textContent = msg.name ? msg.name.charAt(0) : '?';

    // アイコンを押した時の簡易メニュー（あとで拡張）
    icon.addEventListener('click', () => {
      openActionMenu(icon, msg);
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'message-name';
    nameSpan.textContent = msg.name || '名無し';

    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.textContent = msg.text;

    li.appendChild(icon);
    li.appendChild(nameSpan);
    li.appendChild(textSpan);
    messagesList.appendChild(li);

    // スクロール最下部へ
    messagesList.scrollTop = messagesList.scrollHeight;
  });

  // ------------ アクションメニュー（簡易） ------------
  function openActionMenu(anchorEl, msg) {
    // 既にメニューがあれば消す
    const prev = document.querySelector('.action-menu');
    if (prev) prev.remove();

    const menu = document.createElement('div');
    menu.className = 'action-menu';

    // 個別チャット
    const btnDM = document.createElement('button');
    btnDM.textContent = '個別チャット';
    btnDM.onclick = () => {
      const self = playerName;
      const other = msg.name || '名無し';
      // 名前順にして一意化
      const ids = [self, other].sort();
      const privateRoomId = roomId + '-' + encodeURIComponent(ids[0]) + '-' + encodeURIComponent(ids[1]);
      window.open('chat.html?room=' + privateRoomId + '&name=' + encodeURIComponent(self), '_blank');
      menu.remove();
    };
    menu.appendChild(btnDM);

    // （ここにキル／投票ボタンなどを後で追加）
    anchorEl.parentElement.appendChild(menu);
  }

  // ------------ フェーズ管理の placeholder (UI用) ------------
  // フェーズ表示要素（chat.html に #phaseInfo、#phaseTimer を用意済み）
  const phaseInfoEl = document.getElementById('phaseInfo');
  const phaseTimerEl = document.getElementById('phaseTimer');
  window.currentPhase = 'day'; // 初期

  function updateUIForPhase(phase) {
    window.currentPhase = phase;
    if (phaseInfoEl) phaseInfoEl.textContent = '現在: ' + phase;
  }
  // ここでは stateRef の監視などは後から追加します（フェーズ管理で実装）

  // ------------ モーダル（ルール）処理 ------------
  const modal = document.getElementById('rulesModal');
  const openBtn = document.getElementById('openRules');
  const closeBtn = document.getElementById('closeRules');
  if (openBtn && modal) {
    openBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('rules.html');
        const text = await res.text();
        document.getElementById('rulesContent').innerHTML = text;
        modal.style.display = 'block';
      } catch (e) {
        document.getElementById('rulesContent').innerHTML = '<p>ルールを読み込めませんでした。</p>';
        modal.style.display = 'block';
      }
    });
  }
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  }

}); // DOMContentLoaded end

// ==========================
// フェーズ管理（ローカルのみ）
// ==========================
const PHASE_ORDER = ["morning", "day", "evening", "night"];
const PHASE_LENGTHS = {
  morning: 0,       // 0秒
  day: 6 * 60,      // 6分
  evening: 2 * 60,  // 2分
  night: 2 * 60     // 2分
};

let currentPhaseIndex = 0;
let currentDay = 1;
let phaseTimer = null;

// 表示用要素
const phaseInfoEl = document.getElementById("phaseInfo");
const phaseTimerEl = document.getElementById("phaseTimer");

function startPhase(phase, day) {
  const length = PHASE_LENGTHS[phase];

  // フェーズ名を日本語化
  const phaseLabel = {
    morning: "朝",
    day: "昼",
    evening: "夕方",
    night: "夜"
  }[phase];

  // 表示更新
  if (phaseInfoEl) phaseInfoEl.textContent = `Day ${day} — ${phaseLabel}`;
  
  // 残り時間表示（morningは即次へ進む）
  if (phaseTimer) { clearInterval(phaseTimer); phaseTimer = null; }
  if (length > 0) {
    let endTime = Date.now() + length * 1000;
    function updateTimer() {
      const left = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      if (phaseTimerEl) phaseTimerEl.textContent = `残り ${left}s`;
      if (left <= 0) {
        clearInterval(phaseTimer);
        phaseTimer = null;
        nextPhase();
      }
    }
    updateTimer();
    phaseTimer = setInterval(updateTimer, 500);
  } else {
    // morningは即スキップ
    if (phaseTimerEl) phaseTimerEl.textContent = `残り 0s`;
    nextPhase();
  }
}

function nextPhase() {
  currentPhaseIndex = (currentPhaseIndex + 1) % PHASE_ORDER.length;
  if (currentPhaseIndex === 0) currentDay++; // 1周したら日数+1
  const phase = PHASE_ORDER[currentPhaseIndex];
  startPhase(phase, currentDay);
}

// 最初のフェーズ開始
startPhase(PHASE_ORDER[currentPhaseIndex], currentDay);
