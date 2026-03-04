/*\
created: 20260302000000000
title: $:/plugins/NoteStreams/WikiSage/tool-definitions.js
tags:
type: application/javascript
module-type: library

Canonical tool/function definitions for WikiSage AI providers.
Single source of truth - converts to OpenAI, Anthropic, and Gemini formats.
\*/

"use strict";

/**
 * Canonical tool definitions in a neutral format.
 * Each tool has: name, description, parameters (JSON Schema), required (array of required param names)
 */
const TOOL_DEFINITIONS = [
    {
        name: "getAllTiddlerTitles",
        description: "Get a list of all tiddler titles in the TiddlyWiki",
        parameters: {
            type: "object",
            properties: {}
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
        name: "exportTiddlers",
        description: "Export tiddlers in a specified format",
        parameters: {
            type: "object",
            properties: {
                exportFilter: { type: "string", description: "Filter expression to select tiddlers for export" },
                baseFilename: { type: "string", description: "Base filename for the export (default: 'tiddlers')" },
                format: { type: "string", enum: ["JSON", "CSV", "HTML", "TID"], description: "Export format (JSON, CSV, HTML, or TID)", default: "JSON" }
            },
            required: ["exportFilter"]
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
        parameters: {
            type: "object",
            properties: {}
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
        name: "undoActions",
        description: "Undo a specified number of recent actions",
        parameters: {
            type: "object",
            properties: {
                count: { type: "integer", description: "Number of actions to undo (default: 1)" }
            }
        }
    },
    {
        name: "scrapeWebPage",
        description: "Scrape content from a webpage URL",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The URL of the webpage to scrape" }
            },
            required: ["url"]
        }
    }
];

/**
 * Get tool definitions in OpenAI functions format.
 * @param {string[]} [exclude] - Tool names to exclude
 * @returns {Array} OpenAI-compatible functions array
 */
function getOpenAIFunctions(exclude) {
    const excludeSet = new Set(exclude || []);
    return TOOL_DEFINITIONS
        .filter(t => !excludeSet.has(t.name))
        .map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));
}

/**
 * Get tool definitions in Anthropic tools format.
 * @param {string[]} [exclude] - Tool names to exclude
 * @returns {Array} Anthropic-compatible tools array
 */
function getAnthropicTools(exclude) {
    const excludeSet = new Set(exclude || []);
    return TOOL_DEFINITIONS
        .filter(t => !excludeSet.has(t.name))
        .map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters
        }));
}

/**
 * Get tool definitions in Gemini function_declarations format.
 * @param {string[]} [exclude] - Tool names to exclude
 * @returns {Array} Gemini-compatible tools array (wrapped in function_declarations)
 */
function getGeminiTools(exclude) {
    const excludeSet = new Set(exclude || []);
    const declarations = TOOL_DEFINITIONS
        .filter(t => !excludeSet.has(t.name))
        .map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));
    return [{ function_declarations: declarations }];
}

exports.TOOL_DEFINITIONS = TOOL_DEFINITIONS;
exports.getOpenAIFunctions = getOpenAIFunctions;
exports.getAnthropicTools = getAnthropicTools;
exports.getGeminiTools = getGeminiTools;
