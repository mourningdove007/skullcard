<script>
  // @ts-nocheck

  import { push } from "svelte-spa-router";
  import { doc, onSnapshot, collection } from "firebase/firestore";
  import { AUTH, SIGNIN, DB } from "../util/session";
  import GlowingButton from "../lib/CustomButtom.svelte";
  import GlowingToken from "../lib/GlowingToken.svelte";
  import { Skull } from "lucide-svelte";
  import { signInAnonymously } from "firebase/auth";
  import { goToRoomV2 } from "../util/navigation";
  import { applyTheme, lastFour } from "../util/micro";
  import { callJoinGame } from "../util/backendCallsV2";
  import JoinRoomButton from "../lib/JoinRoomButton.svelte";
  import GlowingCard from "../lib/GlowingCard.svelte";
  import CustomButtom from "../lib/CustomButtom.svelte";
  import { getAnalytics, logEvent } from "firebase/analytics";
  import { analytics } from "../../firebaseConfig";

  let games = [];
  let isLoading = false;
  let isSelectingTheme = false;
  let selectedColor = "Purple";
  let previousColor = "Purple";
  let phase = "";

  SIGNIN(AUTH);

  onSnapshot(collection(DB, "gamesV2"), (snap) => {
    games = snap.docs.map((doc) => ({
      gameID: doc.id,
      playerCount: doc.data().playersInGame?.length ?? 0,
      gameStatus: doc.data().status ?? "unknown",
      phase: doc.data().phase ?? "unknown",
    }));
  });
</script>

<GlowingCard size={200} IconComponent={Skull} label="SKULLCARD" />
<br />
<br />
<div class="description">5-card draw made dead simple.</div>
<CustomButtom
  text={isSelectingTheme ? "Confirm Theme" : "Set Theme"}
  onClick={() => {
    if (isSelectingTheme && selectedColor !== previousColor) {
      previousColor = selectedColor;
      logEvent(analytics, `confirmed_${selectedColor}_theme`);
    }

    isSelectingTheme = !isSelectingTheme;
  }}
/>
{#if isSelectingTheme}
  <div
    style="display: flex; flex-wrap: wrap;  justify-content:center; margin:auto; width: 250px;"
  >
    {#each ["Purple", "Pink", "Crimson", "Gold"] as color, i}
      <div style="width:50%; box-sizing:border-boxl">
        <JoinRoomButton
          text={color}
          onClick={() => {
            applyTheme(color);
            selectedColor = color;
          }}
        />
      </div>
    {/each}
  </div>
{:else}
  <div
    style="display: flex; flex-wrap: wrap;  justify-content:center; margin:auto; width: 250px;"
  >
    {#each games as game, i}
      {@const gameID = game.gameID}
      {@const playerCount = game.playerCount}
      {@const status = game.gameStatus}
      {@const playersInGame = game.playersInGame ?? []}
      {@const uid = AUTH.currentUser? AUTH.currentUser.uid : "unknown"}
      {@const isPlayerInGame = playerCount > 0 ? playersInGame.includes(uid) : false}
      {@const waitingButtonText = `Join #${i + 1} (${playerCount}/6)`}
      {@const activeButtonText = `Active (${playerCount}/6)`}
      {@const phase = game.phase}
      {@const winnerAnnounced = `Resetting...`}
      <div style="width:50%; box-sizing:border-boxl">
        <JoinRoomButton
          text={(status === "active")
            ? activeButtonText
            : phase === "winner"
              ? winnerAnnounced
              : waitingButtonText}
          onClick={() => {
            isLoading = true;
            callJoinGame(gameID)
              .then(() => {
              })
              .catch(() => {
                console.log("An error occurred while leaving.");
              })
              .finally(() => {
                isLoading = false;
                goToRoomV2(gameID);
              });
          }}
          isDisabled={isLoading ||
            (playerCount >= 6 && status === "waiting" && !isPlayerInGame) ||
            (status === "active" && isPlayerInGame)}
        />
      </div>
    {/each}
  </div>
{/if}

<style>
  .description {
    color: var(--primary-color);
    justify-content: center;
    margin-top: 5px;
    margin-bottom: 5px;
  }
</style>
