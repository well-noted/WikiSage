/*\
created: 20250513230147014
title: $:/plugins/NoteStreams/WikiSage/tiddlywiki-mindmap-widget.js
tags: 
modified: 20260223010744739
type: application/javascript
module-type: widget
\*/

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var TiddlywikiMindmapWidget = function(parseTreeNode, options) {
  // Call parent constructor
  Widget.call(this);
  
  // Store parameters
  this.parseTreeNode = parseTreeNode;
  this.options = options;
  
  // Initialize variables
  this.initialiseVariables();
  
  // Add debug message to confirm the widget is being initialized
  console.log("TiddlywikiMindmapWidget initialized");
};

TiddlywikiMindmapWidget.prototype = Object.create(Widget.prototype);
TiddlywikiMindmapWidget.prototype.constructor = TiddlywikiMindmapWidget;

// Add the missing method to initialize variables
TiddlywikiMindmapWidget.prototype.initialiseVariables = function() {
  // Initialize array to store DOM nodes
  this.domNodes = [];
  
  // Initialize canvas reference
  this.canvas = null;
  
  // Initialize mind map data structure
  this.mindmapData = {
    nodes: [],
    edges: []
  };
  
  // Initialize zoom and position tracking
  this.zoom = 1;
  this.offsetX = 0;
  this.offsetY = 0;
  
  // Initialize selected node tracker
  this.selectedNode = null;
  
  // Initialize background (default to white)
  this.background = "#ffffff";
  
  // Initialize view mode (default to 'related')
  // 'related' - shows only the current tiddler and related tiddlers
  // 'all' - shows all tiddlers in the wiki
  this.viewMode = "related";
  
  // Limit for all tiddlers view (for performance reasons)
  this.allTiddlersLimit = 100;
  
  // Cache for relationship data to improve performance
  this.relationshipCache = {
    links: {},      // Outgoing links
    backlinks: {},  // Incoming links
    transclusions: {}, // Outgoing transclusions
    backtransclusions: {} // Incoming transclusions
  };
  
  // Flag to track if the cache is initialized
  this.cacheInitialized = false;
};

TiddlywikiMindmapWidget.prototype.render = function(parent, nextSibling) {
  console.log("TiddlywikiMindmapWidget render called");
  if (!$tw.browser) return;
  this.parentDomNode = parent;
  
  // Compute attributes in a safe way
  this.computeAttributes();
  
  // Process the attributes
  this.execute();
  
  // Store reference to this widget instance
  const parentWidget = this;
  
  // Main container
  const container = $tw.utils.domMaker("div", {
    class: "tiddlywiki-mindmap-widget-container",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      width: "100%",
      height: "500px",
      border: "1px solid #bbb",
      borderRadius: "6px",
      padding: "12px",
      background: "#f8f8f2"
    }
  });

  // Title and Controls
  const headerRow = $tw.utils.domMaker("div", {
    style: { 
      display: "flex", 
      justifyContent: "space-between", 
      alignItems: "center", 
      marginBottom: "10px" 
    }
  });
  
  const title = $tw.utils.domMaker("h3", {
    text: "Tiddler Mind Map",
    style: { margin: "0" }
  });
  
  const controlsGroup = $tw.utils.domMaker("div", {
    style: { display: "flex", gap: "10px", alignItems: "center" }
  });
  
  // View mode toggle button
  const viewModeBtn = $tw.utils.domMaker("button", {
    text: this.viewMode === "related" ? "Related View" : "Complete View",
    title: this.viewMode === "related" 
      ? "Switch to complete wiki view" 
      : "Switch to related tiddlers view",
    style: {
      padding: "4px 8px",
      fontSize: "14px",
      cursor: "pointer",
      background: this.viewMode === "all" ? "#e6f0ff" : "#fff"
    }
  });
  
  // Toggle view mode on click
  viewModeBtn.addEventListener("click", () => {
    this.viewMode = this.viewMode === "related" ? "all" : "related";
    viewModeBtn.textContent = this.viewMode === "related" ? "Related View" : "Complete View";
    viewModeBtn.style.background = this.viewMode === "all" ? "#e6f0ff" : "#fff";
    
    // Reinitialize the mindmap with the new view mode
    this.initializeMindMap(this.canvas);
  });
  
  // Add gear/settings icon for background options
  const gearBtn = $tw.utils.domMaker("button", {
    text: "⚙️",
    title: "Settings",
    style: {
      padding: "4px 8px",
      fontSize: "16px",
      cursor: "pointer",
      position: "relative"
    }
  });
  
  // Create settings dropdown (hidden initially)
  const settingsDropdown = $tw.utils.domMaker("div", {
    class: "mindmap-settings-dropdown",
    style: {
      display: "none",
      position: "absolute",
      top: "100%",
      right: "0",
      zIndex: "1001",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "4px",
      padding: "10px",
      boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
      minWidth: "200px"
    }
  });
  
  // Background options section
  const bgOptionsTitle = $tw.utils.domMaker("div", {
    text: "Background:",
    style: {
      fontWeight: "bold",
      marginBottom: "5px"
    }
  });
  
  settingsDropdown.appendChild(bgOptionsTitle);
  
  // Background options
  const backgrounds = [
    { name: "White", value: "#ffffff" },
    { name: "Light Grey", value: "#f5f5f5" },
    { name: "Grid", value: "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 20 20\"><rect width=\"20\" height=\"20\" fill=\"%23ffffff\"/><path d=\"M 20 0 L 0 0 0 20\" stroke=\"%23d0d0d0\" fill=\"none\" stroke-width=\"1\"/></svg>')" },
    { name: "Dots", value: "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 20 20\"><rect width=\"20\" height=\"20\" fill=\"%23ffffff\"/><circle cx=\"10\" cy=\"10\" r=\"1\" fill=\"%23d0d0d0\"/></svg>')" }
  ];
  
  backgrounds.forEach(bg => {
    const bgOption = $tw.utils.domMaker("div", {
      class: "bg-option",
      style: {
        display: "flex",
        alignItems: "center",
        padding: "5px 0",
        cursor: "pointer"
      }
    });
    
    const bgPreview = $tw.utils.domMaker("div", {
      style: {
        width: "20px",
        height: "20px",
        marginRight: "10px",
        border: "1px solid #ccc",
        background: bg.value
      }
    });
    
    const bgLabel = $tw.utils.domMaker("span", {
      text: bg.name
    });
    
    bgOption.appendChild(bgPreview);
    bgOption.appendChild(bgLabel);
    settingsDropdown.appendChild(bgOption);
    
    // Add click handler
    bgOption.addEventListener("click", () => {
      this.setBackground(bg.value, mindmapCanvas);
      settingsDropdown.style.display = "none";
    });
  });
  
  // Add custom color picker option
  const customColorOption = $tw.utils.domMaker("div", {
    class: "bg-option",
    style: {
      padding: "5px 0"
    }
  });
  
  const customColorLabel = $tw.utils.domMaker("div", {
    text: "Custom Color:",
    style: {
      marginBottom: "5px"
    }
  });
  
  const colorPickerContainer = $tw.utils.domMaker("div", {
    style: {
      display: "flex",
      alignItems: "center"
    }
  });
  
  const colorPicker = $tw.utils.domMaker("input", {
    attributes: {
      type: "color",
      value: this.background.startsWith("#") ? this.background : "#ffffff"
    },
    style: {
      marginRight: "10px"
    }
  });
  
  const applyColorBtn = $tw.utils.domMaker("button", {
    text: "Apply",
    style: {
      padding: "2px 8px",
      cursor: "pointer"
    }
  });
  
  colorPickerContainer.appendChild(colorPicker);
  colorPickerContainer.appendChild(applyColorBtn);
  
  customColorOption.appendChild(customColorLabel);
  customColorOption.appendChild(colorPickerContainer);
  settingsDropdown.appendChild(customColorOption);
  
  // Add click handler for the apply button
  applyColorBtn.addEventListener("click", (event) => {
    this.setBackground(colorPicker.value, mindmapCanvas);
    settingsDropdown.style.display = "none";
    event.stopPropagation();
  });
  
  // Also update when color is changed (for browsers that support this)
  colorPicker.addEventListener("change", () => {
    this.setBackground(colorPicker.value, mindmapCanvas);
  });
  
  // Append dropdown to gear button
  gearBtn.appendChild(settingsDropdown);
  
  // Toggle dropdown when gear is clicked
  gearBtn.addEventListener("click", (event) => {
    if (settingsDropdown.style.display === "none") {
      settingsDropdown.style.display = "block";
    } else {
      settingsDropdown.style.display = "none";
    }
    event.stopPropagation();
  });
  
  // Hide dropdown when clicking elsewhere
  document.addEventListener("click", (event) => {
    if (!gearBtn.contains(event.target)) {
      settingsDropdown.style.display = "none";
    }
  });
  
  // Zoom controls
  const zoomInBtn = $tw.utils.domMaker("button", {
    text: "+",
    title: "Zoom In",
    style: {
      padding: "4px 8px",
      fontSize: "16px",
      cursor: "pointer"
    }
  });
  
  const zoomOutBtn = $tw.utils.domMaker("button", {
    text: "-",
    title: "Zoom Out",
    style: {
      padding: "4px 8px",
      fontSize: "16px",
      cursor: "pointer"
    }
  });
  
  const resetBtn = $tw.utils.domMaker("button", {
    text: "Reset View",
    style: {
      padding: "4px 8px",
      cursor: "pointer"
    }
  });
  
  // Append controls
  controlsGroup.appendChild(viewModeBtn);
  controlsGroup.appendChild(gearBtn);
  controlsGroup.appendChild(zoomInBtn);
  controlsGroup.appendChild(zoomOutBtn);
  controlsGroup.appendChild(resetBtn);
  
  headerRow.appendChild(title);
  headerRow.appendChild(controlsGroup);
  container.appendChild(headerRow);

  // Search and Add section
  const toolbarRow = $tw.utils.domMaker("div", {
    style: { 
      display: "flex", 
      gap: "8px", 
      marginBottom: "10px" 
    }
  });
  
  const searchInput = $tw.utils.domMaker("input", {
    class: "mindmap-search-input",
    attributes: { 
      placeholder: "Search tiddlers...",
      type: "text"
    },
    style: {
      flex: "1",
      padding: "8px",
      border: "1px solid #ccc",
      borderRadius: "4px"
    }
  });
  
  const addBtn = $tw.utils.domMaker("button", {
    text: "Add to Map",
    style: {
      padding: "8px 12px",
      background: "#4f8cff",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer"
    }
  });
  
  toolbarRow.appendChild(searchInput);
  toolbarRow.appendChild(addBtn);
  container.appendChild(toolbarRow);

  // Add result dropdown area (hidden initially)
  const resultsDropdown = $tw.utils.domMaker("div", {
    class: "search-results-dropdown",
    style: {
      display: "none",
      position: "absolute",
      zIndex: "1000",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "4px",
      maxHeight: "200px",
      overflowY: "auto",
      width: searchInput.offsetWidth + "px",
      boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)"
    }
  });
  
  // Main mind map canvas
  const mindmapCanvas = $tw.utils.domMaker("div", {
    class: "mindmap-canvas",
    style: {
      flex: "1",
      border: "1px solid #ddd",
      borderRadius: "4px",
      background: this.background,
      position: "relative",
      overflow: "hidden"
    }
  });
  
  // If background is a pattern, set the appropriate properties
  if (this.background.startsWith('url')) {
    mindmapCanvas.style.backgroundSize = "20px 20px";
    mindmapCanvas.style.backgroundRepeat = "repeat";
  }
  
  container.appendChild(resultsDropdown);
  container.appendChild(mindmapCanvas);
  
  // Status/message area
  const message = $tw.utils.domMaker("div", {
    class: "mindmap-message",
    style: {
      marginTop: "8px",
      color: "#666",
      fontSize: "14px"
    }
  });
  
  container.appendChild(message);
  
  // Append the container to parent
  parent.appendChild(container);
  
  // Store DOM nodes we'll need to access later
  this.domNodes.push(container);
  
  // Store canvas reference
  this.canvas = mindmapCanvas;
  
  // Initialize the mind map
  this.initializeMindMap(mindmapCanvas);
  
  // Set up event handlers
  this.setupEventHandlers(searchInput, resultsDropdown, addBtn, zoomInBtn, zoomOutBtn, resetBtn, mindmapCanvas, message);
};

// Initialize the mind map
TiddlywikiMindmapWidget.prototype.initializeMindMap = function(canvas) {
  console.log("Initializing mindmap (viewMode = " + this.viewMode + ")");
  
  // Reset the mindmap data
  this.mindmapData = {
    nodes: [],
    edges: []
  };
  
  // Try to load saved data if in related mode
  if (this.viewMode === "related") {
    const savedData = this.loadMindmapData();
    
    if (savedData) {
      // We have valid saved data, use it
      this.mindmapData = savedData;
      // Render the saved mind map
      this.renderMindMap(canvas);
      
      // Re-analyze relationships between all nodes
      this.discoverAllRelationships(canvas);
      return; // Exit early since we've loaded saved data
    }
    
    // If no saved data, initialize with current tiddler
    const currentTiddler = this.getVariable("currentTiddler") || 
                           $tw.wiki.getTextReference("$:/HistoryList!!current-tiddler");
    
    console.log("No saved data found, initializing with current tiddler:", currentTiddler);
    
    if (currentTiddler) {
      const centerNode = {
        id: currentTiddler,
        title: currentTiddler,
        x: canvas.offsetWidth / 2,
        y: canvas.offsetHeight / 2,
        type: "central"
      };
      
      // Add to data structure
      this.mindmapData.nodes.push(centerNode);
      
      // Render the initial node
      this.renderMindMap(canvas);
      
      // Find related tiddlers and add them
      this.addRelatedTiddlers(currentTiddler, canvas);
    } else {
      // No current tiddler, show instructions
      const instructionElement = $tw.utils.domMaker("div", {
        text: "Open a tiddler first or search to add a tiddler as the center of your mind map.",
        style: {
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          padding: "20px",
          color: "#999"
        }
      });
      
      canvas.appendChild(instructionElement);
    }
  } else {
    // In "all" mode - show all tiddlers
    this.loadAllTiddlers(canvas);
  }
  
  // Save initial state
  this.saveMindmapData();
};

// New method to load ALL tiddlers in the wiki
TiddlywikiMindmapWidget.prototype.loadAllTiddlers = function(canvas) {
  // Clear existing canvas
  canvas.innerHTML = "";
  
  // Show loading message
  const loadingMsg = $tw.utils.domMaker("div", {
    text: "Analyzing wiki connections...",
    style: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      textAlign: "center",
      padding: "20px",
      color: "#999",
      fontWeight: "bold"
    }
  });
  
  canvas.appendChild(loadingMsg);
  
  // Start progressive loading
  this.progressivelyLoadConnectedTiddlers(canvas);
};

// Load and display connected tiddlers progressively with better performance
TiddlywikiMindmapWidget.prototype.progressivelyLoadConnectedTiddlers = function(canvas) {
  // First, build our relationship index if not already built
  if (!this.cacheInitialized) {
    this.buildRelationshipIndex();
  }
  
  // Get tiddlers with connections using our index
  const connectedTiddlers = this.getConnectedTiddlers();
  
  // Update the loading message
  canvas.innerHTML = "";
  
  // If no connected tiddlers found, show message
  if (connectedTiddlers.length === 0) {
    const noConnectionsMsg = $tw.utils.domMaker("div", {
      text: "No connected tiddlers found in your wiki. Try creating links between tiddlers first.",
      style: {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        textAlign: "center",
        padding: "20px",
        color: "#999",
        fontWeight: "bold"
      }
    });
    canvas.appendChild(noConnectionsMsg);
    return;
  }
  
  // Limit the number of tiddlers if needed
  const displayLimit = this.allTiddlersLimit;
  const limitedTiddlers = connectedTiddlers.length > displayLimit ? 
    connectedTiddlers.slice(0, displayLimit) : 
    connectedTiddlers;
  
  console.log(`Displaying ${limitedTiddlers.length} most connected tiddlers (out of ${connectedTiddlers.length} found)`);

  // Display a progress message while arranging
  const arrangingMsg = $tw.utils.domMaker("div", {
    text: `Arranging ${limitedTiddlers.length} tiddlers by connection count...`,
    style: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      textAlign: "center",
      padding: "20px",
      color: "#999",
      fontWeight: "bold"
    }
  });
  canvas.appendChild(arrangingMsg);
  
  // Use requestAnimationFrame to give the UI a chance to update
  requestAnimationFrame(() => {
    // Extract just the tiddler titles for the layout functions
    const tiddlerTitles = limitedTiddlers.map(t => t.title);
    
    // Choose layout method based on number of nodes
    if (tiddlerTitles.length > 20) {
      this.arrangeWithForceLayout(tiddlerTitles, canvas, limitedTiddlers);
    } else {
      this.arrangeInCircle(tiddlerTitles, canvas, limitedTiddlers);
    }
    
    // Create edges using our indexed data
    this.createEdgesFromIndex(tiddlerTitles);
    
    // Render the mindmap
    canvas.innerHTML = "";
    this.renderMindMap(canvas);
    
    // Add a legend showing connection count ranges
    this.addConnectionCountLegend(canvas, limitedTiddlers);
  });
};

// Build a comprehensive index of all relationships in the wiki
TiddlywikiMindmapWidget.prototype.buildRelationshipIndex = function() {
  console.time("Building relationship index");
  
  // Reset cache
  this.relationshipCache = {
    links: {},      
    backlinks: {},  
    transclusions: {}, 
    backtransclusions: {} 
  };
  
  // Get all non-system tiddlers
  const allTiddlers = [];
  $tw.wiki.each(function(tiddler, title) {
    if (!title.startsWith("$:/")) {
      allTiddlers.push(title);
    }
  });
  
  console.log(`Indexing ${allTiddlers.length} tiddlers...`);
  
  // Build link and transclusion indices in a single pass through all tiddlers
  allTiddlers.forEach(tiddlerTitle => {
    const tiddlerText = $tw.wiki.getTiddlerText(tiddlerTitle) || "";
    
    // Initialize entries in our indices
    if (!this.relationshipCache.links[tiddlerTitle]) {
      this.relationshipCache.links[tiddlerTitle] = [];
    }
    if (!this.relationshipCache.transclusions[tiddlerTitle]) {
      this.relationshipCache.transclusions[tiddlerTitle] = [];
    }
    
    // Find links - use a faster approach with a single regex execution
    const links = this.extractLinks(tiddlerText);
    links.forEach(link => {
      // Add to outgoing links
      if ($tw.wiki.tiddlerExists(link) && !this.relationshipCache.links[tiddlerTitle].includes(link)) {
        this.relationshipCache.links[tiddlerTitle].push(link);
      }
      
      // Add to incoming links (backlinks)
      if ($tw.wiki.tiddlerExists(link)) {
        if (!this.relationshipCache.backlinks[link]) {
          this.relationshipCache.backlinks[link] = [];
        }
        if (!this.relationshipCache.backlinks[link].includes(tiddlerTitle)) {
          this.relationshipCache.backlinks[link].push(tiddlerTitle);
        }
      }
    });
    
    // Find transclusions - use a faster approach with a single regex execution
    const transclusions = this.extractTransclusions(tiddlerText);
    transclusions.forEach(transclusion => {
      // Add to outgoing transclusions
      if ($tw.wiki.tiddlerExists(transclusion) && !this.relationshipCache.transclusions[tiddlerTitle].includes(transclusion)) {
        this.relationshipCache.transclusions[tiddlerTitle].push(transclusion);
      }
      
      // Add to incoming transclusions
      if ($tw.wiki.tiddlerExists(transclusion)) {
        if (!this.relationshipCache.backtransclusions[transclusion]) {
          this.relationshipCache.backtransclusions[transclusion] = [];
        }
        if (!this.relationshipCache.backtransclusions[transclusion].includes(tiddlerTitle)) {
          this.relationshipCache.backtransclusions[transclusion].push(tiddlerTitle);
        }
      }
    });
  });
  
  this.cacheInitialized = true;
  console.timeEnd("Building relationship index");
};

// Extract all links from text in a single regex pass
TiddlywikiMindmapWidget.prototype.extractLinks = function(text) {
  const links = [];
  const linkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g;
  let match;
  
  while ((match = linkRegex.exec(text)) !== null) {
    const linkedTitle = match[2] || match[1];
    links.push(linkedTitle);
  }
  
  return links;
};

// Extract all transclusions from text in a single regex pass
TiddlywikiMindmapWidget.prototype.extractTransclusions = function(text) {
  const transclusions = [];
  const transclusionRegex = /\{\{([^}]+)\}\}|\{\{\{([^}]+)\}\}\}/g;
  let match;
  
  while ((match = transclusionRegex.exec(text)) !== null) {
    const transcludedTitle = match[1] || match[2];
    // Filter out template parts and parameters
    const actualTitle = transcludedTitle.split("|")[0].trim();
    transclusions.push(actualTitle);
  }
  
  return transclusions;
};

// Get tiddlers that have at least one connection based on our index
TiddlywikiMindmapWidget.prototype.getConnectedTiddlers = function() {
  // Change from a simple Set to a Map that will store tiddler titles and their connection counts
  const connectedTiddlersMap = new Map();
  
  // Function to add a tiddler and increment its connection count
  const addTiddler = (title) => {
    if (!title) return;
    const currentCount = connectedTiddlersMap.get(title) || 0;
    connectedTiddlersMap.set(title, currentCount + 1);
  };

  // Add tiddlers with outgoing links
  Object.entries(this.relationshipCache.links).forEach(([source, targets]) => {
    if (targets.length > 0) {
      // Source gets one connection per target
      addTiddler(source);
      // Each target gets one connection
      targets.forEach(target => addTiddler(target));
    }
  });
  
  // Add tiddlers with incoming links
  Object.entries(this.relationshipCache.backlinks).forEach(([target, sources]) => {
    if (sources.length > 0) {
      // Target gets one connection per source
      addTiddler(target);
      // Each source gets one connection
      sources.forEach(source => addTiddler(source));
    }
  });
  
  // Add tiddlers with outgoing transclusions
  Object.entries(this.relationshipCache.transclusions).forEach(([source, targets]) => {
    if (targets.length > 0) {
      // Source gets one connection per target
      addTiddler(source);
      // Each target gets one connection
      targets.forEach(target => addTiddler(target));
    }
  });
  
  // Add tiddlers with incoming transclusions
  Object.entries(this.relationshipCache.backtransclusions).forEach(([target, sources]) => {
    if (sources.length > 0) {
      // Target gets one connection per source
      addTiddler(target);
      // Each source gets one connection
      sources.forEach(source => addTiddler(source));
    }
  });
  
  // Convert to array of [title, connectionCount] pairs and sort by connection count (descending)
  const sortedTiddlers = Array.from(connectedTiddlersMap.entries())
    .sort((a, b) => b[1] - a[1]) // Sort by connection count (descending)
    .map(([title, count]) => ({ title, connectionCount: count }));
  
  return sortedTiddlers;
};

// Create edges between tiddlers using our cached relationship data
TiddlywikiMindmapWidget.prototype.createEdgesFromIndex = function(tiddlerTitles) {
  // Use a Set to keep track of edges we've already created (in both directions)
  const processedEdges = new Set();
  
  // Clear existing edges
  this.mindmapData.edges = [];
  
  tiddlerTitles.forEach(source => {
    tiddlerTitles.forEach(target => {
      // Skip self connections
      if (source === target) return;
      
      // Skip if we've already processed this edge
      const edgeKey1 = `${source}:${target}`;
      const edgeKey2 = `${target}:${source}`;
      if (processedEdges.has(edgeKey1) || processedEdges.has(edgeKey2)) return;
      
      // Mark as processed
      processedEdges.add(edgeKey1);
      processedEdges.add(edgeKey2);
      
      // Collect all relationship types
      const relationships = [];
      
      // Check for links
      if (this.relationshipCache.links[source] && this.relationshipCache.links[source].includes(target)) {
        relationships.push("link");
      }
      
      // Check for backlinks
      if (this.relationshipCache.links[target] && this.relationshipCache.links[target].includes(source)) {
        relationships.push("backlink");
      }
      
      // Check for transclusions
      if (this.relationshipCache.transclusions[source] && this.relationshipCache.transclusions[source].includes(target)) {
        relationships.push("transclusion");
      }
      
      // Check for backtransclusions
      if (this.relationshipCache.transclusions[target] && this.relationshipCache.transclusions[target].includes(source)) {
        relationships.push("backtransclusion");
      }
      
      // Only add edge if there's at least one relationship
      if (relationships.length > 0) {
        this.mindmapData.edges.push({
          source: source,
          target: target,
          relationships: relationships
        });
      }
    });
  });
  
  console.log(`Created ${this.mindmapData.edges.length} edges between tiddlers`);
};

// Find all types of relationships between two tiddlers (using our cache)
TiddlywikiMindmapWidget.prototype.findRelationshipsBetween = function(sourceTiddler, targetTiddler) {
  const relationships = [];
  
  // Use our cached data for fast lookups
  
  // Check for links (source -> target)
  if (this.relationshipCache.links[sourceTiddler] && 
      this.relationshipCache.links[sourceTiddler].includes(targetTiddler)) {
    relationships.push("link");
  }
  
  // Check for backlinks (target -> source)
  if (this.relationshipCache.links[targetTiddler] && 
      this.relationshipCache.links[targetTiddler].includes(sourceTiddler)) {
    relationships.push("backlink");
  }
  
  // Check for transclusions (source -> target)
  if (this.relationshipCache.transclusions[sourceTiddler] && 
      this.relationshipCache.transclusions[sourceTiddler].includes(targetTiddler)) {
    relationships.push("transclusion");
  }
  
  // Check for backtransclusions (target -> source)
  if (this.relationshipCache.transclusions[targetTiddler] && 
      this.relationshipCache.transclusions[targetTiddler].includes(sourceTiddler)) {
    relationships.push("backtransclusion");
  }
  
  return relationships;
};

// Render the mind map based on current data
TiddlywikiMindmapWidget.prototype.renderMindMap = function(canvas) {
  // Clear canvas
  canvas.innerHTML = "";
  
  // Apply zoom and position transformations
  const transformGroup = $tw.utils.domMaker("div", {
    style: {
      position: "absolute",
      width: "100%",
      height: "100%",
      transform: `scale(${this.zoom}) translate(${this.offsetX}px, ${this.offsetY}px)`,
      transformOrigin: "center"
    }
  });
  
  canvas.appendChild(transformGroup);
  
  // Create a single SVG for all edges
  const edgesSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  edgesSvg.style.position = "absolute";
  edgesSvg.style.top = "0";
  edgesSvg.style.left = "0";
  edgesSvg.style.width = "100%";
  edgesSvg.style.height = "100%";
  edgesSvg.style.pointerEvents = "none";
  edgesSvg.style.overflow = "visible"; // Ensure edges aren't clipped
  
  // First render edges (so they're behind nodes)
  this.mindmapData.edges.forEach(edge => {
    const sourceNode = this.mindmapData.nodes.find(node => node.id === edge.source);
    const targetNode = this.mindmapData.nodes.find(node => node.id === edge.target);
    
    if (sourceNode && targetNode) {
      // Create SVG line for the edge
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", sourceNode.x);
      line.setAttribute("y1", sourceNode.y);
      line.setAttribute("x2", targetNode.x);
      line.setAttribute("y2", targetNode.y);
      
      // Style based on relationship types
      const relationships = edge.relationships || [];
      
      // Default style if no specific relationships defined
      if (relationships.length === 0) {
        line.setAttribute("stroke", "#999");
        line.setAttribute("stroke-width", "1.5");
      } else {
        // Different styles based on relationship type
        if (relationships.includes("link") || relationships.includes("backlink")) {
          // Links are blue
          line.setAttribute("stroke", "#4f8cff");
          line.setAttribute("stroke-width", "2");
        } 
        if (relationships.includes("transclusion") || relationships.includes("backtransclusion")) {
          // Transclusions are green with dashed line
          line.setAttribute("stroke", "#4caf50");
          line.setAttribute("stroke-width", "2");
          line.setAttribute("stroke-dasharray", "5,3");
        }
        
        // If it has multiple types, make it more prominent
        if (relationships.length > 1) {
          line.setAttribute("stroke-width", "3");
        }
      }
      
      edgesSvg.appendChild(line);
      
      // Add relationship indicators at midpoint
      if (relationships.length > 0) {
        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y + targetNode.y) / 2;
        
        // Add small circles for each relationship type at midpoint
        let offset = -8 * (relationships.length - 1) / 2;
        
        relationships.forEach(relType => {
          const indicator = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          indicator.setAttribute("cx", midX + offset);
          indicator.setAttribute("cy", midY);
          indicator.setAttribute("r", "4");
          
          // Color-code by relationship type
          switch(relType) {
            case "link":
              indicator.setAttribute("fill", "#4f8cff");
              break;
            case "backlink":
              indicator.setAttribute("fill", "#9c27b0");
              break;
            case "transclusion":
              indicator.setAttribute("fill", "#4caf50");
              break;
            case "backtransclusion":
              indicator.setAttribute("fill", "#ff9800");
              break;
            default:
              indicator.setAttribute("fill", "#999");
          }
          
          edgesSvg.appendChild(indicator);
          offset += 8; // Space between indicators
        });
      }
    }
  });
  
  transformGroup.appendChild(edgesSvg);
  
  // Stats display for debugging
  if (this.viewMode === "all") {
    const stats = $tw.utils.domMaker("div", {
      class: "mindmap-stats",
      style: {
        position: "absolute",
        top: "10px",
        left: "10px",
        background: "rgba(255, 255, 255, 0.8)",
        border: "1px solid #ddd",
        borderRadius: "4px",
        padding: "8px",
        fontSize: "12px",
        zIndex: "100"
      }
    });
    
    stats.textContent = `${this.mindmapData.nodes.length} tiddlers, ${this.mindmapData.edges.length} connections`;
    canvas.appendChild(stats);
  }
  
  // Then render nodes
  this.mindmapData.nodes.forEach(node => {
    // Calculate node size based on connection count if available
    let nodeWidth = 150;
    let nodeFontSize = "14px";
    let nodeBorderWidth = node.type === "central" ? "2px" : "1px";
    
    // If we have connection count data, use it to size the nodes
    if (node.connectionCount && this.viewMode === "all") {
      // Scale size based on connection count
      // The sqrt makes the scaling less extreme
      const scaleFactor = 1 + Math.sqrt(node.connectionCount) / 5;
      
      // Apply size adjustments
      nodeWidth = Math.min(250, Math.max(150, Math.round(150 * scaleFactor)));
      nodeFontSize = `${Math.min(18, Math.max(14, Math.round(14 * scaleFactor)))}px`;
      nodeBorderWidth = `${Math.min(4, Math.max(1, Math.round(node.connectionCount / 5)))}px`;
    }
    
    const nodeElement = $tw.utils.domMaker("div", {
      class: `mindmap-node ${node.type}`,
      text: node.connectionCount && this.viewMode === "all" ? 
        `${node.title} (${node.connectionCount})` : node.title,
      style: {
        position: "absolute",
        left: (node.x - nodeWidth/2) + "px",
        top: (node.y - 20) + "px",
        width: nodeWidth + "px",
        padding: "8px 12px",
        border: `${nodeBorderWidth} solid ${node.type === "central" ? "#4f8cff" : "#ccc"}`,
        borderRadius: "20px",
        background: node.type === "central" ? "#e6f0ff" : "#fff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        textAlign: "center",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
        fontSize: nodeFontSize
      }
    });
    
    // Make nodes draggable
    this.makeNodeDraggable(nodeElement, node);
    
    // Add click handler to open the tiddler
    nodeElement.addEventListener("click", (event) => {
      // If Ctrl/Cmd key is pressed, select for connection instead of opening
      if (event.ctrlKey || event.metaKey) {
        if (this.selectedNode === node.id) {
          // Deselect
          this.selectedNode = null;
          nodeElement.style.border = node.type === "central" ? `${nodeBorderWidth} solid #4f8cff` : `${nodeBorderWidth} solid #ccc`;
        } else {
          // Select this node, or create connection if another is already selected
          if (this.selectedNode) {
            // Create connection between nodes if they're not already connected
            const existingEdge = this.mindmapData.edges.find(
              e => (e.source === this.selectedNode && e.target === node.id) || 
                  (e.source === node.id && e.target === this.selectedNode)
            );
            
            if (!existingEdge) {
              // Look for actual relationships
              const relationships = this.findRelationshipsBetween(this.selectedNode, node.id);
              
              this.mindmapData.edges.push({
                source: this.selectedNode,
                target: node.id,
                relationships: relationships
              });
              
              // Save mindmap data after creating a connection
              this.saveMindmapData();
              
              this.renderMindMap(canvas);
            }
            
            // Reset selection
            this.selectedNode = null;
          } else {
            // Select this node
            this.selectedNode = node.id;
            nodeElement.style.border = `${nodeBorderWidth} solid #f80`;
          }
        }
      } else {
        // Regular click - open the tiddler
        new $tw.Story().navigateTiddler(node.id);
      }
    });
    
    transformGroup.appendChild(nodeElement);
  });
  
  // Add legend for relationship types
  // Add relationship legend to the canvas
  this.addRelationshipLegend(canvas);
};

// Add relationship legend to the canvas
TiddlywikiMindmapWidget.prototype.addRelationshipLegend = function(canvas) {
  const legend = $tw.utils.domMaker("div", {
    class: "mindmap-legend",
    style: {
      position: "absolute",
      bottom: "10px",
      right: "10px",
      background: "rgba(255, 255, 255, 0.8)",
      border: "1px solid #ddd",
      borderRadius: "4px",
      padding: "8px",
      fontSize: "12px",
      zIndex: "100"
    }
  });
  
  const legendTitle = $tw.utils.domMaker("div", {
    text: "Relationship Types:",
    style: {
      fontWeight: "bold",
      marginBottom: "5px"
    }
  });
  
  legend.appendChild(legendTitle);
  
  // Create legend entries
  const relationships = [
    { type: "link", color: "#4f8cff", label: "Link" },
    { type: "backlink", color: "#9c27b0", label: "Backlink" },
    { type: "transclusion", color: "#4caf50", label: "Transclusion" },
    { type: "backtransclusion", color: "#ff9800", label: "Backtransclusion" }
  ];
  
  relationships.forEach(rel => {
    const entry = $tw.utils.domMaker("div", {
      style: {
        display: "flex",
        alignItems: "center",
        marginBottom: "4px"
      }
    });
    
    const colorSwatch = $tw.utils.domMaker("div", {
      style: {
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        background: rel.color,
        marginRight: "6px"
      }
    });
    
    const label = $tw.utils.domMaker("span", {
      text: rel.label
    });
    
    entry.appendChild(colorSwatch);
    entry.appendChild(label);
    legend.appendChild(entry);
  });
  
  canvas.appendChild(legend);
};

// Make a node draggable
TiddlywikiMindmapWidget.prototype.makeNodeDraggable = function(element, node) {
  const self = this; // Store reference to widget instance
  let isDragging = false;
  let startX, startY;
  let originalX = node.x;
  let originalY = node.y;
  
  element.addEventListener("mousedown", (event) => {
    if (event.ctrlKey || event.metaKey) return; // Skip if Ctrl/Cmd is pressed (for selection)
    
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    
    // Prevent text selection during drag
    event.preventDefault();
    
    // Set highest z-index
    element.style.zIndex = "100";
  });
  
  document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;
    
    // Calculate new position
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    
    // Update node position in data
    node.x = originalX + dx / self.zoom; // Use self instead of this
    node.y = originalY + dy / self.zoom; // Use self instead of this
    
    // Update visual position
    element.style.left = (node.x - 75) + "px";
    element.style.top = (node.y - 20) + "px";
    
    // Update connecting lines
    self.updateConnectingLines(node); // Use self instead of this
  });
  
  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    
    isDragging = false;
    originalX = node.x;
    originalY = node.y;
    
    // Save mindmap data after dragging ends
    self.saveMindmapData();
    
    // Reset z-index
    element.style.zIndex = "";
  });
};

// Update lines connected to this node
TiddlywikiMindmapWidget.prototype.updateConnectingLines = function(node) {
  // Redraw all lines (for simplicity we just rerender the whole map)
  this.renderMindMap(this.canvas);
};

// Set up all event handlers for the widget
TiddlywikiMindmapWidget.prototype.setupEventHandlers = function(searchInput, resultsDropdown, addBtn, zoomInBtn, zoomOutBtn, resetBtn, canvas, message) {
  const self = this;
  
  // Search input handler
  searchInput.addEventListener("input", function() {
    const query = this.value.trim();
    
    if (!query) {
      resultsDropdown.style.display = "none";
      return;
    }
    
    // Find matching tiddlers
    const results = self.searchTiddlers(query);
    
    // Clear previous results
    resultsDropdown.innerHTML = "";
    
    // Position the dropdown under search input
    const searchRect = searchInput.getBoundingClientRect();
    resultsDropdown.style.top = (searchRect.bottom + window.scrollY) + "px";
    resultsDropdown.style.left = (searchRect.left + window.scrollX) + "px";
    resultsDropdown.style.width = searchRect.width + "px";
    
    // Add results
    if (results.length > 0) {
      results.forEach(title => {
        const resultItem = $tw.utils.domMaker("div", {
          text: title,
          style: {
            padding: "6px 10px",
            cursor: "pointer",
            borderBottom: "1px solid #eee"
          }
        });
        
        resultItem.addEventListener("mouseenter", () => {
          resultItem.style.background = "#f0f0f0";
        });
        
        resultItem.addEventListener("mouseleave", () => {
          resultItem.style.background = "";
        });
        
        resultItem.addEventListener("click", () => {
          searchInput.value = title;
          resultsDropdown.style.display = "none";
        });
        
        resultsDropdown.appendChild(resultItem);
      });
      
      resultsDropdown.style.display = "block";
    } else {
      resultsDropdown.style.display = "none";
    }
  });
  
  // Hide results when clicking outside
  document.addEventListener("click", (event) => {
    if (!searchInput.contains(event.target) && !resultsDropdown.contains(event.target)) {
      resultsDropdown.style.display = "none";
    }
  });
  
  // Add button handler
  addBtn.addEventListener("click", () => {
    const tiddlerTitle = searchInput.value.trim();
    
    if (!tiddlerTitle) {
      message.textContent = "Please enter a tiddler name";
      message.style.color = "#c00";
      return;
    }
    
    // Check if tiddler exists
    if (!$tw.wiki.tiddlerExists(tiddlerTitle)) {
      message.textContent = "Tiddler doesn't exist";
      message.style.color = "#c00";
      return;
    }
    
    // Check if already in the map
    if (self.mindmapData.nodes.some(node => node.id === tiddlerTitle)) {
      message.textContent = "Tiddler already on the map";
      message.style.color = "#c00";
      return;
    }
    
    // Add the tiddler to the map
    const centerX = canvas.offsetWidth / 2;
    const centerY = canvas.offsetHeight / 2;
    
    // If first node, place in center
    if (self.mindmapData.nodes.length === 0) {
      self.mindmapData.nodes.push({
        id: tiddlerTitle,
        title: tiddlerTitle,
        x: centerX,
        y: centerY,
        type: "central"
      });
    } else {
      // If connecting to selected node
      if (self.selectedNode) {
        const sourceNode = self.mindmapData.nodes.find(node => node.id === self.selectedNode);
        
        // Add at a random position near the selected node
        const angle = Math.random() * 2 * Math.PI;
        const radius = 150;
        const x = sourceNode.x + radius * Math.cos(angle);
        const y = sourceNode.y + radius * Math.sin(angle);
        
        self.mindmapData.nodes.push({
          id: tiddlerTitle,
          title: tiddlerTitle,
          x: x,
          y: y,
          type: "related"
        });
        
        // Find any existing relationships
        const relationships = self.findRelationshipsBetween(self.selectedNode, tiddlerTitle);
        
        // Add edge between the nodes
        self.mindmapData.edges.push({
          source: self.selectedNode,
          target: tiddlerTitle,
          relationships: relationships
        });
        
        // Clear selection
        self.selectedNode = null;
      } else {
        // Add at a random position
        const x = centerX + (Math.random() * 300 - 150);
        const y = centerY + (Math.random() * 300 - 150);
        
        self.mindmapData.nodes.push({
          id: tiddlerTitle,
          title: tiddlerTitle,
          x: x,
          y: y,
          type: "related"
        });
      }
    }
    
    // After adding new node, discover relationships with all existing nodes
    self.discoverAllRelationships(canvas);
    
    // Save mindmap data after modifying
    self.saveMindmapData();
    
    // Re-render the mind map
    self.renderMindMap(canvas);
    
    // Clear search
    searchInput.value = "";
    
    message.textContent = `Added '${tiddlerTitle}' to the mind map`;
    message.style.color = "#090";
  });
  
  // Add "Discover All Relationships" button to controls
  const discoverBtn = $tw.utils.domMaker("button", {
    text: "Find All Relationships",
    title: "Discover relationships between all tiddlers in the map",
    style: {
      padding: "4px 8px",
      marginLeft: "10px",
      cursor: "pointer"
    }
  });
  
  discoverBtn.addEventListener("click", () => {
    self.discoverAllRelationships(canvas);
    message.textContent = "All relationships updated";
    message.style.color = "#090";
  });
  
  // Add the button to the controls after reset button
  resetBtn.parentNode.appendChild(discoverBtn);
  
  // Zoom button handlers
  zoomInBtn.addEventListener("click", () => {
    self.zoom = Math.min(2, self.zoom + 0.1);
    self.renderMindMap(canvas);
  });
  
  zoomOutBtn.addEventListener("click", () => {
    self.zoom = Math.max(0.5, self.zoom - 0.1);
    self.renderMindMap(canvas);
  });
  
  resetBtn.addEventListener("click", () => {
    self.zoom = 1;
    self.offsetX = 0;
    self.offsetY = 0;
    self.renderMindMap(canvas);
  });
  
  // Canvas pan handling
  let isPanning = false;
  let panStartX, panStartY;
  
  canvas.addEventListener("mousedown", (event) => {
    // Only start panning if not on a node
    if (!event.target.closest(".mindmap-node")) {
      isPanning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      canvas.style.cursor = "grabbing";
      event.preventDefault();
    }
  });
  
  document.addEventListener("mousemove", (event) => {
    if (!isPanning) return;
    
    const dx = (event.clientX - panStartX) / self.zoom;
    const dy = (event.clientY - panStartY) / self.zoom;
    
    self.offsetX += dx;
    self.offsetY += dy;
    
    panStartX = event.clientX;
    panStartY = event.clientY;
    
    self.renderMindMap(canvas);
  });
  
  document.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = "";
    }
  });
  
  // Mousewheel zoom
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    
    // Get mouse position relative to canvas
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Zoom direction
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    const newZoom = Math.max(0.5, Math.min(2, self.zoom + delta));
    
    // Adjust zoom and offset
    self.zoom = newZoom;
    self.renderMindMap(canvas);
  });
};

// Search for tiddlers matching a query
TiddlywikiMindmapWidget.prototype.searchTiddlers = function(query) {
  const results = [];
  const lowerQuery = query.toLowerCase();
  
  $tw.wiki.each(function(tiddler, title) {
    // Skip system tiddlers
    if (title.startsWith("$:/")) return;
    
    // Match by title
    if (title.toLowerCase().includes(lowerQuery)) {
      results.push(title);
    }
  });
  
  // Limit to 10 results
  return results.slice(0, 10);
};

// Refresh the widget when tiddlers change
TiddlywikiMindmapWidget.prototype.refresh = function(changedTiddlers) {
  // First check if any of our attributes have changed
  const changedAttributes = this.computeAttributes();
  
  // If any configuration attributes changed, fully refresh
  if (changedAttributes.persistenceId || changedAttributes.storeInTiddler || changedAttributes.dataField) {
    console.log("Attribute change detected, refreshing widget");
    this.execute();
    this.refreshSelf();
    return true;
  }
  
  // Check for changes to the data source
  let shouldRefresh = false;
  
  if (this.storeInTiddler) {
    // Check if current tiddler changed
    const currentTiddler = this.getVariable("currentTiddler");
    if (currentTiddler && changedTiddlers[currentTiddler]) {
      console.log("Current tiddler changed, refreshing widget");
      shouldRefresh = true;
    }
  } else {
    // Check if system tiddler changed
    const systemTiddler = `$:/plugins/NoteStreams/WikiSage/mindmaps/${this.persistenceId}`;
    if (changedTiddlers[systemTiddler]) {
      console.log("System tiddler changed, refreshing widget");
      shouldRefresh = true;
    }
  }
  
  // Also refresh if the displayed tiddler changed
  const historyTiddler = changedTiddlers["$:/HistoryList"];
  if (historyTiddler) {
    console.log("History tiddler changed, refreshing widget");
    shouldRefresh = true;
  }
  
  if (shouldRefresh) {
    this.refreshSelf();
    return true;
  }
  
  return false;
};

// Add setBackground method to the prototype
TiddlywikiMindmapWidget.prototype.setBackground = function(backgroundValue, canvas) {
  // Store the background preference
  this.background = backgroundValue;
  
  // Apply the background to the canvas
  canvas.style.background = backgroundValue;
  
  // If this is a pattern, we need to set additional properties for proper tiling
  if (backgroundValue.startsWith('url')) {
    canvas.style.backgroundSize = "20px 20px";
    canvas.style.backgroundRepeat = "repeat";
  }
};

// *** PERSISTENCE METHODS ***

// Fix the execute method to handle attributes
TiddlywikiMindmapWidget.prototype.execute = function() {
  // Get the persistence ID from attributes
  this.persistenceId = this.getAttribute("persistenceId", "default");
  
  // Get option for storing in current tiddler - default is now "yes"
  const storeInTiddlerAttr = this.getAttribute("storeInTiddler", "yes");
  this.storeInTiddler = !(storeInTiddlerAttr === "no" || storeInTiddlerAttr === "false");
  
  // Get the field name to use when storing in current tiddler
  this.dataField = this.getAttribute("dataField", "mindmap-data");
  
  // Get the view mode from attributes
  this.viewMode = this.getAttribute("viewMode", "related");
  
  // Get the limit for all tiddlers view
  this.allTiddlersLimit = parseInt(this.getAttribute("allTiddlersLimit", "100"));
  
  // Debug info
  console.log("Mindmap widget execution:", {
    persistenceId: this.persistenceId,
    storeInTiddler: this.storeInTiddler,
    storeInTiddlerAttr,
    dataField: this.dataField,
    viewMode: this.viewMode,
    allTiddlersLimit: this.allTiddlersLimit
  });
};

// Try to load mindmap data from appropriate storage
TiddlywikiMindmapWidget.prototype.loadMindmapData = function() {
  try {
    let savedData = null;
    
    if (this.storeInTiddler) {
      // Try to load from current tiddler
      const currentTiddlerTitle = this.getVariable("currentTiddler");
      console.log("Attempting to load from tiddler:", currentTiddlerTitle);
      
      if (currentTiddlerTitle) {
        const tiddler = $tw.wiki.getTiddler(currentTiddlerTitle);
        if (tiddler && tiddler.fields[this.dataField]) {
          try {
            savedData = JSON.parse(tiddler.fields[this.dataField]);
            console.log("Successfully loaded mindmap data from tiddler field:", this.dataField);
          } catch (e) {
            console.error("Error parsing mindmap data from tiddler field:", e);
          }
        } else {
          console.log("No mindmap data found in tiddler field", this.dataField);
        }
      }
    } else {
      // Load from system tiddler
      const systemTiddlerTitle = `$:/plugins/NoteStreams/WikiSage/mindmaps/${this.persistenceId}`;
      console.log("Attempting to load from system tiddler:", systemTiddlerTitle);
      
      if ($tw.wiki.tiddlerExists(systemTiddlerTitle)) {
        try {
          savedData = JSON.parse($tw.wiki.getTiddlerText(systemTiddlerTitle) || "null");
          console.log("Successfully loaded mindmap data from system tiddler");
        } catch (e) {
          console.error("Error parsing mindmap data from system tiddler:", e);
        }
      } else {
        console.log("System tiddler does not exist:", systemTiddlerTitle);
      }
    }
    
    if (savedData && savedData.nodes && savedData.edges) {
      console.log("Valid mindmap data found, nodes:", savedData.nodes.length, "edges:", savedData.edges.length);
      return savedData;
    }
  } catch (e) {
    console.error("Error in loadMindmapData:", e);
  }
  
  // Return null if no valid data was found
  return null;
};

// Save mindmap data to appropriate storage
TiddlywikiMindmapWidget.prototype.saveMindmapData = function() {
  try {
    // Debug logging
    console.log("Saving mindmap data:", {
      storeInTiddler: this.storeInTiddler,
      nodes: this.mindmapData.nodes.length,
      edges: this.mindmapData.edges.length
    });
    
    // Create a safe copy of the data to avoid circular references
    const dataCopy = JSON.parse(JSON.stringify(this.mindmapData));
    
    if (this.storeInTiddler) {
      // Save to current tiddler
      const currentTiddlerTitle = this.getVariable("currentTiddler");
      
      if (!currentTiddlerTitle) {
        console.error("Cannot save - no current tiddler");
        return;
      }
      
      // Get existing tiddler
      const tiddler = $tw.wiki.getTiddler(currentTiddlerTitle);
      if (!tiddler) {
        console.error("Cannot save - tiddler not found:", currentTiddlerTitle);
        return;
      }
      
      // Create new fields object with existing fields plus mindmap data
      const newFields = { ...tiddler.fields };
      newFields[this.dataField] = JSON.stringify(dataCopy);
      
      // Create new tiddler with updated fields
      const newTiddler = new $tw.Tiddler(newFields);
      
      // Save the updated tiddler
      try {
        $tw.wiki.addTiddler(newTiddler);
        console.log("Successfully saved mindmap data to tiddler field:", this.dataField);
      } catch (e) {
        console.error("Error saving to tiddler:", e);
      }
    } else {
      // Save to system tiddler
      const systemTiddlerTitle = `$:/plugins/NoteStreams/WikiSage/mindmaps/${this.persistenceId}`;
      
      try {
        $tw.wiki.setText(
          systemTiddlerTitle,
          "text",
          null,
          JSON.stringify(dataCopy)
        );
        
        $tw.wiki.setText(
          systemTiddlerTitle,
          "type",
          null,
          "application/json"
        );
        
        console.log("Successfully saved mindmap data to system tiddler");
      } catch (e) {
        console.error("Error saving to system tiddler:", e);
      }
    }
  } catch (e) {
    console.error("Error in saveMindmapData:", e);
  }
};

// Helper function to get widget attribute values with defaults
TiddlywikiMindmapWidget.prototype.getAttribute = function(name, defaultValue) {
  if (this.attributes && this.attributes[name] !== undefined) {
    return this.attributes[name];
  }
  return defaultValue;
};

// Replace computeAttributes to avoid potential recursion
TiddlywikiMindmapWidget.prototype.computeAttributes = function() {
  // Call the original Widget.prototype.computeAttributes to properly handle TiddlyWiki attributes
  return Widget.prototype.computeAttributes.call(this);
};

// Custom refreshSelf to properly handle widget refresh
TiddlywikiMindmapWidget.prototype.refreshSelf = function() {
  // Remove old DOM nodes
  this.removeChildDomNodes();
  
  // Render again
  this.render(this.parentDomNode, null);
};

// Add methods to discover ALL relationships between ALL tiddlers in the map
TiddlywikiMindmapWidget.prototype.discoverAllRelationships = function(canvas) {
  // Process each node in the map to discover all possible relationships
  const nodeIds = this.mindmapData.nodes.map(node => node.id);
  const existingEdges = new Set();
  
  // Track existing edges
  this.mindmapData.edges.forEach(edge => {
    existingEdges.add(`${edge.source}:${edge.target}`);
    existingEdges.add(`${edge.target}:${edge.source}`); // For bidirectional checking
  });
  
  // For each pair of nodes, check if there are relationships between them
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const sourceId = nodeIds[i];
      const targetId = nodeIds[j];
      
      // Skip if this relationship is already tracked
      if (existingEdges.has(`${sourceId}:${targetId}`)) continue;
      
      // Check for relationships between source and target
      const relationships = this.findRelationshipsBetween(sourceId, targetId);
      
      if (relationships.length > 0) {
        // Add new edge if relationships found
        this.mindmapData.edges.push({
          source: sourceId,
          target: targetId,
          relationships: relationships
        });
      }
    }
  }
  
  // Save and redraw
  this.saveMindmapData();
  this.renderMindMap(canvas);
};

// Find and add related tiddlers to a node
TiddlywikiMindmapWidget.prototype.addRelatedTiddlers = function(tiddlerTitle, canvas) {
  // Look for links in the tiddler
  const tiddlerText = $tw.wiki.getTiddlerText(tiddlerTitle) || "";
  const linkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g;
  let match;
  let connectedTiddlers = [];
  
  // Find all links in the tiddler
  while ((match = linkRegex.exec(tiddlerText)) !== null) {
    const linkedTitle = match[2] || match[1];
    if ($tw.wiki.tiddlerExists(linkedTitle)) {
      connectedTiddlers.push({
        title: linkedTitle,
        type: "link"
      });
    }
  }
  
  // Find transclusions ({{}} or {{{ }}} format)
  const transclusionRegex = /\{\{([^}]+)\}\}|\{\{\{([^}]+)\}\}\}/g;
  while ((match = transclusionRegex.exec(tiddlerText)) !== null) {
    const transcludedTitle = match[1] || match[2];
    // Filter out template parts and parameters
    const actualTitle = transcludedTitle.split("|")[0].trim();
    if ($tw.wiki.tiddlerExists(actualTitle)) {
      connectedTiddlers.push({
        title: actualTitle,
        type: "transclusion"
      });
    }
  }
  
  // Also look for tiddlers that link to this one (backlinks)
  const backlinks = this.findBacklinks(tiddlerTitle);
  backlinks.forEach(backlink => {
    connectedTiddlers.push({
      title: backlink,
      type: "backlink"
    });
  });
  
  // Look for tiddlers that transclude this one (backtransclusions)
  const backtransclusions = this.findBacktransclusions(tiddlerTitle);
  backtransclusions.forEach(backtransclusion => {
    connectedTiddlers.push({
      title: backtransclusion,
      type: "backtransclusion"
    });
  });
  
  // Filter to unique tiddlers (might have multiple relationship types)
  const uniqueTitles = [...new Set(connectedTiddlers.map(item => item.title))];
  
  // Add connected tiddlers in a radial pattern
  const centerNode = this.mindmapData.nodes.find(node => node.id === tiddlerTitle);
  if (!centerNode) return;
  
  // Increase the radius to create much more space between related nodes
  // Dynamic radius based on the number of connections and canvas size
  const canvasSize = Math.min(canvas.offsetWidth, canvas.offsetHeight);
  const baseRadius = canvasSize * 0.35; // Start with 35% of canvas size
  
  // Scale radius based on number of connections
  // Use a non-linear scaling to handle many connections gracefully
  const relationshipCount = uniqueTitles.length;
  const radius = baseRadius * (1 + 0.15 * Math.log(Math.max(relationshipCount, 1) + 1));
  
  // Even spacing around the circle
  const step = (2 * Math.PI) / uniqueTitles.length;
  
  uniqueTitles.forEach((title, index) => {
    // Skip if node already exists
    if (this.mindmapData.nodes.some(node => node.id === title)) return;
    
    const angle = index * step;
    
    // Add substantial randomization to positioning for a more natural look
    const jitter = 12.9; // 90% positional variation
    const jitteredRadius = radius * (1 - jitter/2 + jitter * Math.random());
    const jitteredAngle = angle + step * jitter * (Math.random() - 0.5);
    
    const x = centerNode.x + jitteredRadius * Math.cos(jitteredAngle);
    const y = centerNode.y + jitteredRadius * Math.sin(jitteredAngle);
    
    // Get all relationship types for this tiddler
    const relationships = connectedTiddlers
      .filter(item => item.title === title)
      .map(item => item.type);
    
    // Add node
    const newNode = {
      id: title,
      title: title,
      x: x,
      y: y,
      type: "related",
      relationships: relationships
    };
    
    this.mindmapData.nodes.push(newNode);
    
    // Add edge with relationship types
    this.mindmapData.edges.push({
      source: tiddlerTitle,
      target: title,
      relationships: relationships
    });
  });
  
  // Re-render mind map
  this.renderMindMap(canvas);
};

// Find tiddlers that link to the specified tiddler
TiddlywikiMindmapWidget.prototype.findBacklinks = function(tiddlerTitle) {
  const backlinks = [];
  $tw.wiki.each(function(tiddler, title) {
    if (title === tiddlerTitle) return;
    
    const text = tiddler.fields.text || "";
    const escapedTitle = tiddlerTitle.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const linkRegex = new RegExp("\\[\\[(.*?\\|)?" + escapedTitle + "\\]\\]");
    
    if (linkRegex.test(text)) {
      backlinks.push(title);
    }
  });
  
  return backlinks;
};

// Find tiddlers that transclude the specified tiddler
TiddlywikiMindmapWidget.prototype.findBacktransclusions = function(tiddlerTitle) {
  const backtransclusions = [];
  const escapedTitle = tiddlerTitle.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  
  $tw.wiki.each(function(tiddler, title) {
    if (title === tiddlerTitle) return;
    
    const text = tiddler.fields.text || "";
    // Match both {{}} and {{{}}}} transclusion formats
    const transclusionRegex = new RegExp("\\{\\{" + escapedTitle + "(\\|[^}]+)?\\}\\}|\\{\\{\\{" + escapedTitle + "(\\|[^}]+)?\\}\\}\\}");
    
    if (transclusionRegex.test(text)) {
      backtransclusions.push(title);
    }
  });
  
  return backtransclusions;
};

// Arrange tiddlers in a circle
TiddlywikiMindmapWidget.prototype.arrangeInCircle = function(tiddlerTitles, canvas, tiddlersWithCounts) {
  const count = tiddlerTitles.length;
  const centerX = canvas.offsetWidth / 2;
  const centerY = canvas.offsetHeight / 2;
  
  // Increase the radius to create much more space between nodes
  // Scale the radius based on the canvas size and number of nodes
  const canvasSize = Math.min(canvas.offsetWidth, canvas.offsetHeight);
  
  // Much larger base radius - use up to 85% of available space
  const baseRadius = canvasSize * 0.425; // Use 85% diameter
  
  // Scale radius based on number of nodes - more nodes = larger circle
  // This scales non-linearly to accommodate larger numbers of tiddlers
  let radius = baseRadius;
  if (count > 5) {
    // Scale up radius based on node count, using a logarithmic scale
    // This provides more space for larger numbers of nodes
    radius = baseRadius * (1 + 0.2 * Math.log10(count));
  }
  
  // Minimum spacing between nodes (in radians)
  const minAngleSpacing = Math.PI / 32; // Minimum angular separation
  
  // Add even more spacing when there are few nodes
  const angleSpacing = count < 10 ? 
    Math.max(minAngleSpacing, 2 * Math.PI / (count * 3)) : // Lots of space for few nodes
    minAngleSpacing;
  
  tiddlerTitles.forEach((title, index) => {
    // Find connection count if available
    let connectionCount = 1;
    if (tiddlersWithCounts) {
      const tiddlerInfo = tiddlersWithCounts.find(t => t.title === title);
      if (tiddlerInfo) {
        connectionCount = tiddlerInfo.connectionCount;
      }
    }
    
    // Space nodes evenly around circle, with intentional gaps
    const angle = (index / count) * 2 * Math.PI;
    
    // Add more randomness to the radius for each node to avoid perfect alignment
    // Increase the randomness for a more natural, spread-out look
    const jitterAmount = 0.25; // Up to 25% variation
    const nodeRadius = radius * (1 - jitterAmount/2 + jitterAmount * Math.random());
    
    // Also add some random angular displacement for a more natural distribution
    const angularJitter = angleSpacing * (Math.random() - 0.5);
    const finalAngle = angle + angularJitter;
    
    const x = centerX + nodeRadius * Math.cos(finalAngle);
    const y = centerY + nodeRadius * Math.sin(finalAngle);
    
    // Determine node type based on connection count
    let nodeType = "related";
    if (connectionCount >= 10) {
      nodeType = "central"; // Highly connected nodes get central styling
    }
    
    this.mindmapData.nodes.push({
      id: title,
      title: title,
      x: x,
      y: y,
      type: nodeType,
      connectionCount: connectionCount
    });
  });
};

// Arrange using a basic force-directed layout algorithm
TiddlywikiMindmapWidget.prototype.arrangeWithForceLayout = function(tiddlerTitles, canvas, tiddlersWithCounts) {
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  const count = tiddlerTitles.length;
  
  // Create initial positions using a more spread out grid pattern
  const nodes = tiddlerTitles.map((title, index) => {
    // Try to find the connection count for this tiddler if available
    let connectionCount = 1;
    if (tiddlersWithCounts) {
      const tiddlerInfo = tiddlersWithCounts.find(t => t.title === title);
      if (tiddlerInfo) {
        connectionCount = tiddlerInfo.connectionCount;
      }
    }
    
    // Use a spiral or grid layout for better initial distribution
    const gridCols = Math.ceil(Math.sqrt(count * 1.5)); // Increase spacing by using more columns
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);
    
    // Calculate initial position using a more spread out grid
    // Use 90% of canvas area with extra padding
    return {
      id: title,
      title: title,
      x: width * (0.05 + 0.9 * col / (gridCols - 1 || 1)),
      y: height * (0.05 + 0.9 * row / (Math.ceil(count / gridCols) - 1 || 1)),
      type: "related",
      vx: 0,
      vy: 0,
      connectionCount: connectionCount // Store connection count for later use
    };
  });
  
  // Force-directed layout simulation with increased forces
  const iterations = 150; // More iterations for better layout
  const repulsion = count < 50 ? 4000 : 2500; // Significantly stronger repulsion, scaled by node count
  const centerAttraction = 0.005; // Even weaker center attraction
  
  // Dynamically scale the minimum distance based on the number of nodes and canvas size
  const minDistance = Math.max(
    250, // Absolute minimum
    Math.min(width, height) * 0.25, // 25% of canvas dimension
    350 / Math.sqrt(count) * 10 // Scale down gradually with more nodes, but maintain good spacing
  );
  
  // Run simulation for more iterations to improve layout
  for (let i = 0; i < iterations; i++) {
    // Calculate forces for each node
    for (let a = 0; a < nodes.length; a++) {
      let fx = 0, fy = 0;
      const nodeA = nodes[a];
      
      // Very weak attraction to center to allow more spreading
      fx += (width/2 - nodeA.x) * centerAttraction;
      fy += (height/2 - nodeA.y) * centerAttraction;
      
      // Add a slight outward force to push nodes away from center
      const distanceFromCenter = Math.sqrt(
        Math.pow(nodeA.x - width/2, 2) + 
        Math.pow(nodeA.y - height/2, 2)
      );
      
      if (distanceFromCenter < width * 0.3) { // Only push outward if close to center
        // Normalized direction vector from center
        const dx = (nodeA.x - width/2) / (distanceFromCenter || 1);
        const dy = (nodeA.y - height/2) / (distanceFromCenter || 1);
        
        // Add outward force
        fx += dx * 5;
        fy += dy * 5;
      }
      
      // Strong repulsion from other nodes
      for (let b = 0; b < nodes.length; b++) {
        if (a === b) continue;
        
        const nodeB = nodes[b];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared) || 1;
        
        // Apply much stronger repulsive force within a larger minimum distance
        if (distance < minDistance) {
          // Use a stronger inverse square law with distance
          const force = repulsion / (distanceSquared || 1);
          fx += dx * force / distance;
          fy += dy * force / distance;
        }
      }
      
      // Apply forces with damping to prevent oscillation
      nodeA.vx = (nodeA.vx + fx) * 0.6; // More damping for stability
      nodeA.vy = (nodeA.vy + fy) * 0.6;
      nodeA.x += nodeA.vx;
      nodeA.y += nodeA.vy;
      
      // Use a border padding proportional to canvas size
      const padding = Math.min(width, height) * 0.05; // 5% padding
      nodeA.x = Math.max(padding, Math.min(width - padding, nodeA.x));
      nodeA.y = Math.max(padding, Math.min(height - padding, nodeA.y));
    }
    
    // Optional: add cooling factor for later iterations
    if (i > iterations * 0.7) { // In the last 30% of iterations
      // Gradually reduce velocity to stabilize the layout
      nodes.forEach(node => {
        node.vx *= 0.95;
        node.vy *= 0.95;
      });
    }
  }
  
  // Add the positioned nodes to the mind map
  nodes.forEach(node => {
    // Determine node type and size based on connection count
    let nodeType = "related";
    
    // This is a hack to make node visually reflect its importance
    // In a real implementation, we would modify the CSS instead
    if (node.connectionCount) {
      // The "type" field affects styling in renderMindMap
      if (node.connectionCount >= 10) {
        nodeType = "central"; // Most connected nodes get central styling
      }
    }
    
    this.mindmapData.nodes.push({
      id: node.id,
      title: node.title,
      x: node.x,
      y: node.y,
      type: nodeType,
      connectionCount: node.connectionCount
    });
  });
};

// Add a legend showing connection count information
TiddlywikiMindmapWidget.prototype.addConnectionCountLegend = function(canvas, tiddlers) {
  // Only add this legend in "all" mode with connection count data
  if (this.viewMode !== "all" || !tiddlers || !tiddlers[0].connectionCount) return;
  
  const legend = $tw.utils.domMaker("div", {
    class: "mindmap-connection-legend",
    style: {
      position: "absolute",
      top: "10px",
      right: "10px",
      background: "rgba(255, 255, 255, 0.8)",
      border: "1px solid #ddd",
      borderRadius: "4px",
      padding: "8px",
      fontSize: "12px",
      zIndex: "100"
    }
  });
  
  const legendTitle = $tw.utils.domMaker("div", {
    text: "Connection Counts:",
    style: {
      fontWeight: "bold",
      marginBottom: "5px"
    }
  });
  
  legend.appendChild(legendTitle);
  
  // Find max and min connection counts
  const maxConnections = tiddlers[0].connectionCount;
  const minConnections = tiddlers[tiddlers.length - 1].connectionCount;
  
  const maxEntry = $tw.utils.domMaker("div", {
    text: `Most: ${maxConnections} connections (${tiddlers[0].title})`,
    style: { marginBottom: "4px" }
  });
  
  const minEntry = $tw.utils.domMaker("div", {
    text: `Least: ${minConnections} connections`,
    style: { marginBottom: "4px" }
  });
  
  const averageConnections = Math.round(tiddlers.reduce((sum, t) => sum + t.connectionCount, 0) / tiddlers.length);
  const avgEntry = $tw.utils.domMaker("div", {
    text: `Average: ${averageConnections} connections`,
    style: { marginBottom: "4px" }
  });
  
  legend.appendChild(maxEntry);
  legend.appendChild(minEntry);
  legend.appendChild(avgEntry);
  
  canvas.appendChild(legend);
};

exports["mindmap"] = TiddlywikiMindmapWidget; 