<script>
  export let size = 96;
  export let currentPot = 0;
  export let coinColor = "var(--primary-color)";
</script>

<div class="token-wrapper" style="--glow-color: {coinColor};">
  <svg
    class="token"
    viewBox="100 80 320 320"
    width={size}
    height={size}
    role="img"
  >
    <text
      x="256"
      y="240"
      text-anchor="middle"
      font-size="100"
      font-weight="800"
      fill={coinColor}
    >
      {currentPot}
    </text>

    <text
      x="256"
      y="330"
      text-anchor="middle"
      font-size="60"
      font-weight="800"
      fill={coinColor}
    >
      POT
    </text>
  </svg>
</div>

<style>
  .token-wrapper {
    display: inline-block;
    line-height: 0; /* prevents extra whitespace */
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
