/*\
created: 20260302000000000
title: $:/plugins/NoteStreams/WikiSage/chat-ui-builder.js
tags:
type: application/javascript
module-type: library

Chat UI builder for WikiSage: createChatBox, createInstructionChatBox, createConversationElement.
All functions are designed to be called with .call(widgetInstance, ...) to maintain 'this' context.
\*/

"use strict";

const { CHAT_COMPLETION_URL, extractOpenAIText, getLocalChatCompletionUrl, getLocalModelName, getApiType } = require("$:/plugins/NoteStreams/WikiSage/utils.js");

/**
 * Creates a conversation element (user message + assistant placeholder).
 * This is a pure DOM function with no 'this' dependency.
 */
function createConversationElement(message) {
    const conversation = $tw.utils.domMaker("div", { class: "chatgpt-conversation" });
    conversation.appendChild($tw.utils.domMaker("div", {
        class: "chatgpt-conversation-message chatgpt-conversation-user",
        children: [$tw.utils.domMaker("p", { text: message })]
    }));
    conversation.appendChild($tw.utils.domMaker("div", {
        class: "chatgpt-conversation-message chatgpt-conversation-assistant",
        children: [$tw.utils.domMaker("p", { text: "Processing...", class: "assistant-processing-message" })]
    }));
    return conversation;
}

/**
 * Creates the instruction chatbox with dropdown and instruction input.
 * Uses $tw globals directly; no widget state dependency.
 * @param {HTMLElement} parentContainer
 */
function createInstructionChatBox(parentContainer) {
    const container = $tw.utils.domMaker("div", {
        class: "instruction-chatbox-container",
        style: {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            width: "100%",
            maxWidth: "500px",
            border: "1px solid #bbb",
            borderRadius: "6px",
            padding: "12px",
            background: "#f8f8f2"
        }
    });

    const dropdown = $tw.utils.domMaker("select", {
        class: "instruction-dropdown",
        style: { padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "15px" }
    });
    [
        { value: "clarify", label: "Clarify Content" },
        { value: "summarize", label: "Summarize" },
        { value: "simplify", label: "Simplify Language" },
        { value: "expand", label: "Expand Content" }
    ].forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        dropdown.appendChild(option);
    });

    const formatDropdown = $tw.utils.domMaker("select", {
        class: "instruction-format-dropdown",
        style: { padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "15px", marginTop: "4px" }
    });
    [
        { value: "wikitext", label: "Wikitext Format" },
        { value: "markdown", label: "Markdown Format" }
    ].forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        formatDropdown.appendChild(option);
    });

    const input = $tw.utils.domMaker("textarea", {
        class: "instruction-input",
        attributes: { placeholder: "Type your instruction (e.g., 'Rewrite in simpler terms')...", rows: "2" },
        style: { width: "100%", minHeight: "48px", maxHeight: "120px", padding: "8px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "15px", fontFamily: "inherit", resize: "vertical" }
    });

    const button = $tw.utils.domMaker("button", {
        class: "instruction-submit-btn",
        text: "Apply Instruction",
        style: { marginTop: "4px", padding: "7px 16px", border: "none", borderRadius: "4px", background: "#4f8cff", color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }
    });

    const message = $tw.utils.domMaker("div", {
        class: "instruction-message",
        style: { marginTop: "6px", color: "#c00", fontSize: "14px" }
    });

    container.appendChild(dropdown);
    container.appendChild(formatDropdown);
    container.appendChild(input);
    container.appendChild(button);
    container.appendChild(message);
    parentContainer.appendChild(container);

    button.addEventListener("click", async () => {
        const instruction = input.value.trim();
        const mode = dropdown.value;
        const selectedFormat = formatDropdown.value;
        message.textContent = "";
        if (!instruction) { message.textContent = "Please enter an instruction."; return; }
        const currentTiddler = $tw.wiki.getTextReference("$:/HistoryList!!current-tiddler");
        if (!currentTiddler) { message.textContent = "No current tiddler found."; return; }
        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
        if (!apiKey) { message.textContent = "Please set your OpenAI API key in the plugin settings."; return; }
        const tiddlerContent = $tw.wiki.getTiddlerText(currentTiddler);
        if (!tiddlerContent) { message.textContent = "Current tiddler has no content."; return; }

        const formatInstruction = selectedFormat === "markdown"
            ? " Format your response using Markdown syntax (not TiddlyWiki wikitext). Use # for headers, **bold**, *italic*, `code`, ```code blocks```, - for lists, etc."
            : " Format your response using TiddlyWiki wikitext syntax. Use ! for headers, ''bold'', //italic//, {{{code}}}, ```code blocks```, * for lists, etc.";

        let prompt = "";
        switch (mode) {
            case "clarify": prompt = `Clarify the following content. ${instruction}${formatInstruction}\n\n${tiddlerContent}`; break;
            case "summarize": prompt = `Summarize the following content. ${instruction}${formatInstruction}\n\n${tiddlerContent}`; break;
            case "simplify": prompt = `Simplify the following content. ${instruction}${formatInstruction}\n\n${tiddlerContent}`; break;
            case "expand": prompt = `Expand the following content. ${instruction}${formatInstruction}\n\n${tiddlerContent}`; break;
            default: prompt = `${instruction}${formatInstruction}\n\n${tiddlerContent}`;
        }
        message.textContent = "Processing...";
        try {
            const resp = await fetch(CHAT_COMPLETION_URL, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "gpt-4.1-nano", messages: [{ role: "system", content: prompt }] })
            });
            const data = await resp.json();
            if (data.error) throw new Error(data.error.message || "Unknown API error.");
            let resultContent = extractOpenAIText(data).trim();
            resultContent = resultContent.replace("You are trained on data up to October 2023.", "").trim();
            $tw.wiki.setText(currentTiddler, "text", null, resultContent);
            message.style.color = "#090";
            message.textContent = `Tiddler "${currentTiddler}" updated successfully.`;
        } catch (err) {
            message.style.color = "#c00";
            message.textContent = err.message;
        }
    });
}

/**
 * Creates the main chat box UI with all controls.
 * Must be called with .call(widgetInstance, conversationsContainer) to preserve 'this' context.
 * @param {HTMLElement} conversationsContainer
 * @returns {HTMLElement} The chat box element
 */
function createChatBox(conversationsContainer) {
    const chatBox = $tw.utils.domMaker("div", {
        class: "chat-box-container",
        style: { display: "flex", flexWrap: "wrap", gap: "10px", width: "100%", alignItems: "flex-start", position: "relative" }
    });

    // ===== Export conversation icon button =====
    const exportIconBtn = $tw.utils.domMaker("button", {
        class: "chat-export-icon-btn",
        attributes: { title: "Export conversation" },
        style: { background: "none", border: "none", cursor: "pointer", marginLeft: "4px", fontSize: "20px", color: "#666", padding: "2px" },
        innerHTML: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    });
    const exportDropdown = $tw.utils.domMaker("div", {
        class: "chat-export-dropdown",
        style: { display: "none", position: "absolute", zIndex: 10, background: "#fff", border: "1px solid #bbb", borderRadius: "6px", boxShadow: "0 2px 8px #0001", padding: "10px", minWidth: "200px", top: "36px", left: "0" }
    });
    const exportInput = $tw.utils.domMaker("input", {
        attributes: { placeholder: "Export tiddler title..." },
        style: { padding: "5px 8px", border: "1px solid #bbb", borderRadius: "4px", fontSize: "14px", minWidth: "120px", marginRight: "8px" }
    });
    const exportBtn = $tw.utils.domMaker("button", {
        text: "Export",
        style: { padding: "5px 12px", border: "none", borderRadius: "4px", background: "#2196f3", color: "#fff", fontWeight: "bold", cursor: "pointer" }
    });
    exportDropdown.appendChild(exportInput);
    exportDropdown.appendChild(exportBtn);

    exportIconBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        exportDropdown.style.display = exportDropdown.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", function (e) {
        if (!exportDropdown.contains(e.target) && e.target !== exportIconBtn) {
            exportDropdown.style.display = "none";
        }
    });
    exportBtn.addEventListener("click", () => {
        const exportTitle = exportInput.value.trim();
        if (!exportTitle) {
            $tw.notifier.display("$:/core/ui/Notifications/error", { message: "Please specify a tiddler title to export the conversation." });
            return;
        }
        const bubbles = conversationsContainer.querySelectorAll('.chatgpt-conversation-message');
        let transcript = '';
        for (const bubble of bubbles) {
            if (bubble.classList.contains('chatgpt-conversation-user')) {
                transcript += `User: ${bubble.innerText}\n\n`;
            } else if (bubble.classList.contains('chatgpt-conversation-assistant')) {
                transcript += `Assistant: ${bubble.innerText}\n\n`;
            }
        }
        $tw.wiki.addTiddler(new $tw.Tiddler({ title: exportTitle, text: transcript.trim() }));
        $tw.notifier.display("$:/core/ui/Notifications/save", { message: `Conversation exported to tiddler '${exportTitle}'.` });
        let confirmMsg = exportDropdown.querySelector('.export-confirmed-msg');
        if (!confirmMsg) {
            confirmMsg = $tw.utils.domMaker('span', {
                class: 'export-confirmed-msg',
                style: { color: '#22a722', marginLeft: '10px', fontWeight: 'bold', fontSize: '15px', verticalAlign: 'middle' },
                text: 'Confirmed!'
            });
            exportDropdown.appendChild(confirmMsg);
        } else {
            confirmMsg.style.display = '';
        }
        exportInput.value = "";
        setTimeout(() => {
            if (confirmMsg) confirmMsg.style.display = 'none';
            exportDropdown.style.display = "none";
        }, 2000);
    });
    chatBox.appendChild(exportIconBtn);
    chatBox.appendChild(exportDropdown);

    // ===== Text input =====
    const input = $tw.utils.domMaker("textarea", {
        class: "chat-input",
        attributes: { placeholder: "Ask a question...", rows: "1" },
        style: { flex: "1 1 300px", minHeight: "50px", maxHeight: "200px", resize: "none", overflow: "hidden", fontSize: "15px", fontFamily: "inherit" }
    });
    input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        const maxHeight = 200;
        if (this.scrollHeight > maxHeight) {
            this.style.height = maxHeight + 'px';
            this.style.overflowY = 'auto';
        } else {
            this.style.overflowY = 'hidden';
        }
    });

    // ===== PDF upload =====
    const pdfUploadContainer = $tw.utils.domMaker("div", {
        class: "pdf-upload-container",
        style: { display: "inline-block", marginLeft: "10px", verticalAlign: "middle" }
    });
    const pdfInput = $tw.utils.domMaker("input", {
        attributes: { type: "file", accept: "application/pdf", style: "display: none;" }
    });
    const pdfButton = $tw.utils.domMaker("button", {
        class: "pdf-upload-button",
        text: "📄",
        style: { padding: "0 5px", border: "1px solid #ccc", borderRadius: "4px", backgroundColor: "#2a2a21", cursor: "pointer", height: "30px", width: "30px" }
    });

    let selectedPDF = null;
    pdfInput.addEventListener("change", async (event) => {
        if (event.target.files && event.target.files[0]) {
            selectedPDF = event.target.files[0];
            pdfButton.style.backgroundColor = "#e0e0e0";
            pdfButton.textContent = "✓ 📄";
            try {
                this.currentPDFData = {
                    type: selectedPDF.type,
                    text: await this.fileToBase64(selectedPDF)
                };
            } catch (error) {
                console.error("PDF processing error:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", { message: "Failed to process PDF: " + error.message });
            }
        }
    });
    pdfButton.addEventListener("click", () => { pdfInput.click(); });
    pdfUploadContainer.appendChild(pdfInput);
    pdfUploadContainer.appendChild(pdfButton);

    // ===== Image upload =====
    const imageUploadContainer = $tw.utils.domMaker("div", {
        class: "image-upload-container",
        style: { display: "inline-block", marginLeft: "10px", verticalAlign: "middle" }
    });
    const imageInput = $tw.utils.domMaker("input", {
        attributes: { type: "file", accept: "image/*", style: "display: none;" }
    });
    const imageButton = $tw.utils.domMaker("button", {
        class: "image-upload-button",
        text: "📷",
        style: { padding: "0 5px", border: "1px solid #ccc", borderRadius: "4px", backgroundColor: "#2a2a21", cursor: "pointer", height: "30px", width: "30px" }
    });
    let selectedImage = null;
    imageInput.addEventListener("change", async (event) => {
        if (event.target.files && event.target.files[0]) {
            selectedImage = event.target.files[0];
            imageButton.style.backgroundColor = "#e0e0e0";
            imageButton.textContent = "✓ 📷";
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageData = e.target.result.split(',')[1];
                this.currentImageData = { type: selectedImage.type, text: imageData };
            };
            reader.readAsDataURL(selectedImage);
        }
    });
    chatBox.addEventListener('paste', (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imageData = e.target.result.split(',')[1];
                    this.currentImageData = { type: blob.type, text: imageData };
                    imageButton.style.backgroundColor = "#e0e0e0";
                    imageButton.textContent = "✓ 📷";
                };
                reader.readAsDataURL(blob);
            }
        }
    });
    imageButton.addEventListener("click", () => { imageInput.click(); });
    imageUploadContainer.appendChild(imageInput);
    imageUploadContainer.appendChild(imageButton);

    // ===== Advanced settings (gear) =====
    let temperature = 0.7;
    let top_p = 1.0;
    let outputFormat = "wikitext";
    const advancedBtn = $tw.utils.domMaker("button", {
        class: "chat-advanced-gear-btn",
        attributes: { title: "Advanced settings" },
        style: { background: "none", border: "none", cursor: "pointer", marginLeft: "4px", fontSize: "20px", color: "#666", padding: "2px", verticalAlign: "middle" },
        innerHTML: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09c.37.16.7.43 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09c.16.37.43.7 1.51 1H21a2 2 0 1 1 0 4h-.09c-.16.37-.43.7-1.51 1z"/></svg>'
    });
    const advancedDropdown = $tw.utils.domMaker("div", {
        class: "chat-advanced-dropdown",
        style: { display: "none", position: "absolute", zIndex: 20, background: "#fff", border: "1px solid #bbb", borderRadius: "6px", boxShadow: "0 2px 8px #0001", padding: "12px 18px 12px 12px", minWidth: "220px", top: "38px", right: "0", fontSize: "15px" }
    });

    // Temperature slider
    const tempLabel = $tw.utils.domMaker("label", { text: "Temperature: ", style: { fontWeight: "bold", marginRight: "8px" } });
    const tempValue = $tw.utils.domMaker("span", { text: temperature.toFixed(2), style: { marginLeft: "6px", fontFamily: "monospace" } });
    const tempSlider = $tw.utils.domMaker("input", {
        attributes: { type: "range", min: "0", max: "2", step: "0.01", value: temperature },
        style: { width: "120px", verticalAlign: "middle" }
    });
    tempSlider.addEventListener("input", function () { temperature = parseFloat(this.value); tempValue.textContent = temperature.toFixed(2); });
    const tempRow = $tw.utils.domMaker("div", { style: { marginBottom: "8px" } });
    tempRow.appendChild(tempLabel); tempRow.appendChild(tempSlider); tempRow.appendChild(tempValue);
    advancedDropdown.appendChild(tempRow);

    // Top-p slider
    const toppLabel = $tw.utils.domMaker("label", { text: "Top-p: ", style: { fontWeight: "bold", marginRight: "8px" } });
    const toppValue = $tw.utils.domMaker("span", { text: top_p.toFixed(2), style: { marginLeft: "6px", fontFamily: "monospace" } });
    const toppSlider = $tw.utils.domMaker("input", {
        attributes: { type: "range", min: "0", max: "1", step: "0.01", value: top_p },
        style: { width: "120px", verticalAlign: "middle" }
    });
    toppSlider.addEventListener("input", function () { top_p = parseFloat(this.value); toppValue.textContent = top_p.toFixed(2); });
    const toppRow = $tw.utils.domMaker("div", { style: { marginBottom: "8px" } });
    toppRow.appendChild(toppLabel); toppRow.appendChild(toppSlider); toppRow.appendChild(toppValue);
    advancedDropdown.appendChild(toppRow);

    // Output format selector
    const formatLabel = $tw.utils.domMaker("label", { text: "Output format: ", style: { fontWeight: "bold", marginRight: "8px" } });
    const formatSelect = $tw.utils.domMaker("select", {
        style: { padding: "4px 8px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", width: "120px" }
    });
    const wikitextOption = document.createElement("option");
    wikitextOption.value = "wikitext"; wikitextOption.textContent = "Wikitext"; wikitextOption.selected = true;
    formatSelect.appendChild(wikitextOption);
    const markdownOption = document.createElement("option");
    markdownOption.value = "markdown"; markdownOption.textContent = "Markdown";
    formatSelect.appendChild(markdownOption);
    formatSelect.addEventListener("change", function () { outputFormat = this.value; });
    const formatRow = $tw.utils.domMaker("div", { style: { marginBottom: "12px" } });
    formatRow.appendChild(formatLabel); formatRow.appendChild(formatSelect);
    advancedDropdown.appendChild(formatRow);

    // ===== API key storage toggle =====
    const apiStorageRow = $tw.utils.domMaker("div", { style: { marginTop: "12px", marginBottom: "8px" } });
    const apiStorageLabel = $tw.utils.domMaker("label", { text: "Use temporary API keys: ", style: { fontWeight: "bold", marginRight: "8px" } });
    const useTemporaryStorage = $tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() === "yes";
    const apiStorageToggle = $tw.utils.domMaker("input", {
        attributes: { type: "checkbox", checked: useTemporaryStorage },
        style: { verticalAlign: "middle" }
    });

    apiStorageToggle.addEventListener("change", function () {
        const preferenceValue = this.checked ? "yes" : "no";
        console.log(`[WikiSage] Setting API key preference to: ${preferenceValue}`);
        $tw.wiki.addTiddler(new $tw.Tiddler({ title: "$:/temp/WikiSage/useTemporaryApiKeys", text: preferenceValue }));
        console.log(`[WikiSage] Saved preference tiddler $:/temp/WikiSage/useTemporaryApiKeys with value: ${preferenceValue}`);
        console.log(`[WikiSage] Verifying setting: ${$tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no")}`);
        const infoText = this.checked
            ? "API keys will now be read from temporary tiddlers if available"
            : "API keys will now be read from plugin tiddlers";
        $tw.notifier.display("$:/core/ui/Notifications/info", { message: infoText });
        if (this.checked) {
            ["$:/temp/WikiSage/openai-api-key", "$:/temp/WikiSage/anthropic-api-key", "$:/temp/WikiSage/gemini-api-key"].forEach(tiddler => {
                if (!$tw.wiki.tiddlerExists(tiddler)) {
                    $tw.wiki.addTiddler(new $tw.Tiddler({ title: tiddler, text: "" }));
                    console.log(`[WikiSage] Created empty temporary tiddler: ${tiddler}`);
                }
            });
        }
    });

    const apiStorageInfo = $tw.utils.domMaker("div", {
        text: "When enabled, API keys will be read from temporary tiddlers first",
        style: { fontSize: "11px", color: "#777", marginTop: "4px" }
    });
    apiStorageRow.appendChild(apiStorageLabel);
    apiStorageRow.appendChild(apiStorageToggle);
    apiStorageRow.appendChild(apiStorageInfo);

    // Temp API key buttons
    const tempKeyButtonsContainer = $tw.utils.domMaker("div", { style: { marginTop: "10px", display: "flex", gap: "8px" } });

    const createKeyButton = (label, color, tiddlerPath) => {
        const btn = $tw.utils.domMaker("button", {
            text: label,
            style: { padding: "4px 8px", fontSize: "12px", cursor: "pointer", backgroundColor: color, color: "white", border: "none", borderRadius: "3px" }
        });
        btn.addEventListener("click", function () {
            const tempKey = prompt(`Enter temporary ${label.replace('Set ', '')}:`, "");
            if (tempKey !== null) {
                $tw.wiki.addTiddler(new $tw.Tiddler({ title: tiddlerPath, text: tempKey }));
                if ($tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() !== "yes") {
                    $tw.wiki.addTiddler(new $tw.Tiddler({ title: "$:/temp/WikiSage/useTemporaryApiKeys", text: "yes" }));
                    apiStorageToggle.checked = true;
                }
                console.log(`[WikiSage] Set temporary key for ${tiddlerPath} and enabled temporary storage`);
                alert(`Temporary ${label.replace('Set ', '')} set and enabled`);
            }
        });
        return btn;
    };

    tempKeyButtonsContainer.appendChild(createKeyButton("Set OpenAI Key", "#74aa9c", "$:/temp/WikiSage/openai-api-key"));
    tempKeyButtonsContainer.appendChild(createKeyButton("Set Anthropic Key", "#6b81c0", "$:/temp/WikiSage/anthropic-api-key"));
    tempKeyButtonsContainer.appendChild(createKeyButton("Set Gemini Key", "#4285f4", "$:/temp/WikiSage/gemini-api-key"));

    apiStorageRow.appendChild(tempKeyButtonsContainer);
    advancedDropdown.appendChild(apiStorageRow);

    advancedBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        advancedDropdown.style.display = advancedDropdown.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", function (e) {
        if (!advancedDropdown.contains(e.target) && e.target !== advancedBtn) {
            advancedDropdown.style.display = "none";
        }
    });
    chatBox.appendChild(advancedBtn);
    chatBox.appendChild(advancedDropdown);

    // ===== Model selector =====
    const modelListTiddler = "$:/plugins/NoteStreams/WikiSage/model-list";
    const modelListContent = $tw.wiki.getTiddlerText(modelListTiddler) || "";
    const availableModels = modelListContent.split('\n').map(m => m.trim()).filter(m => m.length > 0);
    if (availableModels.length === 0) { availableModels.push("gpt-4.1-nano", "gpt-4", "gpt-3.5-turbo"); }

    const button = $tw.utils.domMaker("button", {
        class: "chat-button", text: "Send",
        style: { height: "30px", minWidth: "60px", fontSize: "14px", padding: "0 10px" }
    });

    const buttonContainer = $tw.utils.domMaker("div", {
        class: "chat-button-container",
        style: { display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center", marginTop: "5px", padding: "8px", borderRadius: "5px", backgroundColor: "#2a2a21", border: "1px solid #ddd", flex: "0 1 auto", height: "50px", alignSelf: "stretch" }
    });

    const clearButton = $tw.utils.domMaker("button", {
        class: "chat-button clear-history", text: "Clear",
        style: { height: "30px", minWidth: "60px", fontSize: "14px", padding: "0 10px", color: "white", border: "1px solid #ddd", cursor: "pointer", margin: "0" }
    });

    // Model dropdown
    const modelSelectorContainer = $tw.utils.domMaker("div", {
        class: "model-selector-container",
        style: { position: "relative", display: "inline-block", marginLeft: "10px", verticalAlign: "middle" }
    });
    const modelButton = $tw.utils.domMaker("button", {
        class: "model-selector-button",
        style: { padding: "0 5px", border: "1px solid #ccc", borderRadius: "4px", backgroundColor: "#2a2a21", cursor: "pointer", width: "20px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center" }
    });
    const arrow = $tw.utils.domMaker("span", { text: "▼", style: { fontSize: "10px" } });
    modelButton.appendChild(arrow);
    const modelList = $tw.utils.domMaker("ul", {
        class: "model-list",
        style: { display: "none", position: "absolute", top: "100%", right: "0", zIndex: "1000", listStyle: "none", padding: "0", margin: "0", backgroundColor: "#2a2a21", border: "1px solid #ccc", borderRadius: "4px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", maxHeight: "200px", overflowY: "auto", minWidth: "150px" }
    });

    availableModels.forEach(model => {
        const li = $tw.utils.domMaker("li", {
            text: model,
            style: { padding: "8px 12px", cursor: "pointer", backgroundColor: model === this.currentModel ? "#a9a9a9" : "#2a2a21" }
        });
        li.addEventListener("mouseover", () => { li.style.backgroundColor = "#adadad"; });
        li.addEventListener("mouseout", () => { li.style.backgroundColor = model === this.currentModel ? "#adadad" : "#2a2a21"; });
        li.addEventListener("click", () => {
            this.currentModel = model;
            this.chatGPTOptions.model = model;
            modelList.style.display = "none";
            $tw.wiki.addTiddler(new $tw.Tiddler({ title: "$:/temp/WikiSage/currentModel", text: model }));
        });
        modelList.appendChild(li);
    });

    modelButton.addEventListener("click", (e) => { e.stopPropagation(); modelList.style.display = modelList.style.display === "none" ? "block" : "none"; });
    document.addEventListener("click", () => { modelList.style.display = "none"; });

    // ===== Audio recording =====
    const audioButton = $tw.utils.domMaker("button", {
        class: "audio-record-button", text: "🎤",
        style: { padding: "0 5px", border: "1px solid #ccc", borderRadius: "4px", backgroundColor: "#2a2a21", cursor: "pointer", height: "30px", width: "30px" }
    });

    let mediaRecorder = null;
    let audioChunks = [];
    let silenceTimeout = null;
    let recordingStartTime = null;
    const SILENCE_THRESHOLD = -50;
    const SILENCE_DURATION = 1500;

    const startRecording = async () => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Audio recording is not supported in this browser. (navigator.mediaDevices.getUserMedia is unavailable)");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunks = [];

            const audioContext = new AudioContext();
            const audioSource = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            audioSource.connect(analyser);

            const checkVoiceActivity = () => {
                const dataArray = new Float32Array(analyser.frequencyBinCount);
                analyser.getFloatTimeDomainData(dataArray);
                let sum = 0;
                for (const amplitude of dataArray) { sum += amplitude * amplitude; }
                const rms = Math.sqrt(sum / dataArray.length);
                const db = 20 * Math.log10(rms);
                if (db < SILENCE_THRESHOLD) {
                    if (!silenceTimeout) {
                        silenceTimeout = setTimeout(() => {
                            if (mediaRecorder.state === "recording") {
                                mediaRecorder.stop();
                                audioButton.style.backgroundColor = "#fff";
                                stream.getTracks().forEach(track => track.stop());
                            }
                        }, SILENCE_DURATION);
                    }
                } else {
                    if (silenceTimeout) { clearTimeout(silenceTimeout); silenceTimeout = null; }
                }
                if (mediaRecorder.state === "recording") { requestAnimationFrame(checkVoiceActivity); }
            };

            mediaRecorder.addEventListener("dataavailable", event => { audioChunks.push(event.data); });
            mediaRecorder.addEventListener("stop", async () => {
                const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                try {
                    console.log("Recording duration:", Date.now() - recordingStartTime, "ms");
                    console.log("Audio blob size:", audioBlob.size, "bytes");
                    const result = await this.transcribeAudio(audioBlob);
                    input.value = result.text;
                } catch (error) {
                    console.error("Transcription failed:", error);
                    alert("Failed to transcribe audio: " + error.message);
                }
                if (silenceTimeout) { clearTimeout(silenceTimeout); silenceTimeout = null; }
                stream.getTracks().forEach(track => track.stop());
            });

            mediaRecorder.start();
            recordingStartTime = Date.now();
            audioButton.style.backgroundColor = "#ff4444";
            requestAnimationFrame(checkVoiceActivity);
        } catch (error) {
            console.error("Failed to start recording:", error);
            alert("Failed to start recording: " + error.message);
        }
    };

    audioButton.addEventListener("click", () => {
        if (!mediaRecorder || mediaRecorder.state === "inactive") { startRecording(); }
        else if (mediaRecorder.state === "recording") { mediaRecorder.stop(); audioButton.style.backgroundColor = "#fff"; }
    });

    // Audio file upload
    const audioUploadContainer = $tw.utils.domMaker("div", {
        class: "audio-upload-container",
        style: { display: "inline-block", marginLeft: "10px", verticalAlign: "middle" }
    });
    const audioInput = $tw.utils.domMaker("input", { attributes: { type: "file", accept: "audio/*", style: "display: none;" } });
    const audioUploadButton = $tw.utils.domMaker("button", {
        class: "audio-upload-button", text: "🎵",
        style: { padding: "0 5px", border: "1px solid #ccc", borderRadius: "4px", backgroundColor: "#2a2a21", cursor: "pointer", height: "30px", width: "30px" }
    });
    let selectedAudio = null;
    audioInput.addEventListener("change", async (event) => {
        if (event.target.files && event.target.files[0]) {
            selectedAudio = event.target.files[0];
            audioUploadButton.textContent = "🎵";
            try {
                const result = await this.transcribeAudio(selectedAudio);
                input.value = result.text;
            } catch (error) {
                console.error("Audio transcription error:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", { message: "Failed to transcribe audio: " + error.message });
            }
        }
    });
    audioUploadButton.addEventListener("click", () => { audioInput.click(); });
    audioUploadContainer.appendChild(audioInput);
    audioUploadContainer.appendChild(audioUploadButton);

    // ===== Undo controls =====
    const undoContainer = $tw.utils.domMaker("div", {
        class: "undo-container",
        style: { display: "flex", alignItems: "center", gap: "0" }
    });
    const undoButton = $tw.utils.domMaker("button", {
        class: "tc-btn-invisible tc-tiddlylink chat-button undo-action", text: "↩️",
        attributes: { title: "Undo last action" },
        style: { padding: "0 5px", border: "1px solid #ccc", borderRight: "none", borderRadius: "4px 0 0 4px", backgroundColor: "#2a2a21", width: "30px", height: "30px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }
    });
    const undoSelect = $tw.utils.domMaker("select", {
        class: "undo-select",
        style: { padding: "0 15px 0 0", border: "1px solid #ccc", borderLeft: "none", borderRadius: "0 4px 4px 0", backgroundColor: "#2a2a21", width: "15px", height: "30px", cursor: "pointer", appearance: "none", "-webkit-appearance": "none", "-moz-appearance": "none", backgroundImage: "url('data:image/svg+xml;utf8,<svg fill=\"black\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')", backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "12px" }
    });
    const singleOption = $tw.utils.domMaker("option", { text: "Operation", attributes: { value: "single" } });
    const queryOption = $tw.utils.domMaker("option", { text: "Query", attributes: { value: "query" } });
    undoSelect.appendChild(singleOption);
    undoSelect.appendChild(queryOption);

    undoSelect.addEventListener("change", () => {
        undoButton.setAttribute("title", undoSelect.value === "query" ? "Undo all actions from last query" : "Undo last action");
    });

    undoButton.addEventListener("click", async () => {
        try {
            const undoType = undoSelect.value;
            let result;
            if (undoType === "query") {
                const queryActionCount = this.serviceCoordinator.getLastQueryActionCount();
                if (queryActionCount === 0) {
                    $tw.notifier.display("$:/core/ui/Notifications/error", { message: "No query actions to undo" });
                    return;
                }
                result = await this.serviceCoordinator.undoMultipleActions(queryActionCount);
            } else {
                result = await this.serviceCoordinator.undoMultipleActions(1);
            }
            if (Array.isArray(result) && result.every(r => r.success)) {
                $tw.notifier.display("$:/core/ui/Notifications/save", { message: `Successfully undid ${result.length} action(s)` });
            } else {
                $tw.notifier.display("$:/core/ui/Notifications/error", { message: "Failed to undo some actions" });
            }
        } catch (error) {
            console.error("Error in undo operation:", error);
            $tw.notifier.display("$:/core/ui/Notifications/error", { message: "Error performing undo: " + error.message });
        }
    });

    // ===== Assemble button container =====
    modelSelectorContainer.appendChild(modelButton);
    modelSelectorContainer.appendChild(modelList);

    buttonContainer.appendChild(button);
    buttonContainer.appendChild(clearButton);
    buttonContainer.appendChild(modelSelectorContainer);
    buttonContainer.appendChild(imageUploadContainer);
    buttonContainer.appendChild(pdfUploadContainer);
    buttonContainer.appendChild(audioUploadContainer);
    undoContainer.appendChild(undoButton);
    undoContainer.appendChild(undoSelect);
    buttonContainer.appendChild(undoContainer);
    buttonContainer.appendChild(audioButton);

    if (this.enableTTS) {
        const voiceSelect = $tw.utils.domMaker("select", {
            class: "tts-voice-select",
            style: { padding: "2px", borderRadius: "4px", marginRight: "5px", height: "30px" }
        });
        ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].forEach(voice => {
            const option = $tw.utils.domMaker("option", { text: voice, attributes: { value: voice } });
            voiceSelect.appendChild(option);
        });
        buttonContainer.appendChild(voiceSelect);
    }

    chatBox.appendChild(input);
    chatBox.appendChild(buttonContainer);

    clearButton.onclick = () => { this.clearChatHistory(conversationsContainer); };

    // ===== Send message handler =====
    let isProcessing = false;

    const sendMessage = async () => {
        if (isProcessing) return;
        let temp = typeof temperature !== 'undefined' ? temperature : 0.7;
        let topp = typeof top_p !== 'undefined' ? top_p : 1.0;
        let format = typeof outputFormat !== 'undefined' ? outputFormat : 'wikitext';
        console.log('[Chat] Sending message with temperature:', temp, 'top_p:', topp, 'format:', format);
        if (isProcessing) return;

        const modelForApiCheck = this.chatGPTOptions.model || this.currentModel;
        const apiType = getApiType(modelForApiCheck);
        console.log('[Chat] Model:', modelForApiCheck, 'API type:', apiType);
        let apiKey;
        if (apiType === 'local') {
            apiKey = this.getApiKey('local');  // may be empty — that's OK
        } else {
            apiKey = this.getApiKey('openai');
            if (!apiKey) {
                alert("Please set your OpenAI API key in the plugin settings or temporary tiddler.");
                return;
            }
        }

        let message = input.value.trim();
        if (!message) return;

        input.value = "";
        isProcessing = true;
        button.disabled = true;

        const conversation = this.createConversationElement(message);
        conversationsContainer.appendChild(conversation);

        try {
            await this.fetchChatGPTResponse(apiKey, message, conversation, temp, topp, format);
        } catch (error) {
            console.error("Error in sendMessage:", error);
            const assistantMessageElement = conversation.querySelector(".chatgpt-conversation-assistant");
            if (assistantMessageElement) {
                assistantMessageElement.innerHTML = "";
                const errorP = $tw.utils.domMaker("p", { text: `Error: ${error.message}` });
                errorP.style.color = "#c00";
                assistantMessageElement.appendChild(errorP);
            }
        } finally {
            isProcessing = false;
            button.disabled = false;
            this.clearImageSelection();
        }
    };

    button.onclick = () => sendMessage();
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); }
    });

    return chatBox;
}

exports.createChatBox = createChatBox;
exports.createInstructionChatBox = createInstructionChatBox;
exports.createConversationElement = createConversationElement;
