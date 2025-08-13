# Plugin System Workflow

This document describes how renderer plugins are configured, loaded, and used in Wave Terminal.

## Overview

Wave Terminal uses a flexible plugin architecture to render various content types (e.g., markdown, code, images).  
Plugins are defined in the frontend under `src_new/plugins/plugins.ts` and loaded dynamically at runtime.

## Plugin Configuration

The `PluginConfigs` array in [`src_new/plugins/plugins.ts`](src_new/plugins/plugins.ts) defines all available plugins.  
Each plugin object includes the following properties:

- **name**: Unique identifier for the plugin (e.g., `"markdown"`).  
- **rendererType**: `"simple"` or `"full"`, determines rendering strategy.  
- **heightType**: UI layout hints (`"pixels"`, `"lines"`, etc.).  
- **dataType**: Source data type (`"blob"` or `"model"`).  
- **collapseType**: How the UI collapses rendered content (`"hide"`, `"remove"`).  
- **globalCss**: Optional path or CSS string for global styling applied by the plugin.  
- **mimeTypes**: Array of MIME types that the plugin can handle (e.g., `["text/markdown"]`).  
- **simpleComponent** / **fullComponent**: React component responsible for rendering.  
- **modelCtor**: Factory function for plugin-specific data models (only for `"full"` rendererType).  

Example markdown config:

```ts
{
  name: "markdown",
  rendererType: "simple",
  heightType: "pixels",
  dataType: "blob",
  collapseType: "hide",
  globalCss: null,
  mimeTypes: ["text/markdown"],
  simpleComponent: SimpleMarkdownRenderer,
},
```

## PluginModelClass

The `PluginModelClass` in the same file orchestrates plugin registration and resource loading.  
Responsibilities:

- Validate plugin names (no duplicates, reserved names `"terminal"` and `"none"`).  
- Register and store plugin configs in `rendererPlugins`.  
- Load additional resources (icons, README, metadata, screenshots).  
- Provide lookup via `getRendererPluginByName(name)`.  
- Expose all plugins via `allPlugins()`.  

Core methods:

- `constructor(pluginConfigs: RendererPluginType[])`  
- `loadAllPluginResources()`  
- `attachScreenshots(plugin)`  
- `loadPluginResources(plugin)`  
- `getRendererPluginByName(name: string)`  
- `allPlugins()`  

## Resource Loading Flow

1. **attachScreenshots**: Uses `require.context` to bulk-load images under `.../screenshots`.  
2. **Dynamic Imports**:  
   - **icon**: `@/plugins/<name>/icon.svg`  
   - **readme**: `@/plugins/<name>/readme.md`  
   - **meta**: `@/plugins/<name>/meta.json`  
3. All imports are wrapped in promises and errors are logged without blocking.

## Runtime Usage

When content is rendered in the UI, the application selects a plugin based on MIME type.  
The renderer component (simple or full) receives the data and displays it.  
If `globalCss` is provided, its styles are applied to the document.

## Extending the Plugin System

To add a new plugin:
1. Append a new config object to `PluginConfigs`.  
2. Create the plugin directory under `src_new/plugins/<name>/`.  
3. Implement the renderer component (`<name>.tsx`).  
4. Supply `icon.svg`, `readme.md`, and `meta.json` in that directory.  
5. (Optional) Add CSS file and set `globalCss` to its path.  
6. Reload or rebuild to register the new plugin.

## Examples

- **Markdown**: Renders markdown text via `SimpleMarkdownRenderer`.  
- **Code**: Renders source code blocks via `SourceCodeRenderer`.  
- **Image**: Displays images with `SimpleImageRenderer`.  

## Plugin Config in Code

See `src_new/plugins/plugins.ts` for the complete list of built-in plugins.