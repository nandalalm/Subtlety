document.addEventListener("DOMContentLoaded", function () {
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");

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
  function validatePassword() {
    var password = passwordInput.value;
    var togglePassword = document.getElementById("togglePassword");
    if (password === "") {
      passwordInput.classList.remove("is-invalid", "is-valid");
      passwordInput.nextElementSibling.style.display = "none";
    } else if (password.length < 6) {
      passwordInput.classList.add("is-invalid");
      passwordInput.classList.remove("is-valid");
      passwordInput.nextElementSibling.style.display = "block";
      if (flag === true) {
        togglePassword.style.marginTop = "0px";
      }
    } else {
      passwordInput.classList.remove("is-invalid");
      passwordInput.classList.add("is-valid");
      togglePassword.style.marginTop = "10px";
      flag = true;
    }
  }
  emailInput.addEventListener("input", function () {
    validateEmail();
  });
  passwordInput.addEventListener("input", function () {
    validatePassword();
  });

  togglePassword.addEventListener("click", function () {
    // Toggle the type attribute
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      togglePassword.classList.remove("fa-eye");
      togglePassword.classList.add("fa-eye-slash");
    } else {
      passwordInput.type = "password";
      togglePassword.classList.remove("fa-eye-slash");
      togglePassword.classList.add("fa-eye");
    }
  });

  document
    .getElementById("loginForm")
    .addEventListener("submit", function (event) {
      var email = emailInput.value;
      var password = passwordInput.value;

      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email) || password.length < 6) {
        event.preventDefault();
      }
    });
  // Initialize validation on load to handle case when fields have default values
  validateEmail();
  validatePassword();
});
