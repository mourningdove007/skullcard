const VALUE_MAP = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
};

const HAND_RANKS = {
    HIGH_CARD: 1,
    ONE_PAIR: 2,
    TWO_PAIR: 3,
    THREE_OF_A_KIND: 4,
    STRAIGHT: 5,
    FLUSH: 6,
    FULL_HOUSE: 7,
    FOUR_OF_A_KIND: 8,
    STRAIGHT_FLUSH: 9,
    ROYAL_FLUSH: 10,
};


function parseHand(hand) {
    const values = hand
        .map((card) => VALUE_MAP[card.value])
        .sort((a, b) => b - a);

    const suits = hand.map((card) => card.suit);

    return { values, suits };
}


function getValueCounts(values) {
    const counts = {};
    for (const v of values) {
        counts[v] = (counts[v] || 0) + 1;
    }
    return counts;
}


function isFlush(suits) {
    return suits.every((suit) => suit === suits[0]);
}


function checkStraight(values) {
    const unique = [...new Set(values)].sort((a, b) => b - a);

    if (unique.length !== 5) {
        return { isStraight: false, highCard: null };
    }

    const max = unique[0];
    const min = unique[4];

    if (max - min === 4) {
        return { isStraight: true, highCard: max };
    }

    const wheel = [14, 5, 4, 3, 2];
    const isWheel = wheel.every((v, i) => unique[i] === v);

    if (isWheel) {
        return { isStraight: true, highCard: 5 };
    }

    return { isStraight: false, highCard: null };
}


function getGroupedValuesForTiebreak(counts) {
    const groups = Object.entries(counts).map(([value, count]) => ({
        value: Number(value),
        count,
    }));

    groups.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.value - a.value;
    });

    return groups.map((g) => g.value);
}

function classifyHand(hand) {
    const { values, suits } = parseHand(hand);
    const flush = isFlush(suits);
    const counts = getValueCounts(values);

    const countValues = Object.values(counts).sort((a, b) => b - a);
    const { isStraight, highCard } = checkStraight(values);

    if (flush && isStraight && highCard === 14) {
        return { rank: HAND_RANKS.ROYAL_FLUSH, tiebreakers: [14] };
    }

    if (flush && isStraight) {
        return { rank: HAND_RANKS.STRAIGHT_FLUSH, tiebreakers: [highCard] };
    }

    if (countValues[0] === 4) {
        const grouped = getGroupedValuesForTiebreak(counts);
        return { rank: HAND_RANKS.FOUR_OF_A_KIND, tiebreakers: grouped };
    }

    if (countValues[0] === 3 && countValues[1] === 2) {
        const grouped = getGroupedValuesForTiebreak(counts);
        return { rank: HAND_RANKS.FULL_HOUSE, tiebreakers: grouped };
    }

    if (flush) {
        return { rank: HAND_RANKS.FLUSH, tiebreakers: values };
    }

    if (isStraight) {
        return { rank: HAND_RANKS.STRAIGHT, tiebreakers: [highCard] };
    }

    if (countValues[0] === 3) {
        const grouped = getGroupedValuesForTiebreak(counts);
        return { rank: HAND_RANKS.THREE_OF_A_KIND, tiebreakers: grouped };
    }

    if (countValues[0] === 2 && countValues[1] === 2) {
        const grouped = getGroupedValuesForTiebreak(counts);
        return { rank: HAND_RANKS.TWO_PAIR, tiebreakers: grouped };
    }

    if (countValues[0] === 2) {
        const grouped = getGroupedValuesForTiebreak(counts);
        return { rank: HAND_RANKS.ONE_PAIR, tiebreakers: grouped };
    }

    return { rank: HAND_RANKS.HIGH_CARD, tiebreakers: values };
}


function compareTiebreakers(a, b) {
    const len = Math.max(a.length, b.length);

    for (let i = 0; i < len; i++) {
        const va = a[i] ?? 0;
        const vb = b[i] ?? 0;

        if (va > vb) return 1;
        if (va < vb) return -1;
    }

    return 0;
}


function compareHands(handA, handB) {
    const a = classifyHand(handA);
    const b = classifyHand(handB);

    if (a.rank > b.rank) return 1;
    if (a.rank < b.rank) return -1;

    return compareTiebreakers(a.tiebreakers, b.tiebreakers);
}


function getWinner(handA, handB) {
    const result = compareHands(handA, handB);
    if (result === 1) return uidA;
    if (result === -1) return uidB;
    return "TIE";
}

function rankToName(rank) {
    switch (rank) {
        case HAND_RANKS.ROYAL_FLUSH:
            return "Royal Flush";
        case HAND_RANKS.STRAIGHT_FLUSH:
            return "Straight Flush";
        case HAND_RANKS.FOUR_OF_A_KIND:
            return "Four of a Kind";
        case HAND_RANKS.FULL_HOUSE:
            return "Full House";
        case HAND_RANKS.FLUSH:
            return "Flush";
        case HAND_RANKS.STRAIGHT:
            return "Straight";
        case HAND_RANKS.THREE_OF_A_KIND:
            return "Three of a Kind";
        case HAND_RANKS.TWO_PAIR:
            return "Two Pair";
        case HAND_RANKS.ONE_PAIR:
            return "Pair";
        case HAND_RANKS.HIGH_CARD:
            return "High Card";
        default:
            return "Unknown Hand";
    }
}

function describeHandResult(handA, handB) {
    const resultA = classifyHand(handA);
    const resultB = classifyHand(handB);

    const nameA = rankToName(resultA.rank);
    const nameB = rankToName(resultB.rank);

    const winner = compareHands(handA, handB);

    if (winner === 1) return `${nameA} defeated ${nameB}`;
    if (winner === -1) return `${nameB} defeated ${nameA}`;

    return `Tie: ${nameA}`;
}


module.exports = {
    VALUE_MAP,
    HAND_RANKS,
    parseHand,
    getValueCounts,
    isFlush,
    checkStraight,
    classifyHand,
    compareHands,
    getWinner,
    describeHandResult,
};

