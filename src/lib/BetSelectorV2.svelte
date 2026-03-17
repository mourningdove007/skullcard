<script>
  import { Minus, Plus } from "lucide-svelte";
  import CustomButtom from "./CustomButtom.svelte";
  import { callBet } from "../util/backendCallsV2";

  export let gameId = null;
  export let bettingState = {
    currentTurn: "",
    currentBet: 0,
    maxBet: 0,
    callAmount: 0,
    minimumRaiseTo: 0,
  };
  export let existingBet = 0;
  export let balance = 0;
  export let isMyTurn = false;
  export let isLoading = false;
  export let bet = bettingState.currentBet;
  export let currentBet = bettingState.currentBet;

  const maxBet = bettingState.maxBet ?? 0;
  const effectiveMin =
    balance + existingBet >= currentBet ? currentBet : existingBet + balance;
  const effectiveMax = maxBet;

  if (effectiveMax >= effectiveMin) {
    const clamped = Math.min(Math.max(bet || effectiveMin, effectiveMin), effectiveMax);
    if (bet !== clamped) bet = clamped;
  }

  const step = 5;

  const increase = () => {
    bet = Math.min(bet + step, effectiveMax);
  };

  const decrease = () => {
    bet = Math.max(bet - step, effectiveMin);
  };

</script>

<div class="bet-container">
  <button on:click={decrease} disabled={bet <= effectiveMin || !isMyTurn}>
    <Minus size="24" />
  </button>
  <CustomButtom
    text={bet === currentBet ? `Call ${bet}` : `Raise to ${bet}`}
    onClick={() => {
      if (!isMyTurn || isLoading) return;
      isLoading = true;
      callBet(gameId, bet)
        .catch(() => {
          console.log("An error occurred while placing bet.");
        })
        .finally(() => {
          isLoading = false;
          bet = 0;
        });
    }}
    isDisabled={isLoading || !isMyTurn}
  />

  <button on:click={increase} disabled={bet >= effectiveMax || !isMyTurn}>
    <Plus size="24" />
  </button>
</div>

<style>
  .bet-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    font-size: 2.5rem;
  }

  button {
    background: none;
    background-color: var(--primary-color);
    border: none;
    font-size: xx-large;
    border-radius: 6px;
    cursor: pointer;
    color: var(--bg-color);
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
