/*\
created: 20260302000000000
title: $:/plugins/NoteStreams/WikiSage/api-handler.js
tags:
type: application/javascript
module-type: library

API handler for WikiSage: dispatches to Gemini, Anthropic, and OpenAI providers
\*/

"use strict";

const { CHAT_COMPLETION_URL, ANTHROPIC_API_URL, getGeminiApiUrl, extractOpenAIText, getApiType, getFormatInstruction, renderMarkdownWithLineBreaks, processTransclusions, getLocalChatCompletionUrl, getLocalModelName } = require("$:/plugins/NoteStreams/WikiSage/utils.js");
const { getOpenAIFunctions, getAnthropicTools, getGeminiTools } = require("$:/plugins/NoteStreams/WikiSage/tool-definitions.js");

/**
 * ApiHandler orchestrates API calls to Gemini, Anthropic, and OpenAI.
 * 
 * @param {Object} widget - The ChatGPTWidget instance (provides access to all widget state)
 */
class ApiHandler {

    constructor(widget) {
        this.widget = widget;
    }

    /**
     * Main entry point - dispatches to the correct provider.
     */
    async fetchChatGPTResponse(apiKey, message, conversationElement, temperature, top_p, outputFormat) {
        temperature = typeof temperature === 'number' ? temperature : 0.7;
        top_p = typeof top_p === 'number' ? top_p : 1.0;
        outputFormat = outputFormat || "wikitext";

        const w = this.widget;
        let connection;

        try {
            connection = await w.connectionPool.acquire();
            w.queryStartTime = Date.now();

            const apiType = getApiType(w.chatGPTOptions.model);

            if (apiType === 'gemini') {
                return await this._callGemini(connection, apiKey, message, conversationElement, temperature, top_p, outputFormat);
            }

            if (apiType === 'local') {
                return await this._callLocal(connection, apiKey, message, conversationElement, temperature, top_p, outputFormat);
            }

            // Handle PDF with Anthropic regardless of selected model
            if (w.currentPDFData) {
                const pdfResult = await this._callAnthropicPDF(connection, message, conversationElement, outputFormat);
                if (pdfResult !== null) return pdfResult;
            }

            w.currentUserRequest = message;
            const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");

            if (apiType === 'anthropic') {
                return await this._callAnthropic(connection, apiKey, message, conversationElement, assistantMessageElement, temperature, top_p, outputFormat);
            }

            return await this._callOpenAI(connection, apiKey, message, conversationElement, assistantMessageElement, temperature, top_p, outputFormat);

        } catch (error) {
            console.error("Error in fetchChatGPTResponse:", error);
            if (conversationElement) {
                const el = conversationElement.querySelector(".chatgpt-conversation-assistant");
                if (el) el.innerHTML = `Error: ${error.message}`;
            }
            throw error;
        } finally {
            if (connection) {
                try { await w.connectionPool.release(connection); }
                catch (e) { console.error("Error releasing connection:", e); }
            }
        }
    }

    // ==================== GEMINI ====================

    async _callGemini(connection, apiKey, message, conversationElement, temperature, top_p, outputFormat) {
        const w = this.widget;

        if (typeof window !== 'undefined' && window.Intl && window.Intl.DateTimeFormat) {
            w.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } else {
            w.timeZone = 'UTC';
        }
        w.currentDate = new Date().toISOString();

        let messages = [];
        const formatInstruction = getFormatInstruction(outputFormat);

        const systemMessageContent =
            "The user has instructed: " + (w.systemMessage || "") + "\n\n" +
            "The user's timezone is " + (w.timeZone || "") + " and the current time is " + (w.currentDate || "") + formatInstruction;

        messages.push({ role: 'system', content: systemMessageContent });

        if (w.conversationHistory && typeof w.conversationHistory.get === 'function') {
            const histMsgs = w.conversationHistory.get(10);
            messages = messages.concat(histMsgs);
        }
        messages.push({ role: 'user', content: message });

        // Build contents for Gemini
        const contents = messages.map(msg => {
            let role = (msg.role === 'system' || msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
            let text = Array.isArray(msg.content)
                ? msg.content.map(c => c.text || c.content || '').join('\n')
                : (msg.content?.text || msg.content || '');
            return { role, parts: [{ text }] };
        });

        const tools = getGeminiTools(['scrapeWebPage']);
        const generationConfig = {};
        if (typeof temperature === 'number' && !isNaN(temperature)) generationConfig.temperature = temperature;
        if (typeof top_p === 'number' && !isNaN(top_p)) generationConfig.topP = top_p;

        const payload = { contents, tools };
        if (Object.keys(generationConfig).length > 0) payload.generationConfig = generationConfig;

        const geminiModel = w.chatGPTOptions.model || 'gemini-pro';
        const geminiApiUrl = getGeminiApiUrl(geminiModel);

        let continueConversation = true;
        let fullResponse = '';

        while (continueConversation) {
            try {
                const response = await connection.fetch(geminiApiUrl, {
                    method: "POST",
                    headers: {
                        "x-goog-api-key": w.geminiApiKey,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (data?.candidates?.length > 0) {
                    const candidate = data.candidates[0];

                    if (candidate.content?.parts && candidate.content.parts.some(p => p.functionCall)) {
                        const functionPart = candidate.content.parts.find(p => p.functionCall);
                        const functionCall = functionPart.functionCall;
                        let functionResult = '';
                        try {
                            functionResult = await w.executeToolCall(functionCall.name, functionCall.args || {});
                        } catch (err) {
                            functionResult = { error: err.message };
                        }

                        messages.push({
                            role: 'assistant', content: null,
                            function_call: { name: functionCall.name, arguments: JSON.stringify(functionCall.args || {}) }
                        });
                        messages.push({ role: 'function', name: functionCall.name, content: functionResult });

                        // Rebuild contents for next turn
                        payload.contents = messages.map(msg => {
                            if (msg.function_call) {
                                let parsedArgs = {};
                                try { parsedArgs = JSON.parse(msg.function_call.arguments); } catch (e) {}
                                return { role: 'model', parts: [{ functionCall: { name: msg.function_call.name, args: parsedArgs } }] };
                            } else if (msg.role === 'function') {
                                return { role: 'user', parts: [{ functionResponse: { name: msg.name, response: msg.content } }] };
                            }
                            let role = (msg.role === 'system' || msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
                            let text = Array.isArray(msg.content) ? msg.content.map(c => c.text || c.content || '').join('\n') : (msg.content?.text || msg.content || '');
                            return { role, parts: [{ text }] };
                        });
                        continueConversation = true;
                        continue;
                    } else if (candidate.content?.parts?.length > 0) {
                        fullResponse = candidate.content.parts.map(p => p.text).join("\n");
                        continueConversation = false;
                    } else {
                        fullResponse = '[No response from Gemini]';
                        continueConversation = false;
                    }
                } else {
                    fullResponse = '[No response from Gemini]';
                    continueConversation = false;
                }
            } catch (error) {
                console.error('[Gemini] API call error:', error);
                let errorMessage = error.message;
                if (error.name === 'ApiError') {
                    errorMessage = `Gemini API error (${error.status}): `;
                    if (error.data?.error?.message) errorMessage += error.data.error.message;
                    else errorMessage += JSON.stringify(error.data || error.message);
                    if (error.status === 429) errorMessage = `Rate limit exceeded. ${error.data?.error?.message || ''}`;
                } else if (error.isNetworkError) {
                    errorMessage = `Network error: ${error.message}`;
                }
                const el = conversationElement.querySelector(".chatgpt-conversation-assistant");
                if (el) el.innerText = `Error: ${errorMessage}`;
                fullResponse = `Error: ${errorMessage}`;
                continueConversation = false;
            }
        }

        const el = conversationElement.querySelector(".chatgpt-conversation-assistant");
        if (el) el.innerText = fullResponse;
        w.conversationHistory.save(message, fullResponse, w.currentImageData);
        return fullResponse;
    }

    // ==================== ANTHROPIC PDF ====================

    async _callAnthropicPDF(connection, message, conversationElement, outputFormat) {
        const w = this.widget;
        const originalModel = w.chatGPTOptions.model;
        const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");
        w.chatGPTOptions.model = "claude-3-5-sonnet-20241022";

        try {
            const response = await connection.fetch(ANTHROPIC_API_URL, {
                method: "POST",
                headers: {
                    "x-api-key": w.anthropicConfig.apiKey,
                    "anthropic-version": "2023-06-01",
                    "anthropic-beta": "pdfs-2024-09-25",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 4096,
                    messages: [{
                        role: "user",
                        content: [
                            { type: "document", source: { type: "base64", media_type: "application/pdf", data: w.currentPDFData.text } },
                            { type: "text", text: message }
                        ]
                    }]
                })
            });

            if (!response.ok) throw new Error(`Anthropic API error: ${response.statusText}`);

            const data = await response.json();
            if (data.content && data.content[0] && data.content[0].type === "text") {
                const fullResponse = data.content[0].text;
                w.conversationHistory.save(message, fullResponse, null, w.currentPDFData);
                if (assistantMessageElement) assistantMessageElement.innerHTML = renderMarkdownWithLineBreaks(fullResponse, outputFormat);
                w.currentPDFData = null;
                w.chatGPTOptions.model = originalModel;
                return fullResponse;
            }
        } catch (error) {
            w.chatGPTOptions.model = originalModel;
            throw error;
        }
        w.chatGPTOptions.model = originalModel;
        return null; // PDF handling didn't produce a result, fall through
    }

    // ==================== ANTHROPIC ====================

    async _callAnthropic(connection, apiKey, message, conversationElement, assistantMessageElement, temperature, top_p, outputFormat) {
        const w = this.widget;
        let fullResponse = "";
        let continueConversation = true;
        let historyMessage = message;
        const messages = [];
        const formatInstruction = getFormatInstruction(outputFormat);

        const currentDate = new Date().toLocaleString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
        });
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const userInstructions = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/User-instructions", "").trim();

        assistantMessageElement.innerHTML = "Processing...";

        // Add conversation history
        const history = w.conversationHistory.get();
        for (const historyItem of history) {
            messages.push({
                role: historyItem.role,
                content: Array.isArray(historyItem.content) ? historyItem.content : [{ type: "text", text: historyItem.content }]
            });
        }

        // Handle transclusions
        const { processedMessage, transcludedContents } = processTransclusions(message, 'anthropic');

        // Build user message with attachments
        if (w.currentImageData) {
            messages.push({
                role: "user",
                content: [
                    { type: "image", source: { type: "base64", media_type: w.currentImageData.type, data: w.currentImageData.text } },
                    { type: "text", text: message }
                ]
            });
        } else if (w.currentPDFData) {
            w.chatGPTOptions.model = "claude-3-5-sonnet-20241022";
            messages.push({
                role: "user",
                content: [
                    { type: "document", source: { type: "base64", media_type: "application/pdf", data: w.currentPDFData.text } },
                    { type: "text", text: message }
                ]
            });
            w.currentPDFData = null;
        } else {
            messages.push({ role: "user", content: [{ type: "text", text: message }] });
        }

        if (transcludedContents.length > 0) {
            historyMessage += "\n\n" + transcludedContents.map(c => c.content).join("\n\n");
        }

        const anthropicTools = getAnthropicTools(['undoActions']);

        while (continueConversation) {
            const response = await connection.fetch(ANTHROPIC_API_URL, {
                method: "POST",
                headers: {
                    "x-api-key": w.anthropicConfig.apiKey,
                    "anthropic-version": "2023-06-01",
                    "anthropic-beta": "pdfs-2024-09-25",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: w.chatGPTOptions.model,
                    messages: messages,
                    max_tokens: w.anthropicConfig.maxTokens,
                    temperature: 0.7,
                    system: w.systemMessage + "\n\n" + userInstructions + "\n\n" + "The user's timezone is " + timeZone + " and the current time is " + currentDate + formatInstruction,
                    tools: anthropicTools
                })
            });

            if (!response.ok) throw new Error(`Anthropic API error: ${response.statusText}`);

            const data = await response.json();

            if (data.stop_reason === "tool_use") {
                for (const toolCall of data.content) {
                    if (toolCall.type === "tool_use") {
                        try {
                            const functionResult = await w.executeToolCall(toolCall.name, toolCall.input);
                            if (toolCall.name === "exportTiddlers") {
                                const { exportFilter, baseFilename, format } = toolCall.input;
                                await w.tiddlerOps.exportTiddlers(exportFilter, baseFilename, format);
                            }

                            messages.push({ role: "assistant", content: [{ type: "tool_use", id: toolCall.id, name: toolCall.name, input: toolCall.input }] });
                            messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolCall.id, content: typeof functionResult === 'string' ? functionResult : JSON.stringify(functionResult) }] });
                            continueConversation = true;
                        } catch (error) {
                            messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolCall.id, content: JSON.stringify({ error: error.message }) }] });
                            continueConversation = false;
                        }
                    }
                }
            } else if (data.content && data.content[0] && data.content[0].type === "text") {
                fullResponse = data.content[0].text;

                if (w.enableTTS) {
                    try {
                        const voiceSelect = w.domNodes[0].querySelector(".tts-voice-select");
                        const selectedVoice = voiceSelect ? voiceSelect.value : "alloy";
                        const audioUrl = await w.mediaHandler.convertTextToSpeech(fullResponse, selectedVoice);
                        new Audio(audioUrl).play();
                    } catch (ttsError) {
                        console.error("TTS error:", ttsError);
                    }
                }

                assistantMessageElement.innerHTML = renderMarkdownWithLineBreaks(fullResponse, outputFormat);
                continueConversation = false;
            }
        }

        w.conversationHistory.save(historyMessage, fullResponse, w.currentImageData);
        return fullResponse;
    }

    // ==================== OPENAI ====================

    async _callOpenAI(connection, apiKey, message, conversationElement, assistantMessageElement, temperature, top_p, outputFormat) {
        const w = this.widget;

        // Safety net: redirect local: models that accidentally reached _callOpenAI
        if (getApiType(w.chatGPTOptions.model) === 'local') {
            console.warn('[WikiSage] _callOpenAI received a local model — redirecting to _callLocal');
            return await this._callLocal(connection, apiKey, message, conversationElement, temperature, top_p, outputFormat);
        }

        const messages = [];
        const formatInstruction = getFormatInstruction(outputFormat);

        const currentDate = new Date().toLocaleString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
        });
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const userInstructions = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/User-instructions", "").trim();

        messages.push({
            role: "system",
            content: w.systemMessage + "\n\n" + "The user has instructed:" + userInstructions + "\n\n" + "The user's timezone is " + timeZone + " and the current time is " + currentDate + formatInstruction
        });

        messages.push(...w.conversationHistory.get());

        // Handle transclusions
        const { processedMessage, transcludedContents } = processTransclusions(message, 'openai');

        messages.push({
            role: "user",
            content: [{ type: "text", text: processedMessage }, ...transcludedContents]
        });

        if (w.currentImageData) {
            messages[messages.length - 1].content.push({
                type: "image_url",
                image_url: { url: `data:${w.currentImageData.type};base64,${w.currentImageData.text}` }
            });
        }

        if (w.currentPDFData) {
            w.chatGPTOptions.model = "claude-3-5-sonnet-20241022";
            messages[messages.length - 1].content.push({
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: w.currentPDFData.text }
            });
        }

        assistantMessageElement.innerHTML = "Processing...";

        const openAIFunctions = getOpenAIFunctions(['scrapeWebPage']);

        const makeApiCall = async (msgs) => {
            const { useAdversarialValidation, ...apiOptions } = w.chatGPTOptions;

            const normalizeForOpenAI = (msg) => {
                const content = msg.content;
                if (typeof content === 'string') return content;
                if (Array.isArray(content)) return content.map(c => (c && (c.text || c.content)) || (typeof c === 'string' ? c : '')).join('\n');
                if (content && typeof content === 'object') {
                    if (content.text) return content.text;
                    if (content.content) return content.content;
                    if (Array.isArray(content.parts)) return content.parts.join('\n');
                    return JSON.stringify(content);
                }
                return String(content || '');
            };

            const openAIMessages = (msgs || []).map(m => {
                const normalized = { role: m.role, content: normalizeForOpenAI(m) };
                if (m.name) normalized.name = m.name;
                if (m.function_call) normalized.function_call = m.function_call;
                return normalized;
            });

            const payloadOptions = { ...apiOptions };
            if (payloadOptions.model && typeof payloadOptions.model === 'string' && payloadOptions.model.toLowerCase().startsWith('gpt-5')) {
                delete payloadOptions.temperature;
                if (payloadOptions.max_tokens) {
                    payloadOptions.max_completion_tokens = payloadOptions.max_tokens;
                    delete payloadOptions.max_tokens;
                }
            }

            const response = await connection.fetch(CHAT_COMPLETION_URL, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payloadOptions,
                    messages: openAIMessages,
                    functions: openAIFunctions,
                    function_call: "auto"
                })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        };

        let fullResponse = "";
        let continueConversation = true;

        while (continueConversation) {
            const apiResponse = await makeApiCall(messages);
            if (!apiResponse || apiResponse.error) throw new Error(apiResponse?.error?.message || 'Invalid API response');

            const choice = apiResponse.choices[0];

            if (choice.finish_reason === "function_call") {
                const functionCall = choice.message.function_call;
                let functionResult = await this._handleOpenAIFunctionCall(functionCall, apiKey, w);

                messages.push({ role: "assistant", content: null, function_call: { name: functionCall.name, arguments: functionCall.arguments } });
                messages.push({ role: "function", name: functionCall.name, content: functionResult });
            } else {
                fullResponse += choice.message.content;

                if (w.enableTTS) {
                    try {
                        const voiceSelect = w.domNodes[0].querySelector(".tts-voice-select");
                        const selectedVoice = voiceSelect ? voiceSelect.value : "alloy";
                        const audioUrl = await w.mediaHandler.convertTextToSpeech(fullResponse, selectedVoice);
                        new Audio(audioUrl).play();
                    } catch (ttsError) {
                        console.error("TTS error:", ttsError);
                    }
                }

                assistantMessageElement.innerHTML = renderMarkdownWithLineBreaks(fullResponse, outputFormat);
                continueConversation = false;
            }
        }

        w.conversationHistory.save(message, fullResponse, w.currentImageData);
        return fullResponse;
    }

    // ==================== LOCAL LLM ====================

    async _callLocal(connection, apiKey, message, conversationElement, temperature, top_p, outputFormat) {
        const w = this.widget;
        const localUrl = getLocalChatCompletionUrl();
        if (!localUrl) {
            throw new Error("Local LLM URL is not configured. Set it in $:/plugins/NoteStreams/WikiSage/local-llm-url");
        }

        const messages = [];
        const formatInstruction = getFormatInstruction(outputFormat);

        const currentDate = new Date().toLocaleString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
        });
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Use simplified system prompt for local models (no tool definitions)
        const localSystemPrompt = $tw.wiki.getTiddlerText(
            "$:/plugins/NoteStreams/WikiSage/local-system-prompt",
            "You are a helpful assistant. Answer concisely."
        );

        messages.push({
            role: "system",
            content: localSystemPrompt + "\n\nThe user's timezone is " + timeZone + " and the current time is " + currentDate + formatInstruction
        });

        messages.push(...w.conversationHistory.get());

        // Handle transclusions
        const { processedMessage, transcludedContents } = processTransclusions(message, 'openai');

        messages.push({
            role: "user",
            content: [{ type: "text", text: processedMessage }, ...transcludedContents]
        });

        if (w.currentImageData) {
            messages[messages.length - 1].content.push({
                type: "image_url",
                image_url: { url: `data:${w.currentImageData.type};base64,${w.currentImageData.text}` }
            });
        }

        const assistantMessageElement = conversationElement.querySelector(".chatgpt-conversation-assistant");
        assistantMessageElement.innerHTML = "Processing...";

        // Local models: no tool definitions sent (simplified prompt, no function calling)

        const localModel = getLocalModelName(w.chatGPTOptions.model);

        const normalizeForOpenAI = (msg) => {
            const content = msg.content;
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) return content.map(c => (c && (c.text || c.content)) || (typeof c === 'string' ? c : '')).join('\n');
            if (content && typeof content === 'object') {
                if (content.text) return content.text;
                if (content.content) return content.content;
                if (Array.isArray(content.parts)) return content.parts.join('\n');
                return JSON.stringify(content);
            }
            return String(content || '');
        };

        const makeLocalApiCall = async (msgs) => {
            const openAIMessages = (msgs || []).map(m => {
                const normalized = { role: m.role, content: normalizeForOpenAI(m) };
                if (m.name) normalized.name = m.name;
                if (m.function_call) normalized.function_call = m.function_call;
                return normalized;
            });

            const headers = { "Content-Type": "application/json" };
            if (apiKey) {
                headers["Authorization"] = `Bearer ${apiKey}`;
            }

            const payload = {
                model: localModel,
                messages: openAIMessages,
                temperature: temperature,
                top_p: top_p
            };

            const response = await connection.fetch(localUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        };

        let fullResponse = "";
        let continueConversation = true;

        while (continueConversation) {
            const apiResponse = await makeLocalApiCall(messages);
            if (!apiResponse || apiResponse.error) throw new Error(apiResponse?.error?.message || 'Invalid API response');

            const choice = apiResponse.choices[0];

            // Local models: extract content directly, no tool-call handling
            {
                fullResponse += (choice.message && choice.message.content) || '';

                if (w.enableTTS) {
                    try {
                        const voiceSelect = w.domNodes[0].querySelector(".tts-voice-select");
                        const selectedVoice = voiceSelect ? voiceSelect.value : "alloy";
                        const audioUrl = await w.mediaHandler.convertTextToSpeech(fullResponse, selectedVoice);
                        new Audio(audioUrl).play();
                    } catch (ttsError) {
                        console.error("TTS error:", ttsError);
                    }
                }

                assistantMessageElement.innerHTML = renderMarkdownWithLineBreaks(fullResponse, outputFormat);
                continueConversation = false;
            }
        }

        w.conversationHistory.save(message, fullResponse, w.currentImageData);
        return fullResponse;
    }

    /**
     * Handle an OpenAI function call by dispatching to the appropriate tool.
     */
    async _handleOpenAIFunctionCall(functionCall, apiKey, w) {
        const name = functionCall.name;
        const args = JSON.parse(functionCall.arguments);

        switch (name) {
            case "getAllTiddlerTitles":
                return w.tiddlerOps.getAllTiddlerTitles().join(", ");
            case "searchTiddlerContent":
                return JSON.stringify(w.tiddlerOps.searchTiddlerContent(args.query, args.excludeTags), null, 2);
            case "getTiddlerContent":
                return w.tiddlerOps.getTiddlerContent(args.title);
            case "searchTiddlersByTag":
                return JSON.stringify(w.tiddlerOps.searchTiddlersByTag(args.tag), null, 2);
            case "getTiddlerFields": {
                const result = w.tiddlerOps.getTiddlerFields(args.title);
                return JSON.stringify(result);
            }
            case "searchTiddlersByField":
                return JSON.stringify(w.tiddlerOps.searchTiddlersByField(args.fieldName, args.fieldValue), null, 2);
            case "addSystemReference":
                return `Note added successfully. Note ID: ${w.tiddlerOps.addSystemReference(args.note)}`;
            case "getSystemReference":
                return w.tiddlerOps.getSystemReference();
            case "reviseSystemReference":
                w.tiddlerOps.reviseSystemReference(args.noteId, args.revisedNote);
                return "Note revised successfully.";
            case "createTiddler":
                return await w.executeAction("createTiddler", args);
            case "modifyTiddler":
                return await w.executeAction("modifyTiddler", args);
            case "renameTiddler":
                return await w.executeAction("renameTiddler", args);
            case "openTiddler":
                return (await w.verifyAction("openTiddler", args)).result || "Failed";
            case "closeTiddler":
                return (await w.verifyAction("closeTiddler", args)).result || "Failed";
            case "exportTiddlers": {
                try {
                    return w.tiddlerOps.exportTiddlers(args.exportFilter, args.baseFilename, args.format);
                } catch (error) {
                    return `Export failed: ${error.message}`;
                }
            }
            case "generateImage": {
                const resp = await fetch("https://api.openai.com/v1/images/generations", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ model: "dall-e-3", prompt: args.prompt, n: 1, size: args.size || "1024x1024", response_format: "url" })
                });
                if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
                const imageData = await resp.json();
                return `<img src="${imageData.data[0].url}" alt="Generated image" style="max-width: 100%; height: auto;"/>`;
            }
            default:
                return `Unknown function: ${name}`;
        }
    }
}

exports.ApiHandler = ApiHandler;
