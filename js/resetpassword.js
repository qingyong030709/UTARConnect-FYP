// FileName: js/resetpassword.js

import {
    auth,
    onAuthStateChanged,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    signOut
} from "./firebaseConfig.js";
import { showAlert } from './modal.js';

const resetPasswordForm = document.getElementById('resetPasswordForm');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const authErrorElement = document.getElementById('authError');
const successMessageElement = document.getElementById('successMessage');
const submitButton = resetPasswordForm.querySelector('.auth-button');

onAuthStateChanged(auth, (user) => {
    if (!user) {
        console.log("No user logged in. Redirecting to login.");
        window.location.href = '/login.html';
    }
});

if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentUser = auth.currentUser;
        if (!currentUser) {
            showAlert("You are not logged in. Please log in to reset your password.", "Authentication Error");
            return;
        }

        const currentPassword = currentPasswordInput.value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!currentPassword || !newPassword || !confirmPassword) {
            showAlert("Please fill in all fields.", "Validation Error");
            return;
        }
        if (newPassword.length < 6) {
            showAlert("Your new password must be at least 6 characters long.", "Validation Error");
            return;
        }
        if (newPassword !== confirmPassword) {
            showAlert("New passwords do not match.", "Validation Error");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Updating...';
        submitButton.classList.add('loading');
        
        // Hide old text elements just in case
        authErrorElement.classList.remove('visible');
        successMessageElement.classList.remove('visible');

        try {
            const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, newPassword);
            
            // informative success message 
            await showAlert("Your password has been changed. For your security, you will now be logged out.", "Password Updated Successfully");
            
            currentPasswordInput.disabled = true;
            newPasswordInput.disabled = true;
            confirmPasswordInput.disabled = true;
            submitButton.textContent = 'Success!';

            await signOut(auth);
            window.location.href = '/login.html';

        } catch (error) {
            console.error("Password reset error:", error);
            let errorMessage = "An unexpected error occurred. Please try again.";
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                errorMessage = "The current password you entered is incorrect.";
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = "Too many attempts. Please try again later.";
            }

            showAlert(errorMessage, "Update Failed");
            
            submitButton.disabled = false;
            submitButton.textContent = 'Update Password';
            submitButton.classList.remove('loading');
        } 
    });
}