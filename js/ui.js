// FileName: js/ui.js
import { auth, db, collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDocs, getDoc, deleteDoc, writeBatch, onAuthStateChanged } from './firebaseConfig.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Get All Elements First ---
    const profileMenuButton = document.getElementById('profileMenuButton');
    const profileMenu = document.getElementById('profileMenu');
    const notificationButton = document.getElementById('notificationButton');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const logoutButton = document.getElementById('logoutButton');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const darkModeCheckbox = document.getElementById('darkModeCheckbox');

    // --- 1. SETUP UI THAT DOES NOT DEPEND ON THE USER ---
    
    // Function to set up a dropdown's click listener
    function setupDropdown(button, dropdown) {
        if (!button || !dropdown) return;
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns if open
            if (dropdown.id === 'profileMenu' && notificationDropdown?.classList.contains('active')) {
                notificationDropdown.classList.remove('active');
            } else if (dropdown.id === 'notificationDropdown' && profileMenu?.classList.contains('active')) {
                profileMenu.classList.remove('active');
            }
            dropdown.classList.toggle('active');
        });
    }

    // Make the dropdown buttons clickable as soon as the page loads
    setupDropdown(profileMenuButton, profileMenu);
    setupDropdown(notificationButton, notificationDropdown);

    // Add a global click listener to close dropdowns when clicking away
    document.addEventListener('click', () => {
        profileMenu?.classList.remove('active');
        notificationDropdown?.classList.remove('active');
    });
    
    // Stop dropdowns from closing when clicking inside them
    notificationDropdown?.addEventListener('click', (e) => e.stopPropagation());
    profileMenu?.addEventListener('click', (e) => e.stopPropagation());
    
    // Logout button functionality
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await auth.signOut();
                window.location.href = "/login.html";
            } catch (error) {
                console.error("Error logging out:", error);
            }
        });
    }

    // Dark mode toggle functionality
    if (darkModeToggle && darkModeCheckbox) {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            darkModeCheckbox.checked = true;
        }
        darkModeCheckbox.addEventListener('change', () => {
            if (darkModeCheckbox.checked) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
            }
        });
    }
    
    // Password toggle functionality for auth pages
    document.querySelectorAll('.toggle-password').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const passwordInput = toggle.previousElementSibling;
            if (passwordInput && (passwordInput.type === 'password' || passwordInput.type === 'text')) {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
            }
        });
    });

    // --- 2. SETUP UI THAT DEPENDS ON THE USER'S LOGIN STATE ---
    
    let unsubscribeNotifications = null;
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Reverted to the simpler logic. The security rules now handle permissions correctly.
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                displayUserProfileInfo(userData);
                if (userData.role === 'admin') {
                    addAdminLink();
                }
            }
            if (unsubscribeNotifications) unsubscribeNotifications();
            listenForNotifications(user.uid);
        } else {
            // User is signed out
            if (unsubscribeNotifications) unsubscribeNotifications();
            removeUserProfileInfo();
        }
    });

    function displayUserProfileInfo(userData) {
        const profileMenu = document.getElementById('profileMenu');
        if (profileMenu && !document.getElementById('profileUserDisplay')) {
            const userInfoDiv = document.createElement('div');
            userInfoDiv.id = 'profileUserDisplay';
            userInfoDiv.className = 'profile-dropdown-user';
            userInfoDiv.textContent = userData.name || 'User'; 
            profileMenu.insertBefore(userInfoDiv, profileMenu.firstChild);
        }
    }

    function removeUserProfileInfo() {
        const userInfoDiv = document.getElementById('profileUserDisplay');
        if (userInfoDiv) userInfoDiv.remove();
    }

    function addAdminLink() {
        const profileMenu = document.getElementById('profileMenu');
        if (profileMenu && !document.getElementById('adminLink')) {
            const adminLink = document.createElement('a');
            adminLink.href = '/admin.html';
            adminLink.id = 'adminLink';
            adminLink.innerHTML = '⚙️ Admin Panel';
            profileMenu.insertBefore(adminLink, profileMenu.firstChild);
        }
    }

    function listenForNotifications(userId) {
        const notificationsRef = collection(db, 'notifications');
        const q = query(notificationsRef, where('recipientId', '==', userId), orderBy('createdAt', 'desc'));
        unsubscribeNotifications = onSnapshot(q, (snapshot) => {
            const notificationList = document.getElementById('notificationList');
            const notificationBadge = document.getElementById('notificationBadge');
            if (!notificationList || !notificationBadge) return;
            notificationList.innerHTML = '';
            let unreadCount = 0;
            if (snapshot.empty) {
                notificationList.innerHTML = '<div class="notification-item">No new notifications.</div>';
            } else {
                snapshot.forEach(doc => {
                    const notification = doc.data();
                    if (!notification.read) unreadCount++;
                    displayNotification(doc.id, notification);
});
            }
            notificationList.removeEventListener('click', handleNotificationClick);
            notificationList.addEventListener('click', handleNotificationClick);
            if (unreadCount > 0) {
                notificationBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                notificationBadge.classList.add('visible');
            } else {
                notificationBadge.classList.remove('visible');
            }
        });
        notificationButton?.addEventListener('click', () => {
            if (notificationDropdown?.classList.contains('active')) {
                markAllNotificationsAsRead(userId);
            }
        });
    }

    function displayNotification(notificationId, notification) {
        const notificationList = document.getElementById('notificationList');
        const item = document.createElement('div');
        item.classList.add('notification-item');
        if (!notification.read) item.classList.add('unread');
        let message = '';
        switch (notification.type) {
            case 'like':
                message = `<strong>${notification.actorName}</strong> liked your post: <em>"${notification.postTitle}"</em>`;
                break;
            case 'comment':
                message = `<strong>${notification.actorName}</strong> commented on your post: <em>"${notification.postTitle}"</em>`;
                break;
            case 'reply':
                message = `<strong>${notification.actorName}</strong> replied to your comment on: <em>"${notification.postTitle}"</em>`;
                break;
            default: message = 'You have a new notification.';
        }
        item.innerHTML = `
            <a href="/view-post.html?postId=${notification.postId}">${message}</a>
            <button class="notification-close-btn" data-id="${notificationId}" title="Dismiss">&times;</button>
        `;
        notificationList.appendChild(item);
    }

    async function handleNotificationClick(event) {
        if (event.target.classList.contains('notification-close-btn')) {
            event.preventDefault();
            const notificationId = event.target.dataset.id;
            try {
                await deleteDoc(doc(db, 'notifications', notificationId));
            } catch (error) {
                console.error("Error dismissing notification:", error);
            }
        }
    }

    async function markAllNotificationsAsRead(userId) {
        const notificationsRef = collection(db, 'notifications');
        const q = query(notificationsRef, where('recipientId', '==', userId), where('read', '==', false));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach(docSnap => {
            batch.update(doc(db, 'notifications', docSnap.id), { read: true });
        });
        await batch.commit();
    }
});