# Skullcard (Firebase + Svelte)

Realtime multiplayer 5‑card draw built with **Svelte** + **Firebase (Auth, Firestore, Cloud Functions, Hosting)**. The client is treated as untrusted; the backend is authoritative for game state transitions and move validation.

## Security Model

The client is treated as fully untrusted. All game state transitions, move validation, turn enforcement, and pot settlement are handled exclusively server-side.


## Repository structure

- `src/`: Svelte SPA frontend
  - `src/pages/Home.svelte`: lobby list + theme selection + anonymous sign‑in bootstrap
  - `src/pages/RoomV2.svelte`: in‑room gameplay UI (reads `gamesV2/{gameId}`)
  - `src/util/backendCallsV2.js`: client wrappers for callable functions
- `functions/`: Firebase Cloud Functions (Node.js)
  - `functions/playerCallsV2.js`: callable endpoints that validate and write game state
  - `functions/updateTriggersV2.js`: Firestore triggers that advance phases / assign turns / settle hands
  - `functions/schedulersV2.js`: scheduled cleanup/maintenance jobs

## Data model

- `gamesV2/{gameId}`: canonical game state
  - `status`: `waiting | active | finished`
  - `phase`: phase machine driving triggers (see below)
  - `playersInGame`: ordered table/seating list
  - `playersActiveInHand`: subset of players still in the current hand
  - `playerDetails.{uid}`: `{ balance, bet, icon, isFolded }`
  - `bettingState`: `{ currentTurn, currentBet, lastRaiseAmount, callAmount, minimumRaiseTo, maxBet }`
  - `smallBlind`, `bigBlind`, `dealerIndex`, `hasBigBlindBet`
  - `potInfo`: side‑pot breakdown derived from `playerDetails`
  - `lastMove`, `timeOfLastMove`
- `playerHands/{uid}`: per‑player hand storage (5 cards) written server‑side during deal

## Phase machine

The phase field on `gamesV2/{gameId}` is the primary driver of backend automation in `functions/updateTriggersV2.js`.

- **`deal`**
  - Trigger: `autoDealV2`
  - Effects:
    - shuffles a deck, deals 5 cards to each `playerHands/{uid}`
    - advances dealer position
    - assigns small/big blind and posts antes
    - resets `isFolded` for the new hand
    - sets `playersActiveInHand = playersInGame`
    - sets `phase = assign-next-turn`
- **`assign-next-turn`**
  - Trigger: `assignNextTurn`
  - Effects:
    - calculates the next player who must act based on table order, current bets, blinds, folds, and all‑ins
    - sets `bettingState.currentTurn`, `callAmount`, `minimumRaiseTo`, `maxBet`
    - sets `phase = bet` when a player action is needed, otherwise `phase = settle`
- **`bet`**
  - Callable endpoints (validated server‑side):
    - `betV2` (in `playerCallsV2.js`)
    - `foldV2` (in `playerCallsV2.js`, only allowed for the current turn)
  - Effects:
    - updates `playerDetails` and sets `phase = assign-next-turn` to advance the round
- **`settle`**
  - Trigger: `autoSettleV2`
  - Effects:
    - recomputes `potInfo` from `playerDetails` at settle time
    - evaluates hands for eligible players and distributes winnings
    - resets bets
    - removes zero‑balance players from `playersInGame`/`playersActiveInHand`
    - sets `phase = deal` if 2+ players remain, else `phase = winner`
- **`winner`**
  - End state for an active game (used by scheduled cleanup)

## Backend architecture

### Callable functions (`functions/playerCallsV2.js`)

Move requests are authenticated and validated on the server:

- `joinGameV2`: join a waiting lobby (capacity enforced server‑side)
- `startGameV2`: moves a lobby to `status=active` and `phase=deal`
- `betV2`: enforces phase, turn ownership, and balance constraints, then advances to `assign-next-turn`
- `foldV2`: only the current turn player may fold; removes them from `playersActiveInHand` and advances to `assign-next-turn`
- `leaveGameV2`: removes the player from the game (and from the active hand); in active games, leaving is treated as a forfeit

### Firestore triggers (`functions/updateTriggersV2.js`)

- `autoDealV2`: deals hands + assigns blinds + moves to `assign-next-turn`
- `updatePotInfo`: recomputes `potInfo` when bets change
- `assignNextTurn`: computes the next action seat (handles folds and new hands)
- `autoSettleV2`: distributes pots, resets bets, removes zero‑balance players, advances to the next hand or winner
- `autoClearFinishedGameV2`: resets a finished room back to a clean waiting lobby

### Scheduled cleanup (`functions/schedulersV2.js`)

- `finishWinnerDeclaredGamesV2`: marks winner‑phase games as finished
- `cleanupInactiveGamesV2`: finishes inactive games and stale waiting lobbies based on `timeOfLastMove`

## Frontend auth + security measures

### Anonymous authentication (`src/pages/Home.svelte`)

The app signs users in anonymously and uses the resulting Firebase Auth UID as the player identity. The UI reads lobby state in realtime from Firestore and invokes callable functions for all gameplay actions.

### Server-side enforcement

- **Authentication**: callable endpoints require `request.auth`
- **Membership checks**: server verifies the caller is a member of the lobby/hand before allowing actions
- **Turn enforcement**: server checks `bettingState.currentTurn` before allowing `betV2` and `foldV2`
- **Bet constraints**: server enforces max bet, minimum call, and all‑in rules
- **Client is untrusted**: UI state is derived from Firestore; the client cannot advance phases directly

## Tests

- Functions tests: `cd functions && npm test`

