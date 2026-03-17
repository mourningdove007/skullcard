const { setGlobalOptions } = require("firebase-functions");
const { onCall } = require("firebase-functions/v2/https");
const {
  onDocumentUpdated
} = require('firebase-functions/v2/firestore');
const { onSchedule } = require("firebase-functions/scheduler");
const { initializeApp } = require('firebase-admin/app');

initializeApp();

setGlobalOptions({ maxInstances: 5 });

// Import handlers
const updateTriggersV2 = require("./updateTriggersV2");
const playerCallsV2 = require("./playerCallsV2");
const schedulersV2 = require("./schedulersV2");

// Export update triggers V2
exports.autoClearFinishedGameV2 = onDocumentUpdated("gamesV2/{gameId}", updateTriggersV2.autoClearFinishedGame);
exports.autoDealV2 = onDocumentUpdated("gamesV2/{gameId}", updateTriggersV2.autoDeal);
exports.updatePotInfo = onDocumentUpdated("gamesV2/{gameId}", updateTriggersV2.updatePotInfo);
exports.assignNextTurn = onDocumentUpdated("gamesV2/{gameId}", updateTriggersV2.assignNextTurn);
exports.autoSettleV2 = onDocumentUpdated("gamesV2/{gameId}", updateTriggersV2.autoSettleV2);

// Export player calls V2
exports.joinGameV2 = onCall(playerCallsV2.joinGame);
exports.leaveGameV2 = onCall(playerCallsV2.leaveGame);
exports.startGameV2 = onCall(playerCallsV2.startGame);
exports.updatePlayerIconV2 = onCall(playerCallsV2.updatePlayerIcon);
exports.foldV2 = onCall(playerCallsV2.fold);
exports.betV2 = onCall(playerCallsV2.bet);

// Export schedulers V2
exports.finishWinnerDeclaredGamesV2 = onSchedule("every 5 minutes", schedulersV2.finishWinnerDeclaredGames);
exports.cleanupInactiveGamesV2 = onSchedule("every 10 minutes", schedulersV2.cleanupInactiveGames);
