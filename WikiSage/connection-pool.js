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
                const retryDelay = this.config?.retryDelay || 1000;
            
                // Determine if this is an Anthropic API call
                const isAnthropicAPI = url.includes('api.anthropic.com');
            
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
                        
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => null);
                            console.error("API Error Response:", {
                                status: response.status,
                                statusText: response.statusText,
                                errorData
                            });
                            
                            if (response.status === 429 || 
                                (isAnthropicAPI && response.headers.get('anthropic-rate-limit-remaining') === '0')) {
                                const delay = retryDelay * Math.pow(2, attempt - 1);
                                await new Promise(resolve => setTimeout(resolve, delay));
                                continue;
                            }
                            
                            // For 400 errors, throw immediately with detailed error
                            if (response.status === 400) {
                                throw new Error(`API Error (${response.status}): ${errorData?.error?.message || response.statusText}`);
                            }
                        }
                        
                        return response;
                    } catch (error) {
                        console.error(`Attempt ${attempt} failed:`, error);
                        if (attempt === maxRetries) throw error;
                        const delay = retryDelay * Math.pow(2, attempt - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

        };

        this.pool.set(connection.id, connection);
        this.stats.total++;
        this.stats.idle++;
        return connection;
    }
}

exports.ConnectionPool = ConnectionPool;