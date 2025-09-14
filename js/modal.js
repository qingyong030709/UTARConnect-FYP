// FileName: js/modal.js

/**
 * Shows an informational pop-up with a single "OK" button.
 */
export function showAlert(message, title = 'Alert') {
    // Find elements just-in-time, ensuring the DOM is loaded.
    const modalOverlay = document.getElementById('customModalOverlay');
    const modalTitleElem = document.getElementById('customModalTitle');
    const modalBodyElem = document.getElementById('customModalBody');
    const modalConfirmBtn = document.getElementById('customModalConfirmBtn');
    const modalCancelBtn = document.getElementById('customModalCancelBtn');
    const modalInputElem = document.getElementById('customModalInput');

    if (!modalOverlay || !modalConfirmBtn) {
        alert(message); // Fallback if modal elements are missing
        return;
    }
    
    modalTitleElem.textContent = title;
    modalBodyElem.textContent = message;
    
    // Hide unnecessary elements
    modalInputElem.style.display = 'none';
    modalCancelBtn.style.display = 'none';
    
    // Show and configure the confirm button to act as an "OK" button
    modalConfirmBtn.style.display = 'inline-block';
    modalConfirmBtn.textContent = 'OK';
    modalConfirmBtn.classList.remove('danger');
    modalConfirmBtn.classList.add('confirm');
    
    modalOverlay.classList.add('visible');

    const newConfirmBtn = modalConfirmBtn.cloneNode(true);
    modalConfirmBtn.parentNode.replaceChild(newConfirmBtn, modalConfirmBtn);
    
    newConfirmBtn.onclick = () => {
        modalOverlay.classList.remove('visible');
    };
}

/**
 * Shows a confirmation pop-up requiring a user decision.
 */
export function showConfirm(message, title = 'Confirm', options = { isDanger: false }) {
    return new Promise(resolve => {
        const modalOverlay = document.getElementById('customModalOverlay');
        const modalTitleElem = document.getElementById('customModalTitle');
        const modalBodyElem = document.getElementById('customModalBody');
        const modalConfirmBtn = document.getElementById('customModalConfirmBtn');
        const modalCancelBtn = document.getElementById('customModalCancelBtn');
        const modalInputElem = document.getElementById('customModalInput');

        if (!modalOverlay || !modalConfirmBtn || !modalCancelBtn) {
            resolve(false);
            return;
        }

        modalTitleElem.textContent = title;
        modalBodyElem.textContent = message;
        modalInputElem.style.display = 'none';
        modalCancelBtn.style.display = 'inline-block';
        modalConfirmBtn.style.display = 'inline-block';
        modalConfirmBtn.textContent = 'Confirm';

        if (options.isDanger) {
            modalConfirmBtn.classList.add('danger');
            modalConfirmBtn.classList.remove('confirm');
        } else {
            modalConfirmBtn.classList.add('confirm');
            modalConfirmBtn.classList.remove('danger');
        }
        
        modalOverlay.classList.add('visible');

        const newConfirmBtn = modalConfirmBtn.cloneNode(true);
        modalConfirmBtn.parentNode.replaceChild(newConfirmBtn, modalConfirmBtn);
        const newCancelBtn = modalCancelBtn.cloneNode(true);
        modalCancelBtn.parentNode.replaceChild(newCancelBtn, modalCancelBtn);

        const close = (result) => {
            modalOverlay.classList.remove('visible');
            resolve(result);
        };
        newConfirmBtn.onclick = () => close(true);
        newCancelBtn.onclick = () => close(false);
    });
}

/**
 * Shows a pop-up with an input field.
 */
export function showPrompt(message, title = 'Input Required') {
    return new Promise(resolve => {
        const modalOverlay = document.getElementById('customModalOverlay');
        const modalTitleElem = document.getElementById('customModalTitle');
        const modalBodyElem = document.getElementById('customModalBody');
        const modalConfirmBtn = document.getElementById('customModalConfirmBtn');
        const modalCancelBtn = document.getElementById('customModalCancelBtn');
        const modalInputElem = document.getElementById('customModalInput');

        if (!modalOverlay || !modalConfirmBtn || !modalCancelBtn || !modalInputElem) {
            resolve(null);
            return;
        }

        modalTitleElem.textContent = title;
        modalBodyElem.textContent = message;
        modalInputElem.style.display = 'block';
        modalInputElem.value = '';
        modalCancelBtn.style.display = 'inline-block';
        modalConfirmBtn.style.display = 'inline-block';
        modalConfirmBtn.textContent = 'Confirm';
        modalConfirmBtn.classList.add('confirm');
        modalConfirmBtn.classList.remove('danger');
        
        modalOverlay.classList.add('visible');
        modalInputElem.focus();

        const newConfirmBtn = modalConfirmBtn.cloneNode(true);
        modalConfirmBtn.parentNode.replaceChild(newConfirmBtn, modalConfirmBtn);
        const newCancelBtn = modalCancelBtn.cloneNode(true);
        modalCancelBtn.parentNode.replaceChild(newCancelBtn, modalCancelBtn);
        
        const close = (result) => {
            modalOverlay.classList.remove('visible');
            modalInputElem.style.display = 'none';
            resolve(result);
        };
        newConfirmBtn.onclick = () => close(modalInputElem.value);
        newCancelBtn.onclick = () => close(null);
    });
}

/**
 * Shows an informational pop-up with NO buttons that will close automatically on redirect.
 * This is used for success messages before the page changes.
 */
export function showAutoRedirectAlert(message, title = 'Success') {
    const modalOverlay = document.getElementById('customModalOverlay');
    const modalTitleElem = document.getElementById('customModalTitle');
    const modalBodyElem = document.getElementById('customModalBody');
    const modalConfirmBtn = document.getElementById('customModalConfirmBtn');
    const modalCancelBtn = document.getElementById('customModalCancelBtn');
    const modalInputElem = document.getElementById('customModalInput');

    if (!modalOverlay) return;
    
    modalTitleElem.textContent = title;
    modalBodyElem.textContent = message;
    
    // Hide all interactive elements
    modalInputElem.style.display = 'none';
    modalCancelBtn.style.display = 'none';
    modalConfirmBtn.style.display = 'none'; // Hide the confirm button
    
    modalOverlay.classList.add('visible');

    // No event listeners are needed since there are no buttons.
}