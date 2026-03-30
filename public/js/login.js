document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("togglePassword");
  const emailFeedback = document.getElementById("emailFeedback");
  const passwordFeedback = document.getElementById("passwordFeedback");

  function clearFieldError(input, feedback, defaultMessage) {
    input.classList.remove("is-invalid");
    if (feedback) {
      feedback.innerHTML = `<small>${defaultMessage}</small>`;
      feedback.style.display = "none";
    }
  }

  function showFieldError(input, feedback, message) {
    input.classList.remove("is-valid");
    input.classList.add("is-invalid");
    if (feedback) {
      feedback.innerHTML = `<small>${message}</small>`;
      feedback.style.display = "block";
    }
  }

  function setFieldState(input, isValid, message = "") {
    const feedback = input.parentElement.querySelector(".invalid-feedback") || input.nextElementSibling;
    input.classList.remove("is-valid", "is-invalid");

    if (!isValid) {
      input.classList.add("is-invalid");
      if (feedback) {
        feedback.innerHTML = `<small>${message}</small>`;
        feedback.style.display = "block";
      }
      return false;
    }

    if (input.value.trim()) {
      input.classList.add(isValid ? "is-valid" : "is-invalid");
    }

    if (feedback) {
      feedback.style.display = isValid ? "none" : "block";
    }
    return isValid;
  }

  function validateEmail() {
    const email = emailInput.value.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      emailInput.classList.remove("is-valid", "is-invalid");
      emailInput.nextElementSibling.style.display = "none";
      return false;
    }

    return setFieldState(emailInput, emailPattern.test(email), "Please enter a valid email address.");
  }

  function validatePassword() {
    const password = passwordInput.value;
    const feedback = passwordInput.parentElement.querySelector(".invalid-feedback");

    if (!password) {
      passwordInput.classList.remove("is-valid", "is-invalid");
      if (feedback) feedback.style.display = "none";
      return false;
    }

    const isValid = password.length >= 6;
    passwordInput.classList.remove("is-valid", "is-invalid");
    passwordInput.classList.add(isValid ? "is-valid" : "is-invalid");
    if (feedback) {
      feedback.innerHTML = "<small>Password must be at least 6 characters long.</small>";
      feedback.style.display = isValid ? "none" : "block";
    }
    return isValid;
  }

  emailInput.addEventListener("input", function () {
    if (!emailInput.value.trim()) {
      clearFieldError(emailInput, emailFeedback, "Please enter a valid email address.");
      return;
    }
    validateEmail();
  });

  passwordInput.addEventListener("input", function () {
    if (!passwordInput.value) {
      clearFieldError(passwordInput, passwordFeedback, "Password must be at least 6 characters long.");
      return;
    }
    validatePassword();
  });

  togglePassword.addEventListener("click", function () {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    togglePassword.classList.toggle("fa-eye", !isPassword);
    togglePassword.classList.toggle("fa-eye-slash", isPassword);
  });

  if (emailFeedback && emailFeedback.textContent.trim() && emailFeedback.textContent.trim() !== "Please enter a valid email address.") {
    showFieldError(emailInput, emailFeedback, emailFeedback.textContent.trim());
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearFieldError(emailInput, emailFeedback, "Please enter a valid email address.");
    clearFieldError(passwordInput, passwordFeedback, "Password must be at least 6 characters long.");

    const isEmailValid = validateEmail();
    const isPasswordValid = validatePassword();
    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.message || "Unable to log in right now.";
        const normalizedMessage = message.toLowerCase();

        if (normalizedMessage.includes("password")) {
          showFieldError(passwordInput, passwordFeedback, message);
        } else {
          showFieldError(emailInput, emailFeedback, message);
        }
        return;
      }

      window.location.href = data.redirect || "/user/home";
    } catch (error) {
      showFieldError(emailInput, emailFeedback, "Unable to log in right now. Please try again.");
    } finally {
      submitButton.disabled = false;
    }
  });
});
