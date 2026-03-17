<script>
    export let onClick = () => {};
    export let text = "Click Me";
    export let buttonColor = "var(--primary-color)";
    export let isDisabled = false;
</script>

<button
    class="glow-btn"
    on:click={isDisabled ? () => {} : onClick}
    style={isDisabled
        ? "background-color:grey"
        : `background-color: ${buttonColor}`}
    disabled={isDisabled}
>
    <div class="button-content">
        <span>{text}</span>
    </div>
</button>

<style>
    .button-content {
        align-items: center;
        justify-content: center;
    }

    .glow-btn {
        margin: 5px;
        position: relative;
        padding: 12px 8px;
        border-radius: 80px;
        font-weight: 800;
        font-size: 16px;
        color: var(--bg-color);
        border: none;
        cursor: pointer;
        z-index: 1;
        width: 120px;
    }

    .glow-btn:hover::before {
        opacity: 1;
    }

    .glow-btn:hover {
        transform: scale(1.04);
        transition: transform 0.2s ease;
    }
</style>
