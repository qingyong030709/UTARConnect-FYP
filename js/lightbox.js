// FileName: js/lightbox.js

// Control the media lightbox functionality.

// Get references to all the necessary lightbox elements.
const mediaLightbox = document.getElementById('mediaLightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxVideo = document.getElementById('lightboxVideo');
const closeLightboxBtn = document.querySelector('.close-lightbox');

/**
 * Attaches all necessary event listeners for the lightbox.
 */
function setupLightboxListeners() {
    // 1. Listen for clicks on the 'x' button.
    if (closeLightboxBtn) {
        closeLightboxBtn.addEventListener('click', closeLightbox);
    }
    
    // 2. Listen for clicks on the dark overlay (to close it).
    if (mediaLightbox) {
        mediaLightbox.addEventListener('click', (event) => {
            // Only close if the user clicked the overlay itself, not the content inside it.
            if (event.target === mediaLightbox) {
                closeLightbox();
            }
        });
    }

    // 3. Listen for the 'Escape' key on the keyboard to close the lightbox.
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && mediaLightbox?.style.display === 'flex') {
            closeLightbox();
        }
    });
}

/**
 * Hides the lightbox overlay and resets its media content.
 */
function closeLightbox() {
    if (mediaLightbox) {
        mediaLightbox.style.display = 'none';
        // Stop any playing video and clear the source to free up resources.
        if (lightboxVideo) {
            lightboxVideo.pause();
            lightboxVideo.src = '';
        }
        // Clear the image source.
        if (lightboxImage) {
            lightboxImage.src = '';
        }
    }
}

/**
 * A globally accessible function to open the lightbox with specific media.
 * This is attached to the window object so it can be called from inline HTML 'onclick' attributes.
 * @param {string} url The URL of the image or video to display.
 * @param {string} type The type of media, either 'image' or 'video'.
 */
window.openMediaInLightbox = (url, type) => {
    if (!mediaLightbox || !lightboxImage || !lightboxVideo) return;

    // Ensure both media elements are hidden before showing the correct one.
    lightboxImage.style.display = 'none';
    lightboxVideo.style.display = 'none';

    if (type === 'image') {
        lightboxImage.src = url;
        lightboxImage.style.display = 'block';
    } else if (type === 'video') {
        lightboxVideo.src = url;
        lightboxVideo.style.display = 'block';
        lightboxVideo.play();
    }
    
    // Show the main lightbox overlay.
    mediaLightbox.style.display = 'flex';
};

// --- Initialize the listeners when the DOM is ready ---
document.addEventListener('DOMContentLoaded', setupLightboxListeners);