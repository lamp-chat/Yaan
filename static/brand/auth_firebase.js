import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const cfg = window.__FIREBASE_CONFIG__ || {};

const tabSignIn = document.getElementById("tabSignIn");
const tabSignUp = document.getElementById("tabSignUp");
const tabMagic = document.getElementById("tabMagic");
const tabPhone = document.getElementById("tabPhone");
const paneSignIn = document.getElementById("paneSignIn");
const paneSignUp = document.getElementById("paneSignUp");
const paneMagic = document.getElementById("paneMagic");
const panePhone = document.getElementById("panePhone");

const googleBtn = document.getElementById("googleBtn");
const googleBtn2 = document.getElementById("googleBtn2");
const anonBtn = document.getElementById("anonBtn");
const signInBtn = document.getElementById("signInBtn");
const signUpBtn = document.getElementById("signUpBtn");
const magicLinkBtn = document.getElementById("magicLinkBtn");
const phoneSendBtn = document.getElementById("phoneSendBtn");
const phoneVerifyBtn = document.getElementById("phoneVerifyBtn");

const emailIn = document.getElementById("emailIn");
const pwIn = document.getElementById("pwIn");
const pwInToggle = document.getElementById("pwInToggle");
const emailUp = document.getElementById("emailUp");
const nickUp = document.getElementById("nickUp");
const pwUp = document.getElementById("pwUp");
const pwUp2 = document.getElementById("pwUp2");
const pwUpToggle = document.getElementById("pwUpToggle");
const emailMagic = document.getElementById("emailMagic");
const phoneNumber = document.getElementById("phoneNumber");
const phoneCode = document.getElementById("phoneCode");
const recaptchaContainer = document.getElementById("recaptcha-container");

function setDisabled(v) {
  [
    tabSignIn, tabSignUp, tabMagic, tabPhone,
    googleBtn, googleBtn2, anonBtn, signInBtn, signUpBtn, magicLinkBtn, phoneSendBtn, phoneVerifyBtn,
    emailIn, pwIn, pwInToggle,
    nickUp, emailUp, pwUp, pwUp2, pwUpToggle,
    emailMagic, phoneNumber, phoneCode,
  ].forEach((el) => { if (el) el.disabled = !!v; });
}

function showNotice(msg, kind) {
  const host = document.getElementById("flash");
  const div = document.createElement("div");
  const k = (kind === "ok") ? "ok" : "err";
  div.className = "notice " + k;
  div.textContent = msg || ((k === "ok") ? "OK" : "Error");
  if (host) host.prepend(div);
  else document.body.prepend(div);
  setTimeout(() => { try { div.remove(); } catch (e) {} }, 9000);
}

function showErr(msg) { showNotice(msg, "err"); }
function showOk(msg) { showNotice(msg, "ok"); }

function postSession(idToken, nickname) {
  return fetch("/firebase/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ idToken: idToken, nickname: nickname || "" }),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const parts = [];
      parts.push((data && data.error) ? String(data.error) : "Session login failed");
      if (data && data.details) parts.push(String(data.details));
      if (data && data.uid) parts.push("uid=" + String(data.uid));
      throw new Error(parts.join(" | "));
    }
    window.location.href = "/app";
  });
}

function normalizeEmail(s) {
  return (s || "").trim().toLowerCase();
}

function friendlyAuthError(e) {
  const code = (e && e.code) ? String(e.code) : "";
  if (code === "app/missing-email") return "Your Firebase account has no email. Delete the Firebase user and sign in again with Google or Email/Password.";
  if (code === "auth/invalid-continue-uri") return "Magic link redirect URL is invalid. Check Authorized domains in Firebase Console and use http://localhost or http://127.0.0.1.";
  if (code === "auth/unauthorized-continue-uri") return "Magic link redirect URL is not authorized. Add this domain under Firebase Console -> Authentication -> Settings -> Authorized domains.";
  if (code === "auth/operation-not-supported-in-this-environment") return "This sign-in method is blocked in this browser context. Try opening the site normally (not inside an embedded webview) or use a different browser.";
  if (code === "auth/invalid-phone-number") return "Invalid phone number. Use international format, e.g. +15551234567.";
  if (code === "auth/invalid-verification-code") return "Wrong code. Please try again.";
  if (code === "auth/missing-verification-code") return "Enter the SMS code.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a bit and try again.";
  if (code === "auth/captcha-check-failed") return "reCAPTCHA failed. Refresh the page and try again.";
  if (code === "auth/invalid-email") return "Please enter a valid email address.";
  if (code === "auth/missing-password") return "Please enter a password.";
  if (code === "auth/weak-password") return "Password is too weak. Use at least 6 characters.";
  if (code === "auth/email-already-in-use") return "This email is already registered. Use the Sign in tab.";
  if (code === "auth/wrong-password") return "Wrong password.";
  if (code === "auth/user-not-found") return "No account found for this email. Switch to the Sign up tab.";
  if (code === "auth/invalid-action-code") return "Invalid or expired magic link. Request a new one.";
  if (code === "auth/operation-not-allowed") return "Provider not enabled in Firebase Console (Authentication -> Sign-in method).";
  if (code === "auth/popup-blocked") return "Popup blocked. Allow popups and try again.";
  if (code === "auth/unauthorized-domain") return "This domain is not authorized in Firebase (Authentication -> Settings -> Authorized domains).";
  return (e && e.message) ? e.message : "Authentication failed.";
}

function setTabSelected(tabEl, selected) {
  if (!tabEl) return;
  tabEl.setAttribute("aria-selected", selected ? "true" : "false");
}

function showPane(paneEl) {
  [paneSignIn, paneSignUp, paneMagic, panePhone].forEach((p) => {
    if (!p) return;
    if (p === paneEl) {
      p.removeAttribute("hidden");
      try {
        p.classList.remove("enter");
        void p.offsetWidth; // restart animation
        p.classList.add("enter");
      } catch (e) {}
    } else {
      p.setAttribute("hidden", "hidden");
    }
  });
}

function syncEmails(primary) {
  const v = normalizeEmail(primary || "");
  if (!v) return;
  if (emailIn && normalizeEmail(emailIn.value) !== v) emailIn.value = v;
  if (emailUp && normalizeEmail(emailUp.value) !== v) emailUp.value = v;
  if (emailMagic && normalizeEmail(emailMagic.value) !== v) emailMagic.value = v;
}

function activate(which) {
  const current = normalizeEmail(
    (emailIn && emailIn.value) ||
    (emailUp && emailUp.value) ||
    (emailMagic && emailMagic.value) ||
    ""
  );
  syncEmails(current);

  if (which === "signin") {
    setTabSelected(tabSignIn, true);
    setTabSelected(tabSignUp, false);
    setTabSelected(tabMagic, false);
    setTabSelected(tabPhone, false);
    showPane(paneSignIn);
    try { (pwIn || emailIn).focus(); } catch (e) {}
    return;
  }
  if (which === "signup") {
    setTabSelected(tabSignIn, false);
    setTabSelected(tabSignUp, true);
    setTabSelected(tabMagic, false);
    setTabSelected(tabPhone, false);
    showPane(paneSignUp);
    try { (emailUp || pwUp).focus(); } catch (e) {}
    return;
  }
  if (which === "magic") {
    setTabSelected(tabSignIn, false);
    setTabSelected(tabSignUp, false);
    setTabSelected(tabMagic, true);
    setTabSelected(tabPhone, false);
    showPane(paneMagic);
    try { (emailMagic).focus(); } catch (e) {}
    return;
  }
  if (which === "phone") {
    setTabSelected(tabSignIn, false);
    setTabSelected(tabSignUp, false);
    setTabSelected(tabMagic, false);
    setTabSelected(tabPhone, true);
    showPane(panePhone);
    try { (phoneNumber).focus(); } catch (e) {}
  }
}

function togglePw(inputEl, btnEl) {
  if (!inputEl || !btnEl) return;
  const isPw = inputEl.type === "password";
  inputEl.type = isPw ? "text" : "password";
  const t = (k) => {
    try {
      if (window.__yaanAuthI18n && window.__yaanAuthI18n.t) return window.__yaanAuthI18n.t(k);
    } catch (e) {}
    return k === "hide" ? "Hide" : "Show";
  };
  btnEl.textContent = isPw ? t("hide") : t("show");
}

if (pwInToggle) pwInToggle.addEventListener("click", () => togglePw(pwIn, pwInToggle));
if (pwUpToggle) pwUpToggle.addEventListener("click", () => togglePw(pwUp, pwUpToggle));

[tabSignIn, tabSignUp, tabMagic, tabPhone].forEach((t) => {
  if (!t) return;
  t.addEventListener("click", () => {
    const id = t.id || "";
    if (id === "tabSignIn") activate("signin");
    if (id === "tabSignUp") activate("signup");
    if (id === "tabMagic") activate("magic");
    if (id === "tabPhone") activate("phone");
  });
});

let app = null;
let auth = null;
try {
  app = getApps().length ? getApp() : initializeApp(cfg);
  auth = getAuth(app);
} catch (e) {
  showErr("Could not initialize Firebase app. Check your Firebase web config.");
}

// Start login screen from a clean auth state to avoid stale anonymous users.
if (auth) {
  try { await signOut(auth); } catch (e) {}
}

async function googleLogin() {
  if (!auth) return showErr("Firebase auth is not ready.");
  setDisabled(true);
  try {
    const provider = new GoogleAuthProvider();
    try { provider.addScope("email"); } catch (e) {}
    const cred = await signInWithPopup(auth, provider);
    const email = (cred && cred.user && cred.user.email) ? String(cred.user.email) : "";
    if (!email) throw ({ code: "app/missing-email", message: "Missing email on Firebase user." });
    const idToken = await cred.user.getIdToken(true);
    await postSession(idToken, "");
  } catch (e) {
    showErr(friendlyAuthError(e));
  } finally {
    setDisabled(false);
  }
}

async function guestLogin() {
  if (!auth) return showErr("Firebase auth is not ready.");
  setDisabled(true);
  try {
    const cred = await signInAnonymously(auth);
    const idToken = await cred.user.getIdToken(true);
    await postSession(idToken, "");
  } catch (e) {
    showErr(friendlyAuthError(e));
  } finally {
    setDisabled(false);
  }
}

async function signInEmail() {
  if (!auth) return showErr("Firebase auth is not ready.");
  const email = normalizeEmail(emailIn && emailIn.value);
  const pw = String((pwIn && pwIn.value) || "");
  if (!email) { showErr("Enter your email."); return; }
  if (!pw) { showErr("Enter your password."); return; }
  setDisabled(true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pw);
    const em = (cred && cred.user && cred.user.email) ? String(cred.user.email) : "";
    if (!em) throw ({ code: "app/missing-email", message: "Missing email on Firebase user." });
    const idToken = await cred.user.getIdToken(true);
    await postSession(idToken, "");
  } catch (e) {
    showErr(friendlyAuthError(e));
  } finally {
    setDisabled(false);
  }
}

async function signUpEmail() {
  if (!auth) return showErr("Firebase auth is not ready.");
  const email = normalizeEmail(emailUp && emailUp.value);
  const nickname = String((nickUp && nickUp.value) || "").trim();
  const pwA = String((pwUp && pwUp.value) || "");
  const pwB = String((pwUp2 && pwUp2.value) || "");
  if (!nickname || nickname.length < 3) { showErr("Enter a nickname (min 3 chars)."); return; }
  if (!email) { showErr("Enter your email."); return; }
  if (!pwA) { showErr("Enter a password."); return; }
  if (pwA !== pwB) { showErr("Passwords do not match."); return; }
  setDisabled(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pwA);
    const em = (cred && cred.user && cred.user.email) ? String(cred.user.email) : "";
    if (!em) throw ({ code: "app/missing-email", message: "Missing email on Firebase user." });
    try { await updateProfile(cred.user, { displayName: nickname }); } catch (e) {}
    const idToken = await cred.user.getIdToken(true);
    await postSession(idToken, nickname);
  } catch (e) {
    showErr(friendlyAuthError(e));
  } finally {
    setDisabled(false);
  }
}

async function sendMagicLink() {
  if (!auth) return showErr("Firebase auth is not ready.");
  const email = normalizeEmail(emailMagic && emailMagic.value);
  if (!email) { showErr("Enter your email."); return; }
  setDisabled(true);
  try {
    const settings = { url: window.location.origin + "/auth", handleCodeInApp: true };
    await sendSignInLinkToEmail(auth, email, settings);
    try { localStorage.setItem("emailForSignIn", email); } catch (e) {}
    showOk("Magic link sent. Check your email and open the link on this device.");
  } catch (e) {
    showErr(friendlyAuthError(e));
  } finally {
    setDisabled(false);
  }
}

let confirmationResult = null;
async function sendPhoneCode() {
  if (!auth) return showErr("Firebase auth is not ready.");
  const num = String((phoneNumber && phoneNumber.value) || "").trim();
  if (!num) { showErr("Enter your phone number."); return; }
  setDisabled(true);
  try {
    const verifier = new RecaptchaVerifier(auth, recaptchaContainer, { size: "normal" });
    confirmationResult = await signInWithPhoneNumber(auth, num, verifier);
    showOk("Code sent. Check your SMS.");
  } catch (e) {
    showErr(friendlyAuthError(e));
  } finally {
    setDisabled(false);
  }
}

async function verifyPhoneCode() {
  if (!confirmationResult) return showErr("Send a code first.");
  const code = String((phoneCode && phoneCode.value) || "").trim();
  if (!code) return showErr("Enter the SMS code.");
  setDisabled(true);
  try {
    const cred = await confirmationResult.confirm(code);
    const idToken = await cred.user.getIdToken(true);
    await postSession(idToken, "");
  } catch (e) {
    showErr(friendlyAuthError(e));
  } finally {
    setDisabled(false);
  }
}

if (googleBtn) googleBtn.addEventListener("click", googleLogin);
if (googleBtn2) googleBtn2.addEventListener("click", googleLogin);
if (anonBtn) anonBtn.addEventListener("click", guestLogin);
if (signInBtn) signInBtn.addEventListener("click", signInEmail);
if (signUpBtn) signUpBtn.addEventListener("click", signUpEmail);
if (magicLinkBtn) magicLinkBtn.addEventListener("click", sendMagicLink);
if (phoneSendBtn) phoneSendBtn.addEventListener("click", sendPhoneCode);
if (phoneVerifyBtn) phoneVerifyBtn.addEventListener("click", verifyPhoneCode);

// Enter to submit in relevant inputs
[[emailIn, pwIn], [nickUp, emailUp, pwUp2], [emailMagic], [phoneNumber, phoneCode]].forEach((pair) => {
  pair.forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      if (el === pwIn) return signInEmail();
      if (el === pwUp2) return signUpEmail();
      if (el === emailMagic) return sendMagicLink();
      if (el === phoneCode) return verifyPhoneCode();
    });
  });
});

// Complete email-link sign-in if URL contains the sign-in code.
if (auth) {
  try {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = "";
      try { email = (localStorage.getItem("emailForSignIn") || ""); } catch (e) { email = ""; }
      email = normalizeEmail(email);
      if (!email) email = normalizeEmail(prompt("Confirm your email to finish sign-in:") || "");
      if (email) {
        syncEmails(email);
        setDisabled(true);
        signInWithEmailLink(auth, email, window.location.href)
          .then(async (cred) => {
            try { localStorage.removeItem("emailForSignIn"); } catch (e) {}
            const em = (cred && cred.user && cred.user.email) ? String(cred.user.email) : "";
            if (!em) throw ({ code: "app/missing-email", message: "Missing email on Firebase user." });
            const idToken = await cred.user.getIdToken(true);
            await postSession(idToken, "");
          })
          .catch((e) => showErr(friendlyAuthError(e)))
          .finally(() => setDisabled(false));
      }
    }
  } catch (e) {}
}

activate("signin");
