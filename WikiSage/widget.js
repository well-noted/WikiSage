/*\
created: 20241020191728666
creator: admin
title: $:/plugins/NoteStreams/WikiSage/widget.js
type: application/javascript
tags:
modified: 20260223010744761
modifier: admin
module-type: widget
\*/

"use strict";

// ===== Core TiddlyWiki =====
var import_widget = require("$:/core/modules/widgets/widget.js");

// ===== Existing services =====
const { ChatGPTErrorHandler } = require("$:/plugins/NoteStreams/WikiSage/error-handler.js");
const { ValidationService } = require("$:/plugins/NoteStreams/WikiSage/validation-service.js");
const { ActionSequenceManager } = require("$:/plugins/NoteStreams/WikiSage/action-sequence-manager.js");
const { CacheService } = require("$:/plugins/NoteStreams/WikiSage/cache-service.js");
const { ConversationHistory } = require("$:/plugins/NoteStreams/WikiSage/conversation-history.js");
const { ServiceCoordinator } = require("$:/plugins/NoteStreams/WikiSage/service-coordinator.js");
const { ConnectionPool } = require("$:/plugins/NoteStreams/WikiSage/connection-pool.js");

// ===== Extracted modules =====
const { installFetchSanitizer, CHAT_COMPLETION_URL, ANTHROPIC_API_URL, getApiType,
        getLocalChatCompletionUrl, getLocalModelName,
        renderMarkdownWithLineBreaks, basicMarkdownToHtml } = require("$:/plugins/NoteStreams/WikiSage/utils.js");
const { TiddlerOperations } = require("$:/plugins/NoteStreams/WikiSage/tiddler-operations.js");
const { MediaHandler } = require("$:/plugins/NoteStreams/WikiSage/media-handler.js");
const { ApiHandler } = require("$:/plugins/NoteStreams/WikiSage/api-handler.js");
const chatUI = require("$:/plugins/NoteStreams/WikiSage/chat-ui-builder.js");

// Install the fetch sanitizer once at module load
installFetchSanitizer();

// Load macros (registers $tw.macros entries; must run after $tw.macros is initialized)
require("$:/plugins/NoteStreams/WikiSage/macros.js");


class ChatGPTWidget extends import_widget.widget {

    // ==================== LIFECYCLE ====================

    constructor() {
        super(...arguments);

        // Existing services
        this.errorHandler = new ChatGPTErrorHandler();
        this.validationService = new ValidationService($tw);
        this.serviceCoordinator = new ServiceCoordinator($tw);
        this.actionManager = new ActionSequenceManager($tw);
        this.conversationHistory = new ConversationHistory($tw.wiki);

        // Widget state
        this.containerNodeTag = "div";
        this.containerNodeClass = "";
        this.tmpHistoryTiddler = "$:/temp/NoteStreams/WikiSage/history-" + Date.now();
        this.historyTiddler = this.tmpHistoryTiddler;
        this.chatButtonText = $tw.wiki.getTiddlerText("$:/core/images/add-comment");
        this.scroll = false;
        this.readonly = false;
        this.chatGPTOptions = {};
        this.systemMessage = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/SystemMessage", "").trim();
        this.currentModel = $tw.wiki.getTiddlerText("$:/temp/ChatGPT/currentModel") || "gpt-4.1-nano";
        this.actionHistory = [];
        this.queryStartTime = null;
        this.currentUserRequest = null;

        // API configuration
        this.anthropicConfig = {
            apiKey: this.getApiKey('anthropic'),
            maxTokens: 4096
        };
        this.geminiApiKey = this.getApiKey('gemini');

        // Cache service
        this.cacheService = new CacheService({
            maxAge: 15 * 60 * 1000,
            maxSize: 200,
            compressionThreshold: 2048
        });

        // Connection pool
        this.connectionPool = new ConnectionPool({
            maxSize: 5,
            idleTimeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            acquireTimeout: 5000
        });

        // Extracted modules
        this.tiddlerOps = new TiddlerOperations(this.cacheService);
        this.mediaHandler = new MediaHandler({
            connectionPool: this.connectionPool,
            getApiKey: this.getApiKey.bind(this),
            anthropicConfig: this.anthropicConfig
        });
        this.apiHandler = new ApiHandler(this);

        // Load persisted cache
        this.cacheService.loadPersistedCache();
    }

    initialise(parseTreeNode, options) {
        super.initialise(parseTreeNode, options);
        this.computeAttributes();
    }

    execute() {
        this.containerNodeTag = this.getAttribute("component", "div");
        this.containerNodeClass = this.getAttribute("className", "");
        this.historyTiddler = this.getAttribute("history", "") || this.tmpHistoryTiddler;
        this.scroll = this.getAttribute("scroll", "").toLowerCase() === "yes";
        this.readonly = this.getAttribute("readonly", "").toLowerCase() === "yes";
        this.tiddlerTitle = this.getAttribute("tiddlerTitle", "");
        this.useCurrentTiddler = this.getAttribute("useCurrentTiddler", "").toLowerCase() === "yes";
        this.enableTTS = this.getAttribute("tts", "no").toLowerCase() === "yes";

        console.log("Executing ChatGPTWidget:");
        console.log("tiddlerTitle:", this.tiddlerTitle);
        console.log("useCurrentTiddler:", this.useCurrentTiddler);

        const temperature = Number(this.getAttribute("temperature"));
        const top_p = Number(this.getAttribute("top_p"));
        const max_tokens = parseInt(this.getAttribute("max_tokens"), 10);
        const presence_penalty = Number(this.getAttribute("presence_penalty"));
        const frequency_penalty = Number(this.getAttribute("frequency_penalty"));

        this.chatGPTOptions = {
            model: this.getAttribute("model", this.currentModel || "gpt-4.1-nano"),
            temperature: temperature >= 0 && temperature <= 2 ? temperature : undefined,
            top_p: top_p >= 0 && top_p <= 1 ? top_p : undefined,
            max_completion_tokens: Number.isSafeInteger(max_tokens) && max_tokens > 0 ? max_tokens : undefined,
            presence_penalty: presence_penalty >= -2 && presence_penalty <= 2 ? presence_penalty : undefined,
            frequency_penalty: frequency_penalty >= -2 && frequency_penalty <= 2 ? frequency_penalty : undefined,
            user: this.getAttribute("user"),
            useAdversarialValidation: this.getAttribute("adversarial", "no").toLowerCase() === "yes"
        };

        const sysMsg = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/SystemMessage", "").trim();
        this.systemMessage = sysMsg || "You are a helpful assistant.";
    }

    render(parent, nextSibling) {
        if (!$tw.browser) return;

        this.parentDomNode = parent;
        this.computeAttributes();
        this.execute();

        const container = $tw.utils.domMaker(this.containerNodeTag, {
            class: "chat-interface-container " + this.containerNodeClass
        });

        const conversationsContainer = $tw.utils.domMaker("div", {
            class: this.scroll ? "conversations-scroll" : "conversations"
        });
        container.appendChild(conversationsContainer);

        if (!this.readonly) {
            const chatBox = this.createChatBox(conversationsContainer);
            container.appendChild(chatBox);
        }

        this.conversationHistory.render(conversationsContainer, this);

        if (this.domNodes.length === 0) {
            parent.insertBefore(container, nextSibling);
            this.domNodes.push(container);
        } else {
            this.refreshSelf();
        }
    }

    refresh(changedTiddlers) {
        const changedAttributes = this.computeAttributes();
        if (Object.keys(changedAttributes).length > 0 || this.historyTiddler in changedTiddlers) {
            this.refreshSelf();
            return true;
        }
        return false;
    }

    destroy() {
        if (this.cacheService) { this.cacheService.persistCache(); }
        this.cacheService = null;
        this.errorHandler = null;
        this.conversationHistory = null;
        this.actionHistory = [];
        this.globalState = null;
        super.destroy();
    }

    // ==================== API KEY MANAGEMENT ====================

    getApiKey(type) {
        type = type || 'openai';
        const useTemporaryStorage = $tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() === "yes";

        console.log(`[WikiSage] Getting ${type} API key. Using temporary storage: ${useTemporaryStorage}`);

        let apiKeyTiddler, tempApiKeyTiddler;

        switch (type.toLowerCase()) {
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
        }

        console.log(`[WikiSage] Permanent tiddler: ${apiKeyTiddler}, Temp tiddler: ${tempApiKeyTiddler}`);

        if (useTemporaryStorage) {
            const tempApiKey = $tw.wiki.getTiddlerText(tempApiKeyTiddler, "").trim();
            console.log(`[WikiSage] Temporary API key found: ${tempApiKey ? "Yes" : "No"}`);
            if (tempApiKey) {
                console.log(`[WikiSage] Using temporary API key`);
                return tempApiKey;
            }
            console.log(`[WikiSage] No temporary API key found, falling back to permanent tiddler`);
        }

        const permanentApiKey = $tw.wiki.getTiddlerText(apiKeyTiddler, "").trim();
        console.log(`[WikiSage] Permanent API key found: ${permanentApiKey ? "Yes" : "No"}`);
        return permanentApiKey;
    }

    // ==================== UI DELEGATION ====================

    createChatBox(conversationsContainer) {
        return chatUI.createChatBox.call(this, conversationsContainer);
    }

    createInstructionChatBox(parentContainer) {
        return chatUI.createInstructionChatBox(parentContainer);
    }

    createConversationElement(message) {
        return chatUI.createConversationElement(message);
    }

    clearChatHistory(conversationsContainer) {
        $tw.wiki.deleteTiddler(this.historyTiddler);
        conversationsContainer.innerHTML = '';
    }

    clearImageSelection() {
        const imageSelector = this.domNodes[0].querySelector(".image-selector");
        const imagePreview = this.domNodes[0].querySelector(".image-preview");
        if (imageSelector) { imageSelector.value = ""; }
        if (imagePreview) { imagePreview.style.display = "none"; imagePreview.innerHTML = ""; }
        this.currentImageData = null;
    }

    clearPDFSelection() {
        const pdfSelector = this.domNodes[0].querySelector(".pdf-upload-button");
        if (pdfSelector) { pdfSelector.style.backgroundColor = "#2a2a21"; pdfSelector.textContent = "📄"; }
        this.currentPDFData = null;
    }

    // ==================== API DELEGATION ====================

    async fetchChatGPTResponse(apiKey, message, conversationElement, temperature, top_p, outputFormat) {
        return this.apiHandler.fetchChatGPTResponse(apiKey, message, conversationElement, temperature, top_p, outputFormat);
    }

    // ==================== MEDIA DELEGATION ====================

    async transcribeAudio(audioData, options) {
        return this.mediaHandler.transcribeAudio(audioData, options);
    }

    async convertTextToSpeech(text, voice) {
        return this.mediaHandler.convertTextToSpeech(text, voice);
    }

    async scrapeWebPage(url) {
        return this.mediaHandler.scrapeWebPage(url);
    }

    async handlePDF(pdfData) {
        return this.mediaHandler.handlePDF(pdfData);
    }

    async fileToBase64(file) {
        return this.mediaHandler.fileToBase64(file);
    }

    // ==================== TIDDLER OPERATION DELEGATION ====================

    getAllTiddlerTitles() {
        return this.tiddlerOps.getAllTiddlerTitles();
    }

    searchTiddlerContent(query, excludeTags) {
        return this.tiddlerOps.searchTiddlerContent(query, excludeTags);
    }

    searchTiddlersByTag(tag) {
        return this.tiddlerOps.searchTiddlersByTag(tag);
    }

    searchTiddlersByField(fieldName, fieldValue) {
        return this.tiddlerOps.searchTiddlersByField(fieldName, fieldValue);
    }

    getTiddlerContent(title) {
        return this.tiddlerOps.getTiddlerContent(title);
    }

    getTiddlerFields(title) {
        return this.tiddlerOps.getTiddlerFields(title);
    }

    openTiddler(title) {
        return this.tiddlerOps.openTiddler(title);
    }

    closeTiddler(title) {
        return this.tiddlerOps.closeTiddler(title);
    }

    exportTiddlers(exportFilter, baseFilename, format) {
        return this.tiddlerOps.exportTiddlers(exportFilter, baseFilename, format);
    }

    addSystemReference(note) {
        return this.tiddlerOps.addSystemReference(note);
    }

    getSystemReference() {
        return this.tiddlerOps.getSystemReference();
    }

    reviseSystemReference(noteId, revisedNote) {
        return this.tiddlerOps.reviseSystemReference(noteId, revisedNote);
    }

    // ==================== RENDERING HELPERS ====================

    renderMarkdownWithLineBreaks(text, format) {
        return renderMarkdownWithLineBreaks(text, format);
    }

    basicMarkdownToHtml(text) {
        return basicMarkdownToHtml(text);
    }

    getApiType(model) {
        return getApiType(model);
    }

    formatToolResult(toolName, result) {
        try {
            const formattedResult = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            return `Tool ${toolName} returned: ${formattedResult}`;
        } catch (error) {
            return `Error formatting tool result: ${error.message}`;
        }
    }

    // ==================== ACTION MANAGEMENT ====================

    recordAction(action, params, previousState) {
        if (!this.actionHistory) { this.actionHistory = []; }
        const actionRecord = {
            timestamp: Date.now(),
            queryTimestamp: this.queryStartTime,
            action: action,
            params: { ...params },
            previousState: previousState
        };
        this.actionHistory.push(actionRecord);
        if (this.actionHistory.length > 50) { this.actionHistory.shift(); }
    }

    async executeAction(action, params) {
        try {
            const result = await this.serviceCoordinator.executeOperation(
                action, params, this.currentUserRequest, this.chatGPTOptions
            );
            if (result.success) {
                $tw.notifier.display("$:/core/ui/Notifications/save", {
                    message: result.result || `Action ${action} completed successfully`
                });
            } else {
                $tw.notifier.display("$:/core/ui/Notifications/error", {
                    message: result.error || `Action ${action} failed`
                });
            }
            return result;
        } catch (error) {
            console.error(`Error in widget executeAction:`, error);
            $tw.notifier.display("$:/core/ui/Notifications/error", { message: error.message });
            return { success: false, error: error.message };
        }
    }

    async verifyAction(action, params) {
        try {
            let result;
            switch (action) {
                case 'openTiddler':
                    $tw.wiki.addToStory(params.title);
                    result = `Opened tiddler "${params.title}"`;
                    break;
                case 'closeTiddler':
                    const storyTiddler = "$:/StoryList";
                    const storyList = $tw.wiki.getTiddlerList(storyTiddler);
                    const newStoryList = storyList.filter(item => item !== params.title);
                    $tw.wiki.setText(storyTiddler, "list", null, newStoryList);
                    result = `Closed tiddler "${params.title}"`;
                    break;
                default:
                    throw new Error(`Unknown action type: ${action}`);
            }
            if (['createTiddler', 'modifyTiddler'].includes(action)) {
                this.recordAction(action, params, this.getTiddlerState(params.title));
            }
            return { success: true, result: result };
        } catch (error) {
            console.error(`Error in verifyAction: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // ==================== TOOL DISPATCH ====================

    async executeToolCall(functionName, args) {
        console.log(`Executing tool: ${functionName}`, args);
        try {
            switch (functionName) {
                case "getAllTiddlerTitles":
                    return this.getAllTiddlerTitles().join(", ");

                case "searchTiddlerContent":
                    return JSON.stringify(this.searchTiddlerContent(args.query, args.excludeTags), null, 2);

                case "getTiddlerContent":
                    return this.getTiddlerContent(args.title);

                case "searchTiddlersByTag":
                    return JSON.stringify(this.searchTiddlersByTag(args.tag), null, 2);

                case "scrapeWebPage":
                    return await this.scrapeWebPage(args.url);

                case "addSystemReference":
                    return `Note added successfully. Note ID: ${this.addSystemReference(args.note)}`;

                case "getSystemReference":
                    return this.getSystemReference();

                case "reviseSystemReference":
                    await this.reviseSystemReference(args.noteId, args.revisedNote);
                    return "Note revised successfully.";

                case "createTiddler":
                    return await this.executeAction("createTiddler", args);

                case "renameTiddler":
                    return await this.executeAction("renameTiddler", args);

                case "openTiddler":
                    return await this.verifyAction("openTiddler", args);

                case "closeTiddler":
                    return await this.verifyAction("closeTiddler", args);

                case "modifyTiddler":
                    return await this.executeAction("modifyTiddler", args);

                case "getTiddlerFields":
                    return this.getTiddlerFields(args.title);

                case "searchTiddlersByField":
                    return JSON.stringify(this.searchTiddlersByField(args.fieldName, args.fieldValue), null, 2);

                case "exportTiddlers":
                    try {
                        const { exportFilter, baseFilename = "tiddlers", format = "JSON" } = args;
                        return this.exportTiddlers(exportFilter, baseFilename, format);
                    } catch (error) {
                        throw error;
                    }

                case "generateImage":
                    try {
                        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
                        if (!apiKey) throw new Error("OpenAI API key not found");
                        const response = await fetch("https://api.openai.com/v1/images/generations", {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                            body: JSON.stringify({
                                model: "dall-e-3", prompt: args.prompt,
                                n: 1, size: args.size || "1024x1024", response_format: "url"
                            })
                        });
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error?.message || "Image generation failed");
                        }
                        const data = await response.json();
                        return `[img[${data.data[0].url}]]`;
                    } catch (error) {
                        throw new Error(`Image generation failed: ${error.message}`);
                    }

                case "undoActions":
                    try {
                        const count = args.count || 1;
                        const result = await this.undoMultipleActions(count);
                        return result.message || (result.success ? "Undo successful" : "Undo failed");
                    } catch (error) {
                        return `Undo failed: ${error.message}`;
                    }

                default:
                    throw new Error(`Unknown function: ${functionName}`);
            }
        } catch (error) {
            console.error(`Error executing tool ${functionName}:`, error);
            throw error;
        }
    }

    // ==================== UNDO ====================

    async undoMultipleActions(count) {
        count = count || 1;
        try {
            const results = await this.serviceCoordinator.undoMultipleActions(count);
            if (results.every(r => r.success)) {
                return { success: true, message: `Successfully undid ${count} action(s)` };
            } else {
                const failedCount = results.filter(r => !r.success).length;
                return { success: false, message: `Failed to undo ${failedCount} of ${count} actions` };
            }
        } catch (error) {
            console.error('Error in undoMultipleActions:', error);
            return { success: false, error: error.message };
        }
    }

    async undoSingleAction(action) {
        try {
            switch (action.action) {
                case 'createTiddler':
                    if (!$tw.wiki.tiddlerExists(action.params.title)) {
                        return { success: false, error: `Tiddler "${action.params.title}" no longer exists` };
                    }
                    $tw.wiki.deleteTiddler(action.params.title);
                    return { success: true, message: `Undid creation of "${action.params.title}"` };

                case 'modifyTiddler':
                    if (!action.previousState) {
                        return { success: false, error: "No previous state available" };
                    }
                    $tw.wiki.addTiddler(new $tw.Tiddler(action.previousState.fields, { title: action.params.title }));
                    return { success: true, message: `Restored previous state of "${action.params.title}"` };

                case 'renameTiddler':
                    if (!$tw.wiki.tiddlerExists(action.params.newTitle)) {
                        return { success: false, error: `Renamed tiddler "${action.params.newTitle}" no longer exists` };
                    }
                    const tiddler = $tw.wiki.getTiddler(action.params.newTitle);
                    $tw.wiki.addTiddler(new $tw.Tiddler(tiddler, { title: action.params.oldTitle }));
                    $tw.wiki.deleteTiddler(action.params.newTitle);
                    return { success: true, message: `Undid rename from "${action.params.oldTitle}" to "${action.params.newTitle}"` };

                default:
                    return { success: false, error: `Unknown action type: ${action.action}` };
            }
        } catch (error) {
            console.error(`Error in undoSingleAction:`, error);
            return { success: false, error: `Failed to undo action: ${error.message}` };
        }
    }

    // ==================== STATE MANAGEMENT ====================

    getTiddlerState(title) {
        const tiddler = $tw.wiki.getTiddler(title);
        if (!tiddler) return null;
        return { fields: { ...tiddler.fields } };
    }

    async compareStates(initialState, action, params) {
        const currentState = await this.captureInitialState(action, params);
        const changes = { modified: [], added: [], removed: [] };
        for (const [title, state] of Object.entries(initialState.tiddlers)) {
            if (!currentState.tiddlers[title]) { changes.removed.push(title); }
            else if (this.hasStateChanged(state, currentState.tiddlers[title])) { changes.modified.push(title); }
        }
        for (const title of Object.keys(currentState.tiddlers)) {
            if (!initialState.tiddlers[title]) { changes.added.push(title); }
        }
        return { success: this.validateStateChanges(changes, action, params), changes: changes };
    }

    async rollbackAction(action, params, previousState) {
        if (!previousState) {
            console.error("No previous state available for rollback");
            return false;
        }
        const rollbackContext = { timestamp: Date.now(), action, params, previousState, attempts: [] };
        try {
            for (const [title, state] of Object.entries(previousState.tiddlers)) {
                const restoreResult = await this.restoreTiddlerState(title, state);
                rollbackContext.attempts.push({ title, success: restoreResult.success, error: restoreResult.error });
                if (!restoreResult.success) { throw new Error(`Failed to restore state for ${title}`); }
            }
            const finalState = await this.captureState(action);
            const stateVerification = this.verifyRestoredState(previousState, finalState);
            if (!stateVerification.success) { throw new Error(`State verification failed after rollback: ${stateVerification.error}`); }
            return { success: true, context: rollbackContext, verification: stateVerification };
        } catch (error) {
            console.error(`Rollback failed for ${action}:`, error);
            return { success: false, error: error.message, context: rollbackContext };
        }
    }

    // ==================== DEPENDENCY MANAGEMENT ====================

    async findDependencies(title) {
        const dependencies = new Set();
        const tiddler = $tw.wiki.getTiddler(title);
        if (tiddler) {
            (tiddler.fields.tags || []).forEach(tag => dependencies.add(tag));
            const links = $tw.wiki.getTiddlerLinks(title);
            links.forEach(link => dependencies.add(link));
            const backlinks = $tw.wiki.getTiddlerBacklinks(title);
            backlinks.forEach(backlink => dependencies.add(backlink));
        }
        return Array.from(dependencies);
    }

    identifyDependencies(action) {
        const dependencies = new Set();
        if (action.dependsOn) { dependencies.add(action.dependsOn); }
        switch (action) {
            case 'modifyTiddler':
                const linkedTiddlers = this.findLinkedTiddlers(action.params.title);
                linkedTiddlers.forEach(title => dependencies.add(title));
                break;
            case 'renameTiddler':
                const referencingTiddlers = this.findReferencingTiddlers(action.params.oldTitle);
                referencingTiddlers.forEach(title => dependencies.add(title));
                break;
        }
        return Array.from(dependencies);
    }

    async updateDependencies(action, params, dependencies) {
        for (const dependency of dependencies) {
            const tiddler = $tw.wiki.getTiddler(dependency);
            if (tiddler) { await this.updateReferences(dependency, action, params); }
        }
    }

    async updateReferences(tiddlerTitle, action, params) {
        const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
        if (!tiddler) return;
        let text = tiddler.fields.text || "";
        let modified = false;
        if (action === 'renameTiddler') {
            const oldTitle = params.oldTitle;
            const newTitle = params.newTitle;
            const linkRegex = new RegExp(`\\[\\[${oldTitle}\\]\\]`, 'g');
            if (text.match(linkRegex)) {
                text = text.replace(linkRegex, `[[${newTitle}]]`);
                modified = true;
            }
        }
        if (modified) {
            $tw.wiki.addTiddler(new $tw.Tiddler(tiddler, { text: text }));
        }
    }
}

exports["WikiSage"] = ChatGPTWidget;


