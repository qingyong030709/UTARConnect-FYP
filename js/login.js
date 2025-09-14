// FileName: js/login.js
import { auth, db, signInWithEmailAndPassword, doc, getDoc, setPersistence, browserSessionPersistence, sendEmailVerification } from "./firebaseConfig.js";
import { showAlert, showAutoRedirectAlert } from './modal.js';

const loginForm = document.getElementById('loginForm');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const successMessageElement = document.getElementById('successMessage');
const loginButton = loginForm ? loginForm.querySelector('.auth-button') : null;

function showResendVerificationModal(user) {
    const modalOverlay = document.getElementById('customModalOverlay');
    const modalTitleElem = document.getElementById('customModalTitle');
    const modalBodyElem = document.getElementById('customModalBody');
    const modalConfirmBtn = document.getElementById('customModalConfirmBtn');
    const modalCancelBtn = document.getElementById('customModalCancelBtn');
    const modalInputElem = document.getElementById('customModalInput');

    if (!modalOverlay) return;

    modalTitleElem.textContent = 'Email Verification Required';
    modalBodyElem.innerHTML = 'Your email has not been verified. Please check your inbox.<br>Didn\'t receive an email?';
    
    modalConfirmBtn.textContent = 'Resend Verification Link';
    modalCancelBtn.textContent = 'Cancel';
    modalInputElem.style.display = 'none';
    modalCancelBtn.style.display = 'inline-block';
    modalConfirmBtn.style.display = 'inline-block';
    modalConfirmBtn.classList.remove('danger');
    modalConfirmBtn.classList.add('confirm');
    
    modalOverlay.classList.add('visible');

    const newConfirmBtn = modalConfirmBtn.cloneNode(true);
    modalConfirmBtn.parentNode.replaceChild(newConfirmBtn, modalConfirmBtn);
    const newCancelBtn = modalCancelBtn.cloneNode(true);
    modalCancelBtn.parentNode.replaceChild(newCancelBtn, modalCancelBtn);

    newCancelBtn.onclick = () => {
        modalOverlay.classList.remove('visible');
    };

    newConfirmBtn.onclick = async () => {
        try {
            newConfirmBtn.disabled = true;
            newConfirmBtn.textContent = 'Sending...';
            await sendEmailVerification(user);
            
            modalOverlay.classList.remove('visible');
            
            setTimeout(() => {
                showAlert("A new verification link has been sent to your email. Please check your inbox and spam folder.", "Link Sent");
            }, 300);

        } catch (error) {
            console.error("Error resending verification email:", error);
            modalOverlay.classList.remove('visible');
            if (error.code === 'auth/too-many-requests') {
                showAlert("You have requested too many verification emails. Please wait a few minutes before trying again.", "Too Many Requests");
            } else {
                showAlert("Failed to send a new link. Please try again in a few moments.", "Error");
            }
        } finally {
            newConfirmBtn.disabled = false;
            newConfirmBtn.textContent = 'Resend Verification Link';
        }
    };
}

// Calls the showAlert modal, providing a consistent UX.
function showError(message) {
    showAlert(message, 'Login Error');
}


if (loginForm && loginButton) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginEmailInput.value.trim();
        const password = loginPasswordInput.value.trim();

        successMessageElement.classList.remove('visible');

        loginButton.disabled = true;
        loginButton.textContent = 'Logging In...';
        loginButton.classList.add('loading');

         if (!loginForm.checkValidity()) {
             showError('Please fill out all fields correctly.');
             loginButton.disabled = false;
             loginButton.textContent = 'Login';
             loginButton.classList.remove('loading');
             return;
         }

        try {
            await setPersistence(auth, browserSessionPersistence);

            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            if (!user.emailVerified && user.email !== 'admin01@utar.my') {
                await auth.signOut();
                showResendVerificationModal(user);
                loginButton.disabled = false;
                loginButton.textContent = 'Login';
                loginButton.classList.remove('loading');
                return;
            }

            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                 await auth.signOut();
                 throw new Error("User profile not found. Please contact support.");
            }
            
            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = urlParams.get('redirectUrl');

            if (redirectUrl) {
                showAutoRedirectAlert("Login successful! Taking you to the page you requested.", "Login Successful!");
                setTimeout(() => {
                    window.location.href = decodeURIComponent(redirectUrl);
                }, 1500);
            } else {
                showAutoRedirectAlert("Welcome back! You will be redirected to the homepage shortly.", "Login Successful!");
                setTimeout(() => {
                    window.location.href = "/index.html";
                }, 1500);
            }

        } catch (error) {
            console.error("Login error:", error);
            let errorMessage = 'An unexpected error occurred.';
            if (error.code) {
                 switch (error.code) {
                    case 'auth/user-not-found':
                    case 'auth/invalid-credential':
                         errorMessage = 'Incorrect email or password.';
                         break;
                    case 'auth/invalid-email':
                         errorMessage = 'Please enter a valid email address.';
                         break;
                    case 'auth/too-many-requests':
                         errorMessage = 'Too many failed login attempts. Please try again later.';
                         break;
                    default:
                          errorMessage = "An unexpected error occurred. Please try again.";
                 }
            }
            // The showError call here will now use the new, simplified function
            showError(errorMessage);
            
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
            loginButton.classList.remove('loading');
        }
    });
}