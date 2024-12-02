/*\
created: 20241116152819418
tags: 
title: $:/plugins/NoteStreams/WikiSage/conversation-history.js
modified: 20241202141514942
type: application/javascript
module-type: library

Conversation history management for WikiSage widget
\*/

(function(){

"use strict";

class ConversationHistory {
    constructor(wiki, tmpHistoryTiddler = null) {
        this.wiki = wiki;
        this.tmpHistoryTiddler = tmpHistoryTiddler || "$:/temp/NoteStreams/ChatGPT/history-" + Date.now();
        this.historyTiddler = this.tmpHistoryTiddler;
    }

    save(userMessage, assistantMessage, imageData = null) {
        let history = [];
        try {
            history = JSON.parse(this.wiki.getTiddlerText(this.historyTiddler) || "[]");
        } catch (error) {
            console.error("Error parsing conversation history:", error);
        }

        const entry = {
            id: Date.now().toString(),
            created: Date.now(),
            user: userMessage,
            assistant: this.processAssistantMessage(assistantMessage),
            isHTML: assistantMessage.includes("<img")
        };

        if (imageData) {
            entry.imageData = imageData;
        }

        history.push(entry);

        this.wiki.addTiddler(new $tw.Tiddler({
            title: this.historyTiddler,
            text: JSON.stringify(history)
        }));

        return entry;
    }

    get(limit = 5) {
    let history = [];
    try {
        history = JSON.parse(this.wiki.getTiddlerText(this.historyTiddler) || "[]");
    } catch (error) {
        console.error("Error parsing conversation history:", error);
    }

    const recentHistory = history.slice(-limit);
    return recentHistory.flatMap(entry => [
        { role: "user", content: entry.user },
        { role: "assistant", content: entry.assistant }
    ]);
}

    render(container, parentWidget) {
        let history = [];
        try {
            history = JSON.parse(this.wiki.getTiddlerText(this.historyTiddler) || "[]");
        } catch (error) {
            console.error("Error parsing conversation history:", error);
        }

        for (const entry of history) {
            const conversation = this.createConversationElement(entry, parentWidget);
            container.appendChild(conversation);
        }
    }

    clear() {
        this.wiki.deleteTiddler(this.historyTiddler);
    }

    setHistoryTiddler(tiddlerTitle) {
        this.historyTiddler = tiddlerTitle;
    }

    // Private helper methods
    processAssistantMessage(message) {
        return message.replace(
            /\[\[(.*?)\]\]/g,
            (match, title) => {
                const tiddler = this.wiki.getTiddler(title) || this.wiki.getTiddler(`$:/${title}`);
                if (tiddler) {
                    return `[[${tiddler.fields.title}]]`;
                }
                return match;
            }
        );
    }

    createConversationElement(entry, parentWidget) {
        const conversation = $tw.utils.domMaker("div", {
            class: "chatgpt-conversation"
        });

        // Create user message
        const userMessage = this.createMessageElement(entry.user, "user", parentWidget);
        if (entry.imageData) {
            this.appendImageToMessage(userMessage, entry.imageData);
        }
        conversation.appendChild(userMessage);

        // Create assistant message
        const assistantMessage = this.createMessageElement(entry.assistant, "assistant", parentWidget, entry.isHTML);
        conversation.appendChild(assistantMessage);

        return conversation;
    }

    createMessageElement(content, role, parentWidget, isHTML = false) {
        const messageElement = $tw.utils.domMaker("div", {
            class: `chatgpt-conversation-message chatgpt-conversation-${role}`
        });

        if (isHTML) {
            messageElement.innerHTML = content;
        } else {
            const parser = this.wiki.parseText("text/vnd.tiddlywiki", content);
            const widgetNode = this.wiki.makeWidget(parser, {
                document: document,
                parentWidget: parentWidget
            });
            const container = $tw.utils.domMaker("div");
            widgetNode.render(container, null);
            messageElement.appendChild(container);
        }

        return messageElement;
    }

    appendImageToMessage(messageElement, imageData) {
        const imageElement = document.createElement('img');
        imageElement.src = `data:${imageData.type};base64,${imageData.text}`;
        imageElement.style.maxWidth = '200px';
        imageElement.style.maxHeight = '200px';
        messageElement.appendChild(imageElement);
    }
}

exports.ConversationHistory = ConversationHistory;

})();