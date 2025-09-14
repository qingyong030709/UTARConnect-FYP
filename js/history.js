// FileName: js/history.js
import { db, collection, query, where, orderBy, doc, getDoc, auth, updateDoc, deleteDoc, getDocs, arrayRemove, increment, arrayUnion, writeBatch, onAuthStateChanged } from './firebaseConfig.js';
import { showAlert, showConfirm } from './modal.js';

function sanitizeHTML(text) {
    const temp = document.createElement('div');
    temp.textContent = text;
    return temp.innerHTML;
}

function getOptimizedCloudinaryUrl(url) {
    if (!url || !url.includes('/upload/')) {
        return url;
    }
    return url.replace('/upload/', '/upload/q_auto,f_auto,w_800/');
}

let currentUser = null;
let activeTab = 'my-posts';
let currentSearchTerm = '';

const historyPostsContainer = document.getElementById('historyPostsContainer');
const loadingOverlay = document.getElementById("loadingOverlay");
const tabs = document.querySelectorAll('.history-tab-button');
const historySearchInput = document.getElementById('historySearchInput');
const historySearchButton = document.getElementById('historySearchButton');
const editModal = document.getElementById('editPostModal');
const editPostIdInput = document.getElementById('editPostId');
const editPostTitleInput = document.getElementById('editPostTitle');
const editPostContentInput = document.getElementById('editPostContent');
const saveEditButton = document.getElementById('saveEditButton');
const closeModalButton = editModal.querySelector('.close-lightbox');

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

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') { 
                window.location.href = '/admin.html'; 
                return;
            }

            setupTabs();
            setupHistorySearch();
            fetchHistoryPosts();
            setupModalListeners();
            historyPostsContainer.addEventListener('click', handlePostCardClick);
        }
    });
});

function setupTabs() {
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('active')) return;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            fetchHistoryPosts();
        });
    });
}

function setupHistorySearch() {
    const performSearch = () => {
        const searchTerm = historySearchInput.value.trim();
        if (currentSearchTerm !== searchTerm) {
            currentSearchTerm = searchTerm;
            fetchHistoryPosts();
        }
    };
    historySearchButton.addEventListener('click', performSearch);
    historySearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

function fetchHistoryPosts() {
    if (!currentUser) return;
    showLoadingOverlay(currentSearchTerm ? 'Searching...' : 'Loading...');
    
    let baseQuery = [];
    switch (activeTab) {
        case 'my-posts':
            baseQuery.push(where("authorId", "==", currentUser.uid));
            break;
        case 'liked-posts':
            baseQuery.push(where("likedBy", "array-contains", currentUser.uid));
            break;
        case 'replied-posts':
            baseQuery.push(where("commenterIds", "array-contains", currentUser.uid));
            break;
    }
    baseQuery.push(orderBy("createdAt", "desc"));
    
    const finalQuery = query(collection(db, "posts"), ...baseQuery);
    
    getDocs(finalQuery).then(snapshot => {
        hideLoadingOverlay();
        let docsToRender = snapshot.docs;
        
        if (currentSearchTerm.length > 0) {
            const lowerCaseSearchTerm = currentSearchTerm.toLowerCase();
            docsToRender = snapshot.docs.filter(doc => {
                const post = doc.data();
                return (post.title || '').toLowerCase().includes(lowerCaseSearchTerm) || 
                       (post.content || '').toLowerCase().includes(lowerCaseSearchTerm);
            });
        }
        
        if (docsToRender.length === 0) {
            let message = "No posts here yet.";
            if (currentSearchTerm) {
                message = `No results for "${currentSearchTerm}"`;
            } else if (activeTab === 'my-posts') {
                message = `You haven't created any posts yet. <a href="/post.html">Why not create one?</a>`;
            }
            historyPostsContainer.innerHTML = `<p class='no-posts'>${message}</p>`;
            return;
        }

        renderHistoryPosts(docsToRender);

    }).catch(error => {
        console.error("Error fetching history:", error);
        hideLoadingOverlay();
        historyPostsContainer.innerHTML = `<p class="error-message">Could not load history.</p>`;
    });
}

function highlightText(text, keyword) {
    if (!keyword || !text) return text;
    const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}


function renderHistoryPosts(docs) {
    let postsHtml = "";
    docs.forEach(doc => {
        const post = doc.data();
        const postId = doc.id;
        const postDate = post.createdAt?.toDate() ?? new Date();
        const formattedDate = postDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const isLiked = currentUser && (post.likedBy || []).includes(currentUser.uid);
        const likeButtonClass = `like-button ${isLiked ? 'liked' : ''}`;
        
        const actionButtons = activeTab === 'my-posts' ? `
            <div class="action-buttons">
                <button class="action-button edit-btn" data-id="${postId}" data-title="${encodeURIComponent(post.title)}" data-content="${encodeURIComponent(post.content)}">Edit</button>
                <button class="action-button delete-btn" data-id="${postId}">Delete</button>
            </div>
        ` : '';
        
        const mediaHtml = post.mediaUrl && typeof post.mediaUrl === 'string' ? `
            <div class="post-media-container">
                ${post.mediaUrl.match(/\.(mp4|webm|mov|ogg)$/i)
                    ? `<video class="post-media" src="${post.mediaUrl}" muted loop playsinline onclick="window.openMediaInLightbox('${post.mediaUrl}', 'video')"></video>`
                    : `<img class="post-media" src="${getOptimizedCloudinaryUrl(post.mediaUrl)}" alt="Post media" loading="lazy" onclick="window.openMediaInLightbox('${post.mediaUrl}', 'image')">`
                }
            </div>
        ` : '';

        // Sanitize first, then highlight.
        const sanitizedTitle = sanitizeHTML(post.title);
        const sanitizedContent = sanitizeHTML(post.content);

        const postTitle = highlightText(sanitizedTitle, currentSearchTerm);
        const postContent = highlightText(sanitizedContent, currentSearchTerm);

        postsHtml += `
            <div class="post-card" data-post-id="${postId}">
                <div class="post-header">
                    <div class="author-info">
                        <h3>${post.anonymousName || 'User'}</h3>
                        <small class="post-date">${formattedDate}</small>
                    </div>
                </div>
                <h4 class="post-title"><a href="/view-post.html?postId=${postId}">${postTitle}</a></h4>
                <p class="post-content">${postContent}</p>
                ${mediaHtml}
                <div class="post-footer">
                    <p>👍 <span class="like-count">${post.likes || 0}</span></p>
                    <p>💬 <span class="comment-count">${post.commentCount || 0}</span></p>
                    <button class="${likeButtonClass}" data-post-id="${postId}">${isLiked ? 'Unlike' : 'Like'}</button>
                    ${actionButtons}
                </div>
            </div>`;
    });
    historyPostsContainer.innerHTML = postsHtml;
}

async function handlePostCardClick(e) {
    const target = e.target;
    if (target.classList.contains('edit-btn')) {
        editPostIdInput.value = target.dataset.id;
        editPostTitleInput.value = decodeURIComponent(target.dataset.title);
        editPostContentInput.value = decodeURIComponent(target.dataset.content);
        editModal.style.display = 'flex';
    } else if (target.classList.contains('delete-btn')) {
        const postId = target.dataset.id;
        if (await showConfirm('Are you sure you want to delete this post? This cannot be undone.', 'Confirm Deletion', { isDanger: true })) {
            await deletePost(postId);
            showAlert("Your post has been successfully deleted.", "Post Deleted");
        }
    } else if (target.classList.contains('like-button')) {
        handleLikeClick(target);
    }
}

function setupModalListeners() {
    closeModalButton.addEventListener('click', () => editModal.style.display = 'none');
    saveEditButton.addEventListener('click', async () => {
        const postId = editPostIdInput.value;
        const newTitle = editPostTitleInput.value.trim();
        const newContent = editPostContentInput.value.trim();

        if (!newTitle || !newContent) {
            showAlert('Title and content cannot be empty.', 'Validation Error');
            return;
        }
        
        saveEditButton.disabled = true;
        saveEditButton.textContent = 'Saving...';
        const postRef = doc(db, "posts", postId);
        
        try {
            await updateDoc(postRef, { title: newTitle, content: newContent });
            editModal.style.display = 'none';
            fetchHistoryPosts();
            showAlert("Your changes have been saved successfully.", "Post Updated");
        } catch (error) {
            console.error("Error updating post:", error);
            showAlert("Failed to save changes.", 'Error');
        } finally {
            saveEditButton.disabled = false;
            saveEditButton.textContent = 'Save Changes';
        }
    });
}

async function deleteSubcollection(postId, subcollectionName) {
    const subcollectionRef = collection(db, 'posts', postId, subcollectionName);
    const snapshot = await getDocs(subcollectionRef);
    const batch = writeBatch(db);
    snapshot.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
}

async function deletePost(postId) {
    const postCard = historyPostsContainer.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (postCard) postCard.style.opacity = '0.5';

    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            throw new Error("Post document does not exist.");
        }
        
        const postData = postSnap.data();
        
        if (postData.mediaPublicId) {
            const user = auth.currentUser;
            if (user) {
                const idToken = await user.getIdToken(true);
                const response = await fetch('http://127.0.0.1:5001/delete-media', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        postId: postId,
                        publicId: postData.mediaPublicId,
                        resourceType: postData.mediaResourceType || 'image'
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    console.warn(`Failed to delete media from Cloudinary: ${errorData.error || 'Unknown'}`);
                } else {
                    console.log("Successfully deleted media from Cloudinary.");
                }
            }
        }

        await deleteSubcollection(postId, 'comments');
        await deleteSubcollection(postId, 'pollVotes');
        await deleteDoc(postRef);
        
        if(postCard) postCard.remove();

    } catch (error) {
        console.error("Error during the post deletion process:", error);
        showAlert(`Failed to delete post: ${error.message}`, 'Deletion Failed');
        if (postCard) postCard.style.opacity = '1';
    }
}

async function handleLikeClick(button) {
    const postId = button.dataset.postId;
    if (!currentUser || button.disabled) return;
    button.disabled = true;

    const postRef = doc(db, "posts", postId);
    const isLiked = button.classList.contains('liked');

    try {
        await updateDoc(postRef, {
            likedBy: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
            likes: increment(isLiked ? -1 : 1),
            trendingScore: increment(isLiked ? -1 : 1)
        });
        
        const likeCountSpan = button.parentElement.querySelector('.like-count');
        const currentLikes = parseInt(likeCountSpan.textContent, 10);
        button.classList.toggle('liked');
        button.textContent = isLiked ? 'Like' : 'Unlike';
        likeCountSpan.textContent = isLiked ? currentLikes + 1 : currentLikes - 1;
    } catch (error) {
        console.error("Error toggling like:", error);
    } finally {
        button.disabled = false;
    }
}