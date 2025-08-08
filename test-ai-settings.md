# Testing AI Settings Issue

## Problem Summary
The AI provider settings UI is not properly saving or displaying API keys. When a user enters an API key and clicks the checkmark, the value doesn't persist or show up.

## Root Cause
The server-side `ClientSetCommand` function was not handling the new AI provider options (`geminiapitoken`, `azurebaseurl`, `azuredeploymentname`, `azureapitoken`, `defaultprovider`). It only handled the legacy OpenAI options.

## Fix Applied
1. Added `UpdateClientAIOpts` function in `dbops.go` to update the new `aiopts` field in the database
2. Updated `ClientSetCommand` in `cmdrunner.go` to handle all the new AI provider options
3. Added proper validation for API tokens
4. Ensured deep copying of existing AI options to prevent data loss when updating

## Changes Made

### `/Users/abhishek/Documents/wave/waveterm/wavesrv/pkg/sstore/dbops.go`
- Added `UpdateClientAIOpts` function to update the `aiopts` field in the database

### `/Users/abhishek/Documents/wave/waveterm/wavesrv/pkg/cmdrunner/cmdrunner.go`
- Added handling for `defaultprovider`, `geminiapitoken`, `azurebaseurl`, `azuredeploymentname`, and `azureapitoken` options
- Added validation for API tokens using the existing `validateOpenAIAPIToken` function
- Implemented deep copying of AI options to preserve existing data when updating
- Updated the error message to include the new supported options

## Testing Steps
1. Open the AI providers settings
2. Select a provider (Gemini, OpenAI, or Azure)
3. Enter an API key and click the checkmark
4. The key should be saved and displayed as masked (••••••••[last 4 chars])
5. Refresh the page - the settings should persist
6. Switch between providers - each should maintain its own settings