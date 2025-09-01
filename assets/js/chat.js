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

  // ===== メッセージ受信 =====
  messagesRef.on("child_added", (snap) => {
    const msg = snap.val();
    const li = document.createElement("li");
    li.className = "message-item";

    const icon = document.createElement("div");
    icon.className = "message-icon";
    icon.textContent = msg.name ? msg.name.charAt(0) : "?";
    icon.addEventListener("click", () => openActionMenu(icon, msg));

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

  // ===== 自分の状態監視（alive / 役職 / UI）=====
  playersRef.on("value", (snap) => {
    const me = snap.val() || {};
    // 役職キャッシュ
    if (me.role) myRole = me.role;

    // 死亡（観戦モード）
    if (me.alive === false) {
      if (sendBtn) sendBtn.disabled = true;
      if (actionBtn) actionBtn.disabled = true;

      const spectateEl = document.getElementById("spectateArea") || document.createElement("div");
      spectateEl.id = "spectateArea";
      spectateEl.innerHTML = "<h3>会話を覗き見る</h3>";
      db.ref(`rooms/${roomId}`).once("value").then((roomSnap) => {
        const roomData = roomSnap.val() || {};
        const links = [roomId];
        Object.keys(roomData).forEach(key => { if (key.startsWith(roomId + "-")) links.push(key); });
        spectateEl.innerHTML += links.map(id =>
          `<div><a href="chat.html?room=${id}&name=${encodeURIComponent(playerName)}" target="_blank">${id}</a></div>`
        ).join("");
        document.body.appendChild(spectateEl);
      });
    }

    // プロフィール/持ち物パネルの内容
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
    // 重複ID対策：両方更新
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
  });

  // ===== プロフィール/持ち物ボタン =====
  if (profileBtn) profileBtn.addEventListener("click", () => togglePanel("profilePanel"));
  if (itemsBtn)   itemsBtn.addEventListener("click",   () => togglePanel("itemsPanel"));
  function togglePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = (el.style.display === "block") ? "none" : "block";
  }

  // ===== アクションメニュー（DM/キル/探偵/投票）=====
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
        const full = targetData.fullName || targetPlayer; // フルネーム未配布対策
        const input = prompt(`${targetPlayer} のフルネームを入力してください`);
        if (input && input.trim() === full) {
          await playersListRef.child(targetPlayer).update({ alive: false });
          alert("キル成功！");
        } else {
          alert("キル失敗（名前が一致しません）");
        }
        menu.remove();
      };
      menu.appendChild(btnKill);
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

  // ===== 役職/プロフィール/名刺/カード配布 =====
  async function assignRolesAndProfiles(roomId) {
    // 参加者一覧
    const snap = await playersListRef.once("value");
    const players = snap.val() || {};
    const names = Object.keys(players);

    // 役職リスト（人数に足りなければ villager）
    const baseRoles = ["wolf","madman","detective","villager","villager","villager","villager"];
    const roles = [];
    for (let i = 0; i < names.length; i++) roles[i] = baseRoles[i] || "villager";

    // シャッフル
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    // まず全員のフルネーム/プロフィールだけ先に用意（参照用）
    const temp = {};
    names.forEach(n => {
      temp[n] = {
        fullName: generateFullName(),
        profile:  generateProfile()
      };
    });

    // 書き込み
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      const role = roles[i] || "villager";
      const fullName = temp[n].fullName;
      const profile  = temp[n].profile;

      await playersListRef.child(n).update({ role, fullName, profile });
      // infoCards は push で統一
      const infoRef = playersListRef.child(n).child("infoCards");
      // 狂人：他の市民（自分以外）のプロフィールベース
      if (role === "madman") {
        const others = names.filter(x => x !== n);
        if (others.length) {
          const pick = temp[others[Math.floor(Math.random() * others.length)]].profile;
          await infoRef.push(`人狼は ${pick.outfit} を着ている`);
          await infoRef.push(`人狼は ${pick.like} が好き`);
        }
      } else if (role !== "wolf") {
        // 市民/探偵：自分のプロフィールベースで「人狼は〜」
        await infoRef.push(`人狼は ${profile.outfit} を着ている`);
        await infoRef.push(`人狼は ${profile.like} が好き`);
        await infoRef.push(`人狼は ${profile.dislike} が嫌い`);
      }
    }

    // 母音ヒントを人狼以外の1人に付与
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

    await messagesRef.push({ text: "役職とプロフィールが配布されました。", name: "システム", time: Date.now() });
  }

  // ===== フェーズ管理 =====
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
  async function nextPhaseInDB(curPhase, curDay) {
    const idx = PHASE_ORDER.indexOf(curPhase);
    const nextIdx = (idx + 1) % PHASE_ORDER.length;
    const nextPhase = PHASE_ORDER[nextIdx];
    const nextDay = (nextIdx === 0) ? curDay + 1 : curDay;
    await startPhaseInDB(nextPhase, nextDay, PHASE_LENGTHS[nextPhase]);
    messagesRef.push({ text: `-- ${nextDay}日目 ${nextPhase} 開始 --`, name: "システム", time: Date.now() });
  }

  // ===== プロフィール/持ち物の描画 =====
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
          <small>共有</small>
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
          <small>共有</small>
        </div>
        ${(cards || []).map(c => `
          <div class="card">
            ${c}
            <small>共有</small>
          </div>`).join("")}
      `;
    }
  }

  // ===== 名前/プロフィール生成ユーティリティ =====
  const fakeSurnames = [
    "佐原木","神代川","高森田","藤宮堂","北条木","桐沢谷","篠原江","葛城井","綾峰","東雲木",
    "氷川原","鷹森","葉月川","橘野","秋津原","久遠木","真田沢","花村江","水城田","黒川谷",
    "白峰","大鳥居","小野森","星川堂","天城井","美濃部","八雲木","九条原","深山田","紫垣",
    "西園川","榊原井","安曇野","若狭木","羽黒田","桜庭谷","柏崎川","三雲堂","雪村江","沢渡木",
    "如月谷","朧川","暁森","鬼塚原","葵井","唐沢江","稲城堂","真壁木","月岡川","白鷺田",
    "藤白木","羽生川","真嶋田","桂木沢","宝生谷","新宮原","瑞穂川","玉置谷","笹倉江","小城井",
    "広瀬木","大槻原","矢島沢","香坂川","成瀬江","水無月","穂高田","庄司木","鵜飼井","東条谷",
    "黒須川","西森堂","津島田","比良木","大和江","氷室谷","三崎原","藤波田","早瀬木","青柳川",
    "伊吹原","千早井","鏡原木","緑川谷","御影堂","森永江","榎本木","時任川","冬木沢","長浜谷",
    "若宮原","篠崎川","鷲尾木","霧島江","真行寺","高嶺沢","藤沢谷","忍野井","美月原","安倍川"
  ];
  const givenNames = [
    "タケシ","ヒロキ","ユウタ","ケンタ","リョウ","ダイチ","ショウタ","ユウジ","マコト","アツシ",
    "ミカ","サキ","ユイ","カナ","アヤカ","ミホ","ナオミ","リナ","エリ","マユ"
  ];
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
    // ダミー表示：かな英字は「カタカナ」に置換（本実装は任意）
    return str.replace(/[a-zA-Zぁ-ん]/g, "カタカナ");
  }
});
