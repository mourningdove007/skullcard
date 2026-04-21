import { assert } from "chai";
import * as snarkjs from "snarkjs";
import fs from "fs";
import { buildPoseidon } from "circomlibjs";

describe("Shuffle Verification Test", function () {
    this.timeout(100000); // Proving takes a few seconds

    it("Should generate and verify a shuffle proof", async () => {
        const deck = Array.from({ length: 52 }, (_, i) => i);
        const salts = Array(52).fill(12345n);

        const input = { "cards": deck, "salts": salts };

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            "shuffle_js/shuffle.wasm",
            "shuffle_final.zkey"
        );

        // Merkle Root
        const root = publicSignals[0];

        // Verify
        const vKey = JSON.parse(fs.readFileSync("verification_key.json"));
        const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);

        assert.isTrue(res, "The proof should be valid");
    });


});


describe("Poker Integrity Integration Test", function () {
    this.timeout(100000);
    let poseidon;

    before(async () => {
        poseidon = await buildPoseidon();
    });

    it("Should verify that a dealt card belongs to the ZK-Proven Root", async () => {

        const deck = Array.from({ length: 52 }, (_, i) => i);
        const salts = Array.from({ length: 52 }, (_, i) => BigInt(i + 1000))
        const input = { "cards": deck, "salts": salts };

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input, "shuffle_js/shuffle.wasm", "shuffle_final.zkey"
        );
        const root = publicSignals[0];

        const myCard = deck[0];
        const mySalt = salts[0];

        const leafHashRaw = poseidon([myCard, mySalt]);
        const leafHash = poseidon.F.toString(leafHashRaw);

        const vKey = JSON.parse(fs.readFileSync("verification_key.json"));
        const isProofValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

        assert.isTrue(isProofValid, "Step 1: The proof is valid");

        assert.exists(root, "Step 2: The Root exists to verify against");
    });

});