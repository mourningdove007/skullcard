# Reading list: cryptography in the ZK service

Short orientations for terms that appear in [`README.md`](README.md) and in the shuffle prover stack. This is a map for self-study, not a substitute for textbooks or papers.

## Zero-knowledge proofs (ZK)

A **zero-knowledge proof** lets a prover convince a verifier that a statement is true (for example, “this circuit is satisfied for some witness I am not revealing”) without leaking the witness. The service uses this pattern: the client supplies `cards` and `salts`; the proof attests that the circuit’s constraints hold for those inputs while keeping private witness details inside the proof machinery.

- *ZK intro (intuition):* [Proofs, Arguments, and Zero-Knowledge](https://people.cs.georgetown.edu/jthaler/ProofsArgsAndZK.html) (Justin Thaler) — free book-style notes.
- *Classic survey:* Goldreich’s chapters on interactive proofs and zero knowledge (any modern crypto textbook).

## Groth16

**Groth16** is a succinct **non-interactive** zero-knowledge argument of knowledge for arithmetic circuits (R1CS). It produces a **constant-size** proof (three group elements in the usual encoding) and fast verification using a **pairing** on elliptic curves. The `zk` service labels proofs with `"protocol": "groth16"` to match snarkjs.

- *Original paper:* Jens Groth, “On the Size of Pairing-based Non-interactive Arguments” ([ePrint 2016/260](https://eprint.iacr.org/2016/260)).
- *Implementation context:* [snarkjs](https://github.com/iden3/snarkjs) `groth16.fullProve` in the Node prover service.

## BN254, `bn128`, and Ethereum naming

**BN254** is a pairing-friendly elliptic curve (a Barreto–Naehrig curve over a 254-bit prime field). Ethereum precompiles and **snarkjs** historically call this curve **`bn128`** (same curve, different label). The README’s `curve: "bn128"` field is that ecosystem name.

- *Curve details:* [BN254 / alt_bn128](https://electriccoin.co/blog/new-snark-curve/) (Electric Coin blog, curve background).
- *Standards context:* Search for “BN254” / “alt_bn128” in EIP documentation for precompile semantics.

## Pairings, **G1**, and **G2**

A **bilinear pairing** is a map \(e: \mathbb{G}_1 \times \mathbb{G}_2 \rightarrow \mathbb{G}_T\) used in Groth16 verification: the verifier checks an equation in \(\mathbb{G}_T\) without seeing the full witness.

- **G1** and **G2** are the two **source groups** of the pairing (points on related elliptic curves over \(\mathbb{F}_p\) and \(\mathbb{F}_{p^2}\) in the BN254 setting). Groth16 puts some proof elements in G1 and one in G2 so the verifier’s pairing equation balances.
- *Readable pairing primer:* Dan Boneh’s pairing-based crypto lectures / chapters in graduate crypto notes.
- *Textbook:* “Pairing-Based Cryptography” chapters in *Advances in Elliptic Curve Cryptography* or similar.

## R1CS (rank-1 constraint system)

**R1CS** expresses a computation as a system of constraints of the form \((A \cdot z) \circ (B \cdot z) = (C \cdot z)\) over a finite field. **Circom** compiles `shuffle.circom` to **R1CS** (`shuffle.r1cs`). The prover fills a witness vector \(z\) (private and public parts) so all constraints hold.

- *R1CS in ZK pipelines:* Vitalik Buterin’s [Quadratic Arithmetic Programs](https://medium.com/@VitalikButerin/quadratic-arithmetic-programs-from-zero-to-hero-f6d558cea649) (QAP/R1CS intuition).

## Witness and WASM

The **witness** is the assignment to all signals in the circuit that satisfies the constraints. **Circom** emits a **WASM** witness calculator (`shuffle_js/shuffle.wasm`); the prover runs it to compute the witness from inputs (`cards`, `salts`) before proving.

- *Circom docs:* [Circom documentation](https://docs.circom.io/).

## Poseidon hash function

**Poseidon** is a **hash function tailored for arithmetic circuits** over a prime field. Unlike SHA-256, which is expensive to express in R1CS (many bit-wise constraints), Poseidon is built from **field additions and multiplications** (a sponge over a **Hades** permutation), so it costs far fewer constraints inside Circom and similar toolchains. That makes it a standard choice for **Merkle trees**, **commitments**, and **nullifiers** in ZK apps on BN254-style curves.

In this repo, **`shuffle.circom`** includes Poseidon from **circomlib** (`poseidon.circom`) to hash card/salt pairs into leaves and to combine nodes up the tree; JS tests use **circomlibjs**’s `buildPoseidon()` for the same algebra off-chain.

- *Original paper:* Lorenzo Grassi et al., “Poseidon: A New Hash Function for Zero-Knowledge Proof Systems” ([ePrint 2019/458](https://eprint.iacr.org/2019/458)).
- *Implementations:* [circomlib Poseidon templates](https://github.com/iden3/circomlib) (circuits), [circomlibjs](https://github.com/iden3/circomlibjs) (JavaScript, witness / test helpers).

## Trusted setup: Powers of Tau and `.zkey`

**Groth16** needs a **structured reference string (SRS)** generated in a **trusted setup** (or multi-party ceremony). The README’s flow uses:

- **Powers of Tau** (`.ptau`): a universal phase-1 file, curve-agnostic up to a max constraint size.
- **Groth16 setup** + **contribution** → **`shuffle_final.zkey`**: circuit-specific proving/verification material (the server loads the **proving key** from this file).

- *snarkjs ceremony flow:* [snarkjs README](https://github.com/iden3/snarkjs) (groth16 setup, contribute, prove, verify).
- *Trust model:* Understand that a compromised ceremony breaks soundness; MPC reduces trust to “at least one honest participant.”

## snarkjs proof JSON shape

**snarkjs** serializes Groth16 proofs as `pi_a`, `pi_b`, `pi_c` with decimal string coordinates. The HTTP `POST /` response returns that proof object together with `publicSignals` at the top level (see README). Verification in JS typically uses the same shape plus `verification_key.json`.

---

## TODO: document `pi_a`, `pi_b`, `pi_c`, and `publicSignals` for this repo

Extend [`README.md`](README.md) (or this file) with a **dedicated subsection** that explains, for the **example response** in the README:

- [ ] **`pi_a`**: which Groth16 group element it encodes (G1), role in the verification equation, and why the third component is `"1"` in affine/homogeneous form.
- [ ] **`pi_b`**: G2 element, why coordinates appear as pairs of field elements (Fp2 limbs), and meaning of the third pair `["1","0"]` in snarkjs encoding.
- [ ] **`pi_c`**: second G1 element in the proof tuple and how it relates to the committed witness/randomness.
- [ ] **`publicSignals`**: how they are ordered and produced from the circuit’s **public outputs** (in this project: the single root/value from `shuffle.circom`), and how they tie into verification.
- [ ] **Generation path**: trace from `snarkjs.groth16.fullProve` in `services.js` to the exact JSON fields in the example, including how witness generation (WASM) and proving (`.zkey`) combine into `pi_a` / `pi_b` / `pi_c` / `publicSignals`.

This TODO is intentionally scoped to the README’s example JSON so newcomers can connect file names, types, and math in one place.
