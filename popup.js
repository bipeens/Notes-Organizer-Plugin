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
let aiApiKey = '';
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
let isSummarizing = false;
let speechSynthesis = window.speechSynthesis;
let speechUtterance = null;

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
    'encryptedApiKey',
    'repoOwner',
    'repoName',
    'rememberMe'
  ]);

  if (savedSettings.encryptedToken) {
    githubToken = await decryptToken(savedSettings.encryptedToken);
    document.getElementById('githubToken').value = '••••••••••••••••';
  }

  if (savedSettings.encryptedApiKey) {
    aiApiKey = await decryptToken(savedSettings.encryptedApiKey);
    document.getElementById('aiApiKey').value = '••••••••••••••••';
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

  // Add this after your DOMContentLoaded event listener
  document.getElementById('summarizeCategory').addEventListener('click', summarizeCategory);
  document.getElementById('closeSummary').addEventListener('click', () => {
    stopSpeaking();
    document.getElementById('summaryPanel').classList.add('hidden');
  });

  // Add speech control handlers
  document.getElementById('speakSummary').addEventListener('click', speakSummary);
  document.getElementById('stopSpeaking').addEventListener('click', stopSpeaking);

  // Add this to your DOMContentLoaded event listener
  document.getElementById('regenerateTitlesAndTags').addEventListener('click', async () => {
    const category = document.getElementById('category').value;
    if (!category) {
      showStatus('Please select a category first', 'error');
      return;
    }
    
    await regenerateTitlesAndTags(category);
  });
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
  const apiKeyInput = document.getElementById('aiApiKey');
  const newToken = tokenInput.value;
  const newApiKey = apiKeyInput.value;
  
  if (newToken && newToken !== '••••••••••••••••') {
    githubToken = newToken;
    if (document.getElementById('rememberMe').checked) {
      const encryptedToken = await encryptToken(newToken);
      await chrome.storage.sync.set({ encryptedToken });
    }
    tokenInput.value = '••••••••••••••••';
  }

  if (newApiKey && newApiKey !== '••••••••••••••••') {
    aiApiKey = newApiKey;
    if (document.getElementById('rememberMe').checked) {
      const encryptedApiKey = await encryptToken(newApiKey);
      await chrome.storage.sync.set({ encryptedApiKey });
    }
    apiKeyInput.value = '••••••••••••••••';
  }

  settings = {
    repoOwner: document.getElementById('repoOwner').value,
    repoName: document.getElementById('repoName').value,
    rememberMe: document.getElementById('rememberMe').checked
  };

  if (settings.rememberMe) {
    await chrome.storage.sync.set(settings);
  } else {
    await chrome.storage.sync.remove(['encryptedToken', 'encryptedApiKey', 'repoOwner', 'repoName', 'rememberMe']);
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

// Add this new function to generate titles and tags
async function generateTitleAndTags(content) {
  if (!aiApiKey) {
    throw new Error('Please configure Google AI API Key in settings');
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `For the following content, please provide:
            1. A concise, descriptive title (max 60 characters)
            2. 3-5 relevant tags
            Format the response exactly like this:
            Title: [your title here]
            Tags: #tag1 #tag2 #tag3

            Content:
            ${content}`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 256
        }
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`AI API failed: ${result.error?.message || 'Unknown error'}`);
    }

    if (result.candidates?.[0]?.content?.parts?.[0]) {
      const aiResponse = result.candidates[0].content.parts[0].text;
      const titleMatch = aiResponse.match(/Title: (.*)/);
      const tagsMatch = aiResponse.match(/Tags: (.*)/);

      return {
        title: titleMatch ? titleMatch[1].trim() : 'Untitled Note',
        tags: tagsMatch ? tagsMatch[1].trim() : '#untagged'
      };
    }

    throw new Error('Invalid response format from AI API');
  } catch (error) {
    console.error('AI title/tags generation error:', error);
    return {
      title: 'Untitled Note',
      tags: '#untagged'
    };
  }
}

// Update the save button click handler to include title and tags
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
    
    // Generate title and tags before saving
    const { title, tags } = await generateTitleAndTags(textToSave);
    
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

    // Prepare content with text, images, source, and timestamp
    const imageContent = imageUrls.join('');
    const sourceLink = sourceUrl ? `\n\n[Source](${sourceUrl})` : '';
    const timestamp = new Date().toLocaleString();
    
    const newEntry = `## ${title}\n\n${tags}\n\n${textToSave}${imageContent}${sourceLink}\n\n*${timestamp}*\n\n---\n\n`;
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

// Add these new functions
async function summarizeCategory() {
  if (isSummarizing) return;
  
  // Stop any ongoing speech
  stopSpeaking();
  
  const category = document.getElementById('category').value;
  if (!category) {
    showStatus('Please select a category to summarize', 'error');
    return;
  }

  try {
    isSummarizing = true;
    showStatus('Generating summary...', 'info');
    
    // Get category content
    const content = await getCategoryContent(category);
    if (!content) {
      showStatus('No content found in this category', 'error');
      return;
    }

    // Generate summary using Google AI
    const summary = await generateSummary(content);
    
    // Show summary
    const summaryPanel = document.getElementById('summaryPanel');
    const summaryContent = document.getElementById('summaryContent');
    summaryContent.textContent = summary;
    summaryPanel.classList.remove('hidden');
    
    showStatus('Summary generated successfully!', 'success');
  } catch (error) {
    console.error('Summarization error:', error);
    showStatus(`Summarization failed: ${error.message}`, 'error');
  } finally {
    isSummarizing = false;
  }
}

async function getCategoryContent(category) {
  try {
    const fileName = `${category}/notes.md`;
    const response = await fetch(
      `https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/contents/${fileName}`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return decodeContent(data.content);
    }
    return null;
  } catch (error) {
    console.error('Error fetching category content:', error);
    return null;
  }
}

async function generateSummary(content) {
  if (!aiApiKey) {
    throw new Error('Please configure Google AI API Key in settings');
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Please provide a concise summary of the following notes:\n\n${content}\n\nFocus on key points and main themes. Format the summary in bullet points.`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      })
    });

    const result = await response.json();
    console.log('AI API Response:', result); // Debug log

    if (!response.ok) {
      throw new Error(`AI API failed: ${result.error?.message || 'Unknown error'}`);
    }

    // Handle the response based on the API structure
    if (result.candidates && 
        result.candidates[0] && 
        result.candidates[0].content && 
        result.candidates[0].content.parts && 
        result.candidates[0].content.parts[0]) {
      return result.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Invalid response format from AI API');
    }
  } catch (error) {
    console.error('AI API error:', error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

// Add these new functions for speech handling
function speakSummary() {
  const summaryText = document.getElementById('summaryContent').textContent;
  if (!summaryText) return;

  // Stop any ongoing speech
  stopSpeaking();

  // Create new utterance
  speechUtterance = new SpeechSynthesisUtterance(summaryText);
  
  // Configure speech options
  speechUtterance.rate = 1.0; // Speed of speech (0.1 to 10)
  speechUtterance.pitch = 1.0; // Pitch of voice (0 to 2)
  speechUtterance.volume = 1.0; // Volume (0 to 1)

  // Get available voices and set a good one if available
  const voices = speechSynthesis.getVoices();
  const preferredVoice = voices.find(voice => 
    voice.lang.startsWith('en') && voice.name.includes('Google') ||
    voice.name.includes('Natural')
  );
  if (preferredVoice) {
    speechUtterance.voice = preferredVoice;
  }

  // Add event handlers
  speechUtterance.onstart = () => {
    document.getElementById('speakSummary').classList.add('hidden');
    document.getElementById('stopSpeaking').classList.remove('hidden');
  };

  speechUtterance.onend = () => {
    document.getElementById('speakSummary').classList.remove('hidden');
    document.getElementById('stopSpeaking').classList.add('hidden');
  };

  // Start speaking
  speechSynthesis.speak(speechUtterance);
}

function stopSpeaking() {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  document.getElementById('speakSummary').classList.remove('hidden');
  document.getElementById('stopSpeaking').classList.add('hidden');
}

// Add this new function to regenerate titles and tags for a category
async function regenerateTitlesAndTags(category) {
  try {
    const content = await getCategoryContent(category);
    if (!content) return;

    // Split content into individual notes
    const notes = content.split('---').filter(note => note.trim());
    
    let newContent = '';
    
    // Process each note
    for (const note of notes) {
      // Extract the main content (excluding existing title and tags)
      const mainContent = note.replace(/^##.*\n\n#.*\n\n/, '').trim();
      
      // Generate new title and tags
      const { title, tags } = await generateTitleAndTags(mainContent);
      
      // Reconstruct the note with new title and tags
      newContent += `## ${title}\n\n${tags}\n\n${mainContent}\n\n---\n\n`;
    }

    // Save the updated content
    const fileName = `${category}/notes.md`;
    const response = await fetch(
      `https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/contents/${fileName}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Updated titles and tags in ${category}`,
          content: encodeContent(newContent),
          sha: (await getFileSha(fileName)),
          branch: 'main'
        })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to update titles and tags');
    }

    showStatus('Titles and tags updated successfully!', 'success');
  } catch (error) {
    console.error('Error regenerating titles and tags:', error);
    showStatus('Failed to update titles and tags', 'error');
  }
}

// Helper function to get file SHA
async function getFileSha(fileName) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/contents/${fileName}`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.sha;
    }
    return null;
  } catch (error) {
    return null;
  }
} 