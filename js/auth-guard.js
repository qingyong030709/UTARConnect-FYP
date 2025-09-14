// FileName: js/auth-guard.js
import { auth, onAuthStateChanged } from './firebaseConfig.js';

const PUBLIC_PAGES = ['/login.html', '/signup.html', '/forgotpassword.html'];

onAuthStateChanged(auth, (user) => {
    const isUserLoggedIn = !!user;
    const currentPath = window.location.pathname;
    const isPublicPage = PUBLIC_PAGES.includes(currentPath);

    if (!isUserLoggedIn && !isPublicPage) {
        // Add the original URL as a parameter.
        const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
        console.log(`Auth Guard: User not logged in. Redirecting to login and saving original URL: ${decodeURIComponent(redirectUrl)}`);
        
        window.location.href = `/login.html?redirectUrl=${redirectUrl}`;
    }
});