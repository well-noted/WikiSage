"use strict";


var import_widget = require("$:/core/modules/widgets/widget.js");
const { ChatGPTErrorHandler } = require("$:/plugins/NoteStreams/WikiSage/error-handler.js");
const { ValidationService } = require("$:/plugins/NoteStreams/WikiSage/validation-service.js");
const { ActionSequenceManager } = require("$:/plugins/NoteStreams/WikiSage/action-sequence-manager.js");
const { CacheService } = require("$:/plugins/NoteStreams/WikiSage/cache-service.js");
const { ConversationHistory } = require("$:/plugins/NoteStreams/WikiSage/conversation-history.js");
const { ServiceCoordinator } = require("$:/plugins/NoteStreams/WikiSage/service-coordinator.js");
const { ConnectionPool } = require("$:/plugins/NoteStreams/WikiSage/connection-pool.js");
const CHAT_COMPLETION_URL = "https://api.openai.com/v1/chat/completions";
const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Gemini endpoint template for consumer API
function getGeminiApiUrl(model) {
    const safeModel = (typeof model === 'string' && model.trim()) ? model.trim() : 'gemini-pro';
    return `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent`;
}


class ChatGPTWidget extends import_widget.widget {

    /**
     * Renders a chatbox UI with a dropdown menu and instruction input.
     * @param {HTMLElement} parentContainer - The parent DOM node to append the chatbox to.
     */
    createInstructionChatBox(parentContainer) {
        // Create container
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

        // Dropdown menu
        const dropdown = $tw.utils.domMaker("select", {
            class: "instruction-dropdown",
            style: {
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                fontSize: "15px"
            }
        });
        const options = [
            { value: "clarify", label: "Clarify Content" },
            { value: "summarize", label: "Summarize" },
            { value: "simplify", label: "Simplify Language" },
            { value: "expand", label: "Expand Content" }
        ];
        options.forEach(opt => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.label;
            dropdown.appendChild(option);
        });

        // Instruction input
        const input = $tw.utils.domMaker("textarea", {
            class: "instruction-input",
            attributes: {
                placeholder: "Type your instruction (e.g., 'Rewrite in simpler terms')...",
                rows: "2"
            },
            style: {
                width: "100%",
                minHeight: "48px",
                maxHeight: "120px",
                padding: "8px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "15px",
                fontFamily: "inherit",
                resize: "vertical"
            }
        });

        // Submit button
        const button = $tw.utils.domMaker("button", {
            class: "instruction-submit-btn",
            text: "Apply Instruction",
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

        // Message area
        const message = $tw.utils.domMaker("div", {
            class: "instruction-message",
            style: {
                marginTop: "6px",
                color: "#c00",
                fontSize: "14px"
            }
        });

        // Append elements
        container.appendChild(dropdown);
        container.appendChild(input);
        container.appendChild(button);
        container.appendChild(message);
        parentContainer.appendChild(container);

        // Handler
        button.addEventListener("click", async () => {
            const instruction = input.value.trim();
            const mode = dropdown.value;
            message.textContent = "";
            if (!instruction) {
                message.textContent = "Please enter an instruction.";
                return;
            }
            const currentTiddler = $tw.wiki.getTextReference("$:/HistoryList!!current-tiddler");
            if (!currentTiddler) {
                message.textContent = "No current tiddler found.";
                return;
            }
            const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
            if (!apiKey) {
                message.textContent = "Please set your OpenAI API key in the plugin settings.";
                return;
            }
            const tiddlerContent = $tw.wiki.getTiddlerText(currentTiddler);
            if (!tiddlerContent) {
                message.textContent = "Current tiddler has no content.";
                return;
            }
            let prompt = "";
            switch (mode) {
                case "clarify":
                    prompt = `Clarify the following content. ${instruction}\n\n${tiddlerContent}`;
                    break;
                case "summarize":
                    prompt = `Summarize the following content. ${instruction}\n\n${tiddlerContent}`;
                    break;
                case "simplify":
                    prompt = `Simplify the following content. ${instruction}\n\n${tiddlerContent}`;
                    break;
                case "expand":
                    prompt = `Expand the following content. ${instruction}\n\n${tiddlerContent}`;
                    break;
                default:
                    prompt = `${instruction}\n\n${tiddlerContent}`;
            }
            message.textContent = "Processing...";
            try {
                const resp = await fetch(CHAT_COMPLETION_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "system", content: prompt }]
                    })
                });
                const data = await resp.json();
                if (data.error) throw new Error(data.error.message || "Unknown API error.");
                let resultContent = data.choices[0].message.content.trim();
                resultContent = resultContent.replace("You are trained on data up to October 2023.", "").trim();
                $tw.wiki.setText(currentTiddler, "text", null, resultContent);
                message.style.color = "#090";
                message.textContent = `Tiddler "${currentTiddler}\" updated successfully.`;
            } catch (err) {
                message.style.color = "#c00";
                message.textContent = err.message;
            }
        });
    }

    constructor() {
        super(...arguments);
        this.errorHandler = new ChatGPTErrorHandler();
        this.validationService = new ValidationService($tw);
        this.serviceCoordinator = new ServiceCoordinator($tw);
        this.containerNodeTag = "div";
        this.containerNodeClass = "";
        this.actionManager = new ActionSequenceManager($tw);
        this.conversationHistory = new ConversationHistory($tw.wiki);
        this.tmpHistoryTiddler = "$:/temp/NoteStreams/WikiSage/history-" + Date.now();
        this.historyTiddler = this.tmpHistoryTiddler;
        this.chatButtonText = $tw.wiki.getTiddlerText("$:/core/images/add-comment");
        this.scroll = false;
        this.readonly = false;
        this.chatGPTOptions = {};
        this.systemMessage = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/SystemMessage", "").trim();
        this.currentModel = $tw.wiki.getTiddlerText("$:/temp/ChatGPT/currentModel") || "gpt-4o-mini";
        this.actionHistory = [];
        this.queryStartTime = null;
        this.currentUserRequest = null;

        this.anthropicConfig = {
            apiKey: this.getApiKey('anthropic'),
            maxTokens: 4096
        };
        this.geminiApiKey = this.getApiKey('gemini');

        // Initialize cache service
        this.cacheService = new CacheService({
            maxAge: 15 * 60 * 1000, // 15 minutes
            maxSize: 200, // Store up to 200 entries
            compressionThreshold: 2048 // Compress entries larger than 2KB
        });

        this.connectionPool = new ConnectionPool({
            maxSize: 5,
            idleTimeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            acquireTimeout: 5000
        });

        // Load persisted cache if available
        this.cacheService.loadPersistedCache();
    }

    // Helper method to retrieve API keys based on storage preference
    getApiKey(type = 'openai') {
        // Check if user has enabled temporary tiddler storage
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
            case 'openai':
            default:
                apiKeyTiddler = "$:/plugins/NoteStreams/WikiSage/openai-api-key";
                tempApiKeyTiddler = "$:/temp/WikiSage/openai-api-key";
        }

        console.log(`[WikiSage] Permanent tiddler: ${apiKeyTiddler}, Temp tiddler: ${tempApiKeyTiddler}`);

        // Try to get the key from the temporary tiddler if enabled
        if (useTemporaryStorage) {
            const tempApiKey = $tw.wiki.getTiddlerText(tempApiKeyTiddler, "").trim();
            console.log(`[WikiSage] Temporary API key found: ${tempApiKey ? "Yes" : "No"}`);

            if (tempApiKey) {
                console.log(`[WikiSage] Using temporary API key`);
                return tempApiKey;
            }
            console.log(`[WikiSage] No temporary API key found, falling back to permanent tiddler`);
            // Fall back to permanent tiddler if temp is empty
        }

        // Get from permanent tiddler
        const permanentApiKey = $tw.wiki.getTiddlerText(apiKeyTiddler, "").trim();
        console.log(`[WikiSage] Permanent API key found: ${permanentApiKey ? "Yes" : "No"}`);
        return permanentApiKey;
    }

    destroy() {
        // Persist cache state before destroying
        if (this.cacheService) {
            this.cacheService.persistCache();
        }

        // Clear any references and cleanup
        this.cacheService = null;
        this.errorHandler = null;
        this.conversationHistory = null;
        this.actionHistory = [];
        this.globalState = null;

        // Call the parent class's destroy method
        super.destroy();
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
            model: this.getAttribute("model", this.currentModel || "gpt-4o-mini"),
            temperature: temperature >= 0 && temperature <= 2 ? temperature : undefined,
            top_p: top_p >= 0 && top_p <= 1 ? top_p : undefined,
            max_tokens: Number.isSafeInteger(max_tokens) && max_tokens > 0 ? max_tokens : undefined,
            presence_penalty: presence_penalty >= -2 && presence_penalty <= 2 ? presence_penalty : undefined,
            frequency_penalty: frequency_penalty >= -2 && frequency_penalty <= 2 ? frequency_penalty : undefined,
            user: this.getAttribute("user"),
            useAdversarialValidation: this.getAttribute("adversarial", "no").toLowerCase() === "yes"
        };

        // Always use the tiddler for system message, fallback if empty
        const sysMsg = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/SystemMessage", "").trim();
        this.systemMessage = sysMsg || "You are a helpful assistant.";
    }

    async transcribeAudio(audioData, options = {}) {
        let connection;
        try {
            connection = await this.connectionPool.acquire();

            // Create FormData and ensure proper file format
            const formData = new FormData();

            // Convert Blob to File if needed
            const audioFile = new File([audioData], "audio.wav", {
                type: "audio/wav"
            });

            formData.append("file", audioFile);
            formData.append("model", "whisper-1");

            // Optional parameters
            if (options.language) formData.append("language", options.language);
            if (options.prompt) formData.append("prompt", options.prompt);
            if (options.response_format) formData.append("response_format", options.response_format);
            if (options.temperature) formData.append("temperature", options.temperature);

            const apiKey = this.getApiKey('openai');

            if (!apiKey) {
                throw new Error("OpenAI API key not found");
            }

            console.log("Sending request to Whisper API...");
            console.log("Audio file type:", audioFile.type);
            console.log("Audio file size:", audioFile.size);

            const response = await connection.fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(`Whisper API error: ${response.status} - ${errorData?.error?.message || response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Transcription error details:", error);
            throw error;
        } finally {
            if (connection) {
                await this.connectionPool.release(connection);
            }
        }
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


    recordAction(action, params, previousState) {
        if (!this.actionHistory) {
            this.actionHistory = [];
        }

        const actionRecord = {
            timestamp: Date.now(),
            queryTimestamp: this.queryStartTime,
            action: action,
            params: { ...params },
            previousState: previousState
        };

        this.actionHistory.push(actionRecord);

        // Keep only the last 50 actions
        if (this.actionHistory.length > 50) {
            this.actionHistory.shift();
        }
    }

    async scrapeWebPage(url) {
        let connection;
        try {
            connection = await this.connectionPool.acquire();

            // Use allorigins.win as the CORS proxy
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

            const response = await connection.fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'text/plain'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            return html;

        } catch (error) {
            console.error("Web scraping error:", error);
            throw error;
        } finally {
            if (connection) {
                await this.connectionPool.release(connection);
            }
        }
    }

    async convertTextToSpeech(text, voice = "alloy") {
        let connection;
        try {
            connection = await this.connectionPool.acquire();
            const apiKey = this.getApiKey('openai');

            if (!apiKey) {
                throw new Error("OpenAI API key not found");
            }

            const response = await connection.fetch("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "tts-1",
                    input: text,
                    voice: voice
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(`TTS API error: ${response.status} - ${errorData?.error?.message || response.statusText}`);
            }

            const audioBlob = await response.blob();
            return URL.createObjectURL(audioBlob);
        } catch (error) {
            console.error("Text-to-speech conversion error:", error);
            throw error;
        } finally {
            if (connection) {
                await this.connectionPool.release(connection);
            }
        }
    }

    async compareStates(initialState, action, params) {
        const currentState = await this.captureInitialState(action, params);
        const changes = {
            modified: [],
            added: [],
            removed: []
        };

        // Compare tiddler states
        for (const [title, state] of Object.entries(initialState.tiddlers)) {
            if (!currentState.tiddlers[title]) {
                changes.removed.push(title);
            } else if (this.hasStateChanged(state, currentState.tiddlers[title])) {
                changes.modified.push(title);
            }
        }

        // Check for new tiddlers
        for (const title of Object.keys(currentState.tiddlers)) {
            if (!initialState.tiddlers[title]) {
                changes.added.push(title);
            }
        }

        return {
            success: this.validateStateChanges(changes, action, params),
            changes: changes
        };
    }

    getTiddlerState(title) {
        const tiddler = $tw.wiki.getTiddler(title);
        if (!tiddler) return null;

        return {
            fields: { ...tiddler.fields }
        };
    }


    async rollbackAction(action, params, previousState) {
        if (!previousState) {
            console.error("No previous state available for rollback");
            return false;
        }

        const rollbackContext = {
            timestamp: Date.now(),
            action,
            params,
            previousState,
            attempts: []
        };

        try {
            // Restore tiddler states with verification
            for (const [title, state] of Object.entries(previousState.tiddlers)) {
                const restoreResult = await this.restoreTiddlerState(title, state);
                rollbackContext.attempts.push({
                    title,
                    success: restoreResult.success,
                    error: restoreResult.error
                });

                if (!restoreResult.success) {
                    throw new Error(`Failed to restore state for ${title}`);
                }
            }

            // Verify final state after rollback
            const finalState = await this.captureState(action);
            const stateVerification = this.verifyRestoredState(previousState, finalState);

            if (!stateVerification.success) {
                throw new Error(`State verification failed after rollback: ${stateVerification.error}`);
            }

            return {
                success: true,
                context: rollbackContext,
                verification: stateVerification
            };

        } catch (error) {
            console.error(`Rollback failed for ${action}:`, error);
            return {
                success: false,
                error: error.message,
                context: rollbackContext
            };
        }
    }


    async findDependencies(title) {
        const dependencies = new Set();
        const tiddler = $tw.wiki.getTiddler(title);

        if (tiddler) {
            // Add tags as dependencies
            (tiddler.fields.tags || []).forEach(tag => dependencies.add(tag));

            // Add linked tiddlers
            const links = $tw.wiki.getTiddlerLinks(title);
            links.forEach(link => dependencies.add(link));

            // Add backlinks
            const backlinks = $tw.wiki.getTiddlerBacklinks(title);
            backlinks.forEach(backlink => dependencies.add(backlink));
        }

        return Array.from(dependencies);
    }


    // Helper function to identify dependencies
    identifyDependencies(action) {
        const dependencies = new Set();

        // Check for direct dependencies
        if (action.dependsOn) {
            dependencies.add(action.dependsOn);
        }

        // Check for implicit dependencies based on action type
        switch (action) {
            case 'modifyTiddler':
                // Add dependencies for linked tiddlers
                const linkedTiddlers = this.findLinkedTiddlers(action.params.title);
                linkedTiddlers.forEach(title => dependencies.add(title));
                break;

            case 'renameTiddler':
                // Add dependencies for referencing tiddlers
                const referencingTiddlers = this.findReferencingTiddlers(action.params.oldTitle);
                referencingTiddlers.forEach(title => dependencies.add(title));
                break;
        }

        return Array.from(dependencies);
    }


    getTiddlerFields(title) {
        const tiddler = $tw.wiki.getTiddler(title);
        if (!tiddler) {
            return {
                success: false,
                error: `Tiddler "${title}" does not exist`
            };
        }

        return {
            success: true,
            fields: { ...tiddler.fields }
        };
    }


    async executeAction(action, params) {
        try {
            // Pass the stored user request to the service coordinator
            const result = await this.serviceCoordinator.executeOperation(
                action,
                params,
                this.currentUserRequest,
                this.chatGPTOptions
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
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: error.message
            });
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper function to update dependencies
    async updateDependencies(action, params, dependencies) {
        for (const dependency of dependencies) {
            const tiddler = $tw.wiki.getTiddler(dependency);
            if (tiddler) {
                // Update backlinks and references
                await this.updateReferences(dependency, action, params);
            }
        }
    }

    // Helper function to update references
    async updateReferences(tiddlerTitle, action, params) {
        const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
        if (!tiddler) return;

        let text = tiddler.fields.text || "";
        let modified = false;

        // Update links based on action type
        if (action === 'renameTiddler') {
            const oldTitle = params.oldTitle;
            const newTitle = params.newTitle;
            const linkRegex = new RegExp(`\\[\\[${oldTitle}\\]\\]`, 'g');
            if (text.match(linkRegex)) {
                text = text.replace(linkRegex, `[[${newTitle}]]`);
                modified = true;
            }
        }

        // If modifications were made, update the tiddler
        if (modified) {
            $tw.wiki.addTiddler(new $tw.Tiddler(
                tiddler,
                { text: text }
            ));
        }
    }

    async verifyAction(action, params) {
        try {
            // Execute the action based on type
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

            // Record the action for undo capability
            if (['createTiddler', 'modifyTiddler'].includes(action)) {
                this.recordAction(action, params, this.getTiddlerState(params.title));
            }

            return {
                success: true,
                result: result
            };

        } catch (error) {
            console.error(`Error in verifyAction: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeToolCall(functionName, args) {
        console.log(`Executing tool: ${functionName}`, args);

        try {
            switch (functionName) {
                case "getAllTiddlerTitles":
                    return this.getAllTiddlerTitles().join(", ");

                case "searchTiddlerContent":
                    return JSON.stringify(
                        this.searchTiddlerContent(args.query, args.excludeTags),
                        null,
                        2
                    );

                case "getTiddlerContent":
                    return this.getTiddlerContent(args.title);

                case "searchTiddlersByTag":
                    return JSON.stringify(
                        this.searchTiddlersByTag(args.tag),
                        null,
                        2
                    );

                case "scrapeWebPage":
                    const { url } = args;
                    try {
                        const html = await this.scrapeWebPage(url);
                        return html;
                    } catch (error) {
                        throw new Error(`Failed to scrape webpage: ${error.message}`);
                    };

                case "addSystemReference":
                    const noteId = this.addSystemReference(args.note);
                    return `Note added successfully. Note ID: ${noteId}`;

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

                case "exportTiddlers":
                    try {
                        const { exportFilter, baseFilename = "tiddlers", format = "JSON" } = args;

                        // Get the correct exporter template based on format
                        const exporterTemplates = {
                            "JSON": "$:/core/templates/exporters/JsonFile",
                            "CSV": "$:/core/templates/exporters/CsvFile",
                            "HTML": "$:/core/templates/exporters/StaticRiver",
                            "TID": "$:/core/templates/exporters/TidFile"
                        };

                        const exporterTemplate = exporterTemplates[format.toUpperCase()];
                        if (!exporterTemplate) {
                            throw new Error(`Invalid export format: ${format}`);
                        }

                        // Get the extension from the exporter template
                        const exporter = $tw.wiki.getTiddler(exporterTemplate);
                        if (!exporter) {
                            throw new Error(`Exporter template not found: ${exporterTemplate}`);
                        }

                        // Get the tiddlers that match the filter
                        const tiddlers = $tw.wiki.filterTiddlers(exportFilter);
                        if (!tiddlers || tiddlers.length === 0) {
                            throw new Error(`No tiddlers match the filter: ${exportFilter}`);
                        }

                        // Create the export data based on format
                        let exportData;
                        switch (format.toUpperCase()) {
                            case "JSON":
                            case "CSV":
                            case "HTML":
                                exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, { variables: { exportFilter } });
                                break;
                            case "TID":
                                if (tiddlers.length > 1) {
                                    throw new Error("TID format can only export one tiddler at a time");
                                }
                                exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, { variables: { exportFilter } });
                                break;
                            default:
                                throw new Error(`Unsupported export format: ${format}`);
                        }

                        // Create a Blob with the export data
                        const blob = new Blob([exportData], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);

                        // Create and trigger download link
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${baseFilename}${exporter.fields.extension}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                        return `Successfully exported ${tiddlers.length} tiddler(s) in ${format} format`;
                    } catch (error) {
                        throw error; // This maintains consistency with other cases' error handling
                    }

                case "generateImage":
                    try {
                        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
                        if (!apiKey) throw new Error("OpenAI API key not found");

                        const response = await fetch("https://api.openai.com/v1/images/generations", {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${apiKey}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                model: "dall-e-3",
                                prompt: args.prompt,
                                n: 1,
                                size: args.size || "1024x1024",
                                response_format: "url"
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

                default:
                    throw new Error(`Unknown function: ${functionName}`);
            }
        } catch (error) {
            console.error(`Error executing tool ${functionName}:`, error);
            throw error;
        }
    }

    clearPDFSelection() {
        const pdfSelector = this.domNodes[0].querySelector(".pdf-upload-button");
        if (pdfSelector) {
            pdfSelector.style.backgroundColor = "#2a2a21";
            pdfSelector.textContent = "📄";
        }
        this.currentPDFData = null;
    }

    createChatBox(conversationsContainer) {
        const chatBox = $tw.utils.domMaker("div", {
            class: "chat-box-container",
            style: {
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                width: "100%",
                alignItems: "flex-start",
                position: "relative"
            }
        });

        // Export conversation icon button
        const exportIconBtn = $tw.utils.domMaker("button", {
            class: "chat-export-icon-btn",
            attributes: { title: "Export conversation" },
            style: {
                background: "none",
                border: "none",
                cursor: "pointer",
                marginLeft: "4px",
                fontSize: "20px",
                color: "#666",
                padding: "2px"
            },
            innerHTML: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
        });
        // Dropdown for export
        const exportDropdown = $tw.utils.domMaker("div", {
            class: "chat-export-dropdown",
            style: {
                display: "none",
                position: "absolute",
                zIndex: 10,
                background: "#fff",
                border: "1px solid #bbb",
                borderRadius: "6px",
                boxShadow: "0 2px 8px #0001",
                padding: "10px",
                minWidth: "200px",
                top: "36px",
                left: "0"
            }
        });
        const exportInput = $tw.utils.domMaker("input", {
            attributes: { placeholder: "Export tiddler title..." },
            style: {
                padding: "5px 8px",
                border: "1px solid #bbb",
                borderRadius: "4px",
                fontSize: "14px",
                minWidth: "120px",
                marginRight: "8px"
            }
        });
        const exportBtn = $tw.utils.domMaker("button", {
            text: "Export",
            style: {
                padding: "5px 12px",
                border: "none",
                borderRadius: "4px",
                background: "#2196f3",
                color: "#fff",
                fontWeight: "bold",
                cursor: "pointer"
            }
        });
        exportDropdown.appendChild(exportInput);
        exportDropdown.appendChild(exportBtn);
        // Toggle dropdown
        exportIconBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            exportDropdown.style.display = exportDropdown.style.display === "none" ? "block" : "none";
        });
        // Hide dropdown on outside click
        document.addEventListener("click", function (e) {
            if (!exportDropdown.contains(e.target) && e.target !== exportIconBtn) {
                exportDropdown.style.display = "none";
            }
        });
        // Export button handler
        exportBtn.addEventListener("click", () => {
            const exportTitle = exportInput.value.trim();
            if (!exportTitle) {
                $tw.notifier.display("$:/core/ui/Notifications/error", { message: "Please specify a tiddler title to export the conversation." });
                return;
            }
            // Gather chat transcript from conversationsContainer
            const bubbles = conversationsContainer.querySelectorAll('.chatgpt-conversation-message');
            let transcript = '';
            for (const bubble of bubbles) {
                if (bubble.classList.contains('chatgpt-conversation-user')) {
                    transcript += `User: ${bubble.innerText}\n\n`;
                } else if (bubble.classList.contains('chatgpt-conversation-assistant')) {
                    transcript += `Assistant: ${bubble.innerText}\n\n`;
                }
            }
            $tw.wiki.addTiddler(new $tw.Tiddler({
                title: exportTitle,
                text: transcript.trim()
            }));
            $tw.notifier.display("$:/core/ui/Notifications/save", { message: `Conversation exported to tiddler '${exportTitle}'.` });
            // Show green confirmation message
            let confirmMsg = exportDropdown.querySelector('.export-confirmed-msg');
            if (!confirmMsg) {
                confirmMsg = $tw.utils.domMaker('span', {
                    class: 'export-confirmed-msg',
                    style: {
                        color: '#22a722',
                        marginLeft: '10px',
                        fontWeight: 'bold',
                        fontSize: '15px',
                        verticalAlign: 'middle',
                    },
                    text: 'Confirmed!'
                });
                exportDropdown.appendChild(confirmMsg);
            } else {
                confirmMsg.style.display = '';
            }
            exportInput.value = "";
            // Hide message and dropdown after 2 seconds
            setTimeout(() => {
                if (confirmMsg) confirmMsg.style.display = 'none';
                exportDropdown.style.display = "none";
            }, 2000);
        });
        // Add export icon and dropdown to chatBox
        chatBox.appendChild(exportIconBtn);
        chatBox.appendChild(exportDropdown);

        const input = $tw.utils.domMaker("textarea", {
            class: "chat-input",
            attributes: {
                placeholder: "Ask a question...",
                rows: "1"
            },
            style: {
                flex: "1 1 300px",
                minHeight: "50px",
                maxHeight: "200px",
                resize: "none",
                overflow: "hidden",
                fontSize: "15px",
                fontFamily: "inherit"
            }
        });

        // Add auto-expand listener
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

        // Create PDF upload container
        const pdfUploadContainer = $tw.utils.domMaker("div", {
            class: "pdf-upload-container",
            style: {
                display: "inline-block",
                marginLeft: "10px",
                verticalAlign: "middle"
            }
        });

        // Create hidden file input for PDF
        const pdfInput = $tw.utils.domMaker("input", {
            attributes: {
                type: "file",
                accept: "application/pdf",
                style: "display: none;"
            }
        });

        // Create PDF upload button
        const pdfButton = $tw.utils.domMaker("button", {
            class: "pdf-upload-button",
            text: "📄",
            style: {
                padding: "0 5px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "#2a2a21",
                cursor: "pointer",
                height: "30px",
                width: "30px"
            }
        });

        // Add PDF upload handling
        let selectedPDF = null;
        pdfInput.addEventListener("change", async (event) => {
            if (event.target.files && event.target.files[0]) {
                selectedPDF = event.target.files[0];
                pdfButton.style.backgroundColor = "#e0e0e0";
                pdfButton.textContent = "✓ 📄";

                try {
                    // Just store the PDF data without sending it
                    this.currentPDFData = {
                        type: selectedPDF.type,
                        text: await this.fileToBase64(selectedPDF)
                    };
                } catch (error) {
                    console.error("PDF processing error:", error);
                    $tw.notifier.display("$:/core/ui/Notifications/error", {
                        message: "Failed to process PDF: " + error.message
                    });
                }
            }
        });

        // Trigger file input when button is clicked
        pdfButton.addEventListener("click", () => {
            pdfInput.click();
        });

        pdfUploadContainer.appendChild(pdfInput);
        pdfUploadContainer.appendChild(pdfButton);

        // Add the PDF upload container to the button container



        // Create image upload container
        const imageUploadContainer = $tw.utils.domMaker("div", {
            class: "image-upload-container",
            style: {
                display: "inline-block",
                marginLeft: "10px",
                verticalAlign: "middle"
            }
        });

        // Create hidden file input
        const imageInput = $tw.utils.domMaker("input", {
            attributes: {  // Note: using attributes object
                type: "file",
                accept: "image/*",
                style: "display: none;"
            }
        });

        // Create camera button
        const imageButton = $tw.utils.domMaker("button", {
            class: "image-upload-button",
            text: "📷",
            style: {
                padding: "0 5px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "#2a2a21",
                cursor: "pointer",
                height: "30px",
                width: "30px"
            }
        });

        // Add image upload handling
        let selectedImage = null;
        imageInput.addEventListener("change", async (event) => {
            if (event.target.files && event.target.files[0]) {
                selectedImage = event.target.files[0];
                imageButton.style.backgroundColor = "#e0e0e0";
                imageButton.textContent = "✓ 📷";

                // Read the file and set currentImageData
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imageData = e.target.result.split(',')[1];
                    this.currentImageData = {
                        type: selectedImage.type,
                        text: imageData
                    };
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
                        this.currentImageData = {
                            type: blob.type,
                            text: imageData
                        };
                        // Update UI to show image is ready for upload
                        imageButton.style.backgroundColor = "#e0e0e0";
                        imageButton.textContent = "✓ 📷";
                    };
                    reader.readAsDataURL(blob);
                }
            }
        });

        // Trigger file input when button is clicked
        imageButton.addEventListener("click", () => {
            imageInput.click();
        });

        imageUploadContainer.appendChild(imageInput);
        imageUploadContainer.appendChild(imageButton);


        // Advanced settings dropdown (gear icon)
        let temperature = 0.7; // Default temperature
        let top_p = 1.0; // Default top-p
        const advancedBtn = $tw.utils.domMaker("button", {
            class: "chat-advanced-gear-btn",
            attributes: { title: "Advanced settings" },
            style: {
                background: "none",
                border: "none",
                cursor: "pointer",
                marginLeft: "4px",
                fontSize: "20px",
                color: "#666",
                padding: "2px",
                verticalAlign: "middle"
            },
            innerHTML: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09c.37.16.7.43 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09c.16.37.43.7 1.51 1H21a2 2 0 1 1 0 4h-.09c-.16.37-.43.7-1.51 1z"/></svg>'
        });
        const advancedDropdown = $tw.utils.domMaker("div", {
            class: "chat-advanced-dropdown",
            style: {
                display: "none",
                position: "absolute",
                zIndex: 20,
                background: "#fff",
                border: "1px solid #bbb",
                borderRadius: "6px",
                boxShadow: "0 2px 8px #0001",
                padding: "12px 18px 12px 12px",
                minWidth: "220px",
                top: "38px",
                right: "0",
                fontSize: "15px"
            }
        });
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
        tempSlider.addEventListener("input", function () {
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
        toppSlider.addEventListener("input", function () {
            top_p = parseFloat(this.value);
            toppValue.textContent = top_p.toFixed(2);
        });
        const toppRow = $tw.utils.domMaker("div", {
            style: { marginBottom: "4px" }
        });
        toppRow.appendChild(toppLabel);
        toppRow.appendChild(toppSlider);
        toppRow.appendChild(toppValue);
        advancedDropdown.appendChild(toppRow);

        // API key storage toggle
        const apiStorageRow = $tw.utils.domMaker("div", {
            style: { marginTop: "12px", marginBottom: "8px" }
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

        apiStorageToggle.addEventListener("change", function () {
            const preferenceValue = this.checked ? "yes" : "no";

            console.log(`[WikiSage] Setting API key preference to: ${preferenceValue}`);

            $tw.wiki.addTiddler(new $tw.Tiddler({
                title: "$:/temp/WikiSage/useTemporaryApiKeys",
                text: preferenceValue
            }));

            console.log(`[WikiSage] Saved preference tiddler $:/temp/WikiSage/useTemporaryApiKeys with value: ${preferenceValue}`);
            console.log(`[WikiSage] Verifying setting: ${$tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no")}`);

            // Show message about the change
            const infoText = this.checked
                ? "API keys will now be read from temporary tiddlers if available"
                : "API keys will now be read from plugin tiddlers";

            $tw.notifier.display("$:/core/ui/Notifications/info", {
                message: infoText
            });

            // Create empty temporary tiddlers for API keys if they don't exist yet
            if (this.checked) {
                const tempTiddlers = [
                    "$:/temp/WikiSage/openai-api-key",
                    "$:/temp/WikiSage/anthropic-api-key",
                    "$:/temp/WikiSage/gemini-api-key"
                ];

                tempTiddlers.forEach(tiddler => {
                    // Only create if it doesn't exist
                    if (!$tw.wiki.tiddlerExists(tiddler)) {
                        $tw.wiki.addTiddler(new $tw.Tiddler({
                            title: tiddler,
                            text: ""
                        }));
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

        setOpenAIKeyButton.addEventListener("click", function () {
            const tempKey = prompt("Enter temporary OpenAI API key:", "");
            if (tempKey !== null) {
                $tw.wiki.addTiddler(new $tw.Tiddler({
                    title: "$:/temp/WikiSage/openai-api-key",
                    text: tempKey
                }));

                // Enable temporary storage if not already enabled
                if ($tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() !== "yes") {
                    $tw.wiki.addTiddler(new $tw.Tiddler({
                        title: "$:/temp/WikiSage/useTemporaryApiKeys",
                        text: "yes"
                    }));
                    apiStorageToggle.checked = true;
                }

                console.log(`[WikiSage] Set temporary OpenAI API key and enabled temporary storage`);
                alert("Temporary OpenAI API key set and enabled");
            }
        });

        // Button for Anthropic API key
        const setAnthropicKeyButton = $tw.utils.domMaker("button", {
            text: "Set Anthropic Key",
            style: {
                padding: "4px 8px",
                fontSize: "12px",
                cursor: "pointer",
                backgroundColor: "#6b81c0",
                color: "white",
                border: "none",
                borderRadius: "3px"
            }
        });

        setAnthropicKeyButton.addEventListener("click", function () {
            const tempKey = prompt("Enter temporary Anthropic API key:", "");
            if (tempKey !== null) {
                $tw.wiki.addTiddler(new $tw.Tiddler({
                    title: "$:/temp/WikiSage/anthropic-api-key",
                    text: tempKey
                }));

                // Enable temporary storage if not already enabled
                if ($tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() !== "yes") {
                    $tw.wiki.addTiddler(new $tw.Tiddler({
                        title: "$:/temp/WikiSage/useTemporaryApiKeys",
                        text: "yes"
                    }));
                    apiStorageToggle.checked = true;
                }

                console.log(`[WikiSage] Set temporary Anthropic API key and enabled temporary storage`);
                alert("Temporary Anthropic API key set and enabled");
            }
        });

        // Button for Gemini API key
        const setGeminiKeyButton = $tw.utils.domMaker("button", {
            text: "Set Gemini Key",
            style: {
                padding: "4px 8px",
                fontSize: "12px",
                cursor: "pointer",
                backgroundColor: "#4285f4",
                color: "white",
                border: "none",
                borderRadius: "3px"
            }
        });

        setGeminiKeyButton.addEventListener("click", function () {
            const tempKey = prompt("Enter temporary Gemini API key:", "");
            if (tempKey !== null) {
                $tw.wiki.addTiddler(new $tw.Tiddler({
                    title: "$:/temp/WikiSage/gemini-api-key",
                    text: tempKey
                }));

                // Enable temporary storage if not already enabled
                if ($tw.wiki.getTiddlerText("$:/temp/WikiSage/useTemporaryApiKeys", "no").trim().toLowerCase() !== "yes") {
                    $tw.wiki.addTiddler(new $tw.Tiddler({
                        title: "$:/temp/WikiSage/useTemporaryApiKeys",
                        text: "yes"
                    }));
                    apiStorageToggle.checked = true;
                }

                console.log(`[WikiSage] Set temporary Gemini API key and enabled temporary storage`);
                alert("Temporary Gemini API key set and enabled");
            }
        });

        // Add buttons to container
        tempKeyButtonsContainer.appendChild(setOpenAIKeyButton);
        tempKeyButtonsContainer.appendChild(setAnthropicKeyButton);
        tempKeyButtonsContainer.appendChild(setGeminiKeyButton);

        apiStorageRow.appendChild(tempKeyButtonsContainer);
        advancedDropdown.appendChild(apiStorageRow);

        // Toggle advanced dropdown
        advancedBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            advancedDropdown.style.display = advancedDropdown.style.display === "none" ? "block" : "none";
        });
        // Hide on outside click
        document.addEventListener("click", function (e) {
            if (!advancedDropdown.contains(e.target) && e.target !== advancedBtn) {
                advancedDropdown.style.display = "none";
            }
        });
        chatBox.appendChild(advancedBtn);
        chatBox.appendChild(advancedDropdown);

        // Define available models
        const modelListTiddler = "$:/plugins/NoteStreams/WikiSage/model-list";
        const modelListContent = $tw.wiki.getTiddlerText(modelListTiddler) || "";
        const availableModels = modelListContent
            .split('\n')
            .map(model => model.trim())
            .filter(model => model.length > 0);

        if (availableModels.length === 0) {
            // Fallback models if tiddler is empty or doesn't exist
            availableModels.push("gpt-4o-mini", "gpt-4", "gpt-3.5-turbo");
        }




        // Create and add the send button
        const button = $tw.utils.domMaker("button", {
            class: "chat-button",
            text: "Send",
            style: {
                height: "30px",
                minWidth: "60px",
                fontSize: "14px",
                padding: "0 10px",
            }
        });


        const buttonContainer = $tw.utils.domMaker("div", {
            class: "chat-button-container",
            style: {
                display: "flex",
                flexWrap: "wrap",
                gap: "5px",
                alignItems: "center",
                marginTop: "5px",
                padding: "8px",
                borderRadius: "5px",
                backgroundColor: "#2a2a21",
                border: "1px solid #ddd",
                flex: "0 1 auto",
                height: "50px",
                alignSelf: "stretch"
            }
        });

        // Create and add the clear button
        const clearButton = $tw.utils.domMaker("button", {
            class: "chat-button clear-history",
            text: "Clear",
            style: {
                height: "30px",
                minWidth: "60px",
                fontSize: "14px",
                padding: "0 10px",
                color: "white",
                border: "1px solid #ddd",
                cursor: "pointer",
                margin: "0"
            }
        });

        // Create model selector as a custom dropdown
        const modelSelectorContainer = $tw.utils.domMaker("div", {
            class: "model-selector-container",
            style: {
                position: "relative",
                display: "inline-block",
                marginLeft: "10px",
                verticalAlign: "middle"
            }
        });

        const modelButton = $tw.utils.domMaker("button", {
            class: "model-selector-button",
            style: {
                padding: "0 5px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "#2a2a21",
                cursor: "pointer",
                width: "20px",
                height: "30px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
            }
        });

        // Add dropdown arrow
        const arrow = $tw.utils.domMaker("span", {
            text: "▼",
            style: {
                fontSize: "10px"
            }
        });

        modelButton.appendChild(arrow);

        const modelList = $tw.utils.domMaker("ul", {
            class: "model-list",
            style: {
                display: "none",
                position: "absolute",
                top: "100%",
                right: "0",
                zIndex: "1000",
                listStyle: "none",
                padding: "0",
                margin: "0",
                backgroundColor: "#2a2a21",
                border: "1px solid #ccc",
                borderRadius: "4px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                maxHeight: "200px",
                overflowY: "auto",
                minWidth: "150px"
            }
        });


        // Add models to dropdown list
        availableModels.forEach(model => {
            const li = $tw.utils.domMaker("li", {
                text: model,
                style: {
                    padding: "8px 12px",
                    cursor: "pointer",
                    backgroundColor: model === this.currentModel ? "#a9a9a9" : "#2a2a21"
                }
            });

            li.addEventListener("mouseover", () => {
                li.style.backgroundColor = "#adadad";
            });

            li.addEventListener("mouseout", () => {
                li.style.backgroundColor = model === this.currentModel ? "#adadad" : "#2a2a21";
            });

            li.addEventListener("click", () => {
                this.currentModel = model;
                this.chatGPTOptions.model = model;
                modelList.style.display = "none";
                $tw.wiki.addTiddler(new $tw.Tiddler({
                    title: "$:/temp/WikiSage/currentModel",
                    text: model
                }));
                modelList.style.display = "none";
            });

            modelList.appendChild(li);
        });

        // Toggle dropdown on button click
        modelButton.addEventListener("click", (e) => {
            e.stopPropagation();
            modelList.style.display = modelList.style.display === "none" ? "block" : "none";
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", () => {
            modelList.style.display = "none";
        });



        // Create audio button
        const audioButton = $tw.utils.domMaker("button", {
            class: "audio-record-button",
            text: "🎤",
            style: {
                padding: "0 5px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "#2a2a21",
                cursor: "pointer",
                height: "30px",
                width: "30px"
            }
        });

        let mediaRecorder = null;
        let audioChunks = [];
        let silenceTimeout = null;
        let recordingStartTime = null;
        const SILENCE_THRESHOLD = -50; // Adjust this value based on testing
        const SILENCE_DURATION = 1500; // 1.5 seconds of silence before stopping

        const startRecording = async () => {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("Audio recording is not supported in this browser. (navigator.mediaDevices.getUserMedia is unavailable)");
                }
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm'
                });
                audioChunks = [];

                // Set up audio analysis for voice activity detection
                const audioContext = new AudioContext();
                const audioSource = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;
                audioSource.connect(analyser);

                const checkVoiceActivity = () => {
                    const dataArray = new Float32Array(analyser.frequencyBinCount);
                    analyser.getFloatTimeDomainData(dataArray);

                    // Calculate audio level
                    let sum = 0;
                    for (const amplitude of dataArray) {
                        sum += amplitude * amplitude;
                    }
                    const rms = Math.sqrt(sum / dataArray.length);
                    const db = 20 * Math.log10(rms);

                    // Check for silence
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
                        // Reset silence timeout if voice is detected
                        if (silenceTimeout) {
                            clearTimeout(silenceTimeout);
                            silenceTimeout = null;
                        }
                    }

                    // Continue checking while recording
                    if (mediaRecorder.state === "recording") {
                        requestAnimationFrame(checkVoiceActivity);
                    }
                };

                mediaRecorder.addEventListener("dataavailable", event => {
                    audioChunks.push(event.data);
                });

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

                    // Cleanup
                    if (silenceTimeout) {
                        clearTimeout(silenceTimeout);
                        silenceTimeout = null;
                    }
                    stream.getTracks().forEach(track => track.stop());
                });

                // Start recording
                mediaRecorder.start();
                recordingStartTime = Date.now();
                audioButton.style.backgroundColor = "#ff4444";

                // Start voice activity detection
                requestAnimationFrame(checkVoiceActivity);

            } catch (error) {
                console.error("Failed to start recording:", error);
                alert("Failed to start recording: " + error.message);
            }
        };

        // Modify the audio button click handler
        audioButton.addEventListener("click", () => {
            if (!mediaRecorder || mediaRecorder.state === "inactive") {
                startRecording();
            } else if (mediaRecorder.state === "recording") {
                mediaRecorder.stop();
                audioButton.style.backgroundColor = "#fff";
            }
        });

        // Create audio file upload container
        const audioUploadContainer = $tw.utils.domMaker("div", {
            class: "audio-upload-container",
            style: {
                display: "inline-block",
                marginLeft: "10px",
                verticalAlign: "middle"
            }
        });

        // Create hidden file input for audio
        const audioInput = $tw.utils.domMaker("input", {
            attributes: {
                type: "file",
                accept: "audio/*",
                style: "display: none;"
            }
        });

        // Create audio upload button
        const audioUploadButton = $tw.utils.domMaker("button", {
            class: "audio-upload-button",
            text: "🎵",
            style: {
                padding: "0 5px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "#2a2a21",
                cursor: "pointer",
                height: "30px",
                width: "30px"
            }
        });

        // Add audio upload handling
        let selectedAudio = null;
        audioInput.addEventListener("change", async (event) => {
            if (event.target.files && event.target.files[0]) {
                selectedAudio = event.target.files[0];

                audioUploadButton.textContent = "🎵";

                // Process the audio file
                try {
                    const result = await this.transcribeAudio(selectedAudio);
                    input.value = result.text;
                } catch (error) {
                    console.error("Audio transcription error:", error);
                    $tw.notifier.display("$:/core/ui/Notifications/error", {
                        message: "Failed to transcribe audio: " + error.message
                    });
                }
            }
        });

        // Trigger file input when button is clicked
        audioUploadButton.addEventListener("click", () => {
            audioInput.click();
        });

        audioUploadContainer.appendChild(audioInput);
        audioUploadContainer.appendChild(audioUploadButton);


        // Create undo container
        const undoContainer = $tw.utils.domMaker("div", {
            class: "undo-container",
            style: {
                display: "flex",
                alignItems: "center",
                gap: "0"
            }
        });

        // Create main undo button
        const undoButton = $tw.utils.domMaker("button", {
            class: "tc-btn-invisible tc-tiddlylink chat-button undo-action",
            text: "↩️",
            attributes: {
                title: "Undo last action"
            },
            style: {
                padding: "0 5px",
                border: "1px solid #ccc",
                borderRight: "none",
                borderRadius: "4px 0 0 4px",
                backgroundColor: "#2a2a21",
                width: "30px",
                height: "30px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
            }
        });

        // Create select element for undo type
        const undoSelect = $tw.utils.domMaker("select", {
            class: "undo-select",
            style: {
                padding: "0 15px 0 0",
                border: "1px solid #ccc",
                borderLeft: "none",
                borderRadius: "0 4px 4px 0",
                backgroundColor: "#2a2a21",
                width: "15px",
                height: "30px",
                cursor: "pointer",
                appearance: "none",
                "-webkit-appearance": "none",
                "-moz-appearance": "none",
                backgroundImage: "url('data:image/svg+xml;utf8,<svg fill=\"black\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                backgroundSize: "12px"
            }
        });

        // Add options to the select
        const singleOption = $tw.utils.domMaker("option", {
            text: "Operation",
            attributes: { value: "single" }
        });
        const queryOption = $tw.utils.domMaker("option", {
            text: "Query",
            attributes: { value: "query" }
        });

        undoSelect.appendChild(singleOption);
        undoSelect.appendChild(queryOption);

        undoSelect.addEventListener("change", () => {
            const selectedValue = undoSelect.value;
            undoButton.setAttribute("title",
                selectedValue === "query"
                    ? "Undo all actions from last query"
                    : "Undo last action"
            );
        });

        undoButton.addEventListener("click", async () => {
            try {
                const undoType = undoSelect.value;
                let result;

                if (undoType === "query") {
                    const queryActionCount = this.serviceCoordinator.getLastQueryActionCount();
                    if (queryActionCount === 0) {
                        $tw.notifier.display("$:/core/ui/Notifications/error", {
                            message: "No query actions to undo"
                        });
                        return;
                    }
                    result = await this.serviceCoordinator.undoMultipleActions(queryActionCount);
                } else {
                    result = await this.serviceCoordinator.undoMultipleActions(1);
                }

                if (Array.isArray(result) && result.every(r => r.success)) {
                    $tw.notifier.display("$:/core/ui/Notifications/save", {
                        message: `Successfully undid ${result.length} action(s)`
                    });
                } else {
                    $tw.notifier.display("$:/core/ui/Notifications/error", {
                        message: "Failed to undo some actions"
                    });
                }
            } catch (error) {
                console.error("Error in undo operation:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", {
                    message: "Error performing undo: " + error.message
                });
            }
        });


        modelSelectorContainer.appendChild(modelButton);
        modelSelectorContainer.appendChild(modelList);


        // Add all buttons to the button container
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
            // Create voice selector
            const voiceSelect = $tw.utils.domMaker("select", {
                class: "tts-voice-select",
                style: {
                    padding: "2px",
                    borderRadius: "4px",
                    marginRight: "5px",
                    height: "30px"
                }
            });

            // Add voice options
            ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].forEach(voice => {
                const option = $tw.utils.domMaker("option", {
                    text: voice,
                    attributes: { value: voice }
                });
                voiceSelect.appendChild(option);
            });

            // Add voice selector to button container
            buttonContainer.appendChild(voiceSelect);
        }


        chatBox.appendChild(input);
        chatBox.appendChild(buttonContainer);

        clearButton.onclick = () => {
            this.clearChatHistory(conversationsContainer);
        };


        let isProcessing = false;

        const sendMessage = async () => {
            if (isProcessing) return;
            // Get temperature from advanced settings
            let temp = typeof temperature !== 'undefined' ? temperature : 0.7;
            let topp = typeof top_p !== 'undefined' ? top_p : 1.0;
            console.log('[Chat] Sending message with temperature:', temp, 'top_p:', topp);
            if (isProcessing) return;

            const apiKey = this.getApiKey('openai');
            if (!apiKey) {
                alert("Please set your OpenAI API key in the plugin settings or temporary tiddler.");
                return;
            }

            let message = input.value.trim();
            if (!message) return;

            input.value = "";
            isProcessing = true;
            button.disabled = true;

            const conversation = this.createConversationElement(message);
            conversationsContainer.appendChild(conversation);

            try {
                await this.fetchChatGPTResponse(apiKey, message, conversation, temp, topp);
            } catch (error) {
                console.error("Error in sendMessage:", error);
                // this.showError(conversation, error.message); // Old problematic line
                const assistantMessageElement = conversation.querySelector(".chatgpt-conversation-assistant");
                if (assistantMessageElement) {
                    assistantMessageElement.innerHTML = ""; // Clear "Processing..."
                    const errorP = $tw.utils.domMaker("p", { text: `Error: ${error.message}` });
                    errorP.style.color = "#c00"; // Red color for error
                    assistantMessageElement.appendChild(errorP);
                }
            } finally {
                isProcessing = false;
                button.disabled = false;
                this.clearImageSelection(); // Clear image selection after sending
            }
        };



        // Set up event handlers
        button.onclick = () => sendMessage();
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        return chatBox;
    }


    async undoMultipleActions(count = 1) {
        try {
            const results = await this.serviceCoordinator.undoMultipleActions(count);

            if (results.every(r => r.success)) {
                return {
                    success: true,
                    message: `Successfully undid ${count} action(s)`
                };
            } else {
                const failedCount = results.filter(r => !r.success).length;
                return {
                    success: false,
                    message: `Failed to undo ${failedCount} of ${count} actions`
                };
            }
        } catch (error) {
            console.error('Error in undoMultipleActions:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async undoSingleAction(action) {
        try {
            switch (action.action) {
                case 'createTiddler':
                    if (!$tw.wiki.tiddlerExists(action.params.title)) {
                        return {
                            success: false,
                            error: `Tiddler "${action.params.title}" no longer exists`
                        };
                    }
                    $tw.wiki.deleteTiddler(action.params.title);
                    return {
                        success: true,
                        message: `Undid creation of "${action.params.title}"`
                    };

                case 'modifyTiddler':
                    if (!action.previousState) {
                        return {
                            success: false,
                            error: "No previous state available"
                        };
                    }

                    // Restore the previous state
                    $tw.wiki.addTiddler(new $tw.Tiddler(
                        action.previousState.fields,
                        { title: action.params.title }
                    ));
                    return {
                        success: true,
                        message: `Restored previous state of "${action.params.title}"`
                    };

                case 'renameTiddler':
                    if (!$tw.wiki.tiddlerExists(action.params.newTitle)) {
                        return {
                            success: false,
                            error: `Renamed tiddler "${action.params.newTitle}" no longer exists`
                        };
                    }

                    // Get current state of renamed tiddler
                    const tiddler = $tw.wiki.getTiddler(action.params.newTitle);

                    // Create tiddler with old title
                    $tw.wiki.addTiddler(new $tw.Tiddler(
                        tiddler,
                        { title: action.params.oldTitle }
                    ));

                    // Delete the new title
                    $tw.wiki.deleteTiddler(action.params.newTitle);

                    return {
                        success: true,
                        message: `Undid rename from "${action.params.oldTitle}" to "${action.params.newTitle}"`
                    };

                default:
                    return {
                        success: false,
                        error: `Unknown action type: ${action.action}`
                    };
            }
        } catch (error) {
            console.error(`Error in undoSingleAction:`, error);
            return {
                success: false,
                error: `Failed to undo action: ${error.message}`
            };
        }
    }

    getApiType(model) {
        if (typeof model === 'string' && model.toLowerCase().startsWith('gemini')) {
            return 'gemini';
        }
        if (typeof model === 'string' && model.toLowerCase().startsWith('claude')) {
            return 'anthropic';
        }
        return 'openai';
    }

    formatToolResult(toolName, result) {
        try {
            const formattedResult = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            return `Tool ${toolName} returned: ${formattedResult}`;
        } catch (error) {
            return `Error formatting tool result: ${error.message}`;
        }
    }

    async handlePDF(pdfData) {
        let connection;
        try {
            connection = await this.connectionPool.acquire();

            // Create FormData and ensure proper file format
            const formData = new FormData();

            // Convert Blob to File if needed
            const pdfFile = new File([pdfData], "document.pdf", {
                type: "application/pdf"
            });

            formData.append("file", pdfFile);

            const apiKey = this.anthropicConfig.apiKey;

            if (!apiKey) {
                throw new Error("Anthropic API key not found");
            }

            console.log("Sending PDF to Anthropic API...");
            console.log("PDF file type:", pdfFile.type);
            console.log("PDF file size:", pdfFile.size);

            const response = await connection.fetch(ANTHROPIC_API_URL, {
                method: "POST",
                headers: {
                    "x-api-key": this.anthropicConfig.apiKey,
                    "anthropic-version": "2023-06-01",
                    "anthropic-beta": "pdfs-2024-09-25",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "claude-3-5-sonnet-20241022",
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "file",
                                    source: {
                                        type: "base64",
                                        media_type: "application/pdf",
                                        data: await this.fileToBase64(pdfFile)
                                    }
                                }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(`Anthropic API error: ${response.status} - ${errorData?.error?.message || response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("PDF processing error details:", error);
            throw error;
        } finally {
            if (connection) {
                await this.connectionPool.release(connection);
            }
        }
    }

    // Helper function to convert File to base64
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64String = reader.result
                    .replace('data:', '')
                    .replace(/^.+,/, '');
                resolve(base64String);
            };
            reader.onerror = error => reject(error);
        });
    }

    clearChatHistory(conversationsContainer) {
        $tw.wiki.deleteTiddler(this.historyTiddler);
        conversationsContainer.innerHTML = '';
    }


    async fetchChatGPTResponse(apiKey, message, conversationElement, temperature = 0.7, top_p = 1.0) {
        let connection;
        let fullResponse = "";

        try {

            // Acquire connection from pool first
            connection = await this.connectionPool.acquire();
            this.queryStartTime = Date.now();

            // Detect which API to use
            const apiType = this.getApiType(this.chatGPTOptions.model);
            if (apiType === 'gemini') {
                // Capture accurate timezone and current date from the user's browser at the moment of interaction
                if (typeof window !== 'undefined' && window.Intl && window.Intl.DateTimeFormat) {
                    this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
                } else {
                    this.timeZone = 'UTC';
                }
                this.currentDate = new Date().toISOString();

                // Compose conversation history for Gemini, similar to OpenAI/Anthropic logic
                let messages = [];
                // Compose the same system message as for OpenAI/Anthropic
                const systemMessageContent =
                    "The user has instructed: " + (this.systemMessage || "") + "\n\n" +
                    "The user's timezone is " + (this.timeZone || "") + " and the current time is " + (this.currentDate || "");
                console.log('[Gemini] System message content:', systemMessageContent);
                messages.push({ role: 'system', content: systemMessageContent });

                // Debug: Log conversationHistory existence and type
                console.log('[Gemini][DEBUG] conversationHistory:', this.conversationHistory);
                if (!this.conversationHistory || typeof this.conversationHistory.get !== 'function') {
                    console.error('[Gemini][DEBUG] conversationHistory is not set or get is not a function!');
                } else {
                    const histMsgs = this.conversationHistory.get(10);
                    console.log('[Gemini][DEBUG] conversationHistory.get():', JSON.stringify(histMsgs, null, 2));
                    console.log('[Gemini][DEBUG] messages before concat:', JSON.stringify(messages, null, 2));
                    messages = messages.concat(histMsgs);
                    console.log('[Gemini][DEBUG] messages after concat:', JSON.stringify(messages, null, 2));
                }
                messages.push({ role: 'user', content: message });

                // Debug: Log the full messages array before Gemini mapping
                console.log('[Gemini][DEBUG] Full messages array before Gemini mapping:', JSON.stringify(messages, null, 2));

                // Map messages for Gemini API
                const geminiMessages = messages.map(msg => {
                    let author = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
                    let content = Array.isArray(msg.content)
                        ? msg.content.map(c => c.text || c.content || '').join('\n')
                        : (msg.content?.text || msg.content || '');
                    return { author, content };
                });
                // Robust mapping: ensure all messages are included and roles are correct for Gemini
                const contents = messages.map(msg => {
                    let role;
                    if (msg.role === 'system' || msg.role === 'assistant' || msg.role === 'model') {
                        role = 'model';
                    } else {
                        role = 'user';
                    }
                    // Always flatten to string for Gemini
                    let text = Array.isArray(msg.content)
                        ? msg.content.map(c => c.text || c.content || '').join('\n')
                        : (msg.content?.text || msg.content || '');
                    return { role, parts: [{ text }] };
                });
                console.log('[Gemini][DEBUG] Final contents array sent to Gemini:', JSON.stringify(contents, null, 2));
                // --- Function calling support for Gemini ---
                // Use the same functions array as in makeApiCall for OpenAI
                const openAIFunctions = [
                    {
                        name: "exportTiddlers",
                        description: "Export tiddlers in a specified format",
                        parameters: {
                            type: "object",
                            properties: {
                                exportFilter: {
                                    type: "string",
                                    description: "Filter expression to select tiddlers for export"
                                },
                                baseFilename: {
                                    type: "string",
                                    description: "Base filename for the export (default: 'tiddlers')"
                                },
                                format: {
                                    type: "string",
                                    enum: ["JSON", "CSV", "HTML", "TID"],
                                    description: "Export format (JSON, CSV, HTML, or TID)",
                                    default: "JSON"
                                }
                            },
                            required: ["exportFilter"]
                        }
                    },
                    {
                        name: "getAllTiddlerTitles",
                        description: "Get a list of all tiddler titles in the TiddlyWiki",
                        parameters: { type: "object", properties: {} }
                    },
                    {
                        name: "undoActions",
                        description: "Undo a specified number of recent actions",
                        parameters: {
                            type: "object",
                            properties: {
                                count: {
                                    type: "integer",
                                    description: "Number of actions to undo (default: 1)"
                                }
                            }
                        }
                    },
                    {
                        name: "createTiddler",
                        description: "Create a new tiddler with custom tags and fields",
                        parameters: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "The title of the new tiddler" },
                                content: { type: "string", description: "The content of the new tiddler" },
                                tags: { type: "array", items: { type: "string" }, description: "An array of tags for the new tiddler" },
                                fields: { type: "object", description: "Additional fields for the new tiddler" }
                            },
                            required: ["title", "content"]
                        }
                    },
                    {
                        name: "renameTiddler",
                        description: "Rename a tiddler from old title to new title, updating all references",
                        parameters: {
                            type: "object",
                            properties: {
                                oldTitle: { type: "string", description: "The current title of the tiddler to rename" },
                                newTitle: { type: "string", description: "The new title for the tiddler" }
                            },
                            required: ["oldTitle", "newTitle"]
                        }
                    },
                    {
                        name: "openTiddler",
                        description: "Open a tiddler in the story river",
                        parameters: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "The title of the tiddler to open" }
                            },
                            required: ["title"]
                        }
                    },
                    {
                        name: "closeTiddler",
                        description: "Close a tiddler in the story river",
                        parameters: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "The title of the tiddler to close" }
                            },
                            required: ["title"]
                        }
                    },
                    {
                        name: "generateImage",
                        description: "Generate an image using DALL-E 3 based on a text prompt",
                        parameters: {
                            type: "object",
                            properties: {
                                prompt: { type: "string", description: "The text description of the image to generate" },
                                size: { type: "string", enum: ["1024x1024", "1792x1024", "1024x1792"], description: "The size of the image to generate" }
                            },
                            required: ["prompt"]
                        }
                    },
                    {
                        name: "addSystemReference",
                        description: "Add an important note about the user or information that might enhance future performance",
                        parameters: {
                            type: "object",
                            properties: {
                                note: { type: "string", description: "The note to be added" }
                            },
                            required: ["note"]
                        }
                    },
                    {
                        name: "getSystemReference",
                        description: "Retrieve previously saved notes about the user or important information",
                        parameters: { type: "object", properties: {} }
                    },
                    {
                        name: "modifyTiddler",
                        description: "Modify an existing tiddler by updating fields and tags",
                        parameters: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "The title of the tiddler to modify" },
                                fieldsToUpdate: { type: "object", description: "An object containing field names and their new values. Use 'append:' prefix to append to existing field value, 'replace:' to replace it." },
                                tagsToAdd: { type: "array", items: { type: "string" }, description: "An array of tags to add to the tiddler" },
                                tagsToRemove: { type: "array", items: { type: "string" }, description: "An array of tags to remove from the tiddler" }
                            },
                            required: ["title"]
                        }
                    },
                    {
                        name: "reviseSystemReference",
                        description: "Revise an existing note",
                        parameters: {
                            type: "object",
                            properties: {
                                noteId: { type: "string", description: "The ID of the note to be revised" },
                                revisedNote: { type: "string", description: "The revised content of the note" }
                            },
                            required: ["noteId", "revisedNote"]
                        }
                    },
                    {
                        name: "searchTiddlerContent",
                        description: "Search tiddler content, titles, tags, and fields for a given query, with optional tag exclusion",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "The search query" },
                                excludeTags: { type: "array", items: { type: "string" }, description: "Array of tags to exclude from search results" }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "getTiddlerContent",
                        description: "Get the content of a specific tiddler",
                        parameters: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "The title of the tiddler" }
                            },
                            required: ["title"]
                        }
                    },
                    {
                        name: "searchTiddlersByTag",
                        description: "Search for tiddlers with a specific tag",
                        parameters: {
                            type: "object",
                            properties: {
                                tag: { type: "string", description: "The tag to search for" }
                            },
                            required: ["tag"]
                        }
                    },
                    {
                        name: "getTiddlerFields",
                        description: "Get all fields from a specific tiddler",
                        parameters: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "The title of the tiddler to examine" }
                            },
                            required: ["title"]
                        }
                    },
                    {
                        name: "searchTiddlersByField",
                        description: "Search for tiddlers based on a specific field value",
                        parameters: {
                            type: "object",
                            properties: {
                                fieldName: { type: "string", description: "The name of the field to search" },
                                fieldValue: { type: "string", description: "The value to search for in the field" }
                            },
                            required: ["fieldName", "fieldValue"]
                        }
                    }
                ];

                // Gemini expects a "tools" array, each with a "function_declarations" property
                const tools = [{ function_declarations: openAIFunctions }];
                console.log('[Gemini][DEBUG] Payload to Gemini:', JSON.stringify({ contents, tools, temperature }, null, 2));
                // Gemini expects temperature and topP in generationConfig
                const generationConfig = {};
                if (typeof temperature === 'number' && !isNaN(temperature)) {
                    generationConfig.temperature = temperature;
                }
                if (typeof top_p === 'number' && !isNaN(top_p)) {
                    generationConfig.topP = top_p;
                }
                const payload = { contents, tools };
                if (Object.keys(generationConfig).length > 0) {
                    payload.generationConfig = generationConfig;
                }
                console.log('[Gemini][DEBUG] Payload to Gemini:', JSON.stringify(payload, null, 2));
                const geminiModel = this.chatGPTOptions.model || 'gemini-pro';
                const geminiApiUrl = getGeminiApiUrl(geminiModel);

                let continueConversation = true;
                let fullResponse = '';

                while (continueConversation) {
                    // Log the messages being sent to Gemini
                    console.log('[Gemini] Sending payload.contents:', JSON.stringify(payload.contents, null, 2));
                    
                    // ADDED DIAGNOSTIC LOGS START
                    console.log('[Gemini] Attempting to fetch from URL:', geminiApiUrl);
                    console.log('[Gemini] Using API Key (first 5 chars):', this.geminiApiKey ? this.geminiApiKey.substring(0,5) : 'N/A');
                    // ADDED DIAGNOSTIC LOGS END

                    // Send request to Gemini
                    try {
                        const response = await connection.fetch(geminiApiUrl, {
                            method: "POST",
                            headers: {
                                "x-goog-api-key": this.geminiApiKey,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(payload)
                        });

                        console.log('[Gemini] Raw response object received:', response);
                        // If we get here, we have a successful response (connection.fetch will throw for errors)
                        const data = await response.json();
                        console.log('[Gemini] Raw API response data (parsed JSON):', JSON.stringify(data, null, 2));
                        
                        if (data?.candidates?.length > 0) {
                            const candidate = data.candidates[0];
                            console.log('[Gemini] Candidate content.parts:', candidate.content?.parts);
                            // Check for function call in Gemini's response
                            if (candidate.content?.parts && candidate.content.parts.some(p => p.functionCall)) {
                                // Find the function call part
                                const functionPart = candidate.content.parts.find(p => p.functionCall);
                                console.log('[Gemini] Function call part:', functionPart);
                                const functionCall = functionPart.functionCall;
                                console.log('[Gemini] Detected function call:', functionCall);
                                let functionResult = '';
                                try {
                                    // Execute the function/tool call using the widget's internal logic
                                    functionResult = await this.executeToolCall(functionCall.name, functionCall.args || {});
                                    console.log('[Gemini] Function result:', functionResult);
                                } catch (err) {
                                    functionResult = { error: err.message };
                                    console.error('[Gemini] Error executing function call:', err);
                                }
                                // Add function call and result to the conversation
                                messages.push({
                                    role: 'assistant',
                                    content: null,
                                    function_call: {
                                        name: functionCall.name,
                                        arguments: JSON.stringify(functionCall.args || {})
                                    }
                                });
                                messages.push({
                                    role: 'function',
                                    name: functionCall.name,
                                    content: functionResult // Store as native object, not string
                                });
                                // Prepare new payload for next Gemini turn
                                const updatedGeminiMessages = messages.map(msg => {
                                    let author = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
                                    let content = Array.isArray(msg.content)
                                        ? msg.content.map(c => c.text || c.content || '').join('\n')
                                        : (msg.content?.text || msg.content || '');
                                    // For function call, Gemini expects a special format (if needed)
                                    if (msg.function_call) {
                                        try {
                                            const parsedArgs = JSON.parse(msg.function_call.arguments);
                                            return {
                                                author: 'model',
                                                content: '',
                                                functionCall: {
                                                    name: msg.function_call.name,
                                                    args: parsedArgs
                                                }
                                            };
                                        } catch (parseErr) {
                                            console.error('[Gemini] Error parsing function_call.arguments:', parseErr, msg.function_call.arguments);
                                            return {
                                                author: 'model',
                                                content: '',
                                                functionCall: {
                                                    name: msg.function_call.name,
                                                    args: {}
                                                }
                                            };
                                        }
                                    } else if (msg.role === 'function') {
                                        return {
                                            author: 'user',
                                            content: '',
                                            functionResponse: {
                                                name: msg.name,
                                                response: msg.content
                                            }
                                        };
                                    }
                                    return { author, content };
                                });
                                // Rebuild contents for next Gemini call
                                payload.contents = updatedGeminiMessages.map(msg => {
                                    if (msg.functionCall) {
                                        return {
                                            role: 'model',
                                            parts: [{ functionCall: msg.functionCall }]
                                        };
                                    } else if (msg.functionResponse) {
                                        return {
                                            role: 'user',
                                            parts: [{ functionResponse: msg.functionResponse }]
                                        };
                                    }
                                    return {
                                        role: msg.author === 'model' ? 'model' : 'user',
                                        parts: [{ text: msg.content }]
                                    };
                                });
                                console.log('[Gemini] Updated payload for next turn:', JSON.stringify(payload, null, 2));
                                continueConversation = true;
                                continue;
                            } else if (candidate.content?.parts?.length > 0) {
                                // No function call, just text
                                fullResponse = candidate.content.parts.map(p => p.text).join("\n");
                                continueConversation = false;
                            } else {
                                // No valid response
                                fullResponse = '[No response from Gemini]';
                                continueConversation = false;
                            }
                        } else {
                            fullResponse = '[No response from Gemini]';
                            continueConversation = false;
                        }
                    } catch (error) {
                        console.error('[Gemini] API call error:', error);
                        
                        // Handle ApiError from ConnectionPool
                        if (error.name === 'ApiError') {
                            // Get detailed error message
                            let errorMessage = `Gemini API error (${error.status}): `;
                            
                            // Try to extract detailed error info from the data
                            if (error.data && typeof error.data === 'object') {
                                if (error.data.error && error.data.error.message) {
                                    errorMessage += error.data.error.message;
                                } else {
                                    errorMessage += JSON.stringify(error.data);
                                }
                            } else if (typeof error.data === 'string') {
                                errorMessage += error.data;
                            } else {
                                errorMessage += error.message;
                            }
                            
                            // Special handling for rate limit errors
                            if (error.status === 429) {
                                errorMessage = `Rate limit exceeded when calling Gemini API. Please try again later. ${error.data?.error?.message || ''}`;
                            }
                            
                            // Update UI with error message
                            const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");
                            if (assistantMessageElement) {
                                assistantMessageElement.innerText = `Error: ${errorMessage}`;
                            }
                            
                            fullResponse = `Error: ${errorMessage}`;
                            continueConversation = false;
                        } 
                        // Handle NetworkError
                        else if (error.isNetworkError) {
                            const errorMessage = `Network connection error when calling Gemini API: ${error.message}`;
                            
                            // Update UI with error message
                            const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");
                            if (assistantMessageElement) {
                                assistantMessageElement.innerText = `Error: ${errorMessage}`;
                            }
                            
                            fullResponse = `Error: ${errorMessage}`;
                            continueConversation = false;
                        }
                        // Handle other errors
                        else {
                            const errorMessage = `Error with Gemini API call: ${error.message}`;
                            
                            // Update UI with error message
                            const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");
                            if (assistantMessageElement) {
                                assistantMessageElement.innerText = `Error: ${errorMessage}`;
                            }
                            
                            fullResponse = `Error: ${errorMessage}`;
                            continueConversation = false;
                        }
                    }
                }

                // Update UI and conversation history
                const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");
                if (assistantMessageElement) {
                    assistantMessageElement.innerText = fullResponse;
                } else {
                    console.warn("Could not find assistant message element to display Gemini response.");
                }
                this.conversationHistory.save(message, fullResponse, this.currentImageData);
                return fullResponse;
            }


            // In fetchChatGPTResponse, in the PDF handling section:
            if (this.currentPDFData) {
                // Store original model and API type
                const originalModel = this.chatGPTOptions.model;
                const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant")
                // Force switch to Claude for PDF handling
                this.chatGPTOptions.model = "claude-3-5-sonnet-20241022";

                try {
                    // Use Anthropic API with PDF support
                    const response = await connection.fetch(ANTHROPIC_API_URL, {
                        method: "POST",
                        headers: {
                            "x-api-key": this.anthropicConfig.apiKey,
                            "anthropic-version": "2023-06-01",
                            "anthropic-beta": "pdfs-2024-09-25",
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: "claude-3-5-sonnet-20241022",
                            max_tokens: 4096,
                            messages: [
                                {
                                    role: "user",
                                    content: [
                                        {
                                            type: "document",
                                            source: {
                                                type: "base64",
                                                media_type: "application/pdf",
                                                data: this.currentPDFData.text
                                            }
                                        },
                                        {
                                            type: "text",
                                            text: message
                                        }
                                    ]
                                }
                            ]
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`Anthropic API error: ${response.statusText}`);
                    }

                    const data = await response.json();
                    if (data.content && data.content[0] && data.content[0].type === "text") {
                        const fullResponse = data.content[0].text;

                        // Add to conversation history
                        this.conversationHistory.save(message, fullResponse, null, this.currentPDFData);

                        // Update the UI
                        assistantMessageElement.innerHTML = this.renderMarkdownWithLineBreaks(fullResponse);

                        // Clear the PDF data after using it
                        this.currentPDFData = null;

                        // Restore original model
                        this.chatGPTOptions.model = originalModel;

                        return fullResponse;
                    }
                } catch (error) {
                    // Restore original model even if there's an error
                    this.chatGPTOptions.model = originalModel;
                    throw error;
                }
            }
            this.currentUserRequest = message;

            const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");
            const messages = [];

            const currentDate = new Date().toLocaleString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            });

            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const isAnthropicModel = this.currentModel.startsWith('claude');
            const userInstructions = $tw.wiki.getTiddlerText("$:/plugins/Notestreams/WikiSage/User-instructions", "").trim();

            if (isAnthropicModel) {
                let fullResponse = "";
                let continueConversation = true;
                let historyMessage = message;
                let match;
                let processedMessage = message;

                // Add a processing message
                assistantMessageElement.innerHTML = "Processing...";

                const history = this.conversationHistory.get();
                for (const historyItem of history) {
                    messages.push({
                        role: historyItem.role,
                        content: Array.isArray(historyItem.content) ?
                            historyItem.content :
                            [{
                                type: "text",
                                text: historyItem.content
                            }]
                    });
                }

                // Handle transclusions before making the API call
                const transclusionPattern = /{{([^}]+)}}/g;
                const transcludedContents = [];

                if (this.currentImageData) {
                    messages.push({
                        role: "user",
                        content: [
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: this.currentImageData.type,
                                    data: this.currentImageData.text
                                }
                            },
                            {
                                type: "text",
                                text: message
                            }
                        ]
                    });
                } else if (this.currentPDFData) {
                    this.chatGPTOptions.model = "claude-3-5-sonnet-20241022";
                    console.log("PDF detected, switching to claude-3-5-sonnet-20241022");
                    messages.push({
                        role: "user",
                        content: [
                            {
                                type: "document",
                                source: {
                                    type: "base64",
                                    media_type: "application/pdf",
                                    data: this.currentPDFData.text
                                }
                            },
                            {
                                type: "text",
                                text: message
                            }
                        ]
                    });
                    // Clear the PDF data after using it
                    this.currentPDFData = null;
                } else {
                    messages.push({
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: message
                            }
                        ]
                    });
                }

                while ((match = transclusionPattern.exec(message)) !== null) {
                    const tiddlerTitle = match[1];
                    const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
                    if (tiddler) {
                        if (tiddler.fields.type) {
                            if (tiddler.fields.type.startsWith("image/")) {
                                // Handle image transclusion
                                transcludedContents.push({
                                    type: "image",
                                    source: {
                                        type: "base64",
                                        media_type: tiddler.fields.type,
                                        data: tiddler.fields.text
                                    }
                                });
                            } else if (tiddler.fields.type === "application/pdf") {
                                // Store original model
                                const originalModel = this.chatGPTOptions.model;

                                // Force switch to Claude for PDF handling
                                this.chatGPTOptions.model = "claude-3-5-sonnet-20241022";

                                // Handle PDF transclusion
                                transcludedContents.push({
                                    type: "document",
                                    source: {
                                        type: "base64",
                                        media_type: "application/pdf",
                                        data: tiddler.fields.text
                                    }
                                });
                            } else {
                                // Handle text transclusion
                                const content = tiddler.fields.text || "";
                                transcludedContents.push({
                                    type: "text",
                                    text: content
                                });
                            }
                        } else {
                            // Handle text transclusion for tiddlers without type field
                            const content = tiddler.fields.text || "";
                            transcludedContents.push({
                                type: "text",
                                text: content
                            });

                            // Check for stream-list field and include its contents
                            const streamList = tiddler.fields['stream-list'];
                            if (streamList) {
                                const streamTitles = streamList.match(/\[\[([^\]]+)\]\]|(\S+)/g)
                                    .map(title => title.replace(/^\[\[|\]\]$/g, '').trim());
                                streamTitles.forEach(streamTitle => {
                                    const streamTiddler = $tw.wiki.getTiddler(streamTitle);
                                    if (streamTiddler) {
                                        const streamContent = streamTiddler.fields.text || "";
                                        transcludedContents.push({
                                            type: "text",
                                            text: `Content from ${streamTitle}: ${streamContent}`
                                        });
                                    }
                                });
                            }
                        }
                        // Replace transclusion syntax with a placeholder
                        processedMessage = processedMessage.replace(match[0], "");
                    }
                }

                if (transcludedContents.length > 0) {
                    historyMessage += "\n\n" + transcludedContents.map(content =>
                        content.content
                    ).join("\n\n");
                }

                while (continueConversation) {
                    const response = await connection.fetch(ANTHROPIC_API_URL, {
                        method: "POST",
                        headers: {
                            "x-api-key": this.anthropicConfig.apiKey,
                            "anthropic-version": "2023-06-01",
                            "anthropic-beta": "pdfs-2024-09-25",
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            model: this.chatGPTOptions.model,
                            messages: messages,
                            max_tokens: this.anthropicConfig.maxTokens,
                            temperature: 0.7,
                            system: this.systemMessage + "\n\n" + userInstructions + "\n\n" + "The user's timezone is" + timeZone + "and the current time is" + currentDate,

                            tools: [
                                {
                                    name: "getAllTiddlerTitles",
                                    description: "Get a list of all tiddler titles",
                                    input_schema: {
                                        type: "object",
                                        properties: {}
                                    }
                                },
                                {
                                    name: "scrapeWebPage",
                                    description: "Scrape content from a webpage URL",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            url: {
                                                type: "string",
                                                description: "The URL of the webpage to scrape"
                                            }
                                        },
                                        required: ["url"]
                                    }
                                },
                                {
                                    name: "searchTiddlerContent",
                                    description: "Search tiddler content, titles, tags, and fields for a given query",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            query: {
                                                type: "string",
                                                description: "The search query"
                                            },
                                            excludeTags: {
                                                type: "array",
                                                items: { type: "string" },
                                                description: "Array of tags to exclude from search results"
                                            }
                                        },
                                        required: ["query"]
                                    }
                                },
                                {
                                    name: "getTiddlerContent",
                                    description: "Get the content of a specific tiddler",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the tiddler"
                                            }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "searchTiddlersByTag",
                                    description: "Search for tiddlers with a specific tag",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            tag: {
                                                type: "string",
                                                description: "The tag to search for"
                                            }
                                        },
                                        required: ["tag"]
                                    }
                                },
                                {
                                    name: "searchTiddlersByField",
                                    description: "Search for tiddlers based on a specific field value",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            fieldName: {
                                                type: "string",
                                                description: "The name of the field to search"
                                            },
                                            fieldValue: {
                                                type: "string",
                                                description: "The value to search for in the field"
                                            }
                                        },
                                        required: ["fieldName", "fieldValue"]
                                    }
                                },
                                {
                                    name: "addSystemReference",
                                    description: "Add an important note about the user or information",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            note: {
                                                type: "string",
                                                description: "The note to be added"
                                            }
                                        },
                                        required: ["note"]
                                    }
                                },
                                {
                                    name: "getSystemReference",
                                    description: "Retrieve previously saved notes",
                                    input_schema: {
                                        type: "object",
                                        properties: {}
                                    }
                                },
                                {
                                    name: "reviseSystemReference",
                                    description: "Revise an existing note",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            noteId: {
                                                type: "string",
                                                description: "The ID of the note to be revised"
                                            },
                                            revisedNote: {
                                                type: "string",
                                                description: "The revised content of the note"
                                            }
                                        },
                                        required: ["noteId", "revisedNote"]
                                    }
                                },
                                {
                                    name: "createTiddler",
                                    description: "Create a new tiddler with custom tags and fields",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the new tiddler"
                                            },
                                            content: {
                                                type: "string",
                                                description: "The content of the new tiddler"
                                            },
                                            tags: {
                                                type: "array",
                                                items: { type: "string" },
                                                description: "An array of tags for the new tiddler"
                                            },
                                            fields: {
                                                type: "object",
                                                description: "Additional fields for the new tiddler"
                                            }
                                        },
                                        required: ["title", "content"]
                                    }
                                },
                                {
                                    name: "renameTiddler",
                                    description: "Rename a tiddler from old title to new title, updating all references",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            oldTitle: {
                                                type: "string",
                                                description: "The current title of the tiddler to rename"
                                            },
                                            newTitle: {
                                                type: "string",
                                                description: "The new title for the tiddler"
                                            }
                                        },
                                        required: ["oldTitle", "newTitle"]
                                    }
                                },
                                {
                                    name: "openTiddler",
                                    description: "Open a tiddler in the story river",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the tiddler to open"
                                            }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "closeTiddler",
                                    description: "Close a tiddler in the story river",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the tiddler to close"
                                            }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "generateImage",
                                    description: "Generate an image using DALL-E 3 based on a text prompt",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            prompt: {
                                                type: "string",
                                                description: "The text description of the image to generate"
                                            },
                                            size: {
                                                type: "string",
                                                enum: ["1024x1024", "1792x1024", "1024x1792"],
                                                description: "The size of the image to generate"
                                            }
                                        },
                                        required: ["prompt"]
                                    }
                                },
                                {
                                    name: "modifyTiddler",
                                    description: "Modify an existing tiddler by updating fields and tags",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the tiddler to modify"
                                            },
                                            fieldsToUpdate: {
                                                type: "object",
                                                description: "An object containing field names and their new values. Use 'append:' prefix to append to existing field value, 'replace:' to replace it."
                                            },
                                            tagsToAdd: {
                                                type: "array",
                                                items: { type: "string" },
                                                description: "An array of tags to add to the tiddler"
                                            },
                                            tagsToRemove: {
                                                type: "array",
                                                items: { type: "string" },
                                                description: "An array of tags to remove from the tiddler"
                                            }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "getTiddlerFields",
                                    description: "Get all fields from a specific tiddler",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the tiddler to examine"
                                            }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "exportTiddlers",
                                    description: "Export tiddlers in a specified format",
                                    input_schema: {
                                        type: "object",
                                        properties: {
                                            exportFilter: {
                                                type: "string",
                                                description: "Filter expression to select tiddlers for export"
                                            },
                                            baseFilename: {
                                                type: "string",
                                                description: "Base filename for the export (default: 'tiddlers')"
                                            },
                                            format: {
                                                type: "string",
                                                enum: ["JSON", "CSV", "HTML", "TID"],
                                                description: "Export format (JSON, CSV, HTML, or TID)"
                                            }
                                        },
                                        required: ["exportFilter"]
                                    }
                                }
                            ]
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`Anthropic API error: ${response.statusText}`);
                    }

                    const data = await response.json();
                    console.log("Raw API response:", data);

                    if (data.stop_reason === "tool_use") {
                        for (const toolCall of data.content) {
                            if (toolCall.type === "tool_use") {
                                try {
                                    console.log("Executing tool call:", toolCall);
                                    const functionResult = await this.executeToolCall(toolCall.name, toolCall.input);
                                    console.log("Tool execution result:", functionResult);

                                    if (toolCall.name === "exportTiddlers") {
                                        const { exportFilter, baseFilename, format } = toolCall.input;
                                        await this.exportTiddlers(exportFilter, baseFilename, format);
                                    }

                                    messages.push({
                                        role: "assistant",
                                        content: [
                                            {
                                                type: "tool_use",
                                                id: toolCall.id,
                                                name: toolCall.name,
                                                input: toolCall.input
                                            }
                                        ]
                                    });

                                    // Add the tool result as a user message with tool_result type
                                    messages.push({
                                        role: "user",
                                        content: [
                                            {
                                                type: "tool_result",
                                                tool_use_id: toolCall.id,
                                                content: typeof functionResult === 'string' ? functionResult : JSON.stringify(functionResult)
                                            }
                                        ]
                                    });


                                    continueConversation = true;
                                } catch (error) {
                                    console.error(`Error executing tool ${toolCall.name}:`, error);
                                    messages.push({
                                        role: "user",
                                        content: [
                                            {
                                                type: "tool_result",
                                                tool_use_id: toolCall.id,
                                                content: JSON.stringify({ error: error.message })
                                            }
                                        ]
                                    });


                                    continueConversation = false;
                                }
                            }
                        }
                    }

                    // Handle text response
                    else if (data.content && data.content[0] && data.content[0].type === "text") {
                        fullResponse = data.content[0].text;

                        // Add TTS support for Anthropic responses
                        if (this.enableTTS) {
                            try {
                                const voiceSelect = this.domNodes[0].querySelector(".tts-voice-select");
                                const selectedVoice = voiceSelect ? voiceSelect.value : "alloy";
                                const audioUrl = await this.convertTextToSpeech(fullResponse, selectedVoice);
                                const audio = new Audio(audioUrl);
                                audio.play();
                            } catch (ttsError) {
                                console.error("TTS error:", ttsError);
                                $tw.notifier.display("$:/core/ui/Notifications/error", {
                                    message: "Failed to convert text to speech: " + ttsError.message
                                });
                            }
                        }

                        assistantMessageElement.innerHTML = this.renderMarkdownWithLineBreaks(fullResponse);
                        continueConversation = false;
                    }
                }

                this.conversationHistory.save(historyMessage, fullResponse, this.currentImageData);
                return fullResponse;
            }

            //System Message
            messages.push({
                role: "system",
                content: this.systemMessage + "\n\n" + "The user has instructed:" + userInstructions + "\n\n" + "The user's timezone is" + timeZone + "and the current time is" + currentDate
            });

            // Add the conversation history
            messages.push(...this.conversationHistory.get());

            const transclusionPattern = /{{([^}]+)}}/g;
            let match;
            let processedMessage = message;
            const transcludedContents = [];

            while ((match = transclusionPattern.exec(message)) !== null) {
                const tiddlerTitle = match[1];
                const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
                if (tiddler) {
                    if (tiddler.fields.type && tiddler.fields.type.startsWith("image/")) {
                        // Handle image transclusion
                        transcludedContents.push({
                            type: "image_url",
                            image_url: {
                                url: `data:${tiddler.fields.type};base64,${tiddler.fields.text}`
                            }
                        });
                    } else {
                        // Handle text transclusion
                        const content = tiddler.fields.text || "";
                        transcludedContents.push({
                            type: "text",
                            text: content
                        });

                        // Check for stream-list field and include its contents
                        const streamList = tiddler.fields['stream-list'];
                        if (streamList) {
                            // Use regex to match titles, accounting for brackets
                            const streamTitles = streamList.match(/\[\[([^\]]+)\]\]|(\S+)/g).map(title => title.replace(/^\[\[|\]\]$/g, '').trim());
                            streamTitles.forEach(streamTitle => {
                                const streamTiddler = $tw.wiki.getTiddler(streamTitle);
                                if (streamTiddler) {
                                    const streamContent = streamTiddler.fields.text || "";
                                    transcludedContents.push({
                                        type: "text",
                                        text: `Content from ${streamTitle}: ${streamContent}`
                                    });
                                }
                            });
                        }
                    }
                    // Replace transclusion syntax with a placeholder
                    processedMessage = processedMessage.replace(match[0], "");
                }
            }


            // Add the processed message and transcluded contents to the messages array
            messages.push({
                role: "user",
                content: [
                    {
                        type: "text",
                        text: processedMessage
                    },
                    ...transcludedContents
                ]
            });

            // Add image to message if one is selected
            if (this.currentImageData) {
                messages[messages.length - 1].content.push({
                    type: "image_url",
                    image_url: {
                        url: `data:${this.currentImageData.type};base64,${this.currentImageData.text}`
                    }
                });
            }

            // Add PDF to message if one is selected
            if (this.currentPDFData) {
                this.chatGPTOptions.model = "claude-3-5-sonnet-20241022";
                console.log("PDF detected, switching to claude-3-5-sonnet-20241022");
                messages[messages.length - 1].content.push({
                    type: "document",
                    source: {
                        type: "base64",
                        media_type: "application/pdf",
                        data: this.currentPDFData.text
                    }
                });
            }

            // Add transcluded contents as separate messages
            transcludedContents.forEach(transclusion => {
                messages.push({
                    role: "user",
                    content: [{
                        type: "text",
                        text: `Content from ${transclusion.title}: ${transclusion.content}`
                    }]
                });
            });


            // Add a processing message
            assistantMessageElement.innerHTML = "Processing...";


            const makeApiCall = async (messages) => {
                try {
                    const { useAdversarialValidation, ...apiOptions } = this.chatGPTOptions;

                    const response = await connection.fetch(CHAT_COMPLETION_URL, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${apiKey}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            ...apiOptions,  // Use apiOptions instead of this.chatGPTOptions
                            messages: messages,
                            functions: [
                                {
                                    name: "exportTiddlers",
                                    description: "Export tiddlers in a specified format",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            exportFilter: {
                                                type: "string",
                                                description: "Filter expression to select tiddlers for export"
                                            },
                                            baseFilename: {
                                                type: "string",
                                                description: "Base filename for the export (default: 'tiddlers')"
                                            },
                                            format: {
                                                type: "string",
                                                enum: ["JSON", "CSV", "HTML", "TID"],
                                                description: "Export format (JSON, CSV, HTML, or TID)",
                                                default: "JSON"
                                            }
                                        },
                                        required: ["exportFilter"]
                                    }
                                },
                                {
                                    name: "getAllTiddlerTitles",
                                    description: "Get a list of all tiddler titles in the TiddlyWiki",
                                    parameters: { type: "object", properties: {} }
                                },
                                {
                                    name: "undoActions",
                                    description: "Undo a specified number of recent actions",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            count: {
                                                type: "integer",
                                                description: "Number of actions to undo (default: 1)"
                                            }
                                        }
                                    }
                                },
                                {
                                    name: "createTiddler",
                                    description: "Create a new tiddler with custom tags and fields",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            title: { type: "string", description: "The title of the new tiddler" },
                                            content: { type: "string", description: "The content of the new tiddler" },
                                            tags: { type: "array", items: { type: "string" }, description: "An array of tags for the new tiddler" },
                                            fields: { type: "object", description: "Additional fields for the new tiddler" }
                                        },
                                        required: ["title", "content"]
                                    }
                                },

                                {
                                    name: "renameTiddler",
                                    description: "Rename a tiddler from old title to new title, updating all references",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            oldTitle: {
                                                type: "string",
                                                description: "The current title of the tiddler to rename"
                                            },
                                            newTitle: {
                                                type: "string",
                                                description: "The new title for the tiddler"
                                            }
                                        },
                                        required: ["oldTitle", "newTitle"]
                                    }
                                },
                                {
                                    name: "openTiddler",
                                    description: "Open a tiddler in the story river",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the tiddler to open"
                                            }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "closeTiddler",
                                    description: "Close a tiddler in the story river",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the tiddler to close"
                                            }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "generateImage",
                                    description: "Generate an image using DALL-E 3 based on a text prompt",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            prompt: {
                                                type: "string",
                                                description: "The text description of the image to generate"
                                            },
                                            size: {
                                                type: "string",
                                                enum: ["1024x1024", "1792x1024", "1024x1792"],
                                                description: "The size of the image to generate"
                                            }
                                        },
                                        required: ["prompt"]
                                    }
                                },
                                {
                                    name: "addSystemReference",
                                    description: "Add an important note about the user or information that might enhance future performance",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            note: { type: "string", description: "The note to be added" }
                                        },
                                        required: ["note"]
                                    }
                                },
                                {
                                    name: "getSystemReference",
                                    description: "Retrieve previously saved notes about the user or important information",
                                    parameters: { type: "object", properties: {} }
                                },
                                {
                                    name: "modifyTiddler",
                                    description: "Modify an existing tiddler by updating fields and tags",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            title: { type: "string", description: "The title of the tiddler to modify" },
                                            fieldsToUpdate: { type: "object", description: "An object containing field names and their new values. Use 'append:' prefix to append to existing field value, 'replace:' to replace it." },
                                            tagsToAdd: { type: "array", items: { type: "string" }, description: "An array of tags to add to the tiddler" },
                                            tagsToRemove: { type: "array", items: { type: "string" }, description: "An array of tags to remove from the tiddler" }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "reviseSystemReference",
                                    description: "Revise an existing note",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            noteId: { type: "string", description: "The ID of the note to be revised" },
                                            revisedNote: { type: "string", description: "The revised content of the note" }
                                        },
                                        required: ["noteId", "revisedNote"]
                                    }
                                },
                                {
                                    name: "searchTiddlerContent",
                                    description: "Search tiddler content, titles, tags, and fields for a given query, with optional tag exclusion",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            query: {
                                                type: "string",
                                                description: "The search query"
                                            },
                                            excludeTags: {
                                                type: "array",
                                                items: { type: "string" },
                                                description: "Array of tags to exclude from search results"
                                            }
                                        },
                                        required: ["query"]
                                    }
                                },
                                {
                                    name: "getTiddlerContent",
                                    description: "Get the content of a specific tiddler",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            title: { type: "string", description: "The title of the tiddler" }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "searchTiddlersByTag",
                                    description: "Search for tiddlers with a specific tag",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            tag: { type: "string", description: "The tag to search for" }
                                        },
                                        required: ["tag"]
                                    }
                                },
                                {
                                    name: "getTiddlerFields",
                                    description: "Get all fields from a specific tiddler",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "The title of the tiddler to examine"
                                            }
                                        },
                                        required: ["title"]
                                    }
                                },
                                {
                                    name: "searchTiddlersByField",
                                    description: "Search for tiddlers based on a specific field value",
                                    parameters: {
                                        type: "object",
                                        properties: {
                                            fieldName: { type: "string", description: "The name of the field to search" },
                                            fieldValue: { type: "string", description: "The value to search for in the field" }
                                        },
                                        required: ["fieldName", "fieldValue"]
                                    }
                                }
                            ],
                            function_call: "auto"
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    return response.json();
                } catch (error) {
                    console.error("API call error:", error);
                    throw error; // Re-throw the error to be handled by the calling function
                }
            };


            let fullResponse = "";
            let continueConversation = true;

            while (continueConversation) {
                try {
                    const apiResponse = await makeApiCall(messages);

                    if (!apiResponse || apiResponse.error) {
                        throw new Error(apiResponse?.error?.message || 'Invalid API response');
                    }

                    const choice = apiResponse.choices[0];

                    if (choice.finish_reason === "function_call") {
                        const functionCall = choice.message.function_call;
                        let functionResult = {};

                        // Execute the appropriate function based on the function call
                        if (functionCall.name === "getAllTiddlerTitles") {
                            functionResult = this.getAllTiddlerTitles().join(", ");
                        } else if (functionCall.name === "searchTiddlerContent") {
                            const query = JSON.parse(functionCall.arguments).query;
                            functionResult = JSON.stringify(this.searchTiddlerContent(query), null, 2);
                        } else if (functionCall.name === "getTiddlerContent") {
                            const title = JSON.parse(functionCall.arguments).title;
                            functionResult = this.getTiddlerContent(title);
                        } else if (functionCall.name === "searchTiddlersByTag") {
                            const tag = JSON.parse(functionCall.arguments).tag;
                            functionResult = JSON.stringify(this.searchTiddlersByTag(tag), null, 2);
                        } else if (functionCall.name === "exportTiddlers") {
                            const { exportFilter, baseFilename = "tiddlers", format = "JSON" } = JSON.parse(functionCall.arguments);
                            try {
                                // Get the correct exporter template based on format
                                const exporterTemplates = {
                                    "JSON": "$:/core/templates/exporters/JsonFile",
                                    "CSV": "$:/core/templates/exporters/CsvFile",
                                    "HTML": "$:/core/templates/exporters/StaticRiver",
                                    "TID": "$:/core/templates/exporters/TidFile"
                                };

                                const exporterTemplate = exporterTemplates[format.toUpperCase()];
                                if (!exporterTemplate) {
                                    throw new Error(`Invalid export format: ${format}`);
                                }

                                // Get the extension from the exporter template
                                const exporter = $tw.wiki.getTiddler(exporterTemplate);
                                if (!exporter) {
                                    throw new Error(`Exporter template not found: ${exporterTemplate}`);
                                }

                                // Get the tiddlers that match the filter
                                const tiddlers = $tw.wiki.filterTiddlers(exportFilter);
                                if (!tiddlers || tiddlers.length === 0) {
                                    throw new Error(`No tiddlers match the filter: ${exportFilter}`);
                                }

                                // Create the export data based on format
                                let exportData;
                                switch (format.toUpperCase()) {
                                    case "JSON":
                                        exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, { variables: { exportFilter } });
                                        break;
                                    case "CSV":
                                        exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, { variables: { exportFilter } });
                                        break;
                                    case "HTML":
                                        exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, { variables: { exportFilter } });
                                        break;
                                    case "TID":
                                        if (tiddlers.length > 1) {
                                            throw new Error("TID format can only export one tiddler at a time");
                                        }
                                        exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, { variables: { exportFilter } });
                                        break;
                                    default:
                                        throw new Error(`Unsupported export format: ${format}`);
                                }

                                // Create a Blob with the export data
                                const blob = new Blob([exportData], { type: "text/plain" });
                                const url = URL.createObjectURL(blob);

                                // Create and trigger download link
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `${baseFilename}${exporter.fields.extension}`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);

                                functionResult = `Successfully exported ${tiddlers.length} tiddler(s) in ${format} format`;
                            } catch (error) {
                                functionResult = `Export failed: ${error.message}`;
                            }
                        } else if (functionCall.name === "getTiddlerFields") {
                            const { title } = JSON.parse(functionCall.arguments);
                            const tiddler = $tw.wiki.getTiddler(title);
                            if (!tiddler) {
                                functionResult = JSON.stringify({
                                    success: false,
                                    error: `Tiddler "${title}" does not exist`
                                });
                            } else {
                                functionResult = JSON.stringify({
                                    success: true,
                                    fields: { ...tiddler.fields }
                                });
                            }
                        } else if (functionCall.name === "searchTiddlersByField") {
                            const { fieldName, fieldValue } = JSON.parse(functionCall.arguments);
                            functionResult = JSON.stringify(this.searchTiddlersByField(fieldName, fieldValue), null, 2);
                        } else if (functionCall.name === "addSystemReference") {
                            const note = JSON.parse(functionCall.arguments).note;
                            const noteId = this.addSystemReference(note);
                            functionResult = `Note added successfully. Note ID: ${noteId}`;
                        } else if (functionCall.name === "getSystemReference") {
                            functionResult = this.getSystemReference();
                        } else if (functionCall.name === "renameTiddler") {
                            const { oldTitle, newTitle } = JSON.parse(functionCall.arguments);
                            try {
                                const result = await this.executeAction("renameTiddler", {
                                    oldTitle,
                                    newTitle
                                });
                                functionResult = result.success ?
                                    result.result :
                                    `Error: ${result.error}`;
                            } catch (error) {
                                functionResult = `Error: ${error.message}`;
                            }
                        } else if (functionCall.name === "openTiddler") {
                            const params = JSON.parse(functionCall.arguments);
                            const verificationResult = await this.verifyAction("openTiddler", params);
                            functionResult = verificationResult.success ? verificationResult.result : `Failed to open tiddler: ${verificationResult.error}`;
                        } else if (functionCall.name === "closeTiddler") {
                            const params = JSON.parse(functionCall.arguments);
                            const verificationResult = await this.verifyAction("closeTiddler", params);
                            functionResult = verificationResult.success ? verificationResult.result : `Failed to close tiddler: ${verificationResult.error}`;
                        } else if (functionCall.name === "reviseSystemReference") {
                            const { noteId, revisedNote } = JSON.parse(functionCall.arguments);
                            this.reviseSystemReference(noteId, revisedNote);
                            functionResult = "Note revised successfully.";
                        } else if (functionCall.name === "createTiddler") {
                            const params = JSON.parse(functionCall.arguments);
                            functionResult = await this.executeAction("createTiddler", params);
                        } else if (functionCall.name === "generateImage") {
                            const { prompt, size = "1024x1024" } = JSON.parse(functionCall.arguments);
                            const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
                                method: "POST",
                                headers: {
                                    "Authorization": `Bearer ${apiKey}`,
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({
                                    model: "dall-e-3",
                                    prompt: prompt,
                                    n: 1,
                                    size: size,
                                    response_format: "url"
                                })
                            });

                            if (!imageResponse.ok) {
                                throw new Error(`HTTP error! status: ${imageResponse.status}`);
                            }

                            const imageData = await imageResponse.json();
                            const imageUrl = imageData.data[0].url;

                            // Return the image URL in a format that can be displayed in the chat
                            functionResult = `<img src="${imageUrl}" alt="Generated image" style="max-width: 100%; height: auto;"/>`;
                        } else if (functionCall.name === "modifyTiddler") {
                            const params = JSON.parse(functionCall.arguments);
                            functionResult = await this.executeAction("modifyTiddler", params);
                        }

                        // Add both the assistant's message and the function result to the conversation
                        messages.push({
                            role: "assistant",
                            content: null,
                            function_call: {
                                name: functionCall.name,
                                arguments: functionCall.arguments
                            }
                        });

                        messages.push({
                            role: "function",
                            name: functionCall.name,
                            content: functionResult
                        });

                    } else {
                        fullResponse += choice.message.content;

                        // If TTS is enabled, convert response to speech
                        if (this.enableTTS) {
                            try {
                                const voiceSelect = this.domNodes[0].querySelector(".tts-voice-select");
                                const selectedVoice = voiceSelect ? voiceSelect.value : "alloy";
                                const audioUrl = await this.convertTextToSpeech(fullResponse, selectedVoice);
                                const audio = new Audio(audioUrl);
                                audio.play();
                            } catch (ttsError) {
                                console.error("TTS error:", ttsError);
                                $tw.notifier.display("$:/core/ui/Notifications/error", {
                                    message: "Failed to convert text to speech: " + ttsError.message
                                });
                            }
                        }

                        assistantMessageElement.innerHTML = this.renderMarkdownWithLineBreaks(fullResponse);



                        continueConversation = false;
                    }


                } catch (error) {
                    console.error("API call error:", error);
                    throw error;
                }
            }
            // Save conversation history
            this.conversationHistory.save(message, fullResponse, this.currentImageData);
            return fullResponse;

        } catch (error) {
            console.error("Error in fetchChatGPTResponse:", error);
            if (conversationElement) {
                const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");
                if (assistantMessageElement) {
                    assistantMessageElement.innerHTML = `Error: ${error.message}`;
                }
            }
            throw error;
        } finally {
            // Always release the connection back to the pool
            if (connection) {
                try {
                    await this.connectionPool.release(connection);
                } catch (releaseError) {
                    console.error("Error releasing connection:", releaseError);
                }
            }
        }
    }

    async exportTiddlers(exportFilter, baseFilename = "tiddlers", format = "JSON") {
        try {
            // Get the correct exporter template based on format
            const exporterTemplates = {
                "JSON": "$:/core/templates/exporters/JsonFile",
                "CSV": "$:/core/templates/exporters/CsvFile",
                "HTML": "$:/core/templates/exporters/StaticRiver",
                "TID": "$:/core/templates/exporters/TidFile"
            };

            const exporterTemplate = exporterTemplates[format.toUpperCase()];
            if (!exporterTemplate) {
                throw new Error(`Invalid export format: ${format}`);
            }

            // Get the extension from the exporter template
            const exporter = $tw.wiki.getTiddler(exporterTemplate);
            if (!exporter) {
                throw new Error(`Exporter template not found: ${exporterTemplate}`);
            }

            // Get the tiddlers that match the filter
            const tiddlers = $tw.wiki.filterTiddlers(exportFilter);
            if (!tiddlers || tiddlers.length === 0) {
                throw new Error(`No tiddlers match the filter: ${exportFilter}`);
            }

            // Create the export data based on format
            let exportData;
            switch (format.toUpperCase()) {
                case "JSON":
                case "CSV":
                case "HTML":
                    exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, {
                        variables: { exportFilter }
                    });
                    break;
                case "TID":
                    if (tiddlers.length > 1) {
                        throw new Error("TID format can only export one tiddler at a time");
                    }
                    exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, {
                        variables: { exportFilter }
                    });
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            // Create a Blob with the export data
            const blob = new Blob([exportData], { type: "text/plain" });
            const url = URL.createObjectURL(blob);

            // Create and trigger download link
            const a = document.createElement("a");
            a.href = url;
            a.download = `${baseFilename}${exporter.fields.extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return `Successfully exported ${tiddlers.length} tiddler(s) in ${format} format`;
        } catch (error) {
            throw new Error(`Export failed: ${error.message}`);
        }
    }

    renderMarkdownWithLineBreaks(text) {
        // Always use TiddlyWiki's rendering engine
        return $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", text);
    }

    createConversationElement(message) {
        const conversation = $tw.utils.domMaker("div", { class: "chatgpt-conversation" });
        conversation.appendChild($tw.utils.domMaker("div", {
            class: "chatgpt-conversation-message chatgpt-conversation-user",
            children: [$tw.utils.domMaker("p", { text: message })]
        }));
        // Add a placeholder for the assistant's message
        conversation.appendChild($tw.utils.domMaker("div", {
            class: "chatgpt-conversation-message chatgpt-conversation-assistant",
            children: [$tw.utils.domMaker("p", { text: "Processing...", class: "assistant-processing-message" })]
        }));
        return conversation;
    }

    clearImageSelection() {
        const imageSelector = this.domNodes[0].querySelector(".image-selector");
        const imagePreview = this.domNodes[0].querySelector(".image-preview");
        if (imageSelector) {
            imageSelector.value = "";
        }
        if (imagePreview) {
            imagePreview.style.display = "none";
            imagePreview.innerHTML = "";
        }
        this.currentImageData = null;
    }


    openTiddler(title) {
        $tw.wiki.addToStory(title);
        return `Opened tiddler "${title}"`;
    }

    closeTiddler(title) {
        const storyTiddler = "$:/StoryList";
        const storyList = $tw.wiki.getTiddlerList(storyTiddler);
        const newStoryList = storyList.filter(item => item !== title);
        $tw.wiki.setText(storyTiddler, "list", null, newStoryList);
        return `Closed tiddler "${title}"`;
    }



    getAllTiddlerTitles() {
        return $tw.wiki.getTiddlers();
    }

    searchTiddlerContent(query, excludeTags = []) {
        try {
            // Generate cache key
            const cacheKey = `${query}:${excludeTags.sort().join(',')}`;

            // Check cache first (synchronously)
            if (this.cacheService) {
                const cachedResults = this.cacheService.cache.results.get(cacheKey);
                const timestamp = this.cacheService.cache.timestamp.get(cacheKey);

                if (cachedResults && timestamp &&
                    (Date.now() - timestamp <= this.cacheService.config.maxAge)) {
                    return cachedResults;
                }
            }

            // If not in cache or cache miss, perform the search
            const results = [];
            const queryLower = query.toLowerCase();

            $tw.wiki.each((tiddler, title) => {
                // Skip tiddlers with excluded tags
                const tiddlerTags = tiddler.fields.tags || [];
                if (excludeTags.length > 0 && tiddlerTags.some(tag => excludeTags.includes(tag))) {
                    return;
                }

                const titleLower = title.toLowerCase();
                const textLower = (tiddler.fields.text || "").toLowerCase();
                const tags = tiddlerTags;
                const aliases = this.parseAliases(tiddler.fields.aliases);

                // Check for exact match, partial match, or similar spelling in title, aliases, or tags
                if (titleLower.includes(queryLower) ||
                    this.isSimilar(titleLower, queryLower) ||
                    aliases.some(alias => alias.toLowerCase().includes(queryLower) ||
                        this.isSimilar(alias.toLowerCase(), queryLower)) ||
                    tags.some(tag => tag.toLowerCase().includes(queryLower) ||
                        this.isSimilar(tag.toLowerCase(), queryLower))) {
                    results.push({
                        title: title,
                        excerpt: tiddler.fields.text ? tiddler.fields.text.substring(0, 100) + "..." : "No content",
                        matchType: "title, alias, or tag"
                    });
                }
                // Check content for query or similar terms
                else if (textLower.includes(queryLower) || this.containsSimilar(textLower, queryLower)) {
                    results.push({
                        title: title,
                        excerpt: this.findRelevantExcerpt(tiddler.fields.text, query),
                        matchType: "content"
                    });
                }
                // Check other fields
                else {
                    for (const [field, value] of Object.entries(tiddler.fields)) {
                        if (field !== "text" && field !== "tags" && typeof value === "string") {
                            const valueLower = value.toLowerCase();
                            if (valueLower.includes(queryLower) || this.isSimilar(valueLower, queryLower)) {
                                results.push({
                                    title: title,
                                    excerpt: `${field}: ${value}`,
                                    matchType: `field: ${field}`
                                });
                                break;
                            }
                        }
                    }
                }
            });

            // Cache the results if cache service is available
            if (this.cacheService) {
                this.cacheService.cache.results.set(cacheKey, results);
                this.cacheService.cache.timestamp.set(cacheKey, Date.now());
                this.cacheService.cache.metadata.set(cacheKey, {
                    size: JSON.stringify(results).length,
                    compressed: false,
                    query: query,
                    excludeTags: excludeTags
                });
            }

            return results;
        } catch (error) {
            console.error("Error in searchTiddlerContent:", error);
            return [];
        }
    }


    // Helper function to parse aliases string into an array
    parseAliases(aliasesString) {
        if (!aliasesString) return [];
        return aliasesString.match(/\[\[([^\]]+)\]\]|(\S+)/g)
            .map(alias => alias.replace(/^\[\[|\]\]$/g, ''));
    }

    // Helper function to check if two strings are similar
    isSimilar(str1, str2, threshold = 0.8) { //Create adjustible threshold?
        const length = Math.max(str1.length, str2.length);
        const distance = this.levenshteinDistance(str1, str2);
        return (length - distance) / length >= threshold;
    }

    // Helper function to calculate Levenshtein distance
    levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
                }
            }
        }

        return dp[m][n];
    }

    // Helper function to check if content contains similar terms
    containsSimilar(content, query) {
        const words = content.split(/\s+/);
        const queryWords = query.split(/\s+/);
        return queryWords.some(qWord =>
            words.some(word => this.isSimilar(word, qWord))
        );
    }

    // Helper function to find a relevant excerpt
    findRelevantExcerpt(text, query) {
        const index = text.toLowerCase().indexOf(query.toLowerCase());
        if (index === -1) return text.substring(0, 100) + "...";

        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + query.length + 50);
        return (start > 0 ? "..." : "") + text.substring(start, end) + (end < text.length ? "..." : "");
    }



    getTiddlerContent(title) {
        let content = $tw.wiki.getTiddlerText(title);
        if (content) return content;

        // If not found by title, search for aliases
        let foundTiddler = null;
        $tw.wiki.each((tiddler, tiddlerTitle) => {
            if (foundTiddler) return; // Stop if we find a match
            const aliases = this.parseAliases(tiddler.fields.aliases);
            if (aliases.some(alias => this.isSimilar(alias.toLowerCase(), title.toLowerCase()))) {
                foundTiddler = tiddler;
            }
        });

        if (foundTiddler) {
            return foundTiddler.fields.text || `The tiddler with alias "${title}" exists but has no content.`;
        }

        return `The tiddler "${title}" does not exist and no matching alias was found.`;
    }

    refresh(changedTiddlers) {
        const changedAttributes = this.computeAttributes();
        if (Object.keys(changedAttributes).length > 0 || this.historyTiddler in changedTiddlers) {
            this.refreshSelf();
            return true;
        }
        return false;
    }

    searchTiddlersByTag(tag) {
        const results = [];
        const tagLower = tag.toLowerCase();

        $tw.wiki.each((tiddler, title) => {
            const tags = tiddler.fields.tags || [];
            if (tags.some(t => t.toLowerCase() === tagLower || this.isSimilar(t.toLowerCase(), tagLower))) {
                results.push({
                    title: title,
                    excerpt: tiddler.fields.text ? tiddler.fields.text.substring(0, 100) + "..." : "No content",
                    matchType: "tag"
                });
            }
        });

        return results;
    }

    searchTiddlersByField(fieldName, fieldValue) {
        const results = [];
        const fieldValueLower = fieldValue.toLowerCase();

        $tw.wiki.each((tiddler, title) => {
            const field = tiddler.fields[fieldName];
            if (field) {
                const fieldLower = (typeof field === "string") ? field.toLowerCase() : String(field).toLowerCase();
                if (fieldLower.includes(fieldValueLower) || this.isSimilar(fieldLower, fieldValueLower)) {
                    results.push({
                        title: title,
                        excerpt: `${fieldName}: ${field}`,
                        matchType: `field: ${fieldName}`
                    });
                }
            }
        });

        return results;
    }


    addSystemReference(note) {
        const noteTiddler = "$:/ChatGPTNotes";
        let existingNotes = $tw.wiki.getTiddlerText(noteTiddler) || "";
        const noteId = Date.now().toString();
        const newNote = `\n- ${noteId}: ${new Date().toISOString()}: ${note}`;
        const updatedNotes = existingNotes + newNote;
        $tw.wiki.setText(noteTiddler, "text", null, updatedNotes);
        console.log("Note added:", note);
        console.log("Updated notes:", updatedNotes);
        return noteId;
    }

    getSystemReference() {
        const noteTiddler = "$:/ChatGPTNotes";
        const notes = $tw.wiki.getTiddlerText(noteTiddler) || "No notes available.";
        console.log("Retrieved notes:", notes);
        return notes;
    }

    reviseSystemReference(noteId, revisedNote) {
        const noteTiddler = "$:/ChatGPTNotes";
        let existingNotes = $tw.wiki.getTiddlerText(noteTiddler) || "";
        const noteLines = existingNotes.split('\n');
        const updatedNotes = noteLines.map(line => {
            if (line.startsWith(`- ${noteId}:`)) {
                return `- ${noteId}: ${new Date().toISOString()}: ${revisedNote} (Revised)`;
            }
            return line;
        }).join('\n');
        $tw.wiki.setText(noteTiddler, "text", null, updatedNotes);
        console.log("Note revised:", revisedNote);
        console.log("Updated notes:", updatedNotes);
    }

}

//Edit Content Macro

$tw.macros["clarify-content"] = {
    params: [],
    run: function () {
        const currentTiddler = this.wiki.getTextReference("$:/HistoryList!!current-tiddler");

        if (!currentTiddler) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: No current tiddler found."
            });
            return "";
        }

        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
        if (!apiKey) {
            alert("Please set your OpenAI API key in the plugin settings.");
            return "";
        }

        const tiddlerContent = $tw.wiki.getTiddlerText(currentTiddler);
        if (!tiddlerContent) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: Current tiddler has no content."
            });
            return "";
        }

        const fullMessage = `Please edit for clarity using patterns established by the user's writing. Do not include any commentary other than the edited content. Attempt to correct any obvious contextual spelling mistakes. Do not mention your training data or engage in any interaction with the user. \n\n${tiddlerContent}`;

        // Show a notification to indicate processing
        $tw.notifier.display("$:/core/ui/Notifications/save", {
            message: "Processing..."
        });

        fetch(CHAT_COMPLETION_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: fullMessage }]
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                let editedContent = data.choices[0].message.content;

                // Remove any unwanted text
                editedContent = editedContent.replace("You are trained on data up to October 2023.", "").trim();

                $tw.wiki.setText(currentTiddler, "text", null, editedContent);

                $tw.notifier.display("$:/core/ui/Notifications/save", {
                    message: `Tiddler "${currentTiddler}" updated successfully.`
                });
            })
            .catch(error => {
                console.error("API error:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", {
                    message: error.message
                });
            });

        return "";
    }
};

$tw.macros["clarify-content-streams"] = {
    params: [],
    run: function () {
        const currentTiddler = this.getVariable("currentTiddler");

        if (!currentTiddler) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: No current tiddler found."
            });
            return "";
        }

        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
        if (!apiKey) {
            alert("Please set your OpenAI API key in the plugin settings.");
            return "";
        }

        const tiddlerContent = $tw.wiki.getTiddlerText(currentTiddler);
        if (!tiddlerContent) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: Current tiddler has no content."
            });
            return "";
        }

        const fullMessage = `Please edit for clarity using patterns established by the user's writing. Do not include any commentary other than the edited content. Do not mention your training data or engage in any interaction with the user.\n\n${tiddlerContent}`;

        // Show a notification to indicate processing
        $tw.notifier.display("$:/core/ui/Notifications/save", {
            message: "Processing..."
        });

        fetch(CHAT_COMPLETION_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: fullMessage }]
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                let editedContent = data.choices[0].message.content;

                // Remove any unwanted text
                editedContent = editedContent.replace("You are trained on data up to October 2023.", "").trim();

                $tw.wiki.setText(currentTiddler, "text", null, editedContent);

                $tw.notifier.display("$:/core/ui/Notifications/save", {
                    message: `Tiddler "${currentTiddler}" updated successfully.`
                });
            })
            .catch(error => {
                console.error("API error:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", {
                    message: error.message
                });
            });

        return "";
    }
};

$tw.macros["yadda-yadda"] = {
    params: [],
    run: function () {
        const currentTiddler = this.wiki.getTextReference("$:/HistoryList!!current-tiddler");

        if (!currentTiddler) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: No current tiddler found."
            });
            return "";
        }

        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
        if (!apiKey) {
            alert("Please set your OpenAI API key in the plugin settings.");
            return "";
        }

        const tiddlerContent = $tw.wiki.getTiddlerText(currentTiddler);
        if (!tiddlerContent) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: Current tiddler has no content."
            });
            return "";
        }

        const fullMessage = `Please continue the following text to complete the sentence, using patterns established by the user's writing. Do not write more than one or two sentences. Do not include any commentary other than the continuation.\n\n${tiddlerContent}`;

        // Show a notification to indicate processing
        $tw.notifier.display("$:/core/ui/Notifications/save", {
            message: "Processing..."
        });

        fetch(CHAT_COMPLETION_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: fullMessage }]
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                let appendedContent = data.choices[0].message.content;

                // Remove any unwanted text
                appendedContent = appendedContent.replace("You are trained on data up to October 2023.", "").trim();

                // Append the new content to the existing tiddler content
                const newContent = tiddlerContent + " " + appendedContent;

                $tw.wiki.setText(currentTiddler, "text", null, newContent);

                $tw.notifier.display("$:/core/ui/Notifications/save", {
                    message: `Tiddler "${currentTiddler}" updated successfully.`
                });
            })
            .catch(error => {
                console.error("API error:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", {
                    message: error.message
                });
            });

        return "";
    }
};


$tw.macros["yadda-yadda-streams"] = {
    params: [],
    run: function () {
        const currentTiddler = this.getVariable("currentTiddler");
        const rowEditStateTitle = this.getVariable("row-edit-state");
        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();

        if (!apiKey) {
            alert("Please set your OpenAI API key in the plugin settings.");
            return "";
        }

        const tiddlerContent = $tw.wiki.getTiddlerText(currentTiddler);
        if (!tiddlerContent) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: Current tiddler has no content."
            });
            return "";
        }

        const fullMessage = `Please continue the following text to complete the sentence, using patterns established by the user's writing. Do not write more than one or two sentences. Do not include any commentary other than the continuation.\n\n${tiddlerContent}`;

        // Show a notification to indicate processing
        $tw.notifier.display("$:/core/ui/Notifications/save", {
            message: "Processing..."
        });

        fetch(CHAT_COMPLETION_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: fullMessage }]
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                let appendedContent = data.choices[0].message.content;
                appendedContent = appendedContent.replace("You are trained on data up to October 2023.", "").trim();

                const newContent = tiddlerContent + " " + appendedContent;

                // Update the underlying tiddler
                $tw.wiki.addTiddler(new $tw.Tiddler(
                    $tw.wiki.getTiddler(currentTiddler),
                    { text: newContent }
                ));

                // Set caret position to end
                $tw.wiki.addTiddler(new $tw.Tiddler({
                    title: "$:/state/sq/streams/caret-position",
                    text: newContent.length.toString()
                }));

                // Delete and reinitialize the edit state
                $tw.wiki.deleteTiddler(rowEditStateTitle);

                // Force a refresh
                $tw.rootWidget.dispatchEvent({ type: "tm-auto-save-wiki" });

                // Reinitialize edit state after a brief delay
                setTimeout(() => {
                    $tw.wiki.addTiddler(new $tw.Tiddler({
                        title: rowEditStateTitle,
                        text: currentTiddler
                    }));

                    // Force another refresh to ensure the edit state is recognized
                    $tw.rootWidget.dispatchEvent({ type: "tm-auto-save-wiki" });
                }, 1);

                $tw.notifier.display("$:/core/ui/Notifications/save", {
                    message: `Tiddler "${currentTiddler}" updated successfully.`
                });
            })
            .catch(error => {
                console.error("API error:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", {
                    message: error.message
                });
            });

        return "";
    }
};


$tw.macros["auto-summary"] = {
    params: [],
    run: function () {
        const currentTiddler = this.getVariable("currentTiddler");
        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
        if (!apiKey) {
            alert("Please set your OpenAI API key in the plugin settings.");
            return "";
        }
        if (!currentTiddler) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: No current tiddler found."
            });
            return "";
        }
        // Get all fields and text
        const tiddlerObj = $tw.wiki.getTiddler(currentTiddler);
        if (!tiddlerObj) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: `Error: Tiddler '${currentTiddler}' not found.`
            });
            return "";
        }
        const fields = { ...tiddlerObj.fields };
        // Remove AI-summary if present to avoid self-summary
        delete fields["AI-summary"];
        // Prepare prompt
        const fieldPairs = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n");
        const prompt = `Summarize the following tiddler in 2-3 sentences for a human reader. Focus on the most important points, and ignore metadata fields.\n\n${fieldPairs}`;
        $tw.notifier.display("$:/core/ui/Notifications/save", {
            message: "Generating AI summary..."
        });
        return fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: prompt }],
                max_tokens: 256,
                temperature: typeof temperature !== 'undefined' ? temperature : 0.7
            })
        })
            .then(resp => resp.json())
            .then(data => {
                if (data.error) throw new Error(data.error.message || "Unknown API error.");
                let summary = data.choices[0].message.content.trim();
                // Set the AI-summary field
                $tw.wiki.addTiddler(new $tw.Tiddler(
                    $tw.wiki.getTiddler(currentTiddler),
                    { "description": summary }
                ));
                $tw.notifier.display("$:/core/ui/Notifications/save", {
                    message: `AI summary added to '${currentTiddler}'.`
                });
            })
            .catch(error => {
                console.error("AI summary error:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", {
                    message: error.message
                });
            }), "";
    }
};

$tw.macros["fix-style"] = {
    params: [],
    run: function () {
        const currentTiddler = this.getVariable("currentTiddler");
        if (!currentTiddler) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: No current tiddler found."
            });
            return "";
        }
        const tiddlerObj = $tw.wiki.getTiddler(currentTiddler);
        if (!tiddlerObj) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: `Error: Tiddler '${currentTiddler}' not found.`
            });
            return "";
        }
        const text = tiddlerObj.fields.text || "";
        // Basic HTML style improvement: wrap in a styled div
        const styledHtml = `<div style="padding: 18px; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 1.1em; line-height: 1.6; font-family: 'Segoe UI', Arial, sans-serif; color: #222; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">${text
                .replace(/\n/g, "<br>")
                .replace(/\s{2,}/g, " ") // collapse multiple spaces
            }</div>`;
        return styledHtml;
    }
};

$tw.macros["beautify-tiddler"] = {
    params: [
        { name: "theme", default: "auto" }
    ],
    run: function (theme) {
        const currentTiddler = this.getVariable("currentTiddler");

        if (!currentTiddler) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Error: No current tiddler found."
            });
            return "";
        }

        const tiddlerObj = $tw.wiki.getTiddler(currentTiddler);
        if (!tiddlerObj) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: `Error: Tiddler '${currentTiddler}' not found.`
            });
            return "";
        }

        // Get the API key
        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
        if (!apiKey) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: "Please set your OpenAI API key in the plugin settings."
            });
            return "";
        }

        // Get the original text and metadata
        const text = tiddlerObj.fields.text || "";
        const title = tiddlerObj.fields.title || "";
        const tags = tiddlerObj.fields.tags || [];

        // Create a sanitized preview for AI analysis (truncate if too long)
        const contentPreview = text.length > 2000 ? text.substring(0, 2000) + "..." : text;

        // Prepare prompt for AI analysis
        const prompt = `You are a design expert specializing in creating beautiful, readable document styles. 
    
I will provide you with the content of a document, and I want you to:

1. Analyze the content to understand its purpose, tone, and structure
2. Design a visually appealing style that enhances readability and complements the content's theme
3. Return your response as a JSON object with the following properties:
   - theme: a name for your theme (e.g., "scholarly", "creative", "technical")
   - description: a brief description of your design choices
   - colors: an object with color hex codes for: background, text, heading, link, codeBackground, blockquoteBg, blockquoteBorder, accentColor
   - fontPrimary: recommended font-family for body text (should be web-safe or widely available)
   - fontSecondary: recommended font-family for headings (should be web-safe or widely available)
   - specialFeatures: array of special styling features to apply (e.g., ["dropcaps", "pullquotes", "chapterDividers"])

The document has the title: "${title}"
Tags: ${tags.join(", ")}
Content: ${contentPreview}

Respond ONLY with the JSON object, no other text.`;

        // Show processing notification
        $tw.notifier.display("$:/core/ui/Notifications/save", {
            message: "Analyzing content and generating beautiful style..."
        });

        // Create a unique CSS class name for this tiddler
        const uniqueClassName = "beautified-tiddler-" + currentTiddler.replace(/[^\w]+/g, "-").toLowerCase();

        // Make API call to get style recommendation
        fetch(CHAT_COMPLETION_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4.1-nano",
                messages: [{ role: "system", content: prompt }],
                response_format: { type: "json_object" }
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                // Parse the AI's style recommendation
                let styleData;
                try {
                    const aiResponse = data.choices[0].message.content;
                    styleData = JSON.parse(aiResponse);
                } catch (e) {
                    throw new Error("Failed to parse AI style recommendation");
                }

                // Manual theme override if specified
                if (theme !== "auto") {
                    const predefinedThemes = {
                        "sepia": {
                            theme: "Sepia",
                            description: "A warm, classic style for comfortable reading",
                            colors: {
                                background: "#f8f2e3",
                                text: "#5f4b32",
                                heading: "#7b6545",
                                link: "#8e5e3d",
                                codeBackground: "#f0e8d0",
                                blockquoteBg: "#f0e8d0",
                                blockquoteBorder: "#d8c8a8",
                                accentColor: "#b09068"
                            },
                            fontPrimary: "Georgia, serif",
                            fontSecondary: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
                            specialFeatures: []
                        },
                        "dark": {
                            theme: "Dark Mode",
                            description: "A sleek dark theme that's easy on the eyes",
                            colors: {
                                background: "#2d2d2d",
                                text: "#e0e0e0",
                                heading: "#81a1c1",
                                link: "#88c0d0",
                                codeBackground: "#222222",
                                blockquoteBg: "#383838",
                                blockquoteBorder: "#555555",
                                accentColor: "#5e81ac"
                            },
                            fontPrimary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
                            fontSecondary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
                            specialFeatures: []
                        },
                        "light": {
                            theme: "Light Mode",
                            description: "A clean, minimal light theme with good contrast",
                            colors: {
                                background: "#f9f9f9",
                                text: "#333333",
                                heading: "#2d5b8e",
                                link: "#0077cc",
                                codeBackground: "#f5f5f5",
                                blockquoteBg: "#f0f4f8",
                                blockquoteBorder: "#c8d6e5",
                                accentColor: "#4a90e2"
                            },
                            fontPrimary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
                            fontSecondary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
                            specialFeatures: []
                        }
                    };

                    if (predefinedThemes[theme]) {
                        styleData = predefinedThemes[theme];
                    }
                }

                // Generate CSS based on AI recommendation
                const colors = styleData.colors;
                const specialFeatures = styleData.specialFeatures || [];

                // Apply additional CSS based on special features
                let specialCSS = "";

                if (specialFeatures.includes("dropcaps")) {
                    specialCSS += `
.${uniqueClassName} > p:first-of-type::first-letter {
  float: left;
  font-size: 3.5em;
  line-height: 0.8;
  font-family: ${styleData.fontSecondary || "Georgia, serif"};
  margin-right: 0.1em;
  color: ${colors.accentColor};
  padding: 0.1em;
}`;
                }

                if (specialFeatures.includes("pullquotes")) {
                    specialCSS += `
.${uniqueClassName} blockquote {
  position: relative;
}
.${uniqueClassName} blockquote.pullquote {
  float: right;
  width: 30%;
  margin: 0.5em 0 0.5em 1em;
  padding: 1em;
  font-size: 1.2em;
  font-style: italic;
  color: ${colors.accentColor};
  border-top: 2px solid ${colors.accentColor};
  border-bottom: 2px solid ${colors.accentColor};
  border-left: none;
  background: transparent;
  text-align: center;
}`;
                }

                if (specialFeatures.includes("chapterDividers")) {
                    specialCSS += `
.${uniqueClassName} hr {
  height: 30px;
  border: none;
  background-image: url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50 10 L40 0 L60 0 Z M25 10 L15 0 L35 0 Z M75 10 L65 0 L85 0 Z' fill='${colors.accentColor.replace("#", "%23")}' /%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  margin: 2em auto;
}`;
                }

                // Create the CSS to be included in the tiddler
                const cssText = `
<style>
/* Theme: ${styleData.theme} - ${styleData.description} */
.${uniqueClassName} {
  max-width: 800px;
  margin: 20px auto;
  padding: 25px;
  background: ${colors.background};
  border: 1px solid ${colors.blockquoteBorder || colors.accentColor};
  border-radius: 8px;
  font-family: ${styleData.fontPrimary || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"};
  line-height: 1.6;
  color: ${colors.text};
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}

.${uniqueClassName} + .tc-title,
.${uniqueClassName} + .tc-subtitle {
  color: ${colors.heading};
}

.${uniqueClassName} h1, 
.${uniqueClassName} h2, 
.${uniqueClassName} h3, 
.${uniqueClassName} h4, 
.${uniqueClassName} h5, 
.${uniqueClassName} h6 {
  color: ${colors.heading};
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  font-weight: 600;
  line-height: 1.3;
  font-family: ${styleData.fontSecondary || styleData.fontPrimary || "Georgia, serif"};
}

.${uniqueClassName} h1 { font-size: 2em; border-bottom: 1px solid ${colors.blockquoteBorder}; padding-bottom: 0.3em; }
.${uniqueClassName} h2 { font-size: 1.75em; }
.${uniqueClassName} h3 { font-size: 1.5em; }
.${uniqueClassName} h4 { font-size: 1.25em; }
.${uniqueClassName} h5 { font-size: 1.1em; }
.${uniqueClassName} h6 { font-size: 1em; }

.${uniqueClassName} p {
  margin: 1em 0;
}

.${uniqueClassName} ul, 
.${uniqueClassName} ol {
  margin: 1em 0;
  padding-left: 2em;
}

.${uniqueClassName} li {
  margin: 0.5em 0;
}

.${uniqueClassName} blockquote {
  margin: 1em 0;
  padding: 1em;
  background: ${colors.blockquoteBg};
  border-left: 4px solid ${colors.blockquoteBorder};
  font-style: italic;
}

.${uniqueClassName} pre {
  background: ${colors.codeBackground};
  border: 1px solid ${colors.blockquoteBorder};
  border-radius: 4px;
  padding: 1em;
  overflow: auto;
  font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
}

.${uniqueClassName} code {
  background: ${colors.codeBackground};
  border: 1px solid ${colors.blockquoteBorder};
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
}

.${uniqueClassName} table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.${uniqueClassName} th, 
.${uniqueClassName} td {
  border: 1px solid ${colors.blockquoteBorder};
  padding: 8px 12px;
  text-align: left;
}

.${uniqueClassName} th {
  background-color: ${colors.blockquoteBg};
}

.${uniqueClassName} img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
  border-radius: 4px;
}

.${uniqueClassName} a {
  color: ${colors.link};
  text-decoration: none;
  transition: color 0.2s ease;
}

.${uniqueClassName} a:hover {
  text-decoration: underline;
  color: ${colors.accentColor};
}

.${uniqueClassName} hr {
  border: 0;
  border-top: 1px solid ${colors.blockquoteBorder};
  margin: 2em 0;
}

/* Special features */
${specialCSS}
</style>
<div class="${uniqueClassName}">
`;

                // Render tiddler content as HTML before adding to the styled div
                // This is the key change - use TiddlyWiki's render mechanism to parse wiki syntax to HTML first
                const renderedContent = $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", text);

                // Add CSS to the tiddler content and update
                const updatedText = cssText + renderedContent + "</div>";

                // Update the tiddler without changing tags or fields
                $tw.wiki.addTiddler(new $tw.Tiddler(
                    tiddlerObj,  // Keep all original fields
                    { text: updatedText }  // Only update the text field
                ));

                $tw.notifier.display("$:/core/ui/Notifications/save", {
                    message: `Applied "${styleData.theme}" theme to tiddler`
                });
            })
            .catch(error => {
                console.error("Error in beautify-tiddler:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", {
                    message: `Error generating style: ${error.message}`
                });

                // Fall back to sepia theme on error
                const fallbackCssText = `
<style>
/* Theme: Sepia (Fallback) - A warm, classic style for comfortable reading */
.${uniqueClassName} {
  max-width: 800px;
  margin: 20px auto;
  padding: 25px;
  background: #f8f2e3;
  border: 1px solid #d8c8a8;
  border-radius: 8px;
  font-family: Georgia, serif;
  line-height: 1.6;
  color: #5f4b32;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}

.${uniqueClassName} + .tc-title,
.${uniqueClassName} + .tc-subtitle {
  color: #7b6545;
}

.${uniqueClassName} h1, 
.${uniqueClassName} h2, 
.${uniqueClassName} h3, 
.${uniqueClassName} h4, 
.${uniqueClassName} h5, 
.${uniqueClassName} h6 {
  color: #7b6545;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  font-weight: 600;
  line-height: 1.3;
  font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif;
}

.${uniqueClassName} h1 { font-size: 2em; border-bottom: 1px solid #d8c8a8; padding-bottom: 0.3em; }
.${uniqueClassName} h2 { font-size: 1.75em; }
.${uniqueClassName} h3 { font-size: 1.5em; }
.${uniqueClassName} h4 { font-size: 1.25em; }
.${uniqueClassName} h5 { font-size: 1.1em; }
.${uniqueClassName} h6 { font-size: 1em; }

.${uniqueClassName} p {
  margin: 1em 0;
}

.${uniqueClassName} ul, 
.${uniqueClassName} ol {
  margin: 1em 0;
  padding-left: 2em;
}

.${uniqueClassName} li {
  margin: 0.5em 0;
}

.${uniqueClassName} blockquote {
  margin: 1em 0;
  padding: 1em;
  background: #f0e8d0;
  border-left: 4px solid #d8c8a8;
  font-style: italic;
}

.${uniqueClassName} pre {
  background: #f0e8d0;
  border: 1px solid #d8c8a8;
  border-radius: 4px;
  padding: 1em;
  overflow: auto;
  font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
}

.${uniqueClassName} code {
  background: #f0e8d0;
  border: 1px solid #d8c8a8;
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
}

.${uniqueClassName} table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.${uniqueClassName} th, 
.${uniqueClassName} td {
  border: 1px solid #d8c8a8;
  padding: 8px 12px;
  text-align: left;
}

.${uniqueClassName} th {
  background-color: #f0e8d0;
}

.${uniqueClassName} img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
  border-radius: 4px;
}

.${uniqueClassName} a {
  color: #8e5e3d;
  text-decoration: none;
}

.${uniqueClassName} a:hover {
  text-decoration: underline;
}

.${uniqueClassName} hr {
  border: 0;
  border-top: 1px solid #d8c8a8;
  margin: 2em 0;
}
</style>
<div class="${uniqueClassName}">
`;

                // Render tiddler content as HTML before adding to the styled div
                const renderedContent = $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", text);

                // Add fallback CSS to the tiddler content and update
                const updatedText = fallbackCssText + renderedContent + "</div>";

                // Update the tiddler without changing tags or fields
                $tw.wiki.addTiddler(new $tw.Tiddler(
                    tiddlerObj,  // Keep all original fields
                    { text: updatedText }  // Only update the text field
                ));

                $tw.notifier.display("$:/core/ui/Notifications/save", {
                    message: "Applied fallback sepia theme to tiddler"
                });
            });

        return "";
    }
};

exports["WikiSage"] = ChatGPTWidget;


