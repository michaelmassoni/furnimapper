# FurniMapper

FurniMapper is a browser-based tool for planning furniture layouts on floor plan images. It allows you to upload a floor plan, define a scale, and place customisable furniture objects to visualise your space.

## Features
## Key Features

- **Infinite Workspace**: The canvas automatically resizes to fill your window, allowing for unrestricted movement.
- **Background Image Support**: Upload any floor plan image (JPG, PNG). It centers automatically.
- **Smart Scale Definition**:
    - **Manual**: Draw a line on a known dimension (e.g. a doorway) to define the scale.
    - **Auto-Detect (Experimental)**: Uses OCR to find dimension labels in the image and suggest a scale. This may not work correctly for all floorplans, double check the result.
- **Furniture Builder**:
    - Interactive list to build your furniture inventory.
    - **Bulk Import**: Paste data from spreadsheets (Label, Width, Depth).
    - **Manual Entry**: Add individual items on the fly.
- **Robust Persistence**:
    - **Auto-save**: Your work (objects, scale, background image) saves automatically to your browser.
    - **Undo/Redo**: Full history support for moving, rotating, adding, and deleting items.
- **Intuitive Controls**:
    - **Rotation**: Rotate items in 30-degree increments (R/L keys).
    - **Visual Feedback**: Dimensions update in real-time as you scale or resize.

## Usage

1.  **Open the Tool**: Open `index.html` in a web browser. Alternatively, it is available at https://furnimapper.michaelmassoni.com
2.  **Upload Plan**: Click "Choose File" to load your floor plan image.
3.  **Define Scale**:
    *   Click "Define Scale", draw a line over a known length, and enter the length in cm.
    *   OR try "Auto Scale" to let the tool find dimensions for you.
4.  **Add Furniture**:
    *   Click "Import List" to paste a list of furniture or add items manually.
    *   Click "Add Item" to add a single generic rectangle.
5.  **Arrange**: Drag items to position them. Click to select, then use buttons or keys to rotate/delete.
6.  **Save**: Your work saves automatically. Just reopen the page to pick up where you left off.

## Bulk Import Format

You can paste furniture data from a spreadsheet (Excel, Google Sheets) or a CSV string. The expected format is tab-separated or comma-separated values:

**Headers**: `Item`, `Width`, `Length` (or `Height`)

**Example**:
```
Sofa	200	90
Table	120	80
Chair	50	50
```

*Note: Dimensions should be in centimeters.*

## Controls

*   **Select**: Click on an object.
*   **Move**: Drag an object.
*   **Rotate**:
    *   Press `R` to rotate clockwise.
    *   Press `E` to rotate counter-clockwise.
    *   Or use the on-screen rotation buttons.
*   **Duplicate**: Click the Duplicate button to clone the selected item.
*   **Delete**: Click the Delete button to remove the selected item.

## Development

This project is built with vanilla JavaScript and [Konva.js](https://konvajs.org/) for canvas manipulation.

*   `app.js`: Contains the main application logic, event listeners, and Konva state management.
*   `helpers.js`: Utility functions, primarily for parsing CSV data.
*   `styles.css`: Custom styling and dark mode implementation.
*   `examples/`: Sample JSON files for testing import functionality.
*   `tests/`: Standalone HTML files for verifying specific features (csv parsing, rotation, etc.).

## Deployment

Since this is a static site, it can be deployed anywhere:
*   **Cloudflare Pages**: Connect your Git repository and deploy. No build command is required.
*   **GitHub Pages**: Enable Pages in your repository settings.
*   **Local**: Just double-click `index.html`.
