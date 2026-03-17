const { computePots } = require("./pot");

describe("computePots", () => {

  test("returns empty array when no one has bet", () => {
    const playerDetails = {
      A: { bet: 0 },
      B: { bet: 0 },
    };

    expect(computePots(playerDetails)).toEqual([]);
  });

  test("single main pot when all bets equal", () => {
    const playerDetails = {
      A: { bet: 100, isFolded: false },
      B: { bet: 100, isFolded: false },
      C: { bet: 100, isFolded: false },
    };

    const pots = computePots(playerDetails);

    expect(pots).toEqual([
      {
        amount: 300,
        eligiblePlayers: ["A", "B", "C"],
      },
    ]);
  });

  test("one side pot (classic all-in scenario)", () => {
    const playerDetails = {
      A: { bet: 100, isFolded: false }, // all-in short stack
      B: { bet: 200, isFolded: false },
      C: { bet: 200, isFolded: false },
    };

    const pots = computePots(playerDetails);

    expect(pots).toEqual([
      {
        amount: 300, // 100 x 3
        eligiblePlayers: ["A", "B", "C"],
      },
      {
        amount: 200, // 100 x 2
        eligiblePlayers: ["B", "C"],
      },
    ]);
  });

  test("multiple side pots with 4 players", () => {
    const playerDetails = {
      A: { bet: 50,  isFolded: false },
      B: { bet: 100, isFolded: false },
      C: { bet: 200, isFolded: false },
      D: { bet: 300, isFolded: false },
    };

    const pots = computePots(playerDetails);

    expect(pots).toEqual([
      {
        amount: 200, // 50 x 4
        eligiblePlayers: ["A", "B", "C", "D"],
      },
      {
        amount: 150, // 50 x 3
        eligiblePlayers: ["B", "C", "D"],
      },
      {
        amount: 200, // 100 x 2
        eligiblePlayers: ["C", "D"],
      },
      {
        amount: 100, // 100 x 1
        eligiblePlayers: ["D"],
      },
    ]);
  });

  test("folded player contributes but cannot win", () => {
    const playerDetails = {
      A: { bet: 100, isFolded: false },
      B: { bet: 100, isFolded: true }, // folded
      C: { bet: 100, isFolded: false },
    };

    const pots = computePots(playerDetails);

    expect(pots).toEqual([
      {
        amount: 300,
        eligiblePlayers: ["A", "C"], // B excluded
      },
    ]);
  });

  test("merges multiple pots that have the same eligible players", () => {
    const playerDetails = {
      A: { bet: 100, isFolded: false },
      B: { bet: 50, isFolded: true }, // folded short stack
      C: { bet: 100, isFolded: false },
    };

    // Layer breakdown without merging would be:
    // - First layer: 50 from each of A, B, C -> amount 150, eligible [A, C]
    // - Second layer: remaining 50 from A and C -> amount 100, eligible [A, C]
    // We want a single combined pot of 250 for [A, C].
    const pots = computePots(playerDetails);

    expect(pots).toEqual([
      {
        amount: 250,
        eligiblePlayers: ["A", "C"],
      },
    ]);
  });

  test("only one player bet", () => {
    const playerDetails = {
      A: { bet: 200, isFolded: false },
      B: { bet: 0, isFolded: false },
    };

    const pots = computePots(playerDetails);

    expect(pots).toEqual([
      {
        amount: 200,
        eligiblePlayers: ["A"],
      },
    ]);
  });

});