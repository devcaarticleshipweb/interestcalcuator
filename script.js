const form = document.getElementById("loginForm");
const passwordField = document.getElementById("passwordField");
const togglePassword = document.getElementById("togglePassword");
const formNote = document.getElementById("formNote");
const submitButton = document.getElementById("submitButton");
const SESSION_KEY = "lendingUserSession";

const GOOGLE_SCRIPT_URL = window.APP_CONFIG?.googleScriptUrl || "";

function setFormNote(message, state = "") {
  formNote.textContent = message;
  formNote.classList.remove("is-error", "is-success");

  if (state) {
    formNote.classList.add(state);
  }
}

togglePassword.addEventListener("click", () => {
  const nextType = passwordField.type === "password" ? "text" : "password";
  passwordField.type = nextType;
  togglePassword.textContent = nextType === "password" ? "Show" : "Hide";
  togglePassword.setAttribute(
    "aria-label",
    nextType === "password" ? "Show password" : "Hide password"
  );
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleLogin();
});

async function handleLogin() {
  const formData = new FormData(form);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
    setFormNote("Add your Google Apps Script web app URL in config.js before testing login.", "is-error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Checking...";
  setFormNote("Validating your login details...", "");

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({ username, email: username, password })
    });

    if (!response.ok) {
      throw new Error("Unable to reach the login service.");
    }

    const result = await response.json();

    if (result.success) {
      const session = {
        username: getUsername(String(result.username || username).trim()),
        fullName: String(result.fullName || result.username || username).trim(),
        loginId: String(result.loginId || username).trim(),
        permissions: result.permissions || {}
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setFormNote("Login successful. Redirecting to the home page...", "is-success");
      window.setTimeout(() => {
        window.location.href = "home.html";
      }, 700);
      return;
    }

    setFormNote(result.message || "Invalid username or password.", "is-error");
  } catch (error) {
    setFormNote(error.message || "Login validation failed.", "is-error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Log in";
  }
}

function getUsername(value) {
  const rawValue = String(value || "").trim();
  return rawValue.includes("@") ? rawValue.split("@")[0] : rawValue;
}
