import { getAuth, signInAnonymously } from "@firebase/auth";
import app from "../../firebaseConfig";
import { getFirestore } from "firebase/firestore";

export const AUTH = getAuth(app);
export const DB = getFirestore(app);

export const SIGNIN = (auth) => {
    if (!auth.currentUser) {
        signInAnonymously(auth)
            .catch(() => {
                console.log("An error occurred while signing in.");
            });
    };
}

