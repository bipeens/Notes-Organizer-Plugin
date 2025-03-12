let selectedText = '';

// Listen for selected text from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TEXT_SELECTED') {
    const textArea = document.getElementById('selectedText');
    textArea.value = message.text;
    selectedText = message.text;
  }
});

// Encryption helper functions
const encryptToken = async (token) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const key = await generateKey();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(12) },
    key,
    data
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
};

const decryptToken = async (encryptedToken) => {
  try {
    const key = await generateKey();
    const data = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(12) },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed');
    return null;
  }
};

const generateKey = async () => {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("github-notes-organizer"),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("static-salt"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

// UI State Management
let githubToken = '';
let settings = {
  repoOwner: '',
  repoName: '',
  rememberMe: true
};

// Add these variables at the top with other state variables
let screenshotData = null;
let screenshotFilename = null;
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 20;
let yOffset = 20;
let uploadedImages = [];

// Initialize UI
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.querySelector('.container');
  const dragHandle = document.querySelector('.drag-handle');
  
  // Set initial position
  container.style.left = xOffset + 'px';
  container.style.top = yOffset + 'px';

  // Dragging functionality
  dragHandle.addEventListener('mousedown', startDragging);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', stopDragging);

  // Close button functionality
  document.getElementById('closeButton').addEventListener('click', () => {
    window.close();
  });

  // Screenshot button functionality
  document.getElementById('screenshotButton').addEventListener('click', captureScreenshot);
  
  // Remove screenshot functionality
  document.getElementById('removeScreenshot').addEventListener('click', () => {
    screenshotData = null;
    screenshotFilename = null;
    document.getElementById('screenshotPreview').classList.add('hidden');
  });

  const toggleBtn = document.getElementById('toggleSettings');
  const settingsPanel = document.getElementById('settingsPanel');
  const saveSettingsBtn = document.getElementById('saveSettings');

  toggleBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('visible');
    toggleBtn.textContent = settingsPanel.classList.contains('visible') ? 'Hide Settings' : 'Show Settings';
  });

  saveSettingsBtn.addEventListener('click', saveGithubSettings);

  // Load saved settings
  const savedSettings = await chrome.storage.sync.get([
    'encryptedToken',
    'repoOwner',
    'repoName',
    'rememberMe'
  ]);

  if (savedSettings.encryptedToken) {
    githubToken = await decryptToken(savedSettings.encryptedToken);
    document.getElementById('githubToken').value = '••••••••••••••••';
  }

  if (savedSettings.repoOwner) {
    settings.repoOwner = savedSettings.repoOwner;
    document.getElementById('repoOwner').value = savedSettings.repoOwner;
  }

  if (savedSettings.repoName) {
    settings.repoName = savedSettings.repoName;
    document.getElementById('repoName').value = savedSettings.repoName;
  }

  document.getElementById('rememberMe').checked = 
    savedSettings.rememberMe !== undefined ? savedSettings.rememberMe : true;

  // Show settings panel if no token is configured
  if (!githubToken) {
    settingsPanel.classList.add('visible');
  }

  // Add drag and drop handlers
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  dropZone.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', handleFileSelect);
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
  });

  // Load categories when GitHub settings are available
  if (githubToken && settings.repoOwner && settings.repoName) {
    await updateCategoryList();
  }
});

function startDragging(e) {
  isDragging = true;
  const container = document.querySelector('.container');
  initialX = e.clientX - xOffset;
  initialY = e.clientY - yOffset;
}

function drag(e) {
  if (!isDragging) return;
  
  e.preventDefault();
  const container = document.querySelector('.container');
  
  xOffset = e.clientX - initialX;
  yOffset = e.clientY - initialY;

  // Keep the popup within the viewport
  xOffset = Math.min(Math.max(xOffset, 0), window.innerWidth - container.offsetWidth);
  yOffset = Math.min(Math.max(yOffset, 0), window.innerHeight - container.offsetHeight);

  container.style.left = xOffset + 'px';
  container.style.top = yOffset + 'px';
}

function stopDragging() {
  isDragging = false;
}

// Save GitHub settings
async function saveGithubSettings() {
  const tokenInput = document.getElementById('githubToken');
  const newToken = tokenInput.value;
  
  if (newToken && newToken !== '••••••••••••••••') {
    githubToken = newToken;
    if (document.getElementById('rememberMe').checked) {
      const encryptedToken = await encryptToken(newToken);
      await chrome.storage.sync.set({ encryptedToken });
    }
    tokenInput.value = '••••••••••••••••';
  }

  settings = {
    repoOwner: document.getElementById('repoOwner').value,
    repoName: document.getElementById('repoName').value,
    rememberMe: document.getElementById('rememberMe').checked
  };

  if (settings.rememberMe) {
    await chrome.storage.sync.set(settings);
  } else {
    await chrome.storage.sync.remove(['encryptedToken', 'repoOwner', 'repoName', 'rememberMe']);
  }

  document.getElementById('settingsPanel').classList.add('hidden');
  showStatus('Settings saved successfully!', 'success');
  
  // Load categories after saving GitHub settings
  if (githubToken && settings.repoOwner && settings.repoName) {
    await updateCategoryList();
  }
}

// Show status message
function showStatus(message, type = 'info') {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = 'status';
  }, 3000);
}

// Update the getSourceUrl function
async function getSourceUrl() {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      lastFocusedWindow: true
    });
    
    const tab = tabs[0];
    if (tab?.url && 
        !tab.url.startsWith('chrome-extension://') && 
        !tab.url.startsWith('chrome://')) {
      return tab.url;
    }
    return '';
  } catch (error) {
    console.error('Error getting tab URL:', error);
    return '';
  }
}

// Update the save button click handler
document.getElementById('saveButton').addEventListener('click', async () => {
  if (!githubToken) {
    showStatus('Please configure GitHub settings first', 'error');
    document.getElementById('settingsPanel').classList.add('visible');
    return;
  }

  const statusElement = document.getElementById('status');
  const repoOwner = settings.repoOwner;
  const repoName = settings.repoName;
  const textToSave = document.getElementById('selectedText').value.trim();
  const category = document.getElementById('category').value || 
                  document.getElementById('newCategory').value;

  // Only require text and category, not screenshot
  if (!textToSave || !category || !repoOwner || !repoName) {
    showStatus('Please fill in required fields (text and category)', 'error');
    return;
  }

  try {
    showStatus('Saving...', 'info');
    
    // Get source URL directly from tabs API
    const sourceUrl = await getSourceUrl();
    console.log('Source URL before save:', sourceUrl); // Debug log
    
    // Get existing file content
    const fileName = `${category}/notes.md`;
    let existingContent = '';
    let existingFileSha;

    try {
      const getFileResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${fileName}`, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (getFileResponse.ok) {
        const fileData = await getFileResponse.json();
        existingContent = decodeContent(fileData.content);
        existingFileSha = fileData.sha;
      }
    } catch (error) {
      console.log('File does not exist yet, will create new');
    }
    
    // Upload all images first
    const imageUrls = [];
    for (const image of uploadedImages) {
      try {
        const imageFileName = `${category}/images/${image.filename}`;
        const imageResponse = await fetch(
          `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imageFileName}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `token ${githubToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `Add image to ${category}`,
              content: image.data.split(',')[1],
              branch: 'main'
            })
          }
        );

        if (imageResponse.ok) {
          imageUrls.push(`\n\n![${image.filename}](images/${image.filename})\n`);
        }
      } catch (error) {
        console.error('Failed to upload image:', error);
        showStatus('Failed to upload some images', 'error');
      }
    }

    // Handle screenshot if exists
    if (screenshotData && screenshotFilename) {
      try {
        const imageFileName = `${category}/images/${screenshotFilename}`;
        const imageResponse = await fetch(
          `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${imageFileName}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `token ${githubToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `Add screenshot to ${category}`,
              content: screenshotData.split(',')[1],
              branch: 'main'
            })
          }
        );

        if (imageResponse.ok) {
          imageUrls.push(`\n\n![Screenshot](images/${screenshotFilename})\n`);
        }
      } catch (error) {
        console.error('Failed to upload screenshot:', error);
        showStatus('Failed to upload screenshot, continuing with text only', 'error');
      }
    }

    // Prepare content with text, images, and source - move this after all uploads
    const imageContent = imageUrls.join('');
    // Make sure we add the source link
    const sourceLink = sourceUrl ? `\n\n[Source](${sourceUrl})` : '';
    console.log('Source link to be added:', sourceLink); // Debug log
    
    const newEntry = `${textToSave}${imageContent}${sourceLink}\n\n---\n\n`;
    console.log('New entry to be saved:', newEntry); // Debug log
    const newContent = existingContent ? `${existingContent}${newEntry}` : newEntry;

    // Always create/update the notes.md file
    const saveResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${fileName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: existingContent ? `Updated notes in ${category}` : `Created notes in ${category}`,
        content: encodeContent(newContent),
        sha: existingFileSha, // This will be undefined for new files, which is correct
        encoding: 'base64'
      })
    });

    if (saveResponse.ok) {
      showStatus('Saved successfully!', 'success');
      // Clear form
      document.getElementById('selectedText').value = '';
      screenshotData = null;
      screenshotFilename = null;
      document.getElementById('screenshotPreview').classList.add('hidden');
      uploadedImages = [];
      updateImagePreviews();
      
      // Update category list to include any new category
      await updateCategoryList();
    } else {
      const errorData = await saveResponse.json();
      throw new Error(`GitHub API Error: ${errorData.message}`);
    }
  } catch (error) {
    console.error('Save error:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
});

// Helper function to check if two text blocks are similar
function areSimilar(text1, text2) {
  // Convert to lowercase and remove punctuation for comparison
  const normalize = text => text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const normalized1 = normalize(text1);
  const normalized2 = normalize(text2);

  // Check if one text contains significant parts of the other
  const words1 = new Set(normalized1.split(' '));
  const words2 = new Set(normalized2.split(' '));
  
  // Calculate word overlap
  const commonWords = [...words1].filter(word => words2.has(word));
  const overlapRatio = commonWords.length / Math.min(words1.size, words2.size);

  // Consider texts similar if they share more than 50% of their words
  return overlapRatio > 0.5;
}

// Add these new functions
async function captureScreenshot() {
  try {
    const tab = await getCurrentTab();
    chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_SCREENSHOT' });
  } catch (error) {
    showStatus('Failed to capture screenshot', 'error');
  }
}

// Add this message listener to popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCREENSHOT_CAPTURED') {
    screenshotData = message.screenshot;
    screenshotFilename = 'screenshot.png';
    
    // Show preview
    const preview = document.getElementById('screenshotPreview');
    const image = document.getElementById('screenshotImage');
    image.src = screenshotData;
    preview.classList.remove('hidden');
  }
  // ... existing message listener code ...
});

// Update getCurrentTab function to be more reliable
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    windowType: 'normal'
  });
  return tab;
}

// Add these new functions
function handleFileSelect(e) {
  handleFiles(Array.from(e.target.files));
}

async function handleFiles(files) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      try {
        const imageData = await readFileAsDataURL(file);
        // Simplify the filename - remove timestamp and clean the name
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
        uploadedImages.push({
          data: imageData,
          filename: cleanFileName
        });
        updateImagePreviews();
      } catch (error) {
        console.error('Error reading file:', error);
        showStatus('Error reading image file', 'error');
      }
    }
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateImagePreviews() {
  const container = document.querySelector('.image-preview-container') || 
    createImagePreviewContainer();

  container.innerHTML = '';
  
  uploadedImages.forEach((image, index) => {
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.innerHTML = `
      <img src="${image.data}" alt="Preview">
      <button class="remove-image" data-index="${index}">✕</button>
    `;
    container.appendChild(preview);
  });

  // Add click handlers for remove buttons
  container.querySelectorAll('.remove-image').forEach(button => {
    button.addEventListener('click', () => {
      uploadedImages.splice(parseInt(button.dataset.index), 1);
      updateImagePreviews();
    });
  });
}

function createImagePreviewContainer() {
  const container = document.createElement('div');
  container.className = 'image-preview-container';
  document.querySelector('.capture-buttons').appendChild(container);
  return container;
}

// Add these functions at the appropriate location in popup.js
async function updateCategoryList() {
  const select = document.getElementById('category');
  const currentValue = select.value;
  const categories = await loadCategories();
  
  // Clear existing options except the first one
  while (select.options.length > 1) {
    select.remove(1);
  }
  
  // Add categories
  categories.forEach(category => {
    const option = new Option(category, category);
    select.add(option);
  });
  
  // Restore selected value if it exists
  if (categories.includes(currentValue)) {
    select.value = currentValue;
  }
}

async function loadCategories() {
  try {
    const repoOwner = settings.repoOwner;
    const repoName = settings.repoName;
    
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/contents/`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (response.ok) {
      const contents = await response.json();
      return contents
        .filter(item => item.type === 'dir')
        .map(item => item.name)
        .sort();
    }
    return [];
  } catch (error) {
    console.error('Failed to load categories:', error);
    return [];
  }
}

// Add these helper functions
function encodeContent(content) {
  try {
    return btoa(unescape(encodeURIComponent(content)));
  } catch (error) {
    console.error('Encoding error:', error);
    throw new Error('Failed to encode content properly');
  }
}

function decodeContent(base64Content) {
  try {
    return decodeURIComponent(escape(atob(base64Content)));
  } catch (error) {
    console.error('Decoding error:', error);
    throw new Error('Failed to decode content properly');
  }
} 