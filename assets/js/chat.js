DOM
// assets/js/chat.js
document.addEventListener("DOMContentLoaded", () => {
  // ===== URL / localStorage =====
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room") || localStorage.getItem("roomId") || "defaultRoom";
  const playerName = params.get("name") || localStorage.getItem("playerName") || "名無し";
  localStorage.setItem("roomId", roomId);
  localStorage.setItem("playerName", playerName);

  // ===== Firebase =====
  if (typeof firebase === "undefined") {
    alert("Firebase が読み込まれていません！");
    return;
  }
  const db = firebase.database();

  // ===== Refs =====
  const messagesRef    = db.ref(`rooms/${roomId}/messages`);
  const stateRef       = db.ref(`rooms/${roomId}/state`);
  const actionsRef     = db.ref(`rooms/${roomId}/actions`);
  const playersRef     = db.ref(`rooms/${roomId}/players/${playerName}`);
  const playersListRef = db.ref(`rooms/${roomId}/players`);
  const tradesRef      = db.ref(`rooms/${roomId}/trades`); // ← 交渉リクエスト

  // ===== DOM =====
  const msgInput     = document.getElementById("msgInput");
  const sendBtn      = document.getElementById("sendBtn");
  const messagesList = document.getElementById("messages");
  const actionBtn    = document.getElementById("actionDoneBtn");
  const actionStatus = document.getElementById("actionStatus");
  const roomInfoEl   = document.getElementById("roomInfo");
  const playerInfoEl = document.getElementById("playerInfo");
  const profileBtn   = document.getElementById("profileBtn");
  const itemsBtn     = document.getElementById("itemsBtn");

  if (roomInfoEl)   roomInfoEl.textContent = `ルームID: ${roomId}`;
  if (playerInfoEl) playerInfoEl.textContent = `あなた: ${playerName}`;

  // ===== 参加登録 =====
  playersRef.update({ joinedAt: Date.now(), alive: true });
  playersRef.onDisconnect().remove();

  // ===== 状態変数 =====
  let myRole = null;
  let currentPhase = "day";
  let usedShinigamiEye = false;
  let localTimerInterval = null;

  // ===== 定数（フェーズ）=====
  const PHASE_ORDER   = ["morning", "day", "evening", "night"];
  const PHASE_LENGTHS = { morning: 60, day: 6 * 60, evening: 2 * 60, night: 2 * 60 };

  // ===== GM コントロール =====
  const isGm = localStorage.getItem("isGm") === "true";
  if (isGm) {
    const gmControls = document.getElementById("gmControls");
    if (gmControls) gmControls.style.display = "block";

    const startBtn = document.getElementById("startGameBtn");
    if (startBtn) {
      startBtn.addEventListener("click", async () => {
        await assignRolesAndProfiles(roomId);
        await startPhaseInDB("morning", 1, PHASE_LENGTHS.morning);
        startBtn.style.display = "none"; // 一度押したら非表示
      });
    }
  }
  // ===== メッセージ送信 =====
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      if (!msgInput) return;
      const text = msgInput.value.trim();
      if (!text) return;
      messagesRef.push({ text, name: playerName, time: Date.now() })
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

// ===== メッセージ受信（LINE風：アイコン＋名前＋吹き出し）=====
messagesRef.on("child_added", (snap) => {
  const msg = snap.val();
  const li = document.createElement("li");

  // システムメッセージ
  if (msg.name === "システム") {
    li.className = "system-message";
    li.textContent = msg.text;
    messagesList.appendChild(li);
    messagesList.scrollTop = messagesList.scrollHeight;
    return;
  }

  // row 本体（self / other）
  const isSelf = msg.name === playerName;
  li.className = `msg-row ${isSelf ? "self" : "other"}`;

  // アイコン
  const icon = document.createElement("div");
  icon.className = "icon";
  icon.textContent = msg.name ? msg.name.charAt(0) : "?";

  // 名前＋吹き出しをまとめるコンテナ
  const msgContent = document.createElement("div");
  msgContent.className = "msg-content";

  const nameDiv = document.createElement("div");
  nameDiv.className = "msg-name";
  nameDiv.textContent = msg.name || "名無し";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = msg.text;

  // 構造：他人は [icon][content]、自分は [content][icon]
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
  messagesList.scrollTop = messagesList.scrollHeight;

  setTimeout(() => {
    messagesList.scrollTop = messagesList.scrollHeight;
  }, 50);
});
  // ===== 自分の状態監視（alive / 役職 / UI）=====
  playersRef.on("value", (snap) => {
    const me = snap.val() || {};
    if (me.role) myRole = me.role;

    if (me.alive === false) {
      if (sendBtn) sendBtn.disabled = true;
      if (actionBtn) actionBtn.disabled = true;
    }

    renderMyPanels(me);
  });

  // ===== フェーズ表示 / タイマー =====
  stateRef.on("value", (snap) => {
    const s = snap.val() || {};
    const phase = s.phase || "day";
    const day = s.day || 1;
    const phaseEndAt = s.phaseEndAt || null;
    const phasePaused = s.phasePaused || false;

    currentPhase = phase;

    const jp = { morning: "朝", day: "昼", evening: "夕方", night: "夜" }[phase] || phase;
    document.querySelectorAll("#phaseInfo").forEach(el => el.textContent = `Day ${day} — ${jp}`);

    if (localTimerInterval) clearInterval(localTimerInterval);
    if (phasePaused) {
      document.querySelectorAll("#phaseTimer").forEach(el => el.textContent = "一時停止中（人数不足）");
      return;
    }
    if (!phaseEndAt) {
      document.querySelectorAll("#phaseTimer").forEach(el => el.textContent = "残り --");
      return;
    }

    function updateLocalTimer() {
      const left = Math.max(0, Math.floor((phaseEndAt - Date.now()) / 1000));
      document.querySelectorAll("#phaseTimer").forEach(el => el.textContent = `残り ${left}s`);
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

  // ===== 行動完了ボタン =====
  if (actionBtn) {
    actionBtn.addEventListener("click", () => {
      actionsRef.child(playerName).set(true);
      actionBtn.style.display = "none";
      if (actionStatus) actionStatus.style.display = "block";
    });
  }
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
    // 次フェーズでリセット
    if (done === 0 && actionStatus) {
      actionStatus.style.display = "none";
      actionBtn.style.display = "inline-block";
    }
  });

  // ===== プロフィール/持ち物ボタン =====
  if (profileBtn) profileBtn.addEventListener("click", () => togglePanel("profilePanel"));
  if (itemsBtn)   itemsBtn.addEventListener("click",   () => togglePanel("itemsPanel"));
  function togglePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = (el.style.display === "block") ? "none" : "block";
  }

  // ===== プロフィール/持ち物の描画（共有ボタン付き）=====
  function renderMyPanels(me) {
    const profEl  = document.getElementById("profileContent");
    const itemsEl = document.getElementById("itemsContent");

    if (profEl) {
      profEl.innerHTML = `
        <div class="card">
          <b>役職: ${me.role || ""}</b><br>
          服装: ${me.profile?.outfit || ""}<br>
          好き: ${me.profile?.like || ""}<br>
          嫌い: ${me.profile?.dislike || ""}<br>
          得意: ${me.profile?.strong || ""}<br>
          苦手: ${me.profile?.weak || ""}
          <button class="shareBtn" data-type="profile">共有</button>
        </div>
      `;
    }

    if (itemsEl) {
      const cards = Array.isArray(me.infoCards) ? me.infoCards : Object.values(me.infoCards || {});
      itemsEl.innerHTML = `
        <div class="card">
          <b>名刺</b><br>
          ${me.fullName || ""}<br>
          ${toKatakana(me.fullName || "")}
          <button class="shareBtn" data-type="business">共有</button>
        </div>
        ${(cards || []).map((c, idx) => `
          <div class="card">
            ${c}
            <button class="shareBtn" data-type="info" data-index="${idx}">共有</button>
          </div>`).join("")}
      `;

      // 共有ボタンの挙動
      itemsEl.querySelectorAll(".shareBtn").forEach(btn => {
        btn.onclick = () => sendTradeRequest(btn.dataset.type, btn.dataset.index);
      });
    }
  }

  // ===== 交渉システム =====
  function sendTradeRequest(type, index) {
    const tradeId = tradesRef.push().key;
    tradesRef.child(tradeId).set({
      from: playerName,
      type,
      index: index || null,
      status: "pending",
      time: Date.now()
    });
    alert("交渉リクエストを送りました！");
  }

  tradesRef.on("child_added", (snap) => {
    const trade = snap.val();
    const key = snap.key;

    if (trade.from === playerName) return;
    if (trade.status !== "pending") return;

    const msg = (trade.type === "business") ? "名刺が届きました" : "情報カードが届きました";
    if (confirm(`${trade.from} から ${msg}。承認しますか？`)) {
      tradesRef.child(key).update({ status: "accepted", to: playerName });

      // 自動交換処理
      if (trade.type === "business") {
        playersListRef.child(trade.from).once("value").then(snapFrom => {
          const fromData = snapFrom.val() || {};
          playersListRef.child(playerName).child("infoCards").push(fromData.profile ? JSON.stringify(fromData.profile) : "プロフィール情報");
        });
      } else if (trade.type === "info") {
        playersListRef.child(trade.from).once("value").then(snapFrom => {
          const fromData = snapFrom.val() || {};
          const cards = Object.values(fromData.infoCards || {});
          const idx = parseInt(trade.index);
          if (cards[idx]) {
            playersListRef.child(playerName).child("infoCards").push(cards[idx]);
          }
        });
      }
    } else {
      tradesRef.child(key).update({ status: "rejected", to: playerName });
    }
  });

  // ===== 名前/プロフィール生成ユーティリティ =====
  const fakeSurnames = ["佐原木","神代川","高森田","藤宮堂","北条木","桐沢谷","篠原江","葛城井","綾峰","東雲木",
    "氷川原","鷹森","葉月川","橘野","秋津原","久遠木","真田沢","花村江","水城田","黒川谷",
    "白峰","大鳥居","小野森","星川堂","天城井","美濃部","八雲木","九条原","深山田","紫垣",
    "西園川","榊原井","安曇野","若狭木","羽黒田","桜庭谷","柏崎川","三雲堂","雪村江","沢渡木",
    "如月谷","朧川","暁森","鬼塚原","葵井","唐沢江","稲城堂","真壁木","月岡川","白鷺田",
    "藤白木","羽生川","真嶋田","桂木沢","宝生谷","新宮原","瑞穂川","玉置谷","笹倉江","小城井",
    "広瀬木","大槻原","矢島沢","香坂川","成瀬江","水無月","穂高田","庄司木","鵜飼井","東条谷",
    "黒須川","西森堂","津島田","比良木","大和江","氷室谷","三崎原","藤波田","早瀬木","青柳川",
    "伊吹原","千早井","鏡原木","緑川谷","御影堂","森永江","榎本木","時任川","冬木沢","長浜谷",
    "若宮原","篠崎川","鷲尾木","霧島江","真行寺","高嶺沢","藤沢谷","忍野井","美月原","安倍川"];
  const givenNames = ["タケシ","ヒロキ","ユウタ","ケンタ","リョウ","ダイチ","ショウタ","ユウジ","マコト","アツシ",
    "ミカ","サキ","ユイ","カナ","アヤカ","ミホ","ナオミ","リナ","エリ","マユ"];
  function generateFullName() {
    const surname = fakeSurnames[Math.floor(Math.random() * fakeSurnames.length)];
    const given = givenNames[Math.floor(Math.random() * givenNames.length)];
    return `${surname} ${given}`;
  }
  const outfits   = ["スーツ","ジャージ","着物","白衣","パーカー","セーラー服","作業着"];
  const likes     = ["カレー","ゲーム","数学","犬","カラオケ","コーヒー"];
  const dislikes  = ["虫","早起き","ピーマン","大人数の集まり"];
  const strengths = ["運動","観察","記憶力","交渉","料理"];
  const weaknesses= ["方向感覚","計算","嘘をつく","体力","集中力"];
  function generateProfile() {
    return {
      outfit: outfits[Math.floor(Math.random() * outfits.length)],
      like: likes[Math.floor(Math.random() * likes.length)],
      dislike: dislikes[Math.floor(Math.random() * dislikes.length)],
      strong: strengths[Math.floor(Math.random() * strengths.length)],
      weak: weaknesses[Math.floor(Math.random() * weaknesses.length)]
    };
  }
  function toKatakana(str) {
    return str.replace(/[a-zA-Zぁ-ん]/g, "カタカナ");
  }
});
