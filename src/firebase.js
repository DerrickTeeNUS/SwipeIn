import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAuHnGq8LS8Mo9p-6Se3t_0PGzOrijvyes",
  authDomain: "tapin-17936.firebaseapp.com",
  projectId: "tapin-17936",
  storageBucket: "tapin-17936.firebasestorage.app",
  messagingSenderId: "218389950894",
  appId: "1:218389950894:web:56fe8122ffda860913183f",
  measurementId: "G-LP04B7PBR8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);