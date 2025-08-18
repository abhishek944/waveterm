# Adhoc Flows

This document describes various adhoc flows in the application that don't fit into other specific flow documents.

## Imageview Command Flow

The imageview command (`/imageview <filename>`) allows users to display images directly in the terminal. Here's how it works:

### 1. Command Execution (Frontend ’ Backend)

When a user types `/imageview image.png`, the command is sent to the backend via the WebSocket connection.

### 2. Backend Processing

**File: `wavesrv/pkg/cmdrunner/view-cmd-runner.go`**

The `ImageViewCommand` function handles the command:

1. **Validates arguments** - Ensures a filename is provided
2. **Resolves UI IDs** - Gets session, screen, and remote connection info
3. **Creates a static command** - Makes a command record with the output string
4. **Sets line state** - Critically sets two properties:
   ```go
   lineState[sstore.LineState_Source] = "file"  // Maps to "prompt:source"
   lineState[sstore.LineState_File] = filePath  // Maps to "prompt:file"
   ```
5. **Adds line for command** - Creates a new line with renderer type "image"

### 3. Frontend Rendering

**File: `src_new/plugins/core/basicrenderer.tsx`**

The `SimpleBlobRenderer` component handles rendering:

1. **Initialization**:
   - Creates `SimpleBlobRendererModel` instance
   - Checks if `isDone` is true (command completed)
   - If true, schedules a reload after 10ms

2. **Data Loading**:
   - `reload_noDelay()` checks the `lineState["prompt:source"]`
   - Since it's "file", calls `reloadFileData()`
   - Reads `lineState["prompt:file"]` to get the filename
   - Calls `GlobalModel.readRemoteFile()` to fetch the file

3. **File Fetching**:
   - Makes HTTP GET request to `/api/read-file`
   - Backend reads the file and returns it as a blob
   - File metadata is sent in `X-FileInfo` header

4. **Rendering**:
   - While loading, shows "loading content..." with pulse animation
   - Once loaded (`loading` observable becomes false), renders the plugin component
   - The `SimpleImageRenderer` component from `src_new/plugins/image/image.tsx` displays the image

**File: `src_new/plugins/image/image.tsx`**

The `SimpleImageRenderer`:
1. Creates a blob URL from the file data
2. Handles SVG files specially by setting the correct MIME type
3. Renders an `<img>` tag with max height/width constraints
4. Cleans up the blob URL when unmounting

### 4. Important Details

- **MobX Observables**: The renderer must be wrapped with `observer` to react to loading state changes
- **Line State Mapping**: Backend uses constants that map to frontend keys:
  - `LineState_Source` ’ `"prompt:source"`
  - `LineState_File` ’ `"prompt:file"`
- **Plugin System**: The image renderer is registered in `src_new/plugins/plugins.ts` with:
  - `rendererType: "simple"`
  - `dataType: "blob"`
  - `mimeTypes: ["image/*"]`

### 5. Error Handling

- If file is not found, displays error message
- If file loading fails, shows error in red text
- Handles both read-only and not-found file states

### 6. Related Commands

The same pattern is used for:
- `/pdfview` - Display PDF files
- `/mediaview` - Display video/audio files
- `/csvview` - Display CSV files as tables

Each uses the same `SimpleBlobRenderer` base with different plugin components for rendering.