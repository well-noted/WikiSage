/*\
created: 20241116155655188
tags: 
title: $:/plugins/NoteStreams/WikiSage/error-handler.js
modified: 20241202141444632
type: application/javascript
module-type: library

Error handling management for WikiSage widget
\*/

"use strict";



class ChatGPTErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 100;
    }

    // Handle API errors
    handleApiError(error, context) {
        const errorDetails = {
            timestamp: Date.now(),
            type: 'API_ERROR',
            message: error.message,
            context: context,
            stack: error.stack
        };
        this.logError(errorDetails);
        return {
            success: false,
            error: `API Error: ${error.message}`,
            details: errorDetails
        };
    }

    // Handle validation errors
    handleValidationError(error, context) {
        const errorDetails = {
            timestamp: Date.now(),
            type: 'VALIDATION_ERROR',
            message: error.message,
            context: context
        };
        this.logError(errorDetails);
        return {
            success: false,
            error: `Validation Error: ${error.message}`,
            details: errorDetails
        };
    }

    // Handle state management errors
    handleStateError(error, context) {
        const errorDetails = {
            timestamp: Date.now(),
            type: 'STATE_ERROR',
            message: error.message,
            context: context,
            state: this.captureErrorState()
        };
        this.logError(errorDetails);
        return {
            success: false,
            error: `State Error: ${error.message}`,
            details: errorDetails
        };
    }

    // Handle tiddler operation errors
    handleTiddlerError(error, operation, title) {
        const errorDetails = {
            timestamp: Date.now(),
            type: 'TIDDLER_ERROR',
            operation: operation,
            title: title,
            message: error.message
        };
        this.logError(errorDetails);
        return {
            success: false,
            error: `Tiddler Operation Error: ${error.message}`,
            details: errorDetails
        };
    }

    // Log error to internal store
    logError(errorDetails) {
        this.errorLog.unshift(errorDetails);
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.pop();
        }
        console.error('ChatGPT Widget Error:', errorDetails);
    }
		
		handleValidationError(error, action, params) {
    console.error(`Validation error in ${action}:`, error);
    
    // Log detailed error information
    this.logError({
        type: 'validation_error',
        action,
        params,
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
    });

    return {
        success: false,
        error: `Operation failed: ${error.message}`,
        details: {
            action,
            params: JSON.stringify(params)
        }
    };
}

    // Capture current state for error context
    captureErrorState() {
        return {
            timestamp: Date.now(),
            wiki: {
                tiddlerCount: $tw.wiki.getTiddlers().length,
                // Add other relevant state information
            }
        };
    }

    // Get error history
    getErrorHistory() {
        return this.errorLog;
    }

    // Clear error history
    clearErrorHistory() {
        this.errorLog = [];
    }

    // Display error to user
    displayError(error, notifier) {
        if (notifier) {
            notifier.display("$:/core/ui/Notifications/error", {
                message: error.message || "An unknown error occurred"
            });
        } else {
            console.error('Error:', error);
        }
    }
}

exports.ChatGPTErrorHandler = ChatGPTErrorHandler;