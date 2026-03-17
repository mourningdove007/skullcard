const {
  updateTriggersV2,
  makeTriggerEvent,
  resetMocks,
} = require("./integrationTestUtilsV2");

beforeEach(() => {
  resetMocks();
});

describe("assignNextTurn: multi-hand rotation with four players", () => {
  test("for a new hand the first turn always goes to UTG (player after the big blind)", async () => {
    const players = ["p1-uid", "p2-uid", "p3-uid", "p4-uid"];

    const settledAfter = {
      status: "active",
      phase: "settle",
      playersInGame: players,
      playersActiveInHand: players,
      dealerIndex: 3,
      smallBlind: "p2-uid",
      bigBlind: "p3-uid",
      hasBigBlindBet: true,
      bettingState: {
        currentTurn: "",
        currentBet: 0,
        lastRaiseAmount: 10,
        callAmount: 0,
        minimumRaiseTo: 0,
        maxBet: 200,
      },
      playerDetails: {
        "p1-uid": { balance: 100, bet: 0, icon: 1, isFolded: false },
        "p2-uid": { balance: 100, bet: 0, icon: 2, isFolded: false },
        "p3-uid": { balance: 100, bet: 0, icon: 3, isFolded: false },
        "p4-uid": { balance: 100, bet: 0, icon: 4, isFolded: false },
      },
      potInfo: [],
      playersInGameToRemove: [],
      lastMove: "Previous hand done.",
    };

    const settledBefore = { ...settledAfter, phase: "bet" };
    const settleEvent = makeTriggerEvent(settledBefore, settledAfter);
    await updateTriggersV2.autoSettleV2(settleEvent);

    expect(settleEvent.ref.update).toHaveBeenCalledTimes(1);
    const [settleUpdate] = settleEvent.ref.update.mock.calls[0];
    expect(settleUpdate.phase).toBe("deal");

    const postSettle = {
      ...settledAfter,
      ...settleUpdate,
    };

    const dealBefore = { ...postSettle, phase: "settle" };
    const dealAfter = { ...postSettle };
    const dealEvent = makeTriggerEvent(dealBefore, dealAfter);
    await updateTriggersV2.autoDeal(dealEvent);

    expect(dealEvent.ref.update).toHaveBeenCalledTimes(1);
    const [dealUpdate] = dealEvent.ref.update.mock.calls[0];
    expect(dealUpdate.phase).toBe("assign-next-turn");
    expect(dealUpdate.playersActiveInHand).toEqual(players);

    const postDeal = {
      ...dealAfter,
      ...dealUpdate,
    };

    expect(postDeal.dealerIndex).toBe(0);

    const { playersInGame, bigBlind } = postDeal;
    const bbIndex = playersInGame.indexOf(bigBlind);
    const utgIndex = (bbIndex + 1) % playersInGame.length;
    const expectedFirstToAct = playersInGame[utgIndex];

    const beforeTurn = { ...dealAfter };
    const afterTurn = { ...postDeal };
    const turnEvent = makeTriggerEvent(beforeTurn, afterTurn);
    await updateTriggersV2.assignNextTurn(turnEvent);

    expect(turnEvent.ref.update).toHaveBeenCalledTimes(1);
    const [turnUpdate] = turnEvent.ref.update.mock.calls[0];
    expect(turnUpdate.phase).toBe("bet");
    expect(turnUpdate["bettingState.currentTurn"]).toBe(expectedFirstToAct);
  });

  test("across two consecutive hands, dealer and UTG rotate correctly for four players", async () => {
    const players = ["p1-uid", "p2-uid", "p3-uid", "p4-uid"];

    let settledAfter = {
      status: "active",
      phase: "settle",
      playersInGame: players,
      playersActiveInHand: players,
      dealerIndex: 3, // start with dealer at p4
      smallBlind: "p2-uid",
      bigBlind: "p3-uid",
      hasBigBlindBet: true,
      bettingState: {
        currentTurn: "",
        currentBet: 0,
        lastRaiseAmount: 10,
        callAmount: 0,
        minimumRaiseTo: 0,
        maxBet: 200,
      },
      playerDetails: {
        "p1-uid": { balance: 100, bet: 0, icon: 1, isFolded: false },
        "p2-uid": { balance: 100, bet: 0, icon: 2, isFolded: false },
        "p3-uid": { balance: 100, bet: 0, icon: 3, isFolded: false },
        "p4-uid": { balance: 100, bet: 0, icon: 4, isFolded: false },
      },
      potInfo: [],
      playersInGameToRemove: [],
      lastMove: "Previous hand done.",
    };

    for (let hand = 0; hand < 2; hand++) {
      const settledBefore = { ...settledAfter, phase: "bet" };
      const settleEvent = makeTriggerEvent(settledBefore, settledAfter);
      await updateTriggersV2.autoSettleV2(settleEvent);
      const [settleUpdate] = settleEvent.ref.update.mock.calls[0];
      expect(settleUpdate.phase).toBe("deal");
      const postSettle = { ...settledAfter, ...settleUpdate };

      const dealBefore = { ...postSettle, phase: "settle" };
      const dealAfter = { ...postSettle };
      const dealEvent = makeTriggerEvent(dealBefore, dealAfter);
      await updateTriggersV2.autoDeal(dealEvent);
      const [dealUpdate] = dealEvent.ref.update.mock.calls[0];
      expect(dealUpdate.phase).toBe("assign-next-turn");
      const postDeal = { ...dealAfter, ...dealUpdate };

      const { playersInGame, bigBlind, dealerIndex } = postDeal;

      const expectedDealerIndex = (3 + hand + 1) % players.length;
      expect(dealerIndex).toBe(expectedDealerIndex);

      const bbIndex = playersInGame.indexOf(bigBlind);
      const utgIndex = (bbIndex + 1) % playersInGame.length;
      const expectedFirstToAct = playersInGame[utgIndex];

      const beforeTurn = { ...dealAfter };
      const afterTurn = { ...postDeal };
      const turnEvent = makeTriggerEvent(beforeTurn, afterTurn);
      await updateTriggersV2.assignNextTurn(turnEvent);
      const [turnUpdate] = turnEvent.ref.update.mock.calls[0];

      expect(turnUpdate.phase).toBe("bet");
      expect(turnUpdate["bettingState.currentTurn"]).toBe(expectedFirstToAct);

      settledAfter = {
        ...postDeal,
        phase: "settle",
        playersActiveInHand: [...playersInGame],
        dealerIndex,
        bettingState: {
          ...postDeal.bettingState,
          currentTurn: "",
          currentBet: 0,
          callAmount: 0,
        },
        playerDetails: Object.fromEntries(
          playersInGame.map((uid) => [
            uid,
            { ...postDeal.playerDetails[uid], bet: 0 },
          ])
        ),
      };
    }
  });
});

describe("assignNextTurn: skips all-in big blind and chooses another player", () => {
  test("when big blind is all-in from the blind, UTG gets the first action", async () => {
    const dealer = "dealer-uid";
    const smallBlind = "sb-uid";
    const bigBlind = "bb-uid";

    const players = [dealer, smallBlind, bigBlind];
    const afterBlinds = {
      status: "active",
      phase: "assign-next-turn",
      playersInGame: players,
      playersActiveInHand: players,
      dealerIndex: 0,
      smallBlind,
      bigBlind,
      hasBigBlindBet: false,
      bettingState: {
        currentTurn: "",
        currentBet: 10,
        lastRaiseAmount: 10,
        callAmount: 0,
        minimumRaiseTo: 20,
        maxBet: 200,
      },
      playerDetails: {
        [dealer]: { balance: 100, bet: 0, icon: 1, isFolded: false },
        [smallBlind]: { balance: 95, bet: 5, icon: 2, isFolded: false },
        [bigBlind]: { balance: 0, bet: 10, icon: 3, isFolded: false },
      },
      potInfo: [],
      lastMove: "Blinds posted.",
    };

    const beforeBlinds = { ...afterBlinds, phase: "deal" };
    const event = makeTriggerEvent(beforeBlinds, afterBlinds);

    await updateTriggersV2.assignNextTurn(event);

    expect(event.ref.update).toHaveBeenCalledTimes(1);
    const [updateData] = event.ref.update.mock.calls[0];

    const expectedUTG = dealer;
    expect(updateData.phase).toBe("bet");
    expect(updateData["bettingState.currentTurn"]).toBe(expectedUTG);
  });
});

