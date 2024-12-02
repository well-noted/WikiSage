/*\
created: 20241116220437030
tags: 
title: $:/plugins/NoteStreams/WikiSage/cache-service.js
modified: 20241202145253822
type: application/javascript
module-type: library

Cache service for search results and other data
\*/

(function(){

"use strict";

const { ValidationService } = require("$:/plugins/NoteStreams/WikiSage/validation-service.js");
const { ChatGPTErrorHandler } = require("$:/plugins/NoteStreams/WikiSage/error-handler.js");
const { ActionSequenceManager } = require("$:/plugins/NoteStreams/WikiSage/action-sequence-manager.js");

class CacheService {
    constructor(options = {}) {
		 this.actionManager = new ActionSequenceManager($tw);
        this.validationService = new ValidationService($tw);
        this.errorHandler = new ChatGPTErrorHandler();
        this.config = {
            maxAge: options.maxAge || 5 * 60 * 1000, // 5 minutes default
            maxSize: options.maxSize || 100, // 100 entries default
            compressionThreshold: options.compressionThreshold || 1024 // 1KB default
        };

        this.cache = {
            results: new Map(),
            timestamp: new Map(),
            metadata: new Map()
        };

        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    generateCacheKey(query, excludeTags = []) {
        return `${query}:${excludeTags.sort().join(',')}`;
    }

    async get(query, excludeTags = []) {
        const cacheKey = this.generateCacheKey(query, excludeTags);
        const cachedResult = this.cache.results.get(cacheKey);
        const timestamp = this.cache.timestamp.get(cacheKey);

        if (cachedResult && timestamp) {
            if (Date.now() - timestamp <= this.config.maxAge) {
                this.stats.hits++;
                
                const metadata = this.cache.metadata.get(cacheKey);
                return metadata.compressed ? 
                    await this.decompressResults(cachedResult) : 
                    cachedResult;
            }
            this.evictEntry(cacheKey);
        }
        
        this.stats.misses++;
        return null;
    }

    async set(query, excludeTags = [], results) {
        const cacheKey = this.generateCacheKey(query, excludeTags);
        
        const resultSize = JSON.stringify(results).length;
        const shouldCompress = resultSize > this.config.compressionThreshold;
        
        this.cache.results.set(cacheKey, 
            shouldCompress ? await this.compressResults(results) : results
        );
        
        this.cache.timestamp.set(cacheKey, Date.now());
        this.cache.metadata.set(cacheKey, {
            size: resultSize,
            compressed: shouldCompress,
            query: query,
            excludeTags: excludeTags
        });

        await this.maintain();
    }

    async maintain() {
        await this.clearExpired();
        await this.trimCache();
    }

    async clearExpired() {
        const now = Date.now();
        for (const [key, timestamp] of this.cache.timestamp.entries()) {
            if (now - timestamp > this.config.maxAge) {
                this.evictEntry(key);
                this.stats.evictions++;
            }
        }
    }

    async trimCache() {
        if (this.cache.results.size > this.config.maxSize) {
            const sortedEntries = [...this.cache.timestamp.entries()]
                .sort(([,a], [,b]) => a - b);
            
            while (this.cache.results.size > this.config.maxSize) {
                const [oldestKey] = sortedEntries.shift();
                this.evictEntry(oldestKey);
                this.stats.evictions++;
            }
        }
    }

    evictEntry(key) {
        this.cache.results.delete(key);
        this.cache.timestamp.delete(key);
        this.cache.metadata.delete(key);
    }

   async compressResults(results) {
    try {
        // Convert results to string if not already
        const dataString = typeof results === 'string' ? results : JSON.stringify(results);
        
        // Convert string to Uint8Array
        const textEncoder = new TextEncoder();
        const dataArray = textEncoder.encode(dataString);
        
        // Use CompressionStream if available (modern browsers)
        if (typeof CompressionStream !== 'undefined') {
            const compressedStream = new Blob([dataArray]).stream().pipeThrough(
                new CompressionStream('gzip')
            );
            const compressedData = await new Response(compressedStream).arrayBuffer();
            return new Uint8Array(compressedData);
        } else {
            // Fallback to simple RLE compression for older browsers
            return this.simpleCompress(dataArray);
        }
    } catch (error) {
        console.error('Compression error:', error);
        // Return original data if compression fails
        return results;
    }
}

async decompressResults(compressed) {
    try {
        // If the data isn't compressed, return as is
        if (!(compressed instanceof Uint8Array)) {
            return compressed;
        }

        // Use DecompressionStream if available
        if (typeof DecompressionStream !== 'undefined') {
            const decompressedStream = new Blob([compressed]).stream().pipeThrough(
                new DecompressionStream('gzip')
            );
            const decompressedData = await new Response(decompressedStream).arrayBuffer();
            const textDecoder = new TextDecoder();
            const decompressedString = textDecoder.decode(new Uint8Array(decompressedData));
            return JSON.parse(decompressedString);
        } else {
            // Fallback to simple RLE decompression
            const decompressedArray = this.simpleDecompress(compressed);
            const textDecoder = new TextDecoder();
            const decompressedString = textDecoder.decode(decompressedArray);
            return JSON.parse(decompressedString);
        }
    } catch (error) {
        console.error('Decompression error:', error);
        // Return original data if decompression fails
        return compressed;
    }
}

invalidateQuery(query, excludeTags = []) {
    try {
        const cacheKey = this.generateCacheKey(query, excludeTags);
        this.evictEntry(cacheKey);
        return true;
    } catch (error) {
        console.error('Error invalidating query:', error);
        return false;
    }
}

async setBatch(entries) {
    try {
        const operations = entries.map(({ query, excludeTags, results }) => 
            this.set(query, excludeTags, results)
        );
        await Promise.all(operations);
        await this.maintain();
        return true;
    } catch (error) {
        console.error('Error in batch set:', error);
        return false;
    }
}

async persistCache() {
    if (!$tw.wiki) return false;
    try {
        const cacheState = {
            results: Array.from(this.cache.results.entries()),
            timestamp: Array.from(this.cache.timestamp.entries()),
            metadata: Array.from(this.cache.metadata.entries()),
            stats: this.stats
        };
        
        $tw.wiki.addTiddler(new $tw.Tiddler({
            title: '$:/plugins/NoteStreams/expanded-chat-gpt/cache-state',
            type: 'application/json',
            text: JSON.stringify(cacheState)
        }));
        
        return true;
    } catch (error) {
        console.error('Error persisting cache:', error);
        return false;
    }
}

async loadPersistedCache() {
    if (!$tw.wiki) return false;
    
    try {
        const persistedCache = $tw.wiki.getTiddlerData('$:/plugins/NoteStreams/expanded-chat-gpt/cache-state');
        if (!persistedCache) return false;
        
        this.cache.results = new Map(persistedCache.results);
        this.cache.timestamp = new Map(persistedCache.timestamp);
        this.cache.metadata = new Map(persistedCache.metadata);
        this.stats = persistedCache.stats;
        
        await this.maintain(); // Clean up any expired entries
        return true;
    } catch (error) {
        console.error('Error loading persisted cache:', error);
        return false;
    }
}


// Implementation for possible cache for common queries
//
//warmCache(commonQueries, searchService) {
//    const results = [];
  //  
    //for (const { query, excludeTags } of commonQueries) {
      //  // Use synchronous cache operations
        //const cacheKey = this.generateCacheKey(query, excludeTags);
        //const cachedResults = this.cache.results.get(cacheKey);
        //const timestamp = this.cache.timestamp.get(cacheKey);
        //
        //if (!cachedResults || !timestamp || 
        //    (Date.now() - timestamp > this.config.maxAge)) {
            // If not in cache or expired, perform the search using the provided service
          //  const searchResults = searchService.searchTiddlerContent(query, excludeTags);
            
            // Cache the results
          //  this.cache.results.set(cacheKey, searchResults);
            //this.cache.timestamp.set(cacheKey, Date.now());
           // this.cache.metadata.set(cacheKey, {
            //    size: JSON.stringify(searchResults).length,
             //   compressed: false,
               // query: query,
               // excludeTags: excludeTags
          //  });
            
           // results.push({
            //    query,
             //   excludeTags,
             //   cached: true
          //  });
   //     }
//    }
    
  //  return results;
// }


// Simple RLE compression fallback
simpleCompress(data) {
    const compressed = [];
    let count = 1;
    let current = data[0];

    for (let i = 1; i < data.length; i++) {
        if (data[i] === current && count < 255) {
            count++;
        } else {
            compressed.push(count, current);
            count = 1;
            current = data[i];
        }
    }
    compressed.push(count, current);
    return new Uint8Array(compressed);
}


// Simple RLE decompression fallback
simpleDecompress(compressed) {
    const decompressed = [];
    for (let i = 0; i < compressed.length; i += 2) {
        const count = compressed[i];
        const value = compressed[i + 1];
        for (let j = 0; j < count; j++) {
            decompressed.push(value);
        }
    }
    return new Uint8Array(decompressed);
}

    getStats() {
        return {
            ...this.stats,
            size: this.cache.results.size,
            memoryUsage: this.calculateMemoryUsage()
        };
    }

    calculateMemoryUsage() {
        let total = 0;
        for (const [key, value] of this.cache.results.entries()) {
            const metadata = this.cache.metadata.get(key);
            total += metadata.size;
        }
        return total;
    }

    clear() {
        this.cache.results.clear();
        this.cache.timestamp.clear();
        this.cache.metadata.clear();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }
}

// Export the class
exports.CacheService = CacheService;

})();