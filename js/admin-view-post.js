// FileName: js/admin-view-post.js
import { db, doc, onSnapshot, auth, getDoc, collection, query, orderBy, where, getDocs } from './firebaseConfig.js';
import { showAlert } from './modal.js'; // <-- ADDED IMPORT

let postId = null;
const postViewContainer = document.getElementById('postViewContainer');
const loadingOverlay = document.getElementById("loadingOverlay");
const commentsContainer = document.getElementById('commentsContainer');
const reportReasonsContainer = document.getElementById('reportReasonsContainer');
const logoutButton = document.getElementById('logoutButton');

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
            // <-- REPLACED alert() with showAlert()
            await showAlert("Access Denied. You do not have administrative privileges.", "Access Denied");
            window.location.href = '/login.html';
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        postId = urlParams.get('postId');
        if (postId) {
            listenForPostUpdates();
            listenForComments();
            fetchReportReasons();
        } else {
            postViewContainer.innerHTML = "<p class='error-message'>Post ID not found.</p>";
            hideLoadingOverlay();
        }
    });
    logoutButton.addEventListener('click', () => {
        auth.signOut().then(() => window.location.href = '/login.html');
    });
});

function getOptimizedCloudinaryUrl(url) {
    if (!url || !url.includes('/upload/')) {
        return url;
    }
    return url.replace('/upload/', '/upload/q_auto,f_auto,w_800/');
}


function listenForPostUpdates() {
    showLoadingOverlay('Loading post...');
    onSnapshot(doc(db, "posts", postId), (docSnap) => {
        hideLoadingOverlay();
        if (!docSnap.exists()) {
            postViewContainer.innerHTML = "<p class='no-posts'>Post not found or has been deleted.</p>";
            commentsContainer.innerHTML = '';
            return;
        }
        renderPost(docSnap.data());
        if (docSnap.data().poll) {
            renderPoll(docSnap.data().poll);
        }
    });
}

function renderPost(post) {
    const formattedDate = (post.createdAt?.toDate() ?? new Date()).toLocaleString();
    const pollHtml = post.poll ? `<div class="poll-container" id="pollContainer"></div>` : '';
    const mediaHtml = post.mediaUrl ? `
        <div class="post-view-media-container">
            ${post.mediaUrl.match(/\.(mp4|webm|mov|ogg)$/i)
                ? `<video class="post-view-media" src="${post.mediaUrl}" controls></video>`
                : `<img class="post-view-media" src="${getOptimizedCloudinaryUrl(post.mediaUrl)}" alt="Post media">`
            }
        </div>
    ` : '';
    postViewContainer.innerHTML = `
        <h2>${post.title}</h2>
        <div class="post-view-meta">
            <div><strong>By:</strong> ${post.authorName || 'User'}</div>
            <div><strong>On:</strong> ${formattedDate}</div>
        </div>
        <div class="post-view-content"><p>${post.content.replace(/\n/g, '<br>')}</p></div>
        ${mediaHtml}
        ${pollHtml}
        <div class="post-view-footer">
            <p>👍 Likes: <span class="like-count">${post.likes || 0}</span></p>
            <p>💬 Comments: <span class="comment-count">${post.commentCount || 0}</span></p>
            <p style="margin-left: auto; color: var(--accent-red);">❗ Reports: ${post.reportCount || 0}</p>
        </div>`;
}

function renderPoll(poll) {
    const pollContainer = document.getElementById('pollContainer');
    if (!pollContainer) return;
    const totalVotes = poll.totalVotes || 0;
    const optionsHtml = poll.options.map((option) => {
        const percentage = totalVotes > 0 ? ((option.votes / totalVotes) * 100).toFixed(0) : 0;
        return `
            <div class="poll-result-bar" style="margin-bottom: 0.8rem;">
                <div class="poll-result-fill" style="width: ${percentage}%;"></div>
                <span class="poll-result-text">${option.text} <strong>(${option.votes})</strong></span>
                <span class="poll-result-percent">${percentage}%</span>
            </div>`;
    }).join('');
    pollContainer.innerHTML = `
        <div class="poll-header">
            <div class="poll-question">${poll.question}</div>
            <div class="poll-total-votes">Total Votes: ${totalVotes}</div>
        </div>
        <div>${optionsHtml}</div>`;
}

function listenForComments() {
    const commentsRef = collection(db, "posts", postId, "comments");
    const q = query(commentsRef, orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        commentsContainer.innerHTML = '';
        if (snapshot.empty) {
            commentsContainer.innerHTML = "<p>No comments on this post.</p>";
        } else {
            snapshot.docs.forEach(doc => renderComment(doc.data()));
        }
    });
}

function renderComment(comment) {
    const commentDate = (comment.createdAt?.toDate() ?? new Date()).toLocaleString();
    const commentCard = document.createElement('div');
    commentCard.className = 'comment-card';
    commentCard.innerHTML = `
        <div class="comment-header">
            <strong class="comment-author">${comment.authorName || 'User'}</strong>
            <span class="comment-date">${commentDate}</span>
        </div>
        <p class="comment-content">${comment.content.replace(/\n/g, '<br>')}</p>`;
    commentsContainer.appendChild(commentCard);
}

async function fetchReportReasons() {
    if (!postId) return;
    const reportsRef = collection(db, "reports");
    const q = query(reportsRef, where("postId", "==", postId), orderBy("createdAt", "desc"));
    try {
        const snapshot = await getDocs(q);
        reportReasonsContainer.innerHTML = '';
        if (snapshot.empty) {
            reportReasonsContainer.innerHTML = "<p>No report reasons found for this post.</p>";
        } else {
            snapshot.docs.forEach(doc => renderReportReason(doc.data()));
        }
    } catch (error) {
        console.error("Error fetching report reasons:", error);
        reportReasonsContainer.innerHTML = "<p class='error-message'>Could not load report reasons.</p>";
    }
}

function renderReportReason(report) {
    const reportDate = (report.createdAt?.toDate() ?? new Date()).toLocaleString();
    const reasonCard = document.createElement('div');
    reasonCard.className = 'report-reason-card';
    reasonCard.innerHTML = `
        <div class="report-reason-header">
            <strong class="report-author">Reported by: ${report.reportedByName || 'User'}</strong>
            <span class="report-date">${reportDate}</span>
        </div>
        <p class="report-reason-content"><strong>Reason:</strong> ${report.reason.replace(/\n/g, '<br>')}</p>
    `;
    reportReasonsContainer.appendChild(reasonCard);
}

function showLoadingOverlay(message) {
    if (loadingOverlay) {
        loadingOverlay.querySelector('.loading-text').textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoadingOverlay() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}