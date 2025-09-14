// === game.js ===
import { db } from "./firebase.js";
import { ref, get, child, update, push, set } from "./firebase.js";

// ===== 定数（フェーズ）=====
export const PHASE_ORDER   = ["morning", "day", "evening", "night"];
export const PHASE_LENGTHS = {
  morning: 60,
  day: 6 * 60,
  evening: 2 * 60,
  night: 2 * 60
};

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
  const given   = givenNames[Math.floor(Math.random() * givenNames.length)];
  return `${surname} ${given}`;
}

const outfits   = ["スーツ","ジャージ","着物","白衣","パーカー","セーラー服","作業着"];
const likes     = ["カレー","ゲーム","数学","犬","カラオケ","コーヒー"];
const dislikes  = ["虫","早起き","ピーマン","大人数の集まり"];
const strengths = ["運動","観察","記憶力","交渉","料理"];
const weaknesses= ["方向感覚","計算","嘘をつく","体力","集中力"];

function generateProfile() {
  return {
    outfit:  outfits[Math.floor(Math.random() * outfits.length)],
    like:    likes[Math.floor(Math.random() * likes.length)],
    dislike: dislikes[Math.floor(Math.random() * dislikes.length)],
    strong:  strengths[Math.floor(Math.random() * strengths.length)],
    weak:    weaknesses[Math.floor(Math.random() * weaknesses.length)]
  };
}

export function toKatakana(str) {
  return str.replace(/[a-zA-Zぁ-ん]/g, "カタカナ");
}

// ===== 役職/プロフィール/カード配布 =====
export async function assignRolesAndProfiles(roomId) {
  const playersListRef = ref(db, `rooms/${roomId}/players`);
  const messagesRef    = ref(db, `rooms/${roomId}/messages`);

  const snap    = await get(playersListRef);
  const players = snap.val() || {};
  const names   = Object.keys(players).filter(n => players[n].role !== "gm");

  if (names.some(n => players[n].role)) {
    console.log("役職は既に配布済みです");
    return;
  }

  const baseRoles = ["wolf","madman","detective","villager","villager","villager","villager"];
  const roles = [];
  for (let i = 0; i < names.length; i++) roles[i] = baseRoles[i] || "villager";

  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  const temp = {};
  names.forEach(n => {
    temp[n] = { fullName: generateFullName(), profile: generateProfile() };
  });

  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    const role = roles[i] || "villager";
    const { fullName, profile } = temp[n];

    const playerRef   = child(playersListRef, n);
    const infoCardsRef = child(playerRef, "infoCards");
    await update(playerRef, { role, fullName, profile });

    if (role === "madman") {
      const others = names.filter(x => x !== n);
      if (others.length) {
        const pick = temp[others[Math.floor(Math.random() * others.length)]].profile;
        await set(push(infoCardsRef), `人狼は ${pick.outfit} を着ている`);
        await set(push(infoCardsRef), `人狼は ${pick.like} が好き`);
      }
    } else if (role !== "wolf") {
      await set(push(infoCardsRef), `人狼は ${profile.outfit} を着ている`);
      await set(push(infoCardsRef), `人狼は ${profile.like} が好き`);
      await set(push(infoCardsRef), `人狼は ${profile.dislike} が嫌い`);
    }
  }

  const wolfSnap = await get(playersListRef);
  const wolfEntry = wolfSnap.val();
  const entries = Object.entries(wolfEntry || {});
  const wolfKV = entries.find(([_, v]) => v.role === "wolf");
  if (wolfKV) {
    const wolfFull = wolfKV[1].fullName || "";
    const vowels   = (wolfFull.match(/[aiueoアイウエオ]/gi) || []).length;
    const candidates = entries.filter(([_, v]) => v.role !== "wolf");
    if (candidates.length) {
      const [targetName] = candidates[Math.floor(Math.random() * candidates.length)];
      const targetInfoRef = child(child(playersListRef, targetName), "infoCards");
      await set(push(targetInfoRef), `人狼のフルネームには母音が ${vowels} 個含まれている`);
    }
  }

  await set(push(messagesRef), {
    text: "役職とプロフィールが配布されました。",
    name: "システム",
    time: Date.now()
  });
}

const startBtn = document.getElementById("startBtn");
if (startBtn && !startBtnListenerAdded) {
  startBtn.addEventListener("click", async () => {
    const startedSnap = await stateRef.child("started").once("value");
    if (startedSnap.val()) return; // 二重起動防止

    await assignRolesAndProfiles(mainRoomId);
    await stateRef.update({ started: true });
    await startPhaseInDB("morning", 1, PHASE_LENGTHS.morning, mainRoomId);
    startBtn.style.display = "none";
  });
  startBtnListenerAdded = true;
}

// ===== フェーズ進行 =====
export async function startPhaseInDB(phase, day, durationSec, roomId) {
  const stateRef    = ref(db, `rooms/${roomId}/state`);
  const actionsRef  = ref(db, `rooms/${roomId}/actions`);
  const messagesRef = ref(db, `rooms/${roomId}/messages`);

  const endAt = Date.now() + durationSec * 1000;

  await set(stateRef, {
    phase,
    day,
    phaseEndAt: endAt,
    phasePaused: false
  });

  await set(actionsRef, {});

  await set(push(messagesRef), {
    text: `フェーズ開始: Day ${day} ${phase}`,
    name: "システム",
    time: Date.now()
  });
}

export async function nextPhaseInDB(phase, day, roomId) {
  let idx = PHASE_ORDER.indexOf(phase);
  let nextPhase = "morning";
  let nextDay   = day;

  if (idx >= 0 && idx < PHASE_ORDER.length - 1) {
    nextPhase = PHASE_ORDER[idx + 1];
  } else {
    nextPhase = "morning";
    nextDay++;
  }

  const duration = PHASE_LENGTHS[nextPhase] || 60;
  await startPhaseInDB(nextPhase, nextDay, duration, roomId);
}
