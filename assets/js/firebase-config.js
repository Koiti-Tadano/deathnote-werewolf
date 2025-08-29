// assets/js/Firebase.config.js
var firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "XXXXXXXX",
  appId: "1:XXXXXXXX:web:XXXXXXXX"
};

// Firebase初期化（これがないとchat.jsが動かない）
firebase.initializeApp(firebaseConfig);
