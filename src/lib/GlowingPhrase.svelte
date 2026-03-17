<script>
    export let size = 96;
    export let label = "TOKEN DOVE";
    export let coinColor = "#7300FF";
    export let IconComponent;
    export let reverse = false;
</script>

<div
    class="token-wrapper"
    style="--glow-color: {coinColor};"
    aria-label={label}
>
    <svg
        class="token"
        viewBox="85 80 335 320"
        width={size}
        height={size}
        role="img"
    >
        <svelte:component
            this={IconComponent}
            x="150"
            y={reverse ? "200" : "110"}
            color={coinColor}
            size="200"
        />

        <text
            x="256"
            y={reverse ? "160" : "350"}
            text-anchor="middle"
            font-size="58"
            font-weight="800"
            fill={coinColor}
        >
            {label}
        </text>
    </svg>
</div>

<style>
    .token-wrapper {
        display: inline-block;
        line-height: 0;
    }

    .token {
        display: block;
        transform-origin: center;
        animation: spin 5s linear infinite;
        transform-style: preserve-3d;
    }

    @keyframes spin {
        from {
            transform: rotateY(0deg);
        }
        to {
            transform: rotateY(360deg);
        }
    }
</style>
