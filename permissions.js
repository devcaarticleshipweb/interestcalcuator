const PAGE_PERMISSIONS = {
  "home.html": "canViewHome",
  "home": "canViewHome",
  "summary.html": "canViewSummary",
  "summary": "canViewSummary",
  "entry.html": "canAddLoan",
  "entry": "canAddLoan",
  "data.html": "canViewData",
  "data": "canViewData",
  "change-password.html": "canChangePassword",
  "change-password": "canChangePassword"
};

const NAV_PERMISSION_BY_HREF = {
  "home.html": "canViewHome",
  "summary.html": "canViewSummary",
  "entry.html": "canAddLoan",
  "data.html": "canViewData",
  "change-password.html": "canChangePassword"
};

document.documentElement.classList.add("permissions-loading");
void initializePermissions();

async function initializePermissions() {
  const session = getPermissionSession();
  if (!session) {
    document.documentElement.classList.remove("permissions-loading");
    return;
  }

  try {
    const freshPermissions = await loadFreshPermissions(session);
    if (!freshPermissions || !Object.keys(freshPermissions).length) {
      throw new Error("Permissions unavailable.");
    }

    session.permissions = freshPermissions;
    localStorage.setItem("lendingUserSession", JSON.stringify(session));
    applyPagePermissions(session);
  } catch {
    if (!session.permissions || !Object.keys(session.permissions).length) {
      localStorage.removeItem("lendingUserSession");
      window.location.href = "index.html";
      return;
    }

    applyPagePermissions(session);
  } finally {
    document.documentElement.classList.remove("permissions-loading");
  }
}

function applyPagePermissions(session) {
  document.querySelectorAll(".sidebar-nav a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    const permission = NAV_PERMISSION_BY_HREF[href];
    const shouldHide = Boolean(permission && !hasPermission(session, permission));
    link.classList.toggle("hidden", shouldHide);
    link.hidden = shouldHide;
    link.style.display = shouldHide ? "none" : "";
  });

  const pageName = getCurrentPageName();
  const requiredPermission = PAGE_PERMISSIONS[pageName];
  if (requiredPermission && !hasPermission(session, requiredPermission)) {
    const fallback = getFirstAllowedPage(session);
    window.location.href = fallback || "index.html";
  }
}

function loadFreshPermissions(session) {
  return new Promise((resolve, reject) => {
    const scriptUrl = window.APP_CONFIG?.googleScriptUrl || "";
    const username = session.loginId || session.username || "";

    if (!scriptUrl || !username) {
      resolve(null);
      return;
    }

    const callbackName = `permissionsCallback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const script = document.createElement("script");
    const url = new URL(scriptUrl);

    url.searchParams.set("action", "permissions");
    url.searchParams.set("username", username);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", String(Date.now()));

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Permissions request timed out."));
    }, 10000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      cleanup();

      if (!payload || !payload.success || !payload.permissions) {
        reject(new Error(payload?.message || "Permissions unavailable."));
        return;
      }

      resolve(payload.permissions);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Could not load permissions."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function getCurrentPageName() {
  const pageName = window.location.pathname.split("/").pop() || "home.html";
  return pageName.toLowerCase();
}

function getFirstAllowedPage(session) {
  return Object.entries(NAV_PERMISSION_BY_HREF)
    .find(([, permission]) => hasPermission(session, permission))?.[0] || "";
}

function hasPermission(session, permission) {
  const permissions = session.permissions || {};
  if (!(permission in permissions)) {
    return true;
  }

  return parsePermissionValue(permissions[permission]);
}

function parsePermissionValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return ["true", "tru", "1"].includes(normalized);
}

function getPermissionSession() {
  const rawSession = localStorage.getItem("lendingUserSession");
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession);
  } catch {
    return { username: rawSession, loginId: rawSession, permissions: {} };
  }
}
