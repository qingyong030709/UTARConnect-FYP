// FileName: js/post.js
import { db, collection, addDoc, serverTimestamp, auth, doc, getDoc, onAuthStateChanged } from './firebaseConfig.js';
import { showAlert, showAutoRedirectAlert } from './modal.js';

let currentUser = null;
let userRole = 'student';

const postForm = document.getElementById("postForm");
const togglePollBtn = document.getElementById('togglePollBtn');
const pollCreationContainer = document.getElementById('pollCreationContainer');
const pollOptionsContainer = document.getElementById('pollOptionsContainer');
const addPollOptionBtn = document.getElementById('addPollOptionBtn');

// Use your live backend URL for production, or local for testing
const ML_API_URL = 'https://utarconnect-backend-807320862918.asia-southeast1.run.app';

async function checkTextToxicity(text) {
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

async function uploadToCloudinary(file, submitButton) {
    const CLOUD_NAME = "dq1ss3ka5";
    const UPLOAD_PRESET = "utar_connect_unsigned";
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'utar-connect-media');
    submitButton.textContent = 'Uploading media...';
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Cloudinary upload failed: ${errorData.error.message}`);
    }
    return await response.json();
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

document.addEventListener("DOMContentLoaded", function () {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                window.location.href = '/admin.html';
                return;
            }
            userRole = await fetchUserRole(currentUser);
            setupCategoryDropdown();
            setupPostFormListener();
            setupPollCreationListeners();
        }
    });
});

function setupCategoryDropdown() {
    const categoryDropdown = document.getElementById("categoryDropdown");
    const subCategoryDropdown = document.getElementById("subCategoryDropdown");
    const allSubcategories = {
        "Academic & Course Discussions": { "Academics": "📚 Academics", "Lectures_Tutorials": "🎓 Lectures & Tutorials", "Assignments_Exams": "📝 Assignments & Exams", "Research_Projects": "🔬 Research & Projects" },
        "Campus Life & Student Affairs": { "Campus_Life": "🏢 Campus Life", "Student_Services": "ℹ️ Student Services", "Student_Organizations": "👥 Student Organizations", "Events_Activities": "🎪 Events & Activities" },
        "Career & Professional Development": { "Internships_Jobs": "💼 Internships & Job Opportunities", "Alumni_Network": "👨‍🎓 Alumni Network" },
        "Suggestions & Improvements": { "University_Feedback": "💡 University Feedback", "Campus_Facilities": "🏛️ Campus Facilities & Services" },
        "Social": { "Lost_Found": "🔍 Lost & Found", "Casual_Chat": "💬 Casual Chat" }
    };

    if (userRole === 'staff') {
        const allowedCategories = ["Career & Professional Development", "Suggestions & Improvements", "Academic & Course Discussions"];
        const options = categoryDropdown.options;
        for (let i = options.length - 1; i >= 0; i--) {
            if (options[i].value && !allowedCategories.includes(options[i].value)) {
                categoryDropdown.remove(i);
            }
        }
    }

    categoryDropdown.addEventListener("change", function () {
        const selectedCategory = categoryDropdown.value;
        subCategoryDropdown.innerHTML = '<option value="" disabled selected>Choose a subcategory</option>';
        if (selectedCategory && allSubcategories[selectedCategory]) {
            subCategoryDropdown.appendChild(new Option('All / General', 'all'));
            for (const [key, value] of Object.entries(allSubcategories[selectedCategory])) {
                subCategoryDropdown.appendChild(new Option(value, key));
            }
            subCategoryDropdown.disabled = false;
        } else {
            subCategoryDropdown.disabled = true;
        }
    });
    subCategoryDropdown.disabled = true;
}

function setupPollCreationListeners() {
    togglePollBtn.addEventListener('click', () => {
        const isVisible = pollCreationContainer.style.display === 'block';
        pollCreationContainer.style.display = isVisible ? 'none' : 'block';
        togglePollBtn.textContent = isVisible ? '📊 Create a Poll' : '❌ Close Poll Creator';
    });
    addPollOptionBtn.addEventListener('click', () => {
        const optionCount = pollOptionsContainer.children.length;
        const newOption = document.createElement('div');
        newOption.className = 'poll-option-input-group';
        newOption.innerHTML = `
            <input type="text" class="poll-option-input" placeholder="Option ${optionCount + 1}">
            <button type="button" class="remove-poll-option-btn">X</button>
        `;
        pollOptionsContainer.appendChild(newOption);
        newOption.querySelector('.remove-poll-option-btn').addEventListener('click', (e) => e.target.parentElement.remove());
    });
    pollOptionsContainer.querySelectorAll('.remove-poll-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => e.target.parentElement.remove());
    });
}

// NEW: Function to handle media preview for the main post
function handlePostFileSelection(file) {
    const previewContainer = document.getElementById('mediaPreviewContainer');
    const mediaInput = document.getElementById('mediaUpload');

    if (!file) {
        previewContainer.style.display = 'none';
        previewContainer.innerHTML = '';
        return;
    }
    
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
        mediaInput.value = ''; // Clear the file input
        previewContainer.style.display = 'none';
        previewContainer.innerHTML = '';
    });
}

function setupPostFormListener() {
    const submitButton = postForm.querySelector('.submit-button');
    const successMessageElement = document.getElementById('successMessage');
    const mediaUpload = document.getElementById('mediaUpload');

    // Add event listener for the media input
    mediaUpload.addEventListener('change', (e) => handlePostFileSelection(e.target.files[0]));

    postForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        submitButton.disabled = true;
        submitButton.textContent = 'Analyzing content...';
        submitButton.classList.add('loading');

        const postTitle = document.getElementById("postTitle").value.trim();
        const postContent = document.getElementById("postContent").value.trim();

        if (postTitle.length > 150) {
            showAlert('The post title cannot exceed 150 characters.');
            return; // Stop the function
        }

        if (postContent.length > 5000) {
            showAlert('The post content cannot exceed 5000 characters.');
            return; // Stop the function
        }
        const file = document.getElementById("mediaUpload").files[0];
        
        const titleToxicityResult = await checkTextToxicity(postTitle);
        if (titleToxicityResult.is_toxic) {
            showAlert(`Post cannot be submitted. The title was flagged as potentially inappropriate (Confidence: ${titleToxicityResult.confidence_score}).`, 'Content Warning');
            submitButton.disabled = false;
            submitButton.textContent = 'Post';
            submitButton.classList.remove('loading');
            return;
        }
        
        const contentToxicityResult = await checkTextToxicity(postContent);
        if (contentToxicityResult.is_toxic) {
            showAlert(`Post cannot be submitted. The content was flagged as potentially inappropriate (Confidence: ${contentToxicityResult.confidence_score}).`, 'Content Warning');
            submitButton.disabled = false;
            submitButton.textContent = 'Post';
            submitButton.classList.remove('loading');
            return;
        }

        if (file) {
            submitButton.textContent = 'Analyzing image...';
            const nsfwResult = await checkImageNsfw(file);
            if (nsfwResult.is_nsfw) {
                showAlert(`Post cannot be submitted. The uploaded image was flagged as potentially NSFW (Score: ${nsfwResult.score}).`, 'Image Warning');
                submitButton.disabled = false;
                submitButton.textContent = 'Post';
                submitButton.classList.remove('loading');
                return;
            }
        }
        
        submitButton.textContent = 'Posting...';

        try {
            if (!currentUser) throw new Error("You must be logged in to post.");
            
            const category = document.getElementById("categoryDropdown").value;
            const subCategory = document.getElementById("subCategoryDropdown").value;
            const subCategoryDisplay = subCategory ? document.getElementById("subCategoryDropdown").options[document.getElementById("subCategoryDropdown").selectedIndex].text : '';
            const faculty = document.getElementById("facultyDropdown").value || "None";
            
            if (!postTitle || !category || !subCategory || !postContent) {
                throw new Error("Please fill out all required fields.");
            }

            let mediaUrl = null;
            let mediaPublicId = null;
            let mediaResourceType = null;

            if (file) {
                const uploadResult = await uploadToCloudinary(file, submitButton);
                mediaUrl = uploadResult.secure_url;
                mediaPublicId = uploadResult.public_id;
                mediaResourceType = uploadResult.resource_type;
            }
            
            const authorDetails = await getAuthorDetails(); 
            
            const postData = {
                title: postTitle, category, subCategory, subCategoryDisplay, faculty, content: postContent,
                authorId: currentUser.uid, authorName: authorDetails.name, anonymousName: authorDetails.anonymousName,
                createdAt: serverTimestamp(), likes: 0, likedBy: [], 
                mediaUrl, mediaPublicId, mediaResourceType, 
                commentCount: 0, commenterIds: [], trendingScore: 0, reportCount: 0, reportedBy: []
            };

            const pollQuestion = document.getElementById('pollQuestion').value.trim();
            if (pollCreationContainer.style.display === 'block' && pollQuestion) {
                const pollOptions = Array.from(document.querySelectorAll('.poll-option-input'))
                                        .map(input => input.value.trim())
                                        .filter(optionText => optionText !== '');
                if (pollOptions.length >= 2) {
                    postData.poll = {
                        question: pollQuestion,
                        options: pollOptions.map(optionText => ({ text: optionText, votes: 0 })),
                        totalVotes: 0
                    };
                } else {
                     throw new Error("A poll must have a question and at least two options.");
                }
            }
            
            await addDoc(collection(db, "posts"), postData);

            // Replaced the old text message with showAlert 
            showAutoRedirectAlert("Your post has been successfully submitted! You will now be redirected to the homepage.", "Post Submitted!");

            setTimeout(() => { window.location.href = "/index.html"; }, 2000);

        } catch (error) {
            console.error("Post submission error:", error);
            // Standardized error message title 
            showAlert(`Error submitting post: ${error.message}`, 'Submission Failed');
            submitButton.disabled = false;
            submitButton.textContent = 'Post';
            submitButton.classList.remove('loading');
        }
    });
}

async function getAuthorDetails() {
    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            return {
                name: userData.name || currentUser.email.split('@')[0],
                anonymousName: userData.anonymousName || 'Anonymous User'
            };
        }
    } catch (error) {
        console.warn("Could not fetch user details for post:", error);
    }
    return {
        name: currentUser.email.split('@')[0],
        anonymousName: 'Anonymous User'
    };
}