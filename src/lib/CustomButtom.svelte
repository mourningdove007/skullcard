<script>
    import { HatGlasses } from "lucide-svelte";

    export let onClick = () => {};
    export let text = "Click Me";
    export let buttonColor = "var(--primary-color)";
    export let showAnon = false;
    export let isDisabled = false

</script>

<button
    class="glow-btn"
    on:click={isDisabled? ()=> {} : onClick}
    style={isDisabled? "background-color:grey":`background-color: ${buttonColor}`}
    disabled={isDisabled}
>
    <div class="button-content">
        {#if showAnon}
            <HatGlasses />
        {/if}

        <span>{text}</span>
    </div>
</button>

<style>
    .button-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
    }

    .glow-btn {
        position: relative;
        padding: 14px 36px;
        border-radius: 80px;
        font-weight: 800;
        font-size: 16px;
        color: var(--bg-color);;
        border: none;
        cursor: pointer;
        z-index: 1;
        margin-bottom: 5px;
    }


    .glow-btn:hover::before {
        opacity: 1;
    }

    .glow-btn:hover {
        transform: scale(1.04);
        transition: transform 0.2s ease;
    }
</style>
