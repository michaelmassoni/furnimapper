const containerElement = document.getElementById('canvas-container');
const width = containerElement.offsetWidth;
const height = containerElement.offsetHeight;

// Initialize Konva Stage and Layers
const stage = new Konva.Stage({
    container: 'canvas-container',
    width: width,
    height: height,
});

// Update stage size on window resize
window.addEventListener('resize', () => {
    const container = document.getElementById('canvas-container');
    const newWidth = container.offsetWidth;
    const newHeight = container.offsetHeight;

    stage.width(newWidth);
    stage.height(newHeight);

    // Redraw grid to cover new area
    updateGrid(newWidth, newHeight);
});

// Create separate layers for background image and drawing elements
const backgroundLayer = new Konva.Layer(); // Layer for the background image
const layer = new Konva.Layer(); // Layer for grid and furniture

// Add layers to stage in the correct order (background first)
stage.add(backgroundLayer);
stage.add(layer);

// Data structure to store all objects (rectangles, etc.)
let objects = [];

// State variables for object selection and rotation
let selectedObjectIndex = -1; // Index of the currently selected object (-1 means none)
const rotationIncrement = 30; // Rotation increment in degrees

// State variable for showing dimensions
let showDimensions = false; // Default to not showing dimensions

// Furniture Import Builder State
let pendingFurnitureItems = [];


// History System
const historyStack = [];
let historyStep = -1;
let isHistoryAction = false;
const MAX_HISTORY = 50;

function saveState() {
    if (isHistoryAction) return;

    // Prune future history if we're not at the latest step
    if (historyStep < historyStack.length - 1) {
        historyStack.length = historyStep + 1;
    }

    // Limit history size
    if (historyStack.length >= MAX_HISTORY) {
        historyStack.shift();
        historyStep--;
    }
    // Get background image data if available
    let bgImageData = null;
    let bgImageDims = null;
    if (backgroundImage && backgroundImage.image()) {
        try {
            bgImageData = backgroundImage.image().src;
            bgImageDims = {
                width: backgroundImage.width(),
                height: backgroundImage.height(),
                x: backgroundImage.x(),
                y: backgroundImage.y(),
                // Store the stage dimensions at the time of saving to ensure correct scaling/positioning
                // We're already storing scalePixelsPerCm, but background position depends on stage size
            };
        } catch (e) {
            console.warn("Could not save background image (likely cross-origin)", e);
        }
    }

    const state = {
        objects: objects.map(obj => ({
            type: obj.type,
            label: obj.label,
            width_cm: obj.width_cm,
            height_cm: obj.height_cm,
            x_pixels: obj.x_pixels,
            y_pixels: obj.y_pixels,
            rotation_degrees: obj.rotation_degrees || 0,
            color: obj.shape.fill() // Save the color
        })),
        scalePixelsPerCm: scalePixelsPerCm,
        background: bgImageData ? {
            data: bgImageData,
            dims: bgImageDims
        } : null
    };

    const json = JSON.stringify(state);

    // Don't save if state hasn't changed (basic check)
    if (historyStack.length > 0 && historyStack[historyStack.length - 1] === json) {
        return;
    }

    historyStack.push(json);
    historyStep++;
    updateUndoRedoButtons();
    saveToLocalStorage();
}

function saveToLocalStorage() {
    if (historyStep >= 0 && historyStack[historyStep]) {
        try {
            localStorage.setItem('furnimap_autosave', historyStack[historyStep]);
        } catch (e) {
            console.error("Auto-save failed (likely storage limit):", e);
            // Optional: Notify user? 
            // For now just error log to avoid breaking the app flow
        }
    }
}

function undo() {
    if (historyStep > 0) {
        historyStep--;
        isHistoryAction = true; // Prevent saving state during undo
        loadState(historyStack[historyStep]);
        isHistoryAction = false;
        updateUndoRedoButtons();
        saveToLocalStorage(); // Sync current viewed state to storage
    }
}

function redo() {
    if (historyStep < historyStack.length - 1) {
        historyStep++;
        isHistoryAction = true;
        loadState(historyStack[historyStep]);
        isHistoryAction = false;
        updateUndoRedoButtons();
        saveToLocalStorage();
    }
}

function loadState(json) {
    try {
        const state = JSON.parse(json);

        // Restore Scale
        if (state.scalePixelsPerCm) {
            scalePixelsPerCm = state.scalePixelsPerCm;
            updateScaleButtonText();
        }

        // Clear existing objects
        clearAllObjects(); // Ensure this function exists or is implemented below

        // Restore Objects
        if (state.objects) {
            // We need to re-create the visual elements for each object
            // NOTE: createObjectFromData needs to return the object reference or we push it manually.
            // Based on `importFloorGrid`, we might need to be careful.
            // Let's reuse logic from export/import if available, or just replicate creation.
            // Actually, `createObjectFromData` is used in import. Let's use it.

            state.objects.forEach(item => {
                createObjectFromData(item);
            });
        }

        // Restore Background Image
        if (state.background && state.background.data) {
            const img = new Image();
            img.onload = () => {
                if (backgroundImage) backgroundImage.destroy();

                // If we possess saved dimensions/position, use them
                // Otherwise fit to stage as before? 
                // Let's rely on saved dims if available for exact restoration

                const dims = state.background.dims;

                // Center the image on the stage if new stage size is different? 
                // Or just restore exactly? Restoring exactly is safer for alignment.
                // But if window resized? 
                // Let's start with exact restoration of position/size

                backgroundImage = new Konva.Image({
                    x: dims ? dims.x : 0,
                    y: dims ? dims.y : 0,
                    image: img,
                    width: dims ? dims.width : img.width,
                    height: dims ? dims.height : img.height,
                    listening: false,
                });

                // Add to layer and move to bottom
                backgroundLayer.add(backgroundImage);
                backgroundImage.moveToBottom();
                backgroundLayer.batchDraw();

                // Also update grid
                updateGrid(stage.width(), stage.height());
            };
            img.src = state.background.data;
        }
    } catch (e) {
        console.error("Failed to load state", e);
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.disabled = historyStep <= 0;
    if (redoBtn) redoBtn.disabled = historyStep >= historyStack.length - 1;
}

function saveToLocalStorage() {
    if (historyStep >= 0 && historyStack[historyStep]) {
        localStorage.setItem('furnimap_autosave', historyStack[historyStep]);
    }
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('furnimap_autosave');
    if (saved) {
        // Push initial state if stack is empty
        if (historyStack.length === 0) {
            historyStack.push(saved);
            historyStep = 0;
            loadState(saved);
            updateUndoRedoButtons();
        }
    }
}

// Make sure all elements are properly initialized when the DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    // Initialize toggle checkboxes
    document.getElementById('show-dimensions-toggle').checked = showDimensions;

    // Ensure Paste Furniture button and modal are properly initialized
    const pasteFurnitureBtn = document.getElementById('paste-furniture-btn');
    if (pasteFurnitureBtn) {
        pasteFurnitureBtn.addEventListener('click', showPasteFurnitureModal);
        console.log('Paste Furniture button initialized');
    } else {
        console.error('Paste Furniture button not found');
    }

    // Initialize modal elements
    pasteFurnitureModal = document.getElementById('paste-furniture-modal');
    furnitureDataTextarea = document.getElementById('furniture-data');
    parseFurnitureBtn = document.getElementById('parse-furniture-btn'); // Old button, might be gone
    cancelPasteBtn = document.getElementById('cancel-paste-btn');

    // New builder elements
    const builderAddBtn = document.getElementById('builder-add-btn');
    const processBulkPasteBtn = document.getElementById('process-bulk-paste-btn');
    const clearListBtn = document.getElementById('clear-list-btn');
    const commitFurnitureBtn = document.getElementById('commit-furniture-btn');

    if (builderAddBtn) builderAddBtn.addEventListener('click', addFurnitureFromBuilder);
    if (processBulkPasteBtn) processBulkPasteBtn.addEventListener('click', processBulkPaste);
    if (clearListBtn) clearListBtn.addEventListener('click', clearFurnitureList);
    if (commitFurnitureBtn) commitFurnitureBtn.addEventListener('click', commitFurnitureToPlan);

    if (cancelPasteBtn) {
        cancelPasteBtn.addEventListener('click', hidePasteFurnitureModal);
        console.log('Cancel Paste button initialized');
    } else {
        console.error('Cancel Paste button not found');
    }

    // Initialize Auto-detect Scale button
    const autoDetectBtn = document.getElementById('auto-detect-btn');
    if (autoDetectBtn) {
        autoDetectBtn.addEventListener('click', autoDetectScale);
        console.log('Auto Detect button initialized');
    } else {
        console.error('Auto Detect button not found');
    }

    // Initialize Undo/Redo buttons
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) {
        undoBtn.addEventListener('click', undo);
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', redo);
    }

    // Load auto-saved data
    loadFromLocalStorage();

    // If no history (fresh load), save initial state
    if (historyStack.length === 0) {
        saveState();
    }

    // Keyboard shortcuts for Undo/Redo
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            redo();
        }
    });
});

// State variables for scale definition
let isScaleDefinitionMode = false; // Flag to track if we're in scale definition mode
let scaleStartPoint = null; // Starting point of the scale line
let scaleEndPoint = null; // Ending point of the scale line
let scalePixelsPerCm = null; // Calculated scale (pixels per cm)
let scaleLine = null; // Reference to the scale line object

// Create temporary line for scale definition
let tempScaleLine = new Konva.Line({
    points: [],
    stroke: '#FF5722', // Orange color for scale line
    strokeWidth: 3,
    dash: [10, 5], // Dashed line for visual distinction
});
layer.add(tempScaleLine);

// Rectangle modal elements
const rectangleModal = document.getElementById('rectangle-modal');
const rectangleWidthInput = document.getElementById('rectangle-width');
const rectangleHeightInput = document.getElementById('rectangle-height');
const rectangleLabelInput = document.getElementById('rectangle-label');
const addRectangleConfirmBtn = document.getElementById('add-rectangle-confirm-btn');
const cancelRectangleBtn = document.getElementById('cancel-rectangle-btn');

// Paste Furniture modal elements - these are initialized in the DOMContentLoaded event
let pasteFurnitureModal;
let furnitureDataTextarea;
let parseFurnitureBtn;
let cancelPasteBtn;

// Handle mouse clicks on stage
stage.on('click', (e) => {
    // Get the clicked target
    const clickedTarget = e.target;

    // Check if we clicked on a rectangle (prioritize rectangle selection)
    const clickedOnRect = clickedTarget instanceof Konva.Rect;
    const clickedOnText = clickedTarget instanceof Konva.Text;

    // If we clicked on a rectangle or its text, don't proceed further
    // The rectangle's own click handler will handle selection
    if (clickedOnRect || clickedOnText) {
        return;
    }

    // If we clicked on the stage (not on any object), deselect any selected object
    if (clickedTarget === stage) {
        deselectObject();
    }
});

// Generate a random color with specified opacity
function getRandomColor(opacity = 1) {
    const r = Math.floor(Math.random() * 200);
    const g = Math.floor(Math.random() * 200);
    const b = Math.floor(Math.random() * 200);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Function to draw grid lines
function drawGrid() {
    const gridSize = 20;

    // Draw vertical lines
    for (let i = 0; i <= width; i += gridSize) {
        const verticalLine = new Konva.Line({
            points: [i, 0, i, height],
            stroke: '#ccc',
            strokeWidth: 0.5,
        });
        layer.add(verticalLine);
    }

    // Draw horizontal lines
    for (let i = 0; i <= height; i += gridSize) {
        const horizontalLine = new Konva.Line({
            points: [0, i, width, i],
            stroke: '#ccc',
            strokeWidth: 0.5,
        });
        layer.add(horizontalLine);
    }

    layer.batchDraw();
}

// Draw initial grid lines
// Draw initial grid lines
updateGrid(width, height);

// Image upload functionality
const imageUploadInput = document.getElementById('image-upload');
let backgroundImage = null;

// Handle image upload
imageUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Only process image files
    if (!file.type.match('image.*')) {
        alert('Please select an image file');
        return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            // Remove any existing background image
            if (backgroundImage) {
                backgroundImage.destroy();
            }

            // Do NOT resize stage to match image, keeping stage full screen
            // Calculate scale to fit image within the current stage or just ensure it's reasonable
            // Let's fit it within the view (with some padding) but keep aspect ratio
            const padding = 20;
            const availableWidth = stage.width() - (padding * 2);
            const availableHeight = stage.height() - (padding * 2);

            let newWidth = img.width;
            let newHeight = img.height;

            // Calculate scale factor to fit within view initially (nice UX)
            const scaleX = availableWidth / img.width;
            const scaleY = availableHeight / img.height;
            const scale = Math.min(scaleX, scaleY, 1); // Don't upscale if smaller than screen, just fit or actual size

            newWidth = img.width * scale;
            newHeight = img.height * scale;

            // Center the image on the stage
            const centerX = (stage.width() - newWidth) / 2;
            const centerY = (stage.height() - newHeight) / 2;

            // Create new Konva image
            backgroundImage = new Konva.Image({
                x: centerX,
                y: centerY,
                image: img,
                width: newWidth,  // Scale to calculated width
                height: newHeight, // Scale to calculated height
                listening: false, // Don't capture events on the image
            });

            // Add the image to the background layer
            backgroundLayer.add(backgroundImage);

            // Move the image to the bottom of the layer
            backgroundImage.moveToBottom();

            // Redraw the background layer
            backgroundLayer.batchDraw();

            // Also redraw the main layer (grid lines might need adjusting if we were dynamic with them)
            // Ensure grid covers the whole stage
            updateGrid(stage.width(), stage.height());

            // Save state after loading image
            saveState();
        };
        img.src = event.target.result;
    };

    // Read the image file as a data URL
    reader.readAsDataURL(file);
});

// Helper to redraw grid (needs to be added or modified from drawGrid)
function updateGrid(w, h) {
    layer.find('Line').forEach(node => {
        // Simple heuristic: if it looks like a grid line (gray stroke), destroy it
        // Or better, just clear lines and redraw. 
        // For simplicity in this patch, we'll assume drawGrid manages its own lines or we just re-call it.
        // Actually, existing drawGrid creates new lines. We should clear old grid lines first.
        if (node.attrs.stroke === '#ccc') {
            node.destroy();
        }
    });

    const gridSize = 20;

    // Draw vertical lines
    for (let i = 0; i <= w; i += gridSize) {
        const verticalLine = new Konva.Line({
            points: [i, 0, i, h],
            stroke: '#ccc',
            strokeWidth: 0.5,
        });
        layer.add(verticalLine);
    }

    // Draw horizontal lines
    for (let i = 0; i <= h; i += gridSize) {
        const horizontalLine = new Konva.Line({
            points: [0, i, w, i],
            stroke: '#ccc',
            strokeWidth: 0.5,
        });
        layer.add(horizontalLine);
    }

    // Move grid to bottom of its layer so furniture is on top? 
    // Actually furniture is in 'layer', grid is also in 'layer'. 
    // Grid lines should be at the bottom of 'layer'.
    layer.find('Line').forEach(line => {
        if (line.attrs.stroke === '#ccc') line.moveToBottom();
    });

    layer.batchDraw();
}

// Export Floor Grid functionality
function exportFloorGrid() {
    // Check if we have any objects to export
    if (objects.length === 0) {
        alert('No furniture to export. Add at least one piece of furniture first.');
        return;
    }

    // Create a data structure for export
    let exportData = {
        scale_pixels_per_cm: scalePixelsPerCm,
        objects: objects.map(obj => ({
            type: obj.type,
            label: obj.label,
            width_cm: obj.width_cm,
            height_cm: obj.height_cm,
            x_pixels: obj.x_pixels,
            y_pixels: obj.y_pixels,
            rotation_degrees: obj.rotation_degrees || obj.rotation || 0 // Include rotation in export, handle both property names
        }))
    };

    console.log('Exporting data:', exportData);
    console.log(`Exporting ${objects.length} objects`);

    // Convert to JSON string with pretty formatting
    const jsonString = JSON.stringify(exportData, null, 2);

    // Create a blob with the JSON data
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Create a URL for the blob
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floor_grid.json';

    // Append to the document, click it, and remove it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up by revoking the URL
    URL.revokeObjectURL(url);
}

// Export button handler
const exportBtn = document.getElementById('export-btn');
exportBtn.addEventListener('click', exportFloorGrid);

// Duplicate Object functionality
const duplicateBtn = document.getElementById('duplicate-object-btn');
if (duplicateBtn) {
    duplicateBtn.addEventListener('click', duplicateSelectedObject);
}

function duplicateSelectedObject() {
    if (selectedObjectIndex === -1) return;

    const original = objects[selectedObjectIndex];
    if (!original) return;

    // Offset the new object slightly so it's visible
    const offset = 20;

    // We already have logic to create a rectangle in `createRectangle`, but that pulls from inputs.
    // We can reuse the inner logic or just create a new one manually. 
    // Since we need to access internal create logic which is partly inside createRectangle, 
    // it's cleaner to duplicate the data and create a new group.

    const widthCm = original.width_cm;
    const heightCm = original.height_cm;
    const label = original.label + " (Copy)";

    // Manually push new object similar to createRectangle but without inputs
    // Calculating pixels
    const widthPixels = widthCm * scalePixelsPerCm;
    const heightPixels = heightCm * scalePixelsPerCm;

    // Center position (original center + offset)
    const centerX = original.x_pixels + widthPixels / 2 + offset;
    const centerY = original.y_pixels + heightPixels / 2 + offset;

    // Create Group
    const group = new Konva.Group({
        x: centerX,
        y: centerY,
        draggable: true,
        rotation: original.rotation_degrees || 0
    });

    // Create Rect
    const rect = new Konva.Rect({
        x: -widthPixels / 2,
        y: -heightPixels / 2,
        width: widthPixels,
        height: heightPixels,
        fill: getRandomColor(0.6),
        stroke: '#000',
        strokeWidth: 2,
    });

    // Create Text
    const textContent = showDimensions ?
        `${label} (${widthCm}cm x ${heightCm}cm)` :
        `${label}`;

    const text = new Konva.Text({
        x: 0,
        y: 0,
        text: textContent,
        fontSize: 16,
        fontFamily: 'Arial',
        fill: '#000',
        align: 'center',
        verticalAlign: 'middle',
        visible: false,
    });
    text.offsetX(text.width() / 2);
    text.offsetY(text.height() / 2);

    // Chevron
    const minChevronSize = 5;
    const proportionalSize = Math.min(widthPixels, heightPixels) * 0.15;
    const chevronSize = Math.max(minChevronSize, proportionalSize);
    const chevronWidth = chevronSize;
    const chevronHeight = chevronSize * 0.6;

    const chevron = new Konva.Line({
        points: [
            -chevronWidth / 2, heightPixels / 2 - chevronHeight * 1.5,
            0, heightPixels / 2 - chevronHeight * 0.5,
            chevronWidth / 2, heightPixels / 2 - chevronHeight * 1.5
        ],
        stroke: '#000',
        strokeWidth: 3,
        closed: false,
        fill: null,
    });

    group.add(rect);
    group.add(text);
    group.add(chevron);
    layer.add(group);

    const objectIndex = objects.length;
    objects.push({
        type: 'rectangle',
        label: label,
        width_cm: widthCm,
        height_cm: heightCm,
        x_pixels: centerX - widthPixels / 2,
        y_pixels: centerY - heightPixels / 2,
        rotation_degrees: original.rotation_degrees || 0,
        group: group,
        shape: rect,
        text: text,
        chevron: chevron
    });

    // Events
    group.on('dragend', () => {
        objects[objectIndex].x_pixels = group.x() - widthPixels / 2;
        objects[objectIndex].y_pixels = group.y() - heightPixels / 2;
    });

    group.on('click', (e) => {
        e.cancelBubble = true;
        selectObject(objectIndex);
    });

    group.on('mouseenter', () => {
        text.visible(true);
        // Removed auto-select
        layer.batchDraw();
    });

    group.on('mouseleave', () => {
    });

    // Select new object
    selectObject(objectIndex);
    layer.batchDraw();
    updateExportButtonState();
    saveState();
}

// Theme Toggle
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = themeToggleBtn.querySelector('i');

// Enable Dark Mode by default
document.body.classList.add('dark-mode');

themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    if (document.body.classList.contains('dark-mode')) {
        themeIcon.className = 'bi bi-moon-stars-fill';
    } else {
        themeIcon.className = 'bi bi-sun-fill';
    }
});

// Function to update export button state
function updateExportButtonState() {
    // Enable export button if there are any objects
    exportBtn.disabled = (objects.length === 0);
}

// Import Floor Grid functionality
function importFloorGrid(file) {
    if (!file) return;

    // Only process JSON files
    if (file.type !== 'application/json') {
        alert('Please select a JSON file');
        return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
        try {
            console.log('Starting import process...');
            // Parse the JSON data
            const importedData = JSON.parse(event.target.result);
            console.log('Parsed JSON data:', importedData);

            // Clear existing objects
            console.log('Clearing existing objects...');
            clearAllObjects();
            console.log('Cleared existing objects');

            // Ensure objects array is initialized
            if (!objects || !Array.isArray(objects)) {
                console.log('Objects array was not properly initialized, creating new array');
                objects = [];
            }

            // Check if the imported data is in the expected format
            if (importedData && typeof importedData === 'object' && !Array.isArray(importedData)) {
                // Format with scale
                console.log('Detected JSON with scale');

                // Ensure objects array exists
                if (!importedData.objects) {
                    console.log('No objects array found in imported data, adding empty array');
                    importedData.objects = [];
                }

                // Extract and set the scale if available
                if (typeof importedData.scale_pixels_per_cm === 'number') {
                    scalePixelsPerCm = importedData.scale_pixels_per_cm;
                    // Update the scale button text
                    updateScaleButtonText();
                    console.log(`Imported scale: ${scalePixelsPerCm.toFixed(2)} pixels per cm`);
                } else if (typeof importedData.scale_pixels_per_foot === 'number') {
                    // Handle legacy format (feet)
                    scalePixelsPerCm = importedData.scale_pixels_per_foot / 30.48; // Convert feet to cm
                    updateScaleButtonText();
                    console.log(`Converted legacy scale from feet to cm: ${scalePixelsPerCm.toFixed(2)} pixels per cm`);
                } else if (typeof importedData.scale_pixels_per_inch === 'number') {
                    // Handle legacy format (inches)
                    scalePixelsPerCm = importedData.scale_pixels_per_inch / 2.54; // Convert inches to cm
                    updateScaleButtonText();
                    console.log(`Converted legacy scale from inches to cm: ${scalePixelsPerCm.toFixed(2)} pixels per cm`);
                } else {
                    // If scale is not defined in the JSON but objects exist, warn the user
                    if (importedData.objects && importedData.objects.length > 0) {
                        console.warn('Warning: Scale is not defined in the imported data but objects exist.');
                        const defineScale = confirm('The imported file contains objects but no scale definition. Objects need a scale to be displayed correctly. Would you like to define a scale now?');

                        if (defineScale) {
                            // Exit the import process and let the user define a scale
                            toggleScaleDefinitionMode();
                            alert('Please define a scale by drawing a line and specifying its real-world length. Then import the file again.');
                            return;
                        } else {
                            // If user doesn't want to define scale, use a default value
                            scalePixelsPerCm = 10; // Default guess
                            updateScaleButtonText();
                            console.log(`Using default scale: ${scalePixelsPerCm.toFixed(2)} pixels per cm`);
                            alert('Using default scale of 10 pixels per cm. Objects may not be displayed at the correct size.');
                        }
                    }
                }

                // Process objects if available
                if (importedData.objects && Array.isArray(importedData.objects)) {
                    console.log(`Processing ${importedData.objects.length} objects from imported data`);

                    // Check if scale is defined before processing objects
                    if (scalePixelsPerCm === null) {
                        console.error('Scale is not defined. Cannot create objects with proper dimensions.');
                        alert('Scale is not defined. Please define a scale using the "Define Scale" button before importing objects.');
                        return;
                    }

                    // Track successfully created objects
                    let successCount = 0;

                    importedData.objects.forEach((item, index) => {
                        console.log(`Processing object ${index + 1}:`, item);
                        // Validate required fields
                        if (!item.type || !item.label || typeof item.x_pixels !== 'number' || typeof item.y_pixels !== 'number') {
                            console.error('Invalid object data:', item);
                            throw new Error('Invalid object data: Missing required properties');
                        }

                        // Normalize dimensions to cm if they are in legacy units
                        if (typeof item.width_cm !== 'number' && typeof item.width_feet === 'number') {
                            item.width_cm = item.width_feet * 30.48;
                            item.height_cm = item.height_feet * 30.48;
                        }

                        // Check for dimensions
                        if (typeof item.width_cm !== 'number' || typeof item.height_cm !== 'number') {
                            console.error('Invalid object data: Missing dimensions:', item);
                            throw new Error('Invalid object data: Missing dimensions');
                        }

                        // Create a new object from the imported data
                        // NOTE: createObjectFromData is not defined in the snippet I saw earlier, 
                        // but logic suggests we might need to update it or manually push here.
                        // Wait, looking at lines 365 in prev view, `createObjectFromData` WAS called.
                        // I probably missed viewing the definition of `createObjectFromData`.
                        // I will assume it renders the object. I need to update IT too. 
                        // For now, let's update this block.

                        // Actually, I'll use a direct call to createFurnitureObject or similar if createObjectFromData handles logic
                        // But I need to find createObjectFromData definition first to be safe? 
                        // No, I can replace the call here if I know what it does.
                        // Let's assume createObjectFromData exists and I need to update it later.

                        // Wait, I am replacing a big block.

                        // Create a new object from the imported data
                        // Since I don't have `createObjectFromData` source in my previous view (it wasn't shown?), 
                        // I might break it if I don't update it. 
                        // Ah, I see "createObjectFromData(item)" on line 365.
                        // I will update this block to convert units before passing to whatever function.

                        const success = createObjectFromData(item);
                        if (success) {
                            successCount++;
                            console.log(`Successfully created object ${index + 1}: ${item.label}`);
                        } else {
                            console.warn(`Failed to create object ${index + 1}: ${item.label}`);
                        }
                    });

                    console.log(`Finished processing ${importedData.objects.length} objects. Successfully created ${successCount} objects.`);

                    // If no objects were created successfully but there were objects in the data, show a warning
                    if (successCount === 0 && importedData.objects.length > 0) {
                        console.warn('Warning: Failed to create any objects from the imported data');
                        alert('Failed to create any objects from the imported data. Please check the console for details.');
                    }
                } else {
                    console.log('No objects array found in imported data or it is empty');
                }

                // Update the export button state
                updateExportButtonState();

                // Show success message with object count
                const objectCount = importedData.objects ? importedData.objects.length : 0;
                console.log(`Imported ${objectCount} objects`);
            } else {
                // Handle legacy format or invalid format
                if (Array.isArray(importedData)) {
                    // This is the old format with just polygons - we don't support this anymore
                    throw new Error('Legacy polygon-only format is no longer supported');
                } else {
                    throw new Error('Invalid JSON format: Expected an object with objects property');
                }
            }
        } catch (error) {
            console.error('Error importing floor grid:', error);
            alert(`Error importing floor grid: ${error.message}`);
            // Reset to default message on error
            importFileName.textContent = 'Furniture not loaded';
        }
    };

    reader.onerror = () => {
        alert('Error reading the file');
        // Reset to default message on error
        importFileName.textContent = 'Furniture not loaded';
    };

    // Read the file as text
    reader.readAsText(file);

    // Display the file name
    document.getElementById('import-file-name').textContent = file.name;
}

// Import button and file input handlers
const importBtn = document.getElementById('import-btn');
const jsonUploadInput = document.getElementById('json-upload');
const importFileName = document.getElementById('import-file-name');

// Initialize with default message
// importFileName.textContent = 'Furniture not loaded'; // Already set in HTML

// Click on import button triggers file input
importBtn.addEventListener('click', () => {
    jsonUploadInput.click();
});

// Handle file selection
jsonUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        importFloorGrid(file);
    } else {
        // Reset to default message if no file selected
        importFileName.textContent = 'Furniture not loaded';
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
});

// Add stage event handler to prevent default context menu on stage
stage.on('contextmenu', (e) => {
    e.evt.preventDefault();
});

// Scale Definition Button Handler
const defineScaleBtn = document.getElementById('define-scale-btn');
defineScaleBtn.addEventListener('click', toggleScaleDefinitionMode);

// Function to toggle scale definition mode
function toggleScaleDefinitionMode() {
    // If we're already in scale definition mode, exit it
    if (isScaleDefinitionMode) {
        exitScaleDefinitionMode();
        return;
    }

    // Enter scale definition mode
    isScaleDefinitionMode = true;

    // Update button appearance
    defineScaleBtn.classList.add('active');
    defineScaleBtn.textContent = 'Cancel Scale Definition';

    // Reset scale points
    scaleStartPoint = null;
    scaleEndPoint = null;

    // Clear any existing temporary scale line
    tempScaleLine.points([]);
    layer.batchDraw();
}

// Function to exit scale definition mode
function exitScaleDefinitionMode() {
    isScaleDefinitionMode = false;

    // Reset button appearance
    defineScaleBtn.classList.remove('active');

    // Update button text based on whether scale is set
    updateScaleButtonText();

    // Clear any temporary scale line
    tempScaleLine.points([]);
    layer.batchDraw();
}

// Function to update scale button text based on current scale
function updateScaleButtonText() {
    if (scalePixelsPerCm !== null) {
        defineScaleBtn.textContent = `Scale: ${scalePixelsPerCm.toFixed(2)} px/cm`;
    } else {
        defineScaleBtn.textContent = 'Define Scale';
    }
}

// Function to handle scale line drawing
function handleScaleLineDrawing(pos) {
    if (!scaleStartPoint) return;

    // Calculate the difference in x and y coordinates
    const dx = pos.x - scaleStartPoint.x;
    const dy = pos.y - scaleStartPoint.y;

    // Determine if the line should be horizontal or vertical based on which delta is larger
    let endX, endY;

    if (Math.abs(dx) >= Math.abs(dy)) {
        // Horizontal line
        endX = pos.x;
        endY = scaleStartPoint.y; // Keep y coordinate the same
    } else {
        // Vertical line
        endX = scaleStartPoint.x; // Keep x coordinate the same
        endY = pos.y;
    }

    // Update the temporary scale line
    tempScaleLine.points([scaleStartPoint.x, scaleStartPoint.y, endX, endY]);
    layer.batchDraw();

    // Store the current end point
    scaleEndPoint = { x: endX, y: endY };
}

// Function to complete scale definition
function completeScaleDefinition() {
    if (!scaleStartPoint || !scaleEndPoint) return;

    // Calculate the pixel length of the line
    const pixelLength = Math.sqrt(
        Math.pow(scaleEndPoint.x - scaleStartPoint.x, 2) +
        Math.pow(scaleEndPoint.y - scaleStartPoint.y, 2)
    );

    // Prompt the user for the real-world length in centimeters
    const realWorldLength = parseFloat(prompt('Enter the real-world length of the drawn line in cm:'));

    // Validate the input
    if (isNaN(realWorldLength) || realWorldLength <= 0) {
        alert('Please enter a valid positive number for the length.');
        return;
    }

    // Calculate the scale (pixels per cm)
    scalePixelsPerCm = pixelLength / realWorldLength;

    // Exit scale definition mode
    exitScaleDefinitionMode();

    // Update the button text to show the calculated scale
    updateScaleButtonText();

    console.log(`Scale set: ${scalePixelsPerCm.toFixed(2)} pixels per cm`);
}

// Add mousedown event handler for scale definition and debugging
stage.on('mousedown', (e) => {
    // Debug info
    const target = e.target;
    if (target instanceof Konva.Rect) {
        console.log('Mousedown on rectangle, draggable:', target.draggable());
    }

    // Only handle mousedown in scale definition mode
    if (!isScaleDefinitionMode) return;

    // Get mouse position relative to the stage
    const pos = stage.getPointerPosition();

    // Set the start point for the scale line
    scaleStartPoint = { x: pos.x, y: pos.y };

    // Initialize the temporary scale line
    tempScaleLine.points([pos.x, pos.y, pos.x, pos.y]);
    layer.batchDraw();
});

// Add mousemove event handler for scale definition
stage.on('mousemove', (e) => {
    // Only handle mousemove in scale definition mode and if we have a start point
    if (!isScaleDefinitionMode || !scaleStartPoint) return;

    // Get mouse position relative to the stage
    const pos = stage.getPointerPosition();

    // Update the scale line
    handleScaleLineDrawing(pos);
});

// Add mouseup event handler for scale definition
stage.on('mouseup', (e) => {
    // Only handle mouseup in scale definition mode and if we have a start point
    if (!isScaleDefinitionMode || !scaleStartPoint) return;

    // Get mouse position relative to the stage
    const pos = stage.getPointerPosition();

    // Finalize the scale line
    handleScaleLineDrawing(pos);

    // Complete the scale definition process
    completeScaleDefinition();
});

// Rectangle functionality

// Add Rectangle button handler
const addRectangleBtn = document.getElementById('add-rectangle-btn');
addRectangleBtn.addEventListener('click', showRectangleModal);

// Function to show the rectangle modal
function showRectangleModal() {
    // Check if scale is defined
    if (scalePixelsPerCm === null) {
        alert('Please define the scale using the "Define Scale" button first.');
        return;
    }

    // Reset input fields
    rectangleWidthInput.value = '';
    rectangleHeightInput.value = '';
    rectangleLabelInput.value = '';

    // Show the modal
    rectangleModal.classList.add('show');
    rectangleWidthInput.focus();
}

// Function to hide the rectangle modal
function hideRectangleModal() {
    rectangleModal.classList.remove('show');
}

// Cancel button handler
cancelRectangleBtn.addEventListener('click', hideRectangleModal);

// Add Rectangle Confirm button handler
addRectangleConfirmBtn.addEventListener('click', createRectangle);

// Function to create a rectangle
function createRectangle() {
    // Get the input values
    const widthCm = parseFloat(rectangleWidthInput.value);
    const heightCm = parseFloat(rectangleHeightInput.value);
    const label = rectangleLabelInput.value.trim() || 'Unnamed Object';

    // Validate inputs
    if (isNaN(widthCm) || widthCm <= 0 || isNaN(heightCm) || heightCm <= 0) {
        alert('Please enter valid positive numbers for width and height in centimeters.');
        return;
    }

    console.log(`Creating rectangle with dimensions: ${widthCm}cm x ${heightCm}cm`);
    console.log(`Using scale factor: ${scalePixelsPerCm.toFixed(2)} pixels per cm`);

    // Calculate pixel dimensions using the scale
    const widthPixels = widthCm * scalePixelsPerCm;
    const heightPixels = heightCm * scalePixelsPerCm;
    console.log(`Calculated dimensions in pixels: ${widthPixels.toFixed(2)}px x ${heightPixels.toFixed(2)}px`);

    // Calculate the center position of the canvas
    const centerX = width / 2 - widthPixels / 2;
    const centerY = height / 2 - heightPixels / 2;

    // Create a group to hold the rectangle, text, and orientation indicator
    // This allows us to drag them together as a single unit
    const group = new Konva.Group({
        x: centerX + widthPixels / 2, // Position at the center of the rectangle
        y: centerY + heightPixels / 2, // Position at the center of the rectangle
        draggable: true,
    });

    // Create a rectangle shape (relative to the group)
    const rect = new Konva.Rect({
        x: -widthPixels / 2, // Position relative to group center
        y: -heightPixels / 2, // Position relative to group center
        width: widthPixels,
        height: heightPixels,
        fill: getRandomColor(0.6), // Different opacity to distinguish from room polygons
        stroke: '#000',
        strokeWidth: 2,
    });

    // Create a text label (relative to the group) with or without dimensions based on toggle
    // When showDimensions is false, only show the label
    const textContent = showDimensions ?
        `${label} (${widthCm}cm x ${heightCm}cm)` :
        `${label}`;

    const text = new Konva.Text({
        x: 0, // Center position (0,0) since the group is now centered
        y: 0, // Center position (0,0) since the group is now centered
        text: textContent,
        fontSize: 16,
        fontFamily: 'Arial',
        fill: '#000',
        align: 'center',
        verticalAlign: 'middle',
        visible: false, // Hide text by default - only show on hover/select
    });

    // Center the text
    text.offsetX(text.width() / 2);
    text.offsetY(text.height() / 2);

    // Create a chevron down arrow at the bottom center of the rectangle
    // to indicate orientation
    const minChevronSize = 5; // Minimum size in pixels to ensure visibility
    const proportionalSize = Math.min(widthPixels, heightPixels) * 0.15;
    const chevronSize = Math.max(minChevronSize, proportionalSize); // Use the larger of min size or proportional size
    const chevronWidth = chevronSize;
    const chevronHeight = chevronSize * 0.6;

    // Create the chevron using a line with specific points
    const chevron = new Konva.Line({
        points: [
            -chevronWidth / 2, heightPixels / 2 - chevronHeight * 1.5, // Left point
            0, heightPixels / 2 - chevronHeight * 0.5,              // Bottom point
            chevronWidth / 2, heightPixels / 2 - chevronHeight * 1.5  // Right point
        ],
        stroke: '#000',
        strokeWidth: 3, // Increased stroke width for better visibility
        closed: false,
        fill: null,
    });

    // Add the rectangle, text, and chevron to the group
    group.add(rect);
    group.add(text);
    group.add(chevron);

    // Add the group to the layer
    layer.add(group);

    // Store the object data
    const objectIndex = objects.length;
    objects.push({
        type: 'rectangle',
        label: label,
        width_cm: widthCm,
        height_cm: heightCm,
        x_pixels: centerX,
        y_pixels: centerY,
        rotation_degrees: 0, // Initialize rotation to 0 degrees
        group: group,
        shape: rect,
        text: text,
        chevron: chevron // Store reference to the chevron
    });

    // Add drag event handlers to update stored position
    group.on('dragend', () => {
        // Update the stored position
        // Subtract half width/height to store the top-left position
        objects[objectIndex].x_pixels = group.x() - widthPixels / 2;
        objects[objectIndex].y_pixels = group.y() - heightPixels / 2;
        console.log(`Object ${label} moved to position: (${objects[objectIndex].x_pixels.toFixed(2)}, ${objects[objectIndex].y_pixels.toFixed(2)})`);
    });

    // Add click handler for selection
    group.on('click', (e) => {
        // Prevent the event from bubbling to the stage
        e.cancelBubble = true;

        // Select this object
        selectObject(objectIndex);
        console.log(`Object ${label} selected, draggable: ${group.draggable()}`);
    });

    // Add hover event handlers to show text and auto-select object
    group.on('mouseenter', () => {
        // Show text on hover
        text.visible(true);
        layer.batchDraw();
    });

    group.on('mouseleave', () => {
        // Text visibility is now handled by the selection state
        // We don't deselect on mouse leave - object stays selected until another is hovered
    });

    // Hide the modal
    hideRectangleModal();

    // Select the newly created object
    selectObject(objectIndex);

    // Redraw the layer
    layer.batchDraw();

    console.log(`Successfully created object: ${label} with dimensions ${widthCm}cm x ${heightCm}cm`);

    saveState();
}

// Function to select an object
function selectObject(index) {
    // Deselect any previously selected object
    if (selectedObjectIndex !== -1) {
        deselectObject();
    }

    // Set the new selected object
    selectedObjectIndex = index;

    // Highlight the selected object
    const selectedObject = objects[selectedObjectIndex];
    selectedObject.shape.stroke('#ff0000');
    selectedObject.shape.strokeWidth(3);

    // Show text when selected
    selectedObject.text.visible(true);

    // Ensure the group is draggable
    selectedObject.group.draggable(true);

    // Bring the selected object to the front
    selectedObject.group.moveToTop();

    // Enable the rotate, delete, and duplicate buttons when an object is selected
    document.getElementById('rotate-object-btn').disabled = false;
    document.getElementById('rotate-left-btn').disabled = false;
    document.getElementById('delete-object-btn').disabled = false;
    const duplicateBtn = document.getElementById('duplicate-object-btn');
    if (duplicateBtn) duplicateBtn.disabled = false;

    // Redraw the layer
    layer.batchDraw();

    console.log('Object selected:', selectedObject);
}

// Function to deselect an object
function deselectObject() {
    if (selectedObjectIndex === -1) return;

    // Reset the appearance of the previously selected object
    const selectedObject = objects[selectedObjectIndex];
    selectedObject.shape.stroke('#000');
    selectedObject.shape.strokeWidth(2);

    // Hide text when deselected
    selectedObject.text.visible(false);

    // Reset the selected object index
    selectedObjectIndex = -1;

    // Disable the rotate, delete, and duplicate buttons when no object is selected
    document.getElementById('rotate-object-btn').disabled = true;
    document.getElementById('rotate-left-btn').disabled = true;
    document.getElementById('delete-object-btn').disabled = true;
    const duplicateBtn = document.getElementById('duplicate-object-btn');
    if (duplicateBtn) duplicateBtn.disabled = true;

    // Redraw the layer
    layer.batchDraw();
}

// Note: The stage click handler has been modified above to prioritize rectangle selection

// The export and import functions have been updated to properly handle objects

// Function to create an object from imported data
function createObjectFromData(objectData) {
    // Check if scale is defined
    if (scalePixelsPerCm === null) {
        console.error('Scale is not defined. Cannot create object with proper dimensions.');
        return false;
    }

    if (objectData.type === 'rectangle') {
        console.log('Creating rectangle object:', objectData);
        console.log(`Using scale factor: ${scalePixelsPerCm.toFixed(2)} pixels per cm`);

        // Handle both new format (cm) and legacy format (feet/inches)
        let widthCm, heightCm;

        if (objectData.width_cm !== undefined && objectData.height_cm !== undefined) {
            // New format (cm)
            widthCm = objectData.width_cm;
            heightCm = objectData.height_cm;
            console.log(`Original dimensions in cm: ${widthCm}cm x ${heightCm}cm`);
        } else if (objectData.width_feet !== undefined && objectData.height_feet !== undefined) {
            // Legacy format (feet) - convert to cm
            widthCm = objectData.width_feet * 30.48;
            heightCm = objectData.height_feet * 30.48;
            console.log(`Converted dimensions from feet to cm: ${widthCm.toFixed(2)}cm x ${heightCm.toFixed(2)}cm`);
        } else if (objectData.width_inches !== undefined && objectData.height_inches !== undefined) {
            // Legacy format (inches) - convert to cm
            widthCm = objectData.width_inches * 2.54;
            heightCm = objectData.height_inches * 2.54;
            console.log(`Converted dimensions from inches to cm: ${widthCm.toFixed(2)}cm x ${heightCm.toFixed(2)}cm`);
        } else {
            console.error('Invalid object data: Missing width and height dimensions');
            return false;
        }

        // Calculate pixel dimensions using the scale
        const widthPixels = widthCm * scalePixelsPerCm;
        const heightPixels = heightCm * scalePixelsPerCm;
        console.log(`Calculated dimensions in pixels: ${widthPixels.toFixed(2)}px x ${heightPixels.toFixed(2)}px`);

        // Calculate the center position for the group
        const centerX = objectData.x_pixels + widthPixels / 2;
        const centerY = objectData.y_pixels + heightPixels / 2;

        // Create a group to hold both the rectangle and text
        const group = new Konva.Group({
            x: centerX, // Position at the center of the rectangle
            y: centerY, // Position at the center of the rectangle
            draggable: true,
        });

        console.log(`Creating object at position: (${centerX.toFixed(2)}, ${centerY.toFixed(2)}) with dimensions: ${widthPixels.toFixed(2)}x${heightPixels.toFixed(2)} pixels`);

        // Create a rectangle shape (relative to the group)
        const rect = new Konva.Rect({
            x: -widthPixels / 2, // Position relative to group center
            y: -heightPixels / 2, // Position relative to group center
            width: widthPixels,
            height: heightPixels,
            height: heightPixels,
            fill: objectData.color || getRandomColor(0.6), // Use saved color or random
            stroke: '#000',
            strokeWidth: 2,
        });

        // Create a text label (relative to the group) with or without dimensions based on toggle
        // When showDimensions is false, only show the label
        const textContent = showDimensions ?
            `${objectData.label} (${widthCm.toFixed(1)}cm x ${heightCm.toFixed(1)}cm)` :
            `${objectData.label}`;

        const text = new Konva.Text({
            x: 0, // Center position (0,0) since the group is now centered
            y: 0, // Center position (0,0) since the group is now centered
            text: textContent,
            fontSize: 16,
            fontFamily: 'Arial',
            fill: '#000',
            align: 'center',
            verticalAlign: 'middle',
            visible: false, // Hide text by default - only show on hover/select
        });

        // Center the text
        text.offsetX(text.width() / 2);
        text.offsetY(text.height() / 2);

        // Create a chevron down arrow at the bottom center of the rectangle
        // to indicate orientation
        const minChevronSize = 20; // Minimum size in pixels to ensure visibility
        const proportionalSize = Math.min(widthPixels, heightPixels) * 0.15;
        const chevronSize = Math.max(minChevronSize, proportionalSize); // Use the larger of min size or proportional size
        const chevronWidth = chevronSize;
        const chevronHeight = chevronSize * 0.6;

        // Create the chevron using a line with specific points
        const chevron = new Konva.Line({
            points: [
                -chevronWidth / 2, heightPixels / 2 - chevronHeight * 1.5, // Left point
                0, heightPixels / 2 - chevronHeight * 0.5,              // Bottom point
                chevronWidth / 2, heightPixels / 2 - chevronHeight * 1.5  // Right point
            ],
            stroke: '#000',
            strokeWidth: 3, // Increased stroke width for better visibility
            closed: false,
            fill: null,
        });

        // Add the rectangle, text, and chevron to the group
        group.add(rect);
        group.add(text);
        group.add(chevron);

        // Add the group to the layer
        layer.add(group);

        // Store the object data
        const objectIndex = objects.length;
        objects.push({
            type: 'rectangle',
            label: objectData.label,
            width_cm: widthCm,
            height_cm: heightCm,
            x_pixels: objectData.x_pixels,
            y_pixels: objectData.y_pixels,
            rotation_degrees: objectData.rotation_degrees || 0, // Use imported rotation or default to 0
            group: group,
            shape: rect,
            text: text,
            chevron: chevron // Store reference to the chevron
        });

        // Apply rotation if it exists in the imported data
        const rotation = objectData.rotation_degrees || 0;
        group.rotation(rotation);

        // Keep the text orientation fixed by counter-rotating it
        // This cancels out the group rotation for the text only
        text.rotation(-rotation);

        // The chevron should rotate with the object to show orientation
        // so we don't counter-rotate it

        console.log(`Applied rotation of ${rotation} degrees to object: ${objectData.label}`);

        // Add drag event handlers to update stored position
        group.on('dragend', () => {
            // Update the stored position
            // Subtract half width/height to store the top-left position
            objects[objectIndex].x_pixels = group.x() - widthPixels / 2;
            objects[objectIndex].y_pixels = group.y() - heightPixels / 2;
            console.log(`Object ${objectData.label} moved to position: (${objects[objectIndex].x_pixels.toFixed(2)}, ${objects[objectIndex].y_pixels.toFixed(2)})`);
            saveState();
        });

        // Add click handler for selection
        group.on('click', (e) => {
            // Prevent the event from bubbling to the stage
            e.cancelBubble = true;

            // Select this object
            selectObject(objectIndex);
            console.log(`Object ${objectData.label} selected`);
        });

        // Add hover event handlers to show text and auto-select object
        group.on('mouseenter', () => {
            // Show text on hover
            text.visible(true);
            layer.batchDraw();
        });

        group.on('mouseleave', () => {
            // Text visibility is now handled by the selection state
            // We don't deselect on mouse leave - object stays selected until another is hovered
        });

        // Bring the group to the front to ensure it's visible
        group.moveToTop();

        // Redraw the layer to ensure the object is visible
        layer.batchDraw();

        console.log(`Successfully created object: ${objectData.label}`);

        return true; // Return true to indicate success
    } else {
        console.warn(`Unknown object type: ${objectData.type}`);
        return false; // Return false to indicate failure
    }
}

// Function to clear all objects
function clearAllObjects() {
    console.log(`Clearing ${objects.length} objects`);

    // Remove all object groups from the layer
    objects.forEach(obj => {
        if (obj && obj.group) {
            obj.group.destroy(); // This will also destroy all children (rect and text)
        }
    });

    // Clear the objects array
    objects = [];

    // Reset the selected object index
    selectedObjectIndex = -1;

    // Disable the rotate and delete buttons
    document.getElementById('rotate-object-btn').disabled = true;
    document.getElementById('rotate-left-btn').disabled = true;
    document.getElementById('delete-object-btn').disabled = true;
    const duplicateBtn = document.getElementById('duplicate-object-btn');
    if (duplicateBtn) duplicateBtn.disabled = true;

    // Redraw the layer
    layer.batchDraw();

    console.log('All objects cleared');
}

// Rotate Object buttons handlers
const rotateObjectBtn = document.getElementById('rotate-object-btn');
rotateObjectBtn.addEventListener('click', rotateSelectedObject);

// Rotate Left button handler
const rotateLeftBtn = document.getElementById('rotate-left-btn');
rotateLeftBtn.addEventListener('click', rotateSelectedObjectCounterclockwise);

// Delete Object button handler
const deleteObjectBtn = document.getElementById('delete-object-btn');
deleteObjectBtn.addEventListener('click', deleteSelectedObject);

// Function to delete the selected object
function deleteSelectedObject() {
    // Check if an object is selected
    if (selectedObjectIndex === -1) return;

    // Get the selected object
    const selectedObject = objects[selectedObjectIndex];

    // Remove the group from the layer (this removes both the rectangle and text)
    selectedObject.group.destroy();

    // Remove the object from the objects array
    objects.splice(selectedObjectIndex, 1);

    // Reset the selected object index
    selectedObjectIndex = -1;

    // Disable the rotate, delete, and duplicate buttons
    document.getElementById('rotate-object-btn').disabled = true;
    document.getElementById('rotate-left-btn').disabled = true;
    document.getElementById('delete-object-btn').disabled = true;
    const duplicateBtn = document.getElementById('duplicate-object-btn');
    if (duplicateBtn) duplicateBtn.disabled = true;

    // Update event handlers for remaining objects
    updateObjectEventHandlers();

    // Update the export button state
    updateExportButtonState();

    // Redraw the layer
    layer.batchDraw();

    layer.batchDraw();

    console.log('Object deleted');
    saveState();
}

// Function to update object event handlers after deletion
function updateObjectEventHandlers() {
    // Remove all existing event handlers and add updated ones with correct indices
    objects.forEach((obj, index) => {
        obj.group.off('click');
        obj.group.off('dragend');
        obj.group.off('mouseenter');
        obj.group.off('mouseleave');

        // Add updated click handler for selection
        obj.group.on('click', (e) => {
            e.cancelBubble = true;
            selectObject(index);
            console.log(`Object ${obj.label} selected`);
        });

        // Add updated hover event handlers with auto-selection
        obj.group.on('mouseenter', () => {
            // Show text on hover
            obj.text.visible(true);
            layer.batchDraw();
        });

        obj.group.on('mouseleave', () => {
            // Text visibility is now handled by the selection state
            // We don't deselect on mouse leave - object stays selected until another is hovered
        });

        // Add updated drag handler
        obj.group.on('dragend', () => {
            // Calculate the top-left position
            const widthPixels = obj.width_cm * scalePixelsPerCm;
            const heightPixels = obj.height_cm * scalePixelsPerCm;

            // Update the stored position
            obj.x_pixels = obj.group.x() - widthPixels / 2;
            obj.y_pixels = obj.group.y() - heightPixels / 2;
            console.log(`Object ${obj.label} moved to position: (${obj.x_pixels.toFixed(2)}, ${obj.y_pixels.toFixed(2)})`);
        });
    });
}

// Function to rotate the selected object
function rotateSelectedObject() {
    // Check if an object is selected
    if (selectedObjectIndex === -1) return;

    // Get the selected object
    const selectedObject = objects[selectedObjectIndex];

    // Calculate the new rotation angle
    const currentRotation = selectedObject.rotation_degrees || 0;
    const newRotation = (currentRotation + rotationIncrement) % 360;

    // Update the stored rotation value
    selectedObject.rotation_degrees = newRotation;

    // Apply the rotation to the group (which contains both the rectangle and text)
    selectedObject.group.rotation(newRotation);

    // Keep the text orientation fixed by counter-rotating it
    // This cancels out the group rotation for the text only
    selectedObject.text.rotation(-newRotation);

    // The chevron should rotate with the object to show orientation
    // so we don't counter-rotate it

    // Redraw the layer
    layer.batchDraw();

    console.log('Object rotated to:', newRotation, 'degrees');
    saveState();
}

// Function to rotate the selected object counterclockwise
function rotateSelectedObjectCounterclockwise() {
    // Check if an object is selected
    if (selectedObjectIndex === -1) return;

    // Get the selected object
    const selectedObject = objects[selectedObjectIndex];

    // Calculate the new rotation angle
    const currentRotation = selectedObject.rotation_degrees || 0;
    // Subtract the rotation increment and ensure the result is between 0 and 360
    const newRotation = (currentRotation - rotationIncrement + 360) % 360;

    // Update the stored rotation value
    selectedObject.rotation_degrees = newRotation;

    // Apply the rotation to the group (which contains both the rectangle and text)
    selectedObject.group.rotation(newRotation);

    // Keep the text orientation fixed by counter-rotating it
    // This cancels out the group rotation for the text only
    selectedObject.text.rotation(-newRotation);

    // The chevron should rotate with the object to show orientation
    // so we don't counter-rotate it

    // Redraw the layer
    layer.batchDraw();

    console.log('Object rotated to:', newRotation, 'degrees (counterclockwise)');
    saveState();
}

// Add keyboard event listener for rotating objects with 'r' and 'e' keys
document.addEventListener('keydown', (e) => {
    // Check if an object is selected
    if (selectedObjectIndex !== -1) {
        // Check which key was pressed
        if (e.key === 'r' || e.key === 'R') {
            // Rotate clockwise
            rotateSelectedObject();
            // Prevent default behavior (like scrolling)
            e.preventDefault();
        } else if (e.key === 'e' || e.key === 'E') {
            // Rotate counterclockwise
            rotateSelectedObjectCounterclockwise();
            // Prevent default behavior
            e.preventDefault();
        }
    }
});

// Function to update object label text based on showDimensions toggle
function updateObjectLabels() {
    objects.forEach(obj => {
        if (showDimensions) {
            // Show label with dimensions
            obj.text.text(`${obj.label} (${obj.width_cm}cm x ${obj.height_cm}cm)`);
        } else {
            // Show only the label without dimensions
            obj.text.text(obj.label);
        }

        // Re-center the text after changing its content
        obj.text.offsetX(obj.text.width() / 2);
        obj.text.offsetY(obj.text.height() / 2);
    });

    // Redraw the layer to update the text
    layer.batchDraw();
}

// Add event listener for the show dimensions toggle
document.getElementById('show-dimensions-toggle').addEventListener('change', (e) => {
    showDimensions = e.target.checked;
    updateObjectLabels();
});

// Initial setup
updateExportButtonState();

// Set initial button states
document.getElementById('rotate-object-btn').disabled = true; // Initially disabled until an object is selected
document.getElementById('rotate-left-btn').disabled = true; // Initially disabled until an object is selected
document.getElementById('delete-object-btn').disabled = true; // Initially disabled until an object is selected
if (duplicateBtn) duplicateBtn.disabled = true;

// Initial draw of all layers
backgroundLayer.batchDraw();
layer.batchDraw();

// Function to show the paste furniture modal
function showPasteFurnitureModal() {
    // Check if scale is defined
    if (scalePixelsPerCm === null) {
        alert('Please define the scale using the "Define Scale" button first.');
        return;
    }

    // Reset textarea
    furnitureDataTextarea.value = '';

    // Show the modal
    pasteFurnitureModal.classList.add('show');
    furnitureDataTextarea.focus();
}

// Function to hide the paste furniture modal
function hidePasteFurnitureModal() {
    pasteFurnitureModal.classList.remove('show');
}

// Function to add item from manual inputs
function addFurnitureFromBuilder() {
    const labelInput = document.getElementById('builder-label');
    const widthInput = document.getElementById('builder-width');
    const depthInput = document.getElementById('builder-depth');

    const label = labelInput.value.trim() || 'Furniture';
    const width = parseFloat(widthInput.value);
    const depth = parseFloat(depthInput.value);

    if (!width || !depth || width <= 0 || depth <= 0) {
        alert("Please enter valid width and depth.");
        return;
    }

    pendingFurnitureItems.push({ label, width, depth });

    // Clear inputs
    labelInput.value = '';
    widthInput.value = '';
    depthInput.value = '';
    labelInput.focus();

    renderFurnitureList();
}

// Function to process bulk paste text
function processBulkPaste() {
    const data = furnitureDataTextarea.value.trim();
    if (!data) return;

    try {
        const items = parseFurnitureCSV(data);
        if (items.length === 0) {
            alert("No valid data found.");
            return;
        }

        items.forEach(item => {
            const w = item.widthFeet || item.width || 0;
            const h = item.heightFeet || item.height || item.length || 0;
            if (w > 0 && h > 0) {
                pendingFurnitureItems.push({
                    label: item.label,
                    width: w,
                    depth: h
                });
            }
        });

        furnitureDataTextarea.value = ''; // Clear textarea
        renderFurnitureList();

        // Collapse the section (using Bootstrap API if available, or just via CSS class toggle if simpler, 
        // but for now let's just leave it open or clear it)
        const bsCollapse = new bootstrap.Collapse(document.getElementById('bulk-paste-section'), {
            toggle: false
        });
        bsCollapse.hide();

    } catch (e) {
        console.error("Bulk parse error", e);
        alert("Error parsing data.");
    }
}

// Function to render the pending list
function renderFurnitureList() {
    const tbody = document.getElementById('furniture-list-body');
    const emptyMsg = document.getElementById('empty-list-message');

    tbody.innerHTML = '';

    if (pendingFurnitureItems.length === 0) {
        emptyMsg.style.display = 'block';
    } else {
        emptyMsg.style.display = 'none';
        pendingFurnitureItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.label}</td>
                <td>${item.width}</td>
                <td>${item.depth}</td>
                <td><button class="btn btn-sm btn-outline-danger p-0 px-1" onclick="removePendingItem(${index})">&times;</button></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// Global function for onclick handler
window.removePendingItem = function (index) {
    pendingFurnitureItems.splice(index, 1);
    renderFurnitureList();
};

function clearFurnitureList() {
    pendingFurnitureItems = [];
    renderFurnitureList();
}

// Function to commit list to plan
function commitFurnitureToPlan() {
    if (pendingFurnitureItems.length === 0) {
        alert("List is empty.");
        return;
    }

    // Check scale
    if (scalePixelsPerCm === null) {
        alert('Please define the scale using the "Define Scale" button first.');
        return;
    }

    let successCount = 0;
    // Calculate center
    const centerX = stage.width() / 2;
    const centerY = stage.height() / 2;
    // Arrange in a grid or stack? Stack is fine, user will move them.
    // Or slight offset.

    pendingFurnitureItems.forEach((item, i) => {
        const offset = i * 10;
        createFurnitureObject(centerX + offset, centerY + offset, item.width, item.depth, item.label);
        successCount++;
    });

    alert(`Added ${successCount} items to plan.`);
    pendingFurnitureItems = []; // Clear list after adding
    renderFurnitureList();
    hidePasteFurnitureModal();
    saveState();
}

// Old parse function can be removed or kept as helper reference? 
// The implementation plan says "Remove raw 'Paste & Parse' direct execution".
// So we replaced `parseFurnitureData` with `processBulkPaste` logic above.


// Function to create a furniture object at the specified position
function createFurnitureObject(centerX, centerY, widthCm, heightCm, label) {
    // Calculate pixel dimensions based on scale
    const widthPixels = widthCm * scalePixelsPerCm;
    const heightPixels = heightCm * scalePixelsPerCm;

    // Create a group to hold the rectangle, text, and orientation indicator
    const group = new Konva.Group({
        x: centerX,
        y: centerY,
        draggable: true,
    });

    // Create a rectangle shape (relative to the group)
    const rect = new Konva.Rect({
        x: -widthPixels / 2, // Position relative to group center
        y: -heightPixels / 2, // Position relative to group center
        width: widthPixels,
        height: heightPixels,
        fill: getRandomColor(0.6), // Different opacity to distinguish from room polygons
        stroke: '#000',
        strokeWidth: 2,
    });

    // Create a text label (relative to the group) with or without dimensions based on toggle
    const textContent = showDimensions ?
        `${label} (${widthCm.toFixed(1)}cm x ${heightCm.toFixed(1)}cm)` :
        `${label}`;

    const text = new Konva.Text({
        text: textContent,
        fontSize: 14,
        fontFamily: 'Arial',
        fill: '#000',
        visible: false, // Initially hidden, shown on hover or selection
    });

    // Center the text
    text.offsetX(text.width() / 2);
    text.offsetY(text.height() / 2);

    // Create orientation indicator (chevron pointing down)
    const chevronSize = Math.max(15, Math.min(widthPixels, heightPixels) * 0.15); // Min size of 15px, or 15% of the smaller dimension
    const chevron = new Konva.RegularPolygon({
        sides: 3,
        radius: chevronSize,
        fill: '#000',
        opacity: 0.7,
        y: heightPixels / 2 - chevronSize, // Position at bottom center of rectangle
        rotation: 180, // Point downward
    });

    // Add shapes to the group
    group.add(rect);
    group.add(text);
    group.add(chevron);

    // Add the group to the layer
    layer.add(group);

    // Store the object data
    const objectIndex = objects.length;
    objects.push({
        type: 'rectangle',
        group: group,
        shape: rect,
        text: text,
        chevron: chevron,
        label: label,
        width_cm: widthCm,
        height_cm: heightCm,
        rotation_degrees: 0, // Initial rotation angle
        x_pixels: centerX - widthPixels / 2, // Store top-left position
        y_pixels: centerY - heightPixels / 2  // Store top-left position
    });

    // Add click handler for selection
    group.on('click', (e) => {
        e.cancelBubble = true;
        selectObject(objectIndex);
    });

    // Add drag event handler to update stored position
    group.on('dragend', () => {
        // Update the stored position
        // Subtract half width/height to store the top-left position
        objects[objectIndex].x_pixels = group.x() - widthPixels / 2;
        objects[objectIndex].y_pixels = group.y() - heightPixels / 2;
        console.log(`Object ${label} moved to position: (${objects[objectIndex].x_pixels.toFixed(2)}, ${objects[objectIndex].y_pixels.toFixed(2)})`);
        saveState();
    });

    // Add hover event handlers to show/hide full text
    group.on('mouseenter', () => {
        // Show text on hover
        text.visible(true);
        layer.batchDraw();
    });

    group.on('mouseleave', () => {
        // Hide text when not hovering, unless selected
        if (selectedObjectIndex !== objectIndex) {
            text.visible(false);
            layer.batchDraw();
        }
    });

    // Update export button state
    updateExportButtonState();

    // Return the created object index
    return objectIndex;
}

// Function to add snapping logic to an object group
function addSnapping(group) {
    group.on('dragmove', (e) => {
        // Skip snapping if Alt key is pressed
        if (e.evt.altKey) return;

        const gridSize = 10; // Snap to 10px grid for finer control (visual grid is 20)

        // Get current position
        const x = group.x();
        const y = group.y();

        // Calculate snapped position
        const snappedX = Math.round(x / gridSize) * gridSize;
        const snappedY = Math.round(y / gridSize) * gridSize;

        // Apply snapped position
        group.position({
            x: snappedX,
            y: snappedY
        });
    });
}

// Bootstrap Menu Event Handlers
document.getElementById('menu-new-plan').addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Are you sure you want to create a new floor plan? All unsaved changes will be lost.')) {
        // Clear all objects
        objects.forEach(obj => {
            if (obj.group) obj.group.destroy();
        });

        // Reset data structures
        objects = [];
        selectedObjectIndex = -1;

        // Update UI
        updateExportButtonState();
        // Reset import file name message
        importFileName.textContent = 'Furniture not loaded';
        layer.batchDraw();
    }
});

document.getElementById('menu-import').addEventListener('click', (e) => {
    e.preventDefault();
    // Trigger the file input click
    document.getElementById('json-upload').click();
});

document.getElementById('menu-export').addEventListener('click', (e) => {
    e.preventDefault();
    // Trigger the export function if enabled
    if (!document.getElementById('export-btn').disabled) {
        exportFloorGrid();
    } else {
        alert('You need to add at least one piece of furniture before exporting.');
    }
});

document.getElementById('menu-define-scale').addEventListener('click', (e) => {
    e.preventDefault();
    // Trigger the define scale functionality
    document.getElementById('define-scale-btn').click();
});

document.getElementById('menu-add-furniture').addEventListener('click', (e) => {
    e.preventDefault();
    // Trigger the add furniture functionality
    document.getElementById('add-rectangle-btn').click();
});

document.getElementById('menu-paste-furniture').addEventListener('click', (e) => {
    e.preventDefault();
    // Trigger the paste furniture functionality
    document.getElementById('paste-furniture-btn').click();
});

document.getElementById('menu-settings').addEventListener('click', (e) => {
    e.preventDefault();
    // Create a settings modal if it doesn't exist
    let settingsModal = document.getElementById('settings-modal');

    if (!settingsModal) {
        // Create the modal if it doesn't exist
        settingsModal = document.createElement('div');
        settingsModal.id = 'settings-modal';
        settingsModal.className = 'modal';
        settingsModal.innerHTML = `
            <div class="modal-content">
                <h3>Settings</h3>
                <div class="form-check form-switch mt-2">
                    <input class="form-check-input" type="checkbox" id="settings-show-dimensions" ${showDimensions ? 'checked' : ''}>
                    <label class="form-check-label" for="settings-show-dimensions">Show Dimensions</label>
                </div>
                <div class="modal-buttons">
                    <button id="settings-close-btn">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(settingsModal);

        // Add event listeners for the settings
        document.getElementById('settings-show-dimensions').addEventListener('change', (e) => {
            showDimensions = e.target.checked;
            document.getElementById('show-dimensions-toggle').checked = showDimensions;
            updateObjectLabels();
        });

        document.getElementById('settings-close-btn').addEventListener('click', () => {
            settingsModal.classList.remove('show');
        });
    }

    // Show the modal
    settingsModal.classList.add('show');
});

// Auto-detect Scale Logic
async function autoDetectScale() {
    if (!backgroundImage) {
        alert("Please upload a floor plan image first.");
        return;
    }

    // Show loading
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        const imageElement = backgroundImage.image();

        console.log("Starting OCR...");
        // Recognize text
        const result = await Tesseract.recognize(
            imageElement,
            'eng',
            { logger: m => console.log(m) }
        );

        console.log("OCR Result:", result);
        const candidates = processOCRResults(result);

        if (candidates.length === 0) {
            alert("No room dimensions found in the image text (looking for format like '4.0 x 3.5' or '4000 x 3500').");
            loadingOverlay.style.display = 'none';
            return;
        }

        console.log(`Found ${candidates.length} text candidates:`, candidates);

        // Analyze geometry for candidates
        const candidatesWithScale = [];

        // Create a canvas to extract pixel data from the source image
        const canvas = document.createElement('canvas');
        canvas.width = imageElement.width;
        canvas.height = imageElement.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        for (const candidate of candidates) {
            const scaleData = analyzeRoomGeometry(candidate, imageData);
            if (scaleData) {
                candidatesWithScale.push(scaleData);
            }
        }

        loadingOverlay.style.display = 'none';

        if (candidatesWithScale.length > 0) {
            // Sort by deviation (lower is better)
            candidatesWithScale.sort((a, b) => a.deviation - b.deviation);

            const best = candidatesWithScale[0];

            // Calculate visual scale adjustment
            // The image might be scaled on the stage
            const visualScaleFactor = backgroundImage.width() / imageElement.width;
            const finalScalePixelsPerCm = best.scale * visualScaleFactor;

            const confirmMsg = `Detected scale based on text "${best.text}"\n` +
                `Dimensions: ${best.w_meter}m x ${best.h_meter}m\n` +
                `Calculated Scale: ${finalScalePixelsPerCm.toFixed(2)} px/cm\n` +
                `Confidence deviation: ${(best.deviation * 100).toFixed(1)}% (lower is better)\n\n` +
                `Do you want to apply this scale?`;

            if (confirm(confirmMsg)) {
                scalePixelsPerCm = finalScalePixelsPerCm;
                updateScaleButtonText();
                // alert(`Scale set to ${scalePixelsPerCm.toFixed(2)} px/cm`);
            }
        } else {
            alert("Found dimension text but could not reliably detect corresponding walls from the center of the text.");
        }

    } catch (error) {
        console.error(error);
        alert("Error during auto-detection: " + error.message);
        loadingOverlay.style.display = 'none';
    }
}

function processOCRResults(result) {
    const candidates = [];
    // Regex for "4.0 x 3.5" or "4.0x3.5" or "4000 x 3500"
    // Also captures "3.6m x 3.0m"
    const pattern = /(\d+(?:\.\d+)?)\s*[m]?\s*[xX]\s*(\d+(?:\.\d+)?)\s*[m]?/;

    // Iterate lines
    if (result.data && result.data.lines) {
        result.data.lines.forEach(line => {
            const text = line.text.trim();
            const match = text.match(pattern);
            if (match) {
                let w = parseFloat(match[1]);
                let h = parseFloat(match[2]);

                // Heuristic for m vs mm vs cm vs missing decimal
                // Case 1: > 1000. Likely mm. 4000mm = 4m.
                if (w >= 1000) w /= 1000;
                else if (w >= 100) w /= 100; // Case 2: 100-1000. Likely cm. 400cm = 4m.
                else if (w >= 20) w /= 10;   // Case 3: 20-100. Likely m with missing decimal (OCR error). 36 -> 3.6m.

                if (h >= 1000) h /= 1000;
                else if (h >= 100) h /= 100;
                else if (h >= 20) h /= 10;

                // BBox info
                const bbox = line.bbox; // x0, y0, x1, y1
                const centerX = (bbox.x0 + bbox.x1) / 2;
                const centerY = (bbox.y0 + bbox.y1) / 2;

                candidates.push({
                    text: text,
                    w_meter: w,
                    h_meter: h,
                    cx: centerX,
                    cy: centerY,
                    bbox: bbox
                });
            }
        });
    }
    return candidates;
}

function analyzeRoomGeometry(candidate, imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;

    // Helper to get pixel brightness (0-255)
    function getBrightness(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        if (x < 0 || x >= w || y < 0 || y >= h) return 0;
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        return (r + g + b) / 3;
    }

    // Threshold for "Wall" - darker than white background
    // Floor plans are usually white/light grey, walls black/dark grey.
    // Threshold < 200 is "not white". Threshold < 100 is "dark".
    const WALL_THRESHOLD = 180;

    // We scan OUTWARDS from bbox.
    // Start slightly outside bbox to avoid text itself
    const padding = 2;

    // 1. Scan Left
    let x_left = candidate.bbox.x0 - padding;
    while (x_left > 0 && getBrightness(x_left, candidate.cy) > WALL_THRESHOLD) {
        x_left--;
    }

    // 2. Scan Right
    let x_right = candidate.bbox.x1 + padding;
    while (x_right < w && getBrightness(x_right, candidate.cy) > WALL_THRESHOLD) {
        x_right++;
    }

    // 3. Scan Up
    let y_top = candidate.bbox.y0 - padding;
    while (y_top > 0 && getBrightness(candidate.cx, y_top) > WALL_THRESHOLD) {
        y_top--;
    }

    // 4. Scan Down
    let y_bottom = candidate.bbox.y1 + padding;
    while (y_bottom < h && getBrightness(candidate.cx, y_bottom) > WALL_THRESHOLD) {
        y_bottom++;
    }

    const pixelWidth = x_right - x_left;
    const pixelHeight = y_bottom - y_top;

    // Sanity check: must have hit walls inside image
    if (x_left <= 0 || x_right >= w || y_top <= 0 || y_bottom >= h) {
        return null;
    }

    // Minimum reasonable size (e.g. 50 pixels) to avoid noise
    if (pixelWidth < 20 || pixelHeight < 20) return null;

    // We have pixel dims: Pw, Ph
    // We have meter dims: Mw, Mh
    // Calculate Pw/Mw (scale X) and Ph/Mh (scale Y)
    // Check orientation 1: Mw -> Pw
    const scale1_W = pixelWidth / (candidate.w_meter * 100); // px/cm
    const scale1_H = pixelHeight / (candidate.h_meter * 100);
    const deviation1 = Math.abs(scale1_W - scale1_H) / ((scale1_W + scale1_H) / 2);

    // Check orientation 2: Mh -> Pw
    const scale2_W = pixelWidth / (candidate.h_meter * 100);
    const scale2_H = pixelHeight / (candidate.w_meter * 100);
    const deviation2 = Math.abs(scale2_W - scale2_H) / ((scale2_W + scale2_H) / 2);

    let bestScale, deviation;

    if (deviation1 < deviation2) {
        bestScale = (scale1_W + scale1_H) / 2;
        deviation = deviation1;
    } else {
        bestScale = (scale2_W + scale2_H) / 2;
        deviation = deviation2;
    }

    // If deviation is too high (> 15%), it's likely not a match
    if (deviation > 0.25) return null;

    return {
        ...candidate,
        scale: bestScale,
        deviation: deviation,
        pixelWidth,
        pixelHeight
    };
}