// Tiny wrapper around the GitHub Contents API.
// `data/state.json` in this repo is the database — we GET it on load, PUT it on save.

const OWNER = 'rnbatra';
const REPO = 'home_management';
const FILE_PATH = 'data/state.json';
const BRANCH = 'main';
const API = 'https://api.github.com';
const TOKEN_KEY = 'hm_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t.trim());
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
export function hasToken() {
  return !!getToken();
}

async function request(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`GitHub ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// base64 helpers that cope with Unicode in notes / task text.
function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(str) {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}

// Track the latest commit SHA for the file so PUT can send If-Match semantics.
let currentSha = null;

export async function loadState() {
  const data = await request(
    `/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`
  );
  currentSha = data.sha;
  return JSON.parse(b64decode(data.content));
}

async function putState(state, message) {
  const body = {
    message,
    content: b64encode(JSON.stringify(state, null, 2) + '\n'),
    branch: BRANCH,
    sha: currentSha
  };
  const res = await request(`/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  currentSha = res.content.sha;
  return res;
}

// Serialise writes: if a save is in-flight, queue the next one so we always
// send the latest state (and never race two PUTs on the same file).
let saveChain = Promise.resolve();
let pending = null;

export function saveState(state) {
  pending = state;
  saveChain = saveChain.then(async () => {
    if (!pending) return;
    const snapshot = pending;
    pending = null;
    try {
      await putState(snapshot, `Update state — ${new Date().toISOString()}`);
    } catch (e) {
      // 409 = our SHA is stale (another device edited). Refetch, then retry once.
      if (e.status === 409 || e.status === 422) {
        await loadState();
        await putState(snapshot, `Update state (after refresh) — ${new Date().toISOString()}`);
      } else {
        throw e;
      }
    }
  });
  return saveChain;
}
