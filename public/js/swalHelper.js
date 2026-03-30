const SwalCustom = {
    // Shared configurations for premium look
    premiumOptions: {
        confirmButtonColor: '#9135ED',
        cancelButtonColor: '#6c757d',
        buttonsStyling: true,
        heightAuto: false, // Prevents page shift
        scrollbarPadding: false,
        returnFocus: false,
        customClass: {
            confirmButton: 'swal-premium-btn',
            cancelButton: 'swal-premium-btn'
        }
    },

    success: (title, text = '') => {
        return Swal.fire({
            ...SwalCustom.premiumOptions,
            icon: 'success',
            title: title,
            text: text,
            showConfirmButton: false,
            timer: 1000,
            timerProgressBar: false, // Cleaner look
            showClass: {
                popup: 'animate__animated animate__fadeInDown'
            },
            hideClass: {
                popup: 'animate__animated animate__fadeOutUp'
            }
        });
    },

    error: (title, text = '') => {
        return Swal.fire({
            ...SwalCustom.premiumOptions,
            icon: 'error',
            title: title,
            text: text,
            confirmButtonText: 'OK'
        });
    },

    confirm: (title, text, confirmButtonText = 'Yes', cancelButtonText = 'Cancel') => {
        return Swal.fire({
            ...SwalCustom.premiumOptions,
            icon: 'warning',
            title: title,
            text: text,
            showCancelButton: true,
            confirmButtonText: confirmButtonText,
            cancelButtonText: cancelButtonText,
            reverseButtons: true
        });
    },

    processing: (title = 'Processing...', text = 'Please wait...') => {
        return Swal.fire({
            ...SwalCustom.premiumOptions,
            title: title,
            text: text,
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
    },

    withDelayedProcessing: async (task, options = {}) => {
        const {
            delay = 250,
            title = 'Processing...',
            text = 'Please wait...'
        } = options;

        let loaderShown = false;
        const timer = setTimeout(() => {
            loaderShown = true;
            SwalCustom.processing(title, text);
        }, delay);

        try {
            const result = await task();
            clearTimeout(timer);
            if (loaderShown) SwalCustom.close();
            return result;
        } catch (error) {
            clearTimeout(timer);
            if (loaderShown) SwalCustom.close();
            throw error;
        }
    },

    close: () => {
        Swal.close();
    },

    promptSelect: (title, text, inputOptions, inputPlaceholder = 'Select action...') => {
        return Swal.fire({
            ...SwalCustom.premiumOptions,
            icon: 'info',
            title: title,
            text: text,
            input: 'select',
            inputOptions: inputOptions,
            inputPlaceholder: inputPlaceholder,
            showCancelButton: true,
            confirmButtonText: 'Submit',
            cancelButtonText: 'Cancel',
            inputValidator: (value) => {
                if (!value) return 'Selection required!';
            }
        });
    }
};

// Add styles to suppress focus borders and ensure premium look
const style = document.createElement('style');
style.innerHTML = `
    html {
        overflow-y: scroll;
    }
    body.swal2-shown,
    body.swal2-height-auto {
        overflow-y: scroll !important;
        padding-right: 0 !important;
    }
    .swal-premium-btn:focus {
        box-shadow: none !important;
        outline: none !important;
    }
    .swal2-confirm.swal2-styled:focus {
        box-shadow: none !important;
    }
    .swal2-cancel.swal2-styled:focus {
        box-shadow: none !important;
    }
    .swal2-popup {
        border-radius: 15px !important;
        font-family: 'Poppins', sans-serif !important;
    }
`;
document.head.appendChild(style);
