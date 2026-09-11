// Splash & Squash Phase 2: RSA + AES-256 encryption
let peer = null;
let currentConn = null;
let myPeerId = null;
let currentConnectionStatus = 'disconnected';

// Crypto variables
let myKeyPair = null;        // RSA key pair for this user
let peerPublicKey = null;    // Peer's RSA public key (base64)
let handshakeComplete = false;

// DOM elements
const lockScreen = document.getElementById('lock-screen');
const mainUI = document.getElementById('main-interface');
const unlockBtn = document.getElementById('unlock-btn');
const unlockInput = document.getElementById('unlock-key');
const lockStatus = document.getElementById('lock-status');
const peerIdFooter = document.getElementById('user-footer');
const peerHeader = document.getElementById('peer-header');
const chatContainer = document.getElementById('message-container');
const chatWindow = document.getElementById('chat-window');
const textInput = document.getElementById('text');
const actionBtn = document.getElementById('action-btn');
const connectBtn = document.getElementById('connect-btn');
const peerIdInput = document.getElementById('peer-id-input');
const addContactBtn = document.getElementById('add-contact');
const conName = document.getElementById('con-name');
const conId = document.getElementById('con-id');
const contactListDiv = document.getElementById('contact-list');
const saveMyIdBtn = document.getElementById('save-my-id');
const myCustomId = document.getElementById('my-custom-id');
const lockNowBtn = document.getElementById('lock-now-btn');

let contacts = [];

// ---------- Encryption utilities ----------
async function generateRSAKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );
  return keyPair;
}

async function exportPublicKeyAsBase64(keyPair) {
  const exported = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

async function importPublicKeyFromBase64(base64Key) {
  const binary = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "spki",
    binary,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

async function encryptMessage(plaintext, recipientPublicKey) {
  // Generate a random AES-256 key
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  // Encrypt the plaintext with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );
  // Export the AES key as raw bytes
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  // Encrypt the AES key with the recipient's RSA public key
  const wrappedKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    rawAesKey
  );
  return {
    wrappedKey: btoa(String.fromCharCode(...new Uint8Array(wrappedKey))),
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  };
}

async function decryptMessage(encryptedObj, myPrivateKey) {
  // Decrypt the wrapped AES key
  const wrappedKey = Uint8Array.from(atob(encryptedObj.wrappedKey), c => c.charCodeAt(0));
  const aesKeyRaw = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    myPrivateKey,
    wrappedKey
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    aesKeyRaw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  // Decrypt the ciphertext
  const iv = Uint8Array.from(atob(encryptedObj.iv), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encryptedObj.ciphertext), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// ---------- UI helpers ----------
function appendMessage(text, type) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${type}`;
  bubble.innerText = text;
  chatContainer.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendSystemMessage(text) {
  const sys = document.createElement('div');
  sys.className = 'bubble system';
  sys.innerText = text;
  chatContainer.appendChild(sys);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderContacts(list) {
  contactListDiv.innerHTML = '';
  list.forEach((c, idx) => {
    const item = document.createElement('div');
    item.className = 'bubble sent';
    item.style.cssText = 'cursor:pointer; display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; font-size:9px;';
    const infoSpan = document.createElement('span');
    infoSpan.style.flex = '1';
    infoSpan.innerHTML = `<span>${c.name}</span> <span style="opacity:0.5">[${c.id}]</span>`;
    infoSpan.onclick = () => {
      if (currentConn && currentConn.open) currentConn.close();
      connectToPeer(c.id);
    };
    const delBtn = document.createElement('span');
    delBtn.innerText = 'erase';
    delBtn.style.cssText = 'color:var(--enemy); margin-left:8px; font-weight:bold; cursor:pointer; border:1px solid var(--enemy); padding:2px 6px; border-radius:3px;';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete ${c.name}?`)) {
        list.splice(idx, 1);
        window.radioAPI.setData('contacts', list);
        renderContacts(list);
      }
    };
    item.appendChild(infoSpan);
    item.appendChild(delBtn);
    contactListDiv.appendChild(item);
  });
}

function loadContacts() {
  window.radioAPI.getData('contacts').then(contactsData => {
    if (contactsData) contacts = contactsData;
    else contacts = [];
    renderContacts(contacts);
  });
}

function saveContacts() {
  window.radioAPI.setData('contacts', contacts);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(tabId);
  const vault = document.getElementById('main-vault');
  if (target) {
    target.style.display = 'flex';
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    if (tabId === 'override-page') {
      vault.style.borderColor = 'var(--enemy)';
      vault.style.boxShadow = '0 0 15px rgba(255,65,0,0.4), inset 0 0 10px rgba(255,65,0,0.4)';
    } else {
      vault.style.borderColor = 'var(--primary)';
      vault.style.boxShadow = '0 0 15px var(--glow), inset 0 0 10px var(--glow)';
    }
  }
}

// ---------- P2P connection with handshake ----------
async function connectToPeer(peerId) {
  if (!peer) {
    appendSystemMessage('Radio not initialized');
    return;
  }
  if (currentConn && currentConn.open) currentConn.close();
  const conn = peer.connect(peerId);
  if (conn) {
    setupConnection(conn);
    peerHeader.innerText = `PEER: ${peerId}`;
    appendSystemMessage(`Connecting to ${peerId}...`);
  } else {
    appendSystemMessage(`Failed to connect to ${peerId}`);
  }
}

async function setupConnection(conn) {
  currentConn = conn;
  handshakeComplete = false;
  peerPublicKey = null;

  conn.on('open', async () => {
    appendSystemMessage(`Connection opened with ${conn.peer}. Exchanging encryption keys...`);
    // Send our public key
    if (myKeyPair) {
      const pubBase64 = await exportPublicKeyAsBase64(myKeyPair);
      conn.send({ type: 'KEY_EXCHANGE', key: pubBase64 });
    } else {
      appendSystemMessage('Error: No encryption keys available');
    }
  });

  conn.on('data', async (data) => {
    // Handle key exchange
    if (data && data.type === 'KEY_EXCHANGE' && data.key) {
      peerPublicKey = await importPublicKeyFromBase64(data.key);
      // If we haven't sent our key yet, send it now
      if (myKeyPair && !handshakeComplete) {
        const pubBase64 = await exportPublicKeyAsBase64(myKeyPair);
        conn.send({ type: 'KEY_EXCHANGE', key: pubBase64 });
      }
      handshakeComplete = true;
      appendSystemMessage('Secure channel established (RSA + AES-256)');
      peerHeader.innerText = `PEER: ${conn.peer} [encrypted]`;
      return;
    }

    // Decrypt incoming messages
    if (handshakeComplete && myKeyPair && data && data.wrappedKey) {
      try {
        const plaintext = await decryptMessage(data, myKeyPair.privateKey);
        appendMessage(plaintext, 'received');
      } catch (e) {
        appendSystemMessage('Decryption failed: ' + e.message);
      }
    } else if (!handshakeComplete) {
      appendSystemMessage('Received data before handshake complete. Ignoring.');
    }
  });

  conn.on('close', () => {
    currentConnectionStatus = 'disconnected';
    handshakeComplete = false;
    peerPublicKey = null;
    appendSystemMessage('Connection closed');
    peerHeader.innerText = 'PEER: NONE';
    currentConn = null;
  });

  conn.on('error', (err) => {
    appendSystemMessage(`Connection error: ${err}`);
  });
}

// ---------- PeerJS initialization ----------
async function initPeer(customId) {
  if (peer) peer.destroy();
  peer = new Peer(customId || undefined, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    }
  });
  peer.on('open', (id) => {
    myPeerId = id;
    peerIdFooter.innerText = `ID: ${id.substring(0,12)}...`;
    appendSystemMessage(`Radio ready. Your ID: ${id}`);
  });
  peer.on('connection', (conn) => {
    if (currentConn && currentConn.open) currentConn.close();
    setupConnection(conn);
    appendSystemMessage(`Incoming connection from ${conn.peer}`);
  });
  peer.on('error', (err) => {
    appendSystemMessage(`Peer error: ${err.type || err}`);
  });
  peer.on('disconnected', () => {
    appendSystemMessage('Disconnected from signaling server, reconnecting...');
    setTimeout(() => peer.reconnect(), 3000);
  });
}

// ---------- Vault unlock & key generation ----------
unlockBtn.onclick = async () => {
  const pwd = unlockInput.value;
  if (!pwd) return;
  const result = await window.radioAPI.unlockVault(pwd);
  if (result.success) {
    lockScreen.style.display = 'none';
    mainUI.style.display = 'flex';

    // Generate RSA key pair (this happens after vault unlock)
    appendSystemMessage('Generating encryption keys...');
    myKeyPair = await generateRSAKeyPair();
    appendSystemMessage('Encryption keys ready.');

    // Load stored peer ID
    const storedId = await window.radioAPI.getData('myPeerId');
    if (storedId) {
      initPeer(storedId);
    } else {
      initPeer();
    }
    loadContacts();

    window.radioAPI.onVaultLocked(() => {
      location.reload();
    });
    window.radioAPI.onSystemResume(() => {
      if (peer && peer.disconnected) peer.reconnect();
    });
  } else {
    lockStatus.innerText = 'ACCESS DENIED';
    unlockInput.value = '';
    setTimeout(() => { lockStatus.innerText = 'VAULT LOCKED'; }, 1500);
  }
};

// ---------- Send message (encrypt before sending) ----------
actionBtn.onclick = async () => {
  const msg = textInput.value.trim();
  if (!msg) return;
  if (currentConn && currentConn.open && handshakeComplete && peerPublicKey) {
    try {
      const encrypted = await encryptMessage(msg, peerPublicKey);
      currentConn.send(encrypted);
      appendMessage(msg, 'sent');
      textInput.value = '';
    } catch (e) {
      appendSystemMessage('Encryption failed: ' + e.message);
    }
  } else {
    appendSystemMessage('No secure connection. Wait for handshake to complete.');
  }
};

// ---------- UI event listeners ----------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => switchTab(btn.getAttribute('data-tab'));
});

connectBtn.onclick = () => {
  const pid = peerIdInput.value.trim();
  if (pid) connectToPeer(pid);
};

addContactBtn.onclick = () => {
  const name = conName.value.trim();
  const id = conId.value.trim();
  if (!name || !id) return;
  contacts.push({ name, id });
  window.radioAPI.setData('contacts', contacts);
  renderContacts(contacts);
  conName.value = '';
  conId.value = '';
};

saveMyIdBtn.onclick = async () => {
  const newId = myCustomId.value.trim();
  if (newId) {
    await window.radioAPI.setData('myPeerId', newId);
    appendSystemMessage('Custom ID saved. Restarting radio...');
    if (peer) peer.destroy();
    initPeer(newId);
  }
};

lockNowBtn.onclick = async () => {
  await window.radioAPI.lockVault();
  location.reload();
};

document.getElementById('factory-reset').onclick = () => {
  if (confirm('ERASE ALL VAULT DATA? This will reset the app.')) {
    window.radioAPI.setData('masterKey', null);
    window.radioAPI.setData('myPeerId', null);
    window.radioAPI.setData('contacts', null);
    location.reload();
  }
};

// Check if vault is already unlocked (from previous session)
window.radioAPI.getVaultStatus().then(async (status) => {
  if (status.unlocked) {
    lockScreen.style.display = 'none';
    mainUI.style.display = 'flex';
    // Generate keys if not already (should be fine, but we need to import them)
    // In a real app you would persist the key pair, but for simplicity we regenerate.
    myKeyPair = await generateRSAKeyPair();
    const storedId = await window.radioAPI.getData('myPeerId');
    if (storedId) initPeer(storedId);
    else initPeer();
    loadContacts();
  }
});
