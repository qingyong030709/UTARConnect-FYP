// FileName: js/search.js
import { db, collection, query, getDocs, orderBy, where, auth, doc, getDoc } from './firebaseConfig.js';

const searchBar = document.getElementById('searchBar');
const searchButton = document.querySelector('.search-button');
const searchResultsDropdown = document.getElementById('searchResultsDropdown');

let searchTimeout;
const SUGGESTION_COUNT = 5;

let currentUser = null;
let userRole = 'student';

async function fetchUserRole(user) {
    if (!user) return 'student';
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        return userDocSnap.exists() ? userDocSnap.data().role || 'student' : 'student';
    } catch (error) {
        console.error("Error fetching user role for search:", error);
        return 'student';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async (user) => {
        currentUser = user ? user : null;
        userRole = user ? await fetchUserRole(user) : 'student';
    });

    if (!searchBar || !searchButton || !searchResultsDropdown) return;
    
    searchBar.addEventListener('input', handleSearchInput);
    searchButton.addEventListener('click', handleSearchButtonClick);
    searchBar.addEventListener('keypress', handleSearchKeyPress);
    searchResultsDropdown.addEventListener('click', handleDropdownClick);
    document.addEventListener('click', handleDocumentClick);
    searchResultsDropdown.addEventListener('click', (event) => event.stopPropagation());
    searchBar.closest('.search-container')?.addEventListener('click', (event) => event.stopPropagation());
});

function handleSearchInput() {
    clearTimeout(searchTimeout);
    const keyword = searchBar.value.trim().toLowerCase();
    if (keyword.length === 0) {
        hideSuggestions();
        return;
    }
    searchTimeout = setTimeout(() => fetchSearchSuggestions(keyword), 300);
}

function handleSearchButtonClick() {
    const keyword = searchBar.value.trim();
    if (keyword.length > 0) {
        performFullSearch(keyword);
    }
}

function handleSearchKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleSearchButtonClick();
        hideSuggestions();
    }
}

function handleDropdownClick(event) {
    if (event.target.tagName === 'A') {
        if (event.target.classList.contains('show-all-results')) {
            handleSearchButtonClick();
        }
        hideSuggestions();
    }
}

function handleDocumentClick(event) {
    const searchWrapper = document.querySelector('.search-wrapper');
    if (searchWrapper && !searchWrapper.contains(event.target)) {
        hideSuggestions();
    }
}

async function fetchSearchSuggestions(keyword) {
    const postsRef = collection(db, "posts");
    let queryConstraints = [orderBy("createdAt", "desc")];

    if (userRole === 'staff') {
        const allowedCategories = ["Career & Professional Development", "Suggestions & Improvements", "Academic & Course Discussions"];
        queryConstraints.push(where("category", "in", allowedCategories));
    }

    const q = query(postsRef, ...queryConstraints);

    try {
        const querySnapshot = await getDocs(q);
        const filteredPosts = [];
        querySnapshot.forEach((doc) => {
            const post = doc.data();
            const title = (post.title || '').toLowerCase();
            const content = (post.content || '').toLowerCase();
            const faculty = (post.faculty || '').toLowerCase();
            const subCategoryKey = (post.subCategory || '').toLowerCase();
            const subCategoryDisplay = (post.subCategoryDisplay || '').toLowerCase();
            // --- THIS SECTION IS UPDATED ---
            const category = (post.category || '').toLowerCase(); // Get the main category

            // Search keyword in all relevant text fields
            if (title.includes(keyword) || 
                content.includes(keyword) || 
                faculty.includes(keyword) || 
                subCategoryKey.includes(keyword) || 
                subCategoryDisplay.includes(keyword) ||
                category.includes(keyword)) { // Check the main category
                filteredPosts.push({ id: doc.id, ...post });
            }
            // --- END OF UPDATE ---
        });
        displaySearchSuggestions(filteredPosts, keyword);
    } catch (error) {
        console.error("Error fetching search suggestions:", error);
        searchResultsDropdown.innerHTML = '<div class="no-results">Error.</div>';
        showSuggestions();
    }
}

function displaySearchSuggestions(posts, keyword) {
    searchResultsDropdown.innerHTML = "";
    if (posts.length === 0) {
        searchResultsDropdown.innerHTML = '<div class="no-results">No results found.</div>';
    } else {
        const displayedPosts = posts.slice(0, SUGGESTION_COUNT);
        displayedPosts.forEach(post => {
            const link = document.createElement('a');
            link.href = `/view-post.html?postId=${post.id}`;
            link.textContent = post.title;
            searchResultsDropdown.appendChild(link);
        });
        if (posts.length > 0) {
            const showAllLink = document.createElement('a');
            showAllLink.href = `/search-results.html?keyword=${encodeURIComponent(searchBar.value.trim())}`;
            showAllLink.classList.add('show-all-results');
            showAllLink.textContent = `Show all results for "${keyword}"`;
            searchResultsDropdown.appendChild(showAllLink);
        }
    }
    showSuggestions();
}

function showSuggestions() {
    if (searchResultsDropdown.children.length > 0) {
        searchResultsDropdown.style.display = 'block';
    }
}

function hideSuggestions() {
    searchResultsDropdown.style.display = 'none';
    searchResultsDropdown.innerHTML = "";
}

function performFullSearch(keyword) {
    window.location.href = `/search-results.html?keyword=${encodeURIComponent(keyword)}`;
}