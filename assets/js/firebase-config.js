// assets/js/Firebase.config.js
var firebaseConfig = {
  apiKey: "AIzaSyBtr461rgEf3kfeXCjDUr8de3H1YjDWlNg",
  authDomain: "deathnote-werewolf.firebaseapp.com",
  databaseURL: "https://deathnote-werewolf-default-rtdb.firebaseio.com",
  projectId: "deathnote-werewolf",
  storageBucket: "deathnote-werewolf.firebasestorage.app",
  messagingSenderId: "488023525397",
  appId: "1:488023525397:web:4edf8ac542cffb6e1de61c"
};

// Firebase初期化（これがないとchat.jsが動かない）
firebase.initializeApp(firebaseConfig);
