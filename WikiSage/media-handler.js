/*\
created: 20260302000000000
title: $:/plugins/NoteStreams/WikiSage/media-handler.js
tags:
type: application/javascript
module-type: library

Media handling for WikiSage: audio transcription, TTS, PDF, web scraping
\*/

"use strict";

const { ANTHROPIC_API_URL } = require("$:/plugins/NoteStreams/WikiSage/utils.js");

class MediaHandler {

    /**
     * @param {Object} deps
     * @param {Object} deps.connectionPool - ConnectionPool instance
     * @param {Function} deps.getApiKey - Function(type) returning API key string
     * @param {Object} deps.anthropicConfig - { apiKey, maxTokens }
     */
    constructor(deps) {
        this.connectionPool = deps.connectionPool;
        this.getApiKey = deps.getApiKey;
        this.anthropicConfig = deps.anthropicConfig;
    }

    async transcribeAudio(audioData, options) {
        let connection;
        options = options || {};
        try {
            connection = await this.connectionPool.acquire();

            const formData = new FormData();
            const audioFile = new File([audioData], "audio.wav", {
                type: "audio/wav"
            });

            formData.append("file", audioFile);
            formData.append("model", "whisper-1");

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

    async convertTextToSpeech(text, voice) {
        voice = voice || "alloy";
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

    async handlePDF(pdfData) {
        let connection;
        try {
            connection = await this.connectionPool.acquire();

            const formData = new FormData();
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

    async scrapeWebPage(url) {
        let connection;
        try {
            connection = await this.connectionPool.acquire();

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
}

exports.MediaHandler = MediaHandler;
