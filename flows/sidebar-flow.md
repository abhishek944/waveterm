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