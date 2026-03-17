<script>
    export let size = 96;
    export let label = "TOKEN DOVE";
    export let coinColor = "var(--primary-color)";
    export let IconComponent;
</script>

<div
    class="token-wrapper"
    style="--glow-color: {coinColor}; width: {size}px; height: {size}px;"
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

        <!-- Card body -->
        <rect
            x="96"
            y="56"
            width="320"
            height="400"
            rx="32"
            ry="32"
            fill="var(--bg-color)"
        />

        <!-- Card border -->
        <rect
            x="112"
            y="72"
            width="288"
            height="368"
            rx="28"
            ry="28"
            fill="none"
            stroke={coinColor}
            stroke-width="6"
            opacity="0.9"
        />

        <!-- Icon -->
        <svelte:component
            this={IconComponent}
            x="180"
            y="130"
            color={coinColor}
            size="140"
        />

        <!-- Label -->
        <text
            x="256"
            y="360"
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
        border-radius: 300px;
        z-index: -1;
    }

    .token {
        display: block;
        transform-origin: center;
        animation: spin 18s linear infinite;
        transform-style: preserve-3d;

        /* slight tilt */
        transform: rotate(-8deg);
    }

    @keyframes spin {
        from {
            transform: rotate(-8deg) rotateY(0deg);
        }
        to {
            transform: rotate(-8deg) rotateY(360deg);
        }
    }
</style>
