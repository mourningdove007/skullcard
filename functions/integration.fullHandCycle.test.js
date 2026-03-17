const {
  updateTriggersV2,
  makeTriggerEvent,
  resetMocks,
} = require("./integrationTestUtilsV2");

beforeEach(() => {
  resetMocks();
});

describe("Full hand cycle: settle → deal → blinds → next turn", () => {
  test("completes a hand, deals a new hand, and assigns turn to the correct player", async () => {
    const p1 = "player1-uid-111";
    const p2 = "player2-uid-222";
    const p3 = "player3-uid-333";

    const settledAfter = {
      status: "active",
      phase: "settle",
      playersInGame: [p1, p2, p3],
      playersActiveInHand: [p1, p2, p3],
      dealerIndex: 2,
      smallBlind: p1,
      bigBlind: p2,
      hasBigBlindBet: true,
      bettingState: {
        currentTurn: "",
        currentBet: 0,
        lastRaiseAmount: 10,
        callAmount: 0,
        minimumRaiseTo: 0,
        maxBet: 100,
      },
      playerDetails: {
        [p1]: { balance: 100, bet: 0, icon: 1, isFolded: false },
        [p2]: { balance: 100, bet: 0, icon: 2, isFolded: false },
        [p3]: { balance: 100, bet: 0, icon: 3, isFolded: false },
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
    expect(dealUpdate.playersActiveInHand).toEqual([p1, p2, p3]);

    const postDeal = {
      ...dealAfter,
      ...dealUpdate,
    };

    expect(postDeal.dealerIndex).toBe(0);
    expect(postDeal.smallBlind).toBe(p2);
    expect(postDeal.bigBlind).toBe(p3);

    const beforeTurn = { ...dealAfter };
    const afterTurn = { ...postDeal };
    const turnEvent = makeTriggerEvent(beforeTurn, afterTurn);
    await updateTriggersV2.assignNextTurn(turnEvent);

    expect(turnEvent.ref.update).toHaveBeenCalledTimes(1);
    const [turnUpdate] = turnEvent.ref.update.mock.calls[0];

    expect(turnUpdate.phase).toBe("bet");
    expect(turnUpdate["bettingState.currentTurn"]).toBe(p1);
  });
});

