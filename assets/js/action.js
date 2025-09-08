// === actions.js ===
import { db } from "./firebase.js";

// アクションメニューを表示
export function openActionMenu(anchorEl, msg, context) {
  const { playerName, myRole, currentPhase, mainRoomId, playersListRef, usedShinigamiEye } = context;

  if (msg.name === "GM" || myRole === "gm") return;
  const prev = document.querySelector(".action-menu");
  if (prev) prev.remove();

  const menu = document.createElement("div");
  menu.className = "action-menu";

  // 個別チャット
  const btnDM = document.createElement("button");
  btnDM.textContent = "個別チャット";
  btnDM.onclick = () => {
    const ids = [playerName, msg.name].sort();
    const privateRoomId = `${mainRoomId}-dm-${ids[0]}-${ids[1]}`;
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
        alert("キル成功！");
      } else {
        alert("キル失敗（名前が一致しません）");
      }
      menu.remove();
    };
    menu.appendChild(btnKill);
  }

  // 死神の目（夜・一度だけ）
  if (myRole === "wolf" && currentPhase === "night" && !usedShinigamiEye.value) {
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
      usedShinigamiEye.value = true;
      const targetSnap = await playersListRef.child(msg.name).once("value");
      const targetData = targetSnap.val();
      if (targetData?.fullName) {
        const wolvesSnap = await playersListRef.once("value");
        const wolves = Object.entries(wolvesSnap.val() || {}).filter(([_, v]) => v.role === "wolf");
        wolves.forEach(([wolfName]) => {
          db.ref(`rooms/${mainRoomId}/wolfNotes/${wolfName}`).push({
            text: `${msg.name} の本名は ${targetData.fullName} です`,
            time: Date.now()
          });
        });
      }
      menu.remove();
    };
    menu.appendChild(btnEye);
  }

  // 探偵（夜のみ）
  if (myRole === "detective" && currentPhase === "night") {
    const btnDetective = document.createElement("button");
    btnDetective.textContent = "探偵";
    btnDetective.onclick = () => {
      const gmRoomId = `${mainRoomId}-gm-${playerName}`;
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
      db.ref(`rooms/${mainRoomId}/votes/${playerName}`).set(msg.name);
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
