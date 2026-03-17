const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { computePots } = require('./pot');
const { compareHands, describeHandResult } = require('./poker');


const db = getFirestore();

const SMALL_BLIND_ANTE = 5;
const BIG_BLIND_ANTE = 10;

const deck = [
  { suit: "heart", value: "A" },
  { suit: "heart", value: "2" },
  { suit: "heart", value: "3" },
  { suit: "heart", value: "4" },
  { suit: "heart", value: "5" },
  { suit: "heart", value: "6" },
  { suit: "heart", value: "7" },
  { suit: "heart", value: "8" },
  { suit: "heart", value: "9" },
  { suit: "heart", value: "10" },
  { suit: "heart", value: "J" },
  { suit: "heart", value: "Q" },
  { suit: "heart", value: "K" },

  { suit: "diamond", value: "A" },
  { suit: "diamond", value: "2" },
  { suit: "diamond", value: "3" },
  { suit: "diamond", value: "4" },
  { suit: "diamond", value: "5" },
  { suit: "diamond", value: "6" },
  { suit: "diamond", value: "7" },
  { suit: "diamond", value: "8" },
  { suit: "diamond", value: "9" },
  { suit: "diamond", value: "10" },
  { suit: "diamond", value: "J" },
  { suit: "diamond", value: "Q" },
  { suit: "diamond", value: "K" },

  { suit: "club", value: "A" },
  { suit: "club", value: "2" },
  { suit: "club", value: "3" },
  { suit: "club", value: "4" },
  { suit: "club", value: "5" },
  { suit: "club", value: "6" },
  { suit: "club", value: "7" },
  { suit: "club", value: "8" },
  { suit: "club", value: "9" },
  { suit: "club", value: "10" },
  { suit: "club", value: "J" },
  { suit: "club", value: "Q" },
  { suit: "club", value: "K" },

  { suit: "spade", value: "A" },
  { suit: "spade", value: "2" },
  { suit: "spade", value: "3" },
  { suit: "spade", value: "4" },
  { suit: "spade", value: "5" },
  { suit: "spade", value: "6" },
  { suit: "spade", value: "7" },
  { suit: "spade", value: "8" },
  { suit: "spade", value: "9" },
  { suit: "spade", value: "10" },
  { suit: "spade", value: "J" },
  { suit: "spade", value: "Q" },
  { suit: "spade", value: "K" },
];


function shuffleDeck(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

exports.autoClearFinishedGame = (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.status === after.status) return null;
  if (after.status !== "finished") return null;


  event.data.after.ref.set({
    status: "waiting",
    playersInGame: [],
    playersActiveInHand: [],
    playerDetails: {},
    dealerIndex: -1, // resets the turn
    playersInGameToRemove: [],
    bettingState: { currentTurn: "", currentBet: "", lastRaiseAmount: 0, callAmount: 0, minimumRaiseTo: 0 },
    playersFolded: [],
    lastMove: "Game finished - room reset",
    timeOfLastMove: FieldValue.serverTimestamp(),
  });

  return null;
};

exports.autoDeal = async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.phase === after.phase) return null;
  if (after.phase !== "deal") return null;

  const playersInGame = after.playersInGame ?? [];
  const lastMove = after.lastMove ?? "";
  const playerCount = playersInGame.length;

  if (playerCount < 2) return null;

  const previousDealerIndex = after.dealerIndex ?? 0;
  const newDealerIndex = (previousDealerIndex + 1) % playerCount;
  let remainingDeck = shuffleDeck(deck);

  const playerUpdates = playersInGame.map(async (playerUid) => {
    const playerHandRef = db.collection("playerHands").doc(playerUid);

    const hand = remainingDeck.slice(0, 5);
    remainingDeck = remainingDeck.slice(5);

    return playerHandRef.set(
      {
        hand,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await Promise.all(playerUpdates);

  const smallBlindIndex = (newDealerIndex + 1) % playersInGame.length;
  const bigBlindIndex = (newDealerIndex + 2) % playersInGame.length;

  const smallBlind = playersInGame[smallBlindIndex];
  const bigBlind = playersInGame[bigBlindIndex];

  const playerDetails = {};
  for (const [uid, details] of Object.entries(after.playerDetails ?? {})) {
    playerDetails[uid] = { ...details, isFolded: false };
  }

  const placeBlind = (uid, ante) => {
    const p = playerDetails[uid];
    if (!p) return 0;
    const balance = p.balance ?? 0;
    const bet = balance >= ante ? ante : balance;
    p.bet = bet;
    p.balance = balance - bet;
    return bet;
  };

  placeBlind(smallBlind, SMALL_BLIND_ANTE);
  placeBlind(bigBlind, BIG_BLIND_ANTE);

  await event.data.after.ref.update({
    phase: "assign-next-turn",
    playersActiveInHand: playersInGame,
    dealerIndex: newDealerIndex,
    smallBlind,
    bigBlind,
    playerDetails,
    lastMove: `${lastMove} Players dealt a new hand.`,
    timeOfLastMove: FieldValue.serverTimestamp(),
    hasBigBlindBet: false,
  });

  return null;
};

exports.updatePotInfo = async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (!after) return null;

  const beforeDetails = before?.playerDetails ?? {};
  const afterDetails = after.playerDetails ?? {};

  // Prevent running if playerDetails didn't change
  if (JSON.stringify(beforeDetails) === JSON.stringify(afterDetails)) {
    return null;
  }

  // Compute new pots
  const newPots = computePots(afterDetails);

  const existingPots = after.potInfo ?? [];

  // Prevent infinite loop by checking if pots actually changed
  if (JSON.stringify(existingPots) === JSON.stringify(newPots)) {
    return null;
  }

  await event.data.after.ref.update({
    potInfo: newPots,
    potLastUpdated: FieldValue.serverTimestamp(),
  });

  return null;
};


exports.assignNextTurn = async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.phase === after.phase) return null;
  if (after.phase !== "assign-next-turn") return null;

  const playerDetails = after.playerDetails ?? {};
  const playersActiveInHand = after.playersActiveInHand ?? [];
  const bigBlindUid = after.bigBlind;
  const hasBigBlindBet = after.hasBigBlindBet ?? false;

  const beforeDetails = before.playerDetails ?? {};
  const afterDetails = after.playerDetails ?? {};

  // Detect which player just placed or increased a bet.
  // If exactly one player increased their bet, we treat them as the last actor
  // and start scanning for the next player AFTER them in table order.
  const betIncreasedPlayers = playersActiveInHand.filter((uid) => {
    const beforeBet = beforeDetails[uid]?.bet ?? 0;
    const afterBet = afterDetails[uid]?.bet ?? 0;
    return afterBet > beforeBet;
  });

  const lastActorUid =
    betIncreasedPlayers.length === 1 ? betIncreasedPlayers[0] : null;

  // Detect the first assignment of a new betting round immediately
  // after blinds have been posted. In that case we want the scan
  // to start from UTG (the player after the big blind), which we
  // can model by treating the big blind as the "last actor".
  const isNewHandAssign =
    before.phase === "deal" && after.phase === "assign-next-turn";

  const tableOrder = after.playersInGame ?? [];

  let effectiveLastActorUid = lastActorUid;

  // New hand: treat the big blind as the last actor so that scan
  // starts from UTG (player to the left of the big blind).
  if (
    !effectiveLastActorUid &&
    isNewHandAssign &&
    bigBlindUid &&
    playersActiveInHand.includes(bigBlindUid)
  ) {
    effectiveLastActorUid = bigBlindUid;
  }

  // Fallback: if we still don't have a last actor, use the player who
  // most recently had the turn (from the previous state). This lets us
  // preserve turn order across folds where bets don't change.
  if (!effectiveLastActorUid) {
    const currentTurnBefore = before.bettingState?.currentTurn ?? "";
    if (currentTurnBefore) {
      effectiveLastActorUid = currentTurnBefore;
    }
  }

  if (playersActiveInHand.length <= 1) {
    // If zero or one player remains active in the hand, there is no one
    // left who can meaningfully act. End the betting round immediately.
    await event.data.after.ref.update({ phase: "settle" });
    console.log("No further action possible, ending betting round");
    return null;
  }

  // Determine highest current bet
  const currentHighestBet = Math.max(
    ...playersActiveInHand.map((uid) => playerDetails[uid]?.bet ?? 0)
  );

  // Determine the order in which we scan for the next player.
  // Normally we follow playersActiveInHand order, but if we can identify
  // the last actor, we start AFTER them so that we don't give them two
  // actions in a row. If that last actor is no longer active (e.g. they
  // just folded), we start from the next seat clockwise in table order
  // that is still active.
  let scanOrder = playersActiveInHand;

  if (effectiveLastActorUid && playersActiveInHand.includes(effectiveLastActorUid)) {
    const startIdx = playersActiveInHand.indexOf(effectiveLastActorUid);
    scanOrder = [
      ...playersActiveInHand.slice(startIdx + 1),
      ...playersActiveInHand.slice(0, startIdx + 1),
    ];
  } else if (effectiveLastActorUid && tableOrder.includes(effectiveLastActorUid) && playersActiveInHand.length > 0) {
    const idx = tableOrder.indexOf(effectiveLastActorUid);
    if (idx !== -1) {
      let candidate = null;
      for (let i = 1; i <= tableOrder.length; i++) {
        const uid = tableOrder[(idx + i) % tableOrder.length];
        if (playersActiveInHand.includes(uid)) {
          candidate = uid;
          break;
        }
      }

      if (candidate) {
        const startIdx = playersActiveInHand.indexOf(candidate);
        scanOrder = [
          ...playersActiveInHand.slice(startIdx),
          ...playersActiveInHand.slice(0, startIdx),
        ];
      }
    }
  }

  // Find next player who needs to act (skip all-in players — they cannot add more)
  let nextPlayerUid = null;
  for (const uid of scanOrder) {
    const p = playerDetails[uid];
    if (!p) continue;
    const isAllIn = (p.balance ?? 0) === 0;
    if (isAllIn) continue;

    const needsToAct = (p.bet < currentHighestBet) || (uid === bigBlindUid && !hasBigBlindBet);
    if (needsToAct) {
      nextPlayerUid = uid;
      break;
    }
  }

  // If no one needs to act, end betting round
  if (!nextPlayerUid) {
    console.log("No one needs to act, ending betting round");
    await event.data.after.ref.update({ phase: "settle" });
    return null;
  }

  const nextPlayer = playerDetails[nextPlayerUid];

  // Compute max bet this player can do
  const maxBet = nextPlayer.balance + (nextPlayer.bet ?? 0);

  // If next player is the big blind, mark that they’ve now had a chance to act
  let newHasBigBlindBet = hasBigBlindBet;
  if (nextPlayerUid === bigBlindUid) newHasBigBlindBet = true;

  await event.data.after.ref.update({
    "bettingState.currentTurn": nextPlayerUid,
    "bettingState.currentBet": currentHighestBet,
    "bettingState.lastRaiseAmount": after.bettingState?.lastRaiseAmount ?? 0,
    "bettingState.callAmount": Math.max(0, currentHighestBet - (nextPlayer.bet ?? 0)),
    "bettingState.minimumRaiseTo": currentHighestBet + (after.bettingState?.lastRaiseAmount ?? 0),
    "bettingState.maxBet": maxBet,
    hasBigBlindBet: newHasBigBlindBet,
    phase: "bet",
    timeOfLastMove: FieldValue.serverTimestamp(),
  });

  return null;
};

exports.autoSettleV2 = async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.phase === after.phase) return null;
  if (after.phase !== "settle") return null;

  const playerDetails = { ...(after.playerDetails ?? {}) };
  const playersInGame = after.playersInGame ?? [];

  // Always recompute pots from the current playerDetails so that:
  // - any stale potInfo on the document is ignored, and
  // - multiple pots that share the same eligible players are merged by computePots.
  const potInfo = computePots(playerDetails);

  // If there are no pots, just reset bets, drop zero-balance players,
  // and decide next phase
  if (potInfo.length === 0) {
    for (const uid of Object.keys(playerDetails)) {
      if (playerDetails[uid]) playerDetails[uid].bet = 0;
    }

    const remainingActive = playersInGame.filter(
      (uid) => (playerDetails[uid]?.balance ?? 0) > 0
    );
    const zeroBalance = playersInGame.filter(
      (uid) => (playerDetails[uid]?.balance ?? 0) === 0
    );
    const updatedplayersInGame = playersInGame.filter(
      (uid) => !zeroBalance.includes(uid)
    );

    await event.data.after.ref.update({
      playerDetails,
      playersInGame: updatedplayersInGame,
      playersActiveInHand: updatedplayersInGame,
      phase: remainingActive.length >= 2 ? "deal" : "winner",
      lastMove: "Hand settled.",
      timeOfLastMove: FieldValue.serverTimestamp(),
    });
    return null;
  }

  // Collect all players that might need hands fetched
  const allEligible = new Set();
  for (const pot of potInfo) {
    for (const uid of pot.eligiblePlayers ?? []) {
      allEligible.add(uid);
    }
  }

  const handSnaps = await Promise.all(
    [...allEligible].map((uid) =>
      db.collection("playerHands").doc(uid).get()
    )
  );

  const handsByUid = {};
  [...allEligible].forEach((uid, i) => {
    const snap = handSnaps[i];
    if (snap.exists && snap.data().hand?.length === 5) {
      handsByUid[uid] = snap.data().hand;
    }
  });

  const winningsByUid = {};
  const settleMessages = [];

  for (const pot of potInfo) {
    const amount = pot.amount ?? 0;
    const eligiblePlayers = (pot.eligiblePlayers ?? []).filter(
      (uid) => handsByUid[uid]
    );
    if (eligiblePlayers.length === 0) continue;

    let winnerUid;

    if (eligiblePlayers.length === 1) {
      winnerUid = eligiblePlayers[0];
      settleMessages.push(`${winnerUid.slice(-2)} won pot (${amount}).`);
    } else {
      winnerUid = eligiblePlayers.reduce((best, uid) => {
        const cmp = compareHands(handsByUid[uid], handsByUid[best]);
        if (cmp > 0) return uid;
        if (cmp < 0) return best;
        // exact tie -> random winner between the two
        return Math.random() < 0.5 ? uid : best;
      });

      const other = eligiblePlayers.find((u) => u !== winnerUid);
      const desc =
        other != null
          ? describeHandResult(handsByUid[winnerUid], handsByUid[other])
          : "";

      settleMessages.push(
        desc
          ? `${desc} ${winnerUid.slice(-2)} won ${amount}.`
          : `${winnerUid.slice(-2)} won ${amount}.`
      );
    }

    winningsByUid[winnerUid] =
      (winningsByUid[winnerUid] ?? 0) + amount;
  }

  // Apply winnings to balances
  for (const [uid, add] of Object.entries(winningsByUid)) {
    if (playerDetails[uid]) {
      playerDetails[uid].balance =
        (playerDetails[uid].balance ?? 0) + add;
    }
  }

  // Reset all bets
  for (const uid of Object.keys(playerDetails)) {
    if (playerDetails[uid]) playerDetails[uid].bet = 0;
  }

  const updatedplayersInGame = playersInGame.filter(
    (uid) => (playerDetails[uid]?.balance ?? 0) > 0
  );

  await event.data.after.ref.update({
    playerDetails,
    playersInGame: updatedplayersInGame,
    playersActiveInHand: updatedplayersInGame,
    phase: updatedplayersInGame.length >= 2 ? "deal" : "winner",
    lastMove: settleMessages.join(" ") || "Hand settled.",
    timeOfLastMove: FieldValue.serverTimestamp(),
  });
  return null;
};
