/*\
created: 20241119001531091
tags: 
title: $:/plugins/NoteStreams/WikiSage/connection-pool.js
modified: 20241202145345697
type: application/javascript
module-type: library

Connection Pool for API requests
\*/

"use strict";

class ConnectionPool {
    constructor(config = {}) {
        this.config = {
            minSize: config.minSize || 2,
            maxSize: config.maxSize || 10,
            idleTimeout: config.idleTimeout || 30000,
            acquireTimeout: config.acquireTimeout || 5000,
            retryDelay: config.retryDelay || 1000,
            maxRetries: config.maxRetries || 3
        };

        this.pool = new Map();
        this.waitingRequests = [];
        this.stats = {
            active: 0,
            idle: 0,
            waiting: 0,
            total: 0
        };
    }

    async acquire() {
        // Try to get an idle connection
        for (const [id, conn] of this.pool.entries()) {
            if (!conn.inUse) {
                conn.inUse = true;
                conn.lastUsed = Date.now();
                this.stats.active++;
                this.stats.idle--;
                return conn;
            }
        }

        // Create new connection if possible
        if (this.pool.size < this.config.maxSize) {
            const conn = await this.createConnection();
            conn.inUse = true;
            this.stats.active++;
            this.stats.idle--;
            return conn;
        }

        // Wait for available connection
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.stats.waiting--;
                reject(new Error('Connection acquire timeout'));
            }, this.config.acquireTimeout);

            this.waitingRequests.push({
                resolve: (conn) => {
                    clearTimeout(timeout);
                    this.stats.waiting--;
                    resolve(conn);
                },
                reject
            });
        });
    }

    release(connection) {
        connection.inUse = false;
        connection.lastUsed = Date.now();
        connection.retryCount = 0;
        this.stats.active--;
        this.stats.idle++;

        if (this.waitingRequests.length > 0) {
            const request = this.waitingRequests.shift();
            connection.inUse = true;
            this.stats.active++;
            this.stats.idle--;
            request.resolve(connection);
        }
    }

    async createConnection() {
        const connection = {
            id: Date.now().toString(),
            inUse: false,
            lastUsed: Date.now(),
            retryCount: 0,
						
						
            async fetch(url, options) {
                const maxRetries = this.config?.maxRetries || 3;
                const initialRetryDelay = this.config?.retryDelay || 1000;
                
                // Add custom ApiError class for better error reporting
                class ApiError extends Error {
                    constructor(message, status, statusText, data, response) {
                        super(message);
                        this.name = 'ApiError';
                        this.status = status;
                        this.statusText = statusText;
                        this.data = data;
                        this.response = response;
                    }
                }
            
                // Determine if this is an Anthropic API call
                const isAnthropicAPI = url.includes('api.anthropic.com');
                let lastResponse = null;
                let lastErrorData = null;
            
                for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
                    try {
                        if (isAnthropicAPI) {
                            // Ensure headers are properly set for Anthropic API
                            options.headers = {
                                ...options.headers,
                                "anthropic-version": "2023-06-01",
                                "content-type": "application/json",
                                "x-api-key": options.headers["x-api-key"],
                                "anthropic-beta": "pdfs-2024-09-25",
                                "anthropic-dangerous-direct-browser-access": "true"
                            };
            
                            // Log the request for debugging
                            console.log("Anthropic API Request:", {
                                url,
                                method: options.method,
                                headers: {...options.headers},
                                body: JSON.parse(options.body)
                            });
                        }
            
                        const response = await fetch(url, options);
                        lastResponse = response;
                        
                        if (!response.ok) {
                            // Try to parse error data in a safe way
                            try {
                                lastErrorData = await response.clone().json().catch(() => null);
                            } catch (parseError) {
                                console.warn(`Failed to parse error response as JSON: ${parseError.message}`);
                                try {
                                    lastErrorData = await response.clone().text().catch(() => 'Unable to read response body');
                                } catch (textError) {
                                    lastErrorData = 'Unable to read response body';
                                }
                            }
                            
                            console.error(`API Error Response (Attempt ${attempt}/${maxRetries + 1}):`, {
                                status: response.status,
                                statusText: response.statusText,
                                errorData: lastErrorData
                            });
                            
                            // Check if we should retry
                            if (attempt <= maxRetries && (
                                response.status === 429 || 
                                response.status >= 500 || // Server errors
                                (isAnthropicAPI && response.headers.get('anthropic-rate-limit-remaining') === '0')
                            )) {
                                // Calculate delay with exponential backoff and jitter
                                let delay = initialRetryDelay * Math.pow(2, attempt - 1);
                                // Add jitter: random amount between 0 and 1000ms
                                delay += Math.floor(Math.random() * 1000);
                                
                                // Check for Retry-After header
                                const retryAfterSeconds = response.headers.get('Retry-After');
                                if (retryAfterSeconds) {
                                    const retryAfterMillis = parseInt(retryAfterSeconds, 10) * 1000;
                                    if (!isNaN(retryAfterMillis) && retryAfterMillis > 0) {
                                        delay = Math.max(delay, retryAfterMillis);
                                        console.warn(`API returned Retry-After: ${retryAfterSeconds}s. Adjusted delay to ${delay}ms.`);
                                    }
                                }
                                
                                console.warn(`Retrying in ${delay}ms...`);
                                await new Promise(resolve => setTimeout(resolve, delay));
                                continue;
                            }
                            
                            // If we get here, it's a non-retriable error or we've exhausted retries
                            throw new ApiError(
                                `API Error: ${response.status} ${response.statusText}`,
                                response.status,
                                response.statusText,
                                lastErrorData,
                                response
                            );
                        }
                        
                        // Success! Return the response
                        return response;
                    } catch (error) {
                        // If it's already an ApiError (from above), just rethrow it
                        if (error instanceof ApiError) {
                            throw error;
                        }
                        
                        console.error(`Connection error (Attempt ${attempt}/${maxRetries + 1}):`, error);
                        
                        // Network errors (not HTTP error statuses)
                        if (attempt <= maxRetries) {
                            // Exponential backoff with jitter for network errors too
                            const delay = initialRetryDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
                            console.warn(`Network error, retrying in ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                        
                        // Create a network error with more context
                        const networkError = new Error(`Network Error: ${error.message} after ${maxRetries} retries.`);
                        networkError.name = 'NetworkError';
                        networkError.isNetworkError = true;
                        networkError.originalError = error;
                        throw networkError;
                    }
                }
                
                // This should never be reached due to the throw statements above,
                // but as a fallback, if we somehow exit the loop without returning or throwing:
                if (lastResponse) {
                    throw new ApiError(
                        `API Error: Unexpected state after ${maxRetries} retries`,
                        lastResponse.status,
                        lastResponse.statusText,
                        lastErrorData,
                        lastResponse
                    );
                }
                
                throw new Error(`Failed to get a response after ${maxRetries} attempts.`);
            }

        };

        this.pool.set(connection.id, connection);
        this.stats.total++;
        this.stats.idle++;
        return connection;
    }
}

exports.ConnectionPool = ConnectionPool;