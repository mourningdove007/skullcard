function computePots(playerDetails) {
  // Convert to working array
  const players = Object.entries(playerDetails)
    .map(([uid, p]) => ({
      uid,
      bet: p.bet ?? 0,
      isFolded: p.isFolded ?? false,
    }))
    .filter((p) => p.bet > 0);

  if (players.length === 0) return [];

  // Sort by bet ascending
  players.sort((a, b) => a.bet - b.bet);

  const pots = [];
  let remainingPlayers = [...players];

  while (remainingPlayers.length > 0) {
    const smallestBet = remainingPlayers[0].bet;

    if (smallestBet === 0) break;

    // Total pot layer amount
    const potAmount = smallestBet * remainingPlayers.length;

    // Eligible players = those not folded
    const eligiblePlayers = remainingPlayers
      .filter((p) => !p.isFolded)
      .map((p) => p.uid);

    pots.push({
      amount: potAmount,
      eligiblePlayers,
    });

    // Subtract layer
    remainingPlayers = remainingPlayers
      .map((p) => ({
        ...p,
        bet: p.bet - smallestBet,
      }))
      .filter((p) => p.bet > 0);
  }

  // Merge any pots that have the exact same set of eligible players.
  // This can happen when folded players with smaller stacks create
  // additional layers that all pay out to the same active players.
  if (pots.length <= 1) return pots;

  const mergedByKey = new Map();

  for (const pot of pots) {
    // Use a sorted copy so order differences don't matter for grouping.
    const key = JSON.stringify([...pot.eligiblePlayers].sort());

    if (!mergedByKey.has(key)) {
      // Store a shallow copy so we don't mutate the original entry.
      mergedByKey.set(key, {
        amount: pot.amount,
        eligiblePlayers: pot.eligiblePlayers,
      });
    } else {
      const existing = mergedByKey.get(key);
      existing.amount += pot.amount;
    }
  }

  return Array.from(mergedByKey.values());
}

module.exports = { computePots };