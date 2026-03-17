const {
  updateTriggersV2,
  playerCallsV2,
  makeTriggerEvent,
  gameInBetPhase,
  mockTx,
  resetMocks,
  setMockGameSnapData,
} = require("./integrationTestUtilsV2");

beforeEach(() => {
  resetMocks();
});

describe("edge cases: playerCallsV2.bet", () => {
  test("rejects when player tries to bet more than their remaining balance", async () => {
    const playerA = "playerA-uid-123";
    const playerB = "playerB-uid-456";

    const base = gameInBetPhase();

    const game = gameInBetPhase({
      bettingState: {
        ...base.bettingState,
        currentBet: 20,
      },
      playerDetails: {
        [playerA]: { balance: 5, bet: 10, icon: 1, isFolded: false },
        [playerB]: { balance: 90, bet: 20, icon: 2, isFolded: false },
      },
    });

    setMockGameSnapData(game);

    await expect(
      playerCallsV2.bet({
        auth: { uid: playerA },
        data: { gameId: "game-edge-balance", amount: 20 },
      })
    ).rejects.toThrow("Not enough balance.");
  });

  test("allows a short all-in that is less than currentBet", async () => {
    const playerA = "playerA-uid-123";
    const playerB = "playerB-uid-456";

    const base = gameInBetPhase();

    const game = gameInBetPhase({
      bettingState: {
        ...base.bettingState,
        currentBet: 20,
        maxBet: 15,
      },
      playerDetails: {
        [playerA]: { balance: 5, bet: 10, icon: 1, isFolded: false },
        [playerB]: { balance: 90, bet: 20, icon: 2, isFolded: false },
      },
    });

    setMockGameSnapData(game);

    await playerCallsV2.bet({
      auth: { uid: playerA },
      data: { gameId: "game-edge-allin", amount: 15 },
    });

    expect(mockTx.update).toHaveBeenCalledTimes(1);
    const [, updateData] = mockTx.update.mock.calls[0];

    // All-in: bet raised to 15 and balance goes to 0, and phase advances.
    expect(updateData.playerDetails[playerA].bet).toBe(15);
    expect(updateData.playerDetails[playerA].balance).toBe(0);
    expect(updateData.phase).toBe("assign-next-turn");
  });
});

describe("edge cases: assignNextTurn", () => {
  test("when there are no active players in hand, phase moves to settle", async () => {
    const before = {
      status: "active",
      phase: "bet",
      playersInGame: [],
      playersActiveInHand: [],
      playerDetails: {},
      bigBlind: null,
      hasBigBlindBet: false,
    };

    const after = {
      ...before,
      phase: "assign-next-turn",
    };

    const event = makeTriggerEvent(before, after);
    await updateTriggersV2.assignNextTurn(event);

    expect(event.ref.update).toHaveBeenCalledTimes(1);
    const [updateData] = event.ref.update.mock.calls[0];
    expect(updateData.phase).toBe("settle");
  });
});

describe("edge cases: autoClearFinishedGameV2", () => {
  test("when status changes to finished, game is reset to a waiting lobby", async () => {
    const before = {
      status: "active",
      phase: "deal",
      playersInGame: ["p1", "p2"],
      playersActiveInHand: ["p1", "p2"],
      playerDetails: {
        p1: { balance: 120, bet: 0, icon: 1, isFolded: false },
        p2: { balance: 80, bet: 0, icon: 2, isFolded: false },
      },
      dealerIndex: 1,
      playersInGameToRemove: [],
      bettingState: {
        currentTurn: "p1",
        currentBet: 0,
        lastRaiseAmount: 0,
        callAmount: 0,
        minimumRaiseTo: 0,
        maxBet: 100,
      },
      playersFolded: [],
      lastMove: "Game in progress.",
    };

    const after = {
      ...before,
      status: "finished",
    };

    const event = makeTriggerEvent(before, after);
    await updateTriggersV2.autoClearFinishedGame(event);

    expect(event.ref.set).toHaveBeenCalledTimes(1);
    const [resetData] = event.ref.set.mock.calls[0];

    expect(resetData.status).toBe("waiting");
    expect(resetData.playersInGame).toEqual([]);
    expect(resetData.playersActiveInHand).toEqual([]);
    expect(resetData.playerDetails).toEqual({});
    expect(resetData.dealerIndex).toBe(-1);
    expect(resetData.playersInGameToRemove).toEqual([]);
    expect(resetData.bettingState).toEqual({
      currentTurn: "",
      currentBet: "",
      lastRaiseAmount: 0,
      callAmount: 0,
      minimumRaiseTo: 0,
    });
    expect(resetData.playersFolded).toEqual([]);
    expect(resetData.lastMove).toBe("Game finished - room reset");
    expect(resetData.timeOfLastMove).toEqual({ _timestamp: true });
  });
});

