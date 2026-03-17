import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../../firebaseConfig';

const functions = getFunctions(app);

const joinGame = httpsCallable(functions, 'joinGameV2');
const leaveGame = httpsCallable(functions, 'leaveGameV2');
const startGame = httpsCallable(functions, 'startGameV2');
const bet = httpsCallable(functions, 'betV2');
const fold = httpsCallable(functions, 'foldV2');


export const updatePlayerIcon = httpsCallable(functions, "updatePlayerIconV2");


export const callJoinGame = async (gameId) => {
    await joinGame({ gameId });
};
export const callLeaveGame = async (gameId) => {
    await leaveGame({ gameId });
};

export const callFold = async (gameId) => {
    await fold({ gameId });
};

export const callStartGame = async (gameId) => {
    await startGame({ gameId });
};

export const callBet = async (gameId, amount) => {
    await bet({ gameId, amount });
};

export const callUpdateIcon = async (gameId, icon) => {
    await updatePlayerIcon({ gameId, icon });
};

