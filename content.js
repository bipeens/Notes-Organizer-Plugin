// Load html2canvas dynamically
async function loadHtml2Canvas() {
  if (window.html2canvas) return;

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('html2canvas.min.js');
  
  const loadPromise = new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  
  document.head.appendChild(script);
  await loadPromise;
}

document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  let selectedText = selection.toString().trim();
  
  // Only send if there's actual text selected
  if (selectedText) {
    // Clean up the text: remove URLs and [Source] text if present
    selectedText = selectedText
      .replace(/\[Source\].*$/gm, '') // Remove [Source] and everything after it
      .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
      .replace(/\n\s*\n\s*---\s*\n/g, '') // Remove separators
      .trim();

    if (selectedText) {
      chrome.runtime.sendMessage({
        type: 'TEXT_SELECTED',
        text: selectedText
      });
    }
  }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_SCREENSHOT') {
    try {
      await loadHtml2Canvas();
      await loadScreenshotSelector();
      const selector = new ScreenshotSelector();
      selector.init();
    } catch (error) {
      console.error('Screenshot capture failed:', error);
    }
  }
});

async function loadScreenshotSelector() {
  if (window.ScreenshotSelector) return;

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('selection.js');
  
  const loadPromise = new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  
  document.head.appendChild(script);
  await loadPromise;
} 