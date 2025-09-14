// FileName: js/signup.js
import {
    auth,
    db,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    doc,
    setDoc
} from "./firebaseConfig.js";
import { showAlert } from './modal.js'; 

const signupForm = document.getElementById('signupForm');
const nameInput = document.getElementById('name');
const signupEmailInput = document.getElementById('signupEmail');
const studentIdContainer = document.getElementById('studentIdContainer');
const studentIdInput = document.getElementById('studentId');
const signupPasswordInput = document.getElementById('signupPassword');
const signupConfirmPasswordInput = document.getElementById('signupConfirmPassword');
const authErrorElement = document.getElementById('authError');
const successMessageElement = document.getElementById('successMessage');
const genderInputs = signupForm ? signupForm.elements.gender : null;
const signupButton = signupForm ? signupForm.querySelector('.auth-button') : null;

function validateForm() {
    if (!signupForm || !signupButton) return;

    const name = nameInput.value.trim();
    const email = signupEmailInput.value.trim();
    const isStudent = email.endsWith('@1utar.my');
    const studentId = studentIdInput.value.trim();
    const password = signupPasswordInput.value;
    const confirmPassword = signupConfirmPasswordInput.value;
    const gender = genderInputs ? genderInputs.value : '';

    const isNameValid = name.length > 0;
    const isEmailValid = /.+@(1utar\.my|utar\.edu\.my)$/.test(email);
    const isStudentIdValid = !isStudent || (studentId.length === 7 && /^\d{7}$/.test(studentId));
    const isGenderValid = !!gender;
    const isPasswordValid = password.length >= 6;
    const doPasswordsMatch = password === confirmPassword && password !== '';

    if (isNameValid && isEmailValid && isStudentIdValid && isGenderValid && isPasswordValid && doPasswordsMatch) {
        signupButton.disabled = false;
    } else {
        signupButton.disabled = true;
    }
}

if (signupEmailInput) {
    signupEmailInput.addEventListener('input', () => {
        const email = signupEmailInput.value.trim().toLowerCase();
        if (email.endsWith('@1utar.my')) {
            studentIdContainer.style.display = 'block';
            studentIdInput.required = true;
        } else {
            studentIdContainer.style.display = 'none';
            studentIdInput.required = false;
        }
        validateForm();
    });
}

if (signupForm) {
    [nameInput, signupEmailInput, studentIdInput, signupPasswordInput, signupConfirmPasswordInput].forEach(input => {
        if (input) input.addEventListener('input', validateForm);
    });
    if (genderInputs) {
        Array.from(genderInputs).forEach(radio => radio.addEventListener('change', validateForm));
    }
}

if (signupForm && signupButton) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (signupPasswordInput.value !== signupConfirmPasswordInput.value) {
            // showAlert for validation error
            showAlert('Passwords do not match. Please check and try again.', 'Validation Error');
            return;
        }

        const name = nameInput.value.trim();
        const email = signupEmailInput.value.trim();
        const studentId = studentIdInput.value.trim();
        const password = signupPasswordInput.value.trim();
        const gender = genderInputs.value;

        let role = '';
        if (email.endsWith('@1utar.my')) {
            role = 'student';
        } else if (email.endsWith('@utar.edu.my')) {
            role = 'staff';
        }

        let anonymousName = '';
        if (role === 'student') {
            const genderIcon = gender === 'Male' ? '👨‍🎓' : '👩‍🎓';
            const lastThreeDigits = studentId.slice(-3);
            anonymousName = `${genderIcon} Student ${lastThreeDigits}`;
        } else if (role === 'staff') {
            const genderIcon = gender === 'Male' ? '👨‍🏫' : '👩‍🏫';
            anonymousName = `${genderIcon} Staff`;
        }

        authErrorElement.classList.remove('visible');
        successMessageElement.classList.remove('visible');
        signupButton.disabled = true;
        signupButton.textContent = 'Signing Up...';
        signupButton.classList.add('loading');

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await sendEmailVerification(user);

            const userData = {
                name: name,
                email: email,
                gender: gender,
                createdAt: new Date(),
                role: role,
                anonymousName: anonymousName
            };

            if (role === 'student') {
                userData.studentId = studentId;
            }

            await setDoc(doc(db, "users", user.uid), userData);

            // showAlert for success message
            showAlert("Sign-up successful! A verification link has been sent to your email. Please verify your account before logging in.", "Account Created");
            
            signupForm.reset();
            signupButton.textContent = 'Sign Up';
            signupButton.classList.remove('loading');

        } catch (error) {
            console.error("Signup error:", error);
            let errorMessage = 'An unexpected error occurred during sign-up.';
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'This email address is already registered.';
            }

            // showAlert for Firebase errors
            showAlert(errorMessage, 'Sign-up Failed');
            
            signupButton.disabled = false;
            signupButton.textContent = 'Sign Up';
            signupButton.classList.remove('loading');
            validateForm();
        }
    });
}