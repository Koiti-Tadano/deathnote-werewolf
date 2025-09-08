// === ui.js ===

// GM でない人 or 死亡した人に観戦モードUIを表示
export function showSpectatorUI() {
  const gmControls = document.getElementById("gmControls");
  const sendBtn    = document.getElementById("sendBtn");
  const actionBtn  = document.getElementById("actionDoneBtn");

  if (gmControls) gmControls.style.display = "none";
  if (sendBtn)    sendBtn.disabled = true;
  if (actionBtn)  actionBtn.disabled = true;
}

// 自分のプロフィール・アイテムを描画
export function renderMyPanels(me, sendTradeRequest, toKatakana) {
  const profEl  = document.getElementById("profileContent");
  const itemsEl = document.getElementById("itemsContent");

  // プロフィール表示
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
    const shareBtn = profEl.querySelector(".shareBtn");
    if (shareBtn) {
      shareBtn.onclick = () => sendTradeRequest("profile");
    }
  }

  // 持ち物（名刺 + 情報カード）
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

    itemsEl.querySelectorAll(".shareBtn").forEach(btn => {
      btn.onclick = () => sendTradeRequest(btn.dataset.type, btn.dataset.index);
    });
  }
}

// 役職を画面に表示
export function updateRoleDisplay(role) {
  const roleEl = document.getElementById("myRoleDisplay");
  if (roleEl) {
    roleEl.textContent = `あなたの役職: ${role || ""}`;
  }
}

// フェーズ・タイマーを表示
export function updatePhaseUI(phase, day, timeLeftSec, paused) {
  const jp = { morning: "朝", day: "昼", evening: "夕方", night: "夜" }[phase] || phase;

  document.querySelectorAll("#phaseInfo").forEach(el => {
    el.textContent = `Day ${day} — ${jp}`;
  });

  if (paused) {
    document.querySelectorAll("#phaseTimer").forEach(el => {
      el.textContent = "一時停止中（人数不足）";
    });
    return;
  }

  if (timeLeftSec == null) {
    document.querySelectorAll("#phaseTimer").forEach(el => {
      el.textContent = "残り --";
    });
    return;
  }

  document.querySelectorAll("#phaseTimer").forEach(el => {
    el.textContent = `残り ${timeLeftSec}s`;
  });
}
