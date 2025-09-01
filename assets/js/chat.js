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
      if (sendBtn) sendBtn.disabled = true;
      if (actionBtn) actionBtn.disabled = true;

      const spectateEl = document.getElementById("spectateArea") || document.createElement("div");
      spectateEl.id = "spectateArea";
      spectateEl.innerHTML = "<h3>会話を覗き見る</h3>";

      db.ref(`rooms/${roomId}`).once("value").then((roomSnap) => {
        const roomData = roomSnap.val() || {};
        const links = [];
        links.push(roomId);

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

// --- GM 用コントロール表示 ---
const isGm = localStorage.getItem("isGm") === "true";
if (isGm) {
  const gmControls = document.getElementById("gmControls");
  if (gmControls) gmControls.style.display = "block";

  const startBtn = document.getElementById("startGameBtn");
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      await assignRoles(roomId);
      startPhaseInDB("morning", 1, PHASE_LENGTHS.morning);
    });
  }
}

  
  // --- メッセージ送信 ---
  if (sendBtn) {
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
  }

  if (msgInput) {
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (sendBtn) sendBtn.click();
      }
    });
  }

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
  

  // --- 役職割り当て関数 ---
  async function assignRoles(roomId) {
    const roles = ["wolf","madman","detective","villager","villager","villager","villager"];
    const snap = await firebase.database().ref(`rooms/${roomId}/players`).once("value");
    const players = snap.val() || {};
    const playerNames = Object.keys(players);

    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    for (let i = 0; i < playerNames.length; i++) {
      const name = playerNames[i];
      const role = roles[i] || "villager";
      const fullName = generateFullName();
      const profile = generateProfile();
      const infoCards = generateInfoCard(role, fullName, profile, players, name);

      firebase.database().ref(`rooms/${roomId}/players/${name}`).update({
        role,
        fullName,
        profile,
        infoCards
      });
    }

    firebase.database().ref(`rooms/${roomId}/messages`).push({
      text: "役職とプロフィールが配布されました。",
      name: "システム",
      time: Date.now()
    });
  }

  // --- 自分の役職を監視して表示 ---
  playersRef.child("role").on("value", (snap) => {
    const myRole = snap.val();
    if (myRole) {
      const roleEl = document.getElementById("myRole") || document.createElement("div");
      roleEl.id = "myRole";
      roleEl.innerHTML = `<strong>あなたの役職:</strong> ${myRole}`;
      document.body.appendChild(roleEl);
    }
  });

  // --- 名前生成 ---
  const fakeSurnames = ["佐原木","神代川","高森田","藤宮堂","北条木","桐沢谷","篠原江","葛城井","綾峰","東雲木",
  "氷川原","鷹森","葉月川","橘野","秋津原","久遠木","真田沢","花村江","水城田","黒川谷",
  "白峰","大鳥居","小野森","星川堂","天城井","美濃部","八雲木","九条原","深山田","紫垣",
  "西園川","榊原井","安曇野","若狭木","羽黒田","桜庭谷","柏崎川","三雲堂","雪村江","沢渡木",
  "如月谷","朧川","暁森","鬼塚原","葵井","唐沢江","稲城堂","真壁木","月岡川","白鷺田",
  // 追加分
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
    return surname + " " + given;
  }

  // --- プロフィール生成 ---
  const outfits = ["スーツ","ジャージ","着物","白衣","パーカー","セーラー服","作業着"];
  const likes = ["カレー","ゲーム","数学","犬","カラオケ","コーヒー"];
  const dislikes = ["虫","早起き","ピーマン","大人数の集まり"];
  const strengths = ["運動","観察","記憶力","交渉","料理"];
  const weaknesses = ["方向感覚","計算","嘘をつく","体力","集中力"];

  function generateProfile() {
    return {
      outfit: outfits[Math.floor(Math.random() * outfits.length)],
      like: likes[Math.floor(Math.random() * likes.length)],
      dislike: dislikes[Math.floor(Math.random() * dislikes.length)],
      strong: strengths[Math.floor(Math.random() * strengths.length)],
      weak: weaknesses[Math.floor(Math.random() * weaknesses.length)]
    };
  }

  // --- 情報カード生成（統一版） ---
  function generateInfoCard(role, fullName, profile, allProfiles, selfName) {
    const cards = [];

    if (role === "madman") {
      const villagerNames = Object.keys(allProfiles).filter(n => n !== selfName);
      if (villagerNames.length > 0) {
        const target = allProfiles[villagerNames[Math.floor(Math.random() * villagerNames.length)]].profile;
        if (target) {
          cards.push(`人狼は ${target.outfit} を着ている`);
          cards.push(`人狼は ${target.like} が好き`);
        }
      }
    } else if (role !== "wolf") {
      cards.push(`人狼は ${profile.outfit} を着ている`);
      cards.push(`人狼は ${profile.like} が好き`);
      cards.push(`人狼は ${profile.dislike} が嫌い`);
    }

    return cards;
  }

  // --- 人狼の母音ヒント ---
  function addWolfVowelHint(roomId, players) {
    const wolf = Object.entries(players).find(([_, p]) => p.role === "wolf");
    if (!wolf) return;
    const wolfName = wolf[0];
    const fullName = wolf[1].fullName;
    const vowels = (fullName.match(/[aiueoアイウエオ]/gi) || []).length;

    const candidates = Object.entries(players).filter(([_, p]) => p.role !== "wolf");
    if (candidates.length === 0) return;
    const [targetName] = candidates[Math.floor(Math.random() * candidates.length)];

    firebase.database().ref(`rooms/${roomId}/players/${targetName}/infoCards`).push(
      `人狼のフルネームには母音が ${vowels} 個含まれている`
    );
  }

  // --- 行動完了ボタン ---
  if (actionBtn) {
    actionBtn.addEventListener("click", () => {
      actionsRef.child(playerName).set(true);
      actionBtn.style.display = "none";
      actionStatus.style.display = "block";
    });
  }

  // --- プロフィール/持ち物ボタン（存在確認付き） ---
  const profileBtn = document.getElementById("profileBtn");
  if (profileBtn) {
    profileBtn.addEventListener("click", () => togglePanel("profilePanel"));
  }
  const itemsBtn = document.getElementById("itemsBtn");
  if (itemsBtn) {
    itemsBtn.addEventListener("click", () => togglePanel("itemsPanel"));
  }

  function togglePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = (el.style.display === "block") ? "none" : "block";
  }

  // --- プロフィール/持ち物の内容表示 ---
  playersRef.once("value").then(snap => {
    const me = snap.val() || {};
    if (me.role) {
      const profEl = document.getElementById("profileContent");
      if (profEl) {
        profEl.innerHTML = `
          <div class="card">
            <b>役職: ${me.role}</b><br>
            服装: ${me.profile?.outfit || ""}<br>
            好き: ${me.profile?.like || ""}<br>
            嫌い: ${me.profile?.dislike || ""}<br>
            得意: ${me.profile?.strong || ""}<br>
            苦手: ${me.profile?.weak || ""}
            <small>共有</small>
          </div>
        `;
      }

      const itemsEl = document.getElementById("itemsContent");
      if (itemsEl) {
        itemsEl.innerHTML = `
          <div class="card">
            <b>名刺</b><br>
            ${me.fullName || ""}<br>
            ${toKatakana(me.fullName || "")}
            <small>共有</small>
          </div>
          ${(me.infoCards || []).map(c => `
            <div class="card">
              ${c}
              <small>共有</small>
            </div>`).join("")}
        `;
      }
    }
  });

  function toKatakana(str) {
    if (!str) return "";
    return str.replace(/[a-zA-Zぁ-ん]/g, "カタカナ");
  }
});
