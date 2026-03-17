<script>
  import Router from "svelte-spa-router";

  import Home from "./pages/Home.svelte";
  import Room from "./pages/Room.svelte";
  import RoomV2 from "./pages/RoomV2.svelte";

  const routes = {
    "/": Home,
    "/room/:gameId": Room,
    "/room-v2/:gameId": RoomV2,
  };
</script>

<Router {routes} />
