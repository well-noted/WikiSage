/*\
title: $:/plugins/NoteStreams/WikiSage/tiddlywiki-reference-agent-widget.js
type: application/javascript
module-type: widget
\*/

var Widget = require("$:/core/modules/widgets/widget.js").widget;
const { getGeminiApiUrl } = require("./widget.js");
const { ConnectionPool } = require("./connection-pool.js");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CHAT_COMPLETION_URL = "https://api.openai.com/v1/chat/completions";

const pool = new ConnectionPool({ maxSize: 5 });

// Helper method to retrieve API keys based on storage preference
function getApiKey(type = 'openai') {
  // Check if user has enabled temporary tiddler storage
  const useTemporaryStorage = $tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() === "yes";
  
  let apiKeyTiddler, tempApiKeyTiddler;
  
  switch(type.toLowerCase()) {
    case 'anthropic':
      apiKeyTiddler = "$:/plugins/NoteStreams/WikiSage/anthropic-api-key";
      tempApiKeyTiddler = "$:/temp/WikiSage/anthropic-api-key";
      break;
    case 'gemini':
      apiKeyTiddler = "$:/plugins/NoteStreams/WikiSage/gemini-api-key";
      tempApiKeyTiddler = "$:/temp/WikiSage/gemini-api-key";
      break;
    case 'openai':
    default:
      apiKeyTiddler = "$:/plugins/NoteStreams/WikiSage/openai-api-key";
      tempApiKeyTiddler = "$:/temp/WikiSage/openai-api-key";
      break;
  }
  
  // If using temporary storage and temp key exists and is not empty, use it
  if (useTemporaryStorage) {
    const tempKey = $tw.wiki.getTiddlerText(tempApiKeyTiddler, "").trim();
    if (tempKey) {
      return tempKey;
    }
  }
  
  // Fall back to plugin key
  return $tw.wiki.getTiddlerText(apiKeyTiddler, "").trim();
}

function TiddlywikiReferenceAgentWidget(parseTreeNode, options) {
  this.initialise(parseTreeNode, options);
}

TiddlywikiReferenceAgentWidget.prototype = new Widget();

TiddlywikiReferenceAgentWidget.prototype.render = function(parent, nextSibling) {
  if (!$tw.browser) return;
  this.parentDomNode = parent;
  this.computeAttributes();
  
  // Store reference to this widget instance
  const parentWidget = this;

  // Main container
  const container = $tw.utils.domMaker("div", {
    class: "tiddlywiki-reference-agent-widget-container",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      width: "100%",
      maxWidth: "650px",
      border: "1px solid #bbb",
      borderRadius: "6px",
      padding: "12px",
      background: "#23272e",
      color: "#f8f8f2"
    }
  });

  // Model picker dropdown
  const modelPicker = $tw.utils.domMaker("select", {
    class: "model-picker",
    style: {
      padding: "6px 10px",
      borderRadius: "4px",
      border: "1px solid #444",
      background: "#23272e",
      color: "#f8f8f2",
      fontSize: "15px"
    }
  });
  let modelListTiddler = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/model-list");
  let modelOptions = [];
  if (modelListTiddler) {
    modelOptions = modelListTiddler.split("\n").map(line => {
      const [value, label] = line.split("|");
      return {
        value: value.trim(),
        label: (label ? label.trim() : value.trim())
      };
    }).filter(opt => !!opt.value);
  } else {
    modelOptions = [
      { value: "gpt-4o-mini", label: "OpenAI GPT-4o-mini" },
      { value: "gpt-4", label: "OpenAI GPT-4" },
      { value: "gpt-3.5-turbo", label: "OpenAI GPT-3.5 Turbo" },
      { value: "gemini-pro", label: "Gemini Pro" },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus" }
    ];
  }
  modelOptions.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    modelPicker.appendChild(option);
  });
  modelPicker.value = modelOptions[0] ? modelOptions[0].value : "gpt-4o-mini";
  container.appendChild(modelPicker);

  // Reference selection area
  const referencesContainer = $tw.utils.domMaker("div", {
    class: "references-selection-container",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginTop: "10px"
    }
  });
  
  const referencesLabel = $tw.utils.domMaker("div", {
    text: "Referenced Tiddlers:",
    style: { fontWeight: "bold" }
  });
  referencesContainer.appendChild(referencesLabel);
  
  // Selected references display
  const selectedReferencesDisplay = $tw.utils.domMaker("div", {
    class: "selected-references",
    style: {
      minHeight: "40px",
      maxHeight: "150px",
      overflowY: "auto",
      background: "#2a2d36",
      padding: "8px",
      borderRadius: "4px",
      display: "flex",
      flexWrap: "wrap",
      gap: "5px"
    }
  });
  referencesContainer.appendChild(selectedReferencesDisplay);
  
  // Reference input and add button
  const referenceInputRow = $tw.utils.domMaker("div", {
    style: {
      display: "flex",
      gap: "5px",
      marginTop: "5px"
    }
  });
  
  const referenceInput = $tw.utils.domMaker("input", {
    class: "reference-input",
    attributes: {
      placeholder: "Enter tiddler title or filter expression [tag[example]]..."
    },
    style: {
      flex: "1",
      padding: "6px",
      borderRadius: "4px",
      border: "1px solid #444",
      background: "#23272e",
      color: "#f8f8f2"
    }
  });
  referenceInputRow.appendChild(referenceInput);
  
  const addReferenceBtn = $tw.utils.domMaker("button", {
    text: "Add",
    style: {
      padding: "6px 12px",
      borderRadius: "4px",
      border: "none",
      background: "#2980b9",
      color: "#fff",
      fontWeight: "bold",
      cursor: "pointer"
    }
  });
  referenceInputRow.appendChild(addReferenceBtn);
  
  referencesContainer.appendChild(referenceInputRow);
  container.appendChild(referencesContainer);
  
  // Target tiddler for content generation
  const targetTiddlerContainer = $tw.utils.domMaker("div", {
    class: "target-tiddler-container",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginTop: "10px"
    }
  });
  
  const targetTiddlerLabel = $tw.utils.domMaker("div", {
    text: "Target Tiddler (optional):",
    style: { fontWeight: "bold" }
  });
  targetTiddlerContainer.appendChild(targetTiddlerLabel);
  
  const targetTiddlerRow = $tw.utils.domMaker("div", {
    style: {
      display: "flex",
      gap: "5px",
      alignItems: "center"
    }
  });
  
  const targetTiddlerInput = $tw.utils.domMaker("input", {
    class: "target-tiddler-input",
    attributes: {
      placeholder: "Enter tiddler title to write content to..."
    },
    style: {
      flex: "1",
      padding: "6px",
      borderRadius: "4px",
      border: "1px solid #444",
      background: "#23272e",
      color: "#f8f8f2"
    }
  });
  targetTiddlerRow.appendChild(targetTiddlerInput);
  
  // Add update mode selector - append/overwrite
  const updateModeSelector = $tw.utils.domMaker("select", {
    class: "update-mode-selector",
    style: {
      padding: "6px 10px",
      borderRadius: "4px",
      border: "1px solid #444",
      background: "#23272e",
      color: "#f8f8f2",
      fontSize: "15px"
    }
  });
  
  const appendOption = document.createElement("option");
  appendOption.value = "append";
  appendOption.textContent = "Append";
  updateModeSelector.appendChild(appendOption);
  
  const overwriteOption = document.createElement("option");
  overwriteOption.value = "overwrite";
  overwriteOption.textContent = "Overwrite";
  updateModeSelector.appendChild(overwriteOption);
  
  targetTiddlerRow.appendChild(updateModeSelector);
  targetTiddlerContainer.appendChild(targetTiddlerRow);
  container.appendChild(targetTiddlerContainer);
  
  // Instructions textarea
  const instructionsLabel = $tw.utils.domMaker("div", {
    text: "Custom Instructions:",
    style: { 
      fontWeight: "bold",
      marginTop: "10px" 
    }
  });
  container.appendChild(instructionsLabel);
  
  const instructionsTextarea = $tw.utils.domMaker("textarea", {
    class: "custom-instructions",
    attributes: {
      placeholder: "Enter custom instructions for the agent based on the referenced tiddlers...",
      rows: "5"
    },
    style: {
      width: "100%",
      padding: "8px",
      borderRadius: "4px",
      border: "1px solid #444",
      background: "#23272e",
      color: "#f8f8f2",
      fontSize: "15px",
      fontFamily: "inherit",
      resize: "vertical"
    }
  });
  container.appendChild(instructionsTextarea);

  // Conversation controls (Clear, Export)
  const controlsRow = $tw.utils.domMaker("div", {
    style: { 
      display: "flex", 
      gap: "10px", 
      alignItems: "center", 
      margin: "8px 0" 
    }
  });
  
  // Clear button
  const clearBtn = $tw.utils.domMaker("button", {
    text: "Clear Conversation",
    style: {
      padding: "5px 12px",
      border: "none",
      borderRadius: "4px",
      background: "#c0392b",
      color: "#fff",
      fontWeight: "bold",
      cursor: "pointer"
    }
  });
  controlsRow.appendChild(clearBtn);
  
  // Export input and button
  const exportInput = $tw.utils.domMaker("input", {
    attributes: { placeholder: "Export tiddler title..." },
    style: {
      padding: "5px 8px",
      border: "1px solid #bbb",
      borderRadius: "4px",
      fontSize: "14px",
      minWidth: "120px"
    }
  });
  controlsRow.appendChild(exportInput);
  
  const exportBtn = $tw.utils.domMaker("button", {
    text: "Export Conversation",
    style: {
      padding: "5px 12px",
      border: "none",
      borderRadius: "4px",
      background: "#2980b9",
      color: "#fff",
      fontWeight: "bold",
      cursor: "pointer"
    }
  });
  controlsRow.appendChild(exportBtn);

  // Add API settings button and dropdown
  const settingsBtn = $tw.utils.domMaker("button", {
    text: "⚙️ API Settings",
    style: {
      padding: "5px 10px",
      marginLeft: "8px",
      border: "1px solid #444",
      borderRadius: "4px",
      background: "#2c3038",
      color: "#f0f0f0",
      fontSize: "14px",
      cursor: "pointer"
    }
  });

  const settingsDropdown = $tw.utils.domMaker("div", {
    style: {
      display: "none",
      position: "absolute",
      zIndex: "1000",
      padding: "12px 15px",
      background: "#23272e",
      color: "#f0f0f0",
      border: "1px solid #444",
      borderRadius: "4px",
      boxShadow: "0 3px 10px rgba(0,0,0,0.3)",
      marginTop: "5px",
      width: "280px"
    }
  });

  // Add temperature control
  let temperature = 0.7; // Default temperature
  let top_p = 1.0; // Default top_p

  // Temperature gauge
  const tempLabel = $tw.utils.domMaker("label", {
    text: "Temperature: ",
    style: { fontWeight: "bold", marginRight: "8px", color: "#f0f0f0" }
  });
  
  const tempValue = $tw.utils.domMaker("span", {
    text: temperature.toFixed(2),
    style: { marginLeft: "6px", fontFamily: "monospace", color: "#f0f0f0" }
  });
  
  const tempSlider = $tw.utils.domMaker("input", {
    attributes: {
      type: "range",
      min: "0",
      max: "2",
      step: "0.01",
      value: temperature
    },
    style: { width: "120px", verticalAlign: "middle" }
  });
  
  tempSlider.addEventListener("input", function() {
    temperature = parseFloat(this.value);
    tempValue.textContent = temperature.toFixed(2);
  });
  
  const tempRow = $tw.utils.domMaker("div", {
    style: { marginBottom: "8px" }
  });
  
  tempRow.appendChild(tempLabel);
  tempRow.appendChild(tempSlider);
  tempRow.appendChild(tempValue);
  settingsDropdown.appendChild(tempRow);
  
  // Top-p gauge
  const toppLabel = $tw.utils.domMaker("label", {
    text: "Top-p: ",
    style: { fontWeight: "bold", marginRight: "8px", color: "#f0f0f0" }
  });
  
  const toppValue = $tw.utils.domMaker("span", {
    text: top_p.toFixed(2),
    style: { marginLeft: "6px", fontFamily: "monospace", color: "#f0f0f0" }
  });
  
  const toppSlider = $tw.utils.domMaker("input", {
    attributes: {
      type: "range",
      min: "0",
      max: "1",
      step: "0.01",
      value: top_p
    },
    style: { width: "120px", verticalAlign: "middle" }
  });
  
  toppSlider.addEventListener("input", function() {
    top_p = parseFloat(this.value);
    toppValue.textContent = top_p.toFixed(2);
  });
  
  const toppRow = $tw.utils.domMaker("div", {
    style: { marginBottom: "12px" }
  });
  
  toppRow.appendChild(toppLabel);
  toppRow.appendChild(toppSlider);
  toppRow.appendChild(toppValue);
  settingsDropdown.appendChild(toppRow);

  // API key storage toggle
  const apiStorageRow = $tw.utils.domMaker("div", {
    style: { marginTop: "8px", marginBottom: "8px" }
  });

  const apiStorageLabel = $tw.utils.domMaker("label", {
    text: "Use temporary API keys: ",
    style: { fontWeight: "bold", marginRight: "8px", color: "#f0f0f0" }
  });

  // Check current setting
  const useTemporaryStorage = $tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() === "yes";

  const apiStorageToggle = $tw.utils.domMaker("input", {
    attributes: {
      type: "checkbox",
      checked: useTemporaryStorage
    },
    style: { verticalAlign: "middle" }
  });

  const apiStorageInfo = $tw.utils.domMaker("div", {
    text: useTemporaryStorage ? 
      "API keys will be read from temporary tiddlers" : 
      "API keys will be read from plugin tiddlers",
    style: { 
      marginTop: "5px", 
      fontSize: "12px",
      color: "#aaa"
    }
  });

  apiStorageToggle.addEventListener("change", function() {
    const preferenceValue = this.checked ? "yes" : "no";
    
    $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "$:/temp/WikiSage/useTemporaryApiKeys", 
        text: preferenceValue
    }));
    
    // Show message about the change
    const infoText = this.checked 
        ? "API keys will now be read from temporary tiddlers if available" 
        : "API keys will now be read from plugin tiddlers";
    
    apiStorageInfo.textContent = infoText;
  });

  apiStorageRow.appendChild(apiStorageLabel);
  apiStorageRow.appendChild(apiStorageToggle);
  apiStorageRow.appendChild(apiStorageInfo);

  // Create a container for the set API key buttons
  const tempKeyButtonsContainer = $tw.utils.domMaker("div", {
    style: {
      marginTop: "10px",
      display: "flex",
      gap: "8px"
    }
  });

  // Button for OpenAI API key
  const setOpenAIKeyButton = $tw.utils.domMaker("button", {
    text: "Set OpenAI Key",
    style: {
      padding: "4px 8px",
      fontSize: "12px",
      cursor: "pointer",
      backgroundColor: "#74aa9c",
      color: "white",
      border: "none",
      borderRadius: "3px"
    }
  });

  setOpenAIKeyButton.addEventListener("click", function() {
    const tempKey = prompt("Enter temporary OpenAI API key:", "");
    if (tempKey !== null) {
      $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "$:/temp/WikiSage/openai-api-key",
        text: tempKey
      }));
      
      // Enable temporary storage if not already enabled
      if ($tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim() !== "yes") {
        $tw.wiki.addTiddler(new $tw.Tiddler({
          title: "$:/temp/WikiSage/useTemporaryApiKeys",
          text: "yes"
        }));
        apiStorageToggle.checked = true;
        apiStorageInfo.textContent = "API keys will now be read from temporary tiddlers if available";
      }
      
      apiStorageInfo.textContent = "OpenAI API key set in temporary storage";
    }
  });

  // Button for Anthropic API key
  const setAnthropicKeyButton = $tw.utils.domMaker("button", {
    text: "Set Anthropic Key",
    style: {
      padding: "4px 8px",
      fontSize: "12px",
      cursor: "pointer",
      backgroundColor: "#8250df",
      color: "white",
      border: "none",
      borderRadius: "3px"
    }
  });

  setAnthropicKeyButton.addEventListener("click", function() {
    const tempKey = prompt("Enter temporary Anthropic API key:", "");
    if (tempKey !== null) {
      $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "$:/temp/WikiSage/anthropic-api-key",
        text: tempKey
      }));
      
      // Enable temporary storage if not already enabled
      if ($tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim() !== "yes") {
        $tw.wiki.addTiddler(new $tw.Tiddler({
          title: "$:/temp/WikiSage/useTemporaryApiKeys",
          text: "yes"
        }));
        apiStorageToggle.checked = true;
        apiStorageInfo.textContent = "API keys will now be read from temporary tiddlers if available";
      }
      
      apiStorageInfo.textContent = "Anthropic API key set in temporary storage";
    }
  });

  // Button for Gemini API key
  const setGeminiKeyButton = $tw.utils.domMaker("button", {
    text: "Set Gemini Key",
    style: {
      padding: "4px 8px",
      fontSize: "12px",
      cursor: "pointer",
      backgroundColor: "#1aa260",
      color: "white",
      border: "none",
      borderRadius: "3px"
    }
  });

  setGeminiKeyButton.addEventListener("click", function() {
    const tempKey = prompt("Enter temporary Gemini API key:", "");
    if (tempKey !== null) {
      $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "$:/temp/WikiSage/gemini-api-key",
        text: tempKey
      }));
      
      // Enable temporary storage if not already enabled
      if ($tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim() !== "yes") {
        $tw.wiki.addTiddler(new $tw.Tiddler({
          title: "$:/temp/WikiSage/useTemporaryApiKeys",
          text: "yes"
        }));
        apiStorageToggle.checked = true;
        apiStorageInfo.textContent = "API keys will now be read from temporary tiddlers if available";
      }
      
      apiStorageInfo.textContent = "Gemini API key set in temporary storage";
    }
  });

  tempKeyButtonsContainer.appendChild(setOpenAIKeyButton);
  tempKeyButtonsContainer.appendChild(setAnthropicKeyButton);
  tempKeyButtonsContainer.appendChild(setGeminiKeyButton);
  apiStorageRow.appendChild(tempKeyButtonsContainer);
  settingsDropdown.appendChild(apiStorageRow);

  // Toggle settings dropdown
  settingsBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    settingsDropdown.style.display = settingsDropdown.style.display === "none" ? "block" : "none";
  });
  // Hide on outside click
  document.addEventListener("click", function(e) {
    if (!settingsDropdown.contains(e.target) && e.target !== settingsBtn) {
      settingsDropdown.style.display = "none";
    }
  });

  // Add settings button to controlsRow
  controlsRow.appendChild(settingsBtn);
  container.appendChild(controlsRow);
  container.appendChild(settingsDropdown);

  // Conversation area
  const conversationArea = $tw.utils.domMaker("div", {
    class: "conversation-area",
    style: {
      minHeight: "80px",
      background: "#23272e",
      border: "1px solid #eee",
      borderRadius: "4px",
      padding: "10px",
      marginBottom: "8px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      maxHeight: "300px",
      overflowY: "auto"
    }
  });
  container.appendChild(conversationArea);

  // User input
  const promptInput = $tw.utils.domMaker("input", {
    class: "prompt-input",
    attributes: {
      placeholder: "Ask a question about the referenced tiddlers..."
    },
    style: {
      width: "100%",
      padding: "8px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      fontSize: "15px",
      fontFamily: "inherit"
    }
  });
  container.appendChild(promptInput);

  // Submit button
  const submitBtn = $tw.utils.domMaker("button", {
    class: "submit-btn",
    text: "Ask Agent",
    style: {
      marginTop: "4px",
      padding: "7px 16px",
      border: "none",
      borderRadius: "4px",
      background: "#ff9800",
      color: "#222",
      fontWeight: "bold",
      fontSize: "16px",
      cursor: "pointer"
    }
  });
  container.appendChild(submitBtn);

  // Message area
  const message = $tw.utils.domMaker("div", {
    class: "message",
    style: {
      color: "#c00",
      marginTop: "6px"
    }
  });
  container.appendChild(message);

  // Store selected references
  const selectedReferences = new Set();

  // Helper to create reference tags
  function createReferenceTag(title) {
    const tagElement = $tw.utils.domMaker("div", {
      text: title,
      style: {
        background: "#3498db",
        color: "#fff",
        padding: "3px 8px",
        borderRadius: "4px",
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
        gap: "5px"
      }
    });
    
    const removeBtn = document.createElement("span");
    removeBtn.innerHTML = "✕";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.fontWeight = "bold";
    removeBtn.style.marginLeft = "4px";
    
    removeBtn.addEventListener("click", () => {
      selectedReferences.delete(title);
      tagElement.remove();
      updateReferencesDisplay();
    });
    
    tagElement.appendChild(removeBtn);
    return tagElement;
  }

  // Update the references display
  function updateReferencesDisplay() {
    selectedReferencesDisplay.innerHTML = "";
    selectedReferences.forEach(title => {
      selectedReferencesDisplay.appendChild(createReferenceTag(title));
    });
  }

  // Add reference button handler
  addReferenceBtn.addEventListener("click", () => {
    const input = referenceInput.value.trim();
    if (!input) {
      message.textContent = "Please enter a tiddler title or filter";
      message.style.color = "#c00";
      return;
    }
    
    // Check if input is a filter (starts with [)
    if (input.startsWith("[")) {
      try {
        // Evaluate the filter
        const titles = $tw.wiki.filterTiddlers(input);
        
        if (titles.length === 0) {
          message.textContent = `Filter returned no results`;
          message.style.color = "#c00";
          return;
        }
        
        // Add all resulting tiddlers to the references
        let addedCount = 0;
        titles.forEach(title => {
          if (!selectedReferences.has(title)) {
            selectedReferences.add(title);
            addedCount++;
          }
        });
        
        updateReferencesDisplay();
        message.textContent = `Added ${addedCount} tiddlers from filter`;
        message.style.color = "#090";
      } catch (e) {
        message.textContent = `Error evaluating filter: ${e.message}`;
        message.style.color = "#c00";
        return;
      }
    } else {
      // Handle as a single tiddler title (existing functionality)
      // Check if tiddler exists
      if (!$tw.wiki.tiddlerExists(input)) {
        message.textContent = `Tiddler '${input}' does not exist`;
        message.style.color = "#c00";
        return;
      }
      
      // Add to selected references if not already there
      if (!selectedReferences.has(input)) {
        selectedReferences.add(input);
        updateReferencesDisplay();
        message.textContent = `Added '${input}' to references`;
        message.style.color = "#090";
      } else {
        message.textContent = `'${input}' already in references`;
        message.style.color = "#c90";
      }
    }
    
    // Clear input
    referenceInput.value = "";
  });

  // Allow Enter to add reference
  referenceInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      addReferenceBtn.click();
    }
  });

  // Allow Enter to submit the prompt
  promptInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      submitBtn.click();
    }
  });

  // Helper to add a chat message bubble
  function appendChatMessage(role, text) {
    const msgDiv = $tw.utils.domMaker("div", {
      class: `chat-message ${role}`,
      style: role === "user" ? {
        alignSelf: "flex-end",
        background: "#313a49",
        color: "#9fdfff",
        borderRadius: "16px 16px 4px 16px",
        padding: "8px 14px",
        maxWidth: "80%",
        fontSize: "15px",
        boxShadow: "0 1px 4px #222a44a0"
      } : {
        alignSelf: "flex-start",
        background: "#2a2d36",
        color: "#f8f8f2", // Changed to light color for better readability
        borderRadius: "16px 16px 16px 4px",
        padding: "8px 14px",
        maxWidth: "80%",
        fontSize: "15px",
        boxShadow: "0 1px 4px #23272ea0"
      }
    });
    msgDiv.innerText = text;
    conversationArea.appendChild(msgDiv);
    // Scroll to bottom
    conversationArea.scrollTop = conversationArea.scrollHeight;
  }

  // Clear button handler
  clearBtn.addEventListener("click", () => {
    conversationArea.innerHTML = "";
    message.textContent = "Conversation cleared.";
    message.style.color = "#666";
  });

  // Export button handler
  exportBtn.addEventListener("click", () => {
    const exportTitle = exportInput.value.trim();
    if (!exportTitle) {
      message.textContent = "Please specify a tiddler title to export the conversation.";
      message.style.color = "#c00";
      return;
    }
    // Gather chat bubbles
    const bubbles = conversationArea.querySelectorAll('.chat-message');
    let transcript = '';
    for (const bubble of bubbles) {
      if (bubble.classList.contains('user')) {
        transcript += `User: ${bubble.innerText}\n\n`;
      } else {
        transcript += `Agent: ${bubble.innerText}\n\n`;
      }
    }
    $tw.wiki.addTiddler(new $tw.Tiddler({
      title: exportTitle,
      text: transcript.trim()
    }));
    message.textContent = `Conversation exported to tiddler '${exportTitle}'.`;
    message.style.color = "#090";
  });

  // Submit button handler
  submitBtn.addEventListener("click", async () => {
    const userPrompt = promptInput.value.trim();
    const customInstructions = instructionsTextarea.value.trim();
    const model = modelPicker.value;
    const targetTiddler = targetTiddlerInput.value.trim();
    const updateMode = updateModeSelector.value;
    
    if (selectedReferences.size === 0) {
      message.textContent = "Please add at least one reference tiddler.";
      message.style.color = "#c00";
      return;
    }
    
    if (!userPrompt) {
      message.textContent = "Please enter a question or prompt.";
      message.style.color = "#c00";
      return;
    }
    
    // Clear the prompt input immediately after capturing its value
    promptInput.value = "";
    
    // Add user message as bubble
    appendChatMessage("user", userPrompt);
    message.textContent = "Processing...";
    message.style.color = "#666";
    
    // Get API keys
    const apiKey = getApiKey();
    const geminiApiKey = getApiKey('gemini');
    const anthropicApiKey = getApiKey('anthropic');
    
    // Get content for each referenced tiddler
    const referencedTiddlersContent = [];
    selectedReferences.forEach(title => {
      const content = $tw.wiki.getTiddlerText(title) || "";
      referencedTiddlersContent.push({ title, content });
    });
    
    // Format referenced tiddlers for the prompt
    let referencedTiddlersText = "";
    referencedTiddlersContent.forEach(ref => {
      referencedTiddlersText += `\n--- Referenced Tiddler: ${ref.title} ---\n${ref.content}\n`;
    });
    
    // Gather conversation so far
    let conversationLog = "";
    const bubbles = conversationArea.querySelectorAll('.chat-message');
    for (const bubble of bubbles) {
      if (bubble.classList.contains('user')) {
        conversationLog += `\nUser: ${bubble.innerText}`;
      } else {
        conversationLog += `\nAgent: ${bubble.innerText}`;
      }
    }
    
    // Build the system prompt
    let systemPrompt;
    if (targetTiddler) {
      // If target tiddler is provided, set up prompt for content generation
      let existingContent = "";
      if (updateMode === "append" && $tw.wiki.tiddlerExists(targetTiddler)) {
        existingContent = $tw.wiki.getTiddlerText(targetTiddler) || "";
      }
      
      systemPrompt = `You are a knowledgeable assistant that works with TiddlyWiki content. You are given references to tiddlers and will generate content for a new tiddler based on them.

Referenced tiddlers:
${referencedTiddlersText}

${customInstructions ? `Custom instructions:\n${customInstructions}\n` : ""}

${existingContent ? `Existing content in target tiddler "${targetTiddler}":\n${existingContent}\n` : ""}

Conversation so far:
${conversationLog}

User's request: ${userPrompt}

${updateMode === "append" ? 
  `Your response will be APPENDED to the ${existingContent ? "existing" : "new"} tiddler "${targetTiddler}". Format your content to flow well with any existing content.` : 
  `Your response will OVERWRITE the tiddler "${targetTiddler}". Provide complete, well-formatted content.`}

Please format your answer in two parts:
1. [Chat Response] - A short response to display in the chat
2. [Tiddler Content] - The actual content to write to the tiddler "${targetTiddler}"

Use this exact format with the headings.`;
    } else {
      // Regular Q&A prompt
      systemPrompt = `You are a knowledgeable assistant that works with TiddlyWiki content. You are given references to tiddlers and will answer questions based on them.

Referenced tiddlers:
${referencedTiddlersText}

${customInstructions ? `Custom instructions:\n${customInstructions}\n` : ""}

Conversation so far:
${conversationLog}

User's question: ${userPrompt}

Respond directly and helpfully, focusing on the information from the referenced tiddlers.`;
    }
    
    try {
      let endpoint, headers, body;
      
      if (model.startsWith("gemini")) {
        const geminiApiKey = getApiKey('gemini');
        if (!geminiApiKey) {
          message.style.color = "#c00";
          message.textContent = "Please set your Gemini API key in the plugin settings or temporary tiddler.";
          return;
        }
        endpoint = (getGeminiApiUrl ? getGeminiApiUrl(model) : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`) + `?key=${encodeURIComponent(geminiApiKey)}`;
        headers = { "Content-Type": "application/json" };
        body = {
          contents: [
            { role: "user", parts: [{ text: systemPrompt }] }
          ],
          generationConfig: {
            temperature: temperature,
            topP: top_p
          }
        };
      } else if (model.startsWith("claude")) {
        const anthropicApiKey = getApiKey('anthropic');
        if (!anthropicApiKey) {
          message.style.color = "#c00";
          message.textContent = "Please set your Anthropic API key in the plugin settings or temporary tiddler.";
          return;
        }
        endpoint = ANTHROPIC_API_URL;
        headers = {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01"
        };
        body = {
          model: model,
          max_tokens: 2048,
          temperature: temperature,
          top_p: top_p,
          messages: [{ role: "user", content: systemPrompt }]
        };
      } else {
        const apiKey = getApiKey('openai');
        if (!apiKey) {
          message.style.color = "#c00";
          message.textContent = "Please set your OpenAI API key in the plugin settings or temporary tiddler.";
          return;
        }
        endpoint = CHAT_COMPLETION_URL;
        headers = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        };
        body = {
          model: model,
          temperature: temperature,
          top_p: top_p,
          messages: [
            { role: "system", content: systemPrompt }
          ]
        };
      }
      
      let resp;
      let connection;
      try {
        connection = await pool.acquire();
        resp = await connection.fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });
      } finally {
        if (connection) pool.release(connection);
      }
      
      let data;
      const contentType = resp.headers.get("content-type") || "";
      if (resp.ok && contentType.includes("application/json")) {
        data = await resp.json();
      } else {
        const errorText = await resp.text();
        throw new Error(
          `API Error (${resp.status}): ${errorText || resp.statusText || "No response body"}`
        );
      }
      
      let resultContent = "";
      if (model.startsWith("gemini")) {
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
          resultContent = data.candidates[0].content.parts[0].text.trim();
        } else {
          throw new Error(data.error?.message || "Gemini API error.");
        }
      } else if (model.startsWith("claude")) {
        if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
          resultContent = data.content[0].text.trim();
        } else if (typeof data.content === "string") {
          resultContent = data.content.trim();
        } else {
          throw new Error(data.error?.message || "Anthropic API error.");
        }
      } else {
        if (data.error) throw new Error(data.error.message || "Unknown API error.");
        resultContent = data.choices[0].message.content.trim();
      }
      
      // Process result if target tiddler is provided
      if (targetTiddler) {
        // Split response into chat part and tiddler content part
        let chatResponse = resultContent;
        let tiddlerContent = resultContent;
        
        // Try to extract parts using format markers
        const chatMarker = "[Chat Response]";
        const tiddlerMarker = "[Tiddler Content]";
        
        if (resultContent.includes(chatMarker) && resultContent.includes(tiddlerMarker)) {
          const chatStart = resultContent.indexOf(chatMarker) + chatMarker.length;
          const tiddlerStart = resultContent.indexOf(tiddlerMarker) + tiddlerMarker.length;
          
          if (chatStart < tiddlerStart) {
            chatResponse = resultContent.substring(chatStart, resultContent.indexOf(tiddlerMarker)).trim();
            tiddlerContent = resultContent.substring(tiddlerStart).trim();
          } else {
            chatResponse = resultContent.substring(chatStart).trim();
            tiddlerContent = resultContent.substring(tiddlerStart, resultContent.indexOf(chatMarker)).trim();
          }
        }
        
        // Update target tiddler
        const existingTiddler = $tw.wiki.getTiddler(targetTiddler);
        let newText = tiddlerContent;
        
        if (updateMode === "append" && existingTiddler && existingTiddler.fields.text) {
          newText = existingTiddler.fields.text.trim() + "\n\n" + tiddlerContent;
        }
        
        $tw.wiki.addTiddler(new $tw.Tiddler(
          existingTiddler || {},
          {
            title: targetTiddler,
            text: newText
          }
        ));
        
        // Display chat response
        appendChatMessage("agent", chatResponse);
        message.style.color = "#090";
        message.textContent = `Response received and tiddler "${targetTiddler}" ${updateMode === "append" ? "updated" : "created"}.`;
      } else {
        // Just display the response in chat
        appendChatMessage("agent", resultContent);
        message.style.color = "#090";
        message.textContent = "Response received.";
      }
      
    } catch (err) {
      console.error("Error:", err);
      message.style.color = "#c00";
      message.textContent = err.message;
    }
  });

  // Add to DOM
  if (this.domNodes.length === 0) {
    parent.insertBefore(container, nextSibling);
    this.domNodes.push(container);
  } else {
    this.refreshSelf();
  }
};

TiddlywikiReferenceAgentWidget.prototype.refresh = function(changedTiddlers) {
  this.refreshChildren(changedTiddlers);
};

exports["tiddlywiki-reference-agent-widget"] = TiddlywikiReferenceAgentWidget; 