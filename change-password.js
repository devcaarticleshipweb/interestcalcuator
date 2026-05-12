const SESSION_KEY = "lendingUserSession";
const GOOGLE_SCRIPT_URL = window.APP_CONFIG?.googleScriptUrl || "";

const logoutButtons = document.querySelectorAll("[data-logout]");
const sidebarUsername = document.getElementById("sidebarUsername");
const changePasswordForm = document.getElementById("changePasswordForm");
const oldPasswordField = document.getElementById("oldPasswordField");
const newPasswordField = document.getElementById("newPasswordField");
const confirmPasswordField = document.getElementById("confirmPasswordField");
const changePasswordButton = document.getElementById("changePasswordButton");
const changePasswordNote = document.getElementById("changePasswordNote");

const session = getSession();

if (!session) {
  window.location.href = "index.html";
}

if (session) {
  sidebarUsername.textContent = session.fullName || getUsername(session.username || session.email || "User");
}

logoutButtons.forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "index.html";
  });
});

changePasswordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void changePassword();
});

async function changePassword() {
  const username = session.loginId || getUsername(session.username || session.email || "");
  const oldPassword = oldPasswordField.value;
  const newPassword = newPasswordField.value;
  const confirmPassword = confirmPasswordField.value;

  if (!GOOGLE_SCRIPT_URL) {
    setChangePasswordNote("Add your Google Apps Script web app URL in config.js before changing passwords.", "is-error");
    return;
  }

  if (!oldPassword || !newPassword || !confirmPassword) {
    setChangePasswordNote("Enter old password, new password, and confirm password.", "is-error");
    return;
  }

  if (newPassword !== confirmPassword) {
    setChangePasswordNote("New password and confirm password do not match.", "is-error");
    confirmPasswordField.focus();
    return;
  }

  if (newPassword === oldPassword) {
    setChangePasswordNote("New password must be different from old password.", "is-error");
    newPasswordField.focus();
    return;
  }

  changePasswordButton.disabled = true;
  changePasswordButton.textContent = "Updating...";
  setChangePasswordNote("Updating your password...", "");

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "changePassword",
        username,
        email: username,
        oldPassword,
        newPassword
      })
    });

    if (!response.ok) {
      throw new Error("Unable to reach the password service.");
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || "Password could not be changed.");
    }

    changePasswordForm.reset();
    setChangePasswordNote("Password changed successfully.", "is-success");
  } catch (error) {
    setChangePasswordNote(error.message || "Password could not be changed.", "is-error");
  } finally {
    changePasswordButton.disabled = false;
    changePasswordButton.textContent = "Update Password";
  }
}

function setChangePasswordNote(message, state = "") {
  changePasswordNote.textContent = message;
  changePasswordNote.classList.remove("is-error", "is-success");

  if (state) {
    changePasswordNote.classList.add(state);
  }
}

function getSession() {
  const rawSession = localStorage.getItem(SESSION_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession);
  } catch {
    return { email: rawSession, username: getUsername(rawSession) };
  }
}

function getUsername(value) {
  const rawValue = String(value || "").trim();
  return rawValue.includes("@") ? rawValue.split("@")[0] : rawValue;
}
