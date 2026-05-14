import init, { prove_deck, verify_deck } from "../pkg/halo_circuit.js";

const N = 52;

let deck = [];
let bundle = null;
let tampered = false;

const btnShuffle = document.getElementById("btn-shuffle");
const btnProve   = document.getElementById("btn-prove");
const btnVerify  = document.getElementById("btn-verify");
const btnTamper  = document.getElementById("btn-tamper");
const statusEl   = document.getElementById("status");
const proofInfo  = document.getElementById("proof-info");
const grid       = document.getElementById("deck-grid");

function setStatus(msg, kind = "") {
  statusEl.textContent = msg;
  statusEl.className = "status " + kind;
}

function renderDeck() {
  grid.innerHTML = "";
  deck.forEach((val, pos) => {
    const cell = document.createElement("div");
    cell.className = "card active" + (tampered && pos === 0 ? " tampered" : "");
    cell.textContent = val;
    grid.appendChild(cell);
  });
}

function resetProof() {
  bundle = null;
  btnVerify.disabled = true;
  btnTamper.disabled = true;
  proofInfo.textContent = "";
  tampered = false;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

btnShuffle.addEventListener("click", () => {
  deck = shuffle([...Array(N).keys()]);
  renderDeck();
  resetProof();
  btnProve.disabled = false;
  setStatus("Deck shuffled. Ready to prove.");
});

btnProve.addEventListener("click", async () => {
  btnShuffle.disabled = true;
  btnProve.disabled = true;
  setStatus("Proving… (key generation + proof, may take a few seconds)");

  await new Promise(r => setTimeout(r, 20));

  try {
    const cards = new Uint8Array(deck);
    bundle = prove_deck(cards);
    proofInfo.textContent = `Proof bundle: ${bundle.length} bytes`;
    setStatus("Proof generated.", "ok");
    btnVerify.disabled = false;
    btnTamper.disabled = false;
  } catch (e) {
    setStatus("Prove failed: " + e, "err");
  } finally {
    btnShuffle.disabled = false;
    btnProve.disabled = false;
  }
});

btnVerify.addEventListener("click", async () => {
  if (!bundle) return;
  btnVerify.disabled = true;
  setStatus("Verifying…");

  await new Promise(r => setTimeout(r, 20));

  try {
    const valid = verify_deck(bundle);
    setStatus(valid ? "Proof verified!" : "Proof INVALID.", valid ? "ok" : "err");
  } catch (e) {
    setStatus("Verify failed: " + e, "err");
  } finally {
    btnVerify.disabled = false;
  }
});

btnTamper.addEventListener("click", () => {
  if (!bundle) return;

  bundle[bundle.length - 1] ^= 0xff;

  tampered = true;
  renderDeck();
  setStatus("Proof tampered. Verify should now fail.", "err");
});

async function main() {
  try {
    await init();
    setStatus("WASM loaded. Click Shuffle to begin.");
    btnShuffle.disabled = false;
  } catch (e) {
    setStatus("Failed to load WASM: " + e, "err");
  }
}

main();
