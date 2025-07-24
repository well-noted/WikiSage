/*\
title: $:/plugins/NoteStreams/WikiSage/tiddlywiki-journal-widget.js
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

function TiddlywikiJournalWidget(parseTreeNode, options) {
  this.initialise(parseTreeNode, options);
}

TiddlywikiJournalWidget.prototype = new Widget();

TiddlywikiJournalWidget.prototype.render = function(parent, nextSibling) {
  if (!$tw.browser) return;
  this.parentDomNode = parent;
  this.computeAttributes();
  
  // Store reference to this widget instance
  const parentWidget = this;

  // Main container
  const container = $tw.utils.domMaker("div", {
    class: "tiddlywiki-journal-widget-container",
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

  // Model picker dropdown (copied from instruction-chatbox-widget.js)
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

  // Journal tiddler title input
  const titleInput = $tw.utils.domMaker("input", {
    class: "journal-title-input",
    attributes: {
      placeholder: "Enter journal article title (tiddler name)"
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
  container.appendChild(titleInput);

  // Conversation controls (Clear, Export)
  const controlsRow = $tw.utils.domMaker("div", {
    style: { display: "flex", gap: "10px", alignItems: "center", margin: "8px 0" }
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
    class: "journal-conversation-area",
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
        transcript += `User: ${bubble.innerText}\n`;
      } else {
        transcript += `Agent: ${bubble.innerText}\n`;
      }
    }
    $tw.wiki.addTiddler(new $tw.Tiddler({
      title: exportTitle,
      text: transcript.trim()
    }));
    message.textContent = `Conversation exported to tiddler '${exportTitle}'.`;
    message.style.color = "#090";
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
        color: "#222",
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

  // Prompt input
  const promptInput = $tw.utils.domMaker("input", {
    class: "journal-prompt-input",
    attributes: {
      placeholder: "Describe your project or ask the agent for help..."
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

  // Allow Enter to submit the prompt
  promptInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      button.click();
    }
  });

  // Submit button
  const button = $tw.utils.domMaker("button", {
    class: "journal-submit-btn",
    text: "Start/Continue Journal",
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
  container.appendChild(button);

  // Fix Journal Structure button
  const fixButton = $tw.utils.domMaker("button", {
    class: "journal-fix-btn",
    text: "Fix Journal Structure",
    style: {
      marginTop: "4px",
      marginBottom: "8px",
      padding: "7px 16px",
      border: "none",
      borderRadius: "4px",
      background: "#218c3b",
      color: "#fff",
      fontWeight: "bold",
      fontSize: "15px",
      cursor: "pointer"
    }
  });
  container.appendChild(fixButton);

  // Fix Journal Structure button handler
  fixButton.addEventListener("click", async () => {
    const journalTitle = titleInput.value.trim();
    const model = modelPicker.value;
    if (!journalTitle) {
      message.textContent = "Please enter a tiddler title for your journal article.";
      return;
    }
    message.textContent = "Beautifying journal...";
    message.style.color = "#666";
    const apiKey = getApiKey();
    const geminiApiKey = getApiKey('gemini');
    const anthropicApiKey = getApiKey('anthropic');
    const currentJournal = $tw.wiki.getTiddlerText(journalTitle) || "";
    if (!currentJournal) {
      message.textContent = "The journal tiddler is empty.";
      return;
    }
    let endpoint, headers, body;
    let systemPrompt = `You are an expert in writing and organizing project journals. Take the following TiddlyWiki tiddler content, and reformat, organize, and beautify it as a holistic, well-structured project journal article, using HTML. Use appropriate HTML tags (such as <section>, <h1>, <h2>, <ul>, <ol>, <p>, <strong>, etc.) to create a polished, readable, and visually appealing journal. Do not include any conversational chat logs—make it read as a polished, cumulative journal.\n\nCurrent journal content:\n${currentJournal}\n\nReturn only the improved HTML journal article.`;
    try {
      if (model.startsWith("gemini")) {
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
      let improvedJournal = "";
      if (model.startsWith("gemini")) {
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
          improvedJournal = data.candidates[0].content.parts[0].text.trim();
        } else {
          throw new Error(data.error?.message || "Gemini API error.");
        }
      } else if (model.startsWith("claude")) {
        if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
          improvedJournal = data.content[0].text.trim();
        } else if (typeof data.content === "string") {
          improvedJournal = data.content.trim();
        } else {
          throw new Error(data.error?.message || "Anthropic API error.");
        }
      } else {
        if (data.error) throw new Error(data.error.message || "Unknown API error.");
        improvedJournal = data.choices[0].message.content.trim();
      }
      // Strip code block markers and outer HTML tags if present
      let cleanedJournal = improvedJournal
        // Remove leading/trailing code block markers (```html, ```)
        .replace(/^\s*```html\s*/i, '')
        .replace(/^\s*```\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        // Remove leading <!DOCTYPE html>
        .replace(/^\s*<!DOCTYPE html>\s*/i, '')
        // Remove leading <html> and trailing </html>
        .replace(/^\s*<html[^>]*>\s*/i, '')
        .replace(/\s*<\/html>\s*$/i, '')
        // Remove leading <body> and trailing </body>
        .replace(/^\s*<body[^>]*>\s*/i, '')
        .replace(/\s*<\/body>\s*$/i, '')
        // Remove leading <head>...</head>
        .replace(/^\s*<head[^>]*>[\s\S]*?<\/head>\s*/i, '')
        .trim();
      // Get existing tiddler to preserve fields
      const existingTiddler = $tw.wiki.getTiddler(journalTitle);
      $tw.wiki.addTiddler(new $tw.Tiddler(
        existingTiddler || {}, 
        {
          title: journalTitle,
          text: cleanedJournal
        }
      ));
      // Render the improved journal as HTML in the output area
      output.innerHTML = cleanedJournal;
      message.style.color = "#090";
      message.textContent = `Journal for '${journalTitle}' beautified and updated as HTML.`;
    } catch (err) {
      message.style.color = "#c00";
      message.textContent = err.message;
    }
  });

  // Message area
  const message = $tw.utils.domMaker("div", {
    class: "journal-message",
    style: {
      color: "#c00",
      marginTop: "6px"
    }
  });
  container.appendChild(message);

  // Output area
  const output = $tw.utils.domMaker("div", {
    class: "journal-output",
    style: {
      marginTop: "10px",
      whiteSpace: "pre-wrap",
      background: "#fefefe",
      border: "1px solid #eee",
      borderRadius: "4px",
      padding: "10px"
    }
  });
  container.appendChild(output);

  // --- REFACTOR BUTTON ---
  const refactorBtn = $tw.utils.domMaker("button", {
    class: "journal-refactor-btn",
    text: "Refactor (Summarize/Extract)",
    style: {
      marginTop: "4px",
      padding: "7px 16px",
      border: "none",
      borderRadius: "4px",
      background: "#8e44ad",
      color: "#fff",
      fontWeight: "bold",
      fontSize: "15px",
      cursor: "pointer"
    }
  });
  container.appendChild(refactorBtn);

  // Refactor Handler
  refactorBtn.addEventListener("click", async () => {
    const journalTitle = titleInput.value.trim();
    if (!journalTitle) {
      message.textContent = "Please enter a tiddler title for your journal article.";
      message.style.color = "#c00";
      return;
    }
    const tiddler = $tw.wiki.getTiddler(journalTitle);
    if (!tiddler) {
      message.textContent = `Tiddler '${journalTitle}' not found.`;
      message.style.color = "#c00";
      return;
    }
    if (message) {
      message.textContent = "Refactoring all sections...";
      message.style.color = "#666";
    }
    // Let the AI identify sections in the journal
    const text = tiddler.fields.text || "";
    let matches = [];
    let aiSectionPrompt = `You are an expert in organizing project journals. Please break the following journal into logical sections. For each section, provide a section title and its content. Output as a JSON array: [{\"title\":\"Section Title\",\"content\":\"Section content...\"}, ...]\n\nJournal:\n${text}`;
    let aiSections = null;
    try {
      let endpoint, headers, body;
      const model = modelPicker.value;
      const apiKey = getApiKey();
      const geminiApiKey = getApiKey('gemini');
      const anthropicApiKey = getApiKey('anthropic');
      if (model.startsWith("gemini")) {
        if (!geminiApiKey) throw new Error("Please set your Gemini API key in the plugin settings.");
        endpoint = (getGeminiApiUrl ? getGeminiApiUrl(model) : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`) + `?key=${encodeURIComponent(geminiApiKey)}`;
        headers = { "Content-Type": "application/json" };
        body = { contents: [ { role: "user", parts: [ { text: aiSectionPrompt } ] } ] };
      } else if (model.startsWith("claude")) {
        if (!anthropicApiKey) throw new Error("Please set your Anthropic API key in the plugin settings.");
        endpoint = ANTHROPIC_API_URL;
        headers = { "Content-Type": "application/json", "x-api-key": anthropicApiKey, "anthropic-version": "2023-06-01" };
        body = { model: model, max_tokens: 2048, messages: [ { role: "user", content: aiSectionPrompt } ] };
      } else {
        if (!apiKey) throw new Error("Please set your OpenAI API key in the plugin settings.");
        endpoint = CHAT_COMPLETION_URL;
        headers = { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` };
        body = { model: model, messages: [ { role: "system", content: aiSectionPrompt } ] };
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
        throw new Error(`API Error (${resp.status}): ${errorText || resp.statusText || "No response body"}`);
      }
      let aiText = "";
      if (model.startsWith("gemini")) {
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
          aiText = data.candidates[0].content.parts[0].text.trim();
        } else {
          throw new Error(data.error?.message || "Gemini API error.");
        }
      } else if (model.startsWith("claude")) {
        if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
          aiText = data.content[0].text.trim();
        } else if (typeof data.content === "string") {
          aiText = data.content.trim();
        } else {
          throw new Error(data.error?.message || "Anthropic API error.");
        }
      } else {
        if (data.error) throw new Error(data.error.message || "Unknown API error.");
        aiText = data.choices[0].message.content.trim();
      }
      // Try to extract JSON array from the AI response
      let jsonStart = aiText.indexOf('[');
      let jsonEnd = aiText.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        let jsonStr = aiText.slice(jsonStart, jsonEnd+1);
        try {
          aiSections = JSON.parse(jsonStr);
        } catch (e) {
          aiSections = null;
        }
      }
    } catch (err) {
      aiSections = null;
    }
    if (Array.isArray(aiSections) && aiSections.length) {
      matches = aiSections.map(sec => ({
        sectionTitle: (sec.title || "Section").trim().replace(/[:*?"<>|#\[\]{}]/g, ''),
        sectionContent: (sec.content || "").trim()
      })).filter(sec => sec.sectionContent);
    }
    // If still no sections found, fall back to previous regex splitting
    if (!Array.isArray(matches) || matches.length === 0) {
      // Split by Markdown headings or HTML headings
      let sectionRegex = /(?:^|\n)(?:#{1,6}\s+|<h[1-6][^>]*>)([^\n<]+?)(?:\s*<\/h[1-6]>)?\n+([\s\S]*?)(?=(?:\n#{1,6}\s+|<h[1-6]|$))/gi;
      let fallbackMatches = [], m;
      while ((m = sectionRegex.exec(text)) !== null) {
        fallbackMatches.push({
          sectionTitle: m[1].trim().replace(/[:*?"<>|#\[\]{}]/g, ''),
          sectionContent: m[2].trim()
        });
      }
      if (fallbackMatches.length === 0) {
        fallbackMatches.push({
          sectionTitle: "Main",
          sectionContent: text.trim()
        });
      }
      matches = fallbackMatches;
    }
    // For each section, create a new tiddler with refactored content
    const model = modelPicker.value;
    const apiKey = getApiKey();
    const geminiApiKey = getApiKey('gemini');
    const anthropicApiKey = getApiKey('anthropic');
    let refactoredTitles = [];
    let errors = [];
    for (let i = 0; i < matches.length; i++) {
      const { sectionTitle, sectionContent } = matches[i];
      const newTitle = `${journalTitle} - ${sectionTitle}`;
      let systemPrompt = `You are an expert at refactoring and organizing knowledge in TiddlyWiki. Please rewrite or summarize the following section as a standalone, well-organized tiddler. Output only the main content for the new tiddler.`;
      let endpoint, headers, body;
      try {
        if (model.startsWith("gemini")) {
          if (!geminiApiKey) throw new Error("Please set your Gemini API key in the plugin settings.");
          endpoint = (getGeminiApiUrl ? getGeminiApiUrl(model) : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`) + `?key=${encodeURIComponent(geminiApiKey)}`;
          headers = { "Content-Type": "application/json" };
          body = { contents: [ { role: "user", parts: [ { text: `${systemPrompt}\n\n${sectionContent}` } ] } ] };
        } else if (model.startsWith("claude")) {
          if (!anthropicApiKey) throw new Error("Please set your Anthropic API key in the plugin settings.");
          endpoint = ANTHROPIC_API_URL;
          headers = { "Content-Type": "application/json", "x-api-key": anthropicApiKey, "anthropic-version": "2023-06-01" };
          body = { model: model, max_tokens: 1024, messages: [ { role: "user", content: `${systemPrompt}\n\n${sectionContent}` } ] };
        } else {
          if (!apiKey) throw new Error("Please set your OpenAI API key in the plugin settings.");
          endpoint = CHAT_COMPLETION_URL;
          headers = { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` };
          body = { model: model, messages: [ { role: "system", content: `${systemPrompt}\n\n${sectionContent}` } ] };
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
          throw new Error(`API Error (${resp.status}): ${errorText || resp.statusText || "No response body"}`);
        }
        let refactoredContent = "";
        if (model.startsWith("gemini")) {
          if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
            refactoredContent = data.candidates[0].content.parts[0].text.trim();
          } else {
            throw new Error(data.error?.message || "Gemini API error.");
          }
        } else if (model.startsWith("claude")) {
          if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
            refactoredContent = data.content[0].text.trim();
          } else if (typeof data.content === "string") {
            refactoredContent = data.content.trim();
          } else {
            throw new Error(data.error?.message || "Anthropic API error.");
          }
        } else {
          if (data.error) throw new Error(data.error.message || "Unknown API error.");
          refactoredContent = data.choices[0].message.content.trim();
        }
        // Get existing tiddler to preserve fields
        const existingSectionTiddler = $tw.wiki.getTiddler(newTitle);
        $tw.wiki.addTiddler(new $tw.Tiddler(
          existingSectionTiddler || {},
          {
            title: newTitle,
            text: refactoredContent
          }
        ));
        refactoredTitles.push(newTitle);
      } catch (err) {
        errors.push(`Section '${sectionTitle}': ${err.message}`);
      }
    }
    // Generate condensed summary with links to new tiddlers
    let summaryPrompt;
    if (matches.length === 1) {
      // Only one section, include its content in the prompt
      summaryPrompt = `You are an expert at summarizing and organizing project journals. Write a concise summary for the journal, then reference the section below (using TiddlyWiki transclusion syntax: {{Section Title}}).\n\nSection title: ${refactoredTitles[0]}\nSection content:\n${matches[0].sectionContent}`;
    } else {
      // Multiple sections, include all titles and snippets
      let sectionSnippets = matches.map((s, i) => `Title: ${refactoredTitles[i]}\nContent: ${s.sectionContent.slice(0, 200)}...`).join("\n\n");
      summaryPrompt = `You are an expert at summarizing and organizing project journals. Write a concise summary for the journal, then reference each section below (using TiddlyWiki transclusion syntax: {{Section Title}}).\n\nSections:\n${sectionSnippets}`;
    }
    let condensedText = "";
    try {
      let endpoint, headers, body;
      if (model.startsWith("gemini")) {
        if (!geminiApiKey) throw new Error("Please set your Gemini API key in the plugin settings.");
        endpoint = (getGeminiApiUrl ? getGeminiApiUrl(model) : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`) + `?key=${encodeURIComponent(geminiApiKey)}`;
        headers = { "Content-Type": "application/json" };
        body = { contents: [ { role: "user", parts: [ { text: summaryPrompt } ] } ] };
      } else if (model.startsWith("claude")) {
        if (!anthropicApiKey) throw new Error("Please set your Anthropic API key in the plugin settings.");
        endpoint = ANTHROPIC_API_URL;
        headers = { "Content-Type": "application/json", "x-api-key": anthropicApiKey, "anthropic-version": "2023-06-01" };
        body = { model: model, max_tokens: 1024, messages: [ { role: "user", content: summaryPrompt } ] };
      } else {
        if (!apiKey) throw new Error("Please set your OpenAI API key in the plugin settings.");
        endpoint = CHAT_COMPLETION_URL;
        headers = { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` };
        body = { model: model, messages: [ { role: "system", content: summaryPrompt } ] };
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
        throw new Error(`API Error (${resp.status}): ${errorText || resp.statusText || "No response body"}`);
      }
      if (model.startsWith("gemini")) {
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
          condensedText = data.candidates[0].content.parts[0].text.trim();
        } else {
          throw new Error(data.error?.message || "Gemini API error.");
        }
      } else if (model.startsWith("claude")) {
        if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
          condensedText = data.content[0].text.trim();
        } else if (typeof data.content === "string") {
          condensedText = data.content.trim();
        } else {
          throw new Error(data.error?.message || "Anthropic API error.");
        }
      } else {
        if (data.error) throw new Error(data.error.message || "Unknown API error.");
        condensedText = data.choices[0].message.content.trim();
      }
    } catch (err) {
      condensedText = `Summary unavailable.\n\nSections:\n${refactoredTitles.map(t=>`{{${t}}}`).join('\n')}`;
      errors.push("Summary: " + err.message);
    }
    // Update the journal tiddler: set list field and replace text
    const existingJournalTiddler = $tw.wiki.getTiddler(journalTitle);
    $tw.wiki.addTiddler(new $tw.Tiddler(
      existingJournalTiddler || {},
      {
        title: journalTitle,
        text: condensedText
      }
    ));
    
    // Update references to ensure all titles are properly wrapped in double square brackets
    let formattedReferences = refactoredTitles.map(title => `[[${title}]]`).join(" ");
    if (existingJournalTiddler && existingJournalTiddler.fields.references) {
      // Parse existing references using improved method
      const referencesText = existingJournalTiddler.fields.references;
      
      // Improved parsing for titles in TiddlyWiki square bracket format: [[title1]] [[title2]]
      if (referencesText.trim()) {
        // Check if it contains properly formatted bracketed titles
        if (referencesText.includes('[[') && referencesText.includes(']]')) {
          // Split by "]] [[" to get complete titles
          const parts = referencesText.split(']] [[');
          
          // Process each part to remove outer brackets
          for (let i = 0; i < parts.length; i++) {
            let part = parts[i];
            // For first part, remove leading '[['
            if (i === 0) {
              part = part.replace(/^\[\[/, '');
            }
            // For last part, remove trailing ']]'
            if (i === parts.length - 1) {
              part = part.replace(/\]\]$/, '');
            }
            // Add clean title with proper brackets
            if (part.trim()) {
              existingRefs.push(`[[${part.trim()}]]`);
            }
          }
        } else {
          // Fallback to regex if not in expected format
          const referencesRegex = /\[\[(.*?)\]\]/g;
          let refMatch;
          while ((refMatch = referencesRegex.exec(referencesText)) !== null) {
            const title = refMatch[1].trim();
            if (title) {
              existingRefs.push(`[[${title}]]`);
            }
          }
        }
      }
      
      // Combine and deduplicate
      let allRefs = new Set([...existingRefs, ...refactoredTitles.map(title => `[[${title}]]`)]);
      formattedReferences = Array.from(allRefs).join(" ");
    }
    
    // Update the tiddler with properly formatted references
    $tw.wiki.addTiddler(new $tw.Tiddler(
      $tw.wiki.getTiddler(journalTitle) || {},
      {
        references: formattedReferences
      }
    ));
    
    if (message) {
      message.textContent = `Refactor complete. ${refactoredTitles.length} sections processed.` + (errors.length ? " Errors: " + errors.join("; ") : "");
      message.style.color = errors.length ? "#c00" : "#090";
    }
    updateReferencesPanel();
  });

  // Initial references panel update
  setTimeout(updateReferencesPanel, 100);

  // --- REFERENCES PANEL ---
  // Create the references panel on the right
  const panelWrapper = $tw.utils.domMaker("div", {
    style: {
      display: "flex",
      flexDirection: "row",
      width: "100%"
    }
  });
  panelWrapper.appendChild(container);

  const referencesPanel = $tw.utils.domMaker("div", {
    class: "references-panel",
    style: {
      minWidth: "200px",
      maxWidth: "260px",
      marginLeft: "20px",
      padding: "8px 10px",
      background: "#20232a",
      border: "1px solid #444",
      borderRadius: "6px",
      color: "#e0e0e0",
      fontSize: "15px",
      height: "fit-content"
    }
  });
  const referencesTitle = $tw.utils.domMaker("div", {
    text: "Referenced Tiddlers",
    style: { fontWeight: "bold", marginBottom: "8px", fontSize: "16px" }
  });
  referencesPanel.appendChild(referencesTitle);
  const referencesList = $tw.utils.domMaker("div", {
    style: { 
      padding: 0, 
      margin: 0,
      maxHeight: "calc(100vh - 100px)",
      overflowY: "auto"
    }
  });
  referencesPanel.appendChild(referencesList);
  panelWrapper.appendChild(referencesPanel);

  // Create a fixed height for the references list
  function updateReferencesPanelHeight() {
    if (container && container.offsetHeight) {
      referencesList.style.maxHeight = `${container.offsetHeight - 50}px`;
    }
  }
  
  // Call once after a short delay to ensure elements are rendered
  setTimeout(updateReferencesPanelHeight, 200);
  
  // Also add a window resize listener to keep heights in sync
  window.addEventListener('resize', updateReferencesPanelHeight);

  // Helper to update the references panel
  function updateReferencesPanel() {
    referencesList.innerHTML = "";
    const journalTitle = titleInput.value.trim();
    if (!journalTitle) return;
    const tiddler = $tw.wiki.getTiddler(journalTitle);
    if (!tiddler) return;
    
    // Update height after content changes
    setTimeout(updateReferencesPanelHeight, 50);
    
    // Parse references field, preserving titles in square brackets
    const referencesText = tiddler.fields.references || "";
    const refs = [];
    
    // Improved parsing for titles in TiddlyWiki square bracket format: [[title1]] [[title2]]
    if (referencesText.trim()) {
      // Check if it contains properly formatted bracketed titles
      if (referencesText.includes('[[') && referencesText.includes(']]')) {
        // Split by "]] [[" to get complete titles
        const parts = referencesText.split(']] [[');
        
        // Process each part to remove outer brackets
        for (let i = 0; i < parts.length; i++) {
          let part = parts[i];
          // For first part, remove leading '[['
          if (i === 0) {
            part = part.replace(/^\[\[/, '');
          }
          // For last part, remove trailing ']]'
          if (i === parts.length - 1) {
            part = part.replace(/\]\]$/, '');
          }
          // Add clean title
          if (part.trim()) {
            refs.push(part.trim());
          }
        }
      } else {
        // Fallback to regex if not in expected format
        const referencesRegex = /\[\[(.*?)\]\]/g;
        let refMatch;
        while ((refMatch = referencesRegex.exec(referencesText)) !== null) {
          refs.push(refMatch[1].trim());
        }
      }
    }
    
    if (!refs.length) {
      const emptyMsg = document.createElement("div");
      emptyMsg.textContent = "No references yet.";
      emptyMsg.style.padding = "5px";
      referencesList.appendChild(emptyMsg);
      return;
    }
    
    // Create a TiddlyWiki formatted list of references with extra spacing
    let wikiText = "";
    refs.forEach(title => {
      wikiText += `* [[${title}]]\n\n\n`;  // Extra newline for more spacing between items
    });
    
    // Render the wiki text using TiddlyWiki's rendering engine
    const parser = $tw.wiki.parseText("text/vnd.tiddlywiki", wikiText);
    const widgetNode = $tw.wiki.makeWidget(parser, {
      document: document,
      parentWidget: parentWidget
    });
    
    // Create a container for the rendered content
    const container = document.createElement("div");
    container.style.color = "#e0e0e0";
    container.style.padding = "5px";
    
    // Add additional CSS to ensure spacing between list items
    const style = document.createElement('style');
    style.textContent = '.references-panel li { margin-bottom: 20px !important; }';
    container.appendChild(style);
    
    widgetNode.render(container, null);
    
    // Add click listeners to navigate to tiddlers
    const links = container.querySelectorAll("a[class*='tc-tiddlylink']");
    links.forEach(link => {
      link.style.color = "#9fdfff";
      link.style.textDecoration = "underline";
      // Preserve the existing click behavior
      link.addEventListener("click", e => {
        e.preventDefault();
        const tiddlerTitle = link.getAttribute("data-tw-title") || link.textContent;
        $tw.rootWidget.dispatchEvent({
          type: "tm-navigate",
          navigateTo: tiddlerTitle
        });
      });
    });
    
    referencesList.appendChild(container);
  }
  // Update panel when journal title changes
  titleInput.addEventListener("input", updateReferencesPanel);
  // Also update after refactor (see below)

  // Add to DOM
  if (this.domNodes.length === 0) {
    parent.insertBefore(panelWrapper, nextSibling);
    this.domNodes.push(panelWrapper);
  } else {
    this.refreshSelf();
  }

  // Button click handler
  button.addEventListener("click", async () => {
    const journalTitle = titleInput.value.trim();
    const userPrompt = promptInput.value.trim();
    const model = modelPicker.value;
    
    // Clear the prompt input immediately after capturing its value
    promptInput.value = "";
    
    if (!journalTitle) {
      message.textContent = "Please enter a tiddler title for your journal article.";
      return;
    }
    if (!userPrompt) {
      message.textContent = "Please enter a prompt or question for the agent.";
      return;
    }
    // Add user message as bubble
    appendChatMessage("user", userPrompt);
    message.textContent = "Processing...";
    message.style.color = "#666";
    const apiKey = getApiKey();
    const geminiApiKey = getApiKey('gemini');
    const anthropicApiKey = getApiKey('anthropic');
    // Get the current tiddler text (existing journal)
    const currentJournal = $tw.wiki.getTiddlerText(journalTitle) || "";
    
    // Get referenced tiddlers' content
    const tiddler = $tw.wiki.getTiddler(journalTitle);
    const referencesText = tiddler ? (tiddler.fields.references || "") : "";
    console.log("[Journal Widget] Raw references field:", referencesText);
    const referencedTiddlers = [];
    
    // Improved parsing for titles in TiddlyWiki square bracket format: [[title1]] [[title2]]
    let titles = [];
    if (referencesText.trim()) {
      // Check if it contains properly formatted bracketed titles
      if (referencesText.includes('[[') && referencesText.includes(']]')) {
        console.log("[Journal Widget] Using split by ']] [[' parsing method");
        // Split by "]] [[" to get complete titles
        const parts = referencesText.split(']] [[');
        console.log("[Journal Widget] Split parts:", parts);
        
        // Process each part to remove outer brackets
        for (let i = 0; i < parts.length; i++) {
          let part = parts[i];
          // For first part, remove leading '[['
          if (i === 0) {
            part = part.replace(/^\[\[/, '');
          }
          // For last part, remove trailing ']]'
          if (i === parts.length - 1) {
            part = part.replace(/\]\]$/, '');
          }
          // Add clean title
          if (part.trim()) {
            titles.push(part.trim());
            console.log(`[Journal Widget] Added title ${i+1}:`, part.trim());
          }
        }
      } else {
        console.log("[Journal Widget] Falling back to regex method");
        // Fallback to regex if not in expected format
        const referencesRegex = /\[\[(.*?)\]\]/g;
        let refMatch;
        while ((refMatch = referencesRegex.exec(referencesText)) !== null) {
          titles.push(refMatch[1].trim());
        }
      }
    }
    
    console.log("[Journal Widget] Parsed titles:", titles);
    
    // Get content for each title
    titles.forEach(title => {
      if (title) {
        const content = $tw.wiki.getTiddlerText(title) || "";
        referencedTiddlers.push({ title, content });
      }
    });
    
    // Format referenced tiddlers for the prompt
    let referencedTiddlersText = "";
    referencedTiddlers.forEach(ref => {
      referencedTiddlersText += `\n--- Referenced Tiddler: ${ref.title} ---\n${ref.content}\n`;
    });
    
    console.log(`[Journal Widget] Providing ${referencedTiddlers.length} referenced tiddlers to agent:`, 
      referencedTiddlers.map(ref => ref.title));
    
    // Gather conversation so far for prompt (not UI)
    let conversationLog = "";
    // Reconstruct conversationLog from chat bubbles
    const bubbles = conversationArea.querySelectorAll('.chat-message');
    for (const bubble of bubbles) {
      if (bubble.classList.contains('user')) {
        conversationLog += `\nUser: ${bubble.innerText}`;
      } else {
        conversationLog += `\nAgent: ${bubble.innerText}`;
      }
    }
    conversationLog += `\nUser: ${userPrompt}`;
    
    // Prompt the agent to do BOTH: (1) reply to the user in a conversational tone, and (2) update the journal in a holistic style
    let systemPrompt = `You are an expert project journal assistant. The user is carrying on a conversation with you about their project. For each user message, you must:
1. Reply to the user in a friendly, conversational tone, addressing their question or comment directly.
2. Update the project journal in the TiddlyWiki tiddler titled '${journalTitle}'. The journal should be cumulative, holistic, and well-organized, summarizing progress, plans, and insights. Do NOT just copy the chat; synthesize and organize the project as a conventional journal article, preserving previous content and adding new relevant information.
3. Optionally, you can also update any of the referenced tiddlers if needed based on the conversation.

Format your response EXACTLY as follows:
[Conversational Reply]
<your friendly, conversational reply to the user>

---Journal Update---
<the updated journal article content, suitable for writing to the tiddler>

${referencedTiddlers.length > 0 ? `---Referenced Tiddler Updates---
If you need to update any referenced tiddlers, format each update EXACTLY like this example:

---Update Tiddler: Example Tiddler Title---
Content for the tiddler goes here.
It can span multiple lines.

---Update Tiddler: Another Tiddler Title---
Content for another tiddler goes here.
More content...

You must use the EXACT format with three dashes before and after "Update Tiddler: [title]", followed by the content. Only include tiddlers you need to modify.` : ""}

Current journal content:
${currentJournal}

${referencedTiddlers.length > 0 ? `Referenced tiddlers:${referencedTiddlersText}` : "No referenced tiddlers found."}

Conversation so far (latest at end):
${conversationLog}

Remember: 
- The text after '---Journal Update---' will be written to the main journal tiddler. 
- If you include '---Update Tiddler: [title]---' sections, those updates will be written to the respective tiddlers.
- The rest will be shown to the user as your conversational reply.
- Follow the format EXACTLY with the proper delimiters.`;

    // Add console log for the system prompt
    console.log("[Journal Widget] Sending prompt to agent:", systemPrompt);
    
    try {
      if (model.startsWith("gemini")) {
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
      
      // Log the raw response from the agent
      console.log("[Journal Widget] Raw agent response:", resultContent);
      
      // Parse the agent's response for conversational reply and journal update
      let conversationalReply = resultContent;
      let journalUpdate = resultContent;
      let tiddlerUpdates = [];

      // Parse the agent's response
      const mainDelimiter = "---Journal Update---";
      const refUpdateDelimiter = "---Referenced Tiddler Updates---";
      const tiddlerUpdateRegex = /---Update Tiddler: (.*?)---\n([\s\S]+?)(?=---Update Tiddler:|$)/g;
      
      if (resultContent.includes(mainDelimiter)) {
        const parts = resultContent.split(mainDelimiter);
        conversationalReply = parts[0].trim();
        
        console.log("[Journal Widget] Found main delimiter, split into parts:", {
          conversationalReplyLength: parts[0].trim().length,
          journalUpdatePart: parts[1] ? "Present" : "Missing"
        });
        
        if (parts[1].includes(refUpdateDelimiter)) {
          const updateParts = parts[1].split(refUpdateDelimiter);
          journalUpdate = updateParts[0].trim();
          
          console.log("[Journal Widget] Found tiddler updates delimiter, contains:", {
            journalUpdateLength: updateParts[0].trim().length,
            tiddlerUpdatesSectionLength: updateParts[1] ? updateParts[1].trim().length : 0
          });
          
          // Parse individual tiddler updates
          const updatesSection = updateParts[1];
          console.log("[Journal Widget] Tiddler updates section:", updatesSection);
          
          // Debug regex pattern
          console.log("[Journal Widget] Looking for tiddler updates with pattern:", tiddlerUpdateRegex.source);
          
          let tiddlerMatch;
          let matchCount = 0;
          while ((tiddlerMatch = tiddlerUpdateRegex.exec(updatesSection)) !== null) {
            matchCount++;
            const title = tiddlerMatch[1].trim();
            const content = tiddlerMatch[2].trim();
            console.log(`[Journal Widget] Found tiddler update #${matchCount}:`, { title, contentLength: content.length });
            tiddlerUpdates.push({ title, content });
          }
          
          if (matchCount === 0) {
            console.log("[Journal Widget] No tiddler updates found with regex pattern. Raw section:", updatesSection);
          }
        } else {
          journalUpdate = parts[1].trim();
          console.log("[Journal Widget] No tiddler updates delimiter found. Only journal update is present.");
        }
      } else {
        console.log("[Journal Widget] Main delimiter not found. Response doesn't follow expected format.");
      }

      // Remove 'Conversational Reply' label if present
      conversationalReply = conversationalReply.replace(/^\[?Conversational Reply\]?[:\-]?/i, "").trim();
      
      // Log the parsed components
      console.log("[Journal Widget] Parsed components:", {
        conversationalReply: conversationalReply.substring(0, 100) + (conversationalReply.length > 100 ? "..." : ""),
        journalUpdateLength: journalUpdate.length,
        tiddlerUpdates: tiddlerUpdates.map(update => ({ title: update.title, contentLength: update.content.length }))
      });

      // Write the journal update to the main tiddler
      const existingJournalTiddler = $tw.wiki.getTiddler(journalTitle);
      
      // If there are referenced tiddlers to update, ensure they're added to the references field
      if (tiddlerUpdates.length > 0) {
        let existingRefs = [];
        if (existingJournalTiddler && existingJournalTiddler.fields.references) {
          // Parse existing references using improved method
          const referencesText = existingJournalTiddler.fields.references;
          
          // Improved parsing for titles in TiddlyWiki square bracket format: [[title1]] [[title2]]
          if (referencesText.trim()) {
            // Check if it contains properly formatted bracketed titles
            if (referencesText.includes('[[') && referencesText.includes(']]')) {
              // Split by "]] [[" to get complete titles
              const parts = referencesText.split(']] [[');
              
              // Process each part to remove outer brackets
              for (let i = 0; i < parts.length; i++) {
                let part = parts[i];
                // For first part, remove leading '[['
                if (i === 0) {
                  part = part.replace(/^\[\[/, '');
                }
                // For last part, remove trailing ']]'
                if (i === parts.length - 1) {
                  part = part.replace(/\]\]$/, '');
                }
                // Add clean title with proper brackets
                if (part.trim()) {
                  existingRefs.push(`[[${part.trim()}]]`);
                }
              }
            } else {
              // Fallback to regex if not in expected format
              const referencesRegex = /\[\[(.*?)\]\]/g;
              let refMatch;
              while ((refMatch = referencesRegex.exec(referencesText)) !== null) {
                const title = refMatch[1].trim();
                if (title) {
                  existingRefs.push(`[[${title}]]`);
                }
              }
            }
          }
        }
        
        // Add new references from updated tiddlers
        let newRefs = tiddlerUpdates.map(update => `[[${update.title}]]`);
        
        // Combine and deduplicate
        let allRefs = new Set([...existingRefs, ...newRefs]);
        let formattedReferences = Array.from(allRefs).join(" ");
        
        // Update the tiddler with the new content and properly formatted references
        $tw.wiki.addTiddler(new $tw.Tiddler(
          existingJournalTiddler || {},
          {
            title: journalTitle,
            text: journalUpdate,
            references: formattedReferences
          }
        ));
      } else {
        // Just update the content if no references to add
        $tw.wiki.addTiddler(new $tw.Tiddler(
          existingJournalTiddler || {},
          {
            title: journalTitle,
            text: journalUpdate
          }
        ));
      }

      // Write any referenced tiddler updates
      tiddlerUpdates.forEach(update => {
        const existingRefTiddler = $tw.wiki.getTiddler(update.title);
        console.log(`[Journal Widget] Updating referenced tiddler: "${update.title}" (${update.content.length} chars)`);
        $tw.wiki.addTiddler(new $tw.Tiddler(
          existingRefTiddler || {},
          {
            title: update.title,
            text: update.content
          }
        ));
      });

      // Show the conversational reply as a chat bubble
      appendChatMessage("agent", conversationalReply);
      message.style.color = "#090";
      message.textContent = `Tiddler '${journalTitle}' updated.${tiddlerUpdates.length > 0 ? ` ${tiddlerUpdates.length} referenced tiddler(s) also updated.` : ''}`;
    } catch (err) {
      console.error("[Journal Widget] Error:", err);
      message.style.color = "#c00";
      message.textContent = err.message;
    }
  });
};

TiddlywikiJournalWidget.prototype.refresh = function(changedTiddlers) {
  this.refreshChildren(changedTiddlers);
};

exports["tiddlywiki-journal-widget"] = TiddlywikiJournalWidget;
