/*\
created: 20260302000000000
title: $:/plugins/NoteStreams/WikiSage/utils.js
tags:
type: application/javascript
module-type: library

Shared constants and utility functions for WikiSage
\*/

"use strict";

const CHAT_COMPLETION_URL = "https://api.openai.com/v1/chat/completions";
const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Runtime safeguard: wrap `fetch` to sanitize OpenAI chat/completions POST payloads
// This helps remove unsupported params (like `temperature`) for gpt-5 family models
function installFetchSanitizer() {
    if (typeof window !== 'undefined' && window.fetch) {
        const _origFetch = window.fetch.bind(window);
        window.fetch = async function(input, init) {
            try {
                const url = (typeof input === 'string') ? input : (input && input.url);
                if (typeof url === 'string' && url.indexOf('/v1/chat/completions') !== -1 && init && init.method && init.method.toUpperCase() === 'POST' && init.body) {
                    try {
                        const headers = init.headers || {};
                        const contentType = headers['Content-Type'] || headers['content-type'] || '';
                        if (contentType.indexOf('application/json') !== -1) {
                            const bodyObj = JSON.parse(init.body);
                            if (bodyObj && bodyObj.model && typeof bodyObj.model === 'string' && bodyObj.model.toLowerCase().startsWith('gpt-5')) {
                                delete bodyObj.temperature;
                                if (bodyObj.max_tokens) {
                                    bodyObj.max_completion_tokens = bodyObj.max_tokens;
                                    delete bodyObj.max_tokens;
                                }
                            }
                            init = Object.assign({}, init, { body: JSON.stringify(bodyObj) });
                        }
                    } catch (e) {
                        console.warn('[WikiSage] Failed to sanitize OpenAI payload:', e);
                    }
                }
            } catch (e) {
                console.warn('[WikiSage] fetch wrapper error:', e);
            }
            return _origFetch(input, init);
        };
    }
}

// Gemini endpoint template for consumer API
function getGeminiApiUrl(model) {
    const safeModel = (typeof model === 'string' && model.trim()) ? model.trim() : 'gemini-pro';
    return `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent`;
}

// Helper: extract textual content from various OpenAI response formats
function extractOpenAIText(data) {
    if (!data) return "";
    try {
        // Chat completions style
        const choice = data.choices && data.choices[0];
        if (choice) {
            const msg = choice.message || choice;
            if (msg) {
                const cont = msg.content;
                if (typeof cont === 'string') return cont;
                if (Array.isArray(cont)) return cont.map(c => (c && (c.text || c.content)) || '').join('\n');
                if (cont && typeof cont === 'object') {
                    if (cont.text) return cont.text;
                    if (cont.parts) return cont.parts.join('\n');
                }
            }
            if (choice.text) return choice.text;
        }

        // Responses API / unified output
        if (Array.isArray(data.output)) {
            for (const out of data.output) {
                if (!out || !out.content) continue;
                for (const c of out.content) {
                    if (!c) continue;
                    if (typeof c === 'string') return c;
                    if (c.text) return c.text;
                    if (c.output_text) return c.output_text;
                    if (c.parts) return c.parts.join('\n');
                }
            }
        }

        // Some SDKs return results array
        if (Array.isArray(data.results) && data.results[0] && data.results[0].content) {
            const c = data.results[0].content[0];
            if (c) return c.text || c.output_text || (Array.isArray(c.parts) ? c.parts.join('\n') : '');
        }

        if (data.output_text) return data.output_text;
    } catch (e) {
        console.warn('[WikiSage] extractOpenAIText error', e);
    }
    return "";
}

// Render text as HTML using TiddlyWiki's rendering engine
function renderMarkdownWithLineBreaks(text, format) {
    format = format || "wikitext";
    if (format === "markdown") {
        try {
            if ($tw.wiki.parseText && $tw.wiki.getTextFromTiddlerWithTags) {
                return $tw.wiki.renderText("text/html", "text/x-markdown", text);
            }
        } catch(e) {
            // fallback
        }
        return basicMarkdownToHtml(text);
    } else {
        return $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", text);
    }
}

function basicMarkdownToHtml(text) {
    return text
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
        .replace(/\n/g, '<br/>');
}

// Detect API type from model name
function getApiType(model) {
    if (typeof model === 'string' && model.toLowerCase().startsWith('gemini')) {
        return 'gemini';
    }
    if (typeof model === 'string' && model.toLowerCase().startsWith('claude')) {
        return 'anthropic';
    }
    if (typeof model === 'string' && model.toLowerCase().startsWith('local:')) {
        return 'local';
    }
    return 'openai';
}

// Get the chat completion URL for a local LLM provider
function getLocalChatCompletionUrl() {
    const baseUrl = ($tw.wiki.getTiddlerText(
        "$:/plugins/NoteStreams/WikiSage/local-llm-url", ""
    ) || "").trim().replace(/\/+$/, '');
    if (!baseUrl) return null;
    return baseUrl + '/v1/chat/completions';
}

// Strip the 'local:' prefix from a model name
function getLocalModelName(model) {
    if (typeof model === 'string' && model.toLowerCase().startsWith('local:')) {
        return model.substring(6);
    }
    return model;
}

// Build format instruction string
function getFormatInstruction(outputFormat) {
    return outputFormat === "markdown" ?
        "\n\nIMPORTANT: Format your response using Markdown syntax (not TiddlyWiki wikitext). Use # for headers, **bold**, *italic*, `code`, ```code blocks```, - for lists, etc." :
        "\n\nIMPORTANT: Format your response using TiddlyWiki wikitext syntax. Use ! for headers, ''bold'', //italic//, {{{code}}}, ```code blocks```, * for lists, etc.";
}

// Process transclusions in a message - returns { processedMessage, transcludedContents }
function processTransclusions(message, contentFormat) {
    const transclusionPattern = /{{([^}]+)}}/g;
    let match;
    let processedMessage = message;
    const transcludedContents = [];

    while ((match = transclusionPattern.exec(message)) !== null) {
        const tiddlerTitle = match[1];
        const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
        if (tiddler) {
            if (tiddler.fields.type && tiddler.fields.type.startsWith("image/")) {
                if (contentFormat === 'anthropic') {
                    transcludedContents.push({
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: tiddler.fields.type,
                            data: tiddler.fields.text
                        }
                    });
                } else {
                    transcludedContents.push({
                        type: "image_url",
                        image_url: {
                            url: `data:${tiddler.fields.type};base64,${tiddler.fields.text}`
                        }
                    });
                }
            } else if (tiddler.fields.type === "application/pdf") {
                transcludedContents.push({
                    type: "document",
                    source: {
                        type: "base64",
                        media_type: "application/pdf",
                        data: tiddler.fields.text
                    }
                });
            } else {
                const content = tiddler.fields.text || "";
                transcludedContents.push({
                    type: "text",
                    text: content
                });

                // Check for stream-list field and include its contents
                const streamList = tiddler.fields['stream-list'];
                if (streamList) {
                    const streamTitles = (streamList.match(/\[\[([^\]]+)\]\]|(\S+)/g) || [])
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
            processedMessage = processedMessage.replace(match[0], "");
        }
    }

    return { processedMessage, transcludedContents };
}

exports.CHAT_COMPLETION_URL = CHAT_COMPLETION_URL;
exports.WHISPER_API_URL = WHISPER_API_URL;
exports.ANTHROPIC_API_URL = ANTHROPIC_API_URL;
exports.installFetchSanitizer = installFetchSanitizer;
exports.getGeminiApiUrl = getGeminiApiUrl;
exports.extractOpenAIText = extractOpenAIText;
exports.renderMarkdownWithLineBreaks = renderMarkdownWithLineBreaks;
exports.basicMarkdownToHtml = basicMarkdownToHtml;
exports.getApiType = getApiType;
exports.getLocalChatCompletionUrl = getLocalChatCompletionUrl;
exports.getLocalModelName = getLocalModelName;
exports.getFormatInstruction = getFormatInstruction;
exports.processTransclusions = processTransclusions;
