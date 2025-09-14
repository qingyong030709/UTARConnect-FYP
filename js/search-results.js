// FileName: js/search-results.js
import { db, collection, query, where, getDocs, orderBy, auth, doc, getDoc, updateDoc, arrayUnion, arrayRemove, increment, onAuthStateChanged } from './firebaseConfig.js';

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
const searchResultsContainer = document.getElementById('searchResultsContainer');
const loadingOverlay = document.getElementById("loadingOverlay");
const searchTitleElement = document.getElementById('searchTitle');
const categoryFilter = document.getElementById('categoryFilter');
const facultyFilter = document.getElementById('facultyFilter');
const mediaLightbox = document.getElementById('mediaLightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxVideo = document.getElementById('lightboxVideo');
const closeLightboxBtn = document.querySelector('.close-lightbox');

async function fetchUserRole(user) {
    if (!user) return 'student';
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        return userDocSnap.exists() ? userDocSnap.data().role || 'student' : 'student';
    } catch (error) {
        console.error("Error fetching user role:", error);
        return 'student';
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
            
            const urlParams = new URLSearchParams(window.location.search);
            const keyword = urlParams.get('keyword') || '';
            const category = urlParams.get('category') || '';
            const faculty = urlParams.get('faculty') || '';
            setupFilters(keyword, category, faculty);
            if (keyword) {
                fetchAndDisplaySearchResults(keyword, category, faculty);
            } else {
                searchResultsContainer.innerHTML = "<p class='no-posts'>Please enter a search term.</p>";
            }
            setupLightboxListeners();
        }
    });
});

function setupFilters(keyword, category, faculty) {
    searchTitleElement.textContent = `Search Results for "${keyword}"`;
    categoryFilter.value = category;
    facultyFilter.value = faculty;
    categoryFilter.addEventListener('change', () => runFilteredSearch(keyword));
    facultyFilter.addEventListener('change', () => runFilteredSearch(keyword));
}

function runFilteredSearch(keyword) {
    const newCategory = categoryFilter.value;
    const newFaculty = facultyFilter.value;
    const params = new URLSearchParams({ keyword: keyword });
    if (newCategory) params.set('category', newCategory);
    if (newFaculty) params.set('faculty', newFaculty);
    window.location.search = params.toString();
}

async function fetchAndDisplaySearchResults(keyword, category, faculty) {
    searchResultsContainer.innerHTML = "";
    showLoadingOverlay('Searching posts...');
    const lowerKeyword = keyword.toLowerCase();

    try {
        const postsRef = collection(db, "posts");
        let queryConstraints = [];
        if (category) queryConstraints.push(where("category", "==", category));
        if (faculty) queryConstraints.push(where("faculty", "==", faculty));
        queryConstraints.push(orderBy("createdAt", "desc"));
        
        const q = query(postsRef, ...queryConstraints);
        const querySnapshot = await getDocs(q);

        const matchingPosts = [];
        querySnapshot.docs.forEach((doc) => {
            const post = doc.data();
            const title = (post.title || '').toLowerCase();
            const content = (post.content || '').toLowerCase();
            const postFaculty = (post.faculty || '').toLowerCase();
            const subCategoryKey = (post.subCategory || '').toLowerCase();
            const subCategoryDisplay = (post.subCategoryDisplay || '').toLowerCase();
            const postCategory = (post.category || '').toLowerCase();

            if (title.includes(lowerKeyword) || content.includes(lowerKeyword) || postFaculty.includes(lowerKeyword) || subCategoryKey.includes(lowerKeyword) || subCategoryDisplay.includes(lowerKeyword) || postCategory.includes(lowerKeyword)) {
                matchingPosts.push({ id: doc.id, ...post });
            }
        });

        hideLoadingOverlay();

        if (matchingPosts.length === 0) {
            searchResultsContainer.innerHTML = `<p class='no-posts'>No posts found matching your search and filter criteria.</p>`;
            return;
        }

        renderPosts(matchingPosts.map(p => ({ id: p.id, data: () => p })), keyword);

    } catch (error) {
        console.error("Error fetching search results:", error);
        hideLoadingOverlay();
        searchResultsContainer.innerHTML = `<p class="error-message">Error loading search results. A required index might be missing.</p>`;
    }
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

function highlightText(text, keyword) {
    if (!keyword || !text) return text;
    const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function renderPosts(postsDocs, keyword) {
    let postsHtml = "";
    postsDocs.forEach((doc) => {
        const post = doc.data();
        const postId = doc.id;
        const postDate = post.createdAt?.toDate() ?? new Date();
        const formattedDate = postDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const authorDisplayName = post.anonymousName || "User";
        const isLiked = currentUser && (post.likedBy || []).includes(currentUser.uid);
        const likeButtonClass = `like-button ${isLiked ? 'liked' : ''}`;
        
        // Sanitize first, then highlight.
        const sanitizedTitle = sanitizeHTML(post.title);
        const sanitizedContent = sanitizeHTML(post.content);

        const highlightedTitle = highlightText(sanitizedTitle, keyword);
        const highlightedContent = highlightText(sanitizedContent, keyword);
        
        const mediaHtml = post.mediaUrl && typeof post.mediaUrl === 'string' ? `
            <div class="post-media-container">
                ${post.mediaUrl.match(/\.(mp4|webm|mov|ogg)$/i)
                    ? `<video class="post-media" src="${post.mediaUrl}" controls muted loop playsinline onclick="window.openMediaInLightbox('${post.mediaUrl}', 'video')"></video>`
                    : `<img class="post-media" src="${getOptimizedCloudinaryUrl(post.mediaUrl)}" alt="Post media" loading="lazy" onclick="window.openMediaInLightbox('${post.mediaUrl}', 'image')">`
                }
            </div>
        ` : '';

        postsHtml += `
            <div class="post-card" data-post-id="${postId}">
                <div class="post-header">
                    <div class="author-info">
                        <h3>${authorDisplayName}</h3>
                        <small class="post-date">${formattedDate}</small>
                    </div>
                    <div class="post-tags-group">
                        <span class="post-category">${post.category}</span>
                        ${post.faculty && post.faculty !== "None" ? `<span class="post-info-tag">${post.faculty}</span>` : ''}
                        ${post.subCategoryDisplay ? `<span class="post-info-tag">${post.subCategoryDisplay}</span>` : ''}
                    </div>
                </div>
                <h4 class="post-title"><a href="/view-post.html?postId=${postId}">${highlightedTitle}</a></h4>
                <p class="post-content">${highlightedContent}</p>
                 ${mediaHtml}
                <div class="post-footer">
                    <p>👍 <span class="like-count">${post.likes || 0}</span></p>
                    <p>💬 <span class="comment-count">${post.commentCount || 0}</span></p>
                    <button class="${likeButtonClass}" data-post-id="${postId}" data-is-liked="${isLiked}">${isLiked ? 'Unlike' : 'Like'}</button>
                </div>
            </div>`;
    });
    searchResultsContainer.innerHTML = postsHtml;
    attachActionListeners();
}

function attachActionListeners() {
    searchResultsContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('like-button')) {
            handleLikeClick(target);
        } else if (target.classList.contains('post-media')) {
            handleMediaClick(target);
        }
    });
}

async function handleLikeClick(button) {
    const postId = button.dataset.postId;
    if (!currentUser) return;
    const isCurrentlyLiked = button.dataset.isLiked === 'true';
    button.disabled = true;

    const postRef = doc(db, "posts", postId);
    const likeCountSpan = button.closest('.post-footer').querySelector('.like-count');
    const currentLikes = parseInt(likeCountSpan.textContent, 10);

    try {
        await updateDoc(postRef, {
            likedBy: isCurrentlyLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
            likes: increment(isCurrentlyLiked ? -1 : 1),
            trendingScore: increment(isCurrentlyLiked ? -1 : 1)
        });
        likeCountSpan.textContent = isCurrentlyLiked ? currentLikes - 1 : currentLikes + 1;
        button.classList.toggle('liked');
        button.textContent = isCurrentlyLiked ? 'Like' : 'Unlike';
        button.dataset.isLiked = !isCurrentlyLiked;
    } catch (error) {
        console.error("Error toggling like:", error);
    } finally {
        button.disabled = false;
    }
}

function handleMediaClick(target) {
    const mediaUrl = target.dataset.mediaUrl;
    const mediaType = target.dataset.mediaType;
    lightboxImage.style.display = 'none';
    lightboxVideo.style.display = 'none';
    if (mediaType === 'image') {
        lightboxImage.src = mediaUrl;
        lightboxImage.style.display = 'block';
    } else if (mediaType === 'video') {
        lightboxVideo.src = mediaUrl;
        lightboxVideo.style.display = 'block';
        lightboxVideo.play();
    }
    mediaLightbox.style.display = 'flex';
}

function setupLightboxListeners() {
    if (closeLightboxBtn) closeLightboxBtn.addEventListener('click', closeLightbox);
    if (mediaLightbox) mediaLightbox.addEventListener('click', (e) => {
        if (e.target === mediaLightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mediaLightbox?.style.display === 'flex') {
            closeLightbox();
        }
    });
}

function closeLightbox() {
    if (mediaLightbox) {
        mediaLightbox.style.display = 'none';
        if (lightboxVideo) { lightboxVideo.pause(); lightboxVideo.src = ''; }
        if (lightboxImage) lightboxImage.src = '';
    }
}