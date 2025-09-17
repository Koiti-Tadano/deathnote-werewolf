// assets/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getDatabase,
  ref as dbRef,
  child as dbChild,
  set as dbSet,
  get as dbGet,
  update as dbUpdate,
  remove as dbRemove,
  onValue as dbOnValue,
  push as dbPush
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// 再エクスポート（名前を揃える）
export const ref = dbRef;
export const child = dbChild;
export const set = dbSet;
export const get = dbGet;
export const update = dbUpdate;
export const remove = dbRemove;
export const onValue = dbOnValue;
export const push = dbPush;

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

