/*\
created: 20241116213623567
tags: 
title: $:/plugins/NoteStreams/WikiSage/validation-service.js
modified: 20241202145449280
type: application/javascript
module-type: library

Validation Service for WikiSage widget
\*/

"use strict";

const { ChatGPTErrorHandler } = require("$:/plugins/NoteStreams/WikiSage/error-handler.js");
const { ActionSequenceManager } = require("$:/plugins/NoteStreams/WikiSage/action-sequence-manager.js");

class ValidationService {
    constructor($tw) {
    this.$tw = $tw;
    this.errorHandler = new ChatGPTErrorHandler();
    this.verifyState = this.verifyState.bind(this);
    this.captureState = this.captureState.bind(this);
    this.transactions = new Map();
    this.actionManager = new ActionSequenceManager($tw);
}


// Helper method to check if a change was intended
async verifyState(previousState, currentState, intendedChanges) {
    try {
        console.log('Starting state verification...');
        console.log('Previous state:', previousState);
        console.log('Current state:', currentState);
        console.log('Intended changes:', intendedChanges);

        if (!previousState || !currentState) {
            const message = 'Invalid state objects provided';
            console.log(message);
            return {
                success: false,
                error: message,
                notification: {
                    type: 'error',
                    message: message,
                    details: 'Previous or current state is missing'
                }
            };
        }

        const differences = [];
        const validationMessages = [];
        const successMessages = [];
        let operationsFailed = false;
        
        // Compare tiddler states
        for (const [title, prevState] of Object.entries(previousState.tiddlers)) {
            console.log(`Checking tiddler: ${title}`);
            const currentTiddlerState = currentState.tiddlers[title];
            
            if (!currentTiddlerState) {
                console.log(`Tiddler ${title} is missing in current state`);
                if (!intendedChanges?.deletions?.includes(title)) {
                    operationsFailed = true;
                    validationMessages.push({
                        type: 'UNINTENDED_DELETION',
                        message: `Tiddler "${title}" was unexpectedly deleted`,
                        affected: title
                    });
                }
                continue;
            }
            
            // Compare fields
            for (const [field, prevValue] of Object.entries(prevState.fields)) {
                console.log(`Checking field: ${field}`);
                const currentValue = currentTiddlerState.fields[field];
                
                if (field === 'tags') {
                    // Handle tags separately
                    const prevTags = new Set(prevValue || []);
                    const currentTags = new Set(currentValue || []);
                    
                    const addedTags = [...currentTags].filter(tag => !prevTags.has(tag));
                    const removedTags = [...prevTags].filter(tag => !currentTags.has(tag));
                    
                    const intendedAdds = intendedChanges?.tagsToAdd?.[title] || [];
                    const intendedRemoves = intendedChanges?.tagsToRemove?.[title] || [];
                    
                    const unintendedAdds = addedTags.filter(tag => !intendedAdds.includes(tag));
                    const unintendedRemoves = removedTags.filter(tag => !intendedRemoves.includes(tag));
                    
                    if (unintendedAdds.length || unintendedRemoves.length) {
                        operationsFailed = true;
                        validationMessages.push({
                            type: 'UNINTENDED_TAG_CHANGES',
                            message: 'Unexpected tag modifications occurred',
                            affected: title,
                            details: { unintendedAdds, unintendedRemoves }
                        });
                    } else if (addedTags.length || removedTags.length) {
                        successMessages.push(`Successfully updated tags for "${title}"`);
                    }
                } else {
                    // Handle regular field changes
                    const fieldChanged = JSON.stringify(prevValue) !== JSON.stringify(currentValue);
                    if (fieldChanged) {
                        console.log(`Field ${field} changed from:`, prevValue, 'to:', currentValue);
                        
                        // Allow all text field modifications
                        if (field === 'text') {
                            successMessages.push(`Updated text content of "${title}"`);
                            continue;
                        }

                        // For other fields, check if change was intended
                        const intendedChange = intendedChanges?.fieldsToUpdate?.[title]?.[field];
                        if (!intendedChange) {
                            operationsFailed = true;
                            validationMessages.push({
                                type: 'UNINTENDED_FIELD_CHANGE',
                                message: `Field "${field}" was modified without intention`,
                                affected: title,
                                details: {
                                    field,
                                    previous: prevValue,
                                    current: currentValue
                                }
                            });
                        } else {
                            successMessages.push(`Successfully updated ${field} field for "${title}"`);
                        }
                    }
                }
            }
        }
        
        console.log('Validation messages:', validationMessages);
        console.log('Success messages:', successMessages);
        console.log('Operation status:', operationsFailed ? 'FAILED' : 'SUCCESS');

        return {
            success: !operationsFailed,
            error: operationsFailed ? 'Some operations failed validation' : null,
            notification: operationsFailed ? {
                type: 'error',
                message: 'Some operations failed and were rolled back',
                details: validationMessages
            } : {
                type: 'success',
                message: 'All changes applied successfully',
                details: successMessages
            },
            validationMessages,
            successMessages,
            differences,
            operationsFailed,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('Error in verifyState:', error);
        return {
            success: false,
            error: `State verification failed: ${error.message}`,
            notification: {
                type: 'error',
                message: 'State verification failed',
                details: error.message
            },
            operationsFailed: true
        };
    }
}

isIntendedChange(diff, intendedChanges, title) {
    if (!intendedChanges) return false;
    
    switch (diff.type) {
        case 'added':
            return intendedChanges.additions?.includes(title);
            
        case 'missing':
            return intendedChanges.deletions?.includes(title);
            
        case 'modified':
            return this.isIntendedFieldChange(diff, intendedChanges, title);
            
        default:
            return false;
    }
}

// Helper method to check if a field change was intended
isIntendedFieldChange(fieldDiff, intendedChanges, title) {
    if (!intendedChanges?.fieldsToUpdate?.[title]) return false;
    
    const updates = intendedChanges.fieldsToUpdate[title];
    
    // Special handling for tags field
    if (fieldDiff.field === 'tags') {
        const addedTags = intendedChanges.tagsToAdd?.[title] || [];
        const removedTags = intendedChanges.tagsToRemove?.[title] || [];
        
        // Check if the tag changes match the intended changes
        const currentTags = new Set(fieldDiff.current || []);
        const previousTags = new Set(fieldDiff.previous || []);
        
        const actualAdded = [...currentTags].filter(tag => !previousTags.has(tag));
        const actualRemoved = [...previousTags].filter(tag => !currentTags.has(tag));
        
        return actualAdded.every(tag => addedTags.includes(tag)) &&
               actualRemoved.every(tag => removedTags.includes(tag));
    }
    
    // For other fields, check if the change matches the intended update
    return updates[fieldDiff.field] === fieldDiff.current;
}


async beginTransaction(title) {
    try {
        const transactionId = Date.now().toString();
        const initialState = await this.captureState(title);
        
        this.transactions = this.transactions || new Map();
        this.transactions.set(transactionId, {
            title,
            initialState,
            timestamp: Date.now()
        });
        
        return transactionId; // Return just the ID
    } catch (error) {
        console.error('Error beginning transaction:', error);
        throw new Error(`Failed to begin transaction: ${error.message}`);
    }
}
		
async commitTransaction(transactionId) {
        try {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found`);
            }

            // Clean up
            this.transactions.delete(transactionId);

            return {
                success: true,
                message: `Transaction ${transactionId} committed successfully`
            };
        } catch (error) {
            console.error('Error committing transaction:', error);
            return {
                success: false,
                error: `Failed to commit transaction: ${error.message}`
            };
        }
    }
		
async rollbackToState(title, state) {
    try {
        if (!state || !state.tiddlers) {
            throw new Error('Invalid state object provided for rollback');
        }

        const tiddlerState = state.tiddlers[title];
        if (!tiddlerState) {
            // If the tiddler didn't exist in the previous state, delete it
            this.$tw.wiki.deleteTiddler(title);
            return {
                success: true,
                message: `Tiddler ${title} deleted during rollback`
            };
        }

        // Restore the tiddler to its previous state
        const tiddler = new this.$tw.Tiddler(tiddlerState.fields);
        this.$tw.wiki.addTiddler(tiddler);

        return {
            success: true,
            message: `Tiddler ${title} rolled back successfully`
        };
    } catch (error) {
        console.error('Error during rollback:', error);
        return {
            success: false,
            error: `Rollback failed: ${error.message}`
        };
    }
}
		
async rollbackTransaction(transactionId) {
        try {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error(`Transaction ${transactionId} not found`);
            }

            // Restore initial state
            await this.rollbackToState(transaction.title, transaction.initialState);

            // Clean up
            this.transactions.delete(transactionId);

            return {
                success: true,
                message: `Transaction ${transactionId} rolled back successfully`
            };
        } catch (error) {
            console.error('Error rolling back transaction:', error);
            return {
                success: false,
                error: `Failed to rollback transaction: ${error.message}`
            };
        }
    }
		
		
async validateAction(action, params) {
    try {
        // Basic validation of action parameter
        if (!action || typeof action !== 'string') {
            return {
                success: false,
                error: 'Invalid action parameter'
            };
        }

        // Get validation rules for this action
        const rules = this.determineValidationRules(action);
        
        // Validate required parameters
        if (!params || typeof params !== 'object') {
            return {
                success: false,
                error: 'Invalid parameters object'
            };
        }

        // Run required validations
        for (const rule of rules.required) {
            const validation = await this.validateRule(rule, params);
            if (!validation.success) {
                return validation;
            }
        }

        // Run dependency validations
        for (const dependency of rules.dependencies) {
            const validation = await this.validateDependency(dependency, params);
            if (!validation.success) {
                return validation;
            }
        }

        // Check constraints
        for (const [field, constraints] of rules.constraints) {
            if (params[field]) {
                const constraintValidation = await this.validateConstraints(field, params[field], constraints);
                if (!constraintValidation.success) {
                    return constraintValidation;
                }
            }
        }

        return {
            success: true,
            action,
            params
        };
    } catch (error) {
        console.error('Validation error:', error);
        return {
            success: false,
            error: `Action validation failed: ${error.message}`
        };
    }
}

async validateConstraints(field, value, constraints) {
    try {
        if (constraints.maxLength && value.length > constraints.maxLength) {
            return {
                success: false,
                error: `${field} exceeds maximum length of ${constraints.maxLength}`
            };
        }

        if (constraints.minLength && value.length < constraints.minLength) {
            return {
                success: false,
                error: `${field} is shorter than minimum length of ${constraints.minLength}`
            };
        }

        if (constraints.pattern && !constraints.pattern.test(value)) {
            return {
                success: false,
                error: `${field} contains invalid characters`
            };
        }

        if (constraints.unique && this.$tw.wiki.tiddlerExists(value)) {
            return {
                success: false,
                error: `${field} must be unique: ${value} already exists`
            };
        }

        return {
            success: true
        };
    } catch (error) {
        return {
            success: false,
            error: `Constraint validation failed: ${error.message}`
        };
    }
}

async validateActionResult(action, params) {
    try {
        console.log('validating action:', action, params);
        
        // Basic validation
        if (!params || !params.title) {
            return {
                success: false,
                error: "Invalid parameters: title is required"
            };
        }

        // Get validation rules
        const rules = this.determineValidationRules(action);
        console.log('validation rules:', rules);
        
        // Validate the action first
        const validationResult = await this.validateAction(action, params);
        if (!validationResult.success) {
            console.log('validation failed:', validationResult.error);
            return validationResult;
        }

        console.log('validation passed, executing action');
        // Now execute the action
        const actionResult = await this.actionManager.executeAction(action, params);
        
        return {
            success: true,
            result: actionResult
        };

    } catch (error) {
        console.error('Error in validateActionResult:', error);
        return this.errorHandler.handleValidationError(error, action, params);
    }
}

async captureState(title) {
    try {
        // If title is an array or object (like in some actions), handle multiple tiddlers
        const titles = Array.isArray(title) ? title : [title];
        const state = {
            tiddlers: {},
            timestamp: Date.now()
        };
        
        for (const t of titles) {
            const tiddler = this.$tw.wiki.getTiddler(t);
            if (tiddler) {
                state.tiddlers[t] = {
                    fields: { ...tiddler.fields },
                    timestamp: Date.now()
                };
            }
        }
        
        return state;
    } catch (error) {
        console.error('Error in captureState:', error);
        return {
            tiddlers: {},
            timestamp: Date.now(),
            error: error.message
        };
    }
}

async checkCircularReferences(oldTitle, newTitle) {
    try {
        // Get all tiddlers that reference the old title
        const referencingTiddlers = new Set();
        this.$tw.wiki.each((tiddler, title) => {
            const text = tiddler.fields.text || "";
            if (text.includes(`[[${oldTitle}]]`)) {
                referencingTiddlers.add(title);
            }
        });

        // Check if the new title would create a circular reference
        if (referencingTiddlers.has(newTitle)) {
            return {
                success: false,
                error: "Renaming would create a circular reference"
            };
        }

        return {
            success: true
        };
    } catch (error) {
        return {
            success: false,
            error: `Reference check failed: ${error.message}`
        };
    }
}

async validateDependency(dependency, params) {
        switch(dependency) {
            case 'previousStatePreserved':
                return this.validatePreviousState(params);
                
            case 'referencesUpdated':
                return this.validateReferences(params);
                
            default:
                return {
                    success: false,
                    error: `Unknown dependency validation: ${dependency}`
                };
        }
    }

compareFields(prevFields, currentFields) {
    const differences = [];
    
    // Check for modified or removed fields
    for (const [field, prevValue] of Object.entries(prevFields)) {
        if (!currentFields.hasOwnProperty(field)) {
            differences.push({
                field,
                type: 'removed',
                previous: prevValue
            });
        } else if (JSON.stringify(prevValue) !== JSON.stringify(currentFields[field])) {
            differences.push({
                field,
                type: 'modified',
                previous: prevValue,
                current: currentFields[field]
            });
        }
    }
    
    // Check for new fields
    for (const field of Object.keys(currentFields)) {
        if (!prevFields.hasOwnProperty(field)) {
            differences.push({
                field,
                type: 'added',
                current: currentFields[field]
            });
        }
    }
    
    return differences;
}
		
async validateRule(rule, params) {
    switch(rule) {
        case 'titleUnique':
            return {
                success: !this.$tw.wiki.tiddlerExists(params.title),
                error: this.$tw.wiki.tiddlerExists(params.title) ? 
                    `Tiddler "${params.title}" already exists` : null
            };
            
        case 'titleExists':
            return {
                success: this.$tw.wiki.tiddlerExists(params.title),
                error: this.$tw.wiki.tiddlerExists(params.title) ? 
                    null : `Tiddler "${params.title}" does not exist`
            };
            
        case 'oldTitleExists':
            return {
                success: this.$tw.wiki.tiddlerExists(params.oldTitle),
                error: this.$tw.wiki.tiddlerExists(params.oldTitle) ?
                    null : `Source tiddler "${params.oldTitle}" does not exist`
            };
            
        case 'newTitleAvailable':
            return {
                success: !this.$tw.wiki.tiddlerExists(params.newTitle),
                error: this.$tw.wiki.tiddlerExists(params.newTitle) ?
                    `Target title "${params.newTitle}" already exists` : null
            };
            
        case 'contentValid':
            return this.validateContent(params.content);
            
        case 'tagsValid':
            return this.validateTags(params.tags);
            
        case 'fieldsValid':
            return this.validateFields(params.fields);
            
        default:
            return {
                success: false,
                error: `Unknown validation rule: ${rule}`
            };
    }
}

  
determineValidationRules(action) {
    const rules = {
        required: [],
        optional: [],
        dependencies: [],
        postConditions: [],
        constraints: new Map(),
        stateValidations: []
    };
    
    switch(action) {
        case 'createTiddler':
            rules.required.push('titleUnique'); 
            rules.optional.push('tagsValid', 'fieldsValid');
            rules.constraints.set('title', {
                unique: true  // Only check for uniqueness
            });
            rules.stateValidations.push('tiddlerCreated');
            break;
            
            
         case 'modifyTiddler':
            rules.required.push('titleExists'); 
            rules.optional.push('tagsValid', 'fieldsValid');
            rules.stateValidations.push('tiddlerModified');
            break;
            
     case 'renameTiddler':
    rules.required.push('oldTitleExists', 'newTitleAvailable');
    rules.dependencies.push('referencesIntact');
    rules.postConditions.push('referencesUpdated');
    rules.stateValidations.push('oldTiddlerRemoved', 'newTiddlerCreated');
    break;
            
       
        case 'closeTiddler':
            rules.required.push('titleExists');
            rules.dependencies.push('storyListAccessible');
            rules.stateValidations.push('storyListUpdated');
            break;
            
        case 'deleteTiddler':
            rules.required.push('titleExists', 'deletionAllowed');
            rules.dependencies.push('noBlockingReferences');
            rules.postConditions.push('tiddlerRemoved', 'referencesClean');
            rules.stateValidations.push('tiddlerDeleted');
            break;
            
        case 'addTag':
        case 'removeTag':
            rules.required.push('titleExists', 'tagValid');
            rules.dependencies.push('tagsAccessible');
            rules.stateValidations.push('tagsUpdated');
            rules.constraints.set('tag', {
                pattern: /^[^\\\/\:\*\?\"\<\>\|]+$/,
                maxLength: 100
            });
            break;
            
        case 'setField':
            rules.required.push('titleExists', 'fieldValid', 'valueValid');
            rules.dependencies.push('fieldsAccessible');
            rules.stateValidations.push('fieldUpdated');
            break;
    }
    
    // Add common post-conditions for all actions
    rules.postConditions.push('integrityMaintained');
    
    return rules;
}

    async validateWithRetry(validationFn, maxRetries = 3, delay = 200) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await validationFn();
            if (result.success) {
                return result;
            }
            
            lastError = result.error;
            console.log(`Validation attempt ${attempt} failed: ${lastError}`);
            
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
            
        } catch (error) {
            lastError = error;
            console.error(`Validation attempt ${attempt} threw error:`, error);
        }
    }
    
    return {
        success: false,
        error: `Validation failed after ${maxRetries} attempts. Last error: ${lastError}`
    };
}
}

exports.ValidationService = ValidationService;