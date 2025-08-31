/*
rooms: {
  {roomId}: {
    state: {
      phase: "day",   // 現在のフェーズ
      day: 1          // 何日目か
    },
    players: {
      {playerId}: {
        name: "太郎",
        role: "wolf",      // 役職
        alive: true,       // 生死
        usedShinigami: false // 死神の目使用済みか
      }
    },
    messages: {
      {msgId}: {
        name: "太郎",
        text: "こんにちは",
        time: 16934567890
      }
    },
    actions: {
      {playerId}: true   // 行動完了ボタン押したか
    },
    votes: {
      {playerId}: "targetPlayerId"
    },
    kills: {
      {wolfId}: "targetPlayerId"
    },
    shinigami: {
      {wolfId}: "targetPlayerId"
    }
  }
}
*/
