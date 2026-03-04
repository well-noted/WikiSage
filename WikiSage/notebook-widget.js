/*\
created: 20250529184113992
title: $:/plugins/NoteStreams/WikiSage/notebook-widget.js
tags: 
modified: 20260223010744745
type: application/javascript
module-type: widget
\*/

var Widget = require("$:/core/modules/widgets/widget.js").widget;
const { getGeminiApiUrl } = require("./widget.js");
const { ConnectionPool } = require("./connection-pool.js");
const { getLocalChatCompletionUrl, getLocalModelName } = require("./utils.js");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CHAT_COMPLETION_URL = "https://api.openai.com/v1/chat/completions";

const pool = new ConnectionPool({ maxSize: 5 });

// Helper method to retrieve API keys based on storage preference
function getApiKey(type = 'openai') {
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
    case 'local':
      apiKeyTiddler = "$:/plugins/NoteStreams/WikiSage/local-llm-api-key";
      tempApiKeyTiddler = "$:/temp/WikiSage/local-llm-api-key";
      break;
    case 'openai':
    default:
      apiKeyTiddler = "$:/plugins/NoteStreams/WikiSage/openai-api-key";
      tempApiKeyTiddler = "$:/temp/WikiSage/openai-api-key";
      break;
  }
  
  if (useTemporaryStorage) {
    const tempKey = $tw.wiki.getTiddlerText(tempApiKeyTiddler, "").trim();
    if (tempKey) {
      return tempKey;
    }
  }
  
  return $tw.wiki.getTiddlerText(apiKeyTiddler, "").trim();
}

function NotebookWidget(parseTreeNode, options) {
  this.initialise(parseTreeNode, options);
}

NotebookWidget.prototype = new Widget();

NotebookWidget.prototype.render = function(parent, nextSibling) {
  if (!$tw.browser) return;
  this.parentDomNode = parent;
  this.computeAttributes();
  this.execute();
  
  // Create the button that will open the modal
  const button = $tw.utils.domMaker("button", {
    text: this.getAttribute("text", "📚 Open Notebook"),
    class: "Notebook-open-button " + this.getAttribute("class", ""),
    style: {
      padding: "8px 16px",
      background: "#1a73e8",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      fontWeight: "500",
      cursor: "pointer",
      fontSize: "14px",
      display: "inline-flex",
      alignItems: "center",
      gap: "8px"
    }
  });
  
  // Apply custom styles if provided
  if (this.getAttribute("style")) {
    const customStyles = this.getAttribute("style").split(";");
    customStyles.forEach(style => {
      const [key, value] = style.split(":").map(s => s.trim());
      if (key && value) {
        button.style[key] = value;
      }
    });
  }
  
  // Add hover effect
  button.addEventListener("mouseenter", () => {
    button.style.background = "#1557b0";
  });
  
  button.addEventListener("mouseleave", () => {
    button.style.background = "#1a73e8";
  });
  
  // Click handler to open modal
  button.addEventListener("click", () => {
    this.createModal();
  });
  
  // Add to DOM
  if (this.domNodes.length === 0) {
    parent.insertBefore(button, nextSibling);
    this.domNodes.push(button);
  } else {
    this.refreshSelf();
  }
};

NotebookWidget.prototype.createModal = function() {
  const parentWidget = this;
  const selectedSources = new Set();
  const activeFilters = new Set();
  let researchNotes = [];
  let conversationHistory = [];
  let isDarkMode = false;

  // Get the current tiddler title (or use a default state tiddler)
  const stateTiddlerTitle = this.getAttribute("tiddler", this.getVariable("currentTiddler"));
  
  // Create modal backdrop
  const modalBackdrop = $tw.utils.domMaker("div", {
    class: "Notebook-modal-backdrop",
    style: {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0, 0, 0, 0.5)",
      zIndex: "9999",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      overflow: "auto"
    }
  });
  
  // Create modal container
  const modalContainer = $tw.utils.domMaker("div", {
    class: "Notebook-modal-container",
    style: {
      position: "relative",
      maxWidth: "90vw",
      maxHeight: "90vh",
      width: "1400px",
      background: "#fff",
      borderRadius: "12px",
      boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  });
  
  // Add modal header with close button
  const modalHeader = $tw.utils.domMaker("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 20px",
      borderBottom: "1px solid #e0e0e0",
      background: "#f8f9fa"
    }
  });
  
  const modalTitle = $tw.utils.domMaker("h2", {
    text: "Notebook Research Assistant",
    style: {
      margin: "0",
      fontSize: "20px",
      fontWeight: "500",
      color: "#202124"
    }
  });
  modalHeader.appendChild(modalTitle);
  
  const closeButton = $tw.utils.domMaker("button", {
    text: "✕",
    style: {
      background: "none",
      border: "none",
      fontSize: "24px",
      cursor: "pointer",
      color: "#5f6368",
      padding: "4px 8px",
      borderRadius: "4px"
    }
  });
  
  closeButton.addEventListener("mouseenter", () => {
    closeButton.style.background = "#e0e0e0";
  });
  
  closeButton.addEventListener("mouseleave", () => {
    closeButton.style.background = "none";
  });
  
  const closeModal = () => {
    document.body.removeChild(modalBackdrop);
  };
  
  closeButton.addEventListener("click", closeModal);
  modalHeader.appendChild(closeButton);
  modalContainer.appendChild(modalHeader);
  
  // Create scrollable content area
  const modalContent = $tw.utils.domMaker("div", {
    style: {
      flex: "1",
      overflow: "auto",
      padding: "16px"
    }
  });
  
  // Helper function to load state from tiddler
  function loadStateFromTiddler() {
    const tiddler = $tw.wiki.getTiddler(stateTiddlerTitle);
    if (!tiddler) return;
    
    // Load sources
    const sourcesField = tiddler.fields["Notebook-sources"];
    if (sourcesField) {
      try {
        const sources = JSON.parse(sourcesField);
        sources.forEach(source => selectedSources.add(source));
      } catch (e) {
        // Fallback to space-separated format
        sourcesField.split(" ").forEach(source => {
          if (source) selectedSources.add(source);
        });
      }
    }
    
    // Load research notes
    const researchField = tiddler.fields["Notebook-research"];
    if (researchField) {
      try {
        researchNotes = JSON.parse(researchField);
      } catch (e) {
        researchNotes = [];
      }
    }
    
    // Load conversation history
    const conversationField = tiddler.fields["Notebook-conversation"];
    if (conversationField) {
      try {
        conversationHistory = JSON.parse(conversationField);
      } catch (e) {
        conversationHistory = [];
      }
    }
    
    // Load settings
    const settingsField = tiddler.fields["Notebook-settings"];
    if (settingsField) {
      try {
        const settings = JSON.parse(settingsField);
        if (settings.model && modelPicker) modelPicker.value = settings.model;
        if (settings.temperature !== undefined) temperature = settings.temperature;
        if (settings.darkMode !== undefined) isDarkMode = settings.darkMode;
      } catch (e) {}
    }
  }

  // Helper function to save state to tiddler
  function saveStateToTiddler() {
    const tiddler = $tw.wiki.getTiddler(stateTiddlerTitle) || new $tw.Tiddler({ title: stateTiddlerTitle });
    
    const fields = {
      ...tiddler.fields,
      "Notebook-sources": JSON.stringify(Array.from(selectedSources)),
      "Notebook-research": JSON.stringify(researchNotes),
      "Notebook-conversation": JSON.stringify(conversationHistory),
      "Notebook-settings": JSON.stringify({
        model: modelPicker.value,
        temperature: temperature,
        darkMode: isDarkMode
      })
    };
    
    $tw.wiki.addTiddler(new $tw.Tiddler(fields));
  }

  // Add comprehensive CSS for dark theme
  const styleElement = $tw.utils.domMaker("style", {
    innerHTML: `
      .Notebook-widget-container {
        transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
      }
      
      .Notebook-widget-container.dark-theme {
        background: #1e1e1e !important;
        color: #e0e0e0 !important;
        border-color: #333 !important;
      }
      
      .Notebook-modal-container.dark-theme {
        background: #1e1e1e !important;
      }
      
      .Notebook-modal-container.dark-theme .Notebook-widget-container {
        border: none !important;
        box-shadow: none !important;
      }
      
      .Notebook-modal-container.dark-theme > div:first-child {
        background: #2a2a2a !important;
        border-bottom-color: #444 !important;
      }
      
      .Notebook-modal-container.dark-theme h2,
      .Notebook-modal-container.dark-theme h3 {
        color: #e0e0e0 !important;
      }
      
      .Notebook-widget-container.dark-theme h2,
      .Notebook-widget-container.dark-theme h3 {
        color: #e0e0e0 !important;
      }
      
      .Notebook-widget-container.dark-theme .header-divider {
        border-bottom-color: #444 !important;
      }
      
      .Notebook-widget-container.dark-theme input,
      .Notebook-widget-container.dark-theme select,
      .Notebook-widget-container.dark-theme textarea {
        background: #2a2a2a !important;
        color: #e0e0e0 !important;
        border-color: #444 !important;
      }
      
      .Notebook-widget-container.dark-theme .research-note,
      .Notebook-widget-container.dark-theme .conversation-message {
        background: #2a2a2a !important;
        border-color: #444 !important;
        color: #e0e0e0 !important;
      }
      
      .Notebook-widget-container.dark-theme .selected-sources {
        background: #2a2a2a !important;
        border-color: #444 !important;
      }
      
      .Notebook-widget-container.dark-theme .source-selector,
      .Notebook-widget-container.dark-theme .notebook-summary {
        background: #252525 !important;
        border-color: #444 !important;
      }
      
      .Notebook-widget-container.dark-theme .status-bar {
        background: #2a2a2a !important;
        color: #b0b0b0 !important;
      }
      
      .Notebook-widget-container.dark-theme .research-area {
        background: #252525 !important;
        border-color: #444 !important;
      }
      
      .Notebook-widget-container.dark-theme .source-tag {
        background: #2a4a7f !important;
        border-color: #4a8fff !important;
        color: #b0d0ff !important;
      }
      
      .Notebook-widget-container.dark-theme button {
        transition: background-color 0.2s ease;
      }
      
      .Notebook-widget-container.dark-theme button:not(.primary-button):not(.danger-button):not(.success-button):not(.warning-button) {
        background: #3a3a3a !important;
        color: #e0e0e0 !important;
        border-color: #555 !important;
      }
      
      .Notebook-widget-container.dark-theme button:not(.primary-button):not(.danger-button):not(.success-button):not(.warning-button):hover {
        background: #4a4a4a !important;
      }
      
      .Notebook-widget-container.dark-theme .toggle-active {
        background: #1a73e8 !important;
        color: #fff !important;
      }
      
      .Notebook-widget-container.dark-theme .settings-dropdown {
        background: #2a2a2a !important;
        border-color: #444 !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
      }
      
      .Notebook-widget-container.dark-theme .conversation-area {
        background: #252525 !important;
        border-color: #444 !important;
      }
      
      .Notebook-widget-container.dark-theme .message-user {
        background: #1e3a5f !important;
      }
      
      .Notebook-widget-container.dark-theme .message-assistant {
        background: #2a2a2a !important;
      }
    `
  });
  
  if (!document.querySelector("#Notebook-dark-mode-styles")) {
    styleElement.id = "Notebook-dark-mode-styles";
    document.head.appendChild(styleElement);
  }

  // Main container with three columns
  const container = $tw.utils.domMaker("div", {
    class: "Notebook-widget-container",
    style: {
      display: "grid",
      gridTemplateColumns: "300px 1fr 300px",
      gap: "16px",
      width: "100%",
      maxWidth: "1400px",
      border: "1px solid #e0e0e0",
      borderRadius: "8px",
      padding: "16px",
      background: "#ffffff",
      color: "#202124",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
    }
  });

  // Header spanning all columns
  const header = $tw.utils.domMaker("div", {
    class: "header-divider",
    style: {
      gridColumn: "1 / -1",
      display: "flex",
      alignItems: "center",
      marginBottom: "12px",
      paddingBottom: "12px",
      borderBottom: "1px solid #e0e0e0"
    }
  });

  const title = $tw.utils.domMaker("h2", {
    text: "Research Interface",
    style: {
      margin: "0",
      fontSize: "18px",
      fontWeight: "500",
      color: "#202124",
      flex: "1"
    }
  });
  header.appendChild(title);

  // Model picker dropdown
  const modelPicker = $tw.utils.domMaker("select", {
    class: "model-picker",
    style: {
      padding: "6px 10px",
      borderRadius: "4px",
      border: "1px solid #dadce0",
      background: "#fff",
      color: "#202124",
      fontSize: "14px"
    }
  });
  
  modelPicker.addEventListener("change", saveStateToTiddler);
  
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
  header.appendChild(modelPicker);

  // Dark/Light Theme Toggle
  const themeToggle = $tw.utils.domMaker("button", {
    text: "🌙",
    style: {
      padding: "6px 10px",
      marginLeft: "8px",
      borderRadius: "4px",
      border: "1px solid #dadce0",
      background: "#fff",
      cursor: "pointer",
      fontSize: "16px"
    }
  });

  themeToggle.addEventListener("click", () => {
    isDarkMode = !isDarkMode;
    container.classList.toggle("dark-theme", isDarkMode);
    modalContainer.classList.toggle("dark-theme", isDarkMode);
    themeToggle.textContent = isDarkMode ? "☀️" : "🌙";
    
    // Update theme toggle button style
    if (isDarkMode) {
      themeToggle.style.background = "#3a3a3a";
      themeToggle.style.borderColor = "#555";
    } else {
      themeToggle.style.background = "#fff";
      themeToggle.style.borderColor = "#dadce0";
    }
    
    saveStateToTiddler();
  });
  header.appendChild(themeToggle);

  container.appendChild(header);

  // Left column - Resources
  const leftColumn = $tw.utils.domMaker("div", {
    class: "resources-column",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      overflowY: "auto",
      maxHeight: "600px"
    }
  });

  // Notebook Summary Panel
  const notebookSummary = $tw.utils.domMaker("div", {
    class: "notebook-summary",
    style: {
      background: "#f8f9fa",
      padding: "12px",
      borderRadius: "6px",
      marginBottom: "12px",
      border: "1px solid #e0e0e0"
    }
  });

  const summaryContent = $tw.utils.domMaker("div", {
    innerHTML: `
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #1a73e8;">Resources</h3>
      <p style="margin: 4px 0; font-size: 14px;">Sources: <span id="source-count" style="font-weight: bold;">0</span></p>
      <p style="margin: 4px 0; font-size: 14px;">Total content: <span id="word-count" style="font-weight: bold;">0</span> words</p>
    `
  });
  notebookSummary.appendChild(summaryContent);
  leftColumn.appendChild(notebookSummary);

  // Source selector
  const sourceSelector = $tw.utils.domMaker("div", {
    class: "source-selector",
    style: {
      border: "1px solid #dadce0",
      borderRadius: "4px",
      padding: "12px",
      marginBottom: "8px",
      background: "#f8f9fa"
    }
  });

  // Source input
  const sourceInputRow = $tw.utils.domMaker("div", {
    style: {
      display: "flex",
      gap: "8px",
      marginBottom: "8px"
    }
  });
  
  const sourceInput = $tw.utils.domMaker("input", {
    class: "source-input",
    attributes: {
      placeholder: "Add source..."
    },
    style: {
      flex: "1",
      padding: "8px",
      borderRadius: "4px",
      border: "1px solid #dadce0",
      fontSize: "14px"
    }
  });
  sourceInputRow.appendChild(sourceInput);
  
  const addSourceBtn = $tw.utils.domMaker("button", {
    text: "+",
    class: "primary-button",
    style: {
      padding: "8px 12px",
      borderRadius: "4px",
      border: "none",
      background: "#1a73e8",
      color: "#fff",
      fontWeight: "500",
      cursor: "pointer",
      fontSize: "14px"
    }
  });
  sourceInputRow.appendChild(addSourceBtn);
  
  sourceSelector.appendChild(sourceInputRow);

  // Quick filter toggles
  const quickFilters = $tw.utils.domMaker("div", {
    style: {
      marginTop: "8px",
      display: "flex",
      gap: "6px",
      flexWrap: "wrap"
    }
  });

  const quickFilterButtons = [
    { label: "Recent", filter: "[days:created[-7]]" },
    { label: "Today", filter: "[days:modified[0]]" },
    { label: "Has text", filter: "[has[text]!is[system]]" }
  ];

  quickFilterButtons.forEach(btn => {
    const filterBtn = $tw.utils.domMaker("button", {
      text: btn.label,
      class: "quick-filter-toggle",
      style: {
        padding: "4px 8px",
        fontSize: "12px",
        border: "1px solid #dadce0",
        borderRadius: "4px",
        background: "#fff",
        color: "#5f6368",
        cursor: "pointer"
      }
    });
    
    filterBtn.addEventListener("click", () => {
      if (activeFilters.has(btn.filter)) {
        // Remove filter
        activeFilters.delete(btn.filter);
        filterBtn.classList.remove("toggle-active");
        filterBtn.style.background = isDarkMode ? "#3a3a3a" : "#fff";
        filterBtn.style.color = isDarkMode ? "#e0e0e0" : "#5f6368";
        // Remove matching sources
        const titles = $tw.wiki.filterTiddlers(btn.filter);
        titles.forEach(title => selectedSources.delete(title));
      } else {
        // Add filter
        activeFilters.add(btn.filter);
        filterBtn.classList.add("toggle-active");
        filterBtn.style.background = "#1a73e8";
        filterBtn.style.color = "#fff";
        // Add matching sources
        const titles = $tw.wiki.filterTiddlers(btn.filter);
        titles.forEach(title => {
          if (!title.startsWith("$:/")) selectedSources.add(title);
        });
      }
      updateSourcesDisplay();
      updateNotebookSummary();
      saveStateToTiddler();
    });
    
    quickFilters.appendChild(filterBtn);
  });

  sourceSelector.appendChild(quickFilters);

  // Selected sources display
  const selectedSourcesDisplay = $tw.utils.domMaker("div", {
    class: "selected-sources",
    style: {
      minHeight: "40px",
      maxHeight: "200px",
      overflowY: "auto",
      background: "#fff",
      padding: "8px",
      borderRadius: "4px",
      border: "1px solid #e0e0e0",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      marginTop: "8px"
    }
  });
  sourceSelector.appendChild(selectedSourcesDisplay);

  leftColumn.appendChild(sourceSelector);

  // Center column - Interactive conversation
  const centerColumn = $tw.utils.domMaker("div", {
    class: "conversation-column",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    }
  });

  const conversationHeader = $tw.utils.domMaker("h3", {
    text: "Conversation",
    style: {
      margin: "0 0 8px 0",
      fontSize: "16px",
      color: "#1a73e8"
    }
  });
  centerColumn.appendChild(conversationHeader);

  // Conversation area
  const conversationArea = $tw.utils.domMaker("div", {
    class: "conversation-area",
    style: {
      flex: "1",
      minHeight: "400px",
      maxHeight: "500px",
      overflowY: "auto",
      background: "#f8f9fa",
      border: "1px solid #e0e0e0",
      borderRadius: "4px",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    }
  });
  centerColumn.appendChild(conversationArea);

  // Query input
  const promptInput = $tw.utils.domMaker("textarea", {
    class: "research-prompt-input",
    attributes: {
      placeholder: "Ask anything about your sources...",
      rows: "3"
    },
    style: {
      width: "100%",
      padding: "10px",
      border: "1px solid #dadce0",
      borderRadius: "4px",
      fontSize: "14px",
      fontFamily: "inherit",
      resize: "vertical"
    }
  });
  centerColumn.appendChild(promptInput);

  // Control buttons
  const controlButtons = $tw.utils.domMaker("div", {
    style: {
      display: "flex",
      gap: "8px",
      marginTop: "8px"
    }
  });

  const askBtn = $tw.utils.domMaker("button", {
    text: "Send",
    class: "primary-button",
    style: {
      padding: "8px 24px",
      border: "none",
      borderRadius: "4px",
      background: "#1a73e8",
      color: "#fff",
      fontWeight: "500",
      fontSize: "14px",
      cursor: "pointer"
    }
  });
  controlButtons.appendChild(askBtn);

  const exportConvBtn = $tw.utils.domMaker("button", {
    text: "Export Conversation",
    class: "success-button",
    style: {
      padding: "8px 16px",
      background: "#34a853",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px"
    }
  });
  controlButtons.appendChild(exportConvBtn);

  const clearConvBtn = $tw.utils.domMaker("button", {
    text: "Clear",
    style: {
      padding: "8px 16px",
      border: "1px solid #dadce0",
      borderRadius: "4px",
      background: "#fff",
      color: "#5f6368",
      fontSize: "14px",
      cursor: "pointer"
    }
  });
  controlButtons.appendChild(clearConvBtn);

  centerColumn.appendChild(controlButtons);

  // Right column - Generated content
  const rightColumn = $tw.utils.domMaker("div", {
    class: "generated-content-column",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      overflowY: "auto",
      maxHeight: "600px"
    }
  });

  const generatedHeader = $tw.utils.domMaker("h3", {
    text: "Generated Content",
    style: {
      margin: "0 0 8px 0",
      fontSize: "16px",
      color: "#1a73e8"
    }
  });
  rightColumn.appendChild(generatedHeader);

  // Feature buttons
  const featureButtons = $tw.utils.domMaker("div", {
    style: { 
      display: "flex", 
      gap: "8px", 
      marginBottom: "12px", 
      flexWrap: "wrap",
      flexDirection: "column"
    }
  });

  const insightsBtn = $tw.utils.domMaker("button", {
    text: "💡 Extract Key Insights",
    class: "primary-button",
    style: {
      padding: "8px 16px",
      background: "#4285f4",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      fontWeight: "500",
      cursor: "pointer",
      fontSize: "14px"
    }
  });

  const studyGuideBtn = $tw.utils.domMaker("button", {
    text: "📖 Generate Study Guide",
    class: "success-button",
    style: {
      padding: "8px 16px",
      background: "#34a853",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      fontWeight: "500",
      cursor: "pointer",
      fontSize: "14px"
    }
  });

  const summaryBtn = $tw.utils.domMaker("button", {
    text: "📋 Generate Summary",
    class: "danger-button",
    style: {
      padding: "8px 16px",
      background: "#ea4335",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      fontWeight: "500",
      cursor: "pointer",
      fontSize: "14px"
    }
  });

  const faqBtn = $tw.utils.domMaker("button", {
    text: "❓ Generate FAQ",
    class: "warning-button",
    style: {
      padding: "8px 16px",
      background: "#fbbc04",
      color: "#202124",
      border: "none",
      borderRadius: "4px",
      fontWeight: "500",
      cursor: "pointer",
      fontSize: "14px"
    }
  });

  const exportResearchBtn = $tw.utils.domMaker("button", {
    text: "📥 Export Research",
    style: {
      padding: "8px 16px",
      background: "#9c27b0",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      fontWeight: "500",
      cursor: "pointer",
      fontSize: "14px"
    }
  });

  featureButtons.appendChild(insightsBtn);
  featureButtons.appendChild(studyGuideBtn);
  featureButtons.appendChild(summaryBtn);
  featureButtons.appendChild(faqBtn);
  featureButtons.appendChild(exportResearchBtn);
  rightColumn.appendChild(featureButtons);

  // Research area for generated content
  const researchArea = $tw.utils.domMaker("div", {
    class: "research-area",
    style: {
      flex: "1",
      background: "#f8f9fa",
      border: "1px solid #e0e0e0",
      borderRadius: "4px",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      overflowY: "auto"
    }
  });
  rightColumn.appendChild(researchArea);

  // Add columns to container
  container.appendChild(leftColumn);
  container.appendChild(centerColumn);
  container.appendChild(rightColumn);

  // Settings and message area (spanning all columns)
  const bottomRow = $tw.utils.domMaker("div", {
    style: {
      gridColumn: "1 / -1",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "12px"
    }
  });

  // API Settings
  const settingsBtn = $tw.utils.domMaker("button", {
    text: "⚙️ Settings",
    style: {
      padding: "6px 12px",
      border: "1px solid #dadce0",
      borderRadius: "4px",
      background: "#fff",
      color: "#5f6368",
      fontSize: "13px",
      cursor: "pointer"
    }
  });

  const settingsDropdown = $tw.utils.domMaker("div", {
    class: "settings-dropdown",
    style: {
      display: "none",
      position: "absolute",
      zIndex: "1000",
      padding: "12px 15px",
      background: "#fff",
      color: "#202124",
      border: "1px solid #dadce0",
      borderRadius: "4px",
      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
      marginTop: "5px",
      width: "300px"
    }
  });

  // API settings
  let temperature = 0.7;
  let top_p = 1.0;

  // Temperature control
  const tempRow = $tw.utils.domMaker("div", {
    style: { marginBottom: "12px" }
  });
  const tempLabel = $tw.utils.domMaker("label", {
    text: "Temperature: ",
    style: { fontWeight: "500", marginRight: "8px", fontSize: "14px" }
  });
  const tempValue = $tw.utils.domMaker("span", {
    text: temperature.toFixed(2),
    style: { marginLeft: "6px", fontFamily: "monospace", fontSize: "14px" }
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
    saveStateToTiddler();
  });
  tempRow.appendChild(tempLabel);
  tempRow.appendChild(tempSlider);
  tempRow.appendChild(tempValue);
  settingsDropdown.appendChild(tempRow);

  settingsBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    settingsDropdown.style.display = settingsDropdown.style.display === "none" ? "block" : "none";
  });

  document.addEventListener("click", function(e) {
    if (!settingsDropdown.contains(e.target) && e.target !== settingsBtn) {
      settingsDropdown.style.display = "none";
    }
  });

  bottomRow.appendChild(settingsBtn);
  bottomRow.appendChild(settingsDropdown);

  // Message area
  const message = $tw.utils.domMaker("div", {
    class: "research-message",
    style: {
      color: "#ea4335",
      fontSize: "13px"
    }
  });
  bottomRow.appendChild(message);

  container.appendChild(bottomRow);

  // Helper to create source tags
  function createSourceTag(title) {
    const tagElement = $tw.utils.domMaker("div", {
      class: "source-tag",
      style: {
        background: "#e8f0fe",
        border: "1px solid #1a73e8",
        color: "#1967d2",
        padding: "4px 8px",
        borderRadius: "4px",
        fontSize: "13px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "6px"
      }
    });
    
    const titleSpan = $tw.utils.domMaker("span", {
      text: title,
      style: { overflow: "hidden", textOverflow: "ellipsis" }
    });
    tagElement.appendChild(titleSpan);
    
    const removeBtn = document.createElement("span");
    removeBtn.innerHTML = "✕";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.fontWeight = "bold";
    removeBtn.style.fontSize = "12px";
    
    removeBtn.addEventListener("click", () => {
      selectedSources.delete(title);
      tagElement.remove();
      updateNotebookSummary();
      saveStateToTiddler();
    });
    
    tagElement.appendChild(removeBtn);
    return tagElement;
  }

  // Update sources display
  function updateSourcesDisplay() {
    selectedSourcesDisplay.innerHTML = "";
    selectedSources.forEach(title => {
      selectedSourcesDisplay.appendChild(createSourceTag(title));
    });
  }

  // Function to update notebook summary
  function updateNotebookSummary() {
    const sourceCount = document.getElementById("source-count");
    const wordCount = document.getElementById("word-count");
    
    sourceCount.textContent = selectedSources.size;
    
    let totalWords = 0;
    selectedSources.forEach(title => {
      const text = $tw.wiki.getTiddlerText(title) || "";
      totalWords += text.split(/\s+/).length;
    });
    wordCount.textContent = totalWords;
  }

  // Add source button handler
  addSourceBtn.addEventListener("click", () => {
    const input = sourceInput.value.trim();
    if (!input) return;
    
    if (input.startsWith("[")) {
      try {
        const titles = $tw.wiki.filterTiddlers(input);
        let addedCount = 0;
        titles.forEach(title => {
          if (!title.startsWith("$:/") && !selectedSources.has(title)) {
            selectedSources.add(title);
            addedCount++;
          }
        });
        updateSourcesDisplay();
        updateNotebookSummary();
        saveStateToTiddler();
        message.textContent = `Added ${addedCount} tiddlers`;
        message.style.color = "#34a853";
      } catch (e) {
        message.textContent = `Error: ${e.message}`;
        message.style.color = "#ea4335";
      }
    } else {
      if (!$tw.wiki.tiddlerExists(input)) {
        message.textContent = `Tiddler '${input}' does not exist`;
        message.style.color = "#ea4335";
        return;
      }
      
      if (!selectedSources.has(input)) {
        selectedSources.add(input);
        updateSourcesDisplay();
        updateNotebookSummary();
        saveStateToTiddler();
        message.textContent = `Added '${input}'`;
        message.style.color = "#34a853";
      }
    }
    
    sourceInput.value = "";
  });

  // Allow Enter to add source
  sourceInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addSourceBtn.click();
    }
  });

  // Function to render conversation messages
  function renderConversation() {
    conversationArea.innerHTML = "";
    conversationHistory.forEach(msg => {
      const msgDiv = $tw.utils.domMaker("div", {
        class: `conversation-message message-${msg.role}`,
        style: {
          background: msg.role === "user" ? "#e3f2fd" : "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          padding: "8px 12px",
          marginBottom: "8px"
        }
      });
      
      const roleSpan = $tw.utils.domMaker("div", {
        text: msg.role === "user" ? "You:" : "Assistant:",
        style: {
          fontWeight: "500",
          color: msg.role === "user" ? "#1565c0" : "#5f6368",
          marginBottom: "4px",
          fontSize: "13px"
        }
      });
      
      const contentDiv = $tw.utils.domMaker("div", {
        text: msg.content,
        style: { whiteSpace: "pre-wrap", lineHeight: "1.5" }
      });
      
      msgDiv.appendChild(roleSpan);
      msgDiv.appendChild(contentDiv);
      conversationArea.appendChild(msgDiv);
    });
    conversationArea.scrollTop = conversationArea.scrollHeight;
  }

  // Function to render research notes
  function renderResearchNotes() {
    researchArea.innerHTML = "";
    researchNotes.forEach(note => {
      appendResearchNote(note.query, note.response, note.sources, note.isSpecialFeature, false);
    });
  }

  // Helper function to append research note
  function appendResearchNote(query, response, sources, isSpecialFeature = false, saveState = true) {
    const noteDiv = $tw.utils.domMaker("div", {
      class: "research-note",
      style: {
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "8px"
      }
    });
    
    const queryDiv = $tw.utils.domMaker("div", {
      style: { fontWeight: "500", color: isSpecialFeature ? "#34a853" : "#1a73e8", marginBottom: "8px" }
    });
    queryDiv.textContent = query;
    
    const responseDiv = $tw.utils.domMaker("div", {
      style: { marginBottom: "8px", lineHeight: "1.5", whiteSpace: "pre-wrap" }
    });
    responseDiv.textContent = response;
    
    const sourcesDiv = $tw.utils.domMaker("div", {
      style: { fontSize: "12px", color: "#5f6368" }
    });
    sourcesDiv.textContent = "Sources: " + sources.join(", ");
    
    noteDiv.appendChild(queryDiv);
    noteDiv.appendChild(responseDiv);
    noteDiv.appendChild(sourcesDiv);
    
    researchArea.appendChild(noteDiv);
    researchArea.scrollTop = researchArea.scrollHeight;
    
    if (saveState) {
      researchNotes.push({ query, response, sources, isSpecialFeature });
      saveStateToTiddler();
    }
  }

  // Get source documents content
  function getSourceDocuments() {
    const docs = [];
    selectedSources.forEach(title => {
      const content = $tw.wiki.getTiddlerText(title) || "";
      docs.push({ title, content });
    });
    return docs;
  }

  // Format source documents for prompt
  function formatSourceDocuments(docs) {
    return docs.map(doc => `--- Source: ${doc.title} ---\n${doc.content}`).join("\n\n");
  }

  // Export conversation popup
  exportConvBtn.addEventListener("click", () => {
    const popup = $tw.utils.domMaker("div", {
      style: {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: isDarkMode ? "#2a2a2a" : "#fff",
        color: isDarkMode ? "#e0e0e0" : "#202124",
        padding: "20px",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: "10000"
      }
    });
    
    const titleLabel = $tw.utils.domMaker("div", {
      text: "Export conversation as:",
      style: { marginBottom: "10px", fontWeight: "500" }
    });
    popup.appendChild(titleLabel);
    
    const titleInput = $tw.utils.domMaker("input", {
      attributes: { placeholder: "Enter tiddler name..." },
      style: { 
        width: "250px", 
        padding: "8px", 
        marginBottom: "10px",
        background: isDarkMode ? "#3a3a3a" : "#fff",
        color: isDarkMode ? "#e0e0e0" : "#202124",
        border: "1px solid " + (isDarkMode ? "#555" : "#dadce0"),
        borderRadius: "4px"
      }
    });
    popup.appendChild(titleInput);
    
    const checkboxContainer = $tw.utils.domMaker("div", {
      style: { marginBottom: "15px" }
    });
    
    const addToRefsCheckbox = $tw.utils.domMaker("input", {
      attributes: { type: "checkbox", id: "addToRefs" }
    });
    
    const checkboxLabel = $tw.utils.domMaker("label", {
      text: " Add to references list",
      attributes: { for: "addToRefs" },
      style: { marginLeft: "5px" }
    });
    
    checkboxContainer.appendChild(addToRefsCheckbox);
    checkboxContainer.appendChild(checkboxLabel);
    popup.appendChild(checkboxContainer);
    
    const buttonContainer = $tw.utils.domMaker("div", {
      style: { display: "flex", gap: "10px", justifyContent: "flex-end" }
    });
    
    const cancelBtn = $tw.utils.domMaker("button", {
      text: "Cancel",
      style: {
        padding: "8px 16px",
        background: isDarkMode ? "#3a3a3a" : "#fff",
        color: isDarkMode ? "#e0e0e0" : "#5f6368",
        border: "1px solid " + (isDarkMode ? "#555" : "#dadce0"),
        borderRadius: "4px",
        cursor: "pointer"
      }
    });
    
    cancelBtn.addEventListener("click", () => {
      document.body.removeChild(popup);
    });
    
    const saveBtn = $tw.utils.domMaker("button", {
      text: "Export",
      style: {
        padding: "8px 16px",
        background: "#1a73e8",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer"
      }
    });
    
    saveBtn.addEventListener("click", () => {
      const title = titleInput.value.trim();
      if (title) {
        let exportContent = `! Conversation Export\n\nCreated: ${new Date().toLocaleString()}\n\n`;
        exportContent += `!! Sources\n${Array.from(selectedSources).map(s => `* [[${s}]]`).join("\n")}\n\n`;
        exportContent += `!! Conversation\n\n`;
        
        conversationHistory.forEach(msg => {
          exportContent += `${msg.role === "user" ? "''You:''" : "''Assistant:''"}\n${msg.content}\n\n`;
        });
        
        const tiddlerFields = {
          title: title,
          text: exportContent,
          tags: ["Notebook Conversation"]
        };
        
        // Add to references if checkbox is checked
        if (addToRefsCheckbox.checked && stateTiddlerTitle) {
          const currentTiddler = $tw.wiki.getTiddler(stateTiddlerTitle);
          if (currentTiddler) {
            const refs = currentTiddler.fields.references || "";
            const refsList = refs ? refs.split(" ") : [];
            if (!refsList.includes(title)) {
              refsList.push(title);
              $tw.wiki.addTiddler(new $tw.Tiddler({
                ...currentTiddler.fields,
                references: refsList.join(" ")
              }));
            }
          }
        }
        
        $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
        
        // Add the exported conversation to resources
        selectedSources.add(title);
        updateSourcesDisplay();
        updateNotebookSummary();
        saveStateToTiddler();
        
        message.textContent = `Conversation exported to '${title}' and added to resources`;
        message.style.color = "#34a853";
        document.body.removeChild(popup);
      }
    });
    
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);
    popup.appendChild(buttonContainer);
    
    document.body.appendChild(popup);
    titleInput.focus();
  });

  // Clear conversation
  clearConvBtn.addEventListener("click", () => {
    conversationHistory = [];
    renderConversation();
    saveStateToTiddler();
    message.textContent = "Conversation cleared";
    message.style.color = "#5f6368";
  });

  // Export research
  exportResearchBtn.addEventListener("click", () => {
    const exportTitle = prompt("Enter a title for the export:");
    if (!exportTitle) return;
    
    let exportContent = `! Notebook Research Export\n\nCreated: ${new Date().toLocaleString()}\n\n`;
    exportContent += `!! Sources\n${Array.from(selectedSources).map(s => `* [[${s}]]`).join("\n")}\n\n`;
    exportContent += `!! Research Notes\n\n`;
    
    researchNotes.forEach(note => {
      exportContent += `!!! ${note.query}\n\n${note.response}\n\n//Sources: ${note.sources.join(", ")}//\n\n`;
    });
    
    // Create the tiddler
    $tw.wiki.addTiddler(new $tw.Tiddler({
      title: exportTitle,
      text: exportContent,
      tags: ["Notebook Export"]
    }));
    
    // Add the exported tiddler to sources
    selectedSources.add(exportTitle);
    updateSourcesDisplay();
    updateNotebookSummary();
    saveStateToTiddler();
    
    message.textContent = `Research exported to '${exportTitle}' and added to sources.`;
    message.style.color = "#34a853";
  });

  // Helper function for API calls
  async function makeAPICall(prompt, model, isConversation = false) {
    const apiKey = getApiKey();
    const geminiApiKey = getApiKey('gemini');
    const anthropicApiKey = getApiKey('anthropic');
    
    let endpoint, headers, body;
    
    if (model.startsWith("gemini")) {
      if (!geminiApiKey) throw new Error("Please set your Gemini API key");
      endpoint = (getGeminiApiUrl ? getGeminiApiUrl(model) : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`) + `?key=${encodeURIComponent(geminiApiKey)}`;
      headers = { "Content-Type": "application/json" };
      body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, topP: top_p }
      };
    } else if (model.startsWith("claude")) {
      if (!anthropicApiKey) throw new Error("Please set your Anthropic API key");
      endpoint = ANTHROPIC_API_URL;
      headers = {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      };
      body = {
        model: model,
        max_tokens: 2048,
        temperature,
        top_p,
        messages: [{ role: "user", content: prompt }]
      };
    } else if (model.startsWith("local:")) {
      const localUrl = getLocalChatCompletionUrl();
      if (!localUrl) throw new Error("Local LLM URL is not configured. Set $:/plugins/NoteStreams/WikiSage/local-llm-url");
      const localApiKey = getApiKey('local');
      endpoint = localUrl;
      headers = { "Content-Type": "application/json" };
      if (localApiKey) {
        headers["Authorization"] = `Bearer ${localApiKey}`;
      }
      
      if (isConversation) {
        const messages = [
          { 
            role: "system", 
            content: `You are an AI research assistant. You help users understand and synthesize information from their documents. Be conversational and helpful.`
          }
        ];
        conversationHistory.forEach(msg => {
          messages.push({
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content
          });
        });
        messages.push({ role: "user", content: prompt });
        body = {
          model: getLocalModelName(model),
          temperature,
          top_p,
          messages: messages
        };
      } else {
        body = {
          model: getLocalModelName(model),
          temperature,
          top_p,
          messages: [{ role: "system", content: prompt }]
        };
      }
    } else {
      if (!apiKey) throw new Error("Please set your OpenAI API key");
      endpoint = CHAT_COMPLETION_URL;
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      };
      
      if (isConversation) {
        // Build conversation messages for OpenAI format
        const messages = [
          { 
            role: "system", 
            content: `You are an AI research assistant. You help users understand and synthesize information from their documents. Be conversational and helpful.`
          }
        ];
        
        // Add conversation history
        conversationHistory.forEach(msg => {
          messages.push({
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content
          });
        });
        
        // Add current prompt
        messages.push({ role: "user", content: prompt });
        
        body = {
          model: model,
          temperature,
          top_p,
          messages: messages
        };
      } else {
        body = {
          model: model,
          temperature,
          top_p,
          messages: [{ role: "system", content: prompt }]
        };
      }
    }
    
    let connection;
    try {
      connection = await pool.acquire();
      const resp = await connection.fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`API Error (${resp.status}): ${errorText}`);
      }
      
      const data = await resp.json();
      
      if (model.startsWith("gemini")) {
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      } else if (model.startsWith("claude")) {
        return data.content?.[0]?.text?.trim() || data.content?.trim() || "";
      } else if (model.startsWith("local:")) {
        if (data.error) throw new Error(data.error.message || "Local LLM API error.");
        return data.choices?.[0]?.message?.content?.trim() || "";
      } else {
        return data.choices?.[0]?.message?.content?.trim() || "";
      }
    } finally {
      if (connection) pool.release(connection);
    }
  }

  // Ask button handler for conversation
  askBtn.addEventListener("click", async () => {
    const query = promptInput.value.trim();
    if (!query) {
      message.textContent = "Please enter a question.";
      return;
    }
    
    if (selectedSources.size === 0) {
      message.textContent = "Please select at least one source document.";
      return;
    }
    
    promptInput.value = "";
    message.textContent = "Thinking...";
    message.style.color = "#5f6368";
    
    // Add user message to conversation
    conversationHistory.push({ role: "user", content: query });
    renderConversation();
    
    try {
      const docs = getSourceDocuments();
      const sourcesText = formatSourceDocuments(docs);
      
      const contextPrompt = `Based on these source documents:\n\n${sourcesText}\n\nUser question: ${query}\n\nProvide a helpful response based on the sources. If the information isn't in the sources, say so.`;
      
      const response = await makeAPICall(contextPrompt, modelPicker.value, true);
      
      // Add assistant response to conversation
      conversationHistory.push({ role: "assistant", content: response });
      renderConversation();
      saveStateToTiddler();
      
      message.textContent = "";
    } catch (err) {
      message.textContent = err.message;
      message.style.color = "#ea4335";
      // Remove the user message if there was an error
      conversationHistory.pop();
      renderConversation();
    }
  });

  // Allow Enter to submit
  promptInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askBtn.click();
    }
  });

  // Feature button handlers
  insightsBtn.addEventListener("click", async () => {
    if (selectedSources.size === 0) {
      message.textContent = "Please select source documents first.";
      return;
    }
    
    message.textContent = "Extracting key insights...";
    message.style.color = "#5f6368";
    
    try {
      const docs = getSourceDocuments();
      const sourcesText = formatSourceDocuments(docs);
      
      const prompt = `Analyze these documents and extract the 5-10 most important insights, themes, or takeaways. Format as a numbered list with brief explanations. Look for patterns, key concepts, and significant findings.

${sourcesText}`;

      const response = await makeAPICall(prompt, modelPicker.value);
      appendResearchNote("💡 Key Insights from Sources", response, Array.from(selectedSources), true);
      message.textContent = "";
    } catch (err) {
      message.textContent = err.message;
      message.style.color = "#ea4335";
    }
  });

  studyGuideBtn.addEventListener("click", async () => {
    if (selectedSources.size === 0) {
      message.textContent = "Please select source documents first.";
      return;
    }
    
    message.textContent = "Generating study guide...";
    message.style.color = "#5f6368";
    
    try {
      const docs = getSourceDocuments();
      const sourcesText = formatSourceDocuments(docs);
      
      const prompt = `Create a comprehensive study guide from these sources. Include:

1. Key Concepts & Definitions
2. Main Themes
3. Critical Questions
4. Summary Points
5. Connections & Relationships

Format clearly with sections and subsections.

${sourcesText}`;

      const response = await makeAPICall(prompt, modelPicker.value);
      appendResearchNote("📖 Study Guide", response, Array.from(selectedSources), true);
      message.textContent = "";
    } catch (err) {
      message.textContent = err.message;
      message.style.color = "#ea4335";
    }
  });

  summaryBtn.addEventListener("click", async () => {
    if (selectedSources.size === 0) {
      message.textContent = "Please select source documents first.";
      return;
    }
    
    message.textContent = "Generating summary...";
    message.style.color = "#5f6368";
    
    try {
      const docs = getSourceDocuments();
      const sourcesText = formatSourceDocuments(docs);
      
      const prompt = `Provide a comprehensive summary of these documents. Include:

1. Overview
2. Main Points
3. Synthesis
4. Conclusion

Be thorough but concise.

${sourcesText}`;

      const response = await makeAPICall(prompt, modelPicker.value);
      appendResearchNote("📋 Summary of Sources", response, Array.from(selectedSources), true);
      message.textContent = "";
    } catch (err) {
      message.textContent = err.message;
      message.style.color = "#ea4335";
    }
  });

  faqBtn.addEventListener("click", async () => {
    if (selectedSources.size === 0) {
      message.textContent = "Please select source documents first.";
      return;
    }
    
    message.textContent = "Generating FAQ...";
    message.style.color = "#5f6368";
    
    try {
      const docs = getSourceDocuments();
      const sourcesText = formatSourceDocuments(docs);
      
      const prompt = `Based on these documents, create a comprehensive FAQ section with 10-15 questions and answers.

${sourcesText}`;

      const response = await makeAPICall(prompt, modelPicker.value);
      appendResearchNote("❓ Frequently Asked Questions", response, Array.from(selectedSources), true);
      message.textContent = "";
    } catch (err) {
      message.textContent = err.message;
      message.style.color = "#ea4335";
    }
  });

  // Add escape key handler to close modal
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);
  
  // Click backdrop to close
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) {
      closeModal();
    }
  });
  
  // Prevent modal content clicks from closing
  modalContainer.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  
  // Append container to modal
  modalContent.appendChild(container);
  modalContainer.appendChild(modalContent);
  modalBackdrop.appendChild(modalContainer);
  
  // Add modal to body
  document.body.appendChild(modalBackdrop);
  
  // Load saved state and initialize
  setTimeout(() => {
    loadStateFromTiddler();
    if (isDarkMode) {
      container.classList.add("dark-theme");
      modalContainer.classList.add("dark-theme");
      themeToggle.textContent = "☀️";
      themeToggle.style.background = "#3a3a3a";
      themeToggle.style.borderColor = "#555";
    }
    updateSourcesDisplay();
    updateNotebookSummary();
    renderResearchNotes();
    renderConversation();
    
    // Update filter button states
    const filterBtns = quickFilters.querySelectorAll('.quick-filter-toggle');
    filterBtns.forEach((btn, index) => {
      const filter = quickFilterButtons[index].filter;
      if (activeFilters.has(filter)) {
        btn.classList.add("toggle-active");
        btn.style.background = "#1a73e8";
        btn.style.color = "#fff";
      }
    });
  }, 100);
};

NotebookWidget.prototype.execute = function() {
  // Get attributes
  this.stateTiddler = this.getAttribute("tiddler");
  this.buttonText = this.getAttribute("text");
  this.buttonClass = this.getAttribute("class");
  this.buttonStyle = this.getAttribute("style");
};

NotebookWidget.prototype.refresh = function(changedTiddlers) {
  const changedAttributes = this.computeAttributes();
  if (Object.keys(changedAttributes).length > 0) {
    this.refreshSelf();
    return true;
  }
  return this.refreshChildren(changedTiddlers);
};

exports["Notebook-widget"] = NotebookWidget;
