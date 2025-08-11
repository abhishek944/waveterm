# Sidebar Architecture and Flow

This document explains the three distinct sidebars in the application, their purpose, and the key files and functions that govern their behavior.

## 1. Left Sidebar (Main Sidebar)

The left sidebar is the primary navigation element in the application, providing access to workspaces, connections, and settings.

### Flow

- The user interacts with the main sidebar to switch between workspaces (sessions), manage connections, or access application settings.
- The sidebar's state, including its width and whether it's collapsed, is managed by `GlobalModel.mainSidebarModel`.
- The `ResizableSidebar` component handles the resizing logic, allowing the user to adjust the sidebar's width.

### Key Files and Functions

- **`src_new/components/sidebar/main.tsx`**: This is the main component for the left sidebar. It renders the list of workspaces, connections, and settings links.
  - `MainSideBar`: The main React component for the sidebar.
  - `handleSessionClick`: Switches the active session.
  - `handleNewSession`: Creates a new session.
  - `handleConnectionsClick`: Switches to the connections view.
  - `handleSettingsClick`: Switches to the settings view.
- **`src_new/components/ui/resizable-sidebar.tsx`**: A reusable component that provides the resizing functionality for the sidebars.
- **`src_new/models/global.ts`**: The `GlobalModel` contains the `mainSidebarModel`, which holds the state for the main sidebar.

## 2. Right Sidebar

The right sidebar is located to the right of the main screen and is primarily used for AI chat and other contextual information.

### Flow

- The right sidebar's visibility and collapsed state are managed by `GlobalModel.rightSidebarModel`.
- The user can toggle the sidebar's visibility using a keybinding or by clicking a button.
- The content of the right sidebar is determined by the current mode, which is "aichat" by default.

### Key Files and Functions

- **`src_new/components/sidebar/right.tsx`**: This component renders the right sidebar and its content.
  - `RightSideBar`: The main React component for the right sidebar.
  - `toggleCollapse`: Toggles the collapsed state of the sidebar.
- **`src_new/components/sidebar/aichat.tsx`**: This component contains the AI chat interface that is displayed in the right sidebar.
  - `ChatSidebar`: The main component for the AI chat interface.
  - `submitChatMessage`: Submits a message to the AI chat.
- **`src_new/models/global.ts`**: The `GlobalModel` contains the `rightSidebarModel`, which holds the state for the right sidebar.

## 3. Screen Sidebar

The screen sidebar appears inside the main screen area, to the right of the terminal output. It is used to display a single line's content in a separate, resizable pane.

### Flow

- The user can move a line to the screen sidebar by clicking the "Move to Sidebar" action on a command line.
- The `screenSidebarAddLine` function in `GlobalCommandRunner` is called to add the line to the sidebar.
- The `ScreenSidebar` component in `src_new/components/workspace/screen/screenview.tsx` renders the sidebar and its content.
- The sidebar's visibility and width are controlled by the `viewOpts` of the active screen.

### Key Files and Functions

- **`src_new/components/workspace/screen/screenview.tsx`**: This file contains the `ScreenSidebar` component, which renders the screen sidebar.
  - `ScreenSidebar`: The main React component for the screen sidebar.
  - `sidebarClose`: Closes the screen sidebar.
  - `sidebarOpenHalf`: Sets the sidebar width to 50%.
  - `sidebarOpenPartial`: Sets the sidebar width to 500px.
- **`src_new/components/line/linecomps.tsx`**: This file contains the `LineActions` component, which includes the "Move to Sidebar" button.
  - `clickMoveToSidebar`: Calls `GlobalCommandRunner.screenSidebarAddLine` to move the line to the sidebar.
- **`src_new/models/commandrunner.ts`**: The `GlobalCommandRunner` contains the `screenSidebarAddLine` and `screenSidebarRemove` functions, which control the content of the screen sidebar.

## Technical Implementation Notes

### Screen Sidebar Race Condition

When moving a line to the Screen Sidebar, a race condition can occur that prevents the command's output from being displayed consistently. This is due to the following sequence of events:

1.  **Action Triggered**: The user clicks the "Move to Sidebar" action, sending a command to the backend.
2.  **UI Re-renders**: The React UI immediately re-renders to show the sidebar panel based on the initial state change.
3.  **Data Not Ready**: The `SidebarLineContainer` component attempts to create its data handler (`ForwardLineContainer`) instantly. However, the full state update from the backend (including the command output and terminal data) may not have been fully processed on the client yet.
4.  **Result**: The container is created with incomplete information, leading to the output not being rendered.

To solve this, a `setTimeout` is used within the `SidebarLineContainer`'s `useEffect` hook. This delays the creation of the `ForwardLineContainer` by a short period (e.g., 100ms), pushing it to the next cycle of the JavaScript event loop. This brief pause provides enough time for the client-side MobX state to be fully synchronized, ensuring that when the `ForwardLineContainer` is instantiated, it has all the necessary data to render the line and its output correctly.

### Data Flow for Moving a Line to the Sidebar

The process of moving a line to the sidebar involves a client-server interaction to ensure the application state is synchronized.

**1. Data Sent from Frontend to Backend:**

When the user clicks the "Move to Sidebar" action, the frontend client sends a command packet over a WebSocket. This packet contains:
- **Command**: `sidebar`
- **Subcommand**: `add`
- **Argument**: The `lineid` of the line to be moved.

This instructs the backend to update the state for the current screen.

**2. Data Received from Backend to Frontend:**

After processing the request, the backend sends a state update packet back to the client. This packet includes:
- **Updated Screen `viewOpts`**: The `sidebar.open` property is set to `true`, and `sidebar.sidebarlineid` is set to the relevant `lineid`.
- **Updated Line `linestate`**: The original line in the main screen has its `wave:min` property set to `true`, causing it to minimize.
- **Terminal Data**: The backend ensures that the terminal output and other data associated with the `lineid` are sent to the client so they can be rendered within the sidebar.

This comprehensive state update ensures that the UI re-renders accurately, showing the sidebar with the correct content while minimizing the original line.

### Backend Command Breakdown

When a line is moved to the sidebar, a sequence of commands is sent to the backend to ensure the application state is updated correctly. Here's a breakdown of each command and its purpose:

- **`screen:set`**: This is a general-purpose command for modifying the properties of the current screen. When a line is selected, this command is used to update the backend with the new `selectedLine`, ensuring that the application's state remains consistent across the client and server.

- **`sidebar:add`**: This command is responsible for adding a line to the screen's sidebar. It takes the `lineId` as an argument and instructs the backend to update the screen's `viewOpts` to include this line in the sidebar's content.

- **`line:setheight`**: This command informs the backend of the height of a line's content, which is crucial for terminal commands with variable output lengths. The backend needs this information to render the terminal correctly and to ensure that scrolling and anchoring function as expected. The multiple calls to this command occur because the component re-renders and recalculates its height as new data is received or when the window is resized, ensuring the backend always has the most up-to-date information.

### Why `line:setheight` is Called Multiple Times

The `line:setheight` command is called frequently to keep the backend synchronized with the frontend's layout. Here are the primary reasons for the multiple calls:

- **Initial Render**: When a line is first displayed, its height is calculated and sent to the backend.
- **Window Resizing**: Any change to the application window's size can cause text to reflow, altering the height of lines. Each change triggers a new `line:setheight` call.
- **Dynamic Content**: For running commands, new output is continuously streamed, changing the terminal's height and requiring updates to be sent to the backend.
- **Opening the Sidebar**: When the sidebar is opened, it reduces the width of the main content area. This is effectively a resize event, which causes the height of all visible lines to be recalculated and reported to the backend.

These frequent updates are essential for maintaining consistent scrolling, anchoring, and rendering behavior.