<script>
    import { Skull } from "lucide-svelte";
    import { lastTwo } from "../util/micro";

    export let uid = "";
    export let balance = 0;
    export let coinColor = "#7300FF";
    export let isTurn = false;
    export let isDealer = false;
    export let isSmallBlind = false;
    export let isBigBlind = false;
    export let isFolded = false;
    export let bet = 0;
    export let onIconClick = () => {};
    export let iconClickable = false;

    export let IconComponent = null;
</script>

<div
    class="player-column"
    class:turn={isTurn}
    style={`color:${coinColor}; --glow-color: ${coinColor}; opacity: ${isFolded ? 0.2 : 1};`}
>
    <button
        class="player-icon"
        on:click={iconClickable ? onIconClick : () => {}}
    >
        {#if IconComponent}
            <svelte:component
                this={IconComponent}
                size={28}
                color="var(--bg-color)"
            />
        {/if}
    </button>

    <div class="info">
        <div class="uid">{lastTwo(uid)}</div>
        <div class="balance">{`$${balance}`}</div>
        <div class="bet">{`bet: $${bet}`}</div>
    </div>

    <div class="bust">
        {#if isDealer}
            D
        {:else if isSmallBlind}
            SB
        {:else if isBigBlind}
            BB
        {/if}
    </div>
</div>

<style>
    .player-column {
        position: relative;
        display: flex;
        align-items: center;
        gap: 6px;
        background-color: color-mix(
            in srgb,
            var(--glow-color) 20%,
            transparent
        );
        border-radius: 10px;
        overflow: hidden;
        transition:
            transform 0.15s ease,
            border 0.2s ease;
        padding: 6px;
    }

    .player-column.turn::before {
        content: "";
        position: absolute;
        inset: -18px;
        background: var(--glow-color);
        filter: blur(22px);
        opacity: 0.85;
        z-index: -1;
        border-radius: 20px;
        animation: pulse 1.6s ease-in-out infinite;
    }

    .player-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-width: 0px;
        background-color: var(--glow-color);
    }

    .bust {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--bg-color);
        background-color: var(--glow-color);
    }

    .bet {
        width: 70px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--bg-color);
        flex-shrink: 0;
        background-color: var(--glow-color);
        border-radius: 10px;
        max-width: 100px;
        font-size: 0.85rem;
        font-weight: 700;
    }

    .info {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        flex: 1;
    }

    .uid {
        font-size: 0.8rem;
        opacity: 0.85;
        font-family: monospace;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        background-color: var(--glow-color);
        color: var(--bg-color);
        border-radius: 10px;
        width: 40px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .balance {
        font-size: 1rem;
        font-weight: 700;
        background-color: var(--glow-color);
        color: var(--bg-color);
        border-radius: 10px;
        width: 60px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    @keyframes pulse {
        0% {
            opacity: 0.55;
        }
        50% {
            opacity: 0.95;
        }
        100% {
            opacity: 0.55;
        }
    }
</style>
