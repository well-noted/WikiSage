/*\
created: 20260302000000000
title: $:/plugins/NoteStreams/WikiSage/macros.js
tags:
type: application/javascript
module-type: library

WikiSage TiddlyWiki macros: clarify-content, yadda-yadda, auto-summary, fix-style, beautify-tiddler
\*/

"use strict";

const { CHAT_COMPLETION_URL, extractOpenAIText } = require("$:/plugins/NoteStreams/WikiSage/utils.js");

// ===== clarify-content =====
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
                model: "gpt-4.1-nano",
                messages: [{ role: "system", content: fullMessage }]
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                let editedContent = extractOpenAIText(data);
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

// ===== clarify-content-streams =====
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
                model: "gpt-4.1-nano",
                messages: [{ role: "system", content: fullMessage }]
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                let editedContent = extractOpenAIText(data);
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

// ===== yadda-yadda =====
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
                model: "gpt-4.1-nano",
                messages: [{ role: "system", content: fullMessage }]
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                let appendedContent = extractOpenAIText(data);
                appendedContent = appendedContent.replace("You are trained on data up to October 2023.", "").trim();

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

// ===== yadda-yadda-streams =====
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
                model: "gpt-4.1-nano",
                messages: [{ role: "system", content: fullMessage }]
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error.message || "Unknown API error.");
                }

                let appendedContent = extractOpenAIText(data);
                appendedContent = appendedContent.replace("You are trained on data up to October 2023.", "").trim();

                const newContent = tiddlerContent + " " + appendedContent;

                $tw.wiki.addTiddler(new $tw.Tiddler(
                    $tw.wiki.getTiddler(currentTiddler),
                    { text: newContent }
                ));

                $tw.wiki.addTiddler(new $tw.Tiddler({
                    title: "$:/state/sq/streams/caret-position",
                    text: newContent.length.toString()
                }));

                $tw.wiki.deleteTiddler(rowEditStateTitle);
                $tw.rootWidget.dispatchEvent({ type: "tm-auto-save-wiki" });

                setTimeout(() => {
                    $tw.wiki.addTiddler(new $tw.Tiddler({
                        title: rowEditStateTitle,
                        text: currentTiddler
                    }));
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

// ===== auto-summary =====
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
        const tiddlerObj = $tw.wiki.getTiddler(currentTiddler);
        if (!tiddlerObj) {
            $tw.notifier.display("$:/core/ui/Notifications/error", {
                message: `Error: Tiddler '${currentTiddler}' not found.`
            });
            return "";
        }
        const fields = { ...tiddlerObj.fields };
        delete fields["AI-summary"];

        // Resolve transclusions in fields
        const transclusionPattern = /{{([^}]+)}}/g;
        let match;

        const resolveTransclusionsInString = (inputText) => {
            if (typeof inputText !== 'string' || inputText.length === 0) return inputText;
            let processed = inputText;
            const transcludedContents = [];
            while ((match = transclusionPattern.exec(inputText)) !== null) {
                const tiddlerTitle = match[1];
                const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
                if (tiddler) {
                    if (tiddler.fields.type && tiddler.fields.type.startsWith("image/")) {
                        transcludedContents.push({ type: 'image', image_url: { url: `data:${tiddler.fields.type};base64,${tiddler.fields.text}` } });
                    } else if (tiddler.fields.type === 'application/pdf') {
                        transcludedContents.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: tiddler.fields.text } });
                    } else {
                        const content = tiddler.fields.text || "";
                        transcludedContents.push({ type: 'text', text: content });
                        const streamList = tiddler.fields['stream-list'];
                        if (streamList) {
                            const streamTitles = (streamList.match(/\[\[([^\]]+)\]\]|(\S+)/g) || [])
                                .map(title => title.replace(/^\[\[|\]\]$/g, '').trim());
                            streamTitles.forEach(streamTitle => {
                                const streamTiddler = $tw.wiki.getTiddler(streamTitle);
                                if (streamTiddler) {
                                    transcludedContents.push({ type: 'text', text: `Content from ${streamTitle}: ${streamTiddler.fields.text || ""}` });
                                }
                            });
                        }
                    }
                    processed = processed.replace(match[0], "");
                }
            }
            // Also handle widget-style transclusions
            const transcludeWidgetPattern = /<\$transclude\b[^>]*\btiddler\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*\/?>/g;
            let widgetMatch;
            while ((widgetMatch = transcludeWidgetPattern.exec(inputText)) !== null) {
                const tiddlerTitle = widgetMatch[1] || widgetMatch[2];
                const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
                if (tiddler) {
                    if (tiddler.fields.type && tiddler.fields.type.startsWith("image/")) {
                        transcludedContents.push({ type: 'image', image_url: { url: `data:${tiddler.fields.type};base64,${tiddler.fields.text}` } });
                    } else if (tiddler.fields.type === 'application/pdf') {
                        transcludedContents.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: tiddler.fields.text } });
                    } else {
                        transcludedContents.push({ type: 'text', text: tiddler.fields.text || "" });
                    }
                    processed = processed.replace(widgetMatch[0], "");
                }
            }
            if (transcludedContents.length > 0) {
                processed += "\n\n" + transcludedContents.map(tc => {
                    if (tc.type === 'text') return tc.text;
                    if (tc.type === 'image') return `[Image: ${tc.image_url && tc.image_url.url ? tc.image_url.url : 'image'}]`;
                    if (tc.type === 'document') return `[Document embedded: ${tc.source && tc.source.media_type ? tc.source.media_type : 'document'}]`;
                    return '';
                }).join("\n\n");
            }
            return processed;
        };

        if (typeof fields.text === 'string') {
            fields.text = resolveTransclusionsInString(fields.text);
        }
        ["subtitle", "caption", "description"].forEach(fieldName => {
            if (fields[fieldName] && typeof fields[fieldName] === "string") {
                try {
                    fields[fieldName] = resolveTransclusionsInString(fields[fieldName]);
                } catch (e) {
                    console.warn(`[WikiSage][auto-summary] transclusion resolve failed for field ${fieldName}`, e);
                }
            }
        });
        if (typeof fields.text === 'string' && fields.text.length > 12000) {
            fields.text = fields.text.slice(0, 12000) + "\n...[truncated]";
        }

        const fieldPairs = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n");
        const prompt = `Summarize the following tiddler in 2-3 sentences for a human reader. Focus on the most important points, and ignore metadata fields.\n\n${fieldPairs}`;
        $tw.notifier.display("$:/core/ui/Notifications/save", {
            message: "Generating AI summary..."
        });

        const payload = {
            model: "gpt-4.1-nano",
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt }
            ],
            max_completion_tokens: 256
        };
        if (typeof payload.model === 'string' && payload.model.toLowerCase().startsWith('gpt-5')) {
            delete payload.temperature;
        }

        return fetch(CHAT_COMPLETION_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })
            .then(resp => resp.json())
            .then(data => {
                if (data.error) throw new Error(data.error.message || "Unknown API error.");
                let summary = extractOpenAIText(data).trim();

                if (!summary) {
                    try {
                        const choice = data.choices && data.choices[0];
                        if (choice) {
                            if (choice.message && choice.message.content) {
                                const cont = choice.message.content;
                                if (typeof cont === 'string') summary = cont;
                                else if (Array.isArray(cont)) summary = cont.map(c => (c && (c.text || c.content)) || '').join('\n');
                                else if (cont.text) summary = cont.text;
                            } else if (choice.content) {
                                const cont = choice.content;
                                if (typeof cont === 'string') summary = cont;
                                else if (Array.isArray(cont)) summary = cont.map(c => (c && (c.text || c.content)) || '').join('\n');
                            } else if (choice.text) {
                                summary = choice.text;
                            }
                        }
                        summary = (summary || data.output_text || '').toString();
                    } catch (e) {
                        console.warn('[WikiSage][auto-summary] fallback extraction failed', e);
                    }
                }

                if (!summary) {
                    console.warn('[WikiSage][auto-summary] summary empty, retrying with gpt-4.1-nano');
                    const fallbackPayload = Object.assign({}, payload, { model: 'gpt-4.1-nano' });
                    return fetch(CHAT_COMPLETION_URL, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${apiKey}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(fallbackPayload)
                    })
                    .then(resp2 => resp2.json())
                    .then(data2 => {
                        if (data2.error) throw new Error(data2.error.message || "Unknown API error.");
                        summary = extractOpenAIText(data2).trim();
                        if (!summary) throw new Error('Fallback model returned empty summary');
                        $tw.wiki.addTiddler(new $tw.Tiddler(
                            $tw.wiki.getTiddler(currentTiddler),
                            { "description": summary }
                        ));
                        $tw.notifier.display("$:/core/ui/Notifications/save", {
                            message: `AI summary added to '${currentTiddler}'.`
                        });
                    });
                }
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

// ===== fix-style =====
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
        const styledHtml = `<div style="padding: 18px; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 1.1em; line-height: 1.6; font-family: 'Segoe UI', Arial, sans-serif; color: #222; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">${text
                .replace(/\n/g, "<br>")
                .replace(/\s{2,}/g, " ")
            }</div>`;
        return styledHtml;
    }
};

// ===== beautify-tiddler =====
$tw.macros["beautify-tiddler"] = {
    params: [
        { name: "theme", default: "auto" }
    ],
    run: function (theme) {
        const currentTiddler = this.getVariable("currentTiddler");

        if (!currentTiddler) {
            $tw.notifier.display("$:/core/ui/Notifications/error", { message: "Error: No current tiddler found." });
            return "";
        }

        const tiddlerObj = $tw.wiki.getTiddler(currentTiddler);
        if (!tiddlerObj) {
            $tw.notifier.display("$:/core/ui/Notifications/error", { message: `Error: Tiddler '${currentTiddler}' not found.` });
            return "";
        }

        const apiKey = $tw.wiki.getTiddlerText("$:/plugins/NoteStreams/WikiSage/openai-api-key", "").trim();
        if (!apiKey) {
            $tw.notifier.display("$:/core/ui/Notifications/error", { message: "Please set your OpenAI API key in the plugin settings." });
            return "";
        }

        const text = tiddlerObj.fields.text || "";
        const title = tiddlerObj.fields.title || "";
        const tags = tiddlerObj.fields.tags || [];
        const contentPreview = text.length > 2000 ? text.substring(0, 2000) + "..." : text;
        const uniqueClassName = "beautified-tiddler-" + currentTiddler.replace(/[^\w]+/g, "-").toLowerCase();

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

        $tw.notifier.display("$:/core/ui/Notifications/save", { message: "Analyzing content and generating beautiful style..." });

        const predefinedThemes = {
            "sepia": {
                theme: "Sepia",
                description: "A warm, classic style for comfortable reading",
                colors: { background: "#f8f2e3", text: "#5f4b32", heading: "#7b6545", link: "#8e5e3d", codeBackground: "#f0e8d0", blockquoteBg: "#f0e8d0", blockquoteBorder: "#d8c8a8", accentColor: "#b09068" },
                fontPrimary: "Georgia, serif",
                fontSecondary: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
                specialFeatures: []
            },
            "dark": {
                theme: "Dark Mode",
                description: "A sleek dark theme that's easy on the eyes",
                colors: { background: "#2d2d2d", text: "#e0e0e0", heading: "#81a1c1", link: "#88c0d0", codeBackground: "#222222", blockquoteBg: "#383838", blockquoteBorder: "#555555", accentColor: "#5e81ac" },
                fontPrimary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
                fontSecondary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
                specialFeatures: []
            },
            "light": {
                theme: "Light Mode",
                description: "A clean, minimal light theme with good contrast",
                colors: { background: "#f9f9f9", text: "#333333", heading: "#2d5b8e", link: "#0077cc", codeBackground: "#f5f5f5", blockquoteBg: "#f0f4f8", blockquoteBorder: "#c8d6e5", accentColor: "#4a90e2" },
                fontPrimary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
                fontSecondary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
                specialFeatures: []
            }
        };

        // Helper to generate CSS from style data
        function generateCSS(styleData, uniqueClass) {
            const colors = styleData.colors;
            const specialFeatures = styleData.specialFeatures || [];
            let specialCSS = "";

            if (specialFeatures.includes("dropcaps")) {
                specialCSS += `\n.${uniqueClass} > p:first-of-type::first-letter { float: left; font-size: 3.5em; line-height: 0.8; font-family: ${styleData.fontSecondary || "Georgia, serif"}; margin-right: 0.1em; color: ${colors.accentColor}; padding: 0.1em; }`;
            }
            if (specialFeatures.includes("pullquotes")) {
                specialCSS += `\n.${uniqueClass} blockquote.pullquote { float: right; width: 30%; margin: 0.5em 0 0.5em 1em; padding: 1em; font-size: 1.2em; font-style: italic; color: ${colors.accentColor}; border-top: 2px solid ${colors.accentColor}; border-bottom: 2px solid ${colors.accentColor}; border-left: none; background: transparent; text-align: center; }`;
            }
            if (specialFeatures.includes("chapterDividers")) {
                specialCSS += `\n.${uniqueClass} hr { height: 30px; border: none; background-image: url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50 10 L40 0 L60 0 Z M25 10 L15 0 L35 0 Z M75 10 L65 0 L85 0 Z' fill='${colors.accentColor.replace("#", "%23")}' /%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: center; margin: 2em auto; }`;
            }

            return `<style>
/* Theme: ${styleData.theme} - ${styleData.description} */
.${uniqueClass} { max-width: 800px; margin: 20px auto; padding: 25px; background: ${colors.background}; border: 1px solid ${colors.blockquoteBorder || colors.accentColor}; border-radius: 8px; font-family: ${styleData.fontPrimary || "sans-serif"}; line-height: 1.6; color: ${colors.text}; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
.${uniqueClass} h1, .${uniqueClass} h2, .${uniqueClass} h3, .${uniqueClass} h4, .${uniqueClass} h5, .${uniqueClass} h6 { color: ${colors.heading}; margin-top: 1.5em; margin-bottom: 0.8em; font-weight: 600; line-height: 1.3; font-family: ${styleData.fontSecondary || styleData.fontPrimary || "Georgia, serif"}; }
.${uniqueClass} h1 { font-size: 2em; border-bottom: 1px solid ${colors.blockquoteBorder}; padding-bottom: 0.3em; }
.${uniqueClass} h2 { font-size: 1.75em; } .${uniqueClass} h3 { font-size: 1.5em; } .${uniqueClass} h4 { font-size: 1.25em; }
.${uniqueClass} p { margin: 1em 0; }
.${uniqueClass} ul, .${uniqueClass} ol { margin: 1em 0; padding-left: 2em; }
.${uniqueClass} li { margin: 0.5em 0; }
.${uniqueClass} blockquote { margin: 1em 0; padding: 1em; background: ${colors.blockquoteBg}; border-left: 4px solid ${colors.blockquoteBorder}; font-style: italic; }
.${uniqueClass} pre { background: ${colors.codeBackground}; border: 1px solid ${colors.blockquoteBorder}; border-radius: 4px; padding: 1em; overflow: auto; font-family: Consolas, Monaco, monospace; font-size: 0.9em; }
.${uniqueClass} code { background: ${colors.codeBackground}; border: 1px solid ${colors.blockquoteBorder}; border-radius: 3px; padding: 0.2em 0.4em; font-family: Consolas, Monaco, monospace; font-size: 0.9em; }
.${uniqueClass} table { border-collapse: collapse; width: 100%; margin: 1em 0; }
.${uniqueClass} th, .${uniqueClass} td { border: 1px solid ${colors.blockquoteBorder}; padding: 8px 12px; text-align: left; }
.${uniqueClass} th { background-color: ${colors.blockquoteBg}; }
.${uniqueClass} img { max-width: 100%; height: auto; display: block; margin: 1em auto; border-radius: 4px; }
.${uniqueClass} a { color: ${colors.link}; text-decoration: none; transition: color 0.2s ease; }
.${uniqueClass} a:hover { text-decoration: underline; color: ${colors.accentColor}; }
.${uniqueClass} hr { border: 0; border-top: 1px solid ${colors.blockquoteBorder}; margin: 2em 0; }
${specialCSS}
</style>
<div class="${uniqueClass}">`;
        }

        fetch(CHAT_COMPLETION_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4.1-nano",
                messages: [{ role: "system", content: prompt }],
                response_format: { type: "json_object" }
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) throw new Error(data.error.message || "Unknown API error.");

                let styleData;
                try {
                    styleData = JSON.parse(extractOpenAIText(data));
                } catch (e) {
                    throw new Error("Failed to parse AI style recommendation");
                }

                if (theme !== "auto" && predefinedThemes[theme]) {
                    styleData = predefinedThemes[theme];
                }

                const cssText = generateCSS(styleData, uniqueClassName);
                const renderedContent = $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", text);
                const updatedText = cssText + renderedContent + "</div>";

                $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerObj, { text: updatedText }));

                $tw.notifier.display("$:/core/ui/Notifications/save", { message: `Applied "${styleData.theme}" theme to tiddler` });
            })
            .catch(error => {
                console.error("Error in beautify-tiddler:", error);
                $tw.notifier.display("$:/core/ui/Notifications/error", { message: `Error generating style: ${error.message}` });

                // Fallback to sepia
                const fallbackStyleData = predefinedThemes["sepia"];
                const cssText = generateCSS(fallbackStyleData, uniqueClassName);
                const renderedContent = $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", text);
                const updatedText = cssText + renderedContent + "</div>";

                $tw.wiki.addTiddler(new $tw.Tiddler(tiddlerObj, { text: updatedText }));

                $tw.notifier.display("$:/core/ui/Notifications/save", { message: "Applied fallback sepia theme to tiddler" });
            });

        return "";
    }
};
