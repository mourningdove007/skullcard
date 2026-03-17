/**
 * Shared Jest helpers and Firestore mocks for V2 integration tests.
 */

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockSet = jest.fn().mockResolvedValue(undefined);

// Game state we'll feed to runTransaction in bet() / leaveGame() tests
let mockGameSnapData = null;

const mockTx = {
  get: jest.fn().mockImplementation(() =>
    Promise.resolve({
      exists: true,
      data: () => mockGameSnapData,
    })
  ),
  update: jest.fn().mockResolvedValue(undefined),
};

const mockDb = {
  runTransaction: jest.fn().mockImplementation(async (fn) => fn(mockTx)),
  collection: jest.fn().mockReturnValue({
    doc: jest.fn().mockReturnValue({
      set: mockSet,
      update: mockUpdate,
      get: jest.fn().mockResolvedValue({ exists: true, data: () => mockGameSnapData }),
    }),
  }),
};

// Mock Firestore so we don't hit real Firebase. Must run before requiring modules that use it.
jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => mockDb,
  FieldValue: {
    serverTimestamp: () => ({ _timestamp: true }),
    arrayUnion: (...args) => ({ _arrayUnion: args }),
  },
}));

const updateTriggersV2 = require("./updateTriggersV2");
const playerCallsV2 = require("./playerCallsV2");

/**
 * Build a Firestore change event for onDocumentUpdated triggers.
 * @param {object} beforeData - Document data before the update
 * @param {object} afterData - Document data after the update
 * @returns Event-shaped object with ref.update / ref.set mocks
 */
function makeTriggerEvent(beforeData, afterData) {
  const ref = {
    update: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
  };
  return {
    data: {
      before: { data: () => ({ ...beforeData }) },
      after: {
        data: () => ({ ...afterData }),
        ref,
      },
    },
    ref,
  };
}

/**
 * Build a minimal game doc in "bet" phase for testing bet() and subsequent triggers.
 */
function gameInBetPhase(overrides = {}) {
  const playerA = "playerA-uid-123";
  const playerB = "playerB-uid-456";
  return {
    status: "active",
    phase: "bet",
    playersInGame: [playerA, playerB],
    playersActiveInHand: [playerA, playerB],
    dealerIndex: 0,
    smallBlind: playerA,
    bigBlind: playerB,
    hasBigBlindBet: true,
    bettingState: {
      currentTurn: playerA,
      currentBet: 10,
      lastRaiseAmount: 10,
      callAmount: 10,
      minimumRaiseTo: 20,
      maxBet: 100,
    },
    playerDetails: {
      [playerA]: { balance: 100, bet: 0, icon: 1, isFolded: false },
      [playerB]: { balance: 90, bet: 10, icon: 2, isFolded: false },
    },
    potInfo: [],
    lastMove: "Dealer set.",
    ...overrides,
  };
}

function resetMocks() {
  jest.clearAllMocks();
  mockGameSnapData = null;
}

function setMockGameSnapData(data) {
  mockGameSnapData = data;
}

function getMockGameSnapData() {
  return mockGameSnapData;
}

module.exports = {
  mockUpdate,
  mockSet,
  mockTx,
  mockDb,
  updateTriggersV2,
  playerCallsV2,
  makeTriggerEvent,
  gameInBetPhase,
  resetMocks,
  setMockGameSnapData,
  getMockGameSnapData,
};

