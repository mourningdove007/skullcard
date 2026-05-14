import { assert } from "chai";
import path from "path";
import tester from "circom_tester";
const wasm_tester = tester.wasm;

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Shuffle Circuit Test", function () {
    let circuit;

    beforeEach(async () => {
        circuit = await wasm_tester(path.join(__dirname, "shuffle.circom"));
    });

    it("Should fail if there are duplicate cards", async () => {
        const input = {
            "cards": Array(52).fill(0),
            "salts": Array(52).fill(123)
        };
        try {
            await circuit.calculateWitness(input);
            assert.fail("Circuit should have failed for duplicate cards");
        } catch (err) {
            assert.include(err.message, "Assert Failed", "Error should be a constraint failure");
        }
    });

    it("Should generate a valid root for a correct deck", async () => {
        const deck = Array.from({length: 52}, (_, i) => i);
        const salts = Array(52).fill(1);
        
        const witness = await circuit.calculateWitness({ "cards": deck, "salts": salts });
        await circuit.checkConstraints(witness);
        
        const root = witness[1]; 
        assert.exists(root);
    });
});