const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

const db = getFirestore();

exports.finishWinnerDeclaredGames = async () => {
  const gamesRef = db.collection("gamesV2");

  const snap = await gamesRef.where("phase", "==", "winner").get();

  if (snap.empty) return;

  const batch = db.batch();

  snap.forEach((doc) => {
    batch.update(doc.ref, {
      status: "finished",
      lastMove: "Game auto-finished after winner declared.",
      timeOfLastMove: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
};

exports.cleanupInactiveGames = async () => {
  const gamesRef = db.collection("gamesV2");

  const tenMinutesAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);

  const [activeSnap, waitingSnap] = await Promise.all([
    gamesRef
      .where("status", "==", "active")
      .where("timeOfLastMove", "<=", tenMinutesAgo)
      .get(),
    gamesRef
      .where("status", "==", "waiting")
      .where("timeOfLastMove", "<=", tenMinutesAgo)
      .where("lastMove", "!=", "Game finished - room reset")
      .get(),
  ]);

  if (activeSnap.empty && waitingSnap.empty) return;

  const batch = db.batch();

  activeSnap.forEach((doc) => {
    batch.update(doc.ref, {
      status: "finished",
      lastMove: "Game auto-finished due to inactivity",
      timeOfLastMove: FieldValue.serverTimestamp(),
    });
  });

  waitingSnap.forEach((doc) => {
    batch.update(doc.ref, {
      status: "finished",
      lastMove: "Game auto-finished due to inactivity",
      timeOfLastMove: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
};
