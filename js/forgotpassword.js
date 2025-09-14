// FileName: js/forgotpassword.js
import { auth, sendPasswordResetEmail } from "./firebaseConfig.js";
import { showAlert, showAutoRedirectAlert } from './modal.js';

const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const resetEmailInput = document.getElementById('resetEmail');
const authErrorElement = document.getElementById('authError'); 
const successMessageElement = document.getElementById('successMessage');
const submitButton = forgotPasswordForm.querySelector('.auth-button');

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = resetEmailInput.value.trim();

        if (!email) {
            // Use the new modal for validation errors
            showAlert("Please enter your email address.", "Input Required");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
        submitButton.classList.add('loading');
        
        // Hide old text-based messages
        authErrorElement.classList.remove('visible');
        successMessageElement.classList.remove('visible');

        try {
            await sendPasswordResetEmail(auth, email);

            // 1. Show a success pop-up message.
            showAutoRedirectAlert("A password reset link has been sent to your email. You will be redirected to the login page shortly.", "Link Sent");

            // 2. Disable the form and update the button.
            submitButton.textContent = 'Link Sent';
            resetEmailInput.disabled = true;

            // 3. Wait 4 seconds then redirect.
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 4000);

        } catch (error) {
            console.error("Forgot password error:", error);
            
            // --- THIS IS THE UPDATED ERROR LOGIC ---
            let errorMessage = "An error occurred. Please try again.";
            if (error.code === 'auth/user-not-found') {
                errorMessage = "No account found with this email address.";
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = "Too many requests have been sent. Please try again later.";
            }

            // 1. Show an error pop-up instead of the old text message.
            showAlert(errorMessage, "Error");
            
            // 2. Re-enable the form for another attempt.
            submitButton.disabled = false;
            submitButton.textContent = 'Send Reset Link';
            submitButton.classList.remove('loading');
        }
    });
}