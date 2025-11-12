// firebase/config.ts
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCTVGO3AeRbO8f4an_WmFysC6TcWs5EvBo",
  authDomain: "community-care-connect.firebaseapp.com",
  databaseURL: "https://community-care-connect-default-rtdb.firebaseio.com",
  projectId: "community-care-connect",
  storageBucket: "community-care-connect.appspot.com",
  messagingSenderId: "106041086091",
  appId: "1:106041086091:web:ad93f0326174ae7bff448e"
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
export const database = getDatabase(app);
export const firestore = getFirestore(app);
