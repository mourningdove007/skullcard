<script>
    import { callUpdateIcon } from "../util/backendCallsV2";
    import { getIconFromNumber } from "../util/micro";

    export let gameID = "";
    export let isSelectingIcon;

    const closeModal = () => {
        isSelectingIcon = false;
    };
</script>

<div style="color:var(--user-color); font-size:larger; margin-top:5px">
    Select a new icon.
</div>
<div class="icon-grid">
    {#each Array(8) as _, i}
        <button
            class="icon-button"
            onclick={() => {
                callUpdateIcon(gameID, i + 1)
                    .catch(() => {
                        console.log("error occurred updating icon.");
                    })
                    .finally(() => {
                        closeModal();
                    });
            }}
        >
            <svelte:component this={getIconFromNumber(i + 1)} size={28} />
        </button>
    {/each}
</div>

<style>
    .icon-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-width: 200px;
        margin: auto;
        margin-bottom: 5px;
        justify-content: center;
    }

    .icon-button {
        width: 40px;
        height: 40px;
        background-color: var(--user-color);
        color: var(--bg-color);
        border: none;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.15s ease;
    }

    .icon-button:hover {
        transform: scale(1.1);
    }

    .icon-button:active {
        transform: scale(0.95);
    }
</style>
