const {
  HAND_RANKS,
  classifyHand,
  compareHands,
  describeHandResult
} = require("./poker");

describe("Poker Hand Evaluation", () => {
  test("detects high card", () => {
    const hand = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "10" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.HIGH_CARD);
    expect(result.tiebreakers).toEqual([14, 10, 7, 4, 2]);
  });

  test("detects one pair", () => {
    const hand = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.ONE_PAIR);
    expect(result.tiebreakers).toEqual([14, 7, 4, 2]);
  });

  test("detects two pair", () => {
    const hand = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "7" },
      { suit: "heart", value: "2" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.TWO_PAIR);
    expect(result.tiebreakers).toEqual([14, 7, 2]);
  });

  test("detects three of a kind", () => {
    const hand = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "A" },
      { suit: "diamond", value: "7" },
      { suit: "heart", value: "2" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.THREE_OF_A_KIND);
    expect(result.tiebreakers).toEqual([14, 7, 2]);
  });

  test("detects straight", () => {
    const hand = [
      { suit: "heart", value: "5" },
      { suit: "club", value: "6" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "8" },
      { suit: "heart", value: "9" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
    expect(result.tiebreakers).toEqual([9]);
  });

  test("detects wheel straight (A-2-3-4-5)", () => {
    const hand = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "2" },
      { suit: "spade", value: "3" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "5" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
    expect(result.tiebreakers).toEqual([5]);
  });

  test("detects flush", () => {
    const hand = [
      { suit: "spade", value: "A" },
      { suit: "spade", value: "10" },
      { suit: "spade", value: "7" },
      { suit: "spade", value: "4" },
      { suit: "spade", value: "2" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.FLUSH);
    expect(result.tiebreakers).toEqual([14, 10, 7, 4, 2]);
  });

  test("detects full house", () => {
    const hand = [
      { suit: "spade", value: "A" },
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "K" },
      { suit: "diamond", value: "K" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.FULL_HOUSE);
    expect(result.tiebreakers).toEqual([14, 13]);
  });

  test("detects four of a kind", () => {
    const hand = [
      { suit: "spade", value: "A" },
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "diamond", value: "A" },
      { suit: "diamond", value: "K" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.FOUR_OF_A_KIND);
    expect(result.tiebreakers).toEqual([14, 13]);
  });

  test("detects straight flush", () => {
    const hand = [
      { suit: "spade", value: "5" },
      { suit: "spade", value: "6" },
      { suit: "spade", value: "7" },
      { suit: "spade", value: "8" },
      { suit: "spade", value: "9" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.STRAIGHT_FLUSH);
    expect(result.tiebreakers).toEqual([9]);
  });

  test("detects royal flush", () => {
    const hand = [
      { suit: "heart", value: "10" },
      { suit: "heart", value: "J" },
      { suit: "heart", value: "Q" },
      { suit: "heart", value: "K" },
      { suit: "heart", value: "A" },
    ];

    const result = classifyHand(hand);
    expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
    expect(result.tiebreakers).toEqual([14]);
  });
});

describe("Poker Hand Comparison", () => {
  test("flush beats straight", () => {
    const flush = [
      { suit: "spade", value: "A" },
      { suit: "spade", value: "10" },
      { suit: "spade", value: "7" },
      { suit: "spade", value: "4" },
      { suit: "spade", value: "2" },
    ];

    const straight = [
      { suit: "heart", value: "5" },
      { suit: "club", value: "6" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "8" },
      { suit: "heart", value: "9" },
    ];

    expect(compareHands(flush, straight)).toBe(1);
    expect(compareHands(straight, flush)).toBe(-1);
  });

  test("higher pair beats lower pair", () => {
    const pairAces = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    const pairKings = [
      { suit: "heart", value: "K" },
      { suit: "club", value: "K" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    expect(compareHands(pairAces, pairKings)).toBe(1);
    expect(compareHands(pairKings, pairAces)).toBe(-1);
  });

  test("kicker breaks ties for same pair", () => {
    const handA = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "K" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    const handB = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "Q" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    expect(compareHands(handA, handB)).toBe(1);
    expect(compareHands(handB, handA)).toBe(-1);
  });

  test("two pair compares highest pair first", () => {
    const handA = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "2" },
      { suit: "diamond", value: "2" },
      { suit: "heart", value: "K" },
    ];

    const handB = [
      { suit: "heart", value: "K" },
      { suit: "club", value: "K" },
      { suit: "spade", value: "Q" },
      { suit: "diamond", value: "Q" },
      { suit: "heart", value: "A" },
    ];

    // A-A-2-2-K beats K-K-Q-Q-A
    expect(compareHands(handA, handB)).toBe(1);
  });

  test("full house compares trip first", () => {
    const handAAA22 = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "A" },
      { suit: "diamond", value: "2" },
      { suit: "heart", value: "2" },
    ];

    const handKKKQQ = [
      { suit: "heart", value: "K" },
      { suit: "club", value: "K" },
      { suit: "spade", value: "K" },
      { suit: "diamond", value: "Q" },
      { suit: "heart", value: "Q" },
    ];

    expect(compareHands(handAAA22, handKKKQQ)).toBe(1);
  });

  test("straight compares by high card", () => {
    const straight9 = [
      { suit: "heart", value: "5" },
      { suit: "club", value: "6" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "8" },
      { suit: "heart", value: "9" },
    ];

    const straight10 = [
      { suit: "heart", value: "6" },
      { suit: "club", value: "7" },
      { suit: "spade", value: "8" },
      { suit: "diamond", value: "9" },
      { suit: "heart", value: "10" },
    ];

    expect(compareHands(straight10, straight9)).toBe(1);
    expect(compareHands(straight9, straight10)).toBe(-1);
  });

  test("wheel straight loses to 6-high straight", () => {
    const wheel = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "2" },
      { suit: "spade", value: "3" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "5" },
    ];

    const straight6 = [
      { suit: "heart", value: "2" },
      { suit: "club", value: "3" },
      { suit: "spade", value: "4" },
      { suit: "diamond", value: "5" },
      { suit: "heart", value: "6" },
    ];

    expect(compareHands(straight6, wheel)).toBe(1);
  });

  test("tie returns 0", () => {
    const handA = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    const handB = [
      { suit: "diamond", value: "A" },
      { suit: "spade", value: "A" },
      { suit: "club", value: "7" },
      { suit: "heart", value: "4" },
      { suit: "spade", value: "2" },
    ];

    expect(compareHands(handA, handB)).toBe(0);
  });

  test("royal flush beats straight flush", () => {
    const royalFlush = [
      { suit: "heart", value: "10" },
      { suit: "heart", value: "J" },
      { suit: "heart", value: "Q" },
      { suit: "heart", value: "K" },
      { suit: "heart", value: "A" },
    ];

    const straightFlush = [
      { suit: "spade", value: "5" },
      { suit: "spade", value: "6" },
      { suit: "spade", value: "7" },
      { suit: "spade", value: "8" },
      { suit: "spade", value: "9" },
    ];

    expect(compareHands(royalFlush, straightFlush)).toBe(1);
  });
});


describe("describeHandResult", () => {
  test("returns correct description when one hand beats another", () => {
    const flush = [
      { suit: "spade", value: "A" },
      { suit: "spade", value: "10" },
      { suit: "spade", value: "7" },
      { suit: "spade", value: "4" },
      { suit: "spade", value: "2" },
    ];

    const pair = [
      { suit: "heart", value: "K" },
      { suit: "club", value: "K" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    expect(describeHandResult(flush, pair)).toBe("Flush defeated Pair");
  });

  test("returns tie message when hands are equal", () => {
    const handA = [
      { suit: "heart", value: "A" },
      { suit: "club", value: "A" },
      { suit: "spade", value: "7" },
      { suit: "diamond", value: "4" },
      { suit: "heart", value: "2" },
    ];

    const handB = [
      { suit: "diamond", value: "A" },
      { suit: "spade", value: "A" },
      { suit: "club", value: "7" },
      { suit: "heart", value: "4" },
      { suit: "spade", value: "2" },
    ];

    expect(describeHandResult(handA, handB)).toBe("Tie: Pair");
  });
});

