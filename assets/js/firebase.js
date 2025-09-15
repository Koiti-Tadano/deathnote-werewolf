// === firebase.js ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, onValue, push } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
// assets/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
// Firebase 設定（自分のプロジェクトに置き換えてね！）
const firebaseConfig = {
  apiKey: "AIzaSyBtr461rgEf3kfeXCjDUr8de3H1YjDWlNg",
  authDomain: "deathnote-werewolf.firebaseapp.com",
  databaseURL: "https://deathnote-werewolf-default-rtdb.firebaseio.com",
  projectId: "deathnote-werewolf",
  storageBucket: "deathnote-werewolf.firebasestorage.app",
  messagingSenderId: "488023525397",
  appId: "1:488023525397:web:4edf8ac542cffb6e1de61c"

};

// 初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 必要なものをエクスポート
export {
  db,
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  push
};
