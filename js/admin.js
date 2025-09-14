// FileName: js/admin.js
import { db, auth, doc, getDoc, collection, query, orderBy, onSnapshot, deleteDoc, getDocs, where, writeBatch } from './firebaseConfig.js';
import { showAlert, showConfirm } from './modal.js';

const reportsContainer = document.getElementById('reportsContainer');
const loadingOverlay = document.getElementById('loadingOverlay');
const logoutButton = document.getElementById('logoutButton');

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            await showAlert("Access Denied. You do not have administrative privileges.", "Access Denied");
            auth.signOut();
            window.location.href = '/login.html';
            return;
        }
        loadReports();
    });

    logoutButton.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = '/login.html';
        });
    });
});

function loadReports() {
    showLoadingOverlay();
    const reportsQuery = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    onSnapshot(reportsQuery, (snapshot) => {
        hideLoadingOverlay();
        if (snapshot.empty) {
            reportsContainer.innerHTML = `<p class="no-posts">There are no active reports.</p>`;
            return;
        }
        let reportsHtml = "";
        // Group reports by postId to avoid duplicate cards
        const reportsByPost = {};
        snapshot.docs.forEach(doc => {
            const reportData = doc.data();
            if (!reportsByPost[reportData.postId]) {
                reportsByPost[reportData.postId] = [];
            }
            reportsByPost[reportData.postId].push({id: doc.id, ...reportData});
        });
        
        // Render one card per post
        for (const postId in reportsByPost) {
            const reports = reportsByPost[postId];
            // Use the data from the most recent report for display
            const latestReport = reports[0]; 
            reportsHtml += renderReportCard(postId, latestReport, reports.length);
        }

        reportsContainer.innerHTML = reportsHtml;
        attachActionListeners();
    }, (error) => {
        console.error("Error loading reports:", error);
        hideLoadingOverlay();
        reportsContainer.innerHTML = `<p class="error-message">Could not load reports.</p>`;
    });
}

function renderReportCard(postId, reportData, reportCount) {
    const reportDate = (reportData.createdAt?.toDate() ?? new Date()).toLocaleString();
    return `
        <div class="post-card" id="report-card-${postId}" data-post-id="${postId}">
            <p><strong>Post Title:</strong> ${reportData.postTitle}</p>
            <p><strong>Latest Reason:</strong> ${reportData.reason || 'No reason provided.'}</p>
            <p><small>Latest report by: ${reportData.reportedByName} on ${reportDate}</small></p>
            <p style="color: var(--accent-red); font-weight: 600;">Total Reports: ${reportCount}</p>
            <div class="post-footer">
                <a href="/admin-view-post.html?postId=${postId}" class="action-button">View Post & All Reasons</a>
                <button class="delete-post-btn action-button" style="background-color: var(--accent-red); color: white;">Delete Post Permanently</button>
                <button class="resolve-report-btn action-button" style="margin-left: auto;">Resolve All Reports</button>
            </div>
        </div>
    `;
}

function attachActionListeners() {
    reportsContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const card = target.closest('.post-card');
        if (!card) return;

        const postId = card.dataset.postId;
        
        if (target.classList.contains('delete-post-btn')) {
            if (await showConfirm(`Are you sure you want to PERMANENTLY delete this post? This cannot be undone.`, 'Confirm Deletion', { isDanger: true })) {
                await deletePostAndReports(postId);
                showAlert('The post and all associated reports have been permanently deleted.', 'Post Deleted');
            }
        }
        
        if (target.classList.contains('resolve-report-btn')) {
            if (await showConfirm('Are you sure you want to resolve ALL reports for this post? This will remove them from the list and allow users to report this post again.')) {
                try {
                    const postRef = doc(db, 'posts', postId);
                    const reportsQuery = query(collection(db, 'reports'), where("postId", "==", postId));
                    
                    const reportsSnapshot = await getDocs(reportsQuery);
                    
                    const batch = writeBatch(db);
                    
                    // Queue all report documents for deletion
                    reportsSnapshot.forEach(reportDoc => {
                        batch.delete(reportDoc.ref);
                    });
                    
                    // Queue the post document to be updated (resetting its report status)
                    batch.update(postRef, {
                        reportCount: 0,
                        reportedBy: []
                    });
                    
                    // Commit all operations at once
                    await batch.commit();
                    
                    showAlert('All reports for this post have been resolved. The post can now be reported again by users.', 'Reports Resolved');
                } catch (error) {
                    console.error("Error resolving reports:", error);
                    showAlert('Failed to resolve reports. Please try again.', 'Error');
                }
            }
        }
    });
}


async function deleteSubcollection(postId, subcollectionName) {
    const subcollectionRef = collection(db, 'posts', postId, subcollectionName);
    const snapshot = await getDocs(subcollectionRef);
    const batch = writeBatch(db);
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
}

async function deletePostAndReports(postId) {
    try {
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (postSnap.exists()) {
            const postData = postSnap.data();
            if (postData.mediaPublicId) {
                const user = auth.currentUser;
                const idToken = await user.getIdToken(true);
                const response = await fetch('http://127.0.0.1:5001/delete-media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                    body: JSON.stringify({
                        postId: postId, publicId: postData.mediaPublicId,
                        resourceType: postData.mediaResourceType || 'image'
                    })
                });
                if (!response.ok) console.warn("Cloudinary deletion failed, proceeding with Firestore deletion.");
                else console.log("Cloudinary media deleted successfully.");
            }
        }

        await deleteSubcollection(postId, 'comments');
        await deleteSubcollection(postId, 'pollVotes');
        await deleteDoc(postRef);

        const reportsQuery = query(collection(db, 'reports'), where("postId", "==", postId));
        const reportsSnapshot = await getDocs(reportsQuery);
        const batch = writeBatch(db);
        reportsSnapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

    } catch (error) {
        console.error("Error deleting post and reports:", error);
        showAlert(`Failed to delete the post and its data: ${error.message}`, "Error");
    }
}

function showLoadingOverlay() {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoadingOverlay() {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}