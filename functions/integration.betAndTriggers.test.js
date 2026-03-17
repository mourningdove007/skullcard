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

describe("V2 Integration: Player places bet and update triggers", () => {
  describe("playerCallsV2.bet", () => {
    test("rejects when not authenticated", async () => {
      await expect(
        playerCallsV2.bet({ auth: null, data: { gameId: "g1", amount: 10 } })
      ).rejects.toThrow("Not Authorized");
    });

    test("rejects when gameId is missing", async () => {
      await expect(
        playerCallsV2.bet({
          auth: { uid: "playerA-uid-123" },
          data: { amount: 10 },
        })
      ).rejects.toThrow("No game ID");
    });

    test("rejects when amount is missing or invalid", async () => {
      setMockGameSnapData(gameInBetPhase());
      const request = {
        auth: { uid: "playerA-uid-123" },
        data: { gameId: "game1" },
      };
      await expect(
        playerCallsV2.bet({ ...request, data: { ...request.data } })
      ).rejects.toThrow("No bet amount");
      await expect(
        playerCallsV2.bet({ ...request, data: { gameId: "game1", amount: -5 } })
      ).rejects.toThrow("Amount must be a non-negative number");
    });

    test("rejects when phase is not bet", async () => {
      setMockGameSnapData(gameInBetPhase({ phase: "deal" }));
      await expect(
        playerCallsV2.bet({
          auth: { uid: "playerA-uid-123" },
          data: { gameId: "game1", amount: 10 },
        })
      ).rejects.toThrow("You can only bet during the betting phase");
    });

    test("rejects when it is not the player's turn", async () => {
      setMockGameSnapData(gameInBetPhase());
      await expect(
        playerCallsV2.bet({
          auth: { uid: "playerB-uid-456" },
          data: { gameId: "game1", amount: 10 },
        })
      ).rejects.toThrow("It is not your turn");
    });

    test("updates game with new playerDetails and phase assign-next-turn when player calls", async () => {
      setMockGameSnapData(gameInBetPhase());
      const uid = "playerA-uid-123";

      const result = await playerCallsV2.bet({
        auth: { uid },
        data: { gameId: "game1", amount: 10 },
      });

      expect(result).toEqual({ success: true });
      expect(mockTx.update).toHaveBeenCalledTimes(1);
      const [, updateData] = mockTx.update.mock.calls[0];

      expect(updateData.phase).toBe("assign-next-turn");
      expect(updateData.playerDetails[uid].bet).toBe(10);
      expect(updateData.playerDetails[uid].balance).toBe(90);
      expect(updateData.lastMove).toContain("bet 10");
    });

    test("updates game when player raises", async () => {
      setMockGameSnapData(gameInBetPhase());
      const uid = "playerA-uid-123";

      await playerCallsV2.bet({
        auth: { uid },
        data: { gameId: "game1", amount: 20 },
      });

      const [, updateData] = mockTx.update.mock.calls[0];
      expect(updateData.playerDetails[uid].bet).toBe(20);
      expect(updateData.playerDetails[uid].balance).toBe(80);
      expect(updateData.phase).toBe("assign-next-turn");
    });
  });

  describe("updateTriggersV2.updatePotInfo (after a bet)", () => {
    test("recomputes potInfo when playerDetails change after a bet", async () => {
      const playerA = "playerA-uid-123";
      const playerB = "playerB-uid-456";
      const before = gameInBetPhase({ phase: "assign-next-turn" });
      const after = {
        ...before,
        playerDetails: {
          [playerA]: { balance: 90, bet: 10, icon: 1, isFolded: false },
          [playerB]: { balance: 90, bet: 10, icon: 2, isFolded: false },
        },
      };

      const event = makeTriggerEvent(before, after);
      await updateTriggersV2.updatePotInfo(event);

      expect(event.ref.update).toHaveBeenCalledTimes(1);
      const [updateData] = event.ref.update.mock.calls[0];
      expect(updateData.potInfo).toBeDefined();
      expect(Array.isArray(updateData.potInfo)).toBe(true);
      // Two players each with bet 10 -> main pot 20
      expect(updateData.potInfo).toContainEqual(
        expect.objectContaining({
          amount: 20,
          eligiblePlayers: expect.arrayContaining([playerA, playerB]),
        })
      );
    });

    test("does not update when playerDetails unchanged", async () => {
      const before = gameInBetPhase();
      const after = { ...before };

      const event = makeTriggerEvent(before, after);
      await updateTriggersV2.updatePotInfo(event);

      expect(event.ref.update).not.toHaveBeenCalled();
    });
  });

  describe("updateTriggersV2.assignNextTurn (after phase becomes assign-next-turn)", () => {
    test("sets next player turn and phase to bet when someone still needs to act", async () => {
      const playerA = "playerA-uid-123";
      const playerB = "playerB-uid-456";
      const before = gameInBetPhase({ phase: "bet" });
      const after = {
        ...before,
        phase: "assign-next-turn",
        bettingState: { ...before.bettingState, currentBet: 20 },
        playerDetails: {
          [playerA]: { balance: 80, bet: 20, icon: 1, isFolded: false },
          [playerB]: { balance: 90, bet: 10, icon: 2, isFolded: false },
        },
      };

      const event = makeTriggerEvent(before, after);
      await updateTriggersV2.assignNextTurn(event);

      expect(event.ref.update).toHaveBeenCalledTimes(1);
      const [updateData] = event.ref.update.mock.calls[0];
      expect(updateData.phase).toBe("bet");
      expect(updateData["bettingState.currentTurn"]).toBe(playerB);
      expect(updateData["bettingState.currentBet"]).toBe(20);
      expect(updateData["bettingState.callAmount"]).toBe(10); // 20 - 10
    });

    test("sets phase to settle when no one needs to act", async () => {
      const playerA = "playerA-uid-123";
      const playerB = "playerB-uid-456";
      const before = gameInBetPhase({ phase: "bet" });
      const after = {
        ...before,
        phase: "assign-next-turn",
        hasBigBlindBet: true,
        playerDetails: {
          [playerA]: { balance: 90, bet: 10, icon: 1, isFolded: false },
          [playerB]: { balance: 90, bet: 10, icon: 2, isFolded: false },
        },
      };

      const event = makeTriggerEvent(before, after);
      await updateTriggersV2.assignNextTurn(event);

      const [updateData] = event.ref.update.mock.calls[0];
      expect(updateData.phase).toBe("settle");
    });

    test("three-player: after dealer calls and SB raises, next turn is big blind", async () => {
      const dealer = "dealer-uid-aaa";
      const smallBlind = "sb-uid-bbb";
      const bigBlind = "bb-uid-ccc";

      // State just BEFORE the SB raises:
      // - phase is "bet"
      // - dealer has already called to 10
      // - SB is currently acting player with 5 posted
      // - BB has 10 posted and has NOT yet had a chance to act
      const before = {
        status: "active",
        phase: "bet",
        playersInGame: [dealer, smallBlind, bigBlind],
        playersActiveInHand: [dealer, smallBlind, bigBlind],
        dealerIndex: 0,
        smallBlind,
        bigBlind,
        hasBigBlindBet: false,
        bettingState: {
          currentTurn: smallBlind,
          currentBet: 20,
          lastRaiseAmount: 10,
          callAmount: 10,
          minimumRaiseTo: 30,
          maxBet: 200,
        },
        playerDetails: {
          [dealer]: { balance: 90, bet: 10, icon: 1, isFolded: false },
          [smallBlind]: { balance: 85, bet: 15, icon: 2, isFolded: false },
          [bigBlind]: { balance: 90, bet: 10, icon: 3, isFolded: false },
        },
        potInfo: [],
        lastMove: "Dealer called 10.",
      };

      const after = {
        ...before,
        phase: "assign-next-turn",
        playerDetails: {
          ...before.playerDetails,
          [smallBlind]: {
            ...before.playerDetails[smallBlind],
            balance: 80,
            bet: 20,
          },
        },
      };

      const event = makeTriggerEvent(before, after);
      await updateTriggersV2.assignNextTurn(event);

      expect(event.ref.update).toHaveBeenCalledTimes(1);
      const [updateData] = event.ref.update.mock.calls[0];
      expect(updateData.phase).toBe("bet");
      expect(updateData["bettingState.currentTurn"]).toBe(bigBlind);
      expect(updateData["bettingState.callAmount"]).toBe(10); // BB needs to call from 10 -> 20
    });
  });

  describe("Flow: bet → updatePotInfo → assignNextTurn", () => {
    test("player bet leads to assign-next-turn; updatePotInfo would update pot; assignNextTurn would assign next turn or settle", async () => {
      setMockGameSnapData(gameInBetPhase());
      const uid = "playerA-uid-123";

      await playerCallsV2.bet({
        auth: { uid },
        data: { gameId: "game1", amount: 10 },
      });

      const [, betUpdate] = mockTx.update.mock.calls[0];
      expect(betUpdate.phase).toBe("assign-next-turn");
      expect(betUpdate.playerDetails[uid].bet).toBe(10);

      // Simulate updatePotInfo running after this write (playerDetails changed)
      const beforeForPot = gameInBetPhase();
      const afterForPot = { ...beforeForPot, ...betUpdate };
      const potEvent = makeTriggerEvent(beforeForPot, afterForPot);
      await updateTriggersV2.updatePotInfo(potEvent);
      expect(potEvent.ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          potInfo: expect.any(Array),
        })
      );

      // Simulate assignNextTurn running (phase is assign-next-turn)
      const beforeTurn = { ...afterForPot, phase: "bet" };
      const afterTurn = { ...afterForPot, phase: "assign-next-turn" };
      const turnEvent = makeTriggerEvent(beforeTurn, afterTurn);
      await updateTriggersV2.assignNextTurn(turnEvent);
      expect(turnEvent.ref.update).toHaveBeenCalled();
      const turnUpdate = turnEvent.ref.update.mock.calls[0][0];
      expect(turnUpdate.phase).toBeDefined();
      // When everyone has matched (both at 10), phase becomes "settle" and no currentTurn; otherwise we get "bet" and currentTurn
      if (turnUpdate.phase === "bet") {
        expect(turnUpdate["bettingState.currentTurn"]).toBeDefined();
      } else {
        expect(turnUpdate.phase).toBe("settle");
      }
    });
  });
});

