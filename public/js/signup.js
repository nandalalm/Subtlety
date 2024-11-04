document.addEventListener("DOMContentLoaded", function () {
  var firstnameInput = document.getElementById("firstname");
  var lastnameInput = document.getElementById("lastname");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");
  var confirmPasswordInput = document.getElementById("confirmPassword");
  var togglePassword = document.getElementById("togglePassword");
  var toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

  function validateFirstName() {
    var name = firstnameInput.value;
    if (name === "") {
      firstnameInput.classList.remove("is-invalid", "is-valid");
      firstnameInput.nextElementSibling.style.display = "none";
    } else if (name.length < 3) {
      firstnameInput.classList.add("is-invalid");
      firstnameInput.classList.remove("is-valid");
      firstnameInput.nextElementSibling.style.display = "block";
    } else {
      firstnameInput.classList.remove("is-invalid");
      firstnameInput.classList.add("is-valid");
      firstnameInput.nextElementSibling.style.display = "none";
    }
  }

  function validateLastName() {
    var name = lastnameInput.value;
    if (name === "") {
      lastnameInput.classList.remove("is-invalid", "is-valid");
      lastnameInput.nextElementSibling.style.display = "none";
    } else if (name.length < 1) {
      lastnameInput.classList.add("is-invalid");
      lastnameInput.classList.remove("is-valid");
      lastnameInput.nextElementSibling.style.display = "block";
    } else {
      lastnameInput.classList.remove("is-invalid");
      lastnameInput.classList.add("is-valid");
      lastnameInput.nextElementSibling.style.display = "none";
    }
  }

  function validateEmail() {
    var email = emailInput.value;
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email === "") {
      emailInput.classList.remove("is-invalid", "is-valid");
      emailInput.nextElementSibling.style.display = "none";
    } else if (!emailPattern.test(email)) {
      emailInput.classList.add("is-invalid");
      emailInput.classList.remove("is-valid");
      emailInput.nextElementSibling.style.display = "block";
    } else {
      emailInput.classList.remove("is-invalid");
      emailInput.classList.add("is-valid");
      emailInput.nextElementSibling.style.display = "none";
    }
  }

  function updateTogglePosition(isValid, toggleButton) {
    toggleButton.style.marginTop = isValid ? "10px" : "0px";
  }

  function validatePassword() {
    var password = passwordInput.value;
    var isValid = password.length >= 6;

    if (password === "") {
      passwordInput.classList.remove("is-invalid", "is-valid");
      passwordInput.nextElementSibling.style.display = "none";
      updateTogglePosition(false, togglePassword);
    } else if (!isValid) {
      passwordInput.classList.add("is-invalid");
      passwordInput.classList.remove("is-valid");
      passwordInput.nextElementSibling.style.display = "block";
      updateTogglePosition(false, togglePassword);
    } else {
      passwordInput.classList.remove("is-invalid");
      passwordInput.classList.add("is-valid");
      passwordInput.nextElementSibling.style.display = "none";
      updateTogglePosition(true, togglePassword);
    }
  }

  function isPasswordMatch() {
    var password = passwordInput.value;
    var confirmPassword = confirmPasswordInput.value;
    var isValid = confirmPassword === password && confirmPassword !== "";

    if (confirmPassword === "") {
      confirmPasswordInput.classList.remove("is-invalid", "is-valid");
      confirmPasswordInput.nextElementSibling.style.display = "none";
      updateTogglePosition(false, toggleConfirmPassword);
    } else if (!isValid) {
      confirmPasswordInput.classList.add("is-invalid");
      confirmPasswordInput.classList.remove("is-valid");
      confirmPasswordInput.nextElementSibling.style.display = "block";
      updateTogglePosition(false, toggleConfirmPassword);
    } else {
      confirmPasswordInput.classList.remove("is-invalid");
      confirmPasswordInput.classList.add("is-valid");
      confirmPasswordInput.nextElementSibling.style.display = "none";
      updateTogglePosition(true, toggleConfirmPassword);
    }
  }

  function togglePasswordVisibility(input, icon) {
    if (input.type === "password") {
      input.type = "text";
      icon.classList.remove("fa-eye");
      icon.classList.add("fa-eye-slash");
    } else {
      input.type = "password";
      icon.classList.remove("fa-eye-slash");
      icon.classList.add("fa-eye");
    }
  }

  function updateEyeIconVisibility() {
    if (passwordInput.value.length > 0) {
      togglePassword.style.display = "block";
    } else {
      togglePassword.style.display = "none";
    }

    if (confirmPasswordInput.value.length > 0) {
      toggleConfirmPassword.style.display = "block";
    } else {
      toggleConfirmPassword.style.display = "none";
    }
  }

  // Attach event listeners
  firstnameInput.addEventListener("input", validateFirstName);
  lastnameInput.addEventListener("input", validateLastName);
  emailInput.addEventListener("input", validateEmail);
  passwordInput.addEventListener("input", function () {
    validatePassword();
    updateEyeIconVisibility();
  });
  confirmPasswordInput.addEventListener("input", function () {
    isPasswordMatch();
    updateEyeIconVisibility();
  });

  document
    .getElementById("signupForm")
    .addEventListener("submit", function (event) {
      var name = firstnameInput.value + lastnameInput.value;
      var email = emailInput.value;
      var password = passwordInput.value;
      var confirmPassword = confirmPasswordInput.value;

      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (
        !emailPattern.test(email) ||
        password.length < 6 ||
        name.length < 5 ||
        confirmPassword !== password
      ) {
        event.preventDefault();
      }
    });

  // Attach password visibility toggle functionality
  togglePassword.addEventListener("click", function () {
    togglePasswordVisibility(passwordInput, togglePassword);
  });

  toggleConfirmPassword.addEventListener("click", function () {
    togglePasswordVisibility(confirmPasswordInput, toggleConfirmPassword);
  });

  window.onload = function () {
    google.accounts.id.initialize({
      client_id:
        "669675691251-65vog03j0sf3bj3f1d9jm6ios9p315ph.apps.googleusercontent.com",
      callback: handleCredentialResponse,
    });
    google.accounts.id.renderButton(document.getElementById("googleSignIn"), {
      theme: "outline",
      size: "large",
    });
  };

  // Initialize validation and icon visibility
  validateFirstName();
  validateLastName();
  validateEmail();
  validatePassword();
  isPasswordMatch();
  updateEyeIconVisibility();
});
