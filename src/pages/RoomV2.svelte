<script>
  import { doc, onSnapshot } from "firebase/firestore";
  import { DB, AUTH } from "../util/session";
  import { onMount } from "svelte";
  import GlowingRow from "../lib/GlowingRow.svelte";
  import { onAuthStateChanged } from "firebase/auth";
  import { getIconFromNumber, lastTwo } from "../util/micro";
  import IconModal from "../lib/IconModal.svelte";
  import CustomButtom from "../lib/CustomButtom.svelte";
  import { callFold, callLeaveGame, callStartGame } from "../util/backendCallsV2";
  import { backHome } from "../util/navigation";
  import Card from "../lib/Card.svelte";
  import BetSelectorV2 from "../lib/BetSelectorV2.svelte";
    import GlowingToken from "../lib/GlowingToken.svelte";
    import { ArrowBigDown, TriangleAlert, TrophyIcon } from "lucide-svelte";
    import GlowingPhrase from "../lib/GlowingPhrase.svelte";

  export let params;

  let playersInGame = [];
  let uid = "";
  let myHand = [];
  let playerDetails = null;
  let isSelectingIcon = false;
  let status = "loading";
  let isLoading = false;
  let bet = 0;
  let potInfo = [];
  let lastMove = "";
  let smallBlind = "";
  let bigBlind = "";
  let bettingState = {
    currentTurn: "",
    currentBet: 0,
    maxBet: 0,
    lastRaiseAmount: 0,
    callAmount: 0,
    minimumRaiseTo: 0,
  };
  let phase = "";
  let maxBet = 0;
  let currentBet = 0;
  let callAmount = 0;
  let minimumRaiseTo = 0;
  let lastRaiseAmount = 0;
  let currentTurn = "";
  let existingBet = 0;
  let balance = 0;

  const selectIcon = () => {
    isSelectingIcon = true;
  };

  onMount(() => {
    if (!params.gameId) {
      console.error("No gameId in route params");
      return;
    }
    const unsubGame = onSnapshot(
      doc(DB, "gamesV2", params.gameId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          playersInGame = data.playersInGame;
          playerDetails = data.playerDetails;
          lastMove = data.lastMove;
          status = data.status;
          potInfo = data.potInfo;
          smallBlind = data.smallBlind;
          bigBlind = data.bigBlind;
          bettingState = data.bettingState ?? {
            currentTurn: "",
            currentBet: 0,
            lastRaiseAmount: 0,
            callAmount: 0,
            minimumRaiseTo: 0,
          };
          currentTurn = bettingState.currentTurn;
          currentBet = bettingState.currentBet;
          callAmount = bettingState.callAmount;
          minimumRaiseTo = bettingState.minimumRaiseTo;
          lastRaiseAmount = bettingState.lastRaiseAmount;
          maxBet = bettingState.maxBet;
          phase = data.phase;
          existingBet = playerDetails?.[uid]?.bet ?? 0;
          balance = playerDetails?.[uid]?.balance ?? 0;
        } else {
          console.warn("Game document does not exist");
        }
      },
      (error) => {
        console.error("Game snapshot error:", error);
      },
    );

    let unsubPlayer = null;

    const unsubscribeAuth = onAuthStateChanged(AUTH, (user) => {
      if (user) {
        uid = user.uid;

        unsubPlayer = onSnapshot(
          doc(DB, "playerHands", user.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              const playerData = docSnap.data();
              myHand = playerData.hand ?? [];
            } else {
              console.warn("Player document does not exist yet");
              myHand = [];
            }
          },
          (error) => {
            console.error("Player snapshot error:", error);
          },
        );
      } else {
        console.log("No user signed in yet");
        myHand = [];
      }
    });

    return () => {
      unsubGame();
      if (unsubPlayer) unsubPlayer();
      unsubscribeAuth();
    };
  });
</script>


{#if phase === "winner"}
  {@const winnerUid = playersInGame[0]}
  <br />
  <br />
  <GlowingToken
    size={200}
    IconComponent={TrophyIcon}
    label={`WINNER ${lastTwo(winnerUid)}`}
  />
  <br />
  <br />
{/if}
<div
  style="display: flex; flex-direction: row; justify-content: center; gap: 8px;"
>
  {#if status == "waiting"}
    <CustomButtom
      text="Leave"
      onClick={() => {
        isLoading = true;
        callLeaveGame(params.gameId)
          .then(() => {})
          .catch(() => {
            console.log("An error occurred while leaving.");
          })
          .finally(() => {
            isLoading = false;
            backHome();
          });
      }}
      buttonColor={"red"}
      isDisabled={isLoading}
    />
    {@const areMorePlayersRequired = playersInGame.length < 2}
    {@const waitingTitle = "Waiting..."}
    {@const startTitle = "Ready"}

    <CustomButtom
      text={areMorePlayersRequired ? waitingTitle : startTitle}
      isDisabled={areMorePlayersRequired || isLoading}
      onClick={() => {
        isLoading = true;
        callStartGame(params.gameId)
          .catch(() => {
            console.log("An error occurred while starting the game.");
          })
          .finally(() => {
            isLoading = false;
          });
      }}
    />
  {:else}
      <CustomButtom
        text={status === "active" && playersInGame.includes(uid) && phase !== "winner" ? "Forfeit Game" : "Leave"}
        buttonColor="var(--primary-color)"
        isDisabled={isLoading}
        onClick={() => {
          isLoading = true;
          callLeaveGame(params.gameId)
            .then(() => {})
            .catch(() => {
              console.log("An error occurred while leaving.");
            })
            .finally(() => {
              isLoading = false;
              backHome();
            });
        }}/>
  {/if}
  
</div>
  <div
    style={`color:var(--primary-color); margin:5px; text-align:left; max-width: 280px;`}
  >
    {lastMove}
</div>

<div style="display: flex; flex-wrap: nowrap; overflow-x: auto; flex-direction: row; gap: 8px; margin-bottom: 10px; max-width: 280px; ">
  {#each potInfo as pot, i}
    {@const eligiblePlayerAbbreviations = pot.eligiblePlayers.map(player => lastTwo(player))}
    <div style="display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; border: 1px solid var(--primary-color); padding: 5px; border-radius: 5px;">
      <span style="color: var(--primary-color); font-weight: bold; font-size: 0.9em;">
        {i === 0 ? 'POT' : `SIDE ${i}`}: ${pot.amount}
      </span>
      <span style="color: var(--primary-color); font-size: 0.75em; opacity: 0.8;">
        Eligible: {eligiblePlayerAbbreviations.join(", ")}
      </span>
    </div>
  {/each}
</div>


{#if phase === "bet" && bettingState.currentTurn === uid}
<div style="display: flex; flex-direction: row; gap: 20px; justify-content: center;">
  <GlowingPhrase
  size={50}
  IconComponent={TriangleAlert}
  label="YOUR TURN"
  coinColor="var(--user-color)"
/>
<CustomButtom
          text="Fold"
          onClick={() => {
            isLoading = true;
            callFold(params.gameId)
              .catch((error) => {
                console.log("An error occurred while folding.");
              })
              .finally(() => {
                isLoading = false;
              });
          }}
          isDisabled={isLoading}
        />
        </div>
  <BetSelectorV2
    gameId={params.gameId}
    bind:bettingState
    bind:existingBet
    bind:balance
    isMyTurn={bettingState.currentTurn === uid}
    bind:isLoading
    bind:bet
    bind:currentBet
  />
{/if}

<div>
  <span
    style="display: flex; flex-direction:row; gap:5px; justify-content: center"
  >
    {#each Array(5) as _, i}
      {@const card = myHand[i]}

      <Card
        isHidden={!card || status === "waiting" || status === "winner-declared"}
        suit={card?.suit}
        cardValue={card?.value}
      />
    {/each}
  </span>
</div>

<div>
  {#each playersInGame as playerId, i}
    {@const details = playerDetails?.[playerId]}
    <div style="margin-top: 5px;">
      {#if isSelectingIcon && playerId === AUTH.currentUser.uid}
        <IconModal gameID={params.gameId} bind:isSelectingIcon />
      {/if}

      {#if status === "waiting" && playerId === AUTH.currentUser.uid}
        <GlowingPhrase
          size={70}
          IconComponent={ArrowBigDown}
          label={`YOU`}
          coinColor="var(--user-color)"
          reverse
        />
      {/if}

      <GlowingRow
        uid={playerId}
        balance={details?.balance ?? 0}
        bet={details?.bet ?? 0}
        coinColor={playerId === AUTH.currentUser.uid
          ? "var(--user-color)"
          : "var(--primary-color)"}
        IconComponent={getIconFromNumber(details?.icon ?? 1)}
        onIconClick={selectIcon}
        iconClickable={playerId === AUTH.currentUser.uid}
        isBigBlind={playerId === bigBlind}
        isSmallBlind={playerId === smallBlind}
        isTurn={playerId === currentTurn}
        isFolded={details?.isFolded ?? false}
      />
    </div>
  {/each}
</div>
