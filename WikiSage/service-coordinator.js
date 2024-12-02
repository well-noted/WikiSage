/*\
created: 20241118200359970
tags: 
title: $:/plugins/NoteStreams/WikiSage/service-coordinator.js
modified: 20241202145429772
type: application/javascript
module-type: library

Service Coordinator for managing interactions between services
\*/

"use strict";

const { ValidationService } = require("$:/plugins/NoteStreams/WikiSage/validation-service.js");
const { ChatGPTErrorHandler } = require("$:/plugins/NoteStreams/WikiSage/error-handler.js");
const { ActionSequenceManager } = require("$:/plugins/NoteStreams/WikiSage/action-sequence-manager.js");
const { ConnectionPool } = require("$:/plugins/NoteStreams/WikiSage/connection-pool.js");


class ActionValidator {
    constructor(serviceCoordinator) {
        this.serviceCoordinator = serviceCoordinator;
        this.validationModel = "gpt-4o-mini";
    }

    async validateAction(action, params, userRequest) {
        console.log('\n=== Action Validation Started ===');
        console.log('Validating action:', action);
        console.log('Parameters:', JSON.stringify(params, null, 2));
        console.log('User Request:', userRequest);

        try {
            const apiKey = this.serviceCoordinator.$tw.wiki.getTiddlerText("$:/plugins/NoteStreams/expanded-chat-gpt/openai-api-key").trim();
            
            const validationPrompt = `
            Validate if the following action matches the user's request:
            User Request: ${userRequest}
            Proposed Action: ${action}
            Action Parameters: ${JSON.stringify(params, null, 2)}

            Rules:
            1. The action must directly relate, at least in part, to the user's request.
            2. Some actions require partial steps -- allow those that are consistent with the overall goal.
            3. All parameters must be properly formatted
            4. Field updates must match the intended changes
            5. Tags can ONLY be modified if explicitly requested by the user. Not not approve tags that were not specifically requested, even if they are relevant.
            6. No unrelated modifications should be included
            7. If the action is valid but only accomplishes part of the user's request, mark it as true but include suggestions for remaining steps

            Respond with:
            {
                "valid": boolean,
                "reason": string,
                "suggestions": array (if invalid)
            }`;

            console.log('\nSending validation prompt:', validationPrompt);

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: this.validationModel,
                    messages: [{ role: "system", content: validationPrompt }],
                    temperature: 0.2
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('\nAPI Response:', JSON.stringify(result, null, 2));

            const validation = JSON.parse(result.choices[0].message.content);
            console.log('\nValidation Result:', JSON.stringify(validation, null, 2));
            console.log('=== Action Validation Completed ===\n');

            return validation;

        } catch (error) {
            console.error("\n❌ Action Validation Error:", error);
            return {
                valid: false,
                reason: `Validation failed: ${error.message}`,
                suggestions: []
            };
        }
    }
}

class ServiceCoordinator {
    constructor($tw) {
        this.$tw = $tw;
        this.actionManager = new ActionSequenceManager($tw);
        this.validationService = new ValidationService($tw);
        this.errorHandler = new ChatGPTErrorHandler();
        this.transactions = new Map();
        this.queryStartTime = null;
        this.actionHistory = [];
        this.hasPerformedFirstValidation = false;

         // Initialize connection pool
         this.connectionPool = new ConnectionPool({
            maxSize: 5,
            idleTimeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            acquireTimeout: 5000
        });
    
        
        this.state = {
            queryTimestamp: null,
            actionHistory: [],
            activeOperations: new Set()
        };
    }

    async executeOperation(action, params, userRequest, chatGPTOptions) {
        if (!this.queryStartTime) {
            this.queryStartTime = Date.now();
        }
        console.log('Starting executeOperation:', { action, params });
        
        const validator = new ActionValidator(this);
        
        if (chatGPTOptions?.useAdversarialValidation && !this.hasPerformedFirstValidation && action !== 'validate') {
            const validation = await validator.validateAction(action, params, userRequest);
                
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.reason,
                    suggestions: validation.suggestions,
                    validationType: 'PRE_VALIDATION'
                };
            }
            this.hasPerformedFirstValidation = true;
        }
    
        let transactionId;
        try {
            transactionId = await this.validationService.beginTransaction(params.title);
            const initialState = await this.validationService.captureState(params.title);
            const result = await this.actionManager.executeAction(action, params);
            
            if (result.success) {
                const finalState = await this.validationService.captureState(params.title);
                const intendedChanges = {
                    tagsToAdd: params.tagsToAdd ? { [params.title]: params.tagsToAdd } : {},
                    tagsToRemove: params.tagsToRemove ? { [params.title]: params.tagsToRemove } : {},
                    fieldsToUpdate: params.fieldsToUpdate || {}
                };
    
                const verification = await this.validationService.verifyState(
                    initialState,
                    finalState,
                    intendedChanges
                );
    
                if (verification.success) {
                    this.actionHistory.push({
                        action,
                        params,
                        previousState: initialState,
                        timestamp: Date.now(),
                        queryTimestamp: this.queryStartTime
                    });
                    
                    await this.validationService.commitTransaction(transactionId);
                    this.hasPerformedFirstValidation = false;
                    return result;
                } else {
                    await this.validationService.rollbackTransaction(transactionId);
                    return {
                        success: false,
                        error: verification.error,
                        validationType: 'POST_VALIDATION',
                        validationMessages: verification.validationMessages,
                        differences: verification.differences
                    };
                }
            } else {
                await this.validationService.rollbackTransaction(transactionId);
                return result;
            }
        } catch (error) {
            if (transactionId) {
                await this.validationService.rollbackTransaction(transactionId);
            }
            throw error;
        }
    }


    // State management methods
    updateState(operation, result) {
        this.state.actionHistory.push({
            operation,
            timestamp: Date.now(),
            result
        });
    }
		
		  resetQueryTimestamp() {
        this.queryStartTime = null;
    }

    // ethod to get action history
    getActionHistory() {
        return this.actionHistory;
    }

    async undoMultipleActions(count) {
        const results = [];
        let actionsToUndo = count;

        // If undoing a query, get all actions from that query
        if (this.queryStartTime) {
            const queryActions = this.actionHistory.filter(
                action => action.queryTimestamp === this.queryStartTime
            );
            actionsToUndo = queryActions.length;
        }

        for (let i = 0; i < actionsToUndo; i++) {
            const result = await this.undoLastAction();
            results.push(result);
            if (!result.success) break;
        }

        // Reset query timestamp after undoing
        this.queryStartTime = null;
        
        return results;
    }

    getLastQueryActionCount() {
        if (!this.queryStartTime) return 0;
        return this.actionHistory.filter(action => action.queryTimestamp === this.queryStartTime).length;
    }

    // Method to undo last action
    async undoLastAction() {
        if (this.actionHistory.length === 0) {
            return {
                success: false,
                error: "No actions to undo"
            };
        }

        const lastAction = this.actionHistory.pop();
        return await this.validationService.rollbackToState(
            lastAction.params.title,
            lastAction.previousState
        );
    }

    async undoMultipleActions(count) {
        const results = [];
        let actionsToUndo = count;

        // If undoing a query, get all actions from that query
        if (this.queryStartTime) {
            const queryActions = this.actionHistory.filter(
                action => action.queryTimestamp === this.queryStartTime
            );
            actionsToUndo = queryActions.length;
        }

        for (let i = 0; i < actionsToUndo; i++) {
            const result = await this.undoLastAction();
            results.push(result);
            if (!result.success) break;
        }

        // Reset query timestamp after undoing
        this.queryStartTime = null;
        
        return results;
    }




    // Service access methods
    getValidationService() {
        return this.validationService;
    }

    getCacheService() {
        return this.cacheService;
    }

    getActionManager() {
        return this.actionManager;
    }

    getErrorHandler() {
        return this.errorHandler;
    }
}

exports.ServiceCoordinator = ServiceCoordinator;