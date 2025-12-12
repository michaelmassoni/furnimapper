# FurniMapper

FurniMapper is a browser-based tool for planning furniture layouts on floor plan images. It allows you to upload a floor plan, define a scale, and place customisable furniture objects to visualise your space.

## Features

*   **Metric Support**: All measurements are in centimeters (cm).
*   **Floor Plan Import**: Upload any image file as your background. The tool automatically fits it to the workspace while maintaining the correct aspect ratio.
*   **Scale Calibration**: Easily define the scale of your floor plan by drawing a line of a known real-world length.
*   **Furniture Management**:
    *   **Add**: Create furniture with custom dimensions and labels.
    *   **Duplicate**: Quickly clone selected furniture items.
    *   **Paste from spreadsheet**: Import multiple items at once via CSV/spreadsheet data.
    *   **Manipulate**: Drag to move, click buttons or use keyboard shortcuts ('R', 'E') to rotate.
*   **Dark Mode**: Comes with a built-in dark mode (default) and a light mode toggle.
*   **Import/Export**: Save your layout as a JSON file and reload it later to continue working.
*   **Offline Capable**: Runs entirely in the browser; no backend server required.

## Quick Start

1.  **Open the App**: Simply open `index.html` in your web browser.
2.  **Upload Plan**: Click **"New Plan / Upload Image"** to select your floor plan image.
3.  **Define Scale**:
    *   Click **"Define Scale"**.
    *   Click and drag a line where you know the real-world distance (e.g. a doorway or a wall).
    *   Enter the distance in centimeters (e.g. 90 for a standard door).
4.  **Add Furniture**:
    *   Click **"Add Furniture"** to create a specific item.
    *   Or, verify the **"Paste Furniture"** feature to bulk add items.

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
