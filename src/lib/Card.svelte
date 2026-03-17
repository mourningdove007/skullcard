<script>
    import { Club, Diamond, Heart, Spade, EyeClosed } from "lucide-svelte";
    export let isHidden = true;
    export let suit = "club"; // "club" | "diamond" | "heart" | "spade"
    export let cardValue = "0";

    const suitIcons = {
        club: Club,
        diamond: Diamond,
        heart: Heart,
        spade: Spade,
    };

    $: SuitIcon = suitIcons[suit] ?? Club;
</script>

{#if isHidden}
    <div class="card">
        <EyeClosed
            size={30}
            fill="var(--primary-color)"
            color="var(--primary-color)"
        />
    </div>
{:else}
    <div class="card">
        <svelte:component
            this={SuitIcon}
            size={30}
            fill="var(--primary-color)"
            color="var(--primary-color)"
        />
        <div class="numerical">{cardValue}</div>
    </div>
{/if}

<style>
    .card {
        border: 2px solid var(--primary-color);
        background-color: var(--bg-color);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;

        height: 80px;
        width: 50px;
        border-radius: 6px;

        padding: 4px 8px;
        box-sizing: border-box;
    }

    .numerical {
        font-size: 20px;
        font-weight: 800;
        color: var(--primary-color);
        line-height: 1;
    }
</style>
