<script>
    export let size = 96;
    export let label = "TOKEN DOVE";
    export let coinColor = "var(--primary-color)";
    export let IconComponent;
</script>

<div
    class="token-wrapper"
    style="--glow-color: {coinColor};
 width: {size}px; height: {size}px;"
    aria-label={label}
>
    <svg
        class="token"
        viewBox="0 0 512 512"
        width={size}
        height={size}
        role="img"
    >
        <defs>
            <filter id="engraveShadow">
                <feOffset dx="0" dy="1" />
                <feGaussianBlur stdDeviation="1.2" />
                <feComposite operator="out" in2="SourceGraphic" />
            </filter>
        </defs>

        <circle cx="256" cy="256" r="240" fill="var(--bg-color)" />
        <circle
            cx="256"
            cy="256"
            r="210"
            fill="none"
            stroke={coinColor}
            stroke-width="5"
            opacity="0.9"
        />

        <svelte:component
            this={IconComponent}
            x="150"
            y="110"
            color={coinColor}
            {size}
        />

        <text
            x="256"
            y="350"
            text-anchor="middle"
            font-size="40"
            font-weight="800"
            fill={coinColor}
            stroke="none"
            opacity="1"
        >
            {label}
        </text>
    </svg>
</div>

<style>
    .token-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .token-wrapper::before {
        content: "";
        position: absolute;
        inset: -12px;
        background: var(--glow-color);
        filter: blur(14px);
        opacity: 0.75;
        border-radius: 50%;
        z-index: -1;
    }

    .token {
        display: block;
        transform-origin: center;
        animation: spin 18s linear infinite;
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
