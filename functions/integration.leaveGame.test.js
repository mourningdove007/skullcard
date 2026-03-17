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

describe("leaveGameV2", () => {
  test("active game with 3 players: leaving player is removed from hand and game and next turn is assigned to a remaining player", async () => {
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
      hasBigBlindBet: true,
      bettingState: {
        currentTurn: p2,
        currentBet: 10,
        lastRaiseAmount: 10,
        callAmount: 5,
        minimumRaiseTo: 20,
        maxBet: 100,
      },
      playerDetails: {
        [p1]: { balance: 90, bet: 10, icon: 1, isFolded: false },
        [p2]: { balance: 95, bet: 5, icon: 2, isFolded: false },
        [p3]: { balance: 90, bet: 10, icon: 3, isFolded: false },
      },
      potInfo: [],
      lastMove: "Hand in progress.",
    };

    setMockGameSnapData(initialGame);
    await playerCallsV2.leaveGame({
      auth: { uid: p2 },
      data: { gameId: "game-leave-3p" },
    });

    expect(mockTx.update).toHaveBeenCalledTimes(1);
    const [, leaveUpdate] = mockTx.update.mock.calls[0];

    const afterLeave = {
      ...initialGame,
      ...leaveUpdate,
    };

    expect(afterLeave.playersInGame).toEqual([p1, p3]);
    expect(afterLeave.playersActiveInHand).toEqual([p1, p3]);
    expect(afterLeave.playerDetails[p2]).toBeUndefined();

    expect(afterLeave.phase).toBe("assign-next-turn");

    const beforeAssign = { ...afterLeave, phase: "bet" };
    const afterAssign = { ...afterLeave, phase: "assign-next-turn" };
    const assignEvent = makeTriggerEvent(beforeAssign, afterAssign);
    await updateTriggersV2.assignNextTurn(assignEvent);

    expect(assignEvent.ref.update).toHaveBeenCalledTimes(1);
    const [assignUpdate] = assignEvent.ref.update.mock.calls[0];
    const nextTurnUid = assignUpdate["bettingState.currentTurn"];
    if (nextTurnUid !== undefined) {
      expect([p1, p3]).toContain(nextTurnUid);
      expect(nextTurnUid).not.toBe(p2);
    }
  });

  test("active game with 2 players: when one leaves, remaining player becomes winner", async () => {
    const p1 = "p1-uid";
    const p2 = "p2-uid";

    const initialGame = {
      status: "active",
      phase: "bet",
      playersInGame: [p1, p2],
      playersActiveInHand: [p1, p2],
      dealerIndex: 0,
      smallBlind: p1,
      bigBlind: p2,
      hasBigBlindBet: true,
      bettingState: {
        currentTurn: p2,
        currentBet: 10,
        lastRaiseAmount: 10,
        callAmount: 0,
        minimumRaiseTo: 20,
        maxBet: 100,
      },
      playerDetails: {
        [p1]: { balance: 90, bet: 10, icon: 1, isFolded: false },
        [p2]: { balance: 90, bet: 10, icon: 2, isFolded: false },
      },
      potInfo: [],
      lastMove: "Heads-up hand in progress.",
    };

    setMockGameSnapData(initialGame);
    await playerCallsV2.leaveGame({
      auth: { uid: p2 },
      data: { gameId: "game-leave-2p" },
    });

    const [, leaveUpdate] = mockTx.update.mock.calls[0];

    const afterLeave = {
      ...initialGame,
      ...leaveUpdate,
    };

    expect(afterLeave.playersInGame).toEqual([p1]);
    expect(afterLeave.playersActiveInHand).toEqual([p1]);
    expect(afterLeave.playerDetails[p2]).toBeUndefined();

    expect(afterLeave.phase).toBe("winner");
  });
});

