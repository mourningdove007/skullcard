# SkullCard

Realtime multiplayer 5-card draw poker built with **Svelte** and **Firebase**. The server is authoritative for all game state.

## Zero-Knowledge Proof

SkullCard uses a zero-knowledge proof protocol to give players cryptographic guarantees about the deck without revealing card identities or deck order.

The server proves two things to each client at the start of every hand:

1. **The deck is a valid permutation**: the 52 cards dealt are a shuffle of the unique values `{0, 1, ..., 51}`, with no duplicates or omissions.
2. **Each player's cards came from that deck**: using a Merkle tree committed to in the proof, each player can verify their cards are leaves of the same tree the server proved.

A third statement can be established between players directly, without server involvement:

3. **Opponents hold unique cards from the same deck**: players can exchange their Merkle paths with each other to confirm no two players were dealt the same card.

### How it works

The server generates a shuffled deck `A` and random salts `S`, then runs them through an arithmetic circuit compiled with [Circom](https://docs.circom.io). The circuit enforces the permutation constraint and outputs a Merkle root committing to the deck. A Groth16 SNARK proof is generated from this witness using [snarkjs](https://github.com/iden3/snarkjs).

Each player receives `(hand, merkle_path, proof)`. The proof and verification key are public, so any player can verify the proof independently.

### Limitations

The current protocol does not prove the deck was randomly shuffled. The server chooses the ordering, and clients must trust it is not biased. A future protocol allowing clients to contribute randomness to the salt generation is described in the whitepaper.

### Whitepaper

The full technical description is in [`zk/circuits/report/`](zk/circuits/report/main.pdf).

## Stack

- **Frontend**: Svelte SPA
- **Backend**: Firebase Cloud Functions (Node.js), Firestore, Auth, Hosting
- **ZK**: Circom circuit, snarkjs (Groth16), circomlib

## Tests

```
# Application
cd functions && npm test

# ZK circuit
cd zk/circuits && npm test
```
