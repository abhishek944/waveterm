# Wave Terminal Commands

This document provides a detailed description of all the commands available in Wave Terminal.

## `/run`

### Description

The `/run` command executes a shell command in the current session. It is the default command, so any input that does not start with a `/` is treated as a `/run` command.

### Usage

`/run [command]`

- `command`: The shell command to execute.

### Options

- `renderer=[renderer-name]`: Specifies a custom renderer to display the command's output.
- `view=[view-name]`: An alias for the `renderer` option.
- `template=[template-name]`: Specifies a template to use with the renderer.
- `lang=[language]`: Specifies the language for syntax highlighting in renderers that support it.
- `rtnstate=[true|false]`: Overrides the automatic detection of whether the command should return shell state.
- `sudo=[true|false]`: Forces or prevents the command from being run with `sudo`.
- `wterm=[size]`: Specifies the terminal size (e.g., `80x25`, `MxM` for maximum).

## `/eval`

### Description

The `/eval` command evaluates and executes a command string. It is used internally to handle command aliases and history expansion.

### Usage

`/eval [command]`

- `command`: The command string to evaluate and execute.

### Options

- `nohist=[true|false]`: If true, the command will not be added to the command history.
- `sidebar=[true|false]`: If true, the command's output will be displayed in the sidebar.

## `/comment`

### Description

The `/comment` command adds a text comment to the current screen. This is useful for annotating your terminal session.

### Usage

`/comment [text]`

- `text`: The comment text to add.

## `/cr`, `/connect`

### Description

The `/cr` or `/connect` command switches the current remote connection for the active screen. If no remote is specified, it displays a list of available remote connections.

### Usage

`/cr [remote-name]`

- `remote-name`: The name or alias of the remote connection to switch to.

### Options

- `verbose=[true|false]`: If true, displays detailed information about the connection process.
- `shell=[shell-type]`: Specifies the shell to use for the new connection (e.g., `bash`, `zsh`).

## `/clear`

### Description

The `/clear` command removes all lines from the current screen.

### Usage

`/clear`

### Options

- `archive=[true|false]`: If true, the lines are archived instead of being permanently deleted.

## `/reset`

### Description

The `/reset` command reinitializes the shell state for the current remote connection. This is useful for clearing the shell environment and starting fresh.

### Usage

`/reset`

### Options

- `verbose=[true|false]`: If true, displays detailed information about the reset process.
- `shell=[shell-type]`: Specifies the shell to use for the new state (e.g., `bash`, `zsh`).

## `/reset:cwd`

### Description

The `/reset:cwd` command resets the current working directory to the user's home directory (`~`) for the current remote connection.

### Usage

`/reset:cwd`

## `/signal`

### Description

The `/signal` command sends a signal to a running command.

### Usage

`/signal [line] [signal]`

- `line`: The line number or line ID of the command to send the signal to.
- `signal`: The name of the signal to send (e.g., `TERM`, `KILL`, `INT`).

## `/sync`

### Description

The `/sync` command synchronizes the shell state with the remote connection. This is useful when the local state is out of sync with the remote.

### Usage

`/sync`

## `/sleep`

### Description

The `/sleep` command pauses execution for a specified number of milliseconds.

### Usage

`/sleep [milliseconds]`

- `milliseconds`: The number of milliseconds to sleep.

## `/mainview`

### Description

The `/mainview` command switches the main view of the application.

### Usage

`/mainview [view]`

- `view`: The view to switch to. Valid options are `session`, `connections`, and `settings`.

## `/session`

### Description

The `/session` command manages sessions. It can be used to switch between sessions, create new sessions, and manage existing sessions.

### Subcommands

#### `/session [name|id|pos]`

Switches to the specified session.

- `name`: The name of the session.
- `id`: The ID of the session.
- `pos`: The position of the session.

#### `/session:open`

Creates a new session.

- `name=[name]`: The name for the new session.
- `activate=[true|false]`: If true, switches to the new session immediately.

#### `/session:new`

Alias for `/session:open`.

#### `/session:set`

Sets attributes for the current session.

- `name=[name]`: The new name for the session.

#### `/session:delete`

Deletes a session.

- `[name|id|pos]`: The session to delete.

#### `/session:archive`

Archives a session.

- `[name|id|pos]`: The session to archive.
- `[true|false]`: Whether to archive or unarchive the session.

#### `/session:showall`

Displays a list of all sessions.

#### `/session:show`

Displays detailed information about the current session.

#### `/session:openshared`

Opens a shared session (not available in the current version).

#### `/session:termtheme`

Sets the terminal theme for the session.

- `id=[id]`: The ID of the theme.
- `name=[name]`: The name of the theme.

#### `/session:ensureone`

Ensures that at least one session exists, creating one if necessary.

## `/screen`

### Description

The `/screen` command manages screens (tabs) within a session. It can be used to switch between screens, create new screens, and manage existing screens.

### Subcommands

#### `/screen [name|id|pos]`

Switches to the specified screen.

- `name`: The name of the screen.
- `id`: The ID of the screen.
- `pos`: The position of the screen.

#### `/screen:open`

Creates a new screen.

- `name=[name]`: The name for the new screen.
- `activate=[true|false]`: If true, switches to the new screen immediately.

#### `/screen:new`

Alias for `/screen:open`.

#### `/screen:set`

Sets attributes for the current screen.

- `name=[name]`: The new name for the screen.
- `sharename=[sharename]`: The name used for sharing the screen.
- `tabcolor=[color]`: The color of the screen's tab.
- `tabicon=[icon]`: The icon of the screen's tab.
- `pos=[position]`: The position of the screen.
- `focus=[input|cmd]`: Sets the focus to the input area or the command output.
- `line=[line]`: Jumps to the specified line.
- `anchor=[line]:[offset]`: Sets the scroll anchor to a specific line and offset.

#### `/screen:delete`

Deletes a screen.

- `[name|id|pos]`: The screen to delete.

#### `/screen:archive`

Archives a screen.

- `[name|id|pos]`: The screen to archive.
- `[true|false]`: Whether to archive or unarchive the screen.

#### `/screen:showall`

Displays a list of all screens in the current session.

#### `/screen:show`

Displays detailed information about the current screen.

#### `/screen:webshare`

Web sharing is no longer available.

#### `/screen:reorder`

Changes the order of screens.

- `index=[index]`: The new position for the screen.

#### `/screen:termtheme`

Sets the terminal theme for the screen.

- `id=[id]`: The ID of the theme.
- `name=[name]`: The name of the theme.

#### `/screen:resize`

Resizes the terminal for running commands on the screen.

- `cols=[columns]`: The number of columns for the terminal.
- `include=[lineids]`: A comma-separated list of line IDs to resize.
- `exclude=[lineids]`: A comma-separated list of line IDs to exclude from resizing.

## `/remote`

### Description

The `/remote` command manages remote connections. It can be used to view, create, and manage remote connections.

### Subcommands

#### `/remote:show`

Displays detailed information about the current remote connection.

#### `/remote:showall`

Displays a list of all remote connections.

#### `/remote:new [user@host]`

Creates a new remote connection.

- `user@host`: The user and host for the new connection.
- `alias=[alias]`: An alias for the connection.
- `connectmode=[startup|auto|manual]`: The connection mode.
- `key=[path]`: The path to the SSH key.
- `password=[password]`: The password for the connection.
- `autoinstall=[true|false]`: Whether to automatically install the remote agent.
- `color=[color]`: The color for the remote's tab.

#### `/remote:archive`

Archives the current remote connection.

#### `/remote:set`

Sets attributes for the current remote connection.

- `alias=[alias]`: The new alias for the connection.
- `connectmode=[startup|auto|manual]`: The new connection mode.
- `key=[path]`: The new path to the SSH key.
- `password=[password]`: The new password for the connection.
- `autoinstall=[true|false]`: Whether to automatically install the remote agent.
- `color=[color]`: The new color for the remote's tab.

#### `/remote:disconnect`

Disconnects the current remote connection.

- `force=[true|false]`: If true, forces the disconnection.

#### `/remote:connect`

Connects to the current remote connection.

#### `/remote:install`

Installs the remote agent on the current remote connection.

#### `/remote:installcancel`

Cancels the installation of the remote agent.

#### `/remote:reset`

Reinitializes the shell state for the current remote connection.

#### `/remote:parse`

Parses the local SSH config file and imports connections.

#### `/copyfile [source] [destination]`

Copies a file between the local machine and a remote connection.

- `source`: The source file path, optionally prefixed with `[remote]:`.
- `destination`: The destination file path, optionally prefixed with `[remote]:`.

## `/line`

### Description

The `/line` command manages individual lines within a screen.

### Subcommands

#### `/line:show [line]`

Displays detailed information about a specific line.

- `line`: The line number or line ID.

#### `/line:star [line] [star-value]`

Sets the star value for a line.

- `line`: The line number or line ID.
- `star-value`: A number from 0 to 5.

#### `/line:bookmark [line]`

Creates a bookmark from a command line.

- `line`: The line number or line ID of the command.

#### `/line:pin [line]`

Pins a line to the screen (not yet implemented).

- `line`: The line number or line ID.

#### `/line:archive [line] [true|false]`

Archives or unarchives a line.

- `line`: The line number or line ID.
- `true|false`: Whether to archive or unarchive the line.

#### `/line:delete [line]`

Deletes one or more lines.

- `line`: The line number or line ID. Can be repeated to delete multiple lines.

#### `/line:setheight [line] [height]`

Sets the height of a line's output.

- `line`: The line number or line ID.
- `height`: The height in pixels.

#### `/line:view [session] [screen] [line]`

Switches to a specific line in a specific screen and session.

- `session`: The session name or ID.
- `screen`: The screen name or ID.
- `line`: The line number or line ID.

#### `/line:set [line]`

Sets attributes for a line.

- `line`: The line number or line ID.
- `renderer=[renderer-name]`: The renderer for the line.
- `view=[view-name]`: An alias for `renderer`.
- `state=[json]`: A JSON string to set as the line's state.

#### `/line:restart [line]`

Restarts a command.

- `line`: The line number or line ID of the command to restart.

#### `/line:minimize [line] [true|false]`

Minimizes or unminimizes a line.

- `line`: The line number or line ID.
- `true|false`: Whether to minimize or unminimize the line.

## `/client`

### Description

The `/client` command manages client-side settings and information.

### Subcommands

#### `/client:show`

Displays information about the client, including version, telemetry status, and AI settings.

#### `/client:set`

Sets various client options.

- `termfontsize=[size]`: Sets the terminal font size.
- `termfontfamily=[family]`: Sets the terminal font family.
- `theme=[light|dark|system]`: Sets the application theme.
- `termtheme=[theme-name]`: Sets the terminal theme.
- `inputposition=[top|bottom]`: Sets the position of the command input box.
- `openaiapitoken=[token]`: Sets the OpenAI API token.
- `openaimodel=[model]`: Sets the OpenAI model.
- `openaibaseurl=[url]`: Sets the base URL for the OpenAI API.
- `openaimaxtokens=[tokens]`: Sets the maximum number of tokens for OpenAI responses.
- `openaimaxchoices=[choices]`: Sets the maximum number of choices for OpenAI responses.
- `openaitimeout=[seconds]`: Sets the timeout for OpenAI API requests.
- `webgl=[true|false]`: Enables or disables WebGL rendering.
- `defaultprovider=[openai|gemini|azure]`: Sets the default AI provider.
- `geminimodel=[model]`: Sets the Gemini model.
- `geminiapitoken=[token]`: Sets the Gemini API token.
- `azurebaseurl=[url]`: Sets the base URL for the Azure OpenAI API.
- `azuredeploymentname=[name]`: Sets the deployment name for the Azure OpenAI API.
- `azureapitoken=[token]`: Sets the Azure OpenAI API token.
- `sudopwstore=[on|off|notimeout]`: Configures sudo password storage.
- `sudopwtimeout=[minutes]`: Sets the timeout for sudo password storage.
- `sudopwclearonsleep=[true|false]`: Clears the sudo password on sleep.

#### `/client:notifyupdatewriter`

Notifies the update writer (internal command).

#### `/client:accepttos`

Accepts the Terms of Service.

#### `/client:setconfirmflag [flag] [0|1]`

Sets a confirmation flag.

- `flag`: The name of the flag.
- `0|1`: The value of the flag.

#### `/client:setmainsidebar`

Sets the properties of the main sidebar.

- `width=[width]`: The width of the sidebar in pixels or percentage.
- `collapsed=[1|0]`: Whether the sidebar is collapsed.

#### `/client:setrightsidebar`

Sets the properties of the right sidebar.

- `width=[width]`: The width of the sidebar in pixels or percentage.
- `collapsed=[1|0]`: Whether the sidebar is collapsed.

#### `/client:setglobalshortcut [shortcut]`

Sets the global shortcut for the application.

- `shortcut`: The new shortcut string.

#### `/client:verifyaiprovider`

Verifies the connection to an AI provider.

- `provider=[openai|gemini|azure]`: The AI provider to verify.

## `/sidebar`

### Description

The `/sidebar` command manages the sidebar.

### Subcommands

#### `/sidebar:open`

Opens the sidebar.

- `width=[width]`: The width of the sidebar in pixels or percentage.

#### `/sidebar:close`

Closes the sidebar.

#### `/sidebar:add`

Adds a line to the sidebar.

- `line=[line]`: The line number or line ID to add.
- `width=[width]`: The width of the sidebar in pixels or percentage.

#### `/sidebar:remove`

Removes the current line from the sidebar.

## `/releasecheck`

### Description

The `/releasecheck` command manages automatic checks for new releases of Wave Terminal.

### Subcommands

#### `/releasecheck`

Manually triggers a check for a new release.

#### `/releasecheck:autoon`

Enables automatic checking for new releases.

#### `/releasecheck:autooff`

Disables automatic checking for new releases.

## `/history`

### Description

The `/history` command manages command history.

### Subcommands

#### `/history`

Displays the command history for the current screen.

- `maxitems=[number]`: The maximum number of history items to display.
- `type=[screen|session|global]`: The scope of the history to display.
- `noshow=[true|false]`: If true, the history is not displayed.

#### `/history:viewall`

Displays the history view, allowing for searching and filtering.

- `offset=[number]`: The offset to start displaying history items from.
- `rawoffset=[number]`: The raw offset to start displaying history items from.
- `text=[search-text]`: Filters history items by text.
- `searchsession=[session]`: Filters history items by session.
- `searchremote=[remote]`: Filters history items by remote.
- `fromts=[timestamp]`: Filters history items from a specific timestamp.
- `meta=[true|false]`: Toggles the display of metadata.
- `filter=[true|false]`: Toggles the command filter.

#### `/history:purge [id]`

Purges one or more history items by ID.

- `id`: The ID of the history item to purge. Can be repeated to purge multiple items.

## `/bookmarks`

### Description

The `/bookmarks` command manages bookmarks.

### Subcommands

#### `/bookmarks:show`

Displays the bookmarks view.

- `[tag]`: Filters bookmarks by tag.

#### `/bookmark:set [id]`

Sets attributes for a bookmark.

- `id`: The ID of the bookmark.
- `desc=[description]`: The new description for the bookmark.
- `cmdstr=[command]`: The new command string for the bookmark.

#### `/bookmark:delete [id]`

Deletes a bookmark.

- `id`: The ID of the bookmark to delete.

## `/agent`

### Description

The `/agent` command activates the AI agent mode, which allows you to interact with an AI assistant.

### Usage

`/agent [prompt]`

- `prompt`: The initial prompt to send to the AI agent.

### Options

- `provider=[provider-name]`: Specifies the AI provider to use (e.g., `openai`, `gemini`).
- `wterm=[size]`: Specifies the terminal size for the agent's output.

## `/thread`

### Description

The `/thread` command starts a new AI conversation thread or continues an existing one.

### Usage

`/thread [prompt]`

- `prompt`: The prompt to send to the AI.

### Options

- `provider=[provider-name]`: Specifies the AI provider to use (e.g., `openai`, `gemini`).

## Viewing Files

### Description

Wave Terminal provides several commands for viewing different file types directly in the terminal.

### Commands

- `/view:stat [file]` Displays metadata about a file.
- `/view:test [file]` Displays the content of a file for testing purposes.
- `/codeedit [file]` Opens a file for editing in a code editor view.
- `/codeview [file]` Opens a file for viewing in a code editor view.
- `/imageview [file]` Displays an image file.
- `/markdownview [file]` or `/mdview [file]` Renders and displays a Markdown file.
- `/pdfview [file]` Displays a PDF file.
- `/mediaview [file]` Plays a video or audio file.
- `/csvview [file]` Displays a CSV file in a table format.

## Miscellaneous Commands

### `/sudo:clear`

Clears the cached sudo password for the current remote connection.

- `all=[true|false]`: If true, clears the cached sudo password for all remote connections.

### `/_killserver`

Stops the Wave Terminal server.

### `/_dumpstate`

Dumps the current shell state to the log for debugging purposes.

### `/_debug:ri`

Displays debugging information about the remote instance.

### `/autocomplete:on`

Enables autocompletion.

### `/autocomplete:off`

Disables autocompletion.
