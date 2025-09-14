// FileName: js/index.js
import { db, collection, query, orderBy, where, doc, getDoc, auth, updateDoc, arrayUnion, arrayRemove, increment, limit, startAfter, getDocs, onAuthStateChanged } from './firebaseConfig.js';

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

let currentUser = null;
let currentSortType = 'latest';
let userRole = 'student';

const postsContainer = document.getElementById("postsContainer");
const loadingOverlay = document.getElementById("loadingOverlay");
const paginationContainer = document.getElementById("paginationContainer");
const sortDropdown = document.getElementById("sort");
const welcomeHeader = document.getElementById('welcomeHeader');

const POSTS_PER_PAGE = 10;

function showLoadingOverlay(message = 'Loading...') {
    postsContainer.innerHTML = '';
    paginationContainer.innerHTML = '';
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

document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                window.location.href = '/admin.html';
                return;
            }

            userRole = await fetchUserRole(currentUser);
            currentSortType = sortDropdown.value;
            fetchAndRenderPage(1);

            sortDropdown.addEventListener("change", (event) => {
                currentSortType = event.target.value;
                fetchAndRenderPage(1);
            });
        }
    });
});

async function fetchAndRenderPage(page) {
    if (welcomeHeader) {
        welcomeHeader.style.display = (page > 1) ? 'none' : 'block';
    }
    showLoadingOverlay('Loading posts...');

    const postsQueryRef = collection(db, "posts");
    let baseConstraints = [];
    let orderConstraints = [];

    if (userRole === 'staff') {
        const allowedCategories = ["Career & Professional Development", "Suggestions & Improvements", "Academic & Course Discussions"];
        baseConstraints.push(where("category", "in", allowedCategories));
    }

    if (currentSortType === "trending") {
        orderConstraints.push(orderBy("trendingScore", "desc"));
    } else {
        orderConstraints.push(orderBy("createdAt", "desc"));
    }
    
    try {
        const countQuery = query(postsQueryRef, ...baseConstraints);
        const countSnapshot = await getDocs(countQuery);
        const totalPosts = countSnapshot.size;
        const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);

        if (totalPosts === 0) {
            hideLoadingOverlay();
            postsContainer.innerHTML = `<p class='no-posts'>No posts found.</p>`;
            return;
        }

        let pageQuery = query(postsQueryRef, ...baseConstraints, ...orderConstraints, limit(POSTS_PER_PAGE));
        
        if (page > 1) {
            const previousPageLimit = (page - 1) * POSTS_PER_PAGE;
            const cursorQuery = query(postsQueryRef, ...baseConstraints, ...orderConstraints, limit(previousPageLimit));
            const cursorSnapshot = await getDocs(cursorQuery);
            const lastVisible = cursorSnapshot.docs[cursorSnapshot.docs.length - 1];
            pageQuery = query(postsQueryRef, ...baseConstraints, ...orderConstraints, startAfter(lastVisible), limit(POSTS_PER_PAGE));
        }

        const pageSnapshot = await getDocs(pageQuery);
        
        hideLoadingOverlay();
        renderPosts(pageSnapshot.docs);
        renderPaginationControls(page, totalPages, fetchAndRenderPage);

    } catch (error) {
        console.error("Error fetching paginated posts: ", error);
        hideLoadingOverlay();
        postsContainer.innerHTML = `<p class="error-message">Error loading posts. A required index is likely missing.</p>`;
    }
}

function renderPaginationControls(currentPage, totalPages, fetchPageFunction) {
    paginationContainer.innerHTML = '';
    if (totalPages <= 1) return;

    const createButton = (page, text, disabled = false, isActive = false) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.classList.add('pagination-button');
        if (disabled) button.disabled = true;
        if (isActive) button.classList.add('active');
        if (page !== null) {
            button.addEventListener('click', () => fetchPageFunction(page));
        }
        return button;
    };
    
    const createEllipsis = () => {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.classList.add('pagination-ellipsis');
        return ellipsis;
    };

    paginationContainer.appendChild(createButton(currentPage - 1, '« Prev', currentPage === 1));

    const pageNumbers = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
    } else {
        pageNumbers.push(1);
        if (currentPage > 3) pageNumbers.push('...');
        
        const startPage = Math.max(2, currentPage - 1);
        const endPage = Math.min(totalPages - 1, currentPage + 1);

        for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);

        if (currentPage < totalPages - 2) pageNumbers.push('...');
        pageNumbers.push(totalPages);
    }
    
    [...new Set(pageNumbers)].forEach(num => {
        if (num === '...') paginationContainer.appendChild(createEllipsis());
        else paginationContainer.appendChild(createButton(num, num, false, num === currentPage));
    });

    paginationContainer.appendChild(createButton(currentPage + 1, 'Next »', currentPage === totalPages));
}

function renderPosts(docs) {
    let postsHtml = "";
    docs.forEach((doc) => {
        const post = doc.data();
        const postId = doc.id;
        const postDate = post.createdAt?.toDate() ?? new Date();
        const formattedDate = postDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const authorDisplayName = post.anonymousName || "User";
        const isLiked = currentUser && (post.likedBy || []).includes(currentUser.uid);
        const likeButtonClass = `like-button ${isLiked ? 'liked' : ''}`;

        const mediaHtml = post.mediaUrl && typeof post.mediaUrl === 'string' ? `
            <div class="post-media-container">
                ${post.mediaUrl.match(/\.(mp4|webm|mov|ogg)$/i)
                    ? `<video class="post-media" src="${post.mediaUrl}" muted loop playsinline onclick="window.openMediaInLightbox('${post.mediaUrl}', 'video')"></video>`
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
                <h4 class="post-title"><a href="/view-post.html?postId=${postId}">${post.title}</a></h4>
                <p class="post-content">${sanitizeHTML(post.content)}</p>
                ${mediaHtml}
                <div class="post-footer">
                    <p>👍 <span class="like-count">${post.likes || 0}</span></p>
                    <p>💬 <span class="comment-count">${post.commentCount || 0}</span></p>
                    <button class="${likeButtonClass}" data-post-id="${postId}">${isLiked ? 'Unlike' : 'Like'}</button>
                </div>
            </div>`;
    });
    postsContainer.innerHTML = postsHtml;
}

postsContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('like-button')) {
        handleLikeClick(event.target);
    }
});

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
        likeCountSpan.textContent = isLiked ? currentLikes - 1 : currentLikes + 1;
    } catch (error) {
        console.error("Error toggling like:", error);
    } finally {
        button.disabled = false;
    }
}