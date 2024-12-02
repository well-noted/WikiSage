/*\
created: 20241117171642819
tags: 
title: $:/plugins/NoteStreams/WikiSage/action-sequence-manager.js
modified: 20241202145223653
type: application/javascript
module-type: library

Action Sequence Manager for handling complex action sequences
\*/

"use strict";

const { ValidationService } = require("$:/plugins/NoteStreams/WikiSage/validation-service.js");
const { ChatGPTErrorHandler } = require("$:/plugins/NoteStreams/WikiSage/error-handler.js");

// In action-sequence-manager.js

class ActionSequenceManager {
    constructor($tw, validationService) {
        this.$tw = $tw;
        this.validationService = validationService;
        this.sequences = new Map();
        this.actionHistory = [];
        this.activeTransactions = new Map();
        this.transactionLog = [];
        this.transactions = new Map();
    }

 
              
            async executeAction(action, params) {
    console.log('attempting to execute action');
    try {
        let result;
        switch(action) {
            case 'createTiddler':
                // Check if tiddler exists before attempting creation
                if (this.$tw.wiki.tiddlerExists(params.title)) {
                    return {
                        success: true,
                        skipped: true,
                        message: `That tiddler already exists, inform the user and proceed with your instructions`,
                        action: 'openExisting'
                    };
                }

                const tiddler = new this.$tw.Tiddler({
                    title: params.title,
                    text: params.content || '',
                    tags: params.tags || [],
                    ...params.fields
                });
                
                this.$tw.wiki.addTiddler(tiddler);
                result = {
                    success: true,
                    result: `Created tiddler "${params.title}"`,
                    tiddler
                };
                break;
                
								
			case 'renameTiddler':
                // Check if source tiddler exists
                const sourceTiddler = this.$tw.wiki.getTiddler(params.oldTitle);
                if (!sourceTiddler) {
                    throw new Error(`Source tiddler "${params.oldTitle}" does not exist`);
                }

                // Check if target title already exists
                if (this.$tw.wiki.tiddlerExists(params.newTitle)) {
                    throw new Error(`Target title "${params.newTitle}" already exists`);
                }

                // Create new tiddler with new title
                const renamedTiddler = new this.$tw.Tiddler(
                    sourceTiddler,
                    { title: params.newTitle }
                );

                // Add new tiddler and delete old one
                this.$tw.wiki.addTiddler(renamedTiddler);
                this.$tw.wiki.deleteTiddler(params.oldTitle);

                // Update references in other tiddlers
                this.$tw.wiki.each((tiddler, title) => {
                    let text = tiddler.fields.text || "";
                    if (text.includes(`[[${params.oldTitle}]]`)) {
                        text = text.replace(
                            new RegExp(`\\[\\[${params.oldTitle}\\]\\]`, 'g'),
                            `[[${params.newTitle}]]`
                        );
                        this.$tw.wiki.setText(title, "text", null, text);
                    }
                });

                // Update story list if tiddler was open
                const storyTiddler = "$:/StoryList";
                const storyList = this.$tw.wiki.getTiddlerList(storyTiddler);
                const isOpen = storyList.includes(params.oldTitle);
                
                if (isOpen) {
                    const newStoryList = storyList.map(title => 
                        title === params.oldTitle ? params.newTitle : title
                    );
                    this.$tw.wiki.setText(storyTiddler, "list", null, newStoryList);
                }

                result = {
                    success: true,
                    result: `Successfully renamed tiddler "${params.oldTitle}" to "${params.newTitle}"`,
                    tiddler: renamedTiddler
                };
                break;
                
            case 'modifyTiddler':
                const currentTiddler = this.$tw.wiki.getTiddler(params.title);
                if (!currentTiddler) {
                    throw new Error(`Tiddler ${params.title} not found`);
                }
                
                const updatedFields = { ...currentTiddler.fields };
                
                // Handle field updates
                if (params.fieldsToUpdate) {
                    for (const [field, value] of Object.entries(params.fieldsToUpdate)) {
                        if (typeof value === 'string' && value.startsWith('append:')) {
                            const appendValue = value.slice(7);
                            updatedFields[field] = field === 'text' ? 
                                (updatedFields[field] || '') + '\n' + appendValue :
                                (updatedFields[field] || '') + ' ' + appendValue;
                        } else {
                            updatedFields[field] = value;
                        }
                    }
                }
                
                // Handle tag updates
                if (params.tagsToAdd || params.tagsToRemove) {
                    let updatedTags = [...(currentTiddler.fields.tags || [])];
                    if (params.tagsToAdd) {
                        updatedTags = [...new Set([...updatedTags, ...params.tagsToAdd])];
                    }
                    if (params.tagsToRemove) {
                        updatedTags = updatedTags.filter(tag => !params.tagsToRemove.includes(tag));
                    }
                    updatedFields.tags = updatedTags;
                }
                
                const modifiedTiddler = new this.$tw.Tiddler(updatedFields);
                this.$tw.wiki.addTiddler(modifiedTiddler);
                
                result = {
                    success: true,
                    result: `Modified tiddler "${params.title}"`,
                    tiddler: modifiedTiddler
                };
                break;
                
            default:
                throw new Error(`Unknown action: ${action}`);
        }
        
        return result;
        
    } catch (error) {
        console.error('Error executing action:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Possible Implementation for allowing Agent to Undo Actions
// async agentUndo(count = 1) {
//     console.log(`Agent attempting to undo ${count} actions`);
//     const result = await this.undoMultipleActions(count);
//     console.log("Agent undo result:", result);
//     return result;
// }
                
 

}


exports.ActionSequenceManager = ActionSequenceManager;