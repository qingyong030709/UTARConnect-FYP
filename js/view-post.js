// FileName: js/view-post.js
import { db, doc, onSnapshot, auth, updateDoc, arrayUnion, arrayRemove, increment, collection, addDoc, serverTimestamp, query, orderBy, getDoc, runTransaction, deleteDoc, writeBatch, where, getDocs } from './firebaseConfig.js';
import { showAlert, showConfirm, showPrompt } from './modal.js';

function sanitizeHTML(text) {
    const temp = document.createElement('div');
    temp.textContent = text;
    return temp.innerHTML;
}

function getOptimizedCloudinaryUrl(url) {
    if (!url || !url.includes('/upload/')) {
        return url; // Return original if not a valid Cloudinary URL
    }
    return url.replace('/upload/', '/upload/q_auto,f_auto,w_800/');
}

const ML_API_URL = 'https://utarconnect-backend-xxxxxxxxxx-as.a.run.app';

let currentUser = null;
let postId = null;
let unsubscribePost = null;
let unsubscribeComments = null;
let unsubscribeVote = null;
let mainCommentMediaFile = null;
let replyMediaFile = null;

const postViewContainer = document.getElementById('postViewContainer');
const loadingOverlay = document.getElementById("loadingOverlay");
const commentForm = document.getElementById('commentForm');
const commentContentInput = document.getElementById('commentContent');
const commentsContainer = document.getElementById('commentsContainer');
const editCommentModal = document.getElementById('editCommentModal');
const editCommentIdInput = document.getElementById('editCommentId');
const editCommentContentInput = document.getElementById('editCommentContent');
const saveCommentButton = document.getElementById('saveCommentButton');
const closeModalButton = editCommentModal.querySelector('.close-lightbox');

// --- HELPER FUNCTIONS ---

async function checkContentToxicity(text) {
    if (!text.trim()) return { is_toxic: false };
    try {
        const response = await fetch(`${ML_API_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text }),
        });
        if (!response.ok) {
            console.error("ML API (text) returned an error:", response.status);
            return { is_toxic: false };
        }
        return await response.json();
    } catch (error) {
        console.error("Could not connect to the ML API for text analysis.", error);
        return { is_toxic: false };
    }
}

async function checkImageNsfw(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64String = reader.result.split(',')[1];
            try {
                const response = await fetch(`${ML_API_URL}/predict_nsfw`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64String }),
                });
                if (!response.ok) {
                    console.error("ML API (image) returned an error:", response.status);
                    resolve({ is_nsfw: false });
                } else {
                    const result = await response.json();
                    resolve(result);
                }
            } catch (error) {
                console.error("Could not connect to the ML API for image analysis.", error);
                resolve({ is_nsfw: false });
            }
        };
        reader.onerror = error => {
            console.error("FileReader error:", error);
            reject(error);
        };
    });
}

async function uploadToCloudinary(file) {
    const CLOUD_NAME = "dq1ss3ka5";
    const UPLOAD_PRESET = "utar_connect_unsigned";
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'utar-connect-media/comments');
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Cloudinary upload failed: ${errorData.error.message}`);
    }
    return await response.json();
}

// --- CORE LOGIC ---

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

async function createNotification(recipientId, type, postData) {
    const actorId = currentUser.uid;
    if (recipientId === actorId) return;
    try {
        const actorDoc = await getDoc(doc(db, 'users', actorId));
        const actorName = actorDoc.exists() ? actorDoc.data().anonymousName : 'Anonymous User';
        await addDoc(collection(db, 'notifications'), {
            recipientId, actorId, actorName, type, postId,
            postTitle: postData.title.substring(0, 50),
            read: false, createdAt: serverTimestamp(),
        });
    } catch(error) {
        console.error("Error creating notification:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async (user) => {
        if (!user) { return; }
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
            window.location.href = '/admin.html';
            return;
        }
        currentUser = user;
        const urlParams = new URLSearchParams(window.location.search);
        postId = urlParams.get('postId');
        if (postId) {
            listenForPostUpdates();
            listenForComments();
            setupCommentFormListener();
        } else {
            postViewContainer.innerHTML = "<p class='error-message'>Post ID not found.</p>";
            hideLoadingOverlay();
        }
    });
    closeModalButton.addEventListener('click', () => editCommentModal.style.display = 'none');
    saveCommentButton.addEventListener('click', handleUpdateComment);
});

function listenForPostUpdates() {
    if (unsubscribePost) unsubscribePost();
    showLoadingOverlay('Loading post...');
    unsubscribePost = onSnapshot(doc(db, "posts", postId), (docSnap) => {
        hideLoadingOverlay();
        if (!docSnap.exists()) {
            postViewContainer.innerHTML = "<p class='no-posts'>Post not found or has been deleted.</p>";
            if(unsubscribeComments) unsubscribeComments();
            if(unsubscribeVote) unsubscribeVote();
            return;
        }
        renderPost(docSnap.data());
        if (docSnap.data().poll) {
            listenForUserVote(docSnap.data().poll);
        }
    }, (error) => {
        console.error("Error listening to post:", error);
        hideLoadingOverlay();
        postViewContainer.innerHTML = "<p class='error-message'>Could not load post.</p>";
    });
}

function renderPost(post) {
    const formattedDate = (post.createdAt?.toDate() ?? new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const isLiked = currentUser && (post.likedBy || []).includes(currentUser.uid);
    const likeButtonClass = `like-button ${isLiked ? 'liked' : ''}`;
    const likeButtonText = isLiked ? 'Unlike' : 'Like';
    const hasReported = currentUser && (post.reportedBy || []).includes(currentUser.uid);
    const reportButtonClass = `report-button ${hasReported ? 'reported' : ''}`;
    const reportButtonTitle = hasReported ? "You have already reported this" : "Report this post";
    const pollHtml = post.poll ? `<div class="poll-container" id="pollContainer"></div>` : '';
    const mediaHtml = post.mediaUrl && typeof post.mediaUrl === 'string' ? `
        <div class="post-view-media-container">
            ${post.mediaUrl.match(/\.(mp4|webm|mov|ogg)$/i)
                ? `<video class="post-view-media" src="${post.mediaUrl}" controls onclick="window.openMediaInLightbox('${post.mediaUrl}', 'video')"></video>`
                : `<img class="post-media" src="${getOptimizedCloudinaryUrl(post.mediaUrl)}" alt="Post media" loading="lazy" onclick="window.openMediaInLightbox('${post.mediaUrl}', 'image')">`
            }
        </div>
    ` : '';
    postViewContainer.innerHTML = `
        <h2>${post.title}</h2>
        <div class="post-view-meta">
            <div><strong>By:</strong> ${post.anonymousName || 'User'}</div>
            <div><strong>On:</strong> ${formattedDate}</div>
        </div>
        <div class="post-view-content"><p>${sanitizeHTML(post.content).replace(/\n/g, '<br>')}</p></div>
        ${mediaHtml} 
        ${pollHtml}
        <div class="post-view-footer">
            <p>👍 <span class="like-count">${post.likes || 0}</span></p>
            <p>💬 <span class="comment-count">${post.commentCount || 0}</span></p>
            <button class="${likeButtonClass}" id="likeButton">${likeButtonText}</button>
            <button class="${reportButtonClass}" id="reportButton" title="${reportButtonTitle}" ${hasReported ? 'disabled' : ''}>❗</button>
        </div>`;
    document.getElementById('likeButton').addEventListener('click', () => handleLikeClick(post));
    document.getElementById('reportButton').addEventListener('click', () => handleReportClick(post));
}

function listenForUserVote(pollData) {
    if (unsubscribeVote) unsubscribeVote();
    const voteRef = doc(db, `posts/${postId}/pollVotes`, currentUser.uid);
    unsubscribeVote = onSnapshot(voteRef, (voteSnap) => {
        const userVoteIndex = voteSnap.exists() ? voteSnap.data().optionIndex : null;
        renderPoll(pollData, userVoteIndex);
    });
}

function renderPoll(poll, userVoteIndex) {
    const pollContainer = document.getElementById('pollContainer');
    if (!pollContainer) return;
    const totalVotes = poll.totalVotes || 0;
    const optionsHtml = poll.options.map((option, index) => {
        const isVotedFor = index === userVoteIndex;
        return `
            <div class="poll-option">
                <button class="vote-btn ${isVotedFor ? 'voted-for' : ''}" data-option-index="${index}">
                    ${option.text} (${option.votes})
                </button>
            </div>`;
    }).join('');
    pollContainer.innerHTML = `
        <div class="poll-header">
            <div class="poll-question">${poll.question}</div>
            <div class="poll-total-votes">Total Votes: ${totalVotes}</div>
        </div>
        <div id="pollOptions">${optionsHtml}</div>`;
    document.querySelectorAll('.vote-btn').forEach(button => {
        button.addEventListener('click', () => handleVote(parseInt(button.dataset.optionIndex)));
    });
}

async function handleVote(clickedOptionIndex) {
    const postRef = doc(db, 'posts', postId);
    const voteRef = doc(db, `posts/${postId}/pollVotes`, currentUser.uid);
    try {
        await runTransaction(db, async (transaction) => {
            const postDoc = await transaction.get(postRef);
            if (!postDoc.exists()) throw new Error("Post does not exist.");
            const voteDoc = await transaction.get(voteRef);
            const postData = postDoc.data();
            const pollData = postData.poll;
            const newOptions = pollData.options;
            let newTotalVotes = pollData.totalVotes || 0;
            if (voteDoc.exists()) {
                const previousOptionIndex = voteDoc.data().optionIndex;
                if (previousOptionIndex === clickedOptionIndex) {
                    if (newOptions[previousOptionIndex].votes > 0) {
                        newOptions[previousOptionIndex].votes -= 1;
                        newTotalVotes -= 1;
                    }
                    transaction.delete(voteRef);
                } else {
                    if (newOptions[previousOptionIndex].votes > 0) newOptions[previousOptionIndex].votes -= 1;
                    newOptions[clickedOptionIndex].votes += 1;
                    transaction.update(voteRef, { optionIndex: clickedOptionIndex });
                }
            } else {
                newOptions[clickedOptionIndex].votes += 1;
                newTotalVotes += 1;
                transaction.set(voteRef, { optionIndex: clickedOptionIndex });
            }
            transaction.update(postRef, { 'poll.options': newOptions, 'poll.totalVotes': newTotalVotes });
        });
    } catch (error) {
        console.error("Error handling vote:", error);
        showAlert("There was an error processing your vote. Please try again.", "Vote Error");
    }
}

async function handleLikeClick(postData) {
    const button = document.getElementById('likeButton');
    if (!currentUser || button.disabled) return;
    button.disabled = true;
    const postRef = doc(db, "posts", postId);
    const isCurrentlyLiked = (postData.likedBy || []).includes(currentUser.uid);
    try {
        await updateDoc(postRef, {
            likedBy: isCurrentlyLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
            likes: increment(isCurrentlyLiked ? -1 : 1),
            trendingScore: increment(isCurrentlyLiked ? -1 : 1)
        });
        if (!isCurrentlyLiked) createNotification(postData.authorId, 'like', postData);
    } catch(e) {
        console.error("Error liking post:", e);
    } finally {
        button.disabled = false;
    }
}

async function handleReportClick(postData) {
    const reportButton = document.getElementById('reportButton');
    if (reportButton.disabled) return;
    const reason = await showPrompt("Please provide a brief reason for reporting this post (e.g., spam, harassment).", "Report Post");
    if (reason === null) return;
    if (reason.trim() === "") {
        showAlert("A reason is required to submit a report.", "Report Error");
        return;
    }
    reportButton.disabled = true;
    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const reporterName = userDoc.exists() ? userDoc.data().name : currentUser.email;
        await addDoc(collection(db, 'reports'), {
            postId: postId, postTitle: postData.title, reason: reason.trim(),
            reportedByUid: currentUser.uid, reportedByName: reporterName,
            createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'posts', postId), {
            reportCount: increment(1),
            reportedBy: arrayUnion(currentUser.uid)
        });
        showAlert("Thank you. Your report has been submitted for review.", "Report Submitted");
    } catch (error) {
        console.error("Error submitting report:", error);
        showAlert("Failed to submit report. Please try again.", "Error");
    } finally {
        const postSnap = await getDoc(doc(db, "posts", postId));
        if (postSnap.exists() && !(postSnap.data().reportedBy || []).includes(currentUser.uid)) {
            reportButton.disabled = false;
        }
    }
}

function listenForComments() {
    if (unsubscribeComments) unsubscribeComments();
    const commentsRef = collection(db, "posts", postId, "comments");
    const q = query(commentsRef, orderBy("createdAt", "asc"));
    unsubscribeComments = onSnapshot(q, (snapshot) => {
        const allComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const commentTree = buildCommentTree(allComments);
        renderCommentsContainer(commentTree);
    });
}

function buildCommentTree(comments) {
    const commentMap = {};
    const tree = [];
    comments.forEach(comment => {
        commentMap[comment.id] = { ...comment, replies: [] };
    });
    for (const commentId in commentMap) {
        const comment = commentMap[commentId];
        if (comment.parentId && commentMap[comment.parentId]) {
            commentMap[comment.parentId].replies.push(comment);
        } else {
            tree.push(comment);
        }
    }
    return tree;
}

function renderCommentsContainer(commentTree) {
    commentsContainer.innerHTML = '';
    if (commentTree.length === 0) {
        commentsContainer.innerHTML = "<p>No comments yet. Be the first to comment!</p>";
        return;
    }
    commentTree.forEach(comment => {
        const commentElement = createCommentElement(comment);
        commentsContainer.appendChild(commentElement);
    });
}

function createCommentElement(comment) {
    const commentCard = document.createElement('div');
    commentCard.className = 'comment-card';
    commentCard.id = `comment-${comment.id}`;
    const commentDate = (comment.createdAt?.toDate() ?? new Date()).toLocaleString('en-US', { hour12: true, month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    let mediaHtml = '';
    if (comment.mediaUrl) {
        mediaHtml = `
            <div class="comment-media-display">
                ${comment.mediaUrl.match(/\.(mp4|webm|mov|ogg)$/i)
                    ? `<video src="${comment.mediaUrl}" muted loop playsinline onclick="window.openMediaInLightbox('${comment.mediaUrl}', 'video')"></video>`
                    : `<img src="${getOptimizedCloudinaryUrl(comment.mediaUrl)}" alt="Comment media" loading="lazy" onclick="window.openMediaInLightbox('${comment.mediaUrl}', 'image')">`
                }
            </div>
        `;
    }

    let actionButtons = `<button class="action-button reply-btn" data-comment-id="${comment.id}">Reply</button>`;
    if (currentUser && currentUser.uid === comment.authorId) {
        actionButtons += `
            <button class="action-button edit-btn" data-comment-id="${comment.id}" data-content="${encodeURIComponent(comment.content)}">Edit</button>
            <button class="action-button delete-btn" data-comment-id="${comment.id}">Delete</button>`;
    }

    commentCard.innerHTML = `
        <div class="comment-header">
            <strong class="comment-author">${comment.anonymousName || 'User'}</strong>
            <span class="comment-date">${commentDate}</span>
        </div>
        <p class="comment-content">${sanitizeHTML(comment.content).replace(/\n/g, '<br>')}</p>
        ${mediaHtml}
        <div class="comment-actions">${actionButtons}</div>`;

    if (comment.replies && comment.replies.length > 0) {
        const repliesContainer = document.createElement('div');
        repliesContainer.className = 'replies-container';
        comment.replies.forEach(reply => {
            repliesContainer.appendChild(createCommentElement(reply));
        });
        commentCard.appendChild(repliesContainer);
    }
    attachCommentActionListeners(commentCard);
    return commentCard;
}

function attachCommentActionListeners(element) {
    const replyBtn = element.querySelector('.reply-btn');
    const editBtn = element.querySelector('.edit-btn');
    const deleteBtn = element.querySelector('.delete-btn');
    if (replyBtn) replyBtn.addEventListener('click', (e) => showReplyForm(e.target.dataset.commentId));
    if (editBtn) editBtn.addEventListener('click', (e) => showEditModal(e.target.dataset.commentId, decodeURIComponent(e.target.dataset.content)));
    if (deleteBtn) deleteBtn.addEventListener('click', async (e) => {
        if (await showConfirm("Are you sure you want to delete this comment? This will also delete all replies to it.", 'Confirm Deletion', { isDanger: true })) {
            handleDeleteComment(e.target.dataset.commentId);
        }
    });
}

function showReplyForm(parentCommentId) {
    const existingForm = document.querySelector('.reply-form');
    if (existingForm) existingForm.remove();
    replyMediaFile = null;

    const parentComment = document.getElementById(`comment-${parentCommentId}`);
    const form = document.createElement('form');
    form.className = 'reply-form';
    form.innerHTML = `
        <textarea placeholder="Write a reply..." required></textarea>
        <div class="comment-media-preview" id="replyMediaPreview" style="display: none;"></div>
        <div class="comment-form-actions">
            <button type="button" class="media-upload-btn" title="Attach Image/Video">📎</button>
            <input type="file" class="reply-media-input" accept="image/*,video/*" style="display: none;" />
            <div class="reply-form-actions" style="margin-left: auto;">
                <button type="button" class="cancel-reply-btn">Cancel</button>
                <button type="submit" class="submit-reply-btn">Submit Reply</button>
            </div>
        </div>`;
    parentComment.appendChild(form);
    form.querySelector('textarea').focus();

    form.querySelector('.media-upload-btn').addEventListener('click', () => form.querySelector('.reply-media-input').click());
    form.querySelector('.reply-media-input').addEventListener('change', (e) => handleFileSelection(e.target.files[0], 'reply'));
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = form.querySelector('textarea').value.trim();
        const submitButton = form.querySelector('.submit-reply-btn');
        if (content || replyMediaFile) {
            submitButton.disabled = true;
            // *** BUG FIX: Use parentCommentId, not parentId ***
            await handlePostReply(content, parentCommentId, submitButton);
            submitButton.disabled = false;
        }
        form.remove();
    });
    form.querySelector('.cancel-reply-btn').addEventListener('click', () => form.remove());
}

async function handlePostReply(content, parentId, submitButton) {
    submitButton.textContent = 'Checking...';
    const toxicityResult = await checkContentToxicity(content);
    if (toxicityResult.is_toxic) {
        showAlert(`Your reply cannot be posted because it was flagged as potentially inappropriate (Confidence: ${toxicityResult.confidence_score}).`, 'Content Warning');
        submitButton.textContent = 'Submit Reply';
        return;
    }

    const commentData = {
        content,
        parentId,
        authorId: currentUser.uid,
        createdAt: serverTimestamp()
    };
    
    try {
        if (replyMediaFile) {
            submitButton.textContent = 'Analyzing...';
            const nsfwResult = await checkImageNsfw(replyMediaFile);
            if (nsfwResult.is_nsfw) {
                showAlert(`Reply cannot be posted. The uploaded image was flagged as potentially NSFW (Score: ${nsfwResult.score}).`, 'Image Warning');
                submitButton.textContent = 'Submit Reply';
                return;
            }
            submitButton.textContent = 'Uploading...';
            const uploadResult = await uploadToCloudinary(replyMediaFile);
            commentData.mediaUrl = uploadResult.secure_url;
            commentData.mediaPublicId = uploadResult.public_id;
            commentData.mediaResourceType = uploadResult.resource_type;
        }

        submitButton.textContent = 'Posting...';
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        commentData.anonymousName = userDoc.exists() ? userDoc.data().anonymousName : 'Anonymous User';
        
        await addDoc(collection(db, `posts/${postId}/comments`), commentData);
        await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1), commenterIds: arrayUnion(currentUser.uid), trendingScore: increment(1) });
        
        const parentCommentRef = doc(db, `posts/${postId}/comments`, parentId);
        const parentCommentSnap = await getDoc(parentCommentRef);
        if (parentCommentSnap.exists()) {
            const recipientId = parentCommentSnap.data().authorId;
            const postDocSnap = await getDoc(doc(db, 'posts', postId));
            if (postDocSnap.exists()) {
                createNotification(recipientId, 'reply', postDocSnap.data());
            }
        }
    } catch (error) {
        console.error("Error posting reply: ", error);
        showAlert("Failed to post reply.", "Error");
    } finally {
        replyMediaFile = null;
    }
}

function showEditModal(commentId, content) {
    editCommentIdInput.value = commentId;
    editCommentContentInput.value = content;
    editCommentModal.style.display = 'flex';
}

async function handleUpdateComment() {
    const commentId = editCommentIdInput.value;
    const newContent = editCommentContentInput.value.trim();
    if (!newContent) return showAlert("Comment content cannot be empty.", "Validation Error");
    saveCommentButton.disabled = true;
    saveCommentButton.textContent = 'Saving...';
    try {
        const commentRef = doc(db, `posts/${postId}/comments`, commentId);
        await updateDoc(commentRef, { content: newContent });
        editCommentModal.style.display = 'none';
    } catch (error) {
        console.error("Error updating comment:", error);
        showAlert("Failed to save changes.", "Error");
    } finally {
        saveCommentButton.disabled = false;
        saveCommentButton.textContent = 'Save Changes';
    }
}

async function handleDeleteComment(commentIdToDelete) {
    const mainPostRef = doc(db, 'posts', postId);
    const commentsRef = collection(db, `posts/${postId}/comments`);
    
    try {
        const allReplies = await getAllReplies(commentIdToDelete, commentsRef);
        const commentsToDelete = [{ id: commentIdToDelete }, ...allReplies];
        const idsToDelete = commentsToDelete.map(c => c.id);

        const fullCommentDocs = await Promise.all(
            idsToDelete.map(id => getDoc(doc(commentsRef, id)))
        );

        const idToken = await currentUser.getIdToken(true);

        for (const commentDoc of fullCommentDocs) {
            if (commentDoc.exists()) {
                const commentData = commentDoc.data();
                if (commentData.mediaPublicId) {
                    await fetch(`${ML_API_URL}/delete-media`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                        body: JSON.stringify({
                            postId: postId,
                            publicId: commentData.mediaPublicId,
                            resourceType: commentData.mediaResourceType || 'image'
                        })
                    });
                }
            }
        }
        
        const batch = writeBatch(db);
        idsToDelete.forEach(id => {
            batch.delete(doc(commentsRef, id));
        });
        await batch.commit();

        const remainingCommentsQuery = query(commentsRef, where("authorId", "==", currentUser.uid));
        const remainingSnapshot = await getDocs(remainingCommentsQuery);
        let postUpdateData = {
            commentCount: increment(-idsToDelete.length),
            trendingScore: increment(-idsToDelete.length)
        };
        if (remainingSnapshot.empty) {
            postUpdateData.commenterIds = arrayRemove(currentUser.uid);
        }
        await updateDoc(mainPostRef, postUpdateData);
    } catch (error) {
        console.error("Error deleting comment and updating post:", error);
        showAlert("Failed to delete comment.", "Error");
    }
}

async function getAllReplies(parentCommentId, commentsRef) {
    let replies = [];
    const q = query(commentsRef, where("parentId", "==", parentCommentId));
    const snapshot = await getDocs(q);
    for (const doc of snapshot.docs) {
        const reply = { id: doc.id, ...doc.data() };
        replies.push(reply);
        const nestedReplies = await getAllReplies(reply.id, commentsRef);
        replies = replies.concat(nestedReplies);
    }
    return replies;
}

function handleFileSelection(file, type) {
    const previewContainer = type === 'main' 
        ? document.getElementById('mainCommentMediaPreview') 
        : document.getElementById('replyMediaPreview');
    
    if (!file) {
        if (type === 'main') mainCommentMediaFile = null; else replyMediaFile = null;
        previewContainer.style.display = 'none';
        previewContainer.innerHTML = '';
        return;
    }

    if (type === 'main') mainCommentMediaFile = file; else replyMediaFile = file;
    
    const url = URL.createObjectURL(file);
    let previewElement;

    if (file.type.startsWith('image/')) {
        previewElement = `<img src="${url}" alt="Preview">`;
    } else if (file.type.startsWith('video/')) {
        previewElement = `<video src="${url}" muted autoplay loop playsinline></video>`;
    } else {
        previewElement = `<p>Unsupported file type</p>`;
    }

    previewContainer.innerHTML = `${previewElement}<button type="button" class="remove-media-btn">&times;</button>`;
    previewContainer.style.display = 'block';
    
    previewContainer.querySelector('.remove-media-btn').addEventListener('click', () => {
        if (type === 'main') {
            document.getElementById('mainCommentMediaInput').value = '';
            mainCommentMediaFile = null;
        } else {
            const replyInput = document.querySelector('.reply-media-input');
            if (replyInput) replyInput.value = '';
            replyMediaFile = null;
        }
        previewContainer.style.display = 'none';
        previewContainer.innerHTML = '';
    });
}

function setupCommentFormListener() {
    const mediaButton = document.getElementById('mainCommentMediaBtn');
    const mediaInput = document.getElementById('mainCommentMediaInput');
    mediaButton.addEventListener('click', () => mediaInput.click());
    mediaInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0], 'main'));

    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = commentContentInput.value.trim();
        if (!content && !mainCommentMediaFile) return;

        const submitButton = commentForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Checking...';

        const toxicityResult = await checkContentToxicity(content);
        if (toxicityResult.is_toxic) {
            showAlert(`Your comment cannot be posted because it was flagged as potentially inappropriate (Confidence: ${toxicityResult.confidence_score}).`, 'Content Warning');
            submitButton.disabled = false;
            submitButton.textContent = 'Post Comment';
            return;
        }

        const commentData = {
            content,
            authorId: currentUser.uid,
            createdAt: serverTimestamp()
        };
        
        try {
            if (mainCommentMediaFile) {
                submitButton.textContent = 'Analyzing...';
                const nsfwResult = await checkImageNsfw(mainCommentMediaFile);
                if (nsfwResult.is_nsfw) {
                    showAlert(`Comment cannot be posted. The uploaded image was flagged as potentially NSFW (Score: ${nsfwResult.score}).`, 'Image Warning');
                    submitButton.disabled = false;
                    submitButton.textContent = 'Post Comment';
                    return;
                }
                submitButton.textContent = 'Uploading...';
                const uploadResult = await uploadToCloudinary(mainCommentMediaFile);
                commentData.mediaUrl = uploadResult.secure_url;
                commentData.mediaPublicId = uploadResult.public_id;
                commentData.mediaResourceType = uploadResult.resource_type;
            }

            submitButton.textContent = 'Posting...';
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            commentData.anonymousName = userDoc.exists() ? userDoc.data().anonymousName : 'Anonymous User';
            
            await addDoc(collection(db, `posts/${postId}/comments`), commentData);
            
            const postDocSnap = await getDoc(doc(db, 'posts', postId));
            if(postDocSnap.exists()) {
                await updateDoc(postDocSnap.ref, { 
                    commentCount: increment(1),
                    commenterIds: arrayUnion(currentUser.uid),
                    trendingScore: increment(1)
                });
                createNotification(postDocSnap.data().authorId, 'comment', postDocSnap.data());
            }
            commentContentInput.value = '';
            handleFileSelection(null, 'main');
        } catch (error) {
            console.error("Error posting top-level comment: ", error);
            showAlert("Failed to post your comment.", "Error");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Post Comment';
        }
    });
}