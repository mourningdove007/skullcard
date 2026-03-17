import { push } from "svelte-spa-router";

export const backHome = async () => {
    await push("/");
};

export const goToRoom = async (gameId) => {
    await push(`/room/${gameId}`);
};

export const goToRoomV2 = async (gameId) => {
    await push(`/room-v2/${gameId}`);
};