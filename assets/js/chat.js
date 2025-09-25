// === chat.js ===
import {
  db,
  ref,
  push,
  set,
  get,
  update,
  onValue,
  child
} from "./firebase.js";

import {
  showSpectatorUI,
  renderMyPanels,
  updateRoleDisplay,
  updatePhaseUI
} from "./ui.js";

import {
  openActionMenu,
  sendTradeRequest
} from "./actions.js";

import {
  toKatakana,
  assignRolesAndProfiles,
  startPhaseInDB,
  nextPhaseInDB,
  PHASE_LENGTHS
} from "./game.js";

document.addEventListener("DOMContentLoaded", () => {
  // ----- URL / localStorage -----
  const params = new URLSearchParams(window.location.search);
  const rawRoomId = params.get("room") || localStorage.getItem("roomId") || "defaultRoom";
  const playerName = params.get("name") || localStorage.getItem("playerName") || "名無し";
  const isDm = rawRoomId.includes("-dm-");
  const mainRoomId = isDm ? rawRoomId.split("-dm-")[0] : rawRoomId;
  const chatRoomId = rawRoomId;

  // ----- DOM -----
  const msgInput     = document.getElementById("msgInput");
  const sendBtn      = document.getElementById("sendBtn");
  const messagesList = document.getElementById("messages");
  const chatBox      = document.getElementById("chatBox");
  const actionBtn    = document.getElementById("actionDoneBtn");
  const actionStatus = document.getElementById("actionStatus");
  const roomInfoEl   = document.getElementById("roomInfo");
  const playerInfoEl = document.getElementById("playerInfo");

  if (roomInfoEl)   roomInfoEl.textContent = `ルームID: ${mainRoomId}`;
  if (playerInfoEl) playerInfoEl.textContent = `あなた: ${playerName}`;

  // ----- Firebase refs -----
  const messagesRef    = ref(db, `rooms/${chatRoomId}/messages`);
  const playersListRef = ref(db, `rooms/${mainRoomId}/players`);
  const playersRef     = ref(db, `rooms/${mainRoomId}/players/${playerName}`);
  const stateRef       = ref(db, `rooms/${mainRoomId}/state`);
  const actionsRef     = ref(db, `rooms/${mainRoomId}/actions`);
  const tradesRef      = ref(db, `rooms/${chatRoomId}/trades`);

  // ----- local state -----
  let me = {};                     // current player's DB object
  let currentPhase = "day";        // local copy of phase
  const usedShinigamiEye = { value: false }; // passable object for actions.js

  // ----- 参加登録（簡易） -----
  // GM フラグは localStorage の isGm を使っている想定
  const isGm = localStorage.getItem("isGm") === "true";
  const joinData = { joinedAt: Date.now(), alive: true };
  if (isGm) joinData.role = "gm";
  // update (v9: update via update(ref, obj))
  update(playersRef, joinData).catch(e => console.warn("playersRef update failed:", e));
  // (onDisconnect is omitted here; add if you export onDisconnect from firebase.js)

  // ===== フェーズ表示 / タイマー =====
  onValue(stateRef, (snap) => {
    const state = snap.val() || {};
    const { phase = "day", day = 1, phaseEndAt = null, phasePaused = false } = state;
    currentPhase = phase;
    let timeLeft = null;
    if (phaseEndAt) timeLeft = Math.max(0, Math.floor((phaseEndAt - Date.now()) / 1000));
    updatePhaseUI(phase, day, timeLeft, phasePaused);
  });

  // ===== メッセージ送信 =====
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      if (!msgInput) return;
      const text = msgInput.value.trim();
      if (!text) return;
      push(messagesRef, { text, name: playerName, time: Date.now() })
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

  // ===== メッセージ受信（LINE風表示）=====
  onValue(messagesRef, (snapshot) => {
    messagesList.innerHTML = ""; // sync
    const msgs = snapshot.val() || {};
    Object.values(msgs).forEach(msg => {
      const li = document.createElement("li");

      if (msg.name === "システム") {
        li.className = "system-message";
        li.textContent = msg.text;
        messagesList.appendChild(li);
        return;
      }

      const isSelf = msg.name === playerName;
      li.className = `msg-row ${isSelf ? "self" : "other"}`;

      const icon = document.createElement("div");
      icon.className = "icon";
      icon.textContent = msg.name ? msg.name.charAt(0) : "?";

      icon.addEventListener("click", () => {
        openActionMenu(icon, msg, {
          playerName,
          myRole: me.role,
          currentPhase,
          mainRoomId,
          playersListRef,
          usedShinigamiEye
        });
      });

      const msgContent = document.createElement("div");
      msgContent.className = "msg-content";

      const nameDiv = document.createElement("div");
      nameDiv.className = "msg-name";
      nameDiv.textContent = msg.name || "名無し";

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = msg.text;

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
    });

    requestAnimationFrame(() => {
      const container = chatBox || messagesList;
      container.scrollTop = container.scrollHeight;
      const last = messagesList.lastElementChild;
      if (last && last.scrollIntoView) last.scrollIntoView({ block: "end" });
    });
  });

  // ===== 行動完了ボタン =====
  if (actionBtn) {
    actionBtn.addEventListener("click", async () => {
      try {
        await set(child(actionsRef, playerName), true);
        actionBtn.style.display = "none";
        if (actionStatus) actionStatus.style.display = "block";
      } catch (e) {
        console.error("action set failed:", e);
      }
    });
  }

  // actions の変化を監視して「全員完了」を判定（GM が進行）
  onValue(actionsRef, async (snap) => {
    const actions = snap.val() || {};
    const playersSnap = await get(playersListRef);
    const players = playersSnap.val() || {};
    const total = Object.keys(players).length;
    const done  = Object.keys(actions).length;

    // 次フェーズでリセット（actions が空になったとき）
    if (done === 0) {
      if (actionStatus) actionStatus.style.display = "none";
      if (actionBtn) actionBtn.style.display = "inline-block";
    }

    // GM が全員完了を検知したら nextPhase を呼ぶ
    try {
      const meSnap = await get(playersRef);
      const meNow = meSnap.val() || {};
      if (total > 0 && done >= total && meNow.role === "gm") {
        const stSnap = await get(stateRef);
        const st = stSnap.val() || {};
        await nextPhaseInDB(st.phase, st.day, mainRoomId);
      }
    } catch (e) {
      console.error("action handling error:", e);
    }
  });

  // ===== 自分の状態監視（単一 onValue） =====
  onValue(playersRef, (snap) => {
    me = snap.val() || {};
    // GMコントロールの表示切替
    const gmControls = document.getElementById("gmControls");
    if (gmControls) {
      if (me.role === "gm") gmControls.style.display = "block"; else gmControls.style.display = "none";
    }

    // start ボタン（GM用）
    const startBtn = document.getElementById("startGameBtn");
    if (startBtn) {
      startBtn.onclick = async () => {
        try {
          await assignRolesAndProfiles(mainRoomId);
          await startPhaseInDB("morning", 1, PHASE_LENGTHS.morning, mainRoomId);
          alert("ゲームを開始しました！");
        } catch (e) {
          console.error("ゲーム開始エラー:", e);
          alert("ゲーム開始に失敗しました");
        }
      };
    }

    // 発言制御・観戦UI
    if (me.role === "gm" || me.alive === false) {
      if (sendBtn) sendBtn.disabled = true;
      if (actionBtn) actionBtn.disabled = true;
      showSpectatorUI();
    } else {
      if (sendBtn) sendBtn.disabled = false;
      if (actionBtn) actionBtn.disabled = false;
    }

    // UI更新
    renderMyPanels(me, sendTradeRequest, toKatakana);
    updateRoleDisplay(me.role);
  });

  // ===== trades の受信（交渉） =====
  onValue(tradesRef, (snap) => {
    const trades = snap.val() || {};
    // handle new trades via child_added is nicer but for simplicity we scan
    Object.entries(trades).forEach(([key, trade]) => {
      if (!trade) return;
      if (trade.from === playerName) return;
      if (trade.status !== "pending") return;

      const msg = (trade.type === "business") ? "名刺が届きました" : "情報カードが届きました";
      if (confirm(`${trade.from} から ${msg}。承認しますか？`)) {
        set(ref(db, `rooms/${chatRoomId}/trades/${key}/status`), "accepted");
        set(ref(db, `rooms/${chatRoomId}/trades/${key}/to`), playerName);

        // reflect to playersList
        if (trade.type === "business") {
          get(child(playersListRef, trade.from)).then(snapFrom => {
            const fromData = snapFrom.val() || {};
            push(child(playersListRef, `${playerName}/infoCards`)).then(_ => {
              // cannot push value then set easily; but we'll do a simple update:
              push(child(playersListRef, `${playerName}/infoCards`)).then(cardRef => {
                set(cardRef, fromData.profile ? JSON.stringify(fromData.profile) : "プロフィール情報");
              });
            });
          });
        } else if (trade.type === "info") {
          get(child(playersListRef, trade.from)).then(snapFrom => {
            const fromData = snapFrom.val() || {};
            const cards = Object.values(fromData.infoCards || {});
            const idx = parseInt(trade.index);
            if (cards[idx]) push(child(playersListRef, `${playerName}/infoCards`)).then(cardRef => set(cardRef, cards[idx]));
          });
        }
      } else {
        set(ref(db, `rooms/${chatRoomId}/trades/${key}/status`), "rejected");
        set(ref(db, `rooms/${chatRoomId}/trades/${key}/to`), playerName);
      }
    });
  });

}); // DOMContentLoaded end
