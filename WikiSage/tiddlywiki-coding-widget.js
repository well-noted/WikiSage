/*\
title: $:/plugins/NoteStreams/WikiSage/tiddlywiki-coding-widget.js
type: application/javascript
module-type: widget
\*/

var Widget = require("$:/core/modules/widgets/widget.js").widget;
const { getGeminiApiUrl } = require("./widget.js");
const { ConnectionPool } = require("./connection-pool.js");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CHAT_COMPLETION_URL = "https://api.openai.com/v1/chat/completions";

// Singleton connection pool for all API requests
const pool = new ConnectionPool({ maxSize: 5 });

// Load system prompt from tiddler
const systemPrompt = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/Coding_Agent_Prompt");

// Helper method to retrieve API keys based on storage preference
function getApiKey(type = 'openai') {
  // Check if user has enabled temporary tiddler storage
  const useTemporaryStorage = $tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() === "yes";
  
  console.log(`[WikiSage Coding] Getting ${type} API key. Using temporary storage: ${useTemporaryStorage}`);
  
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

function TiddlywikiCodingWidget(parseTreeNode, options) {
  this.initialise(parseTreeNode, options);
}

TiddlywikiCodingWidget.prototype = new Widget();

TiddlywikiCodingWidget.prototype.render = function(parent, nextSibling) {
  if (!$tw.browser) return;
  this.parentDomNode = parent;
  this.computeAttributes();

  // Main container
  const container = $tw.utils.domMaker("div", {
    class: "tiddlywiki-coding-widget-container",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      width: "100%",
      maxWidth: "650px",
      border: "1px solid #bbb",
      borderRadius: "6px",
      padding: "12px",
      background: "#f3f7fa"
    }
  });

  // Model picker dropdown (reuse from instruction-chatbox)
  const modelPicker = $tw.utils.domMaker("select", {
    class: "model-picker",
    style: {
      padding: "6px 10px",
      borderRadius: "4px",
      border: "1px solid #ccc",
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

  // Coding action picker
  const actionPicker = $tw.utils.domMaker("select", {
    class: "coding-action-picker",
    style: {
      padding: "6px 10px",
      borderRadius: "4px",
      border: "1px solid #ccc",
      fontSize: "15px"
    }
  });
  const actionOptions = [
    { value: "explain", label: "Explain Code" },
    { value: "refactor", label: "Refactor" },
    { value: "fix", label: "Fix Bug" },
    { value: "write", label: "Write Code" },
    { value: "review", label: "Code Review" },
    { value: "comment", label: "Add Comments" }
  ];
  actionOptions.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    actionPicker.appendChild(option);
  });

  
  // Prompt input area
  const promptInput = $tw.utils.domMaker("input", {
    class: "coding-prompt-input",
    attributes: {
      placeholder: "Describe what you want the AI to do (e.g., 'Refactor for readability')"
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

  // Submit button
  const button = $tw.utils.domMaker("button", {
    class: "coding-submit-btn",
    text: "Run AI Coding",
    style: {
      marginTop: "4px",
      padding: "7px 16px",
      border: "none",
      borderRadius: "4px",
      background: "#4f8cff",
      color: "#fff",
      fontWeight: "bold",
      cursor: "pointer",
      fontSize: "15px"
    }
  });

  // Add advanced settings button and dropdown
  const advancedBtn = $tw.utils.domMaker("button", {
    text: "⚙️ API Settings",
    style: {
      padding: "5px 10px",
      marginLeft: "8px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      background: "#f0f0f0",
      fontSize: "14px",
      cursor: "pointer"
    }
  });

  const advancedDropdown = $tw.utils.domMaker("div", {
    style: {
      display: "none",
      position: "absolute",
      zIndex: "1000",
      padding: "12px 15px",
      background: "#fff",
      border: "1px solid #ddd",
      borderRadius: "4px",
      boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
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
    style: { fontWeight: "bold", marginRight: "8px" }
  });
  
  const tempValue = $tw.utils.domMaker("span", {
    text: temperature.toFixed(2),
    style: { marginLeft: "6px", fontFamily: "monospace" }
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
  advancedDropdown.appendChild(tempRow);
  
  // Top-p gauge
  const toppLabel = $tw.utils.domMaker("label", {
    text: "Top-p: ",
    style: { fontWeight: "bold", marginRight: "8px" }
  });
  
  const toppValue = $tw.utils.domMaker("span", {
    text: top_p.toFixed(2),
    style: { marginLeft: "6px", fontFamily: "monospace" }
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
  advancedDropdown.appendChild(toppRow);

  // API key storage toggle
  const apiStorageRow = $tw.utils.domMaker("div", {
    style: { marginTop: "8px", marginBottom: "8px" }
  });

  const apiStorageLabel = $tw.utils.domMaker("label", {
    text: "Use temporary API keys: ",
    style: { fontWeight: "bold", marginRight: "8px" }
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
      color: "#666"
    }
  });

  apiStorageToggle.addEventListener("change", function() {
    const preferenceValue = this.checked ? "yes" : "no";
    
    console.log(`[WikiSage] Setting API key preference to: ${preferenceValue}`);
    
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
  advancedDropdown.appendChild(apiStorageRow);

  // Toggle advanced dropdown
  advancedBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    advancedDropdown.style.display = advancedDropdown.style.display === "none" ? "block" : "none";
  });
  // Hide on outside click
  document.addEventListener("click", function(e) {
    if (!advancedDropdown.contains(e.target) && e.target !== advancedBtn) {
      advancedDropdown.style.display = "none";
    }
  });

  // Output area
  const output = $tw.utils.domMaker("pre", {
    class: "coding-output",
    style: {
      marginTop: "10px",
      background: "#222",
      color: "#f8f8f2",
      borderRadius: "5px",
      padding: "12px",
      fontSize: "15px",
      fontFamily: "monospace",
      maxHeight: "320px",
      overflow: "auto"
    }
  });

  // Status message
  const message = $tw.utils.domMaker("div", {
    class: "coding-status-message",
    style: {
      marginTop: "6px",
      fontSize: "14px",
      color: "#666"
    }
  });

  // Compose the widget
  container.appendChild(modelPicker);
  container.appendChild(actionPicker);
  container.appendChild(promptInput);
  container.appendChild(button);
  container.appendChild(advancedBtn);
  container.appendChild(advancedDropdown);
  container.appendChild(message);
  container.appendChild(output);
  parent.insertBefore(container, nextSibling);

  // Submit handler
  button.addEventListener("click", async () => {
    const model = modelPicker.value;
    const action = actionPicker.value;
    const prompt = promptInput.value.trim();
    output.textContent = "";
    message.textContent = "Processing...";
    message.style.color = "#666";
    // Get current tiddler
    const currentTiddler = $tw.wiki.getTextReference("$:/HistoryList!!current-tiddler");
    if (!currentTiddler) {
      message.style.color = "#c00";
      message.textContent = "No current tiddler found.";
      return;
    }
    const code = $tw.wiki.getTiddlerText(currentTiddler);
    // Allow empty code: if the tiddler is empty, proceed with an empty string
    
    let endpoint = "";
    let headers = {};
    let body = {};
    let userPrompt = prompt || action;
    let systemPrompt = `You are an expert TiddlyWiki coder. Task: ${userPrompt}. Code:\n\n${code}`;
    
    try {
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
          max_tokens: 1024,
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
      // Call the correct endpoint with the right headers and body
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
      output.textContent = resultContent;
      message.style.color = "#090";
      message.textContent = "AI coding result ready.";
    } catch (err) {
      message.style.color = "#c00";
      message.textContent = err.message;
    }
  });
};

TiddlywikiCodingWidget.prototype.refresh = function(changedTiddlers) {
  this.refreshChildren(changedTiddlers);
};

exports["tiddlywiki-coding-widget"] = TiddlywikiCodingWidget;
