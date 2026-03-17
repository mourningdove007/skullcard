const {
  updateTriggersV2,
  playerCallsV2,
  makeTriggerEvent,
  mockTx,
  resetMocks,
  setMockGameSnapData,
} = require("./integrationTestUtilsV2");

beforeEach(() => {
  resetMocks();
});

describe("foldV2 + assignNextTurn", () => {
  test("when a player folds, their turn is not selected and a remaining player gets the action", async () => {
    const p1 = "p1-uid";
    const p2 = "p2-uid";
    const p3 = "p3-uid";

    const initialGame = {
      status: "active",
      phase: "bet",
      playersInGame: [p1, p2, p3],
      playersActiveInHand: [p1, p2, p3],
      dealerIndex: 0,
      smallBlind: p2,
      bigBlind: p3,
      hasBigBlindBet: false,
      bettingState: {
        currentTurn: p1,
        currentBet: 10,
        lastRaiseAmount: 10,
        callAmount: 10,
        minimumRaiseTo: 20,
        maxBet: 100,
      },
      playerDetails: {
        [p1]: { balance: 100, bet: 0, icon: 1, isFolded: false },
        [p2]: { balance: 95, bet: 5, icon: 2, isFolded: false },
        [p3]: { balance: 90, bet: 10, icon: 3, isFolded: false },
      },
      potInfo: [],
      lastMove: "Pre-flop, dealer to act.",
      playersFolded: [],
    };

    setMockGameSnapData(initialGame);
    await playerCallsV2.fold({
      auth: { uid: p1 },
      data: { gameId: "game-fold-3p" },
    });

    expect(mockTx.update).toHaveBeenCalledTimes(1);
    const [, foldUpdate] = mockTx.update.mock.calls[0];

    const afterFold = {
      ...initialGame,
      ...foldUpdate,
    };

    expect(afterFold.playersActiveInHand).toEqual([p2, p3]);
    expect(afterFold.playerDetails[p1].isFolded).toBe(true);
    expect(afterFold.phase).toBe("assign-next-turn");

    const beforeAssign = { ...afterFold, phase: "bet" };
    const afterAssign = { ...afterFold };
    const assignEvent = makeTriggerEvent(beforeAssign, afterAssign);
    await updateTriggersV2.assignNextTurn(assignEvent);

    expect(assignEvent.ref.update).toHaveBeenCalledTimes(1);
    const [assignUpdate] = assignEvent.ref.update.mock.calls[0];
    const nextTurnUid = assignUpdate["bettingState.currentTurn"];

    if (nextTurnUid !== undefined) {
      expect([p2, p3]).toContain(nextTurnUid);
      expect(nextTurnUid).not.toBe(p1);
    }
  });

  test("when two of three players have folded, assignNextTurn moves phase to settle", async () => {
    const p1 = "p1-uid";
    const p2 = "p2-uid";
    const p3 = "p3-uid";

    const postFolds = {
      status: "active",
      phase: "bet",
      playersInGame: [p1, p2, p3],
      playersActiveInHand: [p3],
      dealerIndex: 0,
      smallBlind: p1,
      bigBlind: p2,
      hasBigBlindBet: true,
      bettingState: {
        currentTurn: "",
        currentBet: 10,
        lastRaiseAmount: 10,
        callAmount: 0,
        minimumRaiseTo: 20,
        maxBet: 100,
      },
      playerDetails: {
        [p1]: { balance: 90, bet: 10, icon: 1, isFolded: true },
        [p2]: { balance: 90, bet: 10, icon: 2, isFolded: true },
        [p3]: { balance: 90, bet: 10, icon: 3, isFolded: false },
      },
      potInfo: [],
      lastMove: "Two players folded.",
      playersFolded: [],
    };

    const beforeAssign = { ...postFolds, phase: "bet" };
    const afterAssign = { ...postFolds, phase: "assign-next-turn" };
    const assignEvent = makeTriggerEvent(beforeAssign, afterAssign);
    await updateTriggersV2.assignNextTurn(assignEvent);

    expect(assignEvent.ref.update).toHaveBeenCalledTimes(1);
    const [assignUpdate] = assignEvent.ref.update.mock.calls[0];

    expect(assignUpdate.phase).toBe("settle");
  });

  test("four players: after SB raises and BB folds, next turn goes to the remaining player to the left of the big blind", async () => {
    const p1 = "p1-uid";
    const p2 = "p2-uid";
    const p3 = "p3-uid";
    const p4 = "p4-uid";

    const initialGame = {
      status: "active",
      phase: "bet",
      playersInGame: [p1, p2, p3, p4],
      playersActiveInHand: [p1, p2, p3, p4],
      dealerIndex: 0,
      smallBlind: p2,
      bigBlind: p3,
      hasBigBlindBet: false,
      bettingState: {
        currentTurn: p3,
        currentBet: 30,
        lastRaiseAmount: 20,
        callAmount: 20,
        minimumRaiseTo: 50,
        maxBet: 300,
      },
      playerDetails: {
        [p1]: { balance: 90, bet: 10, icon: 1, isFolded: false },
        [p2]: { balance: 70, bet: 30, icon: 2, isFolded: false },
        [p3]: { balance: 90, bet: 10, icon: 3, isFolded: false },
        [p4]: { balance: 90, bet: 10, icon: 4, isFolded: false },
      },
      potInfo: [],
      lastMove: "SB raised to 30, BB to act.",
      playersFolded: [],
    };

    setMockGameSnapData(initialGame);
    await playerCallsV2.fold({
      auth: { uid: p3 },
      data: { gameId: "game-fold-4p-scenario" },
    });

    expect(mockTx.update).toHaveBeenCalledTimes(1);
    const [, foldUpdate] = mockTx.update.mock.calls[0];

    const afterFold = {
      ...initialGame,
      ...foldUpdate,
    };

    expect(afterFold.playersActiveInHand).toEqual([p1, p2, p4]);
    expect(afterFold.playerDetails[p3].isFolded).toBe(true);
    expect(afterFold.phase).toBe("assign-next-turn");

    const beforeAssign = { ...afterFold, phase: "bet" };
    const afterAssign = { ...afterFold };
    const assignEvent = makeTriggerEvent(beforeAssign, afterAssign);
    await updateTriggersV2.assignNextTurn(assignEvent);

    expect(assignEvent.ref.update).toHaveBeenCalledTimes(1);
    const [assignUpdate] = assignEvent.ref.update.mock.calls[0];

    const nextTurnUid = assignUpdate["bettingState.currentTurn"];
    expect(nextTurnUid).toBe(p4);
  });
});

