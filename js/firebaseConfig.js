// FileName: js/firebaseConfig.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    updatePassword,
    onAuthStateChanged,
    signOut,
    sendEmailVerification,
    EmailAuthProvider,
    reauthenticateWithCredential,
    setPersistence, // Added for session-only login
    browserSessionPersistence // Added for session-only login
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    setDoc,
    getDoc,
    addDoc,
    serverTimestamp,
    orderBy,
    updateDoc,
    arrayUnion,
    arrayRemove,
    increment,
    limit,
    startAfter,
    onSnapshot,
    deleteDoc,
    runTransaction,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytesResumable,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";

// Your project's actual Firebase configuration from the Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyAfy0CN-1VujdyZxA3Z2P3Q6l2YZINBhHU",
  authDomain: "utarconnect-fyp.firebaseapp.com",
  projectId: "utarconnect-fyp",
  storageBucket: "utarconnect-fyp.firebasestorage.app",
  messagingSenderId: "807320862918",
  appId: "1:807320862918:web:5a34c811544caa3286d7c7",
  measurementId: "G-SHV8HYX3N0"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Export all modules for use in your application
export {
    app, auth, db, storage, functions,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    updatePassword,
    onAuthStateChanged,
    signOut,
    sendEmailVerification,
    EmailAuthProvider,
    reauthenticateWithCredential,
    setPersistence,
    browserSessionPersistence,
    collection,
    query,
    where,
    getDocs,
    doc, setDoc,
    getDoc,
    addDoc,
    serverTimestamp,
    orderBy,
    updateDoc,
    arrayUnion,
    arrayRemove,
    increment,
    limit,
    startAfter,
    onSnapshot,
    deleteDoc,
    runTransaction,
    writeBatch,
    ref,
    uploadBytesResumable,
    getDownloadURL,
    httpsCallable
};