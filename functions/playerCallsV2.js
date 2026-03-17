const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();


exports.joinGame = async (request) => {
  try {
    if (!request.auth) {
      throw new Error("Not Authorized.");
    }

    const uid = request.auth.uid;
    const { gameId } = request.data;

    if (!gameId) {
      throw new Error("No game ID.");
    }

    const gameRef = db.collection("gamesV2").doc(gameId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(gameRef);

      if (!snap.exists) {
        throw new Error("No snap");
      }

      const gameData = snap.data();

      const gameStatus = gameData.status ?? "";

      if (gameStatus === "active") {
        throw new Error("Cannot join active game.")
      }

      const playersInGame = gameData.playersInGame ?? [];
      const playerDetails = gameData.playerDetails ?? {};

      if (playersInGame.includes(uid)) {
        return;
      }

      if (gameStatus === "waiting" && playersInGame.length >= 6) {
        throw new Error("Lobby is full.");
      }

      playersInGame.push(uid);

      playerDetails[uid] = {
        balance: 100,
        bet: 0,
        icon: 2,
        isFolded: false
      };


      tx.update(gameRef, {
        playersInGame,
        playerDetails,
        lastMove: `${uid.slice(-2)} joined the game`,
        timeOfLastMove: FieldValue.serverTimestamp()
      });
    });

    return { success: true };
  } catch (error) {

    throw new Error(`Unable to join the game. ${error}`);
  }
};

exports.leaveGame = async (request) => {
  try {
    if (!request.auth) {
      throw new Error("Not Authorized.");
    }

    const uid = request.auth.uid;
    const { gameId } = request.data;

    if (!gameId) {
      throw new Error("No game ID.");
    }

    const gameRef = db.collection("gamesV2").doc(gameId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(gameRef);

      if (!snap.exists) {
        throw new Error("Game not found.");
      }

      const gameData = snap.data();
      const status = gameData.status ?? "waiting";
      const playerDetails = gameData.playerDetails ?? {};
      const playersInGame = gameData.playersInGame ?? [];
      const playersActiveInHand =
        gameData.playersActiveInHand ?? gameData.playersInGame ?? [];
      const currentPhase = gameData.phase ?? "";

      if (!playersInGame.includes(uid)) {
        throw new Error("You are not in this game.");
      }

      const updatedplayersInGame = playersInGame.filter((id) => id !== uid);
      const updatedPlayersActiveInHand = playersActiveInHand.filter(
        (id) => id !== uid
      );

      const updatedPlayerDetails = { ...playerDetails };

      if (status === "active") {
        if (!updatedPlayerDetails[uid]) {
          throw new Error("Player details missing.");
        }

        updatedPlayerDetails[uid] = {
          ...updatedPlayerDetails[uid],
          balance: 0,
          bet: 0,
          isFolded: true,
        };

        const remainingActive = updatedplayersInGame.filter(
          (id) => (updatedPlayerDetails[id]?.balance ?? 0) > 0
        );

        let nextPhase = currentPhase;
        if (remainingActive.length < 2) {
          nextPhase = "winner";
        } else if (!["deal", "settle", "winner"].includes(currentPhase)) {
          nextPhase = "assign-next-turn";
        }

        delete updatedPlayerDetails[uid];

        tx.update(gameRef, {
          playersInGame: updatedplayersInGame,
          playersActiveInHand: updatedPlayersActiveInHand,
          playerDetails: updatedPlayerDetails,
          playersInGameToRemove: [],
          lastMove: `${uid.slice(-2)} left the game (forfeit).`,
          phase: nextPhase,
          timeOfLastMove: FieldValue.serverTimestamp(),
        });

        return;
      }

      delete updatedPlayerDetails[uid];

      tx.update(gameRef, {
        playersInGame: updatedplayersInGame,
        playersActiveInHand: updatedPlayersActiveInHand,
        playerDetails: updatedPlayerDetails,
        playersInGameToRemove: [],
        lastMove: `${uid.slice(-2)} left the game`,
        phase: currentPhase,
        timeOfLastMove: FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error) {
    throw new Error(`Unable to leave the game. ${error.message}`);
  }
};

exports.updatePlayerIcon = async (request) => {
  try {
    if (!request.auth) {
      throw new Error("Not Authorized.");
    }

    const uid = request.auth.uid;
    const { gameId, icon } = request.data;

    if (!gameId) {
      throw new Error("No game ID.");
    }

    if (icon === undefined || icon === null) {
      throw new Error("No icon value provided.");
    }

    if (typeof icon !== "number") {
      throw new Error("Icon must be a number.");
    }

    const gameRef = db.collection("gamesV2").doc(gameId);

    await gameRef.update({
      [`playerDetails.${uid}.icon`]: icon
    });

    return { success: true };
  } catch (error) {
    throw new Error(`Unable to update icon. ${error}`);
  }
};

exports.fold = async (request) => {
  try {
    if (!request.auth) {
      throw new Error("Not Authorized.");
    }

    const uid = request.auth.uid;
    const { gameId } = request.data;

    if (!gameId) {
      throw new Error("No game ID.");
    }

    const gameRef = db.collection("gamesV2").doc(gameId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(gameRef);

      if (!snap.exists) {
        throw new Error("Game not found.");
      }

      const gameData = snap.data();

      const phase = gameData.phase ?? "";
      const bettingState = gameData.bettingState ?? {};
      const currentTurn = bettingState.currentTurn ?? "";
      const playersInGame = gameData.playersInGame ?? [];
      const playersActiveInHand =
        gameData.playersActiveInHand ?? gameData.playersInGame ?? [];
      const playerDetails = gameData.playerDetails ?? {};

      if (!playersInGame.includes(uid)) {
        throw new Error("You are not in this game.");
      }

      if (!playersActiveInHand.includes(uid)) {
        throw new Error("You are not active in this hand.");
      }

      if (phase !== "bet") {
        throw new Error("You can only fold during the betting phase.");
      }

      if (currentTurn !== uid) {
        throw new Error("It is not your turn.");
      }

      const updatedPlayersActiveInHand = playersActiveInHand.filter((id) => id !== uid);

      const updatedPlayerDetails = { ...playerDetails };
      const player = updatedPlayerDetails[uid] ?? {};
      updatedPlayerDetails[uid] = {
        ...player,
        isFolded: true,
      };

      const betAmount = player.bet ?? 0;
      const descriptionOfFolded = `${uid.slice(-2)} folded with ${betAmount} chips`;

      tx.update(gameRef, {
        playersActiveInHand: updatedPlayersActiveInHand,
        playerDetails: updatedPlayerDetails,
        // Clear any queued folds; we no longer rely on the removeFolded trigger.
        playersFolded: [],
        phase: "assign-next-turn",
        lastMove: descriptionOfFolded,
        timeOfLastMove: FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error) {
    throw new Error(`Unable to leave the game. ${error.message}`);
  }
};

exports.bet = async (request) => {
  try {
    if (!request.auth) {
      throw new Error("Not Authorized.");
    }

    const uid = request.auth.uid;
    const { gameId, amount } = request.data;

    if (!gameId) {
      throw new Error("No game ID.");
    }
    if (amount === undefined || amount === null) {
      throw new Error("No bet amount.");
    }
    if (typeof amount !== "number" || amount < 0) {
      throw new Error("Amount must be a non-negative number.");
    }

    const gameRef = db.collection("gamesV2").doc(gameId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(gameRef);
      if (!snap.exists) {
        throw new Error("Game not found.");
      }

      const gameData = snap.data();
      const phase = gameData.phase ?? "";
      const bettingState = gameData.bettingState ?? {};
      const currentTurn = bettingState.currentTurn ?? "";
      const maxBet = bettingState.maxBet ?? 0;
      const currentBet = bettingState.currentBet ?? 0;

      if (phase !== "bet") {
        throw new Error("You can only bet during the betting phase.");
      }

      if (currentTurn !== uid) {
        throw new Error("It is not your turn.");
      }

      const playersInGame = gameData.playersInGame ?? [];
      const playersActiveInHand = gameData.playersActiveInHand ?? gameData.playersInGame ?? [];
      if (!playersInGame.includes(uid)) {
        throw new Error("You are not in this game.");
      }
      if (!playersActiveInHand.includes(uid)) {
        throw new Error("You are not active in this hand.");
      }

      const playerDetails = gameData.playerDetails ?? {};
      const player = playerDetails[uid];
      if (!player) {
        throw new Error("Player details missing.");
      }

      const balance = player.balance ?? 0;
      const existingBet = player.bet ?? 0;

      if (amount < existingBet) {
        throw new Error("Bet cannot be less than your current bet.");
      }
      if (amount > maxBet) {
        throw new Error(`Bet cannot exceed maximum bet (${maxBet}).`);
      }

      const isAllIn = amount === existingBet + balance;
      if (!isAllIn && amount < currentBet) {
        throw new Error(`You must call at least ${currentBet} or go all-in.`);
      }

      const additional = amount - existingBet;
      if (additional > balance) {
        throw new Error("Not enough balance.");
      }

      const updatedPlayerDetails = { ...playerDetails };
      updatedPlayerDetails[uid] = {
        ...player,
        bet: amount,
        balance: balance - additional,
      };

      tx.update(gameRef, {
        playerDetails: updatedPlayerDetails,
        phase: "assign-next-turn",
        lastMove: `${uid.slice(-2)} bet ${amount}.`,
        timeOfLastMove: FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error) {
    throw new Error(error.message || `Unable to place bet.`);
  }
};

exports.startGame = async (request) => {
  try {
    if (!request.auth) {
      throw new Error("Not Authorized.");
    }

    const uid = request.auth.uid;
    const { gameId } = request.data;


    if (!gameId) {
      throw new Error("No game ID.");
    }

    const gameRef = db.collection("gamesV2").doc(gameId);
    const gameSnap = await gameRef.get();

    if (!gameSnap.exists) {
      throw new Error("Game not found.");
    }

    const gameData = gameSnap.data();

    if (!gameData.playersInGame || !gameData.playersInGame.includes(uid)) {
      throw new Error("You are not a player in this game.");
    }

    if (gameData.playersInGame.length < 2) {
      throw new Error("Not enough players to start the game.");
    }

    await gameRef.update({
      status: "active",
      phase: "deal",
      lastMove: `${uid.slice(-2)} started the game.`,
      timeOfLastMove: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    throw new Error(`Unable to start the game. ${error}`);
  }
};