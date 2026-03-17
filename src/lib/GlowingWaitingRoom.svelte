<script>
  export let label = "";
  export let title = "";
</script>

<div class="container">
  <div class="title">
    {title}
  </div>

  <div class="label">
    {label}
  </div>
</div>

<style>
  .title {
    font-size: large;
    font-weight: bolder;
  }

  .label {
    font-size: large;
    font-weight: bold;
  }
  .container {
    display: flex;
    flex-direction: column;
    background-color: var(--primary-color);
    justify-content: center;
    border-radius: 10px;
    color: var(--bg-color);
    width: 180px;
    margin: auto;
    padding-top: 5px;
    padding-bottom: 5px;
  }
</style>
