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
  const chatBox = document.getElementById("chatBox");
  
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
    // すでに開始済みなら非表示
    stateRef.child("started").on("value", snap => {
      if (snap.val()) startBtn.style.display = "none";
    });

    startBtn.addEventListener("click", async () => {
      const startedSnap = await stateRef.child("started").once("value");
      if (startedSnap.val()) return; // 二重起動防止

      await assignRolesAndProfiles(roomId);
      await stateRef.update({ started: true });
      await startPhaseInDB("morning", 1, PHASE_LENGTHS.morning);
      startBtn.style.display = "none";
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

  // アイコンタップでアクションメニュー
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

// ====== 確実に最下部へオートスクロール ======
requestAnimationFrame(() => {
  const container = chatBox || messagesList; // 通常は chatBox がスクロール対象
  // 一発で決める
  container.scrollTop = container.scrollHeight;

  // 念のための保険（ネストしたスクローラでも効く）
  const last = messagesList.lastElementChild;
  if (last && last.scrollIntoView) {
    last.scrollIntoView({ block: "end" }); // 近いスクロール祖先に対してスクロール
  }
});
 
});
// ===== 自分の状態監視（alive / 役職 / UI）=====
playersRef.on("value", (snap) => {
  const me = snap.val() || {};
  if (me.role) {
    myRole = me.role;

    // 役職を画面に表示
    const roleEl = document.getElementById("myRoleDisplay");
    if (roleEl) {
      roleEl.textContent = `あなたの役職: ${myRole}`;
    }
  }

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
  <div class="profile-card">
    <table>
      <tr><td><b>役職:</b></td><td>${me.role || ""}</td></tr>
      <tr><td><b>服装:</b></td><td>${me.profile?.outfit || ""}</td></tr>
      <tr><td><b>好き:</b></td><td>${me.profile?.like || ""}</td></tr>
      <tr><td><b>嫌い:</b></td><td>${me.profile?.dislike || ""}</td></tr>
      <tr><td><b>得意:</b></td><td>${me.profile?.strong || ""}</td></tr>
      <tr><td><b>苦手:</b></td><td>${me.profile?.weak || ""}</td></tr>
    </table>
    <button class="shareBtn" data-type="profile">共有</button>
  </div>
`;
    }

    if (itemsEl) {
      const cards = Array.isArray(me.infoCards) ? me.infoCards : Object.values(me.infoCards || {});
      itemsEl.innerHTML = `
        <div class="business-card">
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
  // ===== 役職/プロフィール/カード配布 =====
  async function assignRolesAndProfiles(roomId) {
    const snap = await playersListRef.once("value");
    const players = snap.val() || {};
    const names = Object.keys(players);
  // すでに誰かが role を持っていたらスキップ
  if (names.some(n => players[n].role)) {
    console.log("役職は既に配布済みです");
    return;
  }


    // 役職リスト（人数に足りなければ villager）
    const baseRoles = ["wolf","madman","detective","villager","villager","villager","villager"];
    const roles = [];
    for (let i = 0; i < names.length; i++) roles[i] = baseRoles[i] || "villager";

    // シャッフル
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    // プロフィール生成（全員分まとめて先に作る）
    const temp = {};
    names.forEach(n => {
      temp[n] = {
        fullName: generateFullName(),
        profile:  generateProfile()
      };
    });

    // 各プレイヤーに割り当て
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      const role = roles[i] || "villager";
      const fullName = temp[n].fullName;
      const profile  = temp[n].profile;

      await playersListRef.child(n).update({ role, fullName, profile });

      const infoRef = playersListRef.child(n).child("infoCards");

      // 狂人は他プレイヤーのプロフィールベース
      if (role === "madman") {
        const others = names.filter(x => x !== n);
        if (others.length) {
          const pick = temp[others[Math.floor(Math.random() * others.length)]].profile;
          await infoRef.push(`人狼は ${pick.outfit} を着ている`);
          await infoRef.push(`人狼は ${pick.like} が好き`);
        }
      } else if (role !== "wolf") {
        // 市民/探偵は自分のプロフィールベース
        await infoRef.push(`人狼は ${profile.outfit} を着ている`);
        await infoRef.push(`人狼は ${profile.like} が好き`);
        await infoRef.push(`人狼は ${profile.dislike} が嫌い`);
      }
    }

    // 母音ヒントをランダムな1人に付与（狼以外）
    const wolfEntry = (await playersListRef.once("value")).val();
    const entries = Object.entries(wolfEntry || {});
    const wolfKV = entries.find(([_, v]) => v.role === "wolf");
    if (wolfKV) {
      const wolfFull = wolfKV[1].fullName || "";
      const vowels = (wolfFull.match(/[aiueoアイウエオ]/gi) || []).length;
      const candidates = entries.filter(([_, v]) => v.role !== "wolf");
      if (candidates.length) {
        const [targetName] = candidates[Math.floor(Math.random() * candidates.length)];
        await playersListRef.child(targetName).child("infoCards")
          .push(`人狼のフルネームには母音が ${vowels} 個含まれている`);
      }
    }

    await messagesRef.push({
      text: "役職とプロフィールが配布されました。",
      name: "システム",
      time: Date.now()
    });
  }

  // ===== フェーズ進行 =====
  async function startPhaseInDB(phase, day, durationSec) {
    const endAt = Date.now() + durationSec * 1000;
    await stateRef.set({
      phase,
      day,
      phaseEndAt: endAt,
      phasePaused: false
    });
    await actionsRef.set({});
    await messagesRef.push({
      text: `フェーズ開始: Day ${day} ${phase}`,
      name: "システム",
      time: Date.now()
    });
  }

  async function nextPhaseInDB(phase, day) {
    let idx = PHASE_ORDER.indexOf(phase);
    let nextPhase = "morning";
    let nextDay = day;

    if (idx >= 0 && idx < PHASE_ORDER.length - 1) {
      nextPhase = PHASE_ORDER[idx + 1];
    } else {
      nextPhase = "morning";
      nextDay++;
    }

    const duration = PHASE_LENGTHS[nextPhase] || 60;
    await startPhaseInDB(nextPhase, nextDay, duration);
  }

  // ===== アクションメニュー（DM/キル/探偵/投票/死神の目）=====
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

    // キル（人狼・夜のみ）
    if (myRole === "wolf" && currentPhase === "night") {
      const btnKill = document.createElement("button");
      btnKill.textContent = "キル";
      btnKill.onclick = async () => {
        const targetPlayer = msg.name;
        if (targetPlayer === playerName) {
          alert("自分はキルできません");
          return;
        }
        const targetSnap = await playersListRef.child(targetPlayer).once("value");
        const targetData = targetSnap.val();
        if (!targetData || targetData.alive === false) {
          alert("対象が存在しないか、すでに死亡しています");
          return;
        }
        const full = targetData.fullName || targetPlayer;
        const input = prompt(`${targetPlayer} のフルネームを入力してください`);
        if (input && input.trim() === full) {
          await playersListRef.child(targetPlayer).update({ alive: false });
          async function processMorningDeaths() {
　　　　　　  const players = (await playersListRef.once("value")).val() || {};
           const deadPlayers = Object.entries(players).filter(([_, v]) => v.alive === false && !v.deathAnnounced);

           for (const [name, data] of deadPlayers) {
            await messagesRef.push({
              text: `${name} が死亡しました`,
              name: "システム",
              time: Date.now()
　　　　　    });
           await playersListRef.child(name).update({ deathAnnounced: true });
　　　　　  }
　　　　　}

// 朝フェーズ開始時に呼ぶ
if (phase === "morning") {
  processMorningDeaths();
}
          alert("キル成功！");
        } else {
          alert("キル失敗（名前が一致しません）");
        }
        menu.remove();
      };
      menu.appendChild(btnKill);
    }

    // 死神の目（死神・昼のみ、未使用なら）
    if (myRole === "wolf" && currentPhase === "night" && !usedShinigamiEye) {
      const btnEye = document.createElement("button");
      btnEye.textContent = "死神の目";
      btnEye.onclick = async () => {
        const targetPlayer = msg.name;
        if (targetPlayer === playerName) {
          alert("自分には使えません");
          return;
        }
　    if (!confirm("死神の目は一度しか使えません。使用しますか？")) {
      menu.remove();
      return;
    }
    usedShinigamiEye = true;
    const targetSnap = await playersListRef.child(msg.name).once("value");
    const targetData = targetSnap.val();
    if (targetData?.fullName) {
      // 人狼全員に秘密のDM的に公開
      const wolvesSnap = await playersListRef.once("value");
      const wolves = Object.entries(wolvesSnap.val() || {}).filter(([_, v]) => v.role === "wolf");
      wolves.forEach(([wolfName]) => {
        db.ref(`rooms/${roomId}/wolfNotes/${wolfName}`).push({
          text: `${msg.name} の本名は ${targetData.fullName} です`,
          time: Date.now()
        });
      });
    }
    menu.remove();
  };
  menu.appendChild(btnEye);
}
    // 探偵（探偵・夜のみ）
    if (myRole === "detective" && currentPhase === "night") {
      const btnDetective = document.createElement("button");
      btnDetective.textContent = "探偵";
      btnDetective.onclick = () => {
        const gmRoomId = `${roomId}-gm-${playerName}`;
        window.open(`chat.html?room=${gmRoomId}&name=${encodeURIComponent(playerName)}`, "_blank");
        menu.remove();
      };
      menu.appendChild(btnDetective);
    }

    // 投票（夕方）
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

    document.body.appendChild(menu);
    // 位置調整
    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.left = `${rect.left}px`;
    menu.style.top  = `${rect.bottom + 4}px`;
  }
});
