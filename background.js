let popupWindow = null;
let currentTabUrl = '';

// Add this message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_URL') {
    // Get the active tab in the last focused window
    chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
      windowType: 'normal'
    }, (tabs) => {
      try {
        const tab = tabs[0];
        if (tab && tab.url && 
            !tab.url.startsWith('chrome-extension://') && 
            !tab.url.startsWith('chrome://')) {
          console.log('Sending URL:', tab.url); // Debug log
          sendResponse({ url: tab.url });
        } else {
          console.log('No valid URL found'); // Debug log
          sendResponse({ url: '' });
        }
      } catch (error) {
        console.error('Error getting URL:', error); // Debug log
        sendResponse({ url: '' });
      }
    });
    return true; // Keep the message channel open for async response
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  // Check if window exists and is still open
  if (popupWindow) {
    try {
      const window = await chrome.windows.get(popupWindow.id);
      if (window) {
        // Window exists, just focus it
        await chrome.windows.update(popupWindow.id, { 
          focused: true,
          drawAttention: true
        });
        return;
      }
    } catch (error) {
      // Window doesn't exist anymore, popupWindow was stale
      popupWindow = null;
    }
  }

  // Create new window only if no existing window was found
  await createPopupWindow();
});

async function createPopupWindow() {
  const displays = await chrome.system.display.getInfo();
  const primaryDisplay = displays[0];
  
  popupWindow = await chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 400,
    height: 600,
    top: 20,
    left: primaryDisplay.workArea.width - 420,
    focused: true,
    state: 'normal'
  });
}

// Clean up when the window is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (popupWindow && popupWindow.id === windowId) {
    popupWindow = null;
  }
}); 